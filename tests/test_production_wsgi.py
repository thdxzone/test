"""Üretim giriş koruması, kaynak denetimi ve mevcut fatura API'sini birlikte sınar."""

import base64
import io
import json
from pathlib import Path
import tempfile
import unittest
from wsgiref.util import setup_testing_defaults

from app import Application
from production import InstanceLock, ProductionApp, Settings


class ProductionWSGITests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.settings = Settings(
            "https://fatura.example.com",
            "admin",
            "test-password-is-long-enough",
            Path(directory.name),
        )
        self.app = Application(directory.name, reader="prototype")
        self.addCleanup(self.app.executor.shutdown)
        self.wsgi = ProductionApp(self.app, self.settings)
        encoded = base64.b64encode(b"admin:test-password-is-long-enough").decode()
        self.auth = "Basic " + encoded

    def request(
        self,
        path="/",
        method="GET",
        body=b"",
        auth=True,
        host="fatura.example.com",
        **headers
    ):
        environ = {}
        setup_testing_defaults(environ)
        environ.update(
            REQUEST_METHOD=method,
            PATH_INFO=path,
            HTTP_HOST=host,
            CONTENT_LENGTH=str(len(body)),
            **{"wsgi.input": io.BytesIO(body)}
        )
        if auth:
            environ["HTTP_AUTHORIZATION"] = self.auth
        environ.update(
            {
                "HTTP_" + key.upper().replace("-", "_"): value
                for key, value in headers.items()
            }
        )
        captured = {}

        def respond(status, response_headers):
            captured["status"] = int(status.split()[0])
            captured["headers"] = dict(response_headers)

        captured["body"] = b"".join(self.wsgi(environ, respond))
        return captured

    def test_auth_protects_html_api_and_source(self):
        for path in [
            "/",
            "/app.js",
            "/api/documents",
            "/api/documents/" + "a" * 32 + "/source",
        ]:
            result = self.request(path, auth=False)
            self.assertEqual(result["status"], 401)
            self.assertIn("WWW-Authenticate", result["headers"])
            self.assertNotIn(b"FATURA_ADMIN_PASSWORD", result["body"])
        for value in [
            "Bearer anything",
            "Basic ???",
            "Basic " + base64.b64encode(b"admin:wrong").decode(),
        ]:
            self.assertEqual(self.request(Authorization=value)["status"], 401)

    def test_health_is_anonymous_and_read_only_for_container(self):
        result = self.request("/health", auth=False, host="127.0.0.1:8765")
        self.assertEqual(result["status"], 200)
        self.assertEqual(json.loads(result["body"]), {"status": "ok"})
        self.assertEqual(
            self.request("/api/documents", host="127.0.0.1:8765")["status"], 403
        )
        self.assertEqual(
            self.request("/health", method="HEAD", auth=False, host="localhost:8765")[
                "body"
            ],
            b"",
        )

    def test_domain_and_origin_are_not_taken_from_forwarded_headers(self):
        self.assertEqual(
            self.request(
                host="evil.example", **{"X-Forwarded-Host": "fatura.example.com"}
            )["status"],
            403,
        )
        self.assertEqual(
            self.request(
                "/api/services",
                method="POST",
                body=b"{}",
                Origin="https://evil.example",
            )["status"],
            403,
        )
        self.assertEqual(
            self.request(**{"Sec-Fetch-Site": "cross-site"})["status"], 403
        )
        self.assertEqual(
            self.request(Origin="https://fatura.example.com")["status"], 200
        )

    def test_existing_html_and_json_work_after_authentication(self):
        result = self.request()
        self.assertEqual(result["status"], 200)
        self.assertIn(b"T\xc3\xbcrkiye Hastanesi", result["body"])
        self.assertEqual(self.request("/api/documents")["status"], 200)
        self.assertEqual(
            json.loads(self.request("/api/documents")["body"])["documents"], []
        )
        self.assertEqual(self.request("/app.js", method="HEAD")["body"], b"")
        self.assertIn("Content-Security-Policy", result["headers"])
        self.assertIn("Strict-Transport-Security", result["headers"])

    def test_post_and_validation_use_shared_endpoints(self):
        result = self.request(
            "/api/services",
            method="POST",
            body=json.dumps(
                {"description": "Yeni hizmet", "institution": "Sinerji"}
            ).encode(),
        )
        self.assertEqual(result["status"], 201)
        self.assertEqual(json.loads(result["body"])["description"], "Yeni hizmet")
        self.assertEqual(
            self.request("/api/services", method="POST", body=b"not json")["status"],
            400,
        )
        self.assertEqual(self.request("/api/documents", method="DELETE")["status"], 405)

    def test_missing_or_insecure_configuration_fails_closed(self):
        for url in [
            "",
            "http://fatura.example.com",
            "https://user:pass@fatura.example.com",
            "https://fatura.example.com/path",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                Settings(url, "admin", "a" * 32)
        with self.assertRaises(ValueError):
            Settings("https://fatura.example.com", "admin", "short")
        self.assertNotIn(self.settings.password, repr(self.settings))

    def test_internal_http_requires_explicit_flag_and_a_private_ip(self):
        for url in ["http://10.21.41.219:8765", "http://127.0.0.1:8765"]:
            with self.assertRaises(ValueError):
                Settings(url, "admin", "a" * 32)
            settings = Settings(url, "admin", "a" * 32, allow_private_http=True)
            host = url.split("://")[1]
            self.assertTrue(
                settings.trusted({"Host": host, "Origin": url}, "POST", "/api/uploads")
            )
        for url in ["http://8.8.8.8:8765", "http://example.com", "http://203.0.113.5"]:
            with self.assertRaises(ValueError):
                Settings(url, "admin", "a" * 32, allow_private_http=True)

    def test_another_instance_cannot_reset_active_processing(self):
        first = InstanceLock(self.settings.data_dir)
        self.addCleanup(first.close)
        with self.assertRaises(RuntimeError):
            InstanceLock(self.settings.data_dir)


class OCRPlatformTests(unittest.TestCase):
    def test_arm_linux_uses_safe_single_thread_without_changing_mac_default(self):
        from unittest.mock import Mock, patch
        from types import SimpleNamespace
        from ocr.paddle_reader import PaddleBackend
        import os

        factory = Mock()
        with patch.dict(
            "sys.modules", {"paddleocr": SimpleNamespace(PaddleOCR=factory)}
        ), patch.dict(os.environ, {}, clear=True):
            with patch("platform.system", return_value="Linux"), patch(
                "platform.machine", return_value="aarch64"
            ):
                PaddleBackend()
                self.assertEqual(factory.call_args.kwargs["cpu_threads"], 1)
            with patch("platform.system", return_value="Darwin"):
                PaddleBackend()
                self.assertEqual(factory.call_args.kwargs["cpu_threads"], 10)
            with patch.dict(os.environ, {"FATURA_OCR_CPU_THREADS": "0"}):
                with self.assertRaises(ValueError):
                    PaddleBackend()

    def test_quantity_recognizer_obeys_the_same_cpu_limit(self):
        from unittest.mock import Mock, patch
        from types import SimpleNamespace
        from PIL import Image, ImageDraw, ImageFont
        from ocr.paddle_reader import PaddleBackend

        backend = object.__new__(PaddleBackend)
        backend.cpu_threads = 1
        recognition = Mock()
        recognition.return_value.predict.return_value = [
            {"rec_text": "1", "rec_score": 0.99},
            {"rec_text": "1", "rec_score": 0.99},
        ]
        image = Image.new("RGB", (100, 70), "white")
        ImageDraw.Draw(image).text(
            (20, 10), "1", font=ImageFont.load_default(size=40), fill="black"
        )
        with patch.dict(
            "sys.modules", {"paddleocr": SimpleNamespace(TextRecognition=recognition)}
        ):
            value = backend.recognize_quantity(image)
        self.assertEqual(recognition.call_args.kwargs["cpu_threads"], 1)
        self.assertEqual(value[0]["text"], "1")
