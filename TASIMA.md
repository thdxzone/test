# Başka bilgisayara aktarım

## Kaynak kodunu alma

```sh
git clone https://github.com/Oguzhan1511/fatura_sistemi.git
cd fatura_sistemi
```

ZIP indiriyorsanız bütün klasörleri birlikte çıkarın. Mevcut ana kayıtlar `data/`, yerel OCR ağırlıkları `models/` içindedir.

## Yerel kurulum

Python 3.12 kurun. Windows'ta `Kurulum.bat`, macOS'ta `Kurulum.command` veya terminalde:

```sh
python3 scripts/setup_local.py
python3 start_local.py --open
```

Kurulum, hedef bilgisayara uygun paketleri `.venv-ocr` içine kurar. Sanal ortamı başka bilgisayardan kopyalamayın. PDF önizleme ve OCR için Poppler kurup `pdftoppm` komutunu PATH'e ekleyin. Tesseract küçük miktar hücrelerinde isteğe bağlı yardımcıdır. macOS'ta `brew install poppler tesseract` kullanılabilir.

Arayüz http://127.0.0.1:8765 adresindedir. Ubuntu ARM64 ve Coolify kurulumu [COOLIFY.md](COOLIFY.md) içinde anlatılır. Windows'ta uçtan uca çalışma henüz doğrulanmadı; yerel macOS ve Linux ARM64 OCR ortamları test edildi.

## Güncelleme ve veri

Yeni kayıtlar eklenmişse güncellemeden önce `data/` dizininin tutarlı yedeğini alın:

```sh
python -m scripts.backup_data --source data --output /yedekler/fatura.zip
```

Git'teki veritabanı aktarım anının kopyasıdır. Çalışan sunucudaki daha yeni kayıtların yerine geçirmeyin. Kaynak kodunu güncellemek için `git pull origin main` kullanın; veri dosyası çakışması varsa mevcut veriyi koruyup yedekten karar verin. Coolify'da `/data` kalıcı diski yeni imajdan bağımsızdır.

Ana sistem Türkçe PaddleOCR kullanır; kod `ocr/`, ağırlıklar `models/paddlex/official_models/` içindedir. Eski deney arayüzü ve deney kayıtları güncel repoda yer almaz. Kaynak bilgisayardaki arşiv `backups/retired-lab-2026-11-18/` altında yerelde korunur.
