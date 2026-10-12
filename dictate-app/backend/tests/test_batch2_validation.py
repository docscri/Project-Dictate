import unittest
from unittest.mock import patch

from main import app
from modules.patients.schemas import PatientCreateRequest
from modules.consultations.schemas import ConsultationNoteUpdateRequest
from tests import test_accounts_and_patient_summaries as accounts


class ValidationTests(unittest.TestCase):
    setUp = accounts.AccountTests.setUp

    def check_invalid(self, method, path, body, fields):
        response = self.client.request(method, path, json=body, headers=self.headers)
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(response.json()['code'], 'validation_error')
        self.assertEqual(response.json()['fields'], fields)
        self.assertNotIn('PRIVATE', response.text)
        self.assertNotIn('input', response.json())
        self.insert.assert_not_called()

    def test_patient_name_cannot_be_blank(self):
        for name in ['', '   ', '\n\t']:
            self.check_invalid('POST', '/api/patients', {'name': name}, ['name'])

    def test_age_requires_nonnegative_integer(self):
        for age in [-1, 3.5, True, '58']:
            self.check_invalid('POST', '/api/patients', {'name': 'PRIVATE patient', 'age': age}, ['age'])

    def test_patient_validation_reports_multiple_fields(self):
        self.check_invalid('POST', '/api/patients', {'name': '', 'age': -1, 'sex': 'PRIVATE invalid'}, ['name', 'age', 'sex'])

    def test_valid_patient_name_trims_and_optional_age_stays_optional(self):
        self.assertEqual(PatientCreateRequest(name='  Patient  ').name, 'Patient')
        self.assertIsNone(PatientCreateRequest(name='Patient').age)
        self.assertEqual(PatientCreateRequest(name='Patient', age=0).age, 0)

    def test_profile_blank_fields_are_rejected_before_write(self):
        with patch('modules.profile.service.db.update') as update:
            self.check_invalid('PUT', '/api/profile', {'name': ' ', 'specialty': '\t'}, ['name', 'specialty'])
            update.assert_not_called()

    def test_blank_consultation_ids_are_rejected(self):
        self.check_invalid('POST', '/api/consultations', {'patient_id': '  '}, ['patient_id'])
        self.check_invalid('POST', '/api/dictation/finish', {'consultation_id': ''}, ['consultation_id'])

    def test_note_values_must_be_text_and_report_section_names(self):
        self.check_invalid('PUT', '/api/consultations/c1/note', {'note': {'subjective': ['PRIVATE'], 'plan': 42}}, ['subjective', 'plan'])
        self.check_invalid('PUT', '/api/consultations/c1/note', {'note': 'PRIVATE'}, ['note'])

    def test_note_text_is_preserved_and_client_metadata_is_ignored(self):
        data = ConsultationNoteUpdateRequest(note={'subjective': '  clinical text\n', 'highlights': ['PRIVATE']})
        self.assertEqual(data.note.model_dump(), {'subjective': '  clinical text\n', 'objective': '', 'assessment': '', 'plan': ''})


if __name__ == '__main__':
    unittest.main()
