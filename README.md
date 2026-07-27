<p align="center">
  <img
    src="cmd/validex/build/appicon.svg"
    width="148"
    height="148"
    alt="Validex uygulama ikonu"
  >
</p>

<h1 align="center">Validex</h1>

<p align="center">
  <strong>API geliştirme, sözleşme kontrolü ve backend tanılaması için tek çalışma alanı.</strong>
</p>

<p align="center">
  HTTP istemcisi · OpenAPI kalite araçları · Spring Boot tanılama · Mock ve
  protokoller · Headless otomasyon
</p>

Validex, backend geliştirme sırasında farklı araçlara dağılan işleri tek bir
yerel masaüstü uygulamasında birleştirir. İstek gönderin, gerçek yanıtı OpenAPI
sözleşmesiyle karşılaştırın, collection ve assertion’ları çalıştırın, DNS ve
yönlendirme zincirini ölçün, Spring çalışma zamanını inceleyin.

Masaüstü arayüzü Türkçe ve İngilizce kullanılabilir. Aynı Go çekirdeği headless
CLI üzerinden CI süreçlerine de taşınabilir. Linux, macOS ve Windows için kaynak
koddan build hedefleri bulunur; proje şu anda imzalı installer veya paket
yöneticisi dağıtımı vadetmez.

## Neden Validex?

Bir endpoint’in yalnızca `200` dönmesi çoğu zaman yeterli değildir. Yanıt
sözleşmeye uyuyor mu, yönlendirmede zaman nerede kayboluyor, assertion neden
başarısız, Actuator metriği işlem öncesine göre nasıl değişti? Validex bu
soruların yanıtlarını aynı çalışma alanında görünür kılar.

Uygulama, geliştiricinin kontrolünü korumaya odaklanır: güvenlik header’larını
kendiliğinden eklemez, mock sunucuyu loopback üzerinde tutar, hassas workspace
değerlerini kalıcı depolamadan önce temizler ve otomasyon sonuçlarını
makine-okunur JSON olarak üretebilir.

## Öne çıkanlar

| Çalışma alanı | Sağladığı değer |
| --- | --- |
| **Requests** | Çoklu sekme, variable, header/body düzenleme, iptal, cURL kopyalama, body/header/cookie/timeline inceleme |
| **OpenAPI** | Endpoint arama ve açma, gerçek yanıtla contract drift karşılaştırması, deterministik lint kuralları |
| **Automation** | Collection Runner, response assertion sistemi, DNS/yönlendirme analizi ve headless CLI |
| **Diagnostics** | Spring hata özeti, JWT inceleme, Actuator runtime metrikleri, ortam farkı, thread/log ve endpoint coverage |
| **Developer tools** | Loopback Mock Server, JSON format/diff/JSONPath/schema ve Java DTO’dan mock JSON |
| **Protocols** | SSE, WebSocket ve gRPC reflection istemcileri; iptal ve güvenli oturum sınırları |

Arayüz sistem, açık ve koyu tema; Türkçe/İngilizce dil seçimi; klavye
navigasyonu ve dar ekranlarda uyarlanan paneller sunar.

## 60 saniyede hızlı başlangıç

Temel gereksinimler:

- Go 1.24 veya üzeri
- Node.js `^20.19.0` veya `>=22.12.0`
- npm ve `make`
- işletim sisteminin native WebView geliştirme bileşenleri

Repoyu alın:

```bash
git clone https://github.com/TunahanCan/validex.git
cd validex
```

Ubuntu veya Debian’da native bağımlılıkları bir kez kurun:

```bash
sudo apt update
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev zenity
```

Ardından uygulamayı geliştirme modunda açın:

```bash
make dev
```

İlk çalıştırmada frontend paketleri kurulur. Vite geliştirme sunucusu ve Go
backend’i birlikte başlar; Validex sistem WebView’i içinde otomatik açılır.
`make dev`, Linux, macOS ve Windows’taki native geliştirme penceresinde Validex
ikonunu kullanır.

> Yalnız `npm run dev` çalıştırmak native canbridge backend’ini başlatmaz. Mock
> Server, dosya seçici, protokoller ve Runtime, Environments, Thread & Logs,
> Coverage gibi native araçlar için `make dev` kullanın.

### Kaynak koddan production build

Çalıştığınız işletim sistemi için masaüstü uygulamasını ve headless CLI’ı
üretin:

```bash
make build
```

Çıktılar `cmd/validex/build/bin` altında oluşur:

| Platform | Masaüstü çıktısı | Çalıştırma |
| --- | --- | --- |
| Linux | `validex` | `./cmd/validex/build/bin/validex` |
| macOS | `Validex.app` | `open cmd/validex/build/bin/Validex.app` |
| Windows | `validex.exe` | `.\cmd\validex\build\bin\validex.exe` |

CLI çıktısı Linux ve macOS’ta `validex-cli`, Windows’ta `validex-cli.exe`
adını alır.

Linux’ta build’i kullanıcı uygulama menüsüne ikonu ile eklemek için:

```bash
make install-linux
```

`make install-linux` production build’i de oluşturur; yalnız geçerli kullanıcı
için launcher kaydını ve Validex ikonunu kurar. Sistem geneline paket veya
installer kurmaz. macOS build’i ikonu `.app` bundle’ına, Windows build’i ise
`.exe` dosyasına ve uygulama penceresine gömer.

`make build`, macOS’ta Apple Development kimliği aramaz ve proje tarafından ek
bir Keychain veya `codesign` adımı çalıştırmaz. Üretilen uygulama yerel,
imzasız bir kaynak build’idir.

## İlk 5 dakika

### 1. İlk isteğinizi gönderin

1. **Requests → New request** ile bir sekme açın.
2. `http://` veya `https://` ile başlayan bir API adresi girin.
3. Gerekli header veya body’yi ekleyip **Send** düğmesine basın.
4. Sonucu response alanındaki body, raw body, header, cookie ve timeline
   sekmelerinden inceleyin.

### 2. Sözleşme farkını görün

1. **New → Import OpenAPI** ile repo kökündeki
   [`openapi.sample.yaml`](openapi.sample.yaml) dosyasını seçin.
2. **APIs** panelinden bir endpoint açın.
3. İsteği gönderin; eşleşen JSON schema bulunduğunda **Contract** sekmesi gerçek
   yanıt ile sözleşme arasındaki farkları gösterir.

### 3. Bir collection çalıştırın

**Automation → Collection Runner** ekranındaki örneği kullanabilir veya
[`collection.sample.json`](collection.sample.json) içeriğini düzenleyebilirsiniz.
Örnek collection, varsayılan olarak `http://localhost:8080/actuator/health`
adresinde çalışan bir servis bekler.

Çalıştırma sonrası request sayısı, geçen/kalan assertion’lar, süreler ve hata
nedenleri aynı ekrandaki **Run result** panelinde görünür. DNS/yönlendirme
ölçümleri ve OpenAPI lint bulguları da Automation içindeki ilgili aracın sonuç
panelinde gösterilir.

### 4. Dili ve görünümü seçin

**Ayarlar → Dil** üzerinden Türkçe veya English seçin. Dil tercihi cihazda
saklanır; ilk açılışta sistem dili dikkate alınır. Aynı menüden sistem, açık veya
koyu tema seçilebilir.

## Headless CLI ve CI

Masaüstü arayüzündeki Collection Runner, DNS/yönlendirme analizi ve OpenAPI lint
işlemleri aynı Go çekirdeği üzerinden terminalde çalıştırılabilir:

```bash
go run ./cmd/validex-cli run --file collection.sample.json
go run ./cmd/validex-cli inspect --url https://example.com --json
go run ./cmd/validex-cli lint --file openapi.sample.yaml --strict
```

`make build` sonrasında `go run ./cmd/validex-cli` yerine Linux ve macOS’ta
`cmd/validex/build/bin/validex-cli`, Windows’ta
`cmd\validex\build\bin\validex-cli.exe` kullanılabilir.

CI için tipik kalite kapıları:

```bash
make build-cli
./cmd/validex/build/bin/validex-cli lint --file openapi.yaml --strict
./cmd/validex/build/bin/validex-cli run --file collection.json --json
```

`run` komutu runtime variable override’larını `--variables variables.json` ile
alır. Bütün komutlar makine tarafından işlenebilir `--json` çıktısını destekler.
Exit code sözleşmesi:

- `0`: işlem başarılı;
- `1`: assertion, request veya lint kalite kontrolü başarısız;
- `2`: komut veya flag kullanımı geçersiz.

`lint --strict`, warning bulunan belgeleri de başarısız kabul eder. Bu davranış
Validex CLI’ı CI job’larında doğrudan kalite kapısı olarak kullanmaya imkân
verir.

Collection assertion’ları şu hedefleri destekler:

- `status`, `header`, `body`, `json_path`, `duration_ms`;
- `equals`, `not_equals`, `contains`, `exists`, `not_exists`, `less_than`,
  `greater_than`, `matches`.

Variable önceliği collection değerleri, CLI/masaüstü runtime override’ları ve
request-local değerler şeklindedir; en son katman kazanır. Collection, request
body/response, timeout, regex, header ve request sayısı güvenli üst sınırlarla
çalışır.

Assertion’lar tam response üzerinde değerlendirilir. Raporda tutulan response
body veya header toplam kotayı aşarsa `bodyTruncated` / `headersTruncated`
işaretlenir. Variable içeren URL şablonundaki tüm variable değerleri ile query
değerleri raporda `REDACTED` olarak gösterilir; gerçek değerler terminal veya UI
çıktısına taşınmaz.

OpenAPI lint ağdan veya komşu dosyalardan `$ref` indirmez. Çok dosyalı
sözleşmeleri lint etmeden önce tek bir YAML/JSON belge halinde bundle edin. Bu
sınır, lint sırasında beklenmeyen dosya veya ağ erişimini engeller.

## Ayrıntılı özellik rehberi

### HTTP istekleri

1. **Requests → New request** ile bir sekme açın.
2. URL’yi yazın veya doğrudan yapıştırın. Query parametreleri **Params**
   bölümünde algılanır.
3. URL, header veya body içinde `{{variable}}` kullanın ve değerini
   **Variables** bölümünde girin.
4. Gerekli `Accept`, `Content-Type` veya `Authorization` değerlerini
   **Headers** bölümüne kendiniz ekleyin. **Auth** görünümündeki Authorization
   kısayolu satırı kapalı durumda hazırlar; değerini girip etkinleştirene kadar
   request ile gönderilmez.
5. **Send** ile gönderin. Çalışan request **Cancel** ile durdurulabilir.
6. Response body, raw body, header, cookie ve timeline görünümlerini inceleyin.
7. Send menüsündeki **Copy as cURL** ile isteği cURL olarak kopyalayın.

Validex GET, POST, PUT, PATCH, DELETE, OPTIONS ve HEAD methodlarını ve
tekrarlanan header adlarını destekler. Yeni request boş header listesiyle açılır;
Validex `Accept`, `Authorization`, `Content-Type` veya başka bir security
header’ını kendiliğinden eklemez. HTTP’nin zorunlu `Host` ve gövde aktarım
header’ları transport tarafından gönderilebilir.

Yapıştırılan URL blur veya gönderim sırasında yeniden yazılmaz. Query
parametrelerinin sırası, tekrarlanan adları, boş değerleri ve encoding’i
kullanıcı düzenleyene kadar korunur. Params üzerindeki ekleme, düzenleme ve
silme URL’nin query bölümünü değiştirir; URL tek kaynak olarak kalır. Eksik
variable veya geçersiz URL request gönderilmeden gösterilir.

### OpenAPI ve contract drift

**New → Import OpenAPI** ile OpenAPI 3 YAML, YML veya JSON dosyası seçin.
Belgedeki tüm endpoint’ler sanallaştırılmış **APIs** paneline yüklenir; gereken
endpoint’i arayıp tek tıkla request sekmesi olarak açabilirsiniz. İçe aktarım
çalışma alanını çok sayıda sekmeyle doldurmaz. `{id}` path parametreleri request
URL’sine `{{id}}` olarak aktarılır.

OpenAPI’den açılmış bir request’in operation method ve path’i korunduğunda,
eşleşen status veya `default` response altında gerçek `Content-Type` ile eşleşen
JSON schema varsa response otomatik karşılaştırılır. Buna
`application/problem+json` ve vendor `+json` media type’ları dahildir.
**Contract** sekmesi şu farkları gösterir:

- eksik veya fazladan alan;
- tip uyuşmazlığı;
- enum ihlali;
- sayı, metin, dizi ve nesne sınırları;
- yaygın string formatı ihlalleri.

OpenAPI dokümanları yalnız mevcut uygulama oturumunda bellekte tutulur. Contract
cache’i en son sekiz dokümanla sınırlıdır. Uygulama yeniden açıldıktan sonra
contract kontrolü için dosyayı yeniden içe aktarın.

### Mock Server

**Mock Server** çalışma alanında:

- route’u method, path, status, header, JSON body ve gecikme ile tanımlayın;
- `{id}` biçimindeki path parametrelerini kullanın;
- OpenAPI response example veya schema’larından mock route üretin;
- aktif request’in son JSON response’unu seçili route’a aktarın;
- port `0` ile boş bir portu otomatik seçin;
- eşleşen ve eşleşmeyen istek geçmişini izleyin.

Mock server yalnız `127.0.0.1` adresine bağlanır. Editörde yapılan manuel route
değişiklikleri **Değişiklikleri uygula** seçilmeden çalışan sunucuya geçirilmez.

### JSON Lab ve response DTO

**JSON Lab** cihaz üzerinde şu işlemleri yapar:

- format, minify ve anahtar sıralama;
- iki JSON arasında yapısal/değer farkı ve ignore path;
- güvenli JSONPath alt kümesiyle sorgulama;
- JSON’dan JSON Schema çıkarma;
- Java `record` veya field içeren response class’tan deterministik mock JSON
  oluşturma.

Üretilen JSON doğrudan kopyalanıp mock route body’sinde kullanılabilir.

### Spring ve runtime tanılama

**Diagnostics** çalışma alanı altı araç içerir:

- **Spring Error:** ProblemDetail ve Bean Validation alan hataları için özet;
  400/401/403/500’e özel kontrol önerileri ve 404/409/5xx kategorileri.
- **JWT:** expiration, not-before, issuer, audience, subject, role ve scope
  görüntüleme.
- **Runtime:** Spring Boot Actuator health, mappings ve seçili metric snapshot’ı.
- **Environments:** aynı request’i local/test/staging hedeflerine gönderip status,
  header ve JSON farklarını karşılaştırma.
- **Thread & Logs:** thread dump’ta blocked thread/deadlock analizi ve
  trace/correlation ID ile literal log araması.
- **Coverage:** içe aktarılan OpenAPI endpoint’lerini bu oturumda Validex ile
  başarıyla gönderilen request’lerle veya elle girilen çağrı listesiyle
  eşleştirme.

Runtime ekranındaki varsayılan metric listesi JVM memory/thread/GC, HikariCP,
Redis/Lettuce, Kafka ve RabbitMQ adlarını içerir. **Baseline al** ile ilk
snapshot’ı saklayıp request veya servis işlemi sonrasında ikinci snapshot’ı
alarak değer ve yüzde farkını görebilirsiniz. İlgili Actuator endpoint ve
metric’lerinin hedef uygulamada erişime açık olması gerekir.

### SSE, WebSocket ve gRPC

**Protocols** çalışma alanı gerçek bağlantılar kurar:

- SSE event, ID, çok satırlı data ve retry değerlerini sınırlı bir oturumda okur.
- WebSocket’e text mesajı gönderir ve belirlenen sayıda text/binary mesaj alır.
- gRPC sunucusuna plaintext veya TLS ile bağlanır; server reflection v1/v1alpha
  üzerinden yayınlanan servisleri listeler.

Her protokol işlemi kendi **İptal et** düğmesiyle durdurulabilir. SSE event’leri
ve WebSocket mesajları sabit adet/byte sınırlarıyla bellekte tutulur. Binary
WebSocket frame’leri kayıpsız base64 ve gerçek byte boyutuyla gösterilir.

gRPC adresi `host:port` biçiminde olmalı ve hedefte server reflection açık
olmalıdır. SSE, WebSocket ve gRPC için TLS sertifika doğrulamasını atlama
seçeneği yalnız HTTPS/WSS/TLS bağlantılarında etkinleşir; bu seçenek yalnız
yerel veya self-signed geliştirme hedeflerinde kullanılmalıdır.

## Workspace, görünüm ve yerel veri

- Birden fazla request sekmesi açık tutulabilir; sekmeler sabitlenebilir,
  yeniden adlandırılabilir, çoğaltılabilir, sıralanabilir ve kapatılan sekme geri
  açılabilir.
- İsimsiz request için URL’den ayırt edilebilir bir ad önerilebilir.
- Sol ve sağ request panelleri gizlenebilir ve yeniden boyutlandırılabilir.
- Response paneli altta veya sağda kullanılabilir.
- Sistem, açık ve koyu tema desteklenir.
- Arayüz **Ayarlar → Dil** üzerinden Türkçe veya İngilizce kullanılabilir.
- Dar ekranlarda araç navigasyonu alt bara, request ve context panelleri
  kapatılabilir çekmecelere dönüşür. Yatay response düzeni okunabilirlik için
  geçici olarak alta alınır.
- macOS’ta `⌘`, Linux ve Windows’ta `Ctrl` ile gösterilen kısayollar platforma
  göre uyarlanır. `⌘/Ctrl K` komut paletini, `⌘/Ctrl N` yeni request’i açar.

Workspace taslakları WebView `localStorage` alanında tutulur. Response, çalışan
request ve geçici hata saklanmaz. Secret olarak tanınan environment değerleri
persist edilmez; doğrudan yazılmış secret header değerleri temizlenip devre dışı
bırakılır. `Bearer {{token}}` gibi yalnız variable reference içeren header’lar
korunur.

## Güvenlik ve operasyon sınırları

- JWT aracı token’ı yerel olarak decode eder; imzayı doğrulamaz.
- Ortam karşılaştırması GET/HEAD/OPTIONS dışındaki methodları açık kullanıcı
  izni olmadan göndermez.
- Log ve thread dump metni yalnız uygulama belleğinde analiz edilir.
- Actuator erişim header’ları kullanıcı tarafından açıkça girilir.
- Mock Server dış ağ arayüzüne değil yalnız loopback adresine bağlanır.
- OpenAPI lint harici `$ref` kaynaklarını kendiliğinden indirmez.
- TLS doğrulamasını atlama yalnız yerel veya self-signed geliştirme hedefleri
  içindir.

Validex bir API güvenlik tarayıcısı, JWT imza doğrulayıcısı veya production
monitoring servisi değildir. Sağladığı sonuçlar geliştirme ve tanılama
bağlamında değerlendirilmelidir.

## Platform gereksinimleri

| Platform | Native gereksinimler |
| --- | --- |
| Linux | GTK 3, WebKitGTK 4.1 geliştirme paketleri; native dosya seçici için `zenity` veya `kdialog` |
| macOS | Xcode Command Line Tools ve sistem WebKit’i |
| Windows | MinGW-w64 C++14 toolchain (`windres` dahil) ve WebView2 Runtime |

`make build` üzerinde çalıştığı işletim sistemi için çıktı üretir; bu hedef bir
cross-compiler veya dağıtım installer’ı değildir.

## Sorun giderme ve runtime notları

### Linux’ta WebKitGTK bulunamıyor

Yeni Linux build’i `webkit2gtk-4.1` kullanır. Ubuntu/Debian’da:

```bash
sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev
pkg-config --modversion gtk+-3.0 webkit2gtk-4.1
```

### Snap `GLIBC_PRIVATE` / `libpthread` hatası

VS Code gibi Snap uygulamalarından açılan terminaller, Snap `core20` GTK ve
glibc kütüphane yollarını child process’lere aktarabilir. Linux’ta `make dev`,
bu yolları yalnız host üzerinde derlenen native süreçten ayıklar. Böylece Snap
kütüphaneleri sistem WebKitGTK ve glibc sürümleriyle karışmaz.

### Ubuntu uygulama menüsünde ikon görünmüyor

Çıplak Linux binary’si pencere ikonunu taşır ancak GNOME uygulama menüsü için
ayrıca bir launcher kaydı gerekir. Kullanıcı hesabınıza kayıt etmek için:

```bash
make install-linux
```

Bu hedef binary’yi `~/.local/bin`, launcher dosyasını
`~/.local/share/applications` ve aynı Validex SVG ikonunu hicolor tema dizinine
kurar. Masaüstü kabuğu önbelleği hemen yenilemezse oturumu kapatıp açın.

### Arayüz açılıyor ama native araçlar çalışmıyor

Yalnız frontend geliştirme sunucusunu çalıştırdıysanız canbridge backend’i
yoktur. Repo kökünden `make dev` kullanın. React dosyaları Vite’tan gelir; Go
çağrıları HTTP RPC yerine native canbridge IPC kanalından geçer.

Geliştirme portu `34116`dan başlayarak seçilir; doluysa sıradaki boş loopback
portu kullanılır.

### Production portu ve workspace origin’i

Production frontend’i binary’ye gömülür. Canbridge önce `127.0.0.1:34117`
adresini kullanır; bu port doluysa işletim sisteminden boş bir loopback portu
seçer. İsteklerdeki Host kontrolü seçilen gerçek porta göre uygulanır. Bu sunucu
Go RPC taşımaz; backend çağrıları native WebView IPC kullanır.

Başlangıçta canbridge adı, efektif frontend URL’si, portu, modu ve transport
türü terminale yazılır. Tercih edilen `34117` portu kullanıldığında sabit origin
workspace `localStorage` verisini sonraki açılışlarda korur. Dinamik fallback
portu farklı bir origin olduğundan yalnız o uygulama örneğinin workspace alanı
ayrıdır.

Önceki masaüstü runtime origin’inde kaydedilmiş workspace, canbridge origin’ine
otomatik taşınamaz. Runtime değişiminden sonraki ilk açılışta yerel workspace
bir kez sıfırlanır.

## Mimari

```text
cmd/validex/
├── main.go                         canbridge masaüstü girişi
└── frontend/src/
    ├── app/                         Tema ve workspace registry/composition
    ├── components/                 App shell ve uygulama chrome bileşenleri
    ├── features/
    │   ├── requests/               Request, tab ve response çalışma alanı
    │   ├── openapi/                Tek OpenAPI import akışı
    │   ├── mock-server/            Mock ekranı ve feature modeli
    │   ├── json-lab/               JSON ekranı ve işlem modeli
    │   ├── diagnostics/            Tanılama ekranı ve feature modeli
    │   ├── protocols/              SSE, WebSocket ve gRPC ekranı/modeli
    │   └── automation/             Runner, ağ analizi ve lint ekranı
    ├── i18n/                       TR/EN catalog ve kalıcı locale provider
    ├── shared/ui/                  Ortak erişilebilir UI primitive’leri
    ├── lib/backend.ts              Tüm native çağrılar için typed adapter
    ├── lib/developerTools.ts       JSON, Spring, JWT ve DTO pure fonksiyonları
    └── stores/workspace.ts         Sekme, layout, tema ve güvenli persistence

cmd/validex-cli/
└── main.go                         Headless CLI composition root

internal/
├── assertions/                     Saf response assertion motoru
├── runner/                         Bounded collection use-case ve HTTP portu
├── netinspector/                   DNS ve redirect analiz servisi
├── openapilint/                    Deterministik OpenAPI kalite kuralları
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

Frontend özellikleri ekran ile ona ait saf model/validation kodunu aynı
`features/<özellik>` dizininde tutar. Ortak görsel davranışlar `shared/ui`,
uygulama seviyesindeki registry ve tema davranışı `app` altında bulunur.
Feature’lar birbirlerinin ekran bileşenlerini doğrudan kullanmaz; native erişim
yalnız `lib/backend.ts` adapter’ından geçer. Workspace listesi registry pattern,
OpenAPI içe aktarımı facade/hook, backend erişimi adapter ve geliştirici araç
modları strategy benzeri tanımlar kullanır.

## Testler

Tüm kontroller:

```bash
make test
```

Bu hedef TypeScript typecheck, Vitest, normal Go testleri ve `canbridge` build
tag’li native runtime derleme testlerini çalıştırır. Hedefli komutlar için
[`examples/testlerin-nasil-calistigi.md`](examples/testlerin-nasil-calistigi.md)
rehberine bakın.

Ek kalite kontrolleri:

```bash
go test -race ./...
go test -race -tags canbridge ./internal/canbridge
go vet ./...
go vet -tags canbridge ./internal/canbridge ./cmd/validex
```
