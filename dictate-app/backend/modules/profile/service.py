from shared.db import call as db


def get_profile(user_id: str):
    profiles = db.select(
        "profiles",
        "id",
        user_id,
    )

    if not profiles:
        return None

    return profiles[0]


def update_profile(user_id: str, data: dict):
    return db.update(
        "profiles",
        "id",
        user_id,
        data,
    )