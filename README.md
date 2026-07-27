# Validex

Validex, Java backend geliştiricileri için hazırlanmış bir masaüstü API
inceleme ve tanılama aracıdır. HTTP request gönderir; OpenAPI contract farklarını,
Spring Boot çalışma zamanı verilerini ve farklı ortamların response’larını aynı
uygulamada incelemeye yardımcı olur.

## Hızlı başlangıç

Gereksinimler:

- Go 1.24 veya üzeri
- Node.js `^20.19.0` veya `>=22.12.0`
- npm ve `make`
- macOS’ta Xcode Command Line Tools ve sistem WebKit’i
- Windows’ta C++14 toolchain ve WebView2 Runtime
- Linux’ta GTK 3 ile WebKitGTK 4.0 geliştirme paketleri; native dosya seçici
  için `zenity` veya `kdialog`

Projeyi geliştirme modunda açmak için kök dizinde:

```bash
make dev
```

Bu komut Vite geliştirme sunucusunu ve Go backend’i birlikte başlatır, ardından
Validex’i sistem WebView’i içindeki masaüstü penceresinde açar. React dosyaları
Vite’tan gelir; Go çağrıları HTTP yerine native `canbridge` IPC kanalından
geçer. Geliştirme portu `34116`dan başlayarak seçilir; doluysa sıradaki boş
loopback portu kullanılır.

Production build:

```bash
make build
```

Çıktı `cmd/validex/build/bin` altında oluşur. macOS’ta:

```bash
open cmd/validex/build/bin/Validex.app
```

`make build`, Apple Development kimliği aramaz ve proje tarafından ek bir
Keychain veya `codesign` adımı çalıştırmaz.

> Yalnız `npm run dev` çalıştırmak native canbridge backend’ini başlatmaz. Mock
> server, dosya seçici, protokol ve Runtime, Environments, Thread & Logs,
> Coverage gibi native tanılama araçları için `make dev` kullanın.

Production frontend’i binary’ye gömülür. Canbridge önce
`127.0.0.1:34117` adresini kullanır; bu port doluysa işletim sisteminden boş bir
loopback portu seçer. İsteklerdeki Host kontrolü seçilen gerçek porta göre
uygulanır. Bu sunucu Go RPC taşımaz; backend çağrıları native WebView IPC
kullanır. Başlangıçta canbridge adı, efektif frontend URL’si, portu, modu ve
transport türü terminale yazılır.

Tercih edilen `34117` portu kullanıldığında sabit origin workspace
`localStorage` verisini sonraki açılışlarda korur. Dinamik fallback portu farklı
bir origin olduğundan yalnız o uygulama örneğinin workspace alanı ayrıdır.

Önceki masaüstü runtime origin’inde kaydedilmiş workspace, canbridge origin’ine
otomatik taşınamaz; runtime değişiminden sonraki ilk açılışta yerel workspace bir
kez sıfırlanır.

## Uygulamayı kullanma

### HTTP request

1. **Requests → New request** ile bir sekme açın.
2. `http://` veya `https://` ile başlayan URL’yi yazın ya da doğrudan yapıştırın.
   Query parametreleri **Params** bölümünde otomatik algılanır.
   Params’taki ekleme, düzenleme ve silme işlemleri doğrudan URL’nin query
   bölümünü değiştirir; URL tek kaynak olarak kalır.
3. Gerekirse URL, header veya body içinde `{{variable}}` kullanın ve
   **Variables** bölümünde değerini girin.
4. Gerekli `Accept`, `Content-Type` veya `Authorization` değerlerini
   **Headers** bölümüne kendiniz ekleyin. Sağdaki **Auth** görünümündeki
   **Authorization header ekle** kısayolu satırı kapalı durumda hazırlar;
   değerini girip etkinleştirene kadar request ile gönderilmez.
5. **Send** ile request’i gönderin. Çalışan request **Cancel** ile durdurulabilir.
6. Response’un body, raw body, header, cookie ve timeline görünümlerini inceleyin.
7. Send menüsündeki **Copy as cURL** ile request’i cURL olarak kopyalayın.

Validex GET, POST, PUT, PATCH, DELETE, OPTIONS ve HEAD methodlarını; tekrarlanan
header adlarını destekler. Yeni request boş header listesiyle açılır; Validex
`Accept`, `Authorization`, `Content-Type` veya başka bir security header’ını
kendiliğinden eklemez. HTTP protokolünün zorunlu `Host` ve gövde aktarım
header’ları transport tarafından gönderilebilir. Yapıştırılan URL blur veya
gönderim sırasında yeniden yazılmaz. Query parametrelerinin sırası, tekrarlanan
adları, boş değerleri ve encoding’i kullanıcı düzenleyene kadar korunur. Eksik
variable veya geçersiz URL request gönderilmeden gösterilir.

### OpenAPI ve contract drift

Üst menüden **New → Import OpenAPI** ile OpenAPI 3 YAML, YML veya JSON dosyası
seçin. İlk sekiz endpoint düzenlenebilir request sekmeleri olarak açılır; belgedeki
tüm endpoint’ler sanallaştırılmış **APIs** panelinde aranabilir ve tek tıkla
açılabilir. `{id}` path parametreleri request URL’sine `{{id}}` olarak aktarılır.

OpenAPI’den açılmış bir request’in operation method ve path’i korunduğunda,
eşleşen status veya `default` response altında gerçek `Content-Type` ile eşleşen
JSON schema varsa response otomatik karşılaştırılır. Buna
`application/problem+json` ve vendor `+json` media type’ları dahildir.
**Contract** sekmesi şu farkları gösterir:

- eksik alan;
- fazladan alan;
- tip uyuşmazlığı;
- enum ihlali;
- sayı, metin, dizi ve nesne sınırları ile yaygın string formatı ihlalleri.

OpenAPI dokümanları yalnız mevcut uygulama oturumunda bellekte tutulur; contract
cache’i en son sekiz dokümanla sınırlıdır. Uygulama yeniden açıldıktan sonra
contract kontrolü için dosyayı yeniden içe aktarın. İlk deneme için repo
kökündeki `openapi.sample.yaml` dosyasını kullanabilirsiniz.

### Mock Server

Sol araç çubuğundan **Mock Server** ekranını açın.

- Route’u method, path, status, header, JSON body ve gecikme ile tanımlayın.
- `{id}` biçimindeki path parametrelerini kullanın.
- OpenAPI response example veya schema’larından mock route üretin.
- Aktif request’in son JSON response’unu seçili route’a aktarın.
- Port `0` ile boş bir portu otomatik seçin.
- Çalışan sunucunun eşleşen/eşleşmeyen istek geçmişini izleyin.

Mock server yalnız `127.0.0.1` adresine bağlanır. Editörde yapılan manuel route
değişiklikleri **Değişiklikleri uygula** seçilmeden sunucuya geçirilmez.

### JSON Lab ve response DTO

**JSON Lab** cihaz üzerinde şu işlemleri yapar:

- format, minify ve anahtar sıralama;
- iki JSON arasında yapısal/value diff ve ignore path;
- güvenli JSONPath alt kümesiyle sorgulama;
- JSON’dan JSON Schema çıkarma;
- Java `record` veya field içeren response class’tan deterministik mock JSON
  örneği oluşturma.

Üretilen JSON’u kopyalayıp bir mock route body’sinde kullanabilirsiniz.

### Spring ve runtime tanılama

**Diagnostics** ekranı altı çalışma alanı içerir:

- **Spring Error:** ProblemDetail ve Bean Validation alan hataları için özet;
  400/401/403/500’e özel kontrol önerileri ve 404/409/5xx kategorileri.
- **JWT:** expiration, not-before, issuer, audience, subject, role ve scope
  görüntüleme.
- **Runtime:** Spring Boot Actuator health, mappings ve seçili metric snapshot’ı.
- **Environments:** aynı request’i local/test/staging hedeflerine gönderip status,
  header ve JSON farklarını karşılaştırma.
- **Thread & Logs:** yapıştırılan thread dump’ta blocked thread/deadlock analizi
  ve trace/correlation ID ile literal log araması.
- **Coverage:** **New → Import OpenAPI** ile içe aktarılan endpoint’leri bu
  oturumda Validex ile başarıyla gönderilen request’lerle veya elle girilen çağrı
  listesiyle eşleştirme.

Runtime ekranındaki varsayılan metric listesi JVM memory/thread/GC, HikariCP,
Redis/Lettuce, Kafka ve RabbitMQ adlarını içerir. **Baseline al** ile ilk
snapshot’ı saklayıp request veya servis işlemi sonrasında ikinci snapshot’ı
alarak değer ve yüzde farkını görebilirsiniz. İlgili Actuator endpoint ve
metric’lerinin hedef uygulamada erişime açık olması gerekir.

Güvenlik notları:

- JWT ekranı token’ı yerel olarak decode eder, imzayı doğrulamaz.
- Ortam karşılaştırması GET/HEAD/OPTIONS dışındaki methodları açık kullanıcı
  izni olmadan göndermez.
- Log ve thread dump metni yalnız uygulama belleğinde analiz edilir.
- Actuator erişim header’ları kullanıcı tarafından açıkça girilir.

### SSE, WebSocket ve gRPC

**Protocols** ekranı gerçek bağlantı kurar:

- SSE event, ID, çok satırlı data ve retry değerlerini sınırlı bir oturumda okur.
- WebSocket’e text mesajı gönderir ve belirlenen sayıda text/binary mesaj alır.
- gRPC sunucusuna plaintext veya TLS ile bağlanır; server reflection v1/v1alpha
  üzerinden yayınlanan servisleri listeler.

Her protokol işlemi kendi **İptal et** düğmesiyle durdurulabilir; SSE event’leri
ve WebSocket mesajları sabit adet/byte sınırlarıyla bellekte tutulur. Binary
WebSocket frame’leri kayıpsız base64 ve gerçek byte boyutuyla gösterilir.
gRPC adresi `host:port` biçiminde olmalı ve hedefte server reflection açık
olmalıdır. SSE, WebSocket ve gRPC için TLS sertifika doğrulamasını atlama seçeneği
yalnız HTTPS/WSS/TLS bağlantılarında etkinleşir; bu seçenek yalnız yerel veya
self-signed geliştirme hedeflerinde kullanılmalıdır.

## Workspace ve yerel veri

- Birden fazla request sekmesi açık tutulabilir; sekmeler sabitlenebilir,
  çoğaltılabilir, sıralanabilir ve kapatılan sekme geri açılabilir.
- Sol/sağ request panelleri gizlenebilir ve yeniden boyutlandırılabilir.
- Response paneli altta veya sağda kullanılabilir.
- Sistem, açık ve koyu tema desteklenir.
- `⌘/Ctrl K` komut paletini, `⌘/Ctrl N` yeni request’i açar.

Workspace taslakları WebView `localStorage` alanında tutulur. Response, çalışan
request ve geçici hata saklanmaz. Secret olarak tanınan environment değerleri
persist edilmez; doğrudan yazılmış secret header değerleri temizlenip devre dışı
bırakılır. `Bearer {{token}}` gibi yalnız variable reference içeren header’lar
korunur.

## Mimari

```text
cmd/validex/
├── main.go                         canbridge masaüstü girişi
└── frontend/src/
    ├── components/                 Request ve developer tool ekranları
    ├── lib/backend.ts              Tüm native çağrılar için typed adapter
    ├── lib/developerTools.ts       JSON, Spring, JWT ve DTO pure fonksiyonları
    └── stores/workspace.ts         Sekme, layout, tema ve güvenli persistence

internal/
├── core/                           OpenAPI yükleme ve contract drift
├── mockserver/                     Loopback HTTP mock server
├── diagnostics/                    Actuator, ortam, thread, log ve coverage
├── protocols/                      SSE, WebSocket ve gRPC istemcileri
└── canbridge/                      Native IPC, lifecycle ve typed bridge
```

Ana request akışı:

```text
React form
  → lib/backend.ts
  → canbridge native IPC
  → net/http
  → response + timeline
  → varsa OpenAPI contract kontrolü
```

Native işlem gerektiren mock, Actuator, ortam karşılaştırma, thread/log,
coverage ve protokol araçları typed adapter üzerinden ilgili Go paketine gider.
JSON, Spring response, JWT ve DTO dönüşümleri cihaz içinde frontend’de çalışır.
Geçici form state’i React’te, workspace ve layout state’i Zustand’da tutulur.

## Testler

Tüm kontroller:

```bash
make test
```

Bu hedef TypeScript typecheck, Vitest, normal Go testleri ve `canbridge` build
tag’li native runtime derleme testlerini çalıştırır. Hedefli komutlar için
[test rehberine](examples/testlerin-nasil-calistigi.md) bakın.

Ek kalite kontrolleri:

```bash
go test -race ./...
go test -race -tags canbridge ./internal/canbridge
go vet ./...
go vet -tags canbridge ./internal/canbridge ./cmd/validex
```
