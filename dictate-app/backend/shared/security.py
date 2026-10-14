from fastapi import Depends, HTTPException, WebSocket, WebSocketException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from shared.auth import call as auth
from shared.auth.errors import service_unavailable
from shared.errors import api_error


bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    token = credentials.credentials

    try:
        response = auth.get_user(token)

        if response is None or response.user is None:
            raise api_error(401, "session_expired", "Please sign in again.")

        user = response.user

        return user

    except HTTPException:
        raise

    except Exception as error:
        if service_unavailable(error):
            raise api_error(500, "server_error", "Something went wrong. Please try again.") from None
        raise api_error(401, "session_expired", "Please sign in again.")


def get_websocket_user(
    websocket: WebSocket,
):
    token = websocket.query_params.get("token")

    if not token:
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
        )

    try:
        response = auth.get_user(token)

        if response is None or response.user is None:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
            )

        user = response.user

        return user

    except WebSocketException:
        raise

    except Exception as error:
        if service_unavailable(error):
            raise WebSocketException(code=status.WS_1011_INTERNAL_ERROR) from None
        raise WebSocketException(
            code=status.WS_1008_POLICY_VIOLATION,
        )
