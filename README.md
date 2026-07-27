# Validex

Validex, Java backend geliştiricileri için hazırlanmış bir Wails masaüstü API
inceleme ve tanılama aracıdır. HTTP request gönderir; OpenAPI contract farklarını,
Spring Boot çalışma zamanı verilerini ve farklı ortamların response’larını aynı
uygulamada incelemeye yardımcı olur.

## Hızlı başlangıç

Gereksinimler:

- Go 1.24 veya üzeri
- Node.js `^20.19.0` veya `>=22.12.0`
- npm ve `make`
- İşletim sisteminiz için [Wails v2 gereksinimleri](https://wails.io/docs/gettingstarted/installation)

Projeyi geliştirme modunda açmak için kök dizinde:

```bash
make dev
```

Bu komut sabitlenen Wails `v2.12.0` aracını kurar, React frontend’i ve Go
backend’i birlikte başlatır, ardından Validex masaüstü penceresini açar.

Production build:

```bash
make build
```

Çıktı `cmd/validex/build/bin` altında oluşur. macOS’ta:

```bash
open cmd/validex/build/bin/Validex.app
```

> Yalnız `npm run dev` çalıştırmak native Wails backend’ini başlatmaz. Mock
> server, dosya seçici, protokol ve Runtime, Environments, Thread & Logs,
> Coverage gibi native tanılama araçları için `make dev` kullanın.

## Uygulamayı kullanma

### HTTP request

1. **Requests → New request** ile bir sekme açın.
2. Method ve URL’yi yazın. `localhost:8080/health` gibi yerel adreslere
   otomatik olarak `http://` eklenir.
3. Gerekirse URL, header veya body içinde `{{variable}}` kullanın ve
   **Variables** bölümünde değerini girin.
4. **Send** ile request’i gönderin. Çalışan request **Cancel** ile durdurulabilir.
5. Response’un body, raw body, header, cookie ve timeline görünümlerini inceleyin.
6. Send menüsündeki **Copy as cURL** ile request’i cURL olarak kopyalayın.

Validex GET, POST, PUT, PATCH, DELETE, OPTIONS ve HEAD methodlarını; tekrarlanan
header’ları ve JSON body için otomatik `Content-Type` eklemeyi destekler. URL
alanı gönderimden önce düzenlenebilir ve eksik variable ya da geçersiz URL
gönderilmeden gösterilir.

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
├── main.go                         Wails masaüstü girişi
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
└── wailsapp/                       UI ile Go arasındaki typed bridge
```

Ana request akışı:

```text
React form
  → lib/backend.ts
  → Wails Bridge
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

Bu hedef TypeScript typecheck, Vitest, normal Go testleri ve `wails` build tag’li
bridge testlerini çalıştırır. Hedefli komutlar için
[test rehberine](examples/testlerin-nasil-calistigi.md) bakın.

Ek kalite kontrolleri:

```bash
go test -race ./...
go test -race -tags wails ./internal/wailsapp
go vet ./...
go vet -tags wails ./internal/wailsapp ./cmd/validex
```

### macOS imzalama

`make build`, sistemde tek Apple Development kimliği bulursa uygulamayı onunla
imzalar. Açık kimlik seçimi:

```bash
MACOS_SIGN_IDENTITY="Apple Development: ..." make build
```

İmzasız build’in başarısız olması isteniyorsa:

```bash
MACOS_SIGN_REQUIRED=1 make build
```
