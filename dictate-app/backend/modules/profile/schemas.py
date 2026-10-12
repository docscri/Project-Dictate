# modules/profile/schemas.py

from pydantic import BaseModel
from shared.validation import NonBlankText


class ProfileUpdateRequest(BaseModel):
    name: NonBlankText | None = None
    specialty: NonBlankText | None = None
