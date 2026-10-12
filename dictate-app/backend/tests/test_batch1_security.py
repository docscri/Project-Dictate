import logging
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import httpx
from fastapi import WebSocketException
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError, AuthRetryableError, AuthUnknownError

from main import app
from modules.auth import service as accounts
from modules.note_formatter.service import load_note_format, load_note_instructions
from shared.auth.errors import service_unavailable
from shared.logger import TokenRedactionFilter
from shared.security import get_websocket_user


class Batch1SecurityTests(unittest.TestCase):
    def test_only_named_note_files_are_accessible(self):
        self.assertTrue(load_note_format())
        self.assertTrue(load_note_instructions())
        for name in ('missing', '..\\..\\..\\frontend\\package', '../default', 'C:\\private', '/private'):
            for loader in (load_note_format, load_note_instructions):
                with self.subTest(name=name, loader=loader.__name__), self.assertRaises(FileNotFoundError):
                    loader(name)

    def test_encoded_windows_traversal_is_not_found(self):
        with TestClient(app) as client:
            self.assertEqual(client.get('/api/note-formats/default').status_code, 200)
            response = client.get('/api/note-formats/..%5C..%5C..%5C..%5Cfrontend%5Cpackage')
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()['code'], 'not_found')
            self.assertNotIn('dependencies', response.text)

    def test_auth_outages_return_server_error_not_session_expired(self):
        with TestClient(app) as client:
            for operation, method, path, body in (
                ('login', 'POST', '/api/auth/login', {'email': 'doctor@example.com', 'password': 'test-password'}),
                ('refresh', 'POST', '/api/auth/refresh', {'refresh_token': 'test-refresh'}),
                ('get_user', 'GET', '/api/auth/me', None),
                ('get_user', 'POST', '/api/auth/logout', None),
            ):
                with self.subTest(operation=operation, path=path), patch.object(accounts.auth, operation, side_effect=httpx.ConnectError('private provider detail')):
                    response = client.request(method, path, json=body, headers={'Authorization': 'Bearer test-token'})
                    self.assertEqual(response.status_code, 500)
                    self.assertEqual(response.json()['code'], 'server_error')
                    self.assertNotIn('private provider detail', response.text)

    def test_logout_provider_outage(self):
        user = SimpleNamespace(user=SimpleNamespace(id='doctor', email='doctor@example.com'))
        with patch.object(accounts.auth, 'get_user', return_value=user), patch.object(accounts.auth, 'logout', side_effect=httpx.ReadTimeout('provider')):
            response = TestClient(app).post('/api/auth/logout', headers={'Authorization': 'Bearer test-token'})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()['code'], 'server_error')

    def test_rejected_credentials_still_return_401(self):
        with patch.object(accounts.auth, 'login', side_effect=AuthApiError('secret', 400, None)):
            response = TestClient(app).post('/api/auth/login', json={'email': 'doctor@example.com', 'password': 'wrong'})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['code'], 'invalid_credentials')

    def test_auth_error_classification(self):
        self.assertTrue(service_unavailable(AuthApiError('unavailable', 503, None)))
        self.assertTrue(service_unavailable(AuthApiError('rate limit', 429, None)))
        self.assertTrue(service_unavailable(AuthRetryableError('unavailable', 503)))
        self.assertFalse(service_unavailable(AuthApiError('rejected', 401, None)))
        self.assertTrue(service_unavailable(AuthUnknownError('wrapper', httpx.ConnectError('offline'))))

    def test_websocket_outage_is_not_invalid_credentials(self):
        with patch.object(accounts.auth, 'get_user', side_effect=httpx.ConnectError('provider')):
            with self.assertRaises(WebSocketException) as raised:
                get_websocket_user(SimpleNamespace(query_params={'token': 'test-token'}))
        self.assertEqual(raised.exception.code, 1011)

    def test_uvicorn_and_application_log_tokens_are_redacted(self):
        for logger_name in ('uvicorn.error', 'uvicorn.access', 'application'):
            record = logging.LogRecord(logger_name, logging.INFO, '', 0, '%s - "WebSocket %s" [accepted]',
                ('client', '/api/dictation/stream/one?token=private-token&access_token=private-access&refresh_token=private-refresh&other=kept'), None)
            TokenRedactionFilter().filter(record)
            output = record.getMessage()
            self.assertNotIn('private-', output)
            self.assertEqual(output.count('[REDACTED]'), 3)
            self.assertIn('other=kept', output)
        for name in ('uvicorn.error', 'uvicorn.access'):
            self.assertTrue(any(isinstance(item, TokenRedactionFilter) for item in logging.getLogger(name).filters))

    def test_uvicorn_access_formatter_still_works(self):
        from uvicorn.logging import AccessFormatter
        record = logging.LogRecord('uvicorn.access', logging.INFO, '', 0, '%s - "%s %s HTTP/%s" %d',
            ('client', 'GET', '/api/dictation/stream/one?token=private-token', '1.1', 101), None)
        TokenRedactionFilter().filter(record)
        output = AccessFormatter('%(request_line)s %(status_code)s', use_colors=False).format(record)
        self.assertNotIn('private-token', output)
        self.assertIn('[REDACTED]', output)
        self.assertIn('101', output)
