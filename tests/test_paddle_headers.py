"""Başlık eşleştirmesi banka ve irsaliye bilgilerini fatura alanı saymamalı."""

import unittest

from ocr.paddle_headers import review_headers


def word(text, box):
    return {"text": text, "bbox": box}


class PaddleHeaderTests(unittest.TestCase):
    def resolve(self, labels, words, **previous):
        record = {
            "invoice_number": None,
            "invoice_date": None,
            "issues": [],
            **previous,
        }
        return review_headers(
            record, {"width": 1500, "lines": words, "raw_lines": labels}
        )

    def test_note_label_and_iban_cannot_replace_number(self):
        result = self.resolve(
            [
                word("Fatura Numarası", [970, 666, 1130, 690]),
                word("Fatura Notu", [124, 1436, 300, 1466]),
            ],
            [
                word("SIO2026000000171", [971, 686, 1168, 718]),
                word("IBANTR370006400000113460130575", [500, 1492, 1061, 1528]),
            ],
            invoice_number="IBANTR370006400000113460130575",
        )
        self.assertEqual(result["invoice_number"], "SIO2026000000171")

    def test_date_label_ocr_typo_is_matched_without_changing_value(self):
        result = self.resolve(
            [word("Fatura Tarlhi:", [1002, 570, 1151, 594])],
            [word("19-10-2026", [1197, 570, 1315, 595])],
        )
        self.assertEqual(result["invoice_date"], "2026-10-19")

    def test_delivery_label_does_not_supply_invoice_number(self):
        result = self.resolve(
            [word("İrsaliye Fatura No:", [100, 100, 300, 130])],
            [word("ABC2026000000123", [320, 100, 500, 130])],
        )
        self.assertIsNone(result["invoice_number"])

    def test_conflicting_invoice_labels_require_manual_review(self):
        result = self.resolve(
            [
                word("Fatura No:", [100, 100, 250, 130]),
                word("Fatura No:", [100, 300, 250, 330]),
            ],
            [
                word("ABC2026000000123", [300, 100, 500, 130]),
                word("XYZ2026000000123", [300, 300, 500, 330]),
            ],
        )
        self.assertIsNone(result["invoice_number"])

    def test_invalid_date_and_unlabelled_scan_timestamp_are_rejected(self):
        result = self.resolve(
            [word("Fatura Tarihi:", [100, 500, 300, 530])],
            [
                word("20.10.2026", [100, 30, 250, 60]),
                word("31.02.2026", [320, 500, 500, 530]),
            ],
        )
        self.assertIsNone(result["invoice_date"])
