import os

import boto3
from botocore.config import Config

from shared.ai_gateway.models.ner.interface import (
    Term,
    TermExtractionInput,
    TermExtractionResult,
)
from shared.logger import get_logger


logger = get_logger(__name__)
MAX_TEXT_BYTES = 19_999


def text_chunks(text: str):
    start = 0
    while start < len(text):
        end, size = start, 0
        while end < len(text):
            width = len(text[end].encode("utf-8"))
            if size + width > MAX_TEXT_BYTES:
                break
            size += width
            end += 1
        if end < len(text):
            boundary = max(text.rfind(" ", start, end), text.rfind("\n", start, end))
            if boundary >= start + (end - start) // 2:
                end = boundary + 1
        yield text[start:end], start
        start = end


def normalize_entities(
    entities: list,
    chunk: str,
    offset: int = 0,
) -> list[Term]:
    terms: list[Term] = []
    for entity in entities:
        if not isinstance(entity, dict):
            continue
        text, category = entity.get("Text"), entity.get("Category")
        start, end = entity.get("BeginOffset"), entity.get("EndOffset")
        if not isinstance(text, str) or not text.strip():
            continue
        if not isinstance(category, str) or not category.strip():
            continue
        if type(start) is not int or type(end) is not int or not 0 <= start < end <= len(chunk):
            continue
        terms.append({"text": text, "type": category.strip().lower(), "start": start + offset, "end": end + offset})
    return terms


def run(data: TermExtractionInput) -> TermExtractionResult:
    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("AWS term extraction requires non-empty text")
    for name in ("AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
        if not os.getenv(name, "").strip():
            raise ValueError(f"Missing environment variable: {name}")
    try:
        client = boto3.client(
            "comprehendmedical",
            region_name=os.environ["AWS_REGION"],
            config=Config(connect_timeout=10, read_timeout=30, retries={"mode": "standard", "total_max_attempts": 3}),
        )
        try:
            terms = []
            for chunk, offset in text_chunks(text):
                if not chunk.strip():
                    continue
                result = client.detect_entities_v2(Text=chunk)
                if result.get("PaginationToken"):
                    raise RuntimeError("AWS entity response was truncated")
                terms.extend(normalize_entities(result.get("Entities", []), chunk, offset))
            return {"terms": terms}
        finally:
            client.close()
    except Exception as exc:
        logger.exception("AWS clinical term extraction failed")
        raise RuntimeError("Clinical term extraction failed") from exc
