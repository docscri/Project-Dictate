# modules/profile/routes.py

from fastapi import APIRouter, Depends, HTTPException

from modules.profile.schemas import ProfileUpdateRequest
from modules.profile.service import get_profile, update_profile
from shared.security import get_current_user


router = APIRouter(
    prefix="/api/profile",
    tags=["Profile"],
)


@router.get("")
def read_profile(
    user=Depends(get_current_user),
):
    profile = get_profile(user.id)

    if profile is None:
        raise HTTPException(
            status_code=404,
            detail="Profile not found",
        )

    return profile


@router.put("")
def edit_profile(
    data: ProfileUpdateRequest,
    user=Depends(get_current_user),
):
    return update_profile(
        user.id,
        data.model_dump(exclude_none=True),
    )