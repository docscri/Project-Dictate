from pydantic import BaseModel, EmailStr, Field
from pydantic import StringConstraints
from typing import Annotated

ProfileText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
class SignupRequest(BaseModel):
    email:EmailStr
    password:str
    name: ProfileText
    specialty: ProfileText

class LoginRequest(BaseModel):
    email:EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)
    
