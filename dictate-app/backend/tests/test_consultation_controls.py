import copy
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from main import app
from modules.dictation import service
from shared.db.providers import supabase as provider
from tests import test_dictation_pipeline as b6


class ConsultationControlTests(unittest.TestCase):
    setUp = b6.IntegrationTests.setUp

    def assert_error(self, response, status, code):
        self.assertEqual(response.status_code, status, response.text)
        self.assertEqual(set(response.json()), {"code", "message", "fields"})
        self.assertEqual(response.json()["code"], code)
        self.assertEqual(response.json()["fields"], [])

    def test_pause_flushes_and_resume_appends_same_consultation(self):
        first, second = b6.FakeTranscriptionStream(), b6.FakeTranscriptionStream()
        with patch.object(service.ai, "open_transcription_stream", side_effect=[first, second]), TestClient(app) as client:
            with client.websocket_connect("/api/dictation/stream/c1?token=test") as ws:
                ws.receive_json()
                ws.send_bytes(b"audio")
                ws.receive_json()
                ws.receive_json()
                response = client.post("/api/consultations/c1/pause", headers=self.headers)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "paused")
                self.assertTrue(first.closed)
                self.assertIn("No fever.", response.json()["transcript"])
            before = self.database.rows["c1"]["transcript"]
            with client.websocket_connect("/api/dictation/stream/c1?token=test") as ws:
                self.assertEqual(ws.receive_json()["status"], "dictating")
                ws.send_bytes(b"more audio")
                ws.receive_json()
                ws.receive_json()
                client.post("/api/consultations/c1/pause", headers=self.headers)
            self.assertTrue(self.database.rows["c1"]["transcript"].startswith(before))
            self.assertFalse(service._active_streams)

    def test_second_stream_is_busy(self):
        with patch.object(service.ai, "open_transcription_stream", return_value=b6.FakeTranscriptionStream()), TestClient(app) as client:
            with client.websocket_connect("/api/dictation/stream/c1?token=test") as first:
                first.receive_json()
                with client.websocket_connect("/api/dictation/stream/c1?token=test") as second:
                    self.assertEqual(second.receive_json()["code"], "stream_busy")

    def test_delete_active_stream_closes_and_removes_contents(self):
        stream = b6.FakeTranscriptionStream()
        with patch.object(service.ai, "open_transcription_stream", return_value=stream), TestClient(app) as client:
            with client.websocket_connect("/api/dictation/stream/c1?token=test") as ws:
                ws.receive_json()
                response = client.delete("/api/consultations/c1", headers=self.headers)
                self.assertEqual((response.status_code, response.content), (204, b""))
                self.assertTrue(stream.closed)
                self.assertNotIn("c1", self.database.rows)

    def test_delete_all_allowed_states(self):
        original = copy.deepcopy(self.database.rows["c1"])
        with TestClient(app) as client:
            for state in ["ready", "paused", "saved", "failed"]:
                self.database.rows["c1"] = {**original, "status": state}
                self.assertEqual(client.delete("/api/consultations/c1", headers=self.headers).status_code, 204)
                self.assertNotIn("c1", self.database.rows)

    def test_sign_locks_every_write_path(self):
        self.database.rows["c1"]["status"] = "saved"
        with patch.object(service.ai, "open_transcription_stream") as stream, patch.object(service.ai, "call") as ai, TestClient(app) as client:
            self.assertEqual(client.post("/api/consultations/c1/sign", headers=self.headers).json()["status"], "signed")
            for method, path, payload in [
                ("put", "/api/consultations/c1/note", {"note": b6.SOAP["sections"]}),
                ("post", "/api/dictation/finish", {"consultation_id": "c1"}),
                ("post", "/api/consultations/c1/pause", {}),
                ("delete", "/api/consultations/c1", None),
            ]:
                response = client.request(method, path, json=payload, headers=self.headers)
                self.assertEqual((response.status_code, response.json()["code"]), (409, "locked"))
            with client.websocket_connect("/api/dictation/stream/c1?token=test") as ws:
                self.assertEqual(ws.receive_json()["code"], "locked")
            service.process_finished_dictation("d1", "c1")
            service.complete_processing("c1", [], {})
            service.save_transcript_segment("c1", "late words")
            stream.assert_not_called()
            ai.assert_not_called()
        self.assertEqual(self.database.rows["c1"]["status"], "signed")
        self.assertEqual(self.database.rows["c1"]["transcript"], "")

    def test_invalid_states_and_processing_locks(self):
        with TestClient(app) as client:
            for state in ["ready", "paused", "dictating", "failed"]:
                self.database.rows["c1"]["status"] = state
                response = client.post("/api/consultations/c1/sign", headers=self.headers)
                self.assertEqual(response.json()["code"], "invalid_state")
            self.database.rows["c1"]["status"] = "processing"
            for method, path, payload in [("delete", "/api/consultations/c1", None), ("put", "/api/consultations/c1/note", {"note": {}})]:
                self.assertEqual(client.request(method, path, json=payload, headers=self.headers).json()["code"], "locked")
            self.assertEqual(client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers).json()["code"], "already_processing")

    def test_doctor_isolation_for_new_actions(self):
        self.database.rows["c1"]["doctor_id"] = "d2"
        with TestClient(app) as client:
            for method, suffix in [("post", "/pause"), ("post", "/sign"), ("delete", "")]:
                response = client.request(method, "/api/consultations/c1" + suffix, headers=self.headers)
                self.assert_error(response, 404, "not_found")
        self.assertFalse(self.database.updates)

    def test_locked_consultation_uses_standard_error_contract(self):
        self.database.rows["c1"]["status"] = "signed"
        with TestClient(app) as client:
            response = client.post("/api/consultations/c1/pause", headers=self.headers)
        self.assert_error(response, 409, "locked")

    def test_concurrent_finish_claims_one_job(self):
        self.database.rows["c1"]["status"] = "paused"
        lock = Lock()
        original = self.database.mutate_consultation
        def atomic(*args):
            with lock:
                return original(*args)
        def finish(_):
            try:
                service.finish_dictation("d1", "c1")
                return "started"
            except HTTPException as exc:
                return exc.detail["code"]
        with patch.object(service.db, "mutate_consultation", side_effect=atomic), ThreadPoolExecutor(max_workers=8) as pool:
            outcomes = list(pool.map(finish, range(8)))
        self.assertEqual(outcomes.count("started"), 1)
        self.assertEqual(outcomes.count("already_processing"), 7)

    def test_failed_processing_can_retry_saved_transcript(self):
        self.database.rows["c1"].update(status="failed", transcript="Chest pain.", processing_error="note_failed")
        with patch.object(service.ai, "call", side_effect=[{"terms": b6.TERMS}, b6.SOAP]), TestClient(app) as client:
            self.assertEqual(client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers).status_code, 200)
        self.assertEqual(self.database.rows["c1"]["status"], "saved")
        self.assertIsNone(self.database.rows["c1"]["processing_error"])

    def test_finish_rejects_ready_and_saved_without_scheduling(self):
        with patch.object(service, "process_finished_dictation") as job, TestClient(app) as client:
            for state in ["ready", "saved"]:
                self.database.rows["c1"]["status"] = state
                response = client.post("/api/dictation/finish", json={"consultation_id": "c1"}, headers=self.headers)
                self.assertEqual((response.status_code, response.json()["code"]), (409, "invalid_state"))
            job.assert_not_called()

    def test_pause_rejects_non_recording_states(self):
        with TestClient(app) as client:
            for state in ["ready", "paused", "saved", "failed"]:
                self.database.rows["c1"]["status"] = state
                response = client.post("/api/consultations/c1/pause", headers=self.headers)
                self.assertEqual((response.status_code, response.json()["code"]), (409, "invalid_state"))

    def test_new_routes_require_authentication(self):
        with TestClient(app) as client:
            for method, suffix in [("post", "/pause"), ("post", "/sign"), ("delete", "")]:
                response = client.request(method, "/api/consultations/c1" + suffix)
                self.assertEqual((response.status_code, response.json()["code"]), (401, "unauthorized"))
        self.assertFalse(self.database.updates)

    def test_error_envelopes_do_not_expose_private_details(self):
        with TestClient(app, raise_server_exceptions=False) as client:
            self.assertEqual(client.post("/api/consultations/c1/pause").json()["code"], "unauthorized")
            self.assertEqual(client.post("/api/dictation/finish", json={}, headers=self.headers).json()["code"], "validation_error")
            with patch.object(service.db, "select", side_effect=RuntimeError("private database credentials")):
                response = client.get("/api/consultations/c1", headers=self.headers)
                self.assertEqual(response.status_code, 500)
                self.assertEqual(response.json()["code"], "server_error")
                self.assertNotIn("private", response.text)


class DatabaseGuardTests(unittest.TestCase):
    def test_provider_filters_ownership_and_state_for_updates_and_deletes(self):
        query = Mock()
        query.update.return_value = query.delete.return_value = query.eq.return_value = query.in_.return_value = query
        query.execute.return_value.data = [{"id": "c1"}]
        with patch.object(provider.supabase, "table", return_value=query):
            for data in [{"status": "signed"}, None]:
                provider.mutate_consultation("c1", "d1", ["saved"], data)
        self.assertIn(unittest.mock.call("doctor_id", "d1"), query.eq.call_args_list)
        query.in_.assert_called_with("status", ["saved"])
        query.delete.assert_called_once()
