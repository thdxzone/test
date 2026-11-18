"""Çok faturali PDF'nin sayfa sırasını ve kayıt bütünlüğünü doğrular."""

from contextlib import closing
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import pypdfium2 as pdfium
from reportlab.pdfgen.canvas import Canvas

from app import Application
from extraction_service import empty_record


def invoice_pdf(count=4):
    output = BytesIO()
    canvas = Canvas(output, pagesize=(300, 400))
    for index in range(count):
        canvas.drawString(30, 340, f"Invoice PAGE-{index + 1}")
        canvas.drawString(30, 300, f"Amount: {100 * (index + 1)}")
        canvas.showPage()
    canvas.save()
    return output.getvalue()


class PdfBatchTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.app = Application(temporary.name)
        self.addCleanup(self.app.executor.shutdown)

    def test_four_pages_have_separate_files_in_original_order(self):
        data = invoice_pdf()
        with patch.object(self.app.executor, "submit") as queue:
            result = self.app.accept_upload(data, "4-fatura.pdf", split=True)
        documents = result["documents"]
        self.assertEqual(len(documents), 4)
        self.assertEqual(result["id"], documents[0]["id"])
        self.assertEqual(
            [call.args[1] for call in queue.call_args_list],
            [d["id"] for d in documents],
        )
        self.assertEqual([d["batch_page"] for d in documents], [1, 2, 3, 4])
        with pdfium.PdfDocument(data) as original:
            for index, document in enumerate(documents):
                with pdfium.PdfDocument(self.app.store.file(document["id"])) as split:
                    self.assertEqual(len(split), 1)
                    with closing(split[0]) as page, closing(original[index]) as source:
                        with closing(page.get_textpage()) as text:
                            self.assertIn(f"PAGE-{index + 1}", text.get_text_range())
                        # Piksel karşılaştırması: metin, çizim ve yerleşim değişmemeli.
                        a, b = page.render(scale=0.5), source.render(scale=0.5)
                        try:
                            self.assertEqual(a.to_pil().tobytes(), b.to_pil().tobytes())
                        finally:
                            a.close()
                            b.close()
        self.assertEqual(len(self.app.store.batch(result["batch_id"])), 4)

    def test_pages_are_read_sequentially_and_failure_does_not_stop_queue(self):
        read = []

        def reader(path, mime):
            with pdfium.PdfDocument(path) as document, closing(document[0]) as page:
                with closing(page.get_textpage()) as text:
                    value = text.get_text_range()
            read.append(value)
            if "PAGE-2" in value:
                raise ValueError("İkinci sayfa okunamadı")
            record = empty_record()
            record["invoice_number"] = f"BATCH-{len(read)}"
            return record

        with patch("app.analyze_paddle", side_effect=reader), self.assertLogs("fatura"):
            result = self.app.accept_upload(invoice_pdf(), "faturalar.pdf", split=True)
            self.app.executor.shutdown(wait=True)
        self.assertEqual(len(read), 4)
        for index, text in enumerate(read, start=1):
            self.assertIn(f"PAGE-{index}", text)
        saved = [self.app.store.get(d["id"]) for d in result["documents"]]
        self.assertTrue(saved[1]["error"])
        self.assertIsNone(saved[3]["error"])
        self.assertTrue(all(d["status"] == "review" for d in saved))

    def test_invalid_pdf_leaves_no_partial_documents(self):
        for data in (b"%PDF-broken", invoice_pdf(1), invoice_pdf(31)):
            with self.subTest(length=len(data)), self.assertRaises(ValueError):
                self.app.accept_upload(data, "invalid.pdf", split=True)
            self.assertEqual(self.app.store.list(), [])
            self.assertEqual(list((self.app.store.root / "files").iterdir()), [])

    def test_existing_record_is_replaced_atomically_and_stale_split_is_rejected(self):
        data = invoice_pdf()
        with patch.object(self.app.executor, "submit"):
            original = self.app.accept_upload(data, "original.pdf")
        self.app.store.analyzed(original["id"], empty_record())
        original = self.app.store.get(original["id"])
        replaced = (original["id"], original["revision"])
        with patch.object(self.app.executor, "submit") as queue:
            result = self.app.accept_batch(data, "original.pdf", replaced)
            self.assertEqual(queue.call_count, 4)
            with self.assertRaises(ValueError):
                self.app.accept_batch(data, "original.pdf", replaced)
            self.assertEqual(queue.call_count, 4)
        self.assertIsNone(self.app.store.get(original["id"]))
        self.assertTrue(self.app.store.file(original["id"]).exists())
        self.assertEqual(len(self.app.store.list()), 4)
        self.assertEqual(len(list((self.app.store.root / "files").iterdir())), 5)
        self.assertEqual(len(self.app.store.batch(result["batch_id"])), 4)
