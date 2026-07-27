# Validex

Validex, HTTP API istekleri hazırlayıp göndermek, yanıtları incelemek ve çalışan
isteklerden Java test kodu üretmek için geliştirilmiş bir masaüstü
uygulamasıdır.

Uygulama [Wails v2](https://wails.io/) ile çalışır. Arayüz React ve TypeScript,
native işlemler ile HTTP çağrıları Go ile geliştirilmiştir.

## Neler yapabilir?

- GET, POST, PUT, PATCH, DELETE, OPTIONS ve HEAD istekleri gönderir.
- `localhost:8080` gibi şemasız adresleri otomatik olarak geçerli HTTP/HTTPS
  URL’lerine dönüştürür.
- URL, header ve body içinde `{{variable}}` kullanımını destekler.
- Çalışan isteği iptal eder ve anlaşılır ağ/timeout hata mesajları gösterir.
- Response body, status, süre, boyut, header, cookie, TLS ve timeline
  bilgilerini gösterir.
- Birden fazla request’i sekmelerde açık tutar.
- OpenAPI 3 YAML veya JSON dosyalarını içe aktarır.
- Çalışan request ve response üzerinden Java test/client başlangıç kodu üretir.
- REST Assured, MockMvc, WebTestClient, WireMock, Spring Cloud Contract,
  Java HttpClient, Spring RestClient ve Spring WebClient çıktıları sunar.
- Üretilen tek dosyayı kaydeder veya Maven/Gradle proje iskeleti oluşturur.
- Açık/koyu tema ile yeniden boyutlandırılabilir panel yerleşimini hatırlar.

## Gereksinimler

Projeyi çalıştırmadan önce sistemde şunlar bulunmalıdır:

- Go 1.24 veya üzeri
- Node.js 22
- npm
- `make`
- İşletim sisteminin Wails için gereken native derleme araçları

Wails aracını ayrıca elle kurmanız gerekmez. `make dev` ve `make build`,
projede kullanılan Wails `v2.12.0` sürümünü otomatik kurar.

## Çalıştırma

Projenin kök dizininde:

```bash
make dev
```

Bu komut:

1. Wails aracını kurar.
2. Frontend bağımlılıklarını hazırlar.
3. Vite geliştirme sunucusunu ve Go backend’i başlatır.
4. Validex masaüstü penceresini açar.

İlk çalıştırmada Go ve npm bağımlılıkları indirileceği için açılış biraz uzun
sürebilir. Sonraki çalıştırmalar daha hızlıdır.

### `make` olmadan çalıştırma

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
cd cmd/validex
wails dev -m -nosyncgomod
```

`wails` komutu bulunamazsa Go binary dizininin (`go env GOPATH` çıktısı
altındaki `bin`) `PATH` içinde olduğundan emin olun.

## Uygulama nasıl kullanılır?

1. Karşılama ekranındaki **New request** butonunu kullanın. Açık bir çalışma
   alanındaysanız üst menüdeki **New → New request** yolu da kullanılabilir.
2. HTTP methodunu ve URL’yi girin.
3. Gerekirse **Variables → Add variable** ile değişken ekleyin; Headers veya
   Body alanlarını düzenleyin.
4. Üst bölümdeki **Send** butonuna basın.
5. Alt response panelinden body, header, cookie ve timeline bilgilerini
   inceleyin.
6. Çalışan isteği durdurmak için **Cancel** butonunu kullanın.

Environment seçildiğinde `{{baseUrl}}` gibi değişkenler request gönderilmeden
önce çözülür:

```text
{{baseUrl}}/v1/users
```

`localhost:8080/health` ve `10.0.0.5:8080/health` gibi yerel adreslere
`http://`, genel domain’lere ise `https://` otomatik eklenir. Yalnız HTTP ve
HTTPS protokolleri desteklenir.

Adı token, parola, API key veya Authorization olarak tanınan environment ve
header değerleri tarayıcı depolamasına yazılmaz. Uygulamayı yeniden açtığınızda
bu değerleri tekrar girmeniz gerekir. Hassas verileri URL veya request body
içine doğrudan yazmayın; bu alanlar workspace ile birlikte saklanır.

OpenAPI dosyası eklemek için karşılama ekranındaki veya üst menüdeki
**Import OpenAPI** seçeneğini kullanın. Arayüzü kalabalıklaştırmamak için en
fazla ilk 8 endpoint sekmede açılır; bildirimde dosyada bulunan toplam endpoint
sayısı da gösterilir. Java kodu üretmek için **Send** butonunun yanındaki açılır
menüden **Generate Java test** seçeneğini açın.

## Native uygulama oluşturma

Production build almak için projenin kök dizininde:

```bash
make build
```

Çıktılar `cmd/validex/build/bin` dizinine yazılır.

macOS uygulamasını açmak için:

```bash
open cmd/validex/build/bin/Validex.app
```

Windows ve Linux çıktıları da build alınan işletim sisteminde aynı `bin`
dizini altında oluşturulur.

### macOS imzalama

`make build`, sistemde yalnızca bir Apple Development sertifikası bulursa
uygulamayı yerel geliştirme için otomatik olarak imzalar. Birden fazla
sertifika varsa veya Developer ID kullanacaksanız imza kimliğini açıkça seçin:

```bash
MACOS_SIGN_IDENTITY="Apple Development: ..." make build
```

İmzalı build zorunluysa şu komutu kullanın:

```bash
MACOS_SIGN_REQUIRED=1 make build
```

Dış dağıtım için Developer ID imzasına ek olarak notarization ve stapling
ayrıca yapılandırılmalıdır.

## Testler

Tüm frontend ve Go kontrollerini çalıştırmak için:

```bash
make test
```

Bu komut TypeScript typecheck, Vitest testleri, Go paket testleri ve Wails
bridge testlerini çalıştırır.

## Proje yapısı

```text
cmd/validex/
├── main.go                 Wails uygulama girişi
├── wails.json              Native build ayarları
├── build/                  İkon ve platform kaynakları
└── frontend/               React + TypeScript arayüzü

internal/wailsapp/           Typed Wails bridge ve native işlemler
internal/core/               OpenAPI ve ortak API işlevleri
internal/appsvc/             Gelecekte bağlanacak uygulama servisleri
internal/lt/                 Gelecekte bağlanacak load-test engine
internal/tcp/                Gelecekte bağlanacak TCP engine
internal/config/             Yeniden kullanılabilir yapılandırma modelleri
internal/report/             Yeniden kullanılabilir raporlama paketleri
```

Temel çalışma akışı:

```text
React arayüzü
    → typed frontend adapter
    → Wails binding
    → Go bridge
    → HTTP / OpenAPI / native dosya işlemleri
```

Frontend componentleri Wails runtime’ını doğrudan çağırmaz. Backend çağrıları
`cmd/validex/frontend/src/lib/backend.ts` içindeki typed adapter üzerinden
`internal/wailsapp` bridge’ine gider.

## Mevcut durum

HTTP request gönderme, iptal, OpenAPI import ve Java proje export işlemleri
native uygulamada gerçek backend ile çalışır.

Bilinen sınırlar:

- Açık sekmeler, environment değerleri ve arayüz yerleşimi cihazdaki WebView
  depolamasında tutulur; dosya veya bulut ile senkronize edilmez.
- OAuth 2.0, mTLS, keychain ve proxy entegrasyonu tamamlanmamıştır.
- OpenAPI importu henüz kalıcı bir collection oluşturmaz; tek importta en fazla
  8 endpoint çalışma sekmesi olarak açılır.
- Üretilen Java proje iskeletleri henüz Maven/Gradle ile otomatik derlenerek
  doğrulanmamaktadır.
- Windows ve Linux native paketleri henüz CI üzerinde doğrulanmamaktadır.
