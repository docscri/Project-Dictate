from fastapi import APIRouter, HTTPException

from modules.note_formatter.service import (
    load_note_format,
)


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
        raise HTTPException(
            status_code=404,
            detail="Note format not found",
        )