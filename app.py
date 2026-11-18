"""Yerel fatura uygulaması. Başlatma: python app.py (yalnızca 127.0.0.1)."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import date
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import mimetypes
from pathlib import Path
import re
import threading
import subprocess
import shutil
import tempfile
from urllib.parse import parse_qs, unquote, urlparse
import uuid

from extraction_service import analyze, empty_record, render_page
from invoice import number, validate
from storage import Store, DuplicateInvoice
from model_runtime import analyze_paddle
from service_analysis import Services
from pdf_batch import inspect_pdf, split_pages

ROOT = Path(__file__).resolve().parent
MAX_UPLOAD = 25 * 1024 * 1024
LOG = logging.getLogger("fatura")


def normalized_record(payload, original):
    """Yalnızca düzenlenebilir alanları alır; kaynak kanıtı istemciden kabul etmez."""
    if not isinstance(payload, dict):
        raise ValueError("Geçerli bir fatura kaydı gönderin.")
    record = deepcopy(original or empty_record())
    record["checks"], record["issues"] = [], []

    def text(value, limit=1000):
        if value is None:
            return None
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError("Alan metni çok uzun veya geçersiz.")
        return value.strip() or None

    def decimal(value):
        value = text(value, 64)
        if value is None:
            return None
        try:
            if "," in value:
                result = number(value)
            elif re.fullmatch(r"-?\d+(?:\.\d+)?", value):
                result = Decimal(value)
            else:
                raise ValueError()
            if not result.is_finite() or abs(result) > Decimal("1e15"):
                raise ValueError()
            return str(result)
        except (ValueError, InvalidOperation):
            raise ValueError("Miktar ve tutarlar sayı olmalı. Örnek: 1234,56")

    seller = payload.get("seller", {})
    if not isinstance(seller, dict):
        raise ValueError("Satıcı alanı geçersiz.")
    record["seller"] = {k: text(seller.get(k)) for k in ("name", "tax_id", "address")}
    for k in ("invoice_number", "invoice_date", "currency"):
        record[k] = text(payload.get(k), 128)
    record["invoice_note"] = text(payload.get("invoice_note"), 12000)
    record["service_id"] = text(payload.get("service_id"), 80)
    if record["invoice_date"]:
        date.fromisoformat(record["invoice_date"])
    if record["currency"] and not re.fullmatch("[A-Z]{3}", record["currency"]):
        raise ValueError("Para birimi TRY, USD, EUR gibi üç harfli kod olmalı.")
    raw_totals = payload.get("totals", {})
    if not isinstance(raw_totals, dict):
        raise ValueError("Toplam alanları geçersiz.")
    record["totals"] = {
        k: decimal(raw_totals.get(k))
        for k in ("net", "vat", "gross", "discount", "withholding", "payable")
    }
    raw_items = payload.get("items", [])
    if not isinstance(raw_items, list) or len(raw_items) > 10000:
        raise ValueError("Kalem listesi geçersiz veya çok büyük.")
    record["items"] = []
    for i, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            raise ValueError("Kalem alanı geçersiz.")
        item = {k: text(raw.get(k)) for k in ("name", "description", "unit")}
        item["evidence"] = (
            None  # Düzenlenmiş değerlerin ilk OCR kanıtı original kaydında korunur.
        )
        item.update(
            {
                k: decimal(raw.get(k))
                for k in (
                    "quantity",
                    "unit_price",
                    "vat_rate",
                    "line_total",
                    "discount",
                )
            }
        )
        for k in ("price_basis", "total_basis"):
            item[k] = raw.get(k, "unknown")
            if item[k] not in ("net", "gross", "unknown"):
                raise ValueError("KDV esası seçimi geçersiz.")
        if item["vat_rate"] is not None and not Decimal(0) <= Decimal(
            item["vat_rate"]
        ) <= Decimal(100):
            raise ValueError("KDV oranı 0–100 aralığında olmalı.")
        if item["quantity"] is not None and Decimal(item["quantity"]) <= 0:
            raise ValueError("Miktar sıfırdan büyük olmalı.")
        record["items"].append(item)
        if "unknown" in (item["price_basis"], item["total_basis"]):
            record["issues"].append(
                {
                    "code": "ambiguous_tax_basis",
                    "detail": f"{i+1}. kalemin KDV dahil/hariç bilgisini kontrol edin.",
                }
            )
    return validate(record)


def approval_errors(record):
    """Miktar dahil zorunlu alanlar tamamlanmadan onaylamaya izin vermez."""
    missing = []
    for k, label in [
        ("invoice_number", "Fatura numarası"),
        ("invoice_date", "Fatura tarihi"),
        ("currency", "Para birimi"),
    ]:
        if not record.get(k):
            missing.append(label)
    if not record["seller"]["name"]:
        missing.append("Satıcı unvanı")
    for k, label in [
        ("net", "KDV hariç toplam"),
        ("vat", "KDV toplamı"),
        ("gross", "KDV dahil toplam"),
    ]:
        if record["totals"][k] is None:
            missing.append(label)
    if not record["items"]:
        missing.append("En az bir ürün/hizmet kalemi")
    for i, item in enumerate(record["items"], 1):
        for k, label in [
            ("name", "ürün/hizmet adı"),
            ("quantity", "miktar"),
            ("unit_price", "birim fiyat"),
            ("vat_rate", "KDV oranı"),
            ("line_total", "satır toplamı"),
        ]:
            if item.get(k) is None:
                missing.append(f"{i}. kalem {label}")
    return missing


class Application:
    def __init__(self, data_root, reader="paddle"):
        if reader not in ("paddle", "prototype"):
            raise ValueError("Bilinmeyen okuma motoru.")
        self.reader = reader
        self.store = Store(data_root)
        self.services = Services(self.store.root)
        self.executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="fatura-ocr"
        )
        self.preview_lock = threading.Lock()

    def accept_upload(self, data, filename, split=False):
        """Yeni belge yüklemeleri yalnızca PDF kabul eder; mevcut kayıtlar korunur."""
        if not data or len(data) > MAX_UPLOAD:
            raise ValueError("Dosya en fazla 25 MB olabilir.")
        if not data.startswith(b"%PDF-"):
            raise ValueError("Lütfen PDF biçiminde bir fatura yükleyin.")
        filename = Path(filename.replace("\\", "/")).name[:180] or "fatura.pdf"
        if split:
            return self.accept_batch(data, filename)
        identifier = uuid.uuid4().hex
        directory = self.store.root / "files" / identifier
        directory.mkdir(parents=True)
        (directory / "source").write_bytes(data)
        doc = self.store.create(identifier, filename, "application/pdf")
        self.executor.submit(self.process, identifier)
        return doc

    def accept_batch(self, data, filename, replaced=None):
        """Önce PDF'ler, sonra tüm kayıtlar hazırlanır; işler sayfa sırasıyla kuyruğa alınır."""
        documents = []
        directories = []
        batch_id = uuid.uuid4().hex
        try:
            with tempfile.TemporaryDirectory(
                prefix="invoice-batch-", dir=self.store.root
            ) as work:
                paths = split_pages(data, work)
                for index, path in enumerate(paths, start=1):
                    identifier = uuid.uuid4().hex
                    directory = self.store.root / "files" / identifier
                    directory.mkdir()
                    directories.append(directory)
                    path.replace(directory / "source")
                    documents.append(
                        {
                            "id": identifier,
                            "filename": f"{Path(filename).stem[:140]} · sayfa {index}.pdf",
                        }
                    )
                saved = self.store.create_batch(documents, batch_id, replaced)
        except Exception:
            for directory in directories:
                shutil.rmtree(directory, ignore_errors=True)
            raise
        for document in saved:
            self.executor.submit(self.process, document["id"])
        return {"id": saved[0]["id"], "batch_id": batch_id, "documents": saved}

    def process(self, identifier):
        doc = self.store.get(identifier)
        try:
            reader = analyze_paddle if self.reader == "paddle" else analyze
            result = reader(self.store.file(identifier), doc["mime"])
            self.store.analyzed(identifier, result)
        except Exception as error:
            LOG.exception("Belge analiz edilemedi: %s", identifier)
            self.store.analyzed(
                identifier,
                empty_record(),
                "Otomatik okuma tamamlanamadı. Alanları elle doldurabilir veya yeniden deneyebilirsiniz.",
            )


class InvoiceEndpoints:
    """Yerel HTTP ve üretim WSGI katmanlarının paylaştığı fatura işlemleri."""

    server_version = "FaturaLocal/1.0"

    @property
    def app(self):
        return self.server.application

    def log_message(self, fmt, *args):
        LOG.info(fmt, *args)

    def send(self, status, body, mime="application/json; charset=utf-8", extra=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' blob: data:; media-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
        )
        self.send_header("Permissions-Policy", "camera=(), microphone=()")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def trusted(self):
        expected = {
            f"127.0.0.1:{self.server.server_port}",
            f"localhost:{self.server.server_port}",
        }
        if self.headers.get("Host") not in expected:
            return False
        origin = self.headers.get("Origin")
        return not origin or origin in {f"http://{host}" for host in expected}

    def body(self, maximum=2 * 1024 * 1024):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > maximum:
            raise ValueError(
                "Dosya boş veya izin verilen boyuttan büyük (en fazla 25 MB)."
            )
        return self.rfile.read(length)

    def document(self, identifier):
        if not re.fullmatch(r"[a-f0-9]{32}", identifier):
            raise FileNotFoundError("Kayıt bulunamadı.")
        doc = self.app.store.get(identifier)
        if doc is None:
            raise FileNotFoundError("Kayıt bulunamadı.")
        return doc

    def do_GET(self):
        if not self.trusted():
            return self.send(403, {"error": "Bu adresten erişime izin verilmiyor."})
        try:
            self.get()
        except FileNotFoundError as exc:
            self.send(404, {"error": str(exc)})
        except (ValueError, OSError, subprocess.SubprocessError):
            LOG.exception("İstek başarısız")
            self.send(
                400, {"error": "İstek tamamlanamadı. Dosya veya adresi kontrol edin."}
            )

    def get(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        parts = path.strip("/").split("/")
        if path == "/api/increase-analysis":
            return self.send(200, self.app.services.analysis(self.app.store.list()))
        if path == "/api/services":
            return self.send(200, self.app.services.rows())
        if len(parts) == 3 and parts[:2] == ["api", "services"]:
            data = self.app.services.analysis(self.app.store.list())
            row = next((r for r in data["rows"] if r["id"] == parts[2]), None)
            if row is None:
                raise FileNotFoundError("Hizmet bulunamadı.")
            return self.send(200, row)
        if path == "/api/documents":
            documents = []
            for doc in self.app.store.list():
                record = doc["edited"] or empty_record()
                documents.append(
                    {
                        k: doc[k]
                        for k in (
                            "id",
                            "filename",
                            "status",
                            "created_at",
                            "updated_at",
                            "approved_at",
                            "revision",
                        )
                    }
                    | {
                        "seller": record["seller"]["name"],
                        "invoice_number": record["invoice_number"],
                        "invoice_date": record["invoice_date"],
                        "currency": record["currency"],
                        "totals": record["totals"],
                        "item_count": len(record["items"]),
                        "issue_count": len(record.get("issues", [])),
                    }
                )
            from analytics import summarize

            currencies = {"TRY"} | {d["currency"] for d in documents if d["currency"]}
            summaries = {
                c: {
                    period: summarize(documents, c, period)
                    for period in ("all", "year", "month")
                }
                for c in currencies
            }
            return self.send(200, {"documents": documents, "summaries": summaries})
        if len(parts) >= 3 and parts[:2] == ["api", "documents"]:
            doc = self.document(parts[2])
            if len(parts) == 3:
                if doc.get("batch_id"):
                    doc["batch_documents"] = self.app.store.batch(doc["batch_id"])
                doc["services"] = self.app.services.rows()
                doc["service_match"] = self.app.services.match(doc.get("edited") or {})
                return self.send(200, doc)
            source = self.app.store.file(doc["id"])
            if parts[3] == "source":
                return self.send(
                    200,
                    source.read_bytes(),
                    doc["mime"],
                    {"Content-Disposition": "inline"},
                )
            if parts[3] == "preview":
                page = int(parse_qs(parsed.query).get("page", ["1"])[0])
                if not 1 <= page <= 30:
                    raise ValueError("Geçersiz sayfa.")
                preview = source.parent / f"page-{page}.png"
                if doc["mime"] == "application/pdf":
                    with self.app.preview_lock:
                        preview = render_page(source, source.parent, page)
                if not preview.exists():
                    raise FileNotFoundError("Önizleme bulunamadı.")
                return self.send(200, preview.read_bytes(), "image/png")
            if parts[3] == "export":
                return self.send(
                    200,
                    doc["edited"] or {},
                    extra={
                        "Content-Disposition": f'attachment; filename="fatura-{doc["id"][:8]}.json"'
                    },
                )
        if path.startswith("/api/"):
            raise FileNotFoundError("Adres bulunamadı.")
        relative = "index.html" if path == "/" else path.lstrip("/")
        file = (ROOT / "web" / relative).resolve()
        if not file.is_relative_to(ROOT / "web") or not file.is_file():
            raise FileNotFoundError("Sayfa bulunamadı.")
        mime = mimetypes.guess_type(file)[0] or "application/octet-stream"
        if mime.startswith("text/") or mime == "application/javascript":
            mime += "; charset=utf-8"
        return self.send(200, file.read_bytes(), mime)

    def do_POST(self):
        if not self.trusted():
            return self.send(403, {"error": "Bu adresten işlem yapılamaz."})
        try:
            self.post()
        except DuplicateInvoice as exc:
            self.send(409, {"error": str(exc), "duplicate_of": exc.identifier})
        except FileNotFoundError as exc:
            self.send(404, {"error": str(exc)})
        except (ValueError, KeyError, TypeError, InvalidOperation) as exc:
            self.send(400, {"error": str(exc) or "Geçersiz işlem."})
        except Exception:
            LOG.exception("Kayıt işlemi başarısız")
            self.send(500, {"error": "İşlem tamamlanamadı. Tekrar deneyin."})

    def post(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if parsed.path == "/api/services":
            return self.send(201, self.app.services.create(json.loads(self.body())))
        if len(parts) == 4 and parts[:2] == ["api", "services"] and parts[3] == "save":
            row = self.app.services.update(unquote(parts[2]), json.loads(self.body()))
            return self.send(200, row)
        if parsed.path == "/api/uploads/inspect":
            return self.send(200, {"page_count": inspect_pdf(self.body(MAX_UPLOAD))})
        if parsed.path == "/api/uploads":
            data = self.body(MAX_UPLOAD)
            filename = Path(
                parse_qs(parsed.query).get("name", ["fatura"])[0].replace("\\", "/")
            ).name[:180]
            mode = parse_qs(parsed.query).get("split", [""])[0]
            if mode not in ("", "single", "pages"):
                raise ValueError("Geçerli bir PDF okuma düzeni seçin.")
            if not mode:
                count = inspect_pdf(data)
                if count > 1:
                    return self.send(
                        409,
                        {
                            "error": "Çok sayfalı PDF için her sayfanın ayrı fatura mı, tek faturanın devamı mı olduğunu seçin.",
                            "requires_layout": True,
                            "page_count": count,
                        },
                    )
            return self.send(
                201, self.app.accept_upload(data, filename, split=mode == "pages")
            )
        if len(parts) == 4 and parts[:2] == ["api", "documents"]:
            doc = self.document(parts[2])
            if parts[3] == "split":
                if doc["mime"] != "application/pdf" or doc.get("batch_id"):
                    raise ValueError("Bu belge sayfalara ayrılamaz.")
                payload = json.loads(self.body())
                result = self.app.accept_batch(
                    self.app.store.file(doc["id"]).read_bytes(),
                    doc["filename"],
                    replaced=(doc["id"], int(payload["revision"])),
                )
                return self.send(201, result)
            if parts[3] == "delete":
                payload = json.loads(self.body())
                self.app.store.delete(doc["id"], int(payload["revision"]))
                return self.send(200, {"deleted": True})
            if parts[3] == "retry":
                self.app.store.retry(doc["id"])
                self.app.executor.submit(self.app.process, doc["id"])
                return self.send(202, self.app.store.get(doc["id"]))
            if parts[3] == "save":
                payload = json.loads(self.body())
                record = normalized_record(payload.get("record"), doc["original"])
                if not record.get("service_id"):
                    record["service_id"] = self.app.services.match(record)["id"]
                self.app.services.validate_link(record)
                if doc["edited"] and record["invoice_number"] == doc["edited"].get(
                    "invoice_number"
                ):
                    record["issues"].extend(
                        i
                        for i in doc["edited"].get("issues", [])
                        if i["code"] == "identifier_review"
                    )
                    record["needs_review"] = bool(record["issues"])
                approve = payload.get("approve") is True
                if approve:
                    errors = approval_errors(record)
                    if errors:
                        return self.send(
                            422,
                            {
                                "error": "Onaylamak için eksik alanları tamamlayın.",
                                "fields": errors,
                                "record": record,
                            },
                        )
                    if record["issues"] and payload.get("reviewed") is not True:
                        return self.send(
                            422,
                            {
                                "error": "Kontrol uyarılarını incelediğinizi işaretleyin.",
                                "record": record,
                            },
                        )
                saved = self.app.store.save(
                    doc["id"], record, int(payload["revision"]), approve
                )
                return self.send(200, saved)
        raise FileNotFoundError("İşlem bulunamadı.")


class Handler(InvoiceEndpoints, BaseHTTPRequestHandler):
    """Bilgisayardaki mevcut yerel başlatıcı için HTTP taşıma katmanı."""


def create_server(port=8765, data_root=None, reader="paddle"):
    app = Application(data_root or ROOT / "data", reader=reader)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.application = app
    return server


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--open", action="store_true", help="Tarayıcıda uygulamayı aç")
    parser.add_argument(
        "--reader",
        choices=["paddle", "prototype"],
        default="paddle",
        help="Varsayılan okuyucu: PaddleOCR",
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    server = create_server(args.port, args.data_dir, args.reader)
    print(f"Fatura uygulaması hazır: http://127.0.0.1:{server.server_port}", flush=True)
    if args.open:
        import webbrowser

        threading.Timer(
            0.7, lambda: webbrowser.open(f"http://127.0.0.1:{server.server_port}")
        ).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        server.application.executor.shutdown(wait=True)
