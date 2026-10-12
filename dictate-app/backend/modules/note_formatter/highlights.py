"""Map extracted clinical terms onto SOAP text without another provider call."""

import re
from collections.abc import Mapping
from typing import Any, TypedDict


SECTIONS = ("subjective", "objective", "assessment", "plan")


class NoteHighlight(TypedDict):
    section: str
    text: str
    start: int
    end: int
    category: str


def with_clinical_highlights(note: Mapping[str, Any], terms: list) -> dict:
    # Ignore client-supplied or stale highlights; derive spans from current text.
    result = {key: value for key, value in note.items() if key != "highlights"}
    highlights: list[NoteHighlight] = []
    seen = set()
    for section in SECTIONS:
        text = note.get(section)
        if not isinstance(text, str):
            continue
        for term in terms:
            if not isinstance(term, dict):
                continue
            phrase, category = term.get("text"), term.get("type")
            if not isinstance(phrase, str) or not phrase.strip() or not isinstance(category, str) or not category:
                continue
            # Match complete phrases, allowing case and whitespace changes.
            pattern = r"(?<!\w)" + r"\s+".join(re.escape(word) for word in phrase.split()) + r"(?!\w)"
            for match in re.finditer(pattern, text, re.IGNORECASE):
                key = (section, match.start(), match.end(), category)
                if key in seen:
                    continue
                seen.add(key)
                highlights.append({"section": section, "text": match.group(), "start": match.start(), "end": match.end(), "category": category})
    highlights.sort(key=lambda span: (SECTIONS.index(span["section"]), span["start"], -span["end"], span["category"]))
    return {**result, "highlights": highlights}
