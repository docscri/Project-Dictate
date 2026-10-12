from pydantic import BaseModel
from typing import Literal
from pydantic import Field
from shared.validation import NonBlankText


class PatientCreateRequest(BaseModel):
    name: NonBlankText
    age: int | None = Field(default=None, ge=0, strict=True)
    sex: Literal["male", "female", "other"] | None = None
