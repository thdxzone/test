"""Mükerrer numaralar aynı yazma işleminde engellenir; OCR hatası düzeltilebilir."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
import tempfile
import threading
import unittest

from invoice import run
from storage import Store, DuplicateInvoice, invoice_key

ROOT = Path(__file__).resolve().parents[1]


class DuplicateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.store = Store(self.directory.name)
        self.record = run(ROOT / "examples/multi_page.pdf")
        self.record["invoice_number"] = "ABC2026000000001"

    def add(self, identifier, record=None):
        self.store.create(identifier, "fatura.pdf", "application/pdf")
        self.store.analyzed(identifier, record or self.record)
        return self.store.get(identifier)

    def test_same_number_is_excluded_from_list(self):
        self.add("a" * 32)
        second = self.add("b" * 32)
        self.assertEqual(second["status"], "duplicate")
        self.assertEqual(second["duplicate_of"], "a" * 32)
        self.assertEqual(len(self.store.list()), 1)
        self.assertEqual(
            second["original"]["invoice_number"], self.record["invoice_number"]
        )

    def test_case_and_spaces_match_but_letter_and_digit_do_not(self):
        self.add("a" * 32)
        value = deepcopy(self.record)
        value["invoice_number"] = " abc 2026000000001 "
        self.assertEqual(self.add("b" * 32, value)["status"], "duplicate")
        self.assertNotEqual(invoice_key("ABC2026"), invoice_key("4BC2026"))

    def test_manual_edit_conflict_is_not_saved_or_approved(self):
        first = self.add("a" * 32)
        value = deepcopy(self.record)
        value["invoice_number"] = "XYZ2026000000001"
        other = self.add("b" * 32, value)
        for approved in (False, True):
            with self.assertRaises(DuplicateInvoice) as raised:
                self.store.save(other["id"], self.record, other["revision"], approved)
            self.assertEqual(raised.exception.identifier, first["id"])
        self.assertEqual(self.store.get(other["id"])["edited"], value)
        with self.store.connect() as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM approvals").fetchone()[0], 0
            )

    def test_ocr_number_correction_restores_rejected_document(self):
        self.add("a" * 32)
        duplicate = self.add("b" * 32)
        corrected = deepcopy(self.record)
        corrected["invoice_number"] = "ABC2026000000002"
        saved = self.store.save(duplicate["id"], corrected, duplicate["revision"])
        self.assertEqual(saved["status"], "review")
        self.assertIsNone(saved["duplicate_of"])
        self.assertEqual(len(self.store.list()), 2)
        self.assertEqual(
            saved["original"]["invoice_number"], self.record["invoice_number"]
        )

    def test_missing_number_does_not_create_false_duplicate(self):
        value = deepcopy(self.record)
        value["invoice_number"] = None
        self.add("a" * 32, value)
        self.assertEqual(self.add("b" * 32, value)["status"], "review")

    def test_deleted_number_can_be_uploaded_again_and_self_edit_is_allowed(self):
        first = self.add("a" * 32)
        saved = self.store.save(first["id"], self.record, first["revision"])
        self.store.delete(first["id"], saved["revision"])
        self.assertEqual(self.add("b" * 32)["status"], "review")

    def test_simultaneous_uploads_cannot_both_enter_list(self):
        ids = ["a" * 32, "b" * 32]
        for identifier in ids:
            self.store.create(identifier, "fatura.pdf", "application/pdf")
        barrier = threading.Barrier(2)

        def analyze(identifier):
            barrier.wait()
            self.store.analyzed(identifier, self.record)

        with ThreadPoolExecutor(max_workers=2) as executor:
            list(executor.map(analyze, ids))
        self.assertEqual(
            sorted(self.store.get(i)["status"] for i in ids), ["duplicate", "review"]
        )
        self.assertEqual(len(self.store.list()), 1)


if __name__ == "__main__":
    unittest.main()
