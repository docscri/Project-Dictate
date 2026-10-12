from shared.db import call as db
from shared.logger import get_logger


logger = get_logger(__name__)


def create_patient(user_id: str, data: dict):
    logger.info(f"Creating patient for doctor {user_id}")

    patient_data = {
        "doctor_id": user_id,
        **data,
    }

    result = db.insert(
        "patients",
        patient_data,
    )

    logger.info(f"Patient created for doctor {user_id}")

    return result[0]


def get_patient(user_id: str, patient_id: str):
    logger.info(
        f"Fetching patient {patient_id} for doctor {user_id}"
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
            f"Doctor {user_id} tried to access patient {patient_id}"
        )
        return None

    return patient


def search_patients(user_id: str, query: str):
    logger.info(
        f"Searching patients for doctor {user_id}"
    )

    patients = db.search(
        "patients",
        "name",
        query,
        filters={"doctor_id": user_id},
    )

    logger.info(
        f"Found {len(patients)} patients for doctor {user_id}"
    )

    return patients