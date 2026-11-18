# Fatura Yönetim Sistemi

PDF faturaları yerel PaddleOCR ile okuyan, kullanıcı kontrolü sonrası kaydeden ve hizmet bazında ödeme analizi sunan uygulama.

## Başlatma

Python 3.12 ve Poppler gerekir. İlk kurulum:

```sh
python3 scripts/setup_local.py
python3 start_local.py --open
```

Windows'ta `Kurulum.bat` ve `Baslat.bat`; macOS'ta `Kurulum.command` ve `Baslat.command` kullanılabilir. Yerel arayüz: http://127.0.0.1:8765.

Ubuntu ARM64 / Coolify kurulumu için [COOLIFY.md](COOLIFY.md), bilgisayarlar arası aktarım için [TASIMA.md](TASIMA.md), ekranların kullanımı için [KULLANIM.md](KULLANIM.md).

## Özellikler

- PDF yükleme, belge önizleme ve düzenlenebilir fatura/kalem alanları.
- Her sayfası ayrı fatura olan PDF'leri sayfa sırasıyla okuma ve ayrı onaylama.
- Fatura numarasıyla arama, mükerrer kayıt engelleme ve silme.
- Kurum ve hizmet eşleştirme, hizmet türü, başlangıç ve bitiş tarihleri.
- Yılın son hizmet bedeli üzerinden zam analizi ve fiyat grafiği.
- Yıllık ödeme toplamı ve fatura sayısı; geçmiş yıllar için elle giriş ve bedel × adet hesabı.
- Yeni faturalarla güncellenen yıllık ödeme grafiği ve mobil arayüz.

## Dosya düzeni

| Konum | Görevi |
| --- | --- |
| `app.py`, `storage.py` | Yerel HTTP sunucusu, kayıt akışı ve SQLite deposu |
| `production.py`, `Dockerfile` | Kimlik doğrulamalı Coolify sunucusu |
| `web/` | Arayüz, CSS, JavaScript ve görseller |
| `ocr/` | Ana PaddleOCR motoru ve başlık doğrulama kodu |
| `ocr_worker.py`, `model_runtime.py` | OCR işini ayrı süreçte çalıştırma |
| `models/paddlex/official_models/` | Türkçe PaddleOCR mobil ağırlıkları |
| `models/tessdata/` | Yardımcı Tesseract ağırlıkları |
| `pdf_batch.py` | PDF sayfalarını ayrı faturalara ayırma |
| `service_analysis.py`, `analytics.py` | Hizmet eşleştirme ve ödeme hesapları |
| `invoice.py`, `extraction_service.py`, diğer ayrıştırıcılar | OCR/PDF verisini ortak fatura şemasına dönüştürme |
| `data/` | Ana veritabanı, gerçek belgeler ve Excel başlangıç verileri |
| `scripts/` | Kurulum, OCR kontrolü, veri aktarımı ve yedekleme |
| `tests/`, `examples/` | Doğrulamalar ve örnek belgeler |

Eski deney arayüzü ve kullanılmayan modeller aktif projeden kaldırıldı. Bu bilgisayardaki eski deney kayıtları `backups/retired-lab-2026-11-18/` altında yerel arşiv olarak korunur; Git ve Docker imajına dahil edilmez.

## Doğrulama

Kurulu OCR ortamının Python'u ile:

```sh
python -m unittest discover -s tests -q
python -m scripts.ocr_smoke
```

Yerel başlatma yalnızca loopback adresini dinler. Sunucu dağıtımında kalıcı veri diski ve yönetici parolası için Coolify belgesini izleyin. OCR sonucu otomatik doğruluk garantisi taşımaz; fatura kullanıcı kontrolünden sonra onaylanır.
