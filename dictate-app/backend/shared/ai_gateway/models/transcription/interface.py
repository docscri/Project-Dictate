from typing import Awaitable, Callable, Protocol


TranscriptCallback = Callable[
    [dict],
    Awaitable[None],
]


class TranscriptionStream(Protocol):
    async def connect(
        self,
        on_transcript: TranscriptCallback,
    ) -> None:
        ...

    async def send_audio(
        self,
        audio: bytes,
    ) -> None:
        ...

    async def close(
        self,
    ) -> None:
        ...