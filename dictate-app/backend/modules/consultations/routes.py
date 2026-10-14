# modules/consultations/routes.py

from fastapi import APIRouter, Depends, Response, Query

from modules.consultations.schemas import (
    ConsultationCreateRequest,
    ConsultationNoteUpdateRequest,
)
from modules.consultations.service import (
    create_consultation,
    get_consultation,
    get_consultation_detail,
    list_consultations,
    get_consultation_status,
    update_consultation_note,
    sign_consultation,
)
from modules.dictation.service import pause_dictation, delete_consultation
from shared.security import get_current_user
from shared.errors import api_error


router = APIRouter(
    prefix="/api/consultations",
    tags=["Consultations"],
)


@router.post("/{consultation_id}/pause")
def pause_route(consultation_id: str, user=Depends(get_current_user)):
    return pause_dictation(user.id, consultation_id)


@router.post("/{consultation_id}/sign")
def sign_route(consultation_id: str, user=Depends(get_current_user)):
    return sign_consultation(user.id, consultation_id)


@router.delete("/{consultation_id}", status_code=204)
def delete_route(consultation_id: str, user=Depends(get_current_user)):
    delete_consultation(user.id, consultation_id)
    return Response(status_code=204)


@router.post("")
def create_consultation_route(
    data: ConsultationCreateRequest,
    user=Depends(get_current_user),
):
    consultation = create_consultation(
        user.id,
        data.patient_id,
    )

    if consultation is None:
        raise api_error(404, "not_found", "Patient not found.")

    return consultation


@router.get("/{consultation_id}")
def get_consultation_route(
    consultation_id: str,
    user=Depends(get_current_user),
):
    consultation = get_consultation_detail(
        user.id,
        consultation_id,
    )

    if consultation is None:
        raise api_error(404, "not_found", "Consultation not found.")

    return consultation

@router.get("/{consultation_id}/status")
def get_consultation_status_route(
    consultation_id: str,
    user=Depends(get_current_user),
):
    status = get_consultation_status(
        user.id,
        consultation_id,
    )

    if status is None:
        raise api_error(404, "not_found", "Consultation not found.")

    return status

@router.get("")
def list_consultations_route(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user=Depends(get_current_user),
):
    return list_consultations(user.id, limit, offset)

@router.put("/{consultation_id}/note")
def update_consultation_note_route(
    consultation_id: str,
    data: ConsultationNoteUpdateRequest,
    user=Depends(get_current_user),
):
    consultation = update_consultation_note(
        user.id,
        consultation_id,
        data.note.model_dump(),
    )

    if consultation is None:
        raise api_error(404, "not_found", "Consultation not found.")

    return consultation
