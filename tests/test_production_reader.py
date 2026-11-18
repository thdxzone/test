"""Ana uygulama PaddleOCR'ı kullanmalı; başarısız okumayı onaylamamalı."""

from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from app import Application
from extraction_service import empty_record
from model_runtime import analyze_paddle


class ProductionReaderTests(unittest.TestCase):
    def test_photo_upload_is_rejected_without_creating_a_document(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Application(directory)
            self.addCleanup(app.executor.shutdown)
            with self.assertRaises(ValueError):
                app.accept_upload(b"\xff\xd8\xffphoto", "fatura.jpg")
            self.assertEqual(app.store.list(), [])
            self.assertEqual(list((Path(directory) / "files").iterdir()), [])

    def test_pdf_upload_queues_default_reader(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Application(directory)
            self.addCleanup(app.executor.shutdown)
            with patch.object(app.executor, "submit") as queue:
                doc = app.accept_upload(b"%PDF-1.4\n", "fatura.pdf")
            self.assertEqual(doc["mime"], "application/pdf")
            self.assertEqual(app.store.file(doc["id"]).read_bytes(), b"%PDF-1.4\n")
            queue.assert_called_once_with(app.process, doc["id"])

    def test_production_default_uses_paddle_and_leaves_result_for_review(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Application(directory)
            self.addCleanup(app.executor.shutdown)
            doc = app.store.create("a" * 32, "fatura.pdf", "application/pdf")
            result = empty_record()
            result["reader"] = "paddle"
            with patch("app.analyze_paddle", return_value=result) as paddle, patch(
                "app.analyze"
            ) as old:
                app.process(doc["id"])
            paddle.assert_called_once_with(app.store.file(doc["id"]), "application/pdf")
            old.assert_not_called()
            saved = app.store.get(doc["id"])
            self.assertEqual(saved["status"], "review")
            self.assertEqual(saved["edited"]["reader"], "paddle")
            self.assertIsNone(saved["approved_at"])

    def test_failed_paddle_does_not_silently_use_old_engine(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Application(directory)
            self.addCleanup(app.executor.shutdown)
            doc = app.store.create("c" * 32, "fatura.pdf", "application/pdf")
            with patch("app.analyze_paddle", side_effect=RuntimeError("model")), patch(
                "app.analyze"
            ) as old, self.assertLogs("fatura"):
                app.process(doc["id"])
            old.assert_not_called()
            saved = app.store.get(doc["id"])
            self.assertEqual(saved["status"], "review")
            self.assertTrue(saved["error"])
            self.assertIsNone(saved["approved_at"])

    def test_failed_worker_cannot_reuse_stale_result(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            source.touch()
            stale = source.parent / "paddle-result.json"
            stale.write_text('{"reader":"paddle"}')
            with patch(
                "model_runtime.model_python", return_value=Path("/unused/python")
            ), patch(
                "model_runtime.subprocess.run",
                side_effect=subprocess.CalledProcessError(1, "worker"),
            ):
                with self.assertRaises(subprocess.CalledProcessError):
                    analyze_paddle(source, "application/pdf")
            self.assertFalse(stale.exists())
