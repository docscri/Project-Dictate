# modules/auth/routes.py

from fastapi import APIRouter, Depends

from modules.auth.schemas import LoginRequest, SignupRequest, RefreshRequest
from modules.auth.service import login_user, signup_user, refresh_session, logout_user
from shared.security import get_current_user, bearer_scheme
from fastapi.security import HTTPAuthorizationCredentials


router = APIRouter(
    prefix="/api/auth",
    tags=["Auth"],
)


@router.post("/signup")
def signup(data: SignupRequest):
    return signup_user(
        email=data.email,
        password=data.password,
        name=data.name,
        specialty=data.specialty,
    )


@router.post("/login")
def login(data: LoginRequest):
    return login_user(
        email=data.email,
        password=data.password,
    )


@router.get("/me")
def me(user=Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
    }


@router.post("/logout")
def logout(user=Depends(get_current_user), credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    return logout_user(credentials.credentials)


@router.post("/refresh")
def refresh(data: RefreshRequest):
    return refresh_session(data.refresh_token)
