from shared.auth import call as auth
from shared.db import call as db
from shared.auth.errors import service_unavailable
from shared.errors import api_error
from shared.logger import get_logger
from postgrest.exceptions import APIError


logger = get_logger(__name__)


def _session_response(response):
    user, session = response.user, response.session
    return {
        'user': {'id': user.id, 'email': user.email},
        'access_token': session.access_token if session else None,
        'refresh_token': session.refresh_token if session else None,
        'expires_in': session.expires_in if session else None,
        'expires_at': session.expires_at if session else None,
    }


def signup_user(email: str, password: str, name: str, specialty: str):
    created_user_id = None
    try:
        response = auth.signup(email, password)
        user = response.user
        # Duplicate signup may return an existing/obfuscated user. Never delete it.
        if user is None or (not response.session and not user.identities):
            raise ValueError('No newly created account')
        if db.select('profiles', 'id', user.id):
            raise ValueError('An existing profile must not be overwritten')
        created_user_id = user.id
        try:
            rows = db.insert('profiles', {'id': user.id, 'email': user.email, 'name': name, 'specialty': specialty})
        except APIError as exc:
            if exc.code == '23505':
                # A concurrent signup saved this profile; preserve that account.
                created_user_id = None
            raise
        if not rows:
            raise ValueError('Profile was not saved')
        return {**_session_response(response), 'confirmation_required': response.session is None}
    except Exception:
        logger.warning('Signup failed')
        if created_user_id:
            try:
                auth.delete_user(created_user_id)
            except Exception:
                logger.exception('Could not roll back newly created auth account')
            try:
                db.delete_profile(created_user_id)
            except Exception:
                logger.exception('Could not roll back newly created profile')
        raise api_error(400, 'signup_failed', 'Could not create account.')


def login_user(email: str, password: str):
    try:
        response = auth.login(email, password)
        if response.user is None or response.session is None:
            raise ValueError('No session')
        return _session_response(response)
    except Exception as error:
        if service_unavailable(error):
            raise api_error(500, 'server_error', 'Something went wrong. Please try again.') from None
        raise api_error(401, 'invalid_credentials', 'Wrong email or password.')


def refresh_session(refresh_token: str):
    try:
        response = auth.refresh(refresh_token)
        if response.user is None or response.session is None:
            raise ValueError('No session')
        return _session_response(response)
    except Exception as error:
        if service_unavailable(error):
            raise api_error(500, 'server_error', 'Something went wrong. Please try again.') from None
        raise api_error(401, 'session_expired', 'Please sign in again.')


def logout_user(access_token: str):
    try:
        auth.logout(access_token)
    except Exception as error:
        if service_unavailable(error):
            raise api_error(500, 'server_error', 'Something went wrong. Please try again.') from None
        raise api_error(401, 'session_expired', 'Please sign in again.')
    return {'message': 'Logged out'}
