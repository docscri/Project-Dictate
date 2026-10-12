from typing import Any

from shared.config import config
from shared.db.providers import supabase


provider = config["database"]["provider"]


def delete_profile(user_id: str):
    if provider == "supabase":
        return supabase.delete_profile(user_id)
    raise ValueError(f"Unsupported database provider: {provider}")


def patient_summaries(doctor_id: str, patient_ids: list[str]):
    if provider == "supabase":
        return supabase.patient_summaries(doctor_id, patient_ids)
    raise ValueError(f"Unsupported database provider: {provider}")


def consultation_summaries(doctor_id: str, limit: int = 50, offset: int = 0):
    if provider == "supabase":
        return supabase.consultation_summaries(doctor_id, limit, offset)
    raise ValueError(f"Unsupported database provider: {provider}")


def mutate_consultation(consultation_id: str, doctor_id: str, statuses: list[str], data: dict | None):
    if provider == "supabase":
        return supabase.mutate_consultation(consultation_id, doctor_id, statuses, data)
    raise ValueError(f"Unsupported database provider: {provider}")


def insert(
    table: str,
    data: dict,
):
    if provider == "supabase":
        return supabase.insert(
            table,
            data,
        )

    raise ValueError(
        f"Unsupported database provider: {provider}"
    )


def select(
    table: str,
    column: str,
    value,
):
    if provider == "supabase":
        return supabase.select(
            table,
            column,
            value,
        )

    raise ValueError(
        f"Unsupported database provider: {provider}"
    )


def select_all(
    table: str,
    column: str,
    value,
):
    return select(table, column, value)


def search(
    table: str,
    column: str,
    value: str,
    *,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    if provider == "supabase":
        return supabase.search(
            table,
            column,
            value,
            filters=filters,
        )

    raise ValueError(
        f"Unsupported database provider: {provider}"
    )


def update(
    table: str,
    column: str,
    value,
    data: dict,
):
    if provider == "supabase":
        return supabase.update(
            table,
            column,
            value,
            data,
        )

    raise ValueError(
        f"Unsupported database provider: {provider}"
    )
