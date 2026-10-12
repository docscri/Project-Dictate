from typing import Literal, cast, overload

from shared.ai_gateway.models.llm.interface import NoteGenerationInput, NoteGenerationResult
from shared.ai_gateway.models.ner.interface import TermExtractionInput, TermExtractionResult
from shared.ai_gateway.models.transcription.interface import TranscriptionStream
from shared.config import config


def _provider(kind: str) -> str:
    provider = config.get("ai", {}).get(kind)
    if not isinstance(provider, str) or not provider.strip():
        raise ValueError(f"AI provider is not configured: ai.{kind}")
    return provider.strip()


@overload
def call(
    task: Literal["tag_terms"],
    data: TermExtractionInput,
) -> TermExtractionResult:
    ...


@overload
def call(
    task: Literal["write_note"],
    data: NoteGenerationInput,
) -> NoteGenerationResult:
    ...


def call(
    task: str,
    data: TermExtractionInput | NoteGenerationInput,
) -> TermExtractionResult | NoteGenerationResult:
    if task == "tag_terms":
        provider = _provider("ner")
        if provider == "aws_comprehend_medical":
            from shared.ai_gateway.models.ner.aws_comprehend_medical import run as extract_terms

            return extract_terms(cast(TermExtractionInput, data))
    elif task == "write_note":
        provider = _provider("llm")
        if provider == "gemini_2_5_flash":
            from shared.ai_gateway.models.llm.gemini import run as generate_note

            return generate_note(cast(NoteGenerationInput, data))
    elif task == "transcribe":
        raise ValueError("Live transcription requires open_transcription_stream()")
    else:
        raise ValueError(f"Unknown AI task: {task}")

    raise ValueError(f"Unsupported AI provider for {task}: {provider}")


def open_transcription_stream() -> TranscriptionStream:
    provider = _provider("transcription")
    if provider == "deepgram":
        from shared.ai_gateway.models.transcription.deepgram import DeepgramTranscriptionStream

        return DeepgramTranscriptionStream()
    raise ValueError(f"Unsupported transcription provider: {provider}")
