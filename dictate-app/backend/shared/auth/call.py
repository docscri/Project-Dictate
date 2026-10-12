# shared/auth/call.py

from shared.auth.providers import supabase
from shared.config import config


provider = config["auth"]["provider"]


def refresh(refresh_token: str):
    if provider == "supabase":
        return supabase.refresh(refresh_token)
    raise ValueError(f"Unsupported auth provider: {provider}")


def logout(access_token: str):
    if provider == "supabase":
        return supabase.logout(access_token)
    raise ValueError(f"Unsupported auth provider: {provider}")


def delete_user(user_id: str):
    if provider == "supabase":
        return supabase.delete_user(user_id)
    raise ValueError(f"Unsupported auth provider: {provider}")


def signup(
    email: str,
    password: str,
):
    if provider == "supabase":
        return supabase.signup(
            email,
            password,
        )

    raise ValueError(
        f"Unsupported auth provider: {provider}"
    )


def login(
    email: str,
    password: str,
):
    if provider == "supabase":
        return supabase.login(
            email,
            password,
        )

    raise ValueError(
        f"Unsupported auth provider: {provider}"
    )


def get_user(
    access_token: str,
):
    if provider == "supabase":
        return supabase.get_user(
            access_token,
        )

    raise ValueError(
        f"Unsupported auth provider: {provider}"
    )
