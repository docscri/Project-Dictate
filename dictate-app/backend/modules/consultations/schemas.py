from pydantic import BaseModel
from pydantic import StrictStr
from shared.validation import NonBlankText


class ConsultationCreateRequest(BaseModel):
    patient_id: NonBlankText


class SoapNoteInput(BaseModel):
    subjective: StrictStr = ""
    objective: StrictStr = ""
    assessment: StrictStr = ""
    plan: StrictStr = ""


class ConsultationNoteUpdateRequest(BaseModel):
    note: SoapNoteInput
