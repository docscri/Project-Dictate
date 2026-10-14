from fastapi import APIRouter, Depends

from modules.patients.schemas import PatientCreateRequest
from modules.patients.service import (
    create_patient,
    get_patient,
    search_patients,
)
from shared.security import get_current_user
from shared.errors import api_error


router = APIRouter(
    prefix="/api/patients",
    tags=["Patients"],
)


@router.post("")
def create_patient_route(
    data: PatientCreateRequest,
    user=Depends(get_current_user),
):
    return create_patient(
        user.id,
        data.model_dump(),
    )


@router.get("")
def search_patients_route(
    query: str,
    user=Depends(get_current_user),
):
    return search_patients(
        user.id,
        query,
    )


@router.get("/{patient_id}")
def get_patient_route(
    patient_id: str,
    user=Depends(get_current_user),
):
    patient = get_patient(
        user.id,
        patient_id,
    )

    if patient is None:
        raise api_error(404, "not_found", "Patient not found.")

    return patient
