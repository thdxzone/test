# Yerel Fatura Yönetimi

## Uygulamayı açma

`Baslat.command` (macOS), `Baslat.bat` (Windows) veya `python3 start_local.py --open` ile başlatın. Arayüz http://127.0.0.1:8765 adresindedir. İlk kurulum ve sunucu ayarları için [README.md](README.md) ve [COOLIFY.md](COOLIFY.md).

## Fatura yükleme ve kontrol

1. **Fatura Yükle** ekranından PDF seçin veya sürükleyip bırakın. Kaynak dosya sınırı 25 MB, sayfa sınırı 30'dur.
2. Belge sırayla çalışan PaddleOCR işçisi tarafından okunur. Başarısız alanlar elle tamamlanabilir; okuma hatası otomatik onay oluşturmaz.
3. Fatura numarası, tarih, satıcı adı, miktar, birim fiyat, KDV oranı, toplamlar ve fatura notunu belgeyle karşılaştırın.
4. **Taslak kaydet** düzeltmeleri saklar. Bilgileri doğruladığınızı işaretleyip **Onayla ve kaydet** ile kesin kaydı oluşturun.
5. Onaylanan faturayı tekrar açıp düzenleyebilirsiniz. İki sekme aynı kaydı değiştirirse eski sürüm yeni düzenlemeyi ezmez.

## Tek PDF içinde birden fazla fatura

Her sayfasında bağımsız fatura bulunan PDF için **Her sayfa ayrı fatura** seçeneğini işaretleyin. Dört sayfa dört kayıt oluşturur; sayfalar sırayla okunur ve ayrı onaylanır. **Fatura 1, Fatura 2…** bağlantılarıyla aralarında geçebilirsiniz. Bir sayfanın okunamaması diğerlerini durdurmaz.

Daha önce yüklenmiş PDF'nin detayında **Her sayfayı ayrı fatura olarak oku** kullanılabilir. Eski birleşik kayıt listeden ve analizlerden çıkarılır; kaynağı ve geçmişi korunur. Bu işlem 2–30 sayfa ve toplam 100 MB ayrılmış dosya sınırıyla çalışır. Tek faturanın birkaç sayfaya yayıldığı PDF'lerde bu seçeneği kapalı tutun.

## Fatura listesi ve mükerrer kontrolü

**Faturalar** ekranı hizmetlerin zam analizini açar. **Yüklenen faturalar** ile belge listesine geçebilirsiniz. Fatura numarası, satıcı, durum, para birimi ve tarih filtreleri kullanılabilir. Silme işlemi kaydı listeden ve analizlerden kaldırır; kaynak ve onay geçmişi korunur.

Aynı fatura numarası yeniden yüklenirse ikinci kez kaydedilmez. Numarada büyük/küçük harf ve boşluk farkları giderilir; A/4 gibi OCR hataları tahminle değiştirilmez. Numara yanlışsa mükerrer ekranından düzeltebilirsiniz. Numarası eksik fatura onaylanamaz.

## Hizmet bilgileri

Tablodaki hizmet adına tıklayın. **Hizmeti düzenle** ile kurum, hizmet adı, hizmet türü, not, başlangıç tarihi ve Excel başlangıç bedelleri değiştirilebilir. **Bitti** türünde bitiş tarihi açılır; başlangıçtan önce bir bitiş girilemez.

Önerilen türler **Düzenli (aylık)**, **Tek seferlik**, **Düzensiz**, **Bitti**'dir. Farklı bir tür elle yazılabilir. Liste tür bazında filtrelenebilir. Kaynakta yalnızca ay/yıl varsa kesin gün uydurulmaz; elle girilen başlangıç/bitiş tarihi kaynak notundan önceliklidir.

Yeni faturalar açıklamadan hizmetle eşleştirilir. Eşleşme belirsizse inceleme ekranında bağlı hizmeti seçin. Fatura geçmişinden **Faturayı düzenle** ile faturanın kendi tarih ve tutarları güncellenebilir.

## Yıllık ödemeler ve zam analizi

Yüklenen faturalar ödenmiş kabul edilir. Fatura sayısı yükleme ile, yıllık ödeme tutarı ise kontrol/onay sonrası hesaba katılır. Yıl dağılımı fatura tarihine göredir; ödeme tarihi ayrıca bilinmez. Tarihsiz fatura yıllık dağılıma eklenmez; kontrol bekleyen tutarlar tabloda ve grafikte belirtilir.

**Yıllık ödemeler** tablosu ve sütun grafiği gerçek toplam harcamayı gösterir. **Hizmeti düzenle → Geçmiş yıllık ödemeler** bölümünde yıl ve fatura sayısını girince o yılın hizmet bedeliyle çarpılarak toplam doldurulur. Yıl içinde fiyat değiştiyse toplamı elle düzeltin.

Geçmiş yılın son günü otomatik seçilir; kapsanan son tarih değiştirilebilir. O tarih ve öncesindeki PDF'ler elle girilen toplamın içinde kabul edilir; tekrar sayılmaz. Sonraki faturalar otomatik eklenir.

Zam analizi ve fiyat artış grafiği her yılın son hizmet bedelini karşılaştırır. Bu tutar, yıllık toplam harcamadan ayrıdır. Excel başlangıcı korunur; yeni ve onaylı faturalar ilgili yılın son hizmet bedelini günceller. Silinen faturalar analizden çıkarılır.

## Veri ve yedekleme

Ana veriler `data/` içindedir. Git kopyası aktarım anının görüntüsüdür; bilgisayarlar arasında canlı veritabanı eşitlemesi yapmaz. Çalışan verinin yedeği için `python -m scripts.backup_data --source data --output /yedekler/fatura.zip` kullanılabilir. Yedek çıktı klasörü veri dizininin dışında olmalı.

OCR tamamen yereldir. PaddleOCR ağırlıkları `models/paddlex/official_models/` altında bulunur. Model ayrı süreçte çalışır. Miktarlar tutarlardan türetilmez; eksik alanlar kullanıcı kontrolüne bırakılır. Belge klasörlerindeki OCR çıktıları ve günlükler de fatura verisi içerebilir.
