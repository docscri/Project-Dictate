from typing import Protocol, TypedDict


class Term(TypedDict):
    text: str
    type: str
    start: int
    end: int


class TermExtractionInput(TypedDict):
    text: str


class TermExtractionResult(TypedDict):
    terms: list[Term]


class NerProvider(Protocol):
    def run(
        self,
        data: TermExtractionInput,
    ) -> TermExtractionResult:
        ...
