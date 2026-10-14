import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from dotenv import load_dotenv
from fastapi.testclient import TestClient


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from modules.profile import service
from main import app


class ProfileRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.user = SimpleNamespace(
            id="doctor-one",
            email="doctor@example.com",
            user_metadata={},
        )

    @patch.object(service.db, "upsert")
    @patch.object(service.db, "select")
    def test_missing_profile_is_recreated_for_authenticated_user(self, select, upsert):
        select.return_value = []
        upsert.return_value = [{
            "id": "doctor-one",
            "email": "doctor@example.com",
            "name": "Doctor",
            "specialty": "General Medicine",
        }]

        profile = service.ensure_profile(self.user)

        self.assertEqual(profile["name"], "Doctor")
        self.assertEqual(profile["specialty"], "General Medicine")
        upsert.assert_called_once_with("profiles", {
            "id": "doctor-one",
            "email": "doctor@example.com",
            "name": "Doctor",
            "specialty": "General Medicine",
        }, on_conflict="id")

    @patch.object(service.db, "upsert")
    @patch.object(service.db, "select")
    def test_first_profile_update_recovers_missing_row(self, select, upsert):
        select.return_value = []
        upsert.return_value = [{"name": "Dr Example", "specialty": "Cardiology"}]

        profile = service.update_profile(self.user, {
            "name": "Dr Example",
            "specialty": "Cardiology",
        })

        self.assertEqual(profile["name"], "Dr Example")
        upsert.assert_called_once_with("profiles", {
            "id": "doctor-one",
            "email": "doctor@example.com",
            "name": "Dr Example",
            "specialty": "Cardiology",
        }, on_conflict="id")

    @patch.object(service.db, "update")
    @patch.object(service.db, "select")
    def test_existing_profile_update_returns_one_object(self, select, update):
        select.return_value = [{
            "id": "doctor-one",
            "email": "doctor@example.com",
            "name": "Doctor",
            "specialty": "General Medicine",
        }]
        update.return_value = [{
            "id": "doctor-one",
            "email": "doctor@example.com",
            "name": "Dr Example",
            "specialty": "Cardiology",
        }]

        profile = service.update_profile(self.user, {
            "name": "Dr Example",
            "specialty": "Cardiology",
        })

        self.assertIsInstance(profile, dict)
        self.assertEqual(profile["specialty"], "Cardiology")

    @patch.object(service.auth, "update_user_email")
    @patch.object(service.db, "update")
    @patch.object(service.db, "select")
    def test_email_update_changes_auth_identity_and_profile_row(
        self,
        select,
        update,
        update_user_email,
    ):
        select.return_value = [{
            "id": "doctor-one",
            "email": "doctor@example.com",
            "name": "Doctor",
            "specialty": "General Medicine",
        }]
        update.return_value = [{
            "id": "doctor-one",
            "email": "new-doctor@example.com",
            "name": "Doctor",
            "specialty": "General Medicine",
        }]

        profile = service.update_profile(self.user, {
            "email": "New-Doctor@Example.com",
        })

        update_user_email.assert_called_once_with(
            "doctor-one",
            "new-doctor@example.com",
        )
        update.assert_called_once_with(
            "profiles",
            "id",
            "doctor-one",
            {"email": "new-doctor@example.com"},
        )
        self.assertEqual(profile["email"], "new-doctor@example.com")

    def test_profile_update_endpoint_returns_one_profile_object(self):
        expected = {
            "id": "doctor-one",
            "email": "doctor@example.com",
            "name": "Dr Example",
            "specialty": "Cardiology",
        }
        auth_response = SimpleNamespace(user=self.user)
        with patch("shared.auth.call.get_user", return_value=auth_response), \
             patch("modules.profile.routes.update_profile", return_value=expected), \
             TestClient(app) as client:
            response = client.put(
                "/api/profile",
                json={"name": "Dr Example", "specialty": "Cardiology"},
                headers={"Authorization": "Bearer test-token"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected)
        self.assertIsInstance(response.json(), dict)


if __name__ == "__main__":
    unittest.main()
