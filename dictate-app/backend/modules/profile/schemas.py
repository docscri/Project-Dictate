# modules/profile/schemas.py

from pydantic import BaseModel, EmailStr
from shared.validation import NonBlankText


class ProfileUpdateRequest(BaseModel):
    name: NonBlankText | None = None
    email: EmailStr | None = None
    specialty: NonBlankText | None = None
