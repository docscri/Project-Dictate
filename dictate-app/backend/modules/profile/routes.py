# modules/profile/routes.py

from fastapi import APIRouter, Depends

from modules.profile.schemas import ProfileUpdateRequest
from modules.profile.service import ensure_profile, update_profile
from shared.security import get_current_user


router = APIRouter(
    prefix="/api/profile",
    tags=["Profile"],
)


@router.get("")
def read_profile(
    user=Depends(get_current_user),
):
    return ensure_profile(user)


@router.put("")
def edit_profile(
    data: ProfileUpdateRequest,
    user=Depends(get_current_user),
):
    return update_profile(
        user,
        data.model_dump(exclude_none=True),
    )
