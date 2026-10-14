import os
from contextlib import contextmanager

import httpx
from supabase import create_client, ClientOptions


@contextmanager
def _client(admin=False):
    # Each request has its own auth state; never share a doctor's session.
    key = os.environ['SUPABASE_SERVICE_ROLE_KEY' if admin else 'SUPABASE_ANON_KEY']
    with httpx.Client(timeout=15) as transport:
        yield create_client(os.environ['SUPABASE_URL'], key, options=ClientOptions(
            auto_refresh_token=False, persist_session=False, httpx_client=transport,
        ))


def signup(email: str, password: str):
    with _client() as client:
        return client.auth.sign_up({'email': email, 'password': password})


def login(email: str, password: str):
    with _client() as client:
        return client.auth.sign_in_with_password({'email': email, 'password': password})


def get_user(access_token: str):
    with _client() as client:
        return client.auth.get_user(access_token)


def refresh(refresh_token: str):
    with _client() as client:
        return client.auth.refresh_session(refresh_token)


def logout(access_token: str):
    with _client(admin=True) as client:
        client.auth.admin.sign_out(access_token, scope='local')


def delete_user(user_id: str):
    with _client(admin=True) as client:
        client.auth.admin.delete_user(user_id)


def update_user_email(user_id: str, email: str):
    with _client(admin=True) as client:
        return client.auth.admin.update_user_by_id(user_id, {'email': email})
