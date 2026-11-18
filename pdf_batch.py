"""Her sayfasında ayrı fatura bulunan PDF'leri görüntüyü bozmadan ayırır."""

from pathlib import Path
import threading

import pypdfium2 as pdfium

# PDFium aynı süreçte eşzamanlı çağrılmamalı; OCR zaten ayrı süreçte çalışır.
PDF_LOCK = threading.Lock()
MAX_BATCH_PAGES = 30
MAX_SPLIT_BYTES = 100 * 1024 * 1024


def split_pages(data, destination):
    """Tüm sayfalar hazırlanır; bozuk PDF'de kısmi fatura kaydı oluşturulmaz."""
    destination = Path(destination)
    with PDF_LOCK:
        try:
            with pdfium.PdfDocument(data) as source:
                count = len(source)
                if not 2 <= count <= MAX_BATCH_PAGES:
                    raise ValueError("Sayfalara ayırmak için PDF 2–30 sayfa içermeli.")
                paths = []
                total_bytes = 0
                for index in range(count):
                    path = destination / f"page-{index + 1}.pdf"
                    with pdfium.PdfDocument.new() as page:
                        page.import_pages(source, [index])
                        page.save(path)
                    total_bytes += path.stat().st_size
                    if total_bytes > MAX_SPLIT_BYTES:
                        raise ValueError(
                            "Ayrılan sayfalar toplamda en fazla 100 MB olabilir."
                        )
                    paths.append(path)
                return paths
        except pdfium.PdfiumError as error:
            raise ValueError(
                "PDF açılamadı. Şifreli veya bozuk dosyayı kontrol edin."
            ) from error
