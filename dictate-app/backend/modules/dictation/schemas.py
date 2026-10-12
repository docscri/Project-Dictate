from pydantic import BaseModel
from shared.validation import NonBlankText


class TranscriptEvent(BaseModel):
    type: str = "transcript"
    text: str
    final: bool


class DictationStatusEvent(BaseModel):
    type: str = "status"
    status: str


class DictationFinishRequest(BaseModel):
    consultation_id: NonBlankText
