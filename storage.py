"""Yerel SQLite deposu: belge, ilk okuma ve onaylanan kayıt ayrı saklanır."""

from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import unicodedata


def invoice_key(value):
    """Harf/rakamları değiştirmeden boşluk ve büyük/küçük harf farkını kaldırır."""
    return "".join(unicodedata.normalize("NFKC", value or "").upper().split())


class DuplicateInvoice(ValueError):
    def __init__(self, identifier, number):
        self.identifier = identifier
        super().__init__(
            f"{number} numaralı fatura zaten mevcut. İkinci kez eklenmedi."
        )


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, root, recover_processing=True, prevent_duplicates=True):
        self.prevent_duplicates = prevent_duplicates
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "files").mkdir(exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL,
                    status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    approved_at TEXT, revision INTEGER NOT NULL DEFAULT 1,
                    original_json TEXT, edited_json TEXT, error TEXT
                );
                CREATE TABLE IF NOT EXISTS analyses (
                    id INTEGER PRIMARY KEY, document_id TEXT NOT NULL, created_at TEXT NOT NULL,
                    data_json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS approvals (
                    id INTEGER PRIMARY KEY, document_id TEXT NOT NULL, approved_at TEXT NOT NULL,
                    data_json TEXT NOT NULL, checks_json TEXT NOT NULL
                );
            """)
            columns = {
                row["name"] for row in db.execute("PRAGMA table_info(documents)")
            }
            if "duplicate_of" not in columns:
                db.execute("ALTER TABLE documents ADD COLUMN duplicate_of TEXT")
            for column in (
                "batch_id TEXT",
                "batch_page INTEGER",
                "batch_count INTEGER",
            ):
                if column.split()[0] not in columns:
                    db.execute(f"ALTER TABLE documents ADD COLUMN {column}")
            # Yarım kalan işlemler sessizce kaybolmaz; inceleme için tekrar erişilebilir kalır.
            if recover_processing:
                db.execute(
                    "UPDATE documents SET status='review', error='İşlem tamamlanmadan uygulama kapandı. Yeniden analiz edebilirsiniz.' WHERE status='processing'"
                )

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.root / "invoices.sqlite3", timeout=15)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def create(self, identifier, filename, mime):
        stamp = now()
        with self.connect() as db:
            db.execute(
                "INSERT INTO documents(id,filename,mime,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                (identifier, filename, mime, "processing", stamp, stamp),
            )
        return self.get(identifier)

    @staticmethod
    def decode(row):
        if row is None:
            return None
        value = dict(row)
        for key in ("original_json", "edited_json"):
            raw = value.pop(key)
            value[key.removesuffix("_json")] = json.loads(raw) if raw else None
        return value

    def get(self, identifier):
        with self.connect() as db:
            return self.decode(
                db.execute(
                    "SELECT * FROM documents WHERE id=? AND status!='deleted'",
                    (identifier,),
                ).fetchone()
            )

    def create_batch(self, documents, batch_id, replaced=None):
        """Sayfalar ve varsa birleşik kaydın kaldırılması tek işlemde tamamlanır."""
        stamp = now()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if replaced:
                identifier, revision = replaced
                cursor = db.execute(
                    "UPDATE documents SET status='deleted', updated_at=?, revision=revision+1 "
                    "WHERE id=? AND revision=? AND status NOT IN ('processing','deleted')",
                    (stamp, identifier, revision),
                )
                if cursor.rowcount != 1:
                    raise ValueError(
                        "Kayıt değişmiş veya halen okunuyor. Sayfayı yenileyin."
                    )
            for index, document in enumerate(documents, start=1):
                db.execute(
                    "INSERT INTO documents(id,filename,mime,status,created_at,updated_at,"
                    "batch_id,batch_page,batch_count) VALUES(?,?,?,?,?,?,?,?,?)",
                    (
                        document["id"],
                        document["filename"],
                        "application/pdf",
                        "processing",
                        stamp,
                        stamp,
                        batch_id,
                        index,
                        len(documents),
                    ),
                )
        return [self.get(document["id"]) for document in documents]

    def batch(self, identifier):
        with self.connect() as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT id,filename,status,batch_page FROM documents "
                    "WHERE batch_id=? AND status!='deleted' ORDER BY batch_page",
                    (identifier,),
                )
            ]

    def list(self):
        with self.connect() as db:
            return [
                self.decode(row)
                for row in db.execute(
                    "SELECT * FROM documents WHERE status NOT IN ('deleted','duplicate') ORDER BY created_at DESC"
                )
            ]

    def duplicate(self, db, identifier, number):
        """Aynı yazma işlemi içinde bakılır; eşzamanlı yüklemeler birbirini kaçırmaz."""
        key = invoice_key(number)
        if not self.prevent_duplicates or not key:
            return None
        for row in db.execute(
            "SELECT id, edited_json FROM documents WHERE id!=? "
            "AND status NOT IN ('deleted','duplicate') AND edited_json IS NOT NULL "
            "ORDER BY created_at, id",
            (identifier,),
        ):
            if invoice_key(json.loads(row["edited_json"]).get("invoice_number")) == key:
                return row["id"]
        return None

    def analyzed(self, identifier, record, error=None):
        value = json.dumps(record, ensure_ascii=False)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            duplicate = self.duplicate(db, identifier, record.get("invoice_number"))
            db.execute(
                "INSERT INTO analyses(document_id,created_at,data_json) VALUES(?,?,?)",
                (identifier, now(), value),
            )
            db.execute(
                "UPDATE documents SET status=?, duplicate_of=?, original_json=COALESCE(original_json,?), edited_json=?, error=?, updated_at=?, revision=revision+1 WHERE id=? AND status!='deleted'",
                (
                    "duplicate" if duplicate else "review",
                    duplicate,
                    value,
                    value,
                    (
                        str(DuplicateInvoice(duplicate, record.get("invoice_number")))
                        if duplicate
                        else error
                    ),
                    now(),
                    identifier,
                ),
            )

    def save(self, identifier, record, revision, approved=False):
        """Eski sekmenin yeni düzeltmeleri ezmesini revizyon numarasıyla engeller."""
        stamp = now()
        value = json.dumps(record, ensure_ascii=False)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            duplicate = self.duplicate(db, identifier, record.get("invoice_number"))
            if duplicate:
                raise DuplicateInvoice(duplicate, record.get("invoice_number"))
            cursor = db.execute(
                """UPDATE documents SET edited_json=?, status=?, updated_at=?,
                approved_at=?, duplicate_of=NULL,
                error=CASE WHEN status='duplicate' THEN NULL ELSE error END, revision=revision+1
                WHERE id=? AND revision=? AND status IN ('review','approved','duplicate') """,
                (
                    value,
                    "approved" if approved else "review",
                    stamp,
                    stamp if approved else None,
                    identifier,
                    revision,
                ),
            )
            if cursor.rowcount != 1:
                raise ValueError(
                    "Bu kayıt başka bir işlemde değişti. Sayfayı yenileyip tekrar deneyin."
                )
            if approved:
                db.execute(
                    "INSERT INTO approvals(document_id,approved_at,data_json,checks_json) VALUES(?,?,?,?)",
                    (identifier, stamp, value, json.dumps(record.get("checks", []))),
                )
        return self.get(identifier)

    def retry(self, identifier):
        with self.connect() as db:
            cursor = db.execute(
                "UPDATE documents SET status='processing', error=NULL, updated_at=?, revision=revision+1 WHERE id=? AND status='review'",
                (now(), identifier),
            )
            if cursor.rowcount != 1:
                raise ValueError(
                    "Yalnızca inceleme bekleyen kayıtlar yeniden analiz edilebilir."
                )

    def delete(self, identifier, revision):
        """Kaydı listeden çıkarır; ilk okuma ve onay geçmişini denetim için korur."""
        with self.connect() as db:
            result = db.execute(
                """UPDATE documents SET status='deleted', updated_at=?,
                revision=revision+1 WHERE id=? AND revision=? AND status NOT IN ('processing','deleted')""",
                (now(), identifier, revision),
            )
            if result.rowcount != 1:
                raise ValueError(
                    "Kayıt değişmiş veya halen okunuyor. Listeyi yenileyip tekrar deneyin."
                )

    def file(self, identifier):
        # Dosya adları kullanıcı yolundan türetilmez; yalnızca doğrulanmış kayıt kimliği kullanılır.
        return self.root / "files" / identifier / "source"
