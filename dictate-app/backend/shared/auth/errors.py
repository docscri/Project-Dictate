"""Distinguish unavailable authentication services from rejected credentials."""
import httpx
from supabase_auth.errors import AuthRetryableError


def service_unavailable(error: Exception) -> bool:
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, (httpx.TransportError, TimeoutError, ConnectionError, AuthRetryableError)):
            return True
        status = getattr(current, "status", None)
        if isinstance(status, int) and (status == 429 or status >= 500):
            return True
        wrapped = getattr(current, "original_error", None)
        current = current.__cause__ or current.__context__ or (wrapped if isinstance(wrapped, BaseException) else None)
    return False
