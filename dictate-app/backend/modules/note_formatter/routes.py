from fastapi import APIRouter

from modules.note_formatter.service import (
    load_note_format,
)
from shared.errors import api_error


router = APIRouter(
    prefix="/api/note-formats",
    tags=["Note Formats"],
)


@router.get("")
def list_note_formats():
    return {
        "formats": [
            "default",
        ]
    }


@router.get("/{name}")
def get_note_format(name: str):
    try:
        return load_note_format(name)

    except FileNotFoundError:
        raise api_error(404, "not_found", "Note format not found.")
