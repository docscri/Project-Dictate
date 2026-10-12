from typing import Protocol, TypedDict

from shared.ai_gateway.models.ner.interface import Term


class SoapSections(TypedDict):
    subjective: str
    objective: str
    assessment: str
    plan: str


class NoteFormat(TypedDict):
    sections: list[str]


class NoteGenerationInput(TypedDict):
    transcript: str
    terms: list[Term]
    format: NoteFormat
    instructions: str


class NoteGenerationResult(TypedDict):
    sections: SoapSections


class LlmProvider(Protocol):
    def run(
        self,
        data: NoteGenerationInput,
    ) -> NoteGenerationResult:
        ...
