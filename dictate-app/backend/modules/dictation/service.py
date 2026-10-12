# modules/dictation/service.py

import asyncio
from contextlib import suppress
from dataclasses import dataclass, field

from anyio import CancelScope
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from modules.consultations.service import get_consultation, change_consultation
from shared.errors import api_error
from modules.note_formatter.highlights import with_clinical_highlights
from modules.note_formatter.service import (
    load_note_format,
    load_note_instructions,
)
from shared.ai_gateway import call as ai
from shared.ai_gateway.models.transcription.interface import TranscriptionStream
from shared.config import config
from shared.db import call as db
from shared.logger import get_logger


logger = get_logger(__name__)


@dataclass
class _ActiveDictation:
    stream: TranscriptionStream
    websocket: WebSocket
    loop: asyncio.AbstractEventLoop
    closing: bool = False
    ready: asyncio.Event = field(default_factory=asyncio.Event)
    close_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    closed: bool = False


_active_streams: dict[str, _ActiveDictation] = {}
_deleting: set[str] = set()


async def _close_session(session):
    async with session.close_lock:
        if not session.closed:
            await session.stream.close()
            session.closed = True


async def _cleanup_session(session, consultation_id, user_id):
    # Client disconnect cancellation must not interrupt the provider's last results.
    with CancelScope(shield=True):
        session.ready.set()
        try:
            await _close_session(session)
        except Exception:
            logger.exception("Dictation cleanup failed for consultation %s", consultation_id)
        finally:
            if _active_streams.get(consultation_id) is session:
                try:
                    if not session.closing:
                        await asyncio.to_thread(db.mutate_consultation, consultation_id, user_id, ["dictating"], {"status": "paused"})
                finally:
                    if _active_streams.get(consultation_id) is session:
                        _active_streams.pop(consultation_id, None)


async def _finalize_stream(session: _ActiveDictation):
    session.closing = True
    try:
        await asyncio.wait_for(session.ready.wait(), timeout=35)
        await _close_session(session)
    finally:
        if session.websocket.application_state == WebSocketState.CONNECTED:
            with suppress(WebSocketDisconnect, RuntimeError, OSError):
                await session.websocket.close()


def close_active_stream(consultation_id: str):
    session = _active_streams.get(consultation_id)
    if session is None:
        return
    session.closing = True
    future = asyncio.run_coroutine_threadsafe(_finalize_stream(session), session.loop)
    try:
        future.result(timeout=60)
    except Exception:
        future.cancel()
        raise api_error(409, "connection_error", "Could not finish the audio connection. Please retry.")
    if _active_streams.get(consultation_id) is session:
        _active_streams.pop(consultation_id, None)


def pause_dictation(user_id: str, consultation_id: str):
    change_consultation(user_id, consultation_id, ["dictating"], {"status": "paused"})
    close_active_stream(consultation_id)
    return get_consultation(user_id, consultation_id)


def delete_consultation(user_id: str, consultation_id: str):
    if consultation_id in _deleting:
        raise api_error(409, "invalid_state", "Deletion is already in progress.")
    _deleting.add(consultation_id)
    try:
        _delete_consultation(user_id, consultation_id)
    finally:
        _deleting.discard(consultation_id)


def _delete_consultation(user_id: str, consultation_id: str):
    row = get_consultation(user_id, consultation_id)
    if row is None:
        raise api_error(404, "not_found", "Consultation not found.")
    if row["status"] in ("processing", "signed"):
        raise api_error(409, "locked", "This consultation cannot be deleted.")
    if row["status"] == "dictating":
        pause_dictation(user_id, consultation_id)
    else:
        close_active_stream(consultation_id)
    change_consultation(user_id, consultation_id, ["ready", "dictating", "paused", "saved", "failed"], None)


async def handle_dictation_stream(
    websocket: WebSocket,
    user_id: str,
    consultation_id: str,
):
    session = None
    try:
        consultation = await asyncio.to_thread(get_consultation, user_id, consultation_id)
        code = None
        if consultation is None:
            code = "not_found"
        elif consultation_id in _deleting:
            code = "locked"
        elif consultation_id in _active_streams:
            code = "stream_busy"
        elif consultation.get("status") in ("processing", "signed"):
            code = "locked"
        elif consultation.get("status") not in ("ready", "paused", "dictating"):
            code = "invalid_state"
        if code:
            await websocket.send_json({"type": "error", "code": code, "message": "Dictation cannot start."})
            await websocket.close(code=1008)
            return

        stream = ai.open_transcription_stream()
        session = _ActiveDictation(stream, websocket, asyncio.get_running_loop())
        _active_streams[consultation_id] = session

        await asyncio.to_thread(change_consultation, user_id, consultation_id, ["ready", "paused", "dictating"], {"status": "dictating"})

        transcript_lock = asyncio.Lock()

        async def on_transcript(event: dict):
            text = (event.get("text") or "").strip()
            if not text:
                return
            final = bool(event.get("final"))
            if final:
                async with transcript_lock:
                    await asyncio.to_thread(save_transcript_segment, consultation_id, text)
            if websocket.client_state == WebSocketState.CONNECTED and websocket.application_state == WebSocketState.CONNECTED:
                with suppress(WebSocketDisconnect, RuntimeError, OSError):
                    await websocket.send_json({"type": "transcript", "text": text, "final": final})

        await stream.connect(on_transcript)
        if session.closing:
            return
        logger.info("Dictation started for consultation %s", consultation_id)
        await websocket.send_json({"type": "status", "status": "dictating"})
        session.ready.set()
        while not session.closing:
            audio_bytes = await websocket.receive_bytes()
            if not session.closing:
                await stream.send_audio(audio_bytes)
    except WebSocketDisconnect:
        logger.info("Dictation client disconnected for consultation %s", consultation_id)
    except Exception:
        logger.exception("Dictation stream failed for consultation %s", consultation_id)
        if websocket.application_state == WebSocketState.CONNECTED:
            with suppress(WebSocketDisconnect, RuntimeError, OSError):
                await websocket.send_json({"type": "error", "code": "connection_error", "message": "Audio connection lost. Please reconnect."})
    finally:
        if session is not None:
            await _cleanup_session(session, consultation_id, user_id)
        if websocket.application_state == WebSocketState.CONNECTED:
            with suppress(WebSocketDisconnect, RuntimeError, OSError):
                await websocket.close()


def save_transcript_segment(
    consultation_id: str,
    text: str,
):
    consultations = db.select(
        "consultations",
        "id",
        consultation_id,
    )

    if not consultations:
        return None

    consultation = consultations[0]

    if consultation.get("status") not in ("dictating", "paused", "processing"):
        return None

    existing_transcript = (
        consultation.get("transcript") or ""
    )

    updated_transcript = (
        f"{existing_transcript} {text}".strip()
    )

    result = db.mutate_consultation(consultation_id, consultation["doctor_id"], ["dictating", "paused", "processing"], {"transcript": updated_transcript})

    logger.debug(
        f"Transcript updated for consultation {consultation_id}"
    )

    return result[0] if result else None


def finish_dictation(
    user_id: str,
    consultation_id: str,
):
    consultations = db.select(
        "consultations",
        "id",
        consultation_id,
    )

    if not consultations:
        return None

    consultation = consultations[0]

    if consultation["doctor_id"] != user_id:
        return None

    result = change_consultation(
        user_id, consultation_id, ["dictating", "paused", "failed"],
        {
            "status": "processing",
            "processing_stage": "finalizing_transcript",
            "processing_error": None,
        },
    )

    logger.info(
        f"Dictation finished for consultation {consultation_id}"
    )

    session = _active_streams.get(consultation_id)
    if session is not None:
        session.closing = True
    return result


def update_processing_stage(
    consultation_id: str,
    stage: str,
):
    write_processing(
        consultation_id,
        {
            "processing_stage": stage,
        },
    )

    logger.info(
        f"Consultation {consultation_id} stage changed to {stage}"
    )


def process_finished_dictation(
    user_id: str,
    consultation_id: str,
):
    owned = False
    try:
        consultations = db.select(
            "consultations",
            "id",
            consultation_id,
        )

        if not consultations:
            return None

        consultation = consultations[0]

        if consultation["doctor_id"] != user_id:
            return None

        if consultation.get("status") != "processing":
            return None
        owned = True
        session = _active_streams.get(consultation_id)
        if session is not None:
            close_active_stream(consultation_id)
        consultation = get_consultation(user_id, consultation_id)
        if consultation is None:
            raise ValueError("Consultation disappeared during finalization")
        if consultation.get("status") != "processing":
            return None

        transcript = consultation.get("transcript") or ""

        if not transcript.strip():
            raise ValueError("Transcript is empty")

        extraction_enabled = config.get("ai", {}).get("ner_enabled", True)
        if not isinstance(extraction_enabled, bool):
            raise ValueError("ai.ner_enabled must be true or false")
        terms = []
        if extraction_enabled:
            update_processing_stage(consultation_id, "extracting_terms")
            terms = ai.call("tag_terms", {"text": transcript})["terms"]

        update_processing_stage(
            consultation_id,
            "structuring_note",
        )

        note_format = load_note_format("default")
        instructions = load_note_instructions("default")

        update_processing_stage(
            consultation_id,
            "writing_note",
        )

        note_result = ai.call(
            "write_note",
            {
                "transcript": transcript,
                "terms": terms,
                "format": note_format,
                "instructions": instructions,
            },
        )

        note = with_clinical_highlights(note_result["sections"], terms)

        update_processing_stage(
            consultation_id,
            "saving_note",
        )

        return complete_processing(
            consultation_id,
            terms,
            note,
        )

    except Exception:
        logger.exception("Processing failed for consultation %s", consultation_id)
        if owned:
            try:
                write_processing(
                    consultation_id,
                    {"status": "failed", "processing_stage": "failed", "processing_error": "note_failed"},
                )
            except Exception:
                logger.exception("Could not save processing failure for consultation %s", consultation_id)
        return None


def complete_processing(
    consultation_id: str,
    terms: list,
    note: dict,
):
    result = write_processing(
        consultation_id,
        {
            "terms": terms,
            "note": note,
            "status": "saved",
            "processing_stage": "completed",
            "processing_error": None,
        },
    )

    logger.info(
        f"Processing completed for consultation {consultation_id}"
    )

    return result[0] if result else None


def write_processing(consultation_id: str, data: dict):
    rows = db.select("consultations", "id", consultation_id)
    if not rows:
        return []
    return db.mutate_consultation(consultation_id, rows[0]["doctor_id"], ["processing"], data)
