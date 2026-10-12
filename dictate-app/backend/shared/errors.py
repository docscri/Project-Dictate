from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import JSONResponse

from shared.logger import get_logger


def api_error(status: int, code: str, message: str):
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def install_error_handlers(app):
    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            body = exc.detail
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
            body = {"code": code, "message": message}
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
        return JSONResponse({"code": "validation_error", "message": "Check the required fields and their values.", "fields": fields}, status_code=422)

    @app.exception_handler(Exception)
    async def server_error(request: Request, exc: Exception):
        get_logger(__name__).error("Request failed", exc_info=exc)
        return JSONResponse({"code": "server_error", "message": "Something went wrong. Please try again."}, status_code=500)
