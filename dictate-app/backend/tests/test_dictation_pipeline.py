import asyncio
import copy
import json
import os
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import httpx
from deepgram.core.events import EventType
from deepgram.listen.v1.types import ListenV1Results
from fastapi.testclient import TestClient
from google.genai import errors
from starlette.websockets import WebSocketDisconnect

from main import app
from modules.dictation import service
from modules.note_formatter.service import load_note_format, load_note_instructions
from modules.note_formatter.highlights import with_clinical_highlights
from shared.ai_gateway import call as gateway
from shared.ai_gateway.models.llm import gemini
from shared.ai_gateway.models.ner import aws_comprehend_medical as aws
from shared.ai_gateway.models.transcription import deepgram
from shared.config import config


SOAP = {"sections": {"subjective": "Chest pain reported.", "objective": "", "assessment": "", "plan": ""}}
TERMS = [{"text": "chest pain", "type": "medical_condition", "start": 16, "end": 26}]


class GatewayTests(unittest.TestCase):
    def test_provider_dispatch(self):
        with patch.object(aws, "run", return_value={"terms": TERMS}) as ner:
            self.assertEqual(gateway.call("tag_terms", {"text": "chest pain"}), {"terms": TERMS})
            ner.assert_called_once_with({"text": "chest pain"})
        with patch.object(gemini, "run", return_value=SOAP) as llm:
            self.assertEqual(gateway.call("write_note", {
                "transcript": "chest pain",
                "terms": TERMS,
                "format": load_note_format(),
                "instructions": load_note_instructions(),
            }), SOAP)
            llm.assert_called_once()
        with patch.object(deepgram, "DeepgramTranscriptionStream") as stream:
            self.assertIs(gateway.open_transcription_stream(), stream.return_value)

    def test_unknown_task(self):
        with self.assertRaisesRegex(ValueError, "Unknown AI task"):
            gateway.call("unknown", {})

    def test_live_transcription_has_separate_gateway(self):
        with self.assertRaisesRegex(ValueError, "open_transcription_stream"):
            gateway.call("transcribe", {})

    def test_empty_and_unknown_providers(self):
        for task, kind in [("tag_terms", "ner"), ("write_note", "llm")]:
            for value in ["", " ", None, "unsupported"]:
                with self.subTest(task=task, provider=value), patch.dict(config["ai"], {kind: value}):
                    with self.assertRaises(ValueError):
                        gateway.call(task, {})
        for value in ["", "unsupported"]:
            with patch.dict(config["ai"], {"transcription": value}), self.assertRaises(ValueError):
                gateway.open_transcription_stream()


class AwsTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"AWS_REGION": "us-east-1", "AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_normalization_skips_invalid_entities(self):
        entities = [
            {"Text": "chest pain", "Category": "MEDICAL_CONDITION", "BeginOffset": 16, "EndOffset": 26},
            None,
            {"Text": "", "Category": "MEDICATION", "BeginOffset": 0, "EndOffset": 1},
            {"Text": "x", "Category": "", "BeginOffset": 0, "EndOffset": 1},
            {"Text": "x", "Category": "ANATOMY", "BeginOffset": -1, "EndOffset": 1},
            {"Text": "x", "Category": "ANATOMY", "BeginOffset": True, "EndOffset": 1},
            {"Text": "x", "Category": "ANATOMY", "BeginOffset": 0, "EndOffset": 99},
        ]
        self.assertEqual(aws.normalize_entities(entities, "patient reports chest pain"), TERMS)

    def test_utf8_chunks_cover_every_character(self):
        for text in ["x" * 50_000, "é症🙂 chest pain\n" * 4000, " " * 45_000]:
            chunks = list(aws.text_chunks(text))
            self.assertEqual("".join(chunk for chunk, _ in chunks), text)
            position = 0
            for chunk, offset in chunks:
                self.assertEqual(offset, position)
                self.assertLess(len(chunk.encode("utf-8")), 20_000)
                position += len(chunk)

    def test_global_offsets_and_bounded_sdk_retries(self):
        text = "é " * 12_000 + "chest pain"
        client = Mock()

        def detect(Text):
            start = Text.find("chest pain")
            return {"Entities": [] if start < 0 else [{"Text": "chest pain", "Category": "MEDICAL_CONDITION", "BeginOffset": start, "EndOffset": start + 10}]}

        client.detect_entities_v2.side_effect = detect
        with patch.object(aws.boto3, "client", return_value=client) as factory:
            result = aws.run({"text": text})
        start = text.index("chest pain")
        self.assertEqual(result, {"terms": [{"text": "chest pain", "type": "medical_condition", "start": start, "end": start + 10}]})
        self.assertGreater(client.detect_entities_v2.call_count, 1)
        self.assertEqual(factory.call_args.kwargs["config"].retries["total_max_attempts"], 3)
        client.close.assert_called_once()

    def test_invalid_input_and_missing_config_do_not_call_aws(self):
        with patch.object(aws.boto3, "client") as factory:
            with self.assertRaises(ValueError):
                aws.run({"text": " "})
            with patch.dict(os.environ, {"AWS_REGION": ""}), self.assertRaisesRegex(ValueError, "AWS_REGION"):
                aws.run({"text": "chest pain"})
            factory.assert_not_called()

    def test_provider_failure_is_clean_and_client_closes(self):
        client = Mock()
        client.detect_entities_v2.side_effect = RuntimeError("private AWS details")
        with patch.object(aws.boto3, "client", return_value=client), self.assertRaisesRegex(RuntimeError, "^Clinical term extraction failed$"):
            aws.run({"text": "chest pain"})
        client.close.assert_called_once()

    def test_truncated_response_is_not_silently_accepted(self):
        client = Mock()
        client.detect_entities_v2.return_value = {"Entities": [], "PaginationToken": "truncated"}
        with patch.object(aws.boto3, "client", return_value=client), self.assertRaises(RuntimeError):
            aws.run({"text": "chest pain"})


class GeminiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"GEMINI_API_KEY": "test"})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.data = {"transcript": "Patient reports chest pain.", "terms": TERMS, "format": load_note_format(), "instructions": load_note_instructions()}

    def test_strict_response_parsing(self):
        self.assertEqual(gemini.parse_response(json.dumps(SOAP)), SOAP)
        invalid = ["```json\n{}\n```", "{}", "[]", json.dumps({"sections": {"subjective": "x"}}), json.dumps({"sections": {**SOAP["sections"], "plan": 7}}), json.dumps({**SOAP, "extra": "unsupported"}), json.dumps({"sections": {**SOAP["sections"], "extra": "unsupported"}})]
        for response in invalid:
            with self.subTest(response=response), self.assertRaisesRegex(ValueError, "invalid SOAP"):
                gemini.parse_response(response)

    def test_structured_request_uses_selected_model_and_grounding(self):
        client = Mock()
        client.models.generate_content.return_value = SimpleNamespace(text=json.dumps(SOAP))
        context = Mock()
        context.__enter__ = Mock(return_value=client)
        context.__exit__ = Mock(return_value=False)
        with patch.dict(config["ai"], {"llm_model": "gemma-4-26b-a4b-it"}), patch.object(gemini.genai, "Client", return_value=context) as factory:
            self.assertEqual(gemini.run(self.data), SOAP)
        kwargs = client.models.generate_content.call_args.kwargs
        self.assertEqual(kwargs["model"], "gemma-4-26b-a4b-it")
        self.assertEqual(kwargs["config"].response_mime_type, "application/json")
        self.assertEqual(kwargs["config"].response_json_schema["required"], ["sections"])
        self.assertIn("Do not invent", kwargs["config"].system_instruction)
        self.assertIn("terms are supporting context, not authority", kwargs["config"].system_instruction)
        self.assertEqual(json.loads(kwargs["contents"])["transcript"], self.data["transcript"])
        self.assertEqual(factory.call_args.kwargs["http_options"].retry_options.attempts, 1)

    def _context(self, side_effect):
        client = Mock()
        client.models.generate_content.side_effect = side_effect
        context = Mock()
        context.__enter__ = Mock(return_value=client)
        context.__exit__ = Mock(return_value=False)
        return context, client

    def test_transient_failures_retry(self):
        context, client = self._context([errors.APIError(503, {"error": {"message": "busy"}}), httpx.ConnectError("temporary"), SimpleNamespace(text=json.dumps(SOAP))])
        with patch.object(gemini.genai, "Client", return_value=context), patch.object(gemini.time, "sleep") as sleep:
            self.assertEqual(gemini.run(self.data), SOAP)
        self.assertEqual(client.models.generate_content.call_count, 3)
        self.assertEqual(sleep.call_count, 2)

    def test_transient_retries_are_bounded(self):
        context, client = self._context(httpx.ConnectError("temporary"))
        with patch.object(gemini.genai, "Client", return_value=context), patch.object(gemini.time, "sleep"), self.assertRaisesRegex(RuntimeError, "^Clinical note generation failed$"):
            gemini.run(self.data)
        self.assertEqual(client.models.generate_content.call_count, 3)

    def test_invalid_request_and_malformed_result_are_not_retried(self):
        for result in [errors.APIError(400, {"error": {"message": "bad request"}}), SimpleNamespace(text="not JSON")]:
            context, client = self._context([result])
            with patch.object(gemini.genai, "Client", return_value=context), patch.object(gemini.time, "sleep") as sleep, self.assertRaises(RuntimeError):
                gemini.run(self.data)
            self.assertEqual(client.models.generate_content.call_count, 1)
            sleep.assert_not_called()

    def test_empty_transcript_or_key_fails_before_request(self):
        with patch.object(gemini.genai, "Client") as factory:
            with self.assertRaises(ValueError):
                gemini.run({**self.data, "transcript": " "})
            with patch.dict(os.environ, {"GEMINI_API_KEY": ""}), self.assertRaisesRegex(ValueError, "GEMINI_API_KEY"):
                gemini.run(self.data)
            factory.assert_not_called()


class FakeConnection:
    def __init__(self):
        self.callbacks = {}
        self.messages = asyncio.Queue()
        self.media = []
        self.close_calls = 0
        self.keep_alive_calls = 0

    def on(self, event, callback):
        self.callbacks[event] = callback

    async def start_listening(self):
        while True:
            message = await self.messages.get()
            if message is None:
                return
            await self.callbacks[EventType.MESSAGE](message)

    async def send_media(self, audio):
        self.media.append(audio)

    async def send_keep_alive(self):
        self.keep_alive_calls += 1

    async def send_close_stream(self):
        self.close_calls += 1
        await self.messages.put(result_message("last finalized segment", True, True))
        await self.messages.put(None)


def result_message(text, final, speech_final=False):
    return ListenV1Results.model_construct(channel={"alternatives": [{"transcript": text, "confidence": 0.99, "words": []}]}, is_final=final, speech_final=speech_final)


class DeepgramTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.stack = ExitStack()
        self.stack.enter_context(patch.dict(os.environ, {"DEEPGRAM_API_KEY": "test"}))
        self.connection = FakeConnection()
        self.context = SimpleNamespace(__aenter__=AsyncMock(return_value=self.connection), __aexit__=AsyncMock(return_value=False))
        self.connect_mock = Mock(return_value=self.context)
        client = SimpleNamespace(listen=SimpleNamespace(v1=SimpleNamespace(connect=self.connect_mock)))
        self.stack.enter_context(patch.object(deepgram, "AsyncDeepgramClient", return_value=client))
        self.stream = deepgram.DeepgramTranscriptionStream()

    async def asyncTearDown(self):
        had_error = self.stream._error is not None
        try:
            await self.stream.close()
        except RuntimeError:
            if not had_error:
                raise
        finally:
            self.stack.close()

    async def test_stream_events_audio_and_graceful_finalization(self):
        events = []

        async def callback(event):
            events.append(event)

        await self.stream.connect(callback)
        await self.connection.callbacks[EventType.MESSAGE](result_message("interim", False))
        await self.connection.callbacks[EventType.MESSAGE](result_message("final", True, True))
        await self.connection.callbacks[EventType.MESSAGE](result_message(" ", True))
        await self.stream.send_audio(b"test audio")
        await self.stream.close()
        await self.stream.close()
        self.assertEqual(events, [{"text": "interim", "final": False, "speech_final": False}, {"text": "final", "final": True, "speech_final": True}, {"text": "last finalized segment", "final": True, "speech_final": True}])
        self.assertEqual(self.connection.media, [b"test audio"])
        self.assertEqual(self.connection.close_calls, 1)
        self.context.__aexit__.assert_awaited_once()
        self.assertIsNone(self.stream.listen_task)
        self.assertIsNone(self.stream.keep_alive_task)
        options = self.connect_mock.call_args.kwargs
        self.assertEqual(options["model"], "nova-3")
        self.assertTrue(options["interim_results"])
        self.assertTrue(options["smart_format"])
        self.assertEqual(options["encoding"], "linear16")
        self.assertEqual(options["sample_rate"], 16000)
        self.assertEqual(options["channels"], 1)

    async def test_optional_audio_options_are_config_driven(self):
        with patch.dict(config["ai"], {"transcription_encoding": "linear16", "transcription_sample_rate": 8_000, "transcription_channels": 2}):
            await self.stream.connect(AsyncMock())
        self.assertEqual(self.connect_mock.call_args.kwargs["encoding"], "linear16")
        self.assertEqual(self.connect_mock.call_args.kwargs["sample_rate"], 8_000)
        self.assertEqual(self.connect_mock.call_args.kwargs["channels"], 2)

    async def test_close_timeout_releases_tasks_and_context(self):
        self.connection.send_close_stream = AsyncMock()
        await self.stream.connect(AsyncMock())
        with patch.dict(config["ai"], {"transcription_close_timeout": 0.01}), self.assertRaisesRegex(RuntimeError, "finalization failed"):
            await self.stream.close()
        self.context.__aexit__.assert_awaited_once()
        self.assertIsNone(self.stream.connection)

    async def test_sdk_error_is_detected_on_send_and_close(self):
        await self.stream.connect(AsyncMock())
        self.connection.callbacks[EventType.ERROR](RuntimeError("provider connection error"))
        with self.assertRaisesRegex(RuntimeError, "connection was lost"):
            await self.stream.send_audio(b"audio")
        with self.assertRaises(RuntimeError):
            await self.stream.close()
        self.context.__aexit__.assert_awaited_once()

    async def test_transient_connect_failure_retries(self):
        failed = SimpleNamespace(__aenter__=AsyncMock(side_effect=OSError("temporary")))
        self.connect_mock.side_effect = [failed, self.context]
        with patch.object(deepgram.asyncio, "sleep", new=AsyncMock()) as sleep:
            await self.stream.connect(AsyncMock())
        self.assertEqual(self.connect_mock.call_count, 2)
        sleep.assert_awaited_once()

    async def test_invalid_connect_error_is_not_retried(self):
        self.context.__aenter__.side_effect = ValueError("invalid audio settings")
        with self.assertRaisesRegex(RuntimeError, "connection failed"):
            await self.stream.connect(AsyncMock())
        self.assertEqual(self.connect_mock.call_count, 1)

    async def test_missing_api_key_fails_without_connection(self):
        with patch.dict(os.environ, {"DEEPGRAM_API_KEY": ""}), self.assertRaisesRegex(ValueError, "DEEPGRAM_API_KEY"):
            deepgram.DeepgramTranscriptionStream()


class MemoryDatabase:
    def __init__(self):
        self.rows = {"c1": {"id": "c1", "doctor_id": "d1", "patient_id": "p1", "status": "ready", "transcript": "", "processing_error": None}}
        self.updates = []

    def select(self, table, column, value):
        return [copy.deepcopy(row) for row in self.rows.values() if row.get(column) == value]

    def update(self, table, column, value, data):
        self.updates.append(copy.deepcopy(data))
        row = next(row for row in self.rows.values() if row.get(column) == value)
        row.update(copy.deepcopy(data))
        return [copy.deepcopy(row)]

    def mutate_consultation(self, consultation_id, doctor_id, statuses, data):
        row = self.rows.get(consultation_id)
        if not row or row["doctor_id"] != doctor_id or row["status"] not in statuses:
            return []
        if data is None:
            return [self.rows.pop(consultation_id)]
        return self.update("consultations", "id", consultation_id, data)


class FakeTranscriptionStream:
    def __init__(self):
        self.callback = None
        self.closed = False
        self.audio = []

    async def connect(self, callback):
        self.callback = callback

    async def send_audio(self, audio):
        self.audio.append(audio)
        await self.callback({"text": "interim words", "final": False, "speech_final": False})
        await self.callback({"text": "Patient reports chest pain.", "final": True, "speech_final": True})

    async def close(self):
        if not self.closed:
            self.closed = True
            if self.callback:
                await self.callback({"text": "No fever.", "final": True, "speech_final": True})


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.database = MemoryDatabase()
        self.stack = ExitStack()
        self.stack.enter_context(patch.dict(config["ai"], {"ner_enabled": True}))
        self.stack.enter_context(patch.object(service.db, "select", side_effect=self.database.select))
        self.stack.enter_context(patch.object(service.db, "update", side_effect=self.database.update))
        self.stack.enter_context(patch.object(service.db, "mutate_consultation", side_effect=self.database.mutate_consultation))
        self.stack.enter_context(patch.object(service.db, "patient_summaries", return_value=[{"id": "p1", "name": "Test patient", "age": 42, "sex": "male"}]))
        self.stack.enter_context(patch("shared.auth.call.get_user", return_value=SimpleNamespace(user=SimpleNamespace(id="d1", email="test@example.com"))))
        service._active_streams.clear()
        self.addCleanup(self.stack.close)
        self.addCleanup(service._active_streams.clear)
        self.headers = {"Authorization": "Bearer test-access-token"}

    def test_existing_routes_and_note_format_load(self):
        paths = app.openapi()["paths"]
        for path in ["/api/auth/signup", "/api/auth/login", "/api/auth/me", "/api/auth/logout", "/api/profile", "/api/patients", "/api/patients/{patient_id}", "/api/consultations", "/api/consultations/{consultation_id}", "/api/consultations/{consultation_id}/status", "/api/consultations/{consultation_id}/note", "/api/dictation/finish", "/api/note-formats", "/api/note-formats/{name}", "/health"]:
            self.assertIn(path, paths)
        with TestClient(app) as client:
            self.assertEqual(client.get("/health").json()["status"], "ok")
            self.assertEqual(client.get("/docs").status_code, 200)
            self.assertEqual(client.get("/api/note-formats/default").json(), {"sections": ["subjective", "objective", "assessment", "plan"]})

    def test_finish_response_and_complete_pipeline(self):
        self.database.rows["c1"]["status"] = "paused"
        self.database.rows["c1"]["transcript"] = "patient reports chest pain"
        with patch.object(service.ai, "call", side_effect=[{"terms": TERMS}, SOAP]) as ai, TestClient(app) as client:
            response = client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"consultation_id": "c1", "status": "processing", "processing_stage": "finalizing_transcript"})
        row = self.database.rows["c1"]
        self.assertEqual((row["status"], row["processing_stage"], row["processing_error"]), ("saved", "completed", None))
        self.assertEqual(row["terms"], TERMS)
        self.assertEqual(row["note"], with_clinical_highlights(SOAP["sections"], TERMS))
        self.assertEqual(row["note"]["highlights"], [{"section": "subjective", "text": "Chest pain", "start": 0, "end": 10, "category": "medical_condition"}])
        self.assertEqual([u["processing_stage"] for u in self.database.updates if "processing_stage" in u], ["finalizing_transcript", "extracting_terms", "structuring_note", "writing_note", "saving_note", "completed"])
        self.assertEqual(ai.call_args_list[1].args[1]["instructions"], load_note_instructions())

    def test_disabled_extraction_generates_edits_and_locks_note_without_aws(self):
        self.database.rows["c1"].update(status="paused", transcript="Patient reports chest pain.")
        google_client = Mock()
        google_client.models.generate_content.return_value = SimpleNamespace(text=json.dumps(SOAP))
        context = Mock()
        context.__enter__ = Mock(return_value=google_client)
        context.__exit__ = Mock(return_value=False)
        with patch.dict(config["ai"], {"ner_enabled": False}), patch.dict(os.environ, {"GEMINI_API_KEY": "test"}), patch.object(aws, "run") as ner, patch.object(gemini.genai, "Client", return_value=context), TestClient(app) as client:
            self.assertEqual(client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers).status_code, 200)
            row = self.database.rows["c1"]
            self.assertEqual(row["status"], "saved")
            self.assertEqual(row["transcript"], "Patient reports chest pain.")
            self.assertEqual(row["terms"], [])
            self.assertEqual(row["note"]["highlights"], [])
            self.assertEqual(json.loads(google_client.models.generate_content.call_args.kwargs["contents"])["terms"], [])
            self.assertNotIn("extracting_terms", [u.get("processing_stage") for u in self.database.updates])
            edited = {**SOAP["sections"], "plan": "Follow up."}
            self.assertEqual(client.put("/api/consultations/c1/note", json={"note": edited}, headers=self.headers).status_code, 200)
            self.assertEqual(client.post("/api/consultations/c1/sign", headers=self.headers).status_code, 200)
            self.assertEqual(row["status"], "signed")
            self.assertEqual(row["note"]["plan"], "Follow up.")
            self.assertEqual(client.put("/api/consultations/c1/note", json={"note": edited}, headers=self.headers).status_code, 409)
            ner.assert_not_called()

    def test_disabled_extraction_preserves_transcript_on_note_failure(self):
        self.database.rows["c1"].update(status="processing", transcript="Chest pain.")
        with patch.dict(config["ai"], {"ner_enabled": False}), patch.object(service.ai, "call", side_effect=RuntimeError("private model details")) as ai:
            service.process_finished_dictation("d1", "c1")
        ai.assert_called_once()
        self.assertEqual(ai.call_args.args[0], "write_note")
        self.assertEqual(ai.call_args.args[1]["terms"], [])
        row = self.database.rows["c1"]
        self.assertEqual((row["status"], row["processing_error"], row["transcript"]), ("failed", "note_failed", "Chest pain."))

    def test_extraction_setting_requires_a_boolean(self):
        for value in ["false", 0, None]:
            with self.subTest(value=value), patch.dict(config["ai"], {"ner_enabled": value}), patch.object(service.ai, "call") as ai:
                self.database.rows["c1"].update(status="processing", transcript="Chest pain.")
                service.process_finished_dictation("d1", "c1")
                ai.assert_not_called()
                self.assertEqual(self.database.rows["c1"]["processing_error"], "note_failed")

    def test_missing_extraction_setting_preserves_enabled_behavior(self):
        settings = {key: value for key, value in config["ai"].items() if key != "ner_enabled"}
        self.database.rows["c1"].update(status="processing", transcript="Chest pain.")
        with patch.dict(config, {"ai": settings}), patch.object(service.ai, "call", side_effect=[{"terms": TERMS}, SOAP]) as ai:
            service.process_finished_dictation("d1", "c1")
        self.assertEqual(ai.call_args_list[0].args[0], "tag_terms")
        self.assertEqual(self.database.rows["c1"]["status"], "saved")

    def test_full_websocket_finish_flushes_last_final_before_note(self):
        stream = FakeTranscriptionStream()
        with patch.object(service.ai, "open_transcription_stream", return_value=stream), patch.object(service.ai, "call", side_effect=[{"terms": TERMS}, SOAP]) as ai, TestClient(app) as client:
            with client.websocket_connect("/api/dictation/stream/c1?token=test-access-token") as websocket:
                self.assertEqual(websocket.receive_json(), {"type": "status", "status": "dictating"})
                websocket.send_bytes(b"synthetic audio")
                self.assertEqual(websocket.receive_json(), {"type": "transcript", "text": "interim words", "final": False})
                self.assertTrue(websocket.receive_json()["final"])
                response = client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers)
                self.assertEqual(response.json()["status"], "processing")
        self.assertEqual(self.database.rows["c1"]["transcript"], "Patient reports chest pain. No fever.")
        self.assertEqual(ai.call_args_list[0].args[1]["text"], "Patient reports chest pain. No fever.")
        self.assertEqual(self.database.rows["c1"]["status"], "saved")
        self.assertEqual(stream.audio, [b"synthetic audio"])
        self.assertTrue(stream.closed)
        self.assertFalse(service._active_streams)

    def test_disconnect_closes_stream_and_saves_only_final_segments(self):
        stream = FakeTranscriptionStream()
        with patch.object(service.ai, "open_transcription_stream", return_value=stream), TestClient(app) as client:
            with client.websocket_connect("/api/dictation/stream/c1?token=test-access-token") as websocket:
                websocket.receive_json()
                websocket.send_bytes(b"audio")
                websocket.receive_json()
                websocket.receive_json()
        self.assertTrue(stream.closed)
        self.assertNotIn("interim words", self.database.rows["c1"]["transcript"])
        self.assertIn("No fever.", self.database.rows["c1"]["transcript"])

    def test_finish_during_provider_connect_does_not_restore_dictating(self):
        stream = FakeTranscriptionStream()
        original_connect = stream.connect

        async def slow_connect(callback):
            await asyncio.sleep(0.05)
            await original_connect(callback)

        stream.connect = slow_connect
        self.database.rows["c1"]["transcript"] = "Patient reports chest pain."
        with patch.object(service.ai, "open_transcription_stream", return_value=stream), patch.object(service.ai, "call", side_effect=[{"terms": TERMS}, SOAP]), TestClient(app) as client:
            with client.websocket_connect("/api/dictation/stream/c1?token=test-access-token"):
                response = client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers)
                self.assertEqual(response.json()["status"], "processing")
        self.assertEqual(self.database.rows["c1"]["status"], "saved")
        self.assertTrue(stream.closed)

    def test_finalization_failure_prevents_note_generation(self):
        stream = FakeTranscriptionStream()
        stream.close = AsyncMock(side_effect=RuntimeError("private close error"))
        with patch.object(service.ai, "open_transcription_stream", return_value=stream), patch.object(service.ai, "call") as ai, TestClient(app) as client:
            with client.websocket_connect("/api/dictation/stream/c1?token=test-access-token") as websocket:
                websocket.receive_json()
                response = client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers)
                self.assertEqual(response.json()["status"], "processing")
            ai.assert_not_called()
        row = self.database.rows["c1"]
        self.assertEqual((row["status"], row["processing_error"]), ("failed", "note_failed"))

    def test_foreign_doctor_cannot_finish_or_stream(self):
        self.database.rows["c1"]["doctor_id"] = "d2"
        with patch.object(service.ai, "open_transcription_stream") as stream, patch.object(service.ai, "call") as ai, TestClient(app) as client:
            self.assertEqual(client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers).status_code, 404)
            with client.websocket_connect("/api/dictation/stream/c1?token=test-access-token") as websocket:
                self.assertEqual(websocket.receive_json()["code"], "not_found")
            service.process_finished_dictation("d1", "c1")
            stream.assert_not_called()
            ai.assert_not_called()
        self.assertFalse(self.database.updates)

    def test_no_token_is_rejected(self):
        with TestClient(app) as client:
            self.assertEqual(client.post("/api/dictation/finish", json={"consultation_id": "c1"}).status_code, 401)
            with self.assertRaises(WebSocketDisconnect) as rejected:
                with client.websocket_connect("/api/dictation/stream/c1"):
                    pass
            self.assertEqual(rejected.exception.code, 1008)

    def test_invalid_token_is_rejected(self):
        with patch("shared.auth.call.get_user", side_effect=RuntimeError("invalid token")), TestClient(app) as client:
            self.assertEqual(client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers).status_code, 401)
            with self.assertRaises(WebSocketDisconnect) as rejected:
                with client.websocket_connect("/api/dictation/stream/c1?token=invalid"):
                    pass
            self.assertEqual(rejected.exception.code, 1008)

    def test_stream_error_is_sanitized_and_closed(self):
        stream = FakeTranscriptionStream()
        stream.connect = AsyncMock(side_effect=RuntimeError("private provider details"))
        with patch.object(service.ai, "open_transcription_stream", return_value=stream), TestClient(app) as client:
            with client.websocket_connect("/api/dictation/stream/c1?token=test-access-token") as websocket:
                self.assertEqual(websocket.receive_json(), {"type": "error", "code": "connection_error", "message": "Audio connection lost. Please reconnect."})
        self.assertTrue(stream.closed)
        self.assertFalse(service._active_streams)

    def test_each_processing_failure_saves_only_note_failed(self):
        for failure in ["empty", "ner", "llm", "save"]:
            with self.subTest(failure=failure):
                self.database.rows["c1"].update(status="processing", transcript="" if failure == "empty" else "chest pain")
                ai_results = [RuntimeError("private NER details")] if failure == "ner" else [{"terms": TERMS}, RuntimeError("private LLM details") if failure == "llm" else SOAP]
                with ExitStack() as stack:
                    stack.enter_context(patch.object(service.ai, "call", side_effect=ai_results))
                    if failure == "save":
                        stack.enter_context(patch.object(service, "complete_processing", side_effect=RuntimeError("database unavailable")))
                    self.assertIsNone(service.process_finished_dictation("d1", "c1"))
                row = self.database.rows["c1"]
                self.assertEqual((row["status"], row["processing_stage"], row["processing_error"]), ("failed", "failed", "note_failed"))


if __name__ == "__main__":
    unittest.main()
