import os
from typing import Any, cast

from supabase import create_client

from shared.logger import get_logger


logger = get_logger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]


supabase = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
)


# Table operations return object rows; the SDK types them as arbitrary JSON.
def insert(table: str, data: dict) -> list[dict[str, Any]]:
    logger.info(f"Inserting into {table}")

    response = (
        supabase
        .table(table)
        .insert(data)
        .execute()
    )

    return cast(list[dict[str, Any]], response.data)


def select(table: str, column: str, value) -> list[dict[str, Any]]:
    response = (
        supabase
        .table(table)
        .select("*")
        .eq(column, value)
        .execute()
    )

    return cast(list[dict[str, Any]], response.data)


def update(table: str, column: str, value, data: dict) -> list[dict[str, Any]]:
    response = (
        supabase
        .table(table)
        .update(data)
        .eq(column, value)
        .execute()
    )

    return cast(list[dict[str, Any]], response.data)


def upsert(table: str, data: dict, *, on_conflict: str) -> list[dict[str, Any]]:
    response = (
        supabase
        .table(table)
        .upsert(data, on_conflict=on_conflict)
        .execute()
    )

    return cast(list[dict[str, Any]], response.data)

def search(
    table: str,
    column: str,
    value: str,
    *,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    query = supabase.table(table).select("*").ilike(column, f"%{value}%")
    for filter_column, filter_value in (filters or {}).items():
        query = query.eq(filter_column, filter_value)
    response = query.execute()
    return cast(list[dict[str, Any]], response.data)

def select_all(table: str, column: str, value) -> list[dict[str, Any]]:
    return select(table, column, value)


def delete_profile(user_id: str):
    supabase.table("profiles").delete().eq("id", user_id).execute()


def patient_summaries(doctor_id: str, patient_ids: list[str]) -> list[dict[str, Any]]:
    if not patient_ids:
        return []
    response = supabase.table("patients").select("id,name,age,sex").eq("doctor_id", doctor_id).in_("id", patient_ids).execute()
    return cast(list[dict[str, Any]], response.data)


def mutate_consultation(consultation_id: str, doctor_id: str, statuses: list[str], data: dict | None) -> list[dict[str, Any]]:
    # State and ownership are checked in the same database statement as the write.
    query = supabase.table("consultations")
    query = query.delete() if data is None else query.update(data)
    response = query.eq("id", consultation_id).eq("doctor_id", doctor_id).in_("status", statuses).execute()
    return cast(list[dict[str, Any]], response.data)


def consultation_summaries(doctor_id: str, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    response = (supabase.table("consultations")
                .select("id,doctor_id,patient_id,status,created_at,processing_started_at,processing_stage,processing_error,last_processing_stage")
                .eq("doctor_id", doctor_id)
                .order("created_at", desc=True).order("id", desc=True)
                .range(offset, offset + limit - 1).execute())
    return cast(list[dict[str, Any]], response.data)
