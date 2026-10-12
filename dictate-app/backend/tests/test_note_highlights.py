import copy
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from modules.consultations import service
from modules.note_formatter.highlights import with_clinical_highlights
from tests import test_dictation_pipeline as b6

TERMS = b6.TERMS


NOTE = {"subjective": "Chest pain. No chest pain now.", "objective": "", "assessment": "Chest\npain", "plan": ""}


class HighlightTests(unittest.TestCase):
    def test_repeated_terms_case_whitespace_and_section_offsets(self):
        original = copy.deepcopy(NOTE)
        result = with_clinical_highlights(NOTE, TERMS + TERMS)
        spans = result["highlights"]
        self.assertEqual([(s["section"], s["start"], s["end"]) for s in spans], [("subjective", 0, 10), ("subjective", 15, 25), ("assessment", 0, 10)])
        for span in spans:
            self.assertEqual(result[span["section"]][span["start"]:span["end"]], span["text"])
        self.assertEqual(NOTE, original)

    def test_no_partial_words_or_inferred_synonyms(self):
        note = {**NOTE, "subjective": "chest painful; pain in the chest", "assessment": ""}
        self.assertEqual(with_clinical_highlights(note, TERMS)["highlights"], [])

    def test_unicode_offsets_overlap_and_invalid_terms(self):
        note = {**NOTE, "subjective": "🙂 Chest pain", "assessment": ""}
        terms = TERMS + [{"text": "pain", "type": "medical_condition"}, None, {}, {"text": " ", "type": "x"}]
        spans = with_clinical_highlights(note, terms)["highlights"]
        self.assertEqual([(s["start"], s["end"]) for s in spans], [(2, 12), (8, 12)])
        for span in spans:
            self.assertEqual(note[span["section"]][span["start"]:span["end"]], span["text"])

    def test_empty_terms_clear_stale_highlights(self):
        self.assertEqual(with_clinical_highlights({**NOTE, "highlights": [{"start": 999}]}, [])["highlights"], [])


class NoteSaveTests(unittest.TestCase):
    # Reuse the existing authenticated in-memory API fixture.
    setUp = b6.IntegrationTests.setUp

    def test_save_rebuilds_offsets_and_get_returns_saved_spans(self):
        self.database.rows["c1"]["terms"] = TERMS
        note = {**NOTE, "subjective": "Now reports chest pain", "assessment": "", "highlights": [{"start": 999}]}
        with patch("shared.ai_gateway.call.call") as ai, TestClient(app) as client:
            response = client.put("/api/consultations/c1/note", json={"note": note}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            saved = response.json()["note"]
            self.assertEqual(saved["highlights"][0]["start"], 12)
            self.assertEqual(client.get("/api/consultations/c1", headers=self.headers).json()["note"], saved)
            note["subjective"] = "No symptoms reported"
            response = client.put("/api/consultations/c1/note", json={"note": note}, headers=self.headers)
            self.assertEqual(response.json()["note"]["highlights"], [])
            ai.assert_not_called()

    def test_foreign_doctor_cannot_update_highlights(self):
        self.database.rows["c1"]["doctor_id"] = "d2"
        with TestClient(app) as client:
            self.assertEqual(client.put("/api/consultations/c1/note", json={"note": NOTE}, headers=self.headers).status_code, 404)
        self.assertFalse(self.database.updates)
