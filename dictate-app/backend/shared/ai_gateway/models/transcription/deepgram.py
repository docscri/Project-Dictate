import asyncio
import os
from contextlib import suppress

from deepgram import AsyncDeepgramClient
from deepgram.core.events import EventType
from deepgram.listen.v1.types import ListenV1Results

from shared.ai_gateway.models.transcription.interface import TranscriptCallback
from shared.config import config
from shared.logger import get_logger


logger = get_logger(__name__)


class DeepgramTranscriptionStream:
    def __init__(self):
        api_key = os.getenv("DEEPGRAM_API_KEY", "").strip()
        if not api_key:
            raise ValueError("Missing environment variable: DEEPGRAM_API_KEY")
        self.client = AsyncDeepgramClient(api_key=api_key)
        self.connection = None
        self.connection_context = None
        self.listen_task = None
        self.keep_alive_task = None
        self._close_lock = asyncio.Lock()
        self._send_lock = asyncio.Lock()
        self._closing = False
        self._error = None

    async def connect(self, on_transcript: TranscriptCallback) -> None:
        if self.connection is not None or self._closing:
            raise ValueError("Transcription stream cannot be connected twice")
        settings = config.get("ai", {})
        model = settings.get("transcription_model")
        language = settings.get("transcription_language")
        if not isinstance(model, str) or not model.strip():
            raise ValueError("Deepgram model is not configured: ai.transcription_model")
        if not isinstance(language, str) or not language.strip():
            raise ValueError("Deepgram language is not configured: ai.transcription_language")
        options = {"model": model, "language": language, "interim_results": True, "smart_format": True}
        for setting, option in (("transcription_encoding", "encoding"), ("transcription_sample_rate", "sample_rate"), ("transcription_channels", "channels")):
            if settings.get(setting) is not None:
                options[option] = settings[setting]
        for attempt in range(3):
            try:
                context = self.client.listen.v1.connect(**options)
                self.connection = await asyncio.wait_for(context.__aenter__(), timeout=10)
                self.connection_context = context
                break
            except Exception as exc:
                status = getattr(exc, "status_code", None) or getattr(getattr(exc, "response", None), "status_code", None)
                transient = isinstance(exc, (OSError, TimeoutError)) or status in (408, 429, 500, 502, 503, 504)
                if not transient or attempt == 2:
                    logger.exception("Deepgram connection failed")
                    raise RuntimeError("Transcription connection failed") from exc
                logger.warning("Retrying transient Deepgram connection failure (attempt %s/3)", attempt + 2)
                await asyncio.sleep(0.5 * 2 ** attempt)

        async def on_message(message):
            logger.info(
                "Deepgram received: class=%s, type=%s",
                type(message).__name__,
                getattr(message, "type", None),
            )
            if not isinstance(message, ListenV1Results):
                return
            alternatives = message.channel.alternatives if message.channel else []
            if not alternatives:
                return
            text = (alternatives[0].transcript or "").strip()
            logger.info(
    "Deepgram result: characters=%s, final=%s",
    len(text),
    message.is_final,
)
            if text:
                await on_transcript({"text": text, "final": bool(message.is_final), "speech_final": bool(message.speech_final)})

        def on_error(error):
            self._error = error if isinstance(error, Exception) else RuntimeError(str(error))
            logger.error("Deepgram stream failed: %s", error)

        connection = self.connection
        if connection is None:
            raise RuntimeError("Transcription stream is not connected")
        connection.on(EventType.MESSAGE, on_message)
        connection.on(EventType.ERROR, on_error)
        self.listen_task = asyncio.create_task(connection.start_listening())
        self.keep_alive_task = asyncio.create_task(self._keep_alive())
        logger.info("Deepgram stream connected")

    async def _keep_alive(self):
        try:
            while not self._closing:
                await asyncio.sleep(3)
                async with self._send_lock:
                    if not self._closing and self.connection is not None:
                        await self.connection.send_keep_alive()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self._error = exc
            logger.exception("Deepgram keep-alive failed")

    async def send_audio(self, audio: bytes) -> None:
        async with self._send_lock:
            if self.connection is None or self._closing:
                raise RuntimeError("Transcription stream is not connected")
            if self._error is not None or self.listen_task is None or self.listen_task.done():
                raise RuntimeError("Transcription connection was lost") from self._error
            if audio:
                await self.connection.send_media(audio)

    async def close(self) -> None:
        async with self._close_lock:
            if self.connection_context is None:
                if self._error is not None:
                    raise RuntimeError("Transcription stream failed") from self._error
                return
            self._closing = True
            if self.keep_alive_task is not None:
                self.keep_alive_task.cancel()
                with suppress(asyncio.CancelledError):
                    await self.keep_alive_task
            try:
                if self.connection is not None and self.listen_task is not None and not self.listen_task.done():
                    async with self._send_lock:
                        await self.connection.send_close_stream()
                    timeout = config.get("ai", {}).get("transcription_close_timeout", 10)
                    await asyncio.wait_for(asyncio.shield(self.listen_task), timeout=timeout)
                if self._error is not None:
                    raise RuntimeError("Transcription stream failed") from self._error
            except Exception as exc:
                self._error = exc
                logger.exception("Deepgram finalization failed")
                raise RuntimeError("Transcription finalization failed") from exc
            finally:
                if self.listen_task is not None:
                    if not self.listen_task.done():
                        self.listen_task.cancel()
                    with suppress(asyncio.CancelledError, Exception):
                        await self.listen_task
                try:
                    await self.connection_context.__aexit__(None, None, None)
                finally:
                    self.connection = None
                    self.connection_context = None
                    self.listen_task = None
                    self.keep_alive_task = None
                    logger.info("Deepgram stream closed")
