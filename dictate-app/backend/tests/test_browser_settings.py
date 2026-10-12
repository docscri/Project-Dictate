import unittest

from fastapi.testclient import TestClient

from main import app


class BrowserSettingsTests(unittest.TestCase):
    def test_local_frontends_can_send_authenticated_requests(self):
        with TestClient(app) as client:
            for origin in ["http://localhost:5173", "http://127.0.0.1:5173"]:
                for method in ["GET", "POST", "PUT", "DELETE"]:
                    response = client.options("/api/consultations", headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": method,
                        "Access-Control-Request-Headers": "authorization,content-type",
                    })
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers["access-control-allow-origin"], origin)
                    self.assertNotIn("access-control-allow-credentials", response.headers)

    def test_unknown_frontend_origin_is_not_allowed(self):
        with TestClient(app) as client:
            response = client.options("/api/consultations", headers={
                "Origin": "https://unconfigured.example",
                "Access-Control-Request-Method": "POST",
            })
            self.assertEqual(response.status_code, 400)
            self.assertNotIn("access-control-allow-origin", response.headers)

    def test_browser_can_read_authentication_errors(self):
        with TestClient(app) as client:
            response = client.get("/api/consultations", headers={"Origin": "http://localhost:5173"})
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()["code"], "unauthorized")
            self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:5173")

    def test_other_methods_and_headers_are_rejected(self):
        with TestClient(app) as client:
            for method, header in [("PATCH", "authorization"), ("POST", "x-unconfigured-header")]:
                response = client.options("/api/consultations", headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": method,
                    "Access-Control-Request-Headers": header,
                })
                self.assertEqual(response.status_code, 400)
