import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
from main import app
from shared.security import get_current_user
from shared.db.providers import supabase as provider
from shared.ai_gateway.models.llm.gemini import parse_response


class PaginationTests(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id='doctor-one')
        self.addCleanup(app.dependency_overrides.clear)

    def test_route_passes_bounded_page_and_owner(self):
        with patch('modules.consultations.routes.list_consultations', return_value=[]) as listing, TestClient(app) as client:
            response = client.get('/api/consultations?limit=25&offset=100')
            self.assertEqual(response.status_code, 200)
            listing.assert_called_once_with('doctor-one', 25, 100)

    def test_invalid_page_parameters_are_rejected(self):
        with patch('modules.consultations.routes.list_consultations') as listing, TestClient(app) as client:
            for query in ['limit=0', 'limit=101', 'offset=-1']:
                with self.subTest(query=query):
                    response = client.get('/api/consultations?' + query)
                    self.assertEqual(response.status_code, 422)
                    self.assertEqual(response.json()['code'], 'validation_error')
            listing.assert_not_called()

    def test_summary_query_limits_payload_and_orders_equal_dates(self):
        query = Mock()
        for method in ['select', 'eq', 'order', 'range']:
            getattr(query, method).return_value = query
        query.execute.return_value = SimpleNamespace(data=[{'id': 'c1'}])
        with patch.object(provider.supabase, 'table', return_value=query) as table:
            self.assertEqual(provider.consultation_summaries('doctor-one', 25, 100), [{'id': 'c1'}])
        table.assert_called_once_with('consultations')
        query.select.assert_called_once_with('id,doctor_id,patient_id,status,created_at,processing_started_at,processing_stage,processing_error,last_processing_stage')
        query.eq.assert_called_once_with('doctor_id', 'doctor-one')
        self.assertEqual(query.order.call_args_list[0].args, ('created_at',))
        self.assertEqual(query.order.call_args_list[1].args, ('id',))
        query.range.assert_called_once_with(100, 124)


class ProviderResponseTests(unittest.TestCase):
    def test_empty_provider_responses_are_rejected(self):
        for value in [None, '', '   ']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_response(value)

    def test_valid_sections_remain_strings(self):
        result = parse_response('{"sections":{"subjective":"Reported symptom","objective":"","assessment":"","plan":""}}')
        self.assertEqual(result['sections']['subjective'], 'Reported symptom')
        self.assertTrue(all(isinstance(value, str) for value in result['sections'].values()))
