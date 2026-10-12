"""Check patient search ownership at the HTTP/database boundary without live data."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from shared.db.providers import supabase as database


class PatientQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = {}
        self.column = None
        self.pattern = None

    def select(self, columns):
        return self

    def ilike(self, column, pattern):
        self.column, self.pattern = column, pattern
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def execute(self):
        needle = self.pattern[1:-1].casefold()
        matches = [
            row for row in self.rows
            if needle in row[self.column].casefold()
            and all(row.get(key) == value for key, value in self.filters.items())
        ]
        return SimpleNamespace(data=matches)


class PatientSearchTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            {"id": "p1", "doctor_id": "doctor-one", "name": "Alex Smith"},
            {"id": "p2", "doctor_id": "doctor-two", "name": "Alex Smith"},
            {"id": "p3", "doctor_id": "doctor-two", "name": "Other Patient"},
        ]
        self.queries = []

    def table(self, name):
        self.assertEqual(name, "patients")
        query = PatientQuery(self.rows)
        self.queries.append(query)
        return query

    def user(self, token):
        return SimpleNamespace(user=SimpleNamespace(id=token))

    def test_same_name_is_isolated_for_each_doctor_and_case_insensitive(self):
        with patch.object(database.supabase, "table", side_effect=self.table), patch(
            "shared.auth.call.get_user", side_effect=self.user
        ), TestClient(app) as client:
            for doctor, patient in [("doctor-one", "p1"), ("doctor-two", "p2")]:
                with self.subTest(doctor=doctor):
                    response = client.get(
                        "/api/patients", params={"query": "aLeX"},
                        headers={"Authorization": f"Bearer {doctor}"},
                    )
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual([row["id"] for row in response.json()], [patient])
                    self.assertEqual(self.queries[-1].filters, {"doctor_id": doctor})

    def test_match_owned_only_by_another_doctor_returns_empty_list(self):
        with patch.object(database.supabase, "table", side_effect=self.table), patch(
            "shared.auth.call.get_user", side_effect=self.user
        ), TestClient(app) as client:
            response = client.get(
                "/api/patients", params={"query": "Other"},
                headers={"Authorization": "Bearer doctor-one"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), [])

    def test_unauthenticated_search_does_not_query_database(self):
        with patch.object(database.supabase, "table") as table, TestClient(app) as client:
            response = client.get("/api/patients", params={"query": "Alex"})
            self.assertEqual(response.status_code, 401)
            table.assert_not_called()
