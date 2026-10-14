import unittest
import json
import os
import httpx
from postgrest.exceptions import APIError
from contextlib import ExitStack, contextmanager
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from main import app
from modules.auth import service as accounts
from modules.consultations import service as consultations
from shared.auth.providers import supabase as auth_provider
from shared.db.providers import supabase as db_provider


def auth_response(access='access-one', refresh='refresh-one', confirmation=False):
    return SimpleNamespace(
        user=SimpleNamespace(id='doctor-one', email='doctor@example.com', identities=[{'id': 'identity-one'}]),
        session=None if confirmation else SimpleNamespace(access_token=access, refresh_token=refresh, expires_in=3600, expires_at=2000000000),
    )


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.signup = self.stack.enter_context(patch.object(accounts.auth, 'signup', return_value=auth_response()))
        self.login = self.stack.enter_context(patch.object(accounts.auth, 'login', return_value=auth_response()))
        self.refresh = self.stack.enter_context(patch.object(accounts.auth, 'refresh', return_value=auth_response('access-two', 'refresh-two')))
        self.logout = self.stack.enter_context(patch.object(accounts.auth, 'logout'))
        self.delete_user = self.stack.enter_context(patch.object(accounts.auth, 'delete_user'))
        self.delete_profile = self.stack.enter_context(patch.object(accounts.db, 'delete_profile'))
        self.insert = self.stack.enter_context(patch.object(accounts.db, 'insert', side_effect=lambda table, data: [data]))
        self.select = self.stack.enter_context(patch.object(accounts.db, 'select', return_value=[]))
        self.stack.enter_context(patch.object(accounts.auth, 'get_user', return_value=auth_response()))
        self.client = self.stack.enter_context(TestClient(app))
        self.headers = {'Authorization': 'Bearer access-one'}
        self.signup_payload = {'email': 'doctor@example.com', 'password': 'test-password', 'name': 'Dr Example', 'specialty': 'Cardiology'}

    def test_signup_saves_profile_and_returns_both_tokens(self):
        response = self.client.post('/api/auth/signup', json=self.signup_payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['refresh_token'], 'refresh-one')
        self.assertEqual(response.json()['access_token'], 'access-one')
        self.assertFalse(response.json()['confirmation_required'])
        self.insert.assert_called_once_with('profiles', {'id': 'doctor-one', 'email': 'doctor@example.com', 'name': 'Dr Example', 'specialty': 'Cardiology'})

    def test_email_confirmation_preserves_profile_without_fake_login(self):
        self.signup.return_value = auth_response(confirmation=True)
        response = self.client.post('/api/auth/signup', json=self.signup_payload)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['confirmation_required'])
        self.assertIsNone(response.json()['access_token'])
        self.assertIsNone(response.json()['refresh_token'])
        self.delete_user.assert_not_called()
        self.insert.assert_called_once()

    def test_profile_failure_rolls_back_new_account(self):
        self.insert.side_effect = RuntimeError('private database error')
        response = self.client.post('/api/auth/signup', json=self.signup_payload)
        self.assertEqual((response.status_code, response.json()['code']), (400, 'signup_failed'))
        self.delete_user.assert_called_once_with('doctor-one')
        self.delete_profile.assert_called_once_with('doctor-one')
        self.assertNotIn('private', response.text)

    def test_duplicate_signup_never_deletes_existing_user(self):
        duplicate = auth_response(confirmation=True)
        duplicate.user.identities = []
        self.signup.return_value = duplicate
        self.assertEqual(self.client.post('/api/auth/signup', json=self.signup_payload).status_code, 400)
        self.delete_user.assert_not_called()
        self.delete_profile.assert_not_called()
        self.insert.assert_not_called()

    def test_existing_profile_never_overwritten_or_deleted(self):
        self.select.return_value = [{'id': 'doctor-one', 'name': 'Original doctor'}]
        self.assertEqual(self.client.post('/api/auth/signup', json=self.signup_payload).status_code, 400)
        self.insert.assert_not_called()
        self.delete_user.assert_not_called()
        self.delete_profile.assert_not_called()

    def test_concurrent_profile_conflict_preserves_existing_account(self):
        self.insert.side_effect = APIError({'message': 'Duplicate profile', 'code': '23505', 'details': None, 'hint': None})
        self.assertEqual(self.client.post('/api/auth/signup', json=self.signup_payload).status_code, 400)
        self.delete_user.assert_not_called()
        self.delete_profile.assert_not_called()

    def test_signup_requires_name_and_department(self):
        for payload in [
            {'email': 'doctor@example.com', 'password': 'test-password'},
            {**self.signup_payload, 'name': '   '},
            {**self.signup_payload, 'specialty': ''},
        ]:
            response = self.client.post('/api/auth/signup', json=payload)
            self.assertEqual((response.status_code, response.json()['code']), (422, 'validation_error'))
        self.signup.assert_not_called()

    def test_login_and_refresh_return_replacement_session(self):
        response = self.client.post('/api/auth/login', json={'email': 'doctor@example.com', 'password': 'test-password'})
        self.assertEqual(response.json()['refresh_token'], 'refresh-one')
        response = self.client.post('/api/auth/refresh', json={'refresh_token': 'refresh-one'})
        self.assertEqual((response.json()['access_token'], response.json()['refresh_token']), ('access-two', 'refresh-two'))
        self.assertEqual(response.json()['expires_in'], 3600)
        self.refresh.assert_called_once_with('refresh-one')

    def test_invalid_refresh_and_login_are_sanitized(self):
        self.refresh.side_effect = RuntimeError('private expired token details')
        response = self.client.post('/api/auth/refresh', json={'refresh_token': 'expired'})
        self.assertEqual((response.status_code, response.json()['code']), (401, 'session_expired'))
        self.assertNotIn('private', response.text)
        self.login.side_effect = RuntimeError('private provider error')
        response = self.client.post('/api/auth/login', json={'email': 'doctor@example.com', 'password': 'wrong'})
        self.assertEqual((response.status_code, response.json()['code']), (401, 'invalid_credentials'))

    def test_logout_requires_auth_and_revokes_callers_session(self):
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 401)
        self.logout.assert_not_called()
        response = self.client.post('/api/auth/logout', headers=self.headers)
        self.assertEqual(response.json(), {'message': 'Logged out'})
        self.logout.assert_called_once_with('access-one')

    def test_revoked_session_cannot_refresh(self):
        revoked = set()
        self.logout.side_effect = lambda access: revoked.add('refresh-one')
        def refresh(token):
            if token in revoked:
                raise ValueError('Revoked session')
            return auth_response()
        self.refresh.side_effect = refresh
        self.client.post('/api/auth/logout', headers=self.headers)
        self.assertEqual(self.client.post('/api/auth/refresh', json={'refresh_token': 'refresh-one'}).status_code, 401)

    def test_patient_sex_validation_and_doctor_assignment(self):
        for sex in ['male', 'female', 'other', None]:
            response = self.client.post('/api/patients', json={'name': 'Patient', 'sex': sex}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['doctor_id'], 'doctor-one')
        before = self.insert.call_count
        for sex in ['unknown', 'Male', 123]:
            response = self.client.post('/api/patients', json={'name': 'Patient', 'sex': sex}, headers=self.headers)
            self.assertEqual((response.status_code, response.json()['code']), (422, 'validation_error'))
        self.assertEqual(self.insert.call_count, before)


class PatientSummaryTests(unittest.TestCase):
    def setUp(self):
        self.rows = [{'id': f'c{i}', 'doctor_id': 'd1', 'patient_id': 'p1', 'status': 'saved', 'created_at': '2026-10-09T00:00:00Z'} for i in range(20)]
        self.patient = {'id': 'p1', 'name': 'Alex', 'age': 58, 'sex': 'male'}

    def test_list_has_patient_and_creation_time_with_two_queries(self):
        with patch.object(consultations.db, 'consultation_summaries', return_value=self.rows) as rows, patch.object(consultations.db, 'patient_summaries', return_value=[self.patient]) as patients:
            result = consultations.list_consultations('d1')
            self.assertEqual(len(result), 20)
            self.assertEqual(result[0]['patient'], self.patient)
            self.assertEqual(result[0]['created_at'], self.rows[0]['created_at'])
            rows.assert_called_once_with('d1', 50, 0)
            patients.assert_called_once_with('d1', ['p1'])

    def test_detail_and_foreign_doctor_isolation(self):
        with patch.object(consultations.db, 'select', return_value=[self.rows[0]]), patch.object(consultations.db, 'patient_summaries', return_value=[self.patient]) as patients:
            self.assertEqual(consultations.get_consultation_detail('d1', 'c0')['patient'], self.patient)
            patients.reset_mock()
            self.assertIsNone(consultations.get_consultation_detail('d2', 'c0'))
            patients.assert_not_called()

    def test_http_list_and_detail_include_summary_and_time(self):
        with patch.object(consultations.db, 'select', return_value=[self.rows[0]]), patch.object(consultations.db, 'consultation_summaries', return_value=self.rows), patch.object(consultations.db, 'patient_summaries', return_value=[self.patient]), patch('shared.auth.call.get_user', return_value=SimpleNamespace(user=SimpleNamespace(id='d1'))), TestClient(app) as client:
            headers = {'Authorization': 'Bearer test'}
            for route in ['/api/consultations', '/api/consultations/c0']:
                response = client.get(route, headers=headers)
                self.assertEqual(response.status_code, 200)
                row = response.json()[0] if isinstance(response.json(), list) else response.json()
                self.assertEqual(row['patient'], self.patient)
                self.assertEqual(row['created_at'], '2026-10-09T00:00:00Z')

    def test_empty_list_does_not_fetch_patients(self):
        with patch.object(consultations.db, 'consultation_summaries', return_value=[]), patch.object(consultations.db, 'patient_summaries') as patients:
            self.assertEqual(consultations.list_consultations('d1'), [])
            patients.assert_not_called()

    def test_sidebar_list_recovers_stale_processing_status(self):
        stale = {
            **self.rows[0],
            'status': 'processing',
            'processing_stage': 'writing_note',
            'last_processing_stage': 'structuring_note',
            'processing_error': None,
            'processing_started_at': '2000-01-01T00:00:00+00:00',
        }
        failed = {
            **stale,
            'status': 'failed',
            'processing_stage': 'failed',
            'processing_error': 'note_failed',
            'processing_started_at': None,
        }
        with patch.object(consultations.db, 'consultation_summaries', return_value=[stale]), patch.object(consultations.db, 'mutate_consultation', return_value=[failed]) as mutate, patch.object(consultations.db, 'patient_summaries', return_value=[self.patient]):
            result = consultations.list_consultations('d1')
        self.assertEqual(result[0]['status'], 'failed')
        mutate.assert_called_once_with(
            'c0',
            'd1',
            ['processing'],
            {
                'status': 'failed',
                'processing_stage': 'failed',
                'processing_error': 'note_failed',
                'processing_started_at': None,
            },
        )

    def test_patient_query_filters_doctor_and_only_requested_ids(self):
        query = Mock()
        query.select.return_value = query.eq.return_value = query.in_.return_value = query
        query.execute.return_value.data = [self.patient]
        with patch.object(db_provider.supabase, 'table', return_value=query):
            self.assertEqual(db_provider.patient_summaries('d1', ['p1']), [self.patient])
        query.select.assert_called_once_with('id,name,age,sex')
        query.eq.assert_called_once_with('doctor_id', 'd1')
        query.in_.assert_called_once_with('id', ['p1'])


class SupabaseSessionTests(unittest.TestCase):
    def test_installed_sdk_refresh_and_logout_over_mock_http(self):
        revoked = False
        def handle(request):
            nonlocal revoked
            if request.url.path.endswith('/logout'):
                self.assertEqual(request.headers['authorization'], 'Bearer access-one')
                self.assertEqual(request.url.params['scope'], 'local')
                revoked = True
                return httpx.Response(204)
            self.assertEqual(request.url.path, '/auth/v1/token')
            self.assertEqual(json.loads(request.content)['refresh_token'], 'refresh-one')
            if revoked:
                return httpx.Response(400, json={'error_code': 'refresh_token_not_found', 'msg': 'Refresh token revoked'})
            return httpx.Response(200, json={
                'access_token': 'access-two', 'refresh_token': 'refresh-two', 'token_type': 'bearer', 'expires_in': 3600,
                'user': {'id': 'doctor-one', 'aud': 'authenticated', 'email': 'doctor@example.com', 'app_metadata': {}, 'user_metadata': {}, 'created_at': '2026-10-09T00:00:00Z'},
            })
        transports = []
        real_client = httpx.Client
        def client_factory(**kwargs):
            client = real_client(transport=httpx.MockTransport(handle), **kwargs)
            transports.append(client)
            return client
        with patch.dict(os.environ, {'SUPABASE_URL': 'https://example.supabase.co', 'SUPABASE_ANON_KEY': 'test-anon-key', 'SUPABASE_SERVICE_ROLE_KEY': 'test-service-key'}), patch.object(auth_provider.httpx, 'Client', side_effect=client_factory):
            result = accounts.refresh_session('refresh-one')
            self.assertEqual(result['refresh_token'], 'refresh-two')
            accounts.logout_user('access-one')
            with self.assertRaises(Exception) as rejected:
                accounts.refresh_session('refresh-one')
            self.assertEqual(rejected.exception.status_code, 401)
            self.assertEqual(rejected.exception.detail['code'], 'session_expired')
        self.assertTrue(all(client.is_closed for client in transports))

    def test_provider_uses_explicit_refresh_and_logout_tokens(self):
        client = Mock()
        @contextmanager
        def context(admin=False):
            yield client
        with patch.object(auth_provider, '_client', side_effect=context) as factory:
            auth_provider.refresh('doctor-one-refresh')
            auth_provider.logout('doctor-two-access')
            auth_provider.delete_user('new-user-only')
        client.auth.refresh_session.assert_called_once_with('doctor-one-refresh')
        client.auth.admin.sign_out.assert_called_once_with('doctor-two-access', scope='local')
        client.auth.admin.delete_user.assert_called_once_with('new-user-only')
        self.assertEqual(factory.call_args_list[1].kwargs, {'admin': True})

    def test_auth_clients_are_independent_and_transport_is_closed(self):
        first, second = Mock(), Mock()
        with patch.object(auth_provider, 'create_client', side_effect=[first, second]) as factory, patch.object(auth_provider.httpx, 'Client') as transport:
            auth_provider.login('first@example.com', 'password')
            auth_provider.login('second@example.com', 'password')
        first.auth.sign_in_with_password.assert_called_once_with({'email': 'first@example.com', 'password': 'password'})
        second.auth.sign_in_with_password.assert_called_once_with({'email': 'second@example.com', 'password': 'password'})
        for call in factory.call_args_list:
            self.assertFalse(call.kwargs['options'].persist_session)
            self.assertFalse(call.kwargs['options'].auto_refresh_token)
        self.assertEqual(transport.return_value.__exit__.call_count, 2)
