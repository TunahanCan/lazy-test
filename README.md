# LazyTest

LazyTest, HTTP API istekleri hazırlayıp göndermek, yanıtları incelemek ve çalışan
isteklerden Java test kodu üretmek için geliştirilmiş bir masaüstü
uygulamasıdır.

Uygulama [Wails v2](https://wails.io/) ile çalışır. Arayüz React ve TypeScript,
native işlemler ile HTTP çağrıları Go ile geliştirilmiştir.

## Neler yapabilir?

- GET, POST, PUT, PATCH, DELETE, OPTIONS ve HEAD istekleri gönderir.
- URL, header ve body içinde `{{variable}}` kullanımını destekler.
- Çalışan isteği iptal eder ve anlaşılır ağ/timeout hata mesajları gösterir.
- Response body, status, süre, boyut, header, cookie, TLS ve timeline
  bilgilerini gösterir.
- Birden fazla request’i sekmelerde açık tutar.
- OpenAPI 3 YAML veya JSON dosyalarını içe aktarır.
- Çalışan request ve response üzerinden Java test/client kodu üretir.
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
4. LazyTest masaüstü penceresini açar.

İlk çalıştırmada Go ve npm bağımlılıkları indirileceği için açılış biraz uzun
sürebilir. Sonraki çalıştırmalar daha hızlıdır.

### `make` olmadan çalıştırma

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
cd cmd/lazytest
wails dev -m -nosyncgomod
```

`wails` komutu bulunamazsa Go binary dizininin (`go env GOPATH` çıktısı
altındaki `bin`) `PATH` içinde olduğundan emin olun.

## Uygulama nasıl kullanılır?

1. Sol taraftaki collection içinden bir request açın veya üst menüden
   **New → New request** seçin.
2. HTTP methodunu ve URL’yi girin.
3. Gerekirse Params, Authorization, Headers veya Body alanlarını düzenleyin.
4. Üst bölümdeki **Send** butonuna basın.
5. Alt response panelinden body, header, cookie ve timeline bilgilerini
   inceleyin.
6. Çalışan isteği durdurmak için **Cancel** butonunu kullanın.

Environment seçildiğinde `{{baseUrl}}` gibi değişkenler request gönderilmeden
önce çözülür:

```text
{{baseUrl}}/v1/users
```

OpenAPI dosyası eklemek için üst menüdeki **Import OpenAPI** seçeneğini
kullanın. Java kodu üretmek için **Send** butonunun yanındaki açılır menüden
**Generate Java test** seçeneğini açın.

## Native uygulama oluşturma

Production build almak için projenin kök dizininde:

```bash
make build
```

Çıktılar `cmd/lazytest/build/bin` dizinine yazılır.

macOS uygulamasını açmak için:

```bash
open cmd/lazytest/build/bin/LazyTest.app
```

Windows ve Linux çıktıları da build alınan işletim sisteminde aynı `bin`
dizini altında oluşturulur.

## Testler

Tüm frontend ve Go kontrollerini çalıştırmak için:

```bash
make test
```

Bu komut TypeScript typecheck, Vitest testleri, Go paket testleri ve Wails
bridge testlerini çalıştırır.

## Proje yapısı

```text
cmd/lazytest/
├── main.go                 Wails uygulama girişi
├── wails.json              Native build ayarları
├── build/                  İkon ve platform kaynakları
└── frontend/               React + TypeScript arayüzü

internal/wailsapp/           Typed Wails bridge ve native işlemler
internal/core/               OpenAPI ve ortak API işlevleri
internal/appsvc/             Yeniden kullanılabilir uygulama servisleri
internal/lt/                 Load-test engine
internal/tcp/                TCP engine
internal/config/             Yapılandırma modelleri
internal/report/             JSON ve JUnit raporları
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
`cmd/lazytest/frontend/src/lib/backend.ts` içindeki typed adapter üzerinden
`internal/wailsapp` bridge’ine gider.

## Mevcut durum

HTTP request gönderme, iptal, OpenAPI import ve Java proje export işlemleri
native uygulamada gerçek backend ile çalışır.

Şu bölümler halen geliştirme aşamasındadır:

- Workspace, collection, environment ve history verileri örnek veridir ve
  kalıcı bir backend deposuna yazılmaz.
- Runner ekranı bir UX demosudur; gerçek load-test engine’ine bağlı değildir.
- Scripts ve assertions alanları henüz çalıştırılabilir değildir.
- OAuth 2.0, mTLS, keychain ve proxy entegrasyonu tamamlanmamıştır.
- Windows ve Linux native paketleri henüz CI üzerinde doğrulanmamaktadır.
