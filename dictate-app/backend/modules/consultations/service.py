# modules/consultations/service.py

from shared.db import call as db
from modules.note_formatter.highlights import with_clinical_highlights
from shared.logger import get_logger
from shared.errors import api_error


logger = get_logger(__name__)


def create_consultation(
    user_id: str,
    patient_id: str,
):
    logger.info(
        f"Creating consultation for patient {patient_id}"
    )

    patients = db.select(
        "patients",
        "id",
        patient_id,
    )

    if not patients:
        logger.warning(
            f"Patient {patient_id} not found"
        )
        return None

    patient = patients[0]

    if patient["doctor_id"] != user_id:
        logger.warning(
            f"Doctor {user_id} tried to create consultation "
            f"for patient {patient_id}"
        )
        return None

    consultation_data = {
        "doctor_id": user_id,
        "patient_id": patient_id,
        "status": "ready",
    }

    result = db.insert(
        "consultations",
        consultation_data,
    )

    logger.info(
        f"Consultation created for patient {patient_id}"
    )

    return result[0]


def get_consultation(
    user_id: str,
    consultation_id: str,
):
    logger.info(
        f"Fetching consultation {consultation_id}"
    )

    consultations = db.select(
        "consultations",
        "id",
        consultation_id,
    )

    if not consultations:
        logger.warning(
            f"Consultation {consultation_id} not found"
        )
        return None

    consultation = consultations[0]

    if consultation["doctor_id"] != user_id:
        logger.warning(
            f"Doctor {user_id} tried to access "
            f"consultation {consultation_id}"
        )
        return None

    return consultation


def list_consultations(
    user_id: str,
    limit: int = 50,
    offset: int = 0,
):
    logger.info(
        f"Listing consultations for doctor {user_id}"
    )

    consultations = db.consultation_summaries(user_id, limit, offset)

    logger.info(
        f"Found {len(consultations)} consultations"
    )

    return with_patient_summaries(user_id, consultations)


def with_patient_summaries(user_id: str, consultations: list[dict]):
    if not consultations:
        return []
    patient_ids = list({row["patient_id"] for row in consultations})
    patients = {row["id"]: row for row in db.patient_summaries(user_id, patient_ids)}
    return [{**row, "patient": patients.get(row["patient_id"])} for row in consultations]


def get_consultation_detail(user_id: str, consultation_id: str):
    row = get_consultation(user_id, consultation_id)
    return with_patient_summaries(user_id, [row])[0] if row else None


def get_consultation_status(
    user_id: str,
    consultation_id: str,
):
    consultation = get_consultation(
        user_id,
        consultation_id,
    )

    if consultation is None:
        return None

    return {
        "status": consultation["status"],
        "processing_stage": consultation.get(
            "processing_stage"
        ),
        "processing_error": consultation.get("processing_error"),
    }


def update_consultation_note(
    user_id: str,
    consultation_id: str,
    note: dict,
):
    logger.info(
        f"Updating note for consultation {consultation_id}"
    )

    consultation = get_consultation(
        user_id,
        consultation_id,
    )

    if consultation is None:
        return None

    note = with_clinical_highlights(note, consultation.get("terms") or [])

    result = change_consultation(user_id, consultation_id, ["ready", "failed", "saved"], {"note": note, "status": "saved"})

    logger.info(
        f"Note updated for consultation {consultation_id}"
    )

    return result


def change_consultation(user_id: str, consultation_id: str, statuses: list[str], data: dict | None):
    result = db.mutate_consultation(consultation_id, user_id, statuses, data)
    if result:
        return result[0]
    row = get_consultation(user_id, consultation_id)
    if row is None:
        raise api_error(404, "not_found", "Consultation not found.")
    if row["status"] == "signed":
        raise api_error(409, "locked", "This consultation is signed and locked.")
    if row["status"] == "processing":
        code = "already_processing" if data and data.get("status") == "processing" else "locked"
        raise api_error(409, code, "The note is being processed.")
    raise api_error(409, "invalid_state", "This action is not available in the current state.")


def sign_consultation(user_id: str, consultation_id: str):
    return change_consultation(user_id, consultation_id, ["saved"], {"status": "signed"})
