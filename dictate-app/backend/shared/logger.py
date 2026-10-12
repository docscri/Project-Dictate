import logging
import re


class TokenRedactionFilter(logging.Filter):
    """Sanitize URLs before Uvicorn or application handlers format them."""
    pattern = re.compile(r"([?&](?:token|access_token|refresh_token)=)[^&\s\"']*", re.IGNORECASE)

    def filter(self, record: logging.LogRecord) -> bool:
        def redact(value):
            return self.pattern.sub(r"\1[REDACTED]", value) if isinstance(value, str) else value
        record.msg = redact(record.msg)
        # Uvicorn's access formatter unpacks these arguments; preserve their shape.
        if isinstance(record.args, tuple):
            record.args = tuple(redact(value) for value in record.args)
        elif isinstance(record.args, dict):
            record.args = {key: redact(value) for key, value in record.args.items()}
        return True


token_filter = TokenRedactionFilter()
for logger_name in ("uvicorn.error", "uvicorn.access"):
    logging.getLogger(logger_name).addFilter(token_filter)


def get_logger(name:str) -> logging.Logger:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )

    logger = logging.getLogger(name)
    if token_filter not in logger.filters:
        logger.addFilter(token_filter)
    return logger
