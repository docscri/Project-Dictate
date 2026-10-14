from shared.auth import call as auth
from shared.db import call as db


DEFAULT_PROFILE_NAME = "Doctor"
DEFAULT_SPECIALTY = "General Medicine"


def _profile_payload(user, data: dict | None = None):
    metadata = getattr(user, "user_metadata", None) or {}
    payload = {
        "id": user.id,
        "email": user.email,
        "name": metadata.get("name") or metadata.get("full_name") or DEFAULT_PROFILE_NAME,
        "specialty": metadata.get("specialty") or DEFAULT_SPECIALTY,
    }
    payload.update(data or {})
    return payload


def get_profile(user_id: str):
    profiles = db.select(
        "profiles",
        "id",
        user_id,
    )

    if not profiles:
        return None

    return profiles[0]


def ensure_profile(user):
    profile = get_profile(user.id)
    if profile is not None:
        return profile

    payload = _profile_payload(user)
    rows = db.upsert("profiles", payload, on_conflict="id")
    return rows[0] if rows else payload


def update_profile(user, data: dict):
    data = dict(data)
    requested_email = data.get("email")
    if requested_email:
        requested_email = str(requested_email).strip().lower()
        data["email"] = requested_email
        if requested_email != (user.email or "").strip().lower():
            auth.update_user_email(user.id, requested_email)

    profile = get_profile(user.id)
    if profile is None:
        payload = _profile_payload(user, data)
        rows = db.upsert("profiles", payload, on_conflict="id")
        return rows[0] if rows else payload

    rows = db.update(
        "profiles",
        "id",
        user.id,
        data,
    )
    return rows[0] if rows else {**profile, **data}
