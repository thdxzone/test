"""Yeni fatura eşleştirmesini ve geçmişi bozmayan mali analiz kurallarını sınar."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from service_analysis import Services, period_from_note, ratio


class ServiceAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.services = Services(self.temp.name)
        source = {
            "years": [2025, 2026],
            "imported_date": "2026-11-17",
            "baseline_invoice_numbers": ["OLD001"],
            "rows": [
                {
                    "id": "excel-row-5",
                    "institution": "Sinerji",
                    "description": "Ekinoks",
                    "amounts": {"2025": "8320", "2026": "8320"},
                    "rates": {},
                    "total_increase": None,
                    "invoice_count": 10,
                    "service_type": "Bitti",
                    "note": "2025 Kasım ayında başladı. 2026 Ekim ayında bitti",
                }
            ],
        }
        Services.write(self.services.root / "increase-analysis.json", source)
        self.started = self.services.config()["started_at"]

    def doc(self, number="NEW001", amount="9000", status="approved", when="2026-11-18"):
        return {
            "id": number,
            "status": status,
            "created_at": self.started,
            "updated_at": self.started,
            "edited": {
                "seller": {"name": "Sinerji Bilgisayar"},
                "currency": "TRY",
                "invoice_number": number,
                "invoice_date": when,
                "items": [{"name": "Hizmet", "description": "Ekinoks hizmet bedeli"}],
                "totals": {"gross": amount},
            },
        }

    def row(self, docs):
        return self.services.analysis(docs)["rows"][0]

    def test_service_edit_preserves_source_and_recalculates_analysis(self):
        source = self.services.reference()
        current = self.row([self.doc()])
        edited = current["editable"]
        self.assertEqual(edited["invoice_count"], 10)
        self.assertEqual(edited["amounts"]["2026"], "8320")
        edited.update(
            description="Ekinoks hizmeti",
            institution="Sinerji",
            amounts={"2025": "10000", "2026": "12000"},
            invoice_count=12,
            service_type="Devam ediyor",
            note="Güncellendi",
        )
        self.services.update(
            current["id"],
            {
                "record": edited,
                "revision": current["edit_revision"],
            },
        )
        reloaded = Services(self.temp.name)
        result = reloaded.analysis([])["rows"][0]
        self.assertEqual(result["description"], "Ekinoks hizmeti")
        self.assertEqual(result["rates"]["2026"], "0.2000")
        self.assertEqual(result["total_increase"], "0.2000")
        self.assertEqual(result["invoice_count"], 12)
        self.assertEqual(result["lifecycle"], "active")
        self.assertEqual(reloaded.reference(), source)
        self.assertNotIn("editable", reloaded.rows()[0])

    def test_start_date_overrides_note_and_can_be_cleared(self):
        current = self.row([])
        self.assertEqual(current["start_period"], "2025-11")
        self.services.update(
            current["id"],
            {
                "record": current["editable"] | {"start_date": "2024-03-15"},
                "revision": current["edit_revision"],
            },
        )
        current = Services(self.temp.name).analysis([])["rows"][0]
        self.assertEqual(current["start_period"], "2024-03")
        self.assertEqual(current["start_date"], "2024-03-15")
        self.services.update(
            current["id"],
            {
                "record": current["editable"] | {"start_date": ""},
                "revision": current["edit_revision"],
            },
        )
        self.assertIsNone(self.row([])["start_period"])
        self.assertIsNone(self.row([])["start_date"])

    def test_invalid_start_date_does_not_change_service(self):
        current = self.row([])
        original = self.services.settings.read_text()
        for value in ("2026-02-30", "2026-11", True, "20261118"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.services.update(
                    current["id"],
                    {
                        "record": current["editable"] | {"start_date": value},
                        "revision": current["edit_revision"],
                    },
                )
        self.assertEqual(self.services.settings.read_text(), original)

    def test_end_date_is_saved_and_cannot_precede_start(self):
        current = self.row([])
        payload = {
            "record": current["editable"]
            | {
                "service_type": "Bitti",
                "start_date": "2025-01-15",
                "end_date": "2026-10-20",
            },
            "revision": current["edit_revision"],
        }
        self.services.update(current["id"], payload)
        current = Services(self.temp.name).analysis([])["rows"][0]
        self.assertEqual(current["end_date"], "2026-10-20")
        self.assertEqual(current["end_period"], "2026-10")
        original = self.services.settings.read_text()
        for invalid in ("2024-12-31", "2026-02-30", True):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.services.update(
                    current["id"],
                    {
                        "record": current["editable"] | {"end_date": invalid},
                        "revision": current["edit_revision"],
                    },
                )
        self.assertEqual(self.services.settings.read_text(), original)

    def test_annual_payments_add_after_manual_period_without_double_counting(self):
        current = self.row([])
        self.services.update(
            current["id"],
            {
                "record": current["editable"]
                | {
                    "yearly_payments": {
                        "2025": {
                            "invoice_count": 10,
                            "total": "140000",
                            "through_date": "2025-12-31",
                        },
                        "2026": {
                            "invoice_count": 2,
                            "total": "10000",
                            "through_date": "2026-02-28",
                        },
                    }
                },
                "revision": current["edit_revision"],
            },
        )
        docs = [
            self.doc("OLD-PDF", "1000", when="2025-12-31"),
            self.doc("COVERED", "5000", when="2026-02-28"),
            self.doc("NEW-A", "100.10", when="2026-03-01"),
            self.doc("NEW-B", "200.20", when="2026-04-01"),
            self.doc("WAITING", "999", status="review", when="2026-05-01"),
            self.doc("DELETED", "999", status="deleted", when="2026-06-01"),
            self.doc("DUPLICATE", "999", status="duplicate", when="2026-06-01"),
            self.doc("UNDATED", "999", when=None),
        ]
        docs.append(deepcopy(docs[2]))
        row = self.row(docs)
        annual = {p["year"]: p for p in row["annual_payments"]}
        self.assertEqual(annual[2025]["invoice_count"], 10)
        self.assertEqual(annual[2025]["total"], "140000")
        self.assertEqual(annual[2026]["invoice_count"], 5)
        self.assertEqual(annual[2026]["total"], "10300.30")
        self.assertEqual(annual[2026]["pending_count"], 1)
        self.assertEqual(annual[2026]["covered_count"], 1)
        self.assertEqual(row["undated_payment_count"], 1)
        self.assertEqual(row["amounts"]["2026"], "8320")
        self.assertEqual(
            Services(self.temp.name).rows()[0]["yearly_payments"]["2025"][
                "invoice_count"
            ],
            10,
        )

    def test_annual_payments_recalculate_after_invoice_edit_or_deletion(self):
        docs = [self.doc("A", "100.10"), self.doc("B", "200.20")]
        self.assertEqual(self.row(docs)["annual_payments"][0]["total"], "300.30")
        docs[0]["edited"]["invoice_date"] = "2027-01-01"
        docs[1]["status"] = "deleted"
        annual = self.row(docs)["annual_payments"]
        self.assertEqual(len(annual), 1)
        self.assertEqual(annual[0]["year"], 2027)
        self.assertEqual(annual[0]["total"], "100.10")

    def test_invalid_manual_payment_does_not_overwrite_data(self):
        current = self.row([])
        original = self.services.settings.read_text()
        valid = {"invoice_count": 10, "total": "140000", "through_date": "2025-12-31"}
        for changes in (
            {"invoice_count": -1},
            {"total": "NaN"},
            {"total": None},
            {"through_date": "2026-01-01"},
            {"through_date": "2025-02-30"},
        ):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.services.update(
                    current["id"],
                    {
                        "record": current["editable"]
                        | {"yearly_payments": {"2025": valid | changes}},
                        "revision": current["edit_revision"],
                    },
                )
            self.assertEqual(self.services.settings.read_text(), original)

    def test_service_edit_keeps_linked_invoices_and_latest_amount(self):
        doc = self.doc()
        doc["edited"]["service_id"] = "excel-row-5"
        current = self.row([doc])
        edited = current["editable"]
        edited["description"] = "Yeni hizmet adı"
        edited["invoice_count"] = 15
        self.services.update(
            current["id"],
            {
                "record": edited,
                "revision": current["edit_revision"],
            },
        )
        result = self.row([doc])
        self.assertEqual(result["invoice_count"], 16)
        self.assertEqual(result["amounts"]["2026"], "9000")
        self.assertEqual(result["history"][0]["id"], doc["id"])

    def test_service_edit_rejects_invalid_and_stale_data_without_writing(self):
        current = self.row([])
        original = self.services.settings.read_text()
        cases = [
            {"invoice_count": -1},
            {"invoice_count": True},
            {"description": ""},
            {"single_date": "2026-02-30"},
            {"amounts": {"2025": "NaN", "2026": "100"}},
            {"amounts": {"2025": "100"}},
            {"unit_price": "-1"},
        ]
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.services.update(
                    current["id"],
                    {
                        "record": current["editable"] | changes,
                        "revision": current["edit_revision"],
                    },
                )
            self.assertEqual(self.services.settings.read_text(), original)
        with self.assertRaises(ValueError):
            self.services.update(
                current["id"],
                {
                    "record": current["editable"],
                    "revision": "old",
                },
            )
        self.assertEqual(self.services.settings.read_text(), original)

    def test_paid_on_upload_but_price_waits_for_approval(self):
        pending = self.doc(status="review")
        row = self.row([pending])
        self.assertEqual(row["invoice_count"], 11)
        self.assertTrue(row["history"][0]["paid"])
        self.assertIsNone(row["history"][0]["payment_date"])
        self.assertEqual(row["amounts"]["2026"], "8320")
        pending["status"] = "approved"
        row = self.row([pending])
        self.assertEqual(row["amounts"]["2026"], "9000")
        self.assertEqual(row["rates"]["2026"], "0.0817")

    def test_reference_and_duplicate_uploads_not_counted_twice(self):
        first = self.doc("OLD001")
        duplicate = deepcopy(first)
        duplicate["id"] = "second-upload"
        self.assertEqual(self.row([first, duplicate])["invoice_count"], 10)
        self.assertEqual(len(self.row([first, duplicate])["history"]), 1)
        first["status"] = "deleted"
        self.assertEqual(len(self.row([first])["history"]), 0)

    def test_old_pdf_does_not_replace_source_last_price(self):
        row = self.row([self.doc(when="2026-02-01", amount="5000")])
        self.assertEqual(row["amounts"]["2026"], "8320")

    def test_actual_invoice_date_orders_new_prices(self):
        a = self.doc("A", "10000", when="2027-05-01")
        b = self.doc("B", "9000", when="2027-02-01")
        self.assertEqual(self.row([a, b])["amounts"]["2027"], "10000")

    def test_existing_documents_excluded_unless_explicitly_linked(self):
        doc = self.doc()
        doc["created_at"] = "2020-01-01"
        self.assertEqual(self.row([doc])["invoice_count"], 10)
        doc["edited"]["service_id"] = "excel-row-5"
        self.assertEqual(self.row([doc])["invoice_count"], 11)

    def test_ambiguous_descriptions_require_selection(self):
        self.services.create({"description": "Protein TSS", "institution": "Sinerji"})
        record = self.doc()["edited"]
        record["items"][0]["description"] = "Ekinoks ve Protein TSS hizmet bedeli"
        match = self.services.match(record)
        self.assertIsNone(match["id"])
        self.assertEqual(match["method"], "ambiguous")

    def test_vendor_and_currency_are_separate(self):
        record = self.doc()["edited"]
        record["currency"] = "USD"
        self.assertIsNone(self.services.match(record)["id"])
        record["currency"] = "TRY"
        record["seller"]["name"] = "Başka firma"
        self.assertIsNone(self.services.match(record)["id"])
        record["service_id"] = "excel-row-5"
        record["currency"] = "USD"
        with self.assertRaises(ValueError):
            self.services.validate_link(record)

    def test_new_service_full_institution_and_latest_price(self):
        row = self.services.create(
            {"description": "Yazılım desteği", "institution": "ABC Bilişim Ltd"}
        )
        record = self.doc()["edited"]
        record["seller"]["name"] = "ABC Bilişim Ltd"
        record["items"][0]["description"] = "Yazılım desteği"
        self.assertEqual(self.services.match(record)["id"], row["id"])

    def test_source_period_precision_and_unknown_start(self):
        row = self.row([])
        self.assertEqual(row["start_period"], "2025-11")
        self.assertEqual(row["end_period"], "2026-10")
        self.assertEqual(row["lifecycle"], "ended")
        self.assertIsNone(period_from_note("Aylık hizmet", "BASLA"))
        self.assertIsNone(ratio("0", "10"))
        self.assertEqual(ratio("10", "10"), "0.0000")


if __name__ == "__main__":
    unittest.main()
