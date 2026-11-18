# Ubuntu / Coolify kurulumu

Üretim başlatıcısı `production.py`, Docker tanımı kökteki `Dockerfile` dosyasıdır. Yerel `Baslat` dosyaları bilgisayardaki kullanım içindir. Üretim tek süreçli Waitress WSGI sunucusudur; OCR ayrı süreçte, sırayla çalışır. Başlangıçta yapay bir metinle hem algılama hem tanıma modeli denenir; bu kontrol geçmeden sağlık uç noktası açılmaz.

## 1. İlk verileri kalıcı diske al

Ubuntu VM'de repoyu klonlayın. Repo private ise yetkili Git hesabı veya deploy key gerekir. Ana sistemin eski kopyasında yeni kayıt girişi durdurulmuş olmalı. İlk aktarımı **ilk deploy'dan önce**, boş bir hedefe yapın:

```sh
git clone https://github.com/Oguzhan1511/fatura_sistemi.git
cd fatura_sistemi
sudo mkdir -p /srv/fatura
sudo python3 scripts/seed_data.py --source data --target /srv/fatura/data
sudo mkdir -p /srv/fatura/backups
sudo chown -R 10001:10001 /srv/fatura/data /srv/fatura/backups
```

Aktarım aracı dolu hedefe yazmaz. Sonraki deploy'larda bu komutu tekrarlamayın. Git'teki kayıtlar aktarım anının görüntüsüdür; çalışan sunucudaki verinin yerine geçirilmez. İlk aktarımın kaynağı başka bilgisayarda daha güncelse önce o bilgisayardan güncel `data` yedeği alın. Eski deney arayüzü güncel projeden kaldırılmıştır. Ana OCR kodu `ocr/`, ağırlıklar `models/paddlex/official_models/` altındadır; yerel `backups/` arşivi imaja alınmaz.

## 2. Coolify'de uygulama oluştur

`10.21.41.219:8000` verilen Coolify yönetim panelidir; fatura uygulamasının alan adı değildir.

- Kaynak: `Oguzhan1511/fatura_sistemi`, `main` dalı. Public repo için repository URL seçilebilir; private repo için GitHub App veya deploy key gerekir.
- Build Pack / Build strategy: **Dockerfile**.
- Base Directory: `/`; Dockerfile Location: `/Dockerfile`.
- Ports Exposes: **8765**. Static site seçmeyin.
- Bu kurulum **iç ağda IP ile** kullanılacak: Domains alanı boş, **Ports Mappings: `8765:8765`**. Ubuntu VM'ye erişen istemciler `http://10.21.41.219:8765` adresini açar. `8000` portu Coolify paneline aittir ve değişmez.
- `8765` erişimini kurum içi ağla sınırlandırın; internete port yönlendirmesi yapmayın. Docker port yayını nedeniyle yalnızca UFW kurallarına güvenmeyin; VM/ağ güvenlik duvarındaki erişim politikasını da kontrol edin.
- Sonradan HTTPS alan adı kullanılacaksa port mapping'i kaldırıp Coolify proxy'si üzerinden domain tanımlayın. HTTPS adresini FATURA_PUBLIC_URL yapın; FATURA_ALLOW_PRIVATE_HTTP=false seçin. İç ağda kurum sertifikası da kullanılabilir.
- **Tek replica / tek instance** kullanın. SQLite aynı diski kullanan iki uygulama tarafından başlatılmaz. Rolling update / zero-downtime dağıtımı kullanmayın; eski container durmadan yenisi başlamamalı. Önce Stop, ardından Deploy gerekebilir. OCR sürerken deploy yapmayın.

## 3. Ortam değişkenleri

Coolify'de runtime environment olarak tanımlayın. Kullanıcı/parola build değişkeni veya Git dosyası değildir.

```text
FATURA_PUBLIC_URL=http://10.21.41.219:8765
FATURA_ALLOW_PRIVATE_HTTP=true
FATURA_ADMIN_USER=yonetici
FATURA_ADMIN_PASSWORD=<rastgele-en-az-16-karakter>
FATURA_DATA_DIR=/data
PORT=8765
```

Parolayı örneğin `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` ile üretin ve Coolify'de secret olarak saklayın. Ortam değerlerini kaydettikten sonra redeploy edin. `FATURA_PUBLIC_URL`, kullanıcıların açtığı uygulama adresiyle aynı olmalı; sonuna `/api`, `/#invoices` veya panelin `:8000` portu eklenmez. Varsayılan HTTPS zorunludur. Açıkça FATURA_ALLOW_PRIVATE_HTTP=true seçildiğinde yalnızca RFC1918/loopback/ULA IP veya localhost üzerinde HTTP kabul edilir; genel IP ve internet alan adlarında bu istisna çalışmaz. Bu iç ağ HTTP modunda giriş bilgileri şifrelenmeden taşınır; yalnızca kurum içi erişime açık tutun.

Tarayıcı ilk açılışta kullanıcı adı/parola sorar (HTTP Basic). Aynı koruma PDF'leri, API'yi ve statik arayüzü de kapsar. Bu ilk sürüm tek ortak yönetici hesabı içindir; kullanıcı/rol ve kişi bazında denetim yönetimi sağlamaz. Kullanıcı çıkışı için tarayıcı oturumunu kapatın. Şifre değişiminde Coolify runtime secret'ını değiştirip redeploy edin. Coolify panel giriş bilgileri, fatura uygulamasının giriş bilgileri değildir.

## 4. Persistent Storage

Directory / bind mount olarak ekleyin:

| Ubuntu kaynak klasörü | Container hedefi |
| --- | --- |
| `/srv/fatura/data` | `/data` |
| `/srv/fatura/backups` | `/backups` |

`/app` veya `/app/web` üstüne volume bağlamayın. Gerçek faturalar Docker build context'inden ve imaj katmanlarından dışlanır. SQLite, PDF'ler, önizlemeler, Excel bilgileri ve hizmet eşleştirme ayarları tek `/data` klasöründedir. Container 10001 UID/GID ile çalışır; bind mount'un yazma izinleri yukarıdaki kullanıcıya ait olmalı. Veriler bağlı diskte kalır, kod güncellemesi bunları yeniden içe aktarmaz.

## 5. Sağlık kontrolü

Dockerfile'da `/health` kontrolü vardır. Coolify Healthcheck sayfası kapalıysa imajın kendi kontrolü kullanılır. Panelden ayrıca ayarlayacaksanız:

```text
Method: GET
Scheme: HTTP
Host: 127.0.0.1
Port: 8765
Path: /health
```

Yanıt `200 {"status":"ok"}` olmalıdır. Bu tek uç parola istemez ve fatura bilgisi döndürmez. Container içinde curl hazırdır. Yanlış host/port veya sağlıksız container, proxy'de `No available server` hatası oluşturabilir. Diğer yollar yanlış Host/Origin için 403; parola yoksa 401 döndürür. `X-Forwarded-Host` ile alan adı denetimi atlanmaz.

## 6. Deploy sonrası kontrol

1. Loglarda `Fatura üretim sunucusu hazır; port=8765` ve sağlıklı container durumunu görün.
2. `http://10.21.41.219:8765` adresini açıp yönetici bilgileriyle girin. HTTPS alan adına geçildiyse o adresi kullanın.
3. Taşınan faturaları ve Excel hizmetlerini kontrol edin.
4. Bir PDF yükleyip numara, tarih, miktar, KDV ve toplamları inceleyin. Çıktıyı doğrulamadan onaylamayın.
5. Aynı numaralı faturayı yeniden yükleyip ikinci kez eklenmediğini kontrol edin.
6. Uygulamayı durdurup yeniden deploy edin; mevcut kayıtların korunmasını doğrulayın.

PaddleOCR'ın CPU paketi ve Linux kitaplıkları imajda kurulur. Hedef VM ARM64 olduğundan PaddlePaddle 3.2.2 seçilir; Mac ve Intel/AMD sürümleri 3.2.0 olarak korunur. Üretimde CPU kullanımını sınırlamak için FATURA_OCR_CPU_THREADS=1 kullanılır; model ağırlıkları değişmez. İşlemci/runtime uyumsuzluğu başlangıçtaki OCR kontrolünde yakalanır. Mac sanal ortamı veya MLX gerekmez. Docker, VM'nin kendi mimarisine göre imaj oluşturur. Kaynaklar yetersizse OCR süreci kapanabilir; Coolify container loglarını ve belgenin `/data/files/<id>/paddle-run.log` dosyasını kontrol edin. Başlangıçta kaynak kullanımını gerçek PDF'lerle ölçün.

## 7. Yedekleme ve geri dönüş

Container içinden (Coolify Terminal veya Scheduled Tasks), günlük benzersiz isimle:

```sh
python scripts/backup_data.py --source /data --output /backups/fatura-$(date +%Y%m%d-%H%M%S).zip
```

Bu araç SQLite'ın tutarlı yedek API'sini kullanır; PDF ve ayarlar aynı ZIP'te yer alır. Var olan yedeği ezmez. `/backups` klasörünü ayrıca farklı sunucu/diskte saklayın; aynı VM'deki volume tek başına sunucu kaybına karşı yedek değildir. Dosyalar hassastır; web adresinden sunulmaz. Geri dönüşte uygulamayı durdurun, mevcut `/srv/fatura/data` klasörünü ayrı bir ada taşıyın, ZIP'i boş bir veri klasörüne çıkarın, 10001 sahipliğini ayarlayıp tekrar başlatın. Eski veri ve yedeği kontrol tamamlanana kadar silmeyin.

Resmî kaynaklar: [Dockerfile dağıtımı](https://coolify.io/docs/applications/builds/dockerfile), [sağlık kontrolü](https://coolify.io/docs/applications/configuration/health-checks), [kalıcı diskler](https://coolify.io/docs/core/persistent-storage/storage-mounts/overview).

## Doğrulama kaydı

Bu değişiklik ARM64 Linux container içinde test edildi. Uygulamanın test takımı, Basic giriş, HTTPS test proxy'si üzerinden PDF yükleme ve PaddleOCR okuma, numarayla arama ve mobil görünüm doğrulandı. ARM Linux için PaddlePaddle 3.2.2 ve her iki OCR motorunda tek CPU iş parçacığı kullanılır. İnce miktar hücresi için açılan ek metin tanıyıcı da aynı sınıra uyar.

Container içinden ek kontrol: `python scripts/production_smoke.py`. OCR başlangıç kontrolünü ayrı denemek için: `python -m scripts.ocr_smoke`.

Hedef `10.21.41.219` kurumsal ağı bu geliştirme bilgisayarından erişilebilir olmadığından, hedef VM'de deploy yapılmadı; yukarıdaki Coolify ayarları sunucuda uygulanmalıdır.
