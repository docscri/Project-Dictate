from pathlib import Path
import json
from typing import cast

from shared.ai_gateway.models.llm.interface import NoteFormat


BASE_DIR = Path(__file__).resolve().parent


def load_note_format(name: str = "default") -> NoteFormat:
    if name != "default":
        raise FileNotFoundError("Note format not found")
    path = BASE_DIR / "formats" / f"{name}.json"

    with open(path, "r", encoding="utf-8") as file:
        return cast(NoteFormat, json.load(file))


def load_note_instructions(name: str = "default") -> str:
    if name != "default":
        raise FileNotFoundError("Note instructions not found")
    path = BASE_DIR / "instructions" / f"{name}.txt"

    with open(path, "r", encoding="utf-8") as file:
        return file.read()
