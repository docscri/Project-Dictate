from typing import Any, cast

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import JSONResponse

from shared.logger import get_logger


def error_payload(code: str, message: str, fields: list[str] | None = None) -> dict[str, Any]:
    return {"code": code, "message": message, "fields": fields or []}


def api_error(status: int, code: str, message: str, fields: list[str] | None = None):
    return HTTPException(status_code=status, detail=error_payload(code, message, fields))


def install_error_handlers(app):
    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            detail = cast(dict[str, Any], exc.detail)
            body = error_payload(
                str(detail["code"]),
                str(detail.get("message") or "This action is not available."),
                detail.get("fields") if isinstance(detail.get("fields"), list) else None,
            )
        else:
            code, message = {
                400: ("signup_failed", "Could not create account."),
                401: ("unauthorized", "Please sign in."),
                403: ("unauthorized", "Access denied."),
                404: ("not_found", "Requested item not found."),
            }.get(exc.status_code, ("invalid_state", "This action is not available."))
            if request.url.path == "/api/auth/login" and exc.status_code == 401:
                code, message = "invalid_credentials", "Wrong email or password."
            elif exc.status_code == 401 and request.headers.get("authorization"):
                code, message = "session_expired", "Please sign in again."
            body = error_payload(code, message)
        return JSONResponse(body, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        allowed = {"name", "age", "sex", "email", "password", "specialty", "patient_id", "consultation_id",
                   "refresh_token", "note", "subjective", "objective", "assessment", "plan", "query"}
        fields = []
        for error in exc.errors():
            names = [part for part in error.get("loc", ()) if isinstance(part, str) and part in allowed]
            if names and names[-1] not in fields:
                fields.append(names[-1])
        return JSONResponse(error_payload("validation_error", "Check the required fields and their values.", fields), status_code=422)

    @app.exception_handler(Exception)
    async def server_error(request: Request, exc: Exception):
        get_logger(__name__).error("Request failed", exc_info=exc)
        return JSONResponse(error_payload("server_error", "Something went wrong. Please try again."), status_code=500)
