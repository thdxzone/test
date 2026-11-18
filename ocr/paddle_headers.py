"""PaddleOCR başlıklarını etiket ve yakınlık kanıtıyla eşleştirir."""

from datetime import datetime
import re

from document_notes import normalized

LABELS = {
    "invoice_number": re.compile(r"\bFATURA\s+(?:NO(?:SU)?|NUMARASI|NUMARA)\b"),
    # Yalnızca alan etiketindeki yaygın I/l karışıklığı kabul edilir.
    "invoice_date": re.compile(r"\bFATURA\s+TAR[I1L]H[I1L]\b"),
}


def value_for(field, text):
    text = text.strip(" :;|[]()")
    if field == "invoice_number":
        if not re.fullmatch(r"[A-Za-z0-9]{6,30}", text) or not re.search(r"\d", text):
            return None
        if text.upper().startswith("IBAN") or re.fullmatch(r"TR\d{24}", text, re.I):
            return None
        return text
    if not re.fullmatch(r"\d{1,2}[./-]\d{1,2}[./-]\d{4}", text):
        return None
    try:
        return (
            datetime.strptime(re.sub(r"[/-]", ".", text), "%d.%m.%Y").date().isoformat()
        )
    except ValueError:
        return None


def review_headers(record, ocr):
    """Kalemlere dokunmaz; belirsiz başlıklarda yanlış aday yerine boş alan bırakır."""
    words = ocr["lines"]
    width = ocr["width"]
    labels = ocr.get("raw_lines", words)
    for field, pattern in LABELS.items():
        candidates = {}
        for label in labels:
            match = pattern.search(normalized(label["text"]))
            if not match:
                continue
            # İrsaliye/sipariş alanı fatura başlığıyla karıştırılmaz.
            if any(
                term in normalized(label["text"]) for term in ("IRSALIYE", "SIPARIS")
            ):
                continue
            x0, y0, x1, y1 = label["bbox"]
            height = max(1, y1 - y0)
            for word in words:
                value = value_for(field, word["text"])
                if value is None:
                    continue
                a, b, c, d = word["bbox"]
                same_row = abs((b + d - y0 - y1) / 2) < height * 0.7 and a >= x0
                # Taramada ardışık satırların kutuları birkaç piksel örtüşebilir.
                below = (
                    -height * 0.35 <= b - y1 <= height * 1.8
                    and (b + d - y0 - y1) / 2 > height * 0.35
                    and abs(a - x0) <= width * 0.045
                )
                # Birleşik etiket/değer satırında da değer sözcüğü seçilebilir.
                if (same_row and a - x1 < width * 0.25) or below:
                    candidates.setdefault(value, []).append(word)
        previous = record.get(field)
        record[field] = next(iter(candidates)) if len(candidates) == 1 else None
        record.setdefault("evidence", {})[field] = [
            {"text": word["text"], "bbox": word["bbox"], "page": 1}
            for observations in candidates.values()
            for word in observations
        ]
        if previous != record[field] or len(candidates) != 1:
            record["issues"].append(
                {
                    "code": "paddle_header_review",
                    "detail": f"{field}: etiket yakınlığından eşleştirildi; boş veya farklı adayları belgeyle doğrulayın.",
                }
            )
    return record
