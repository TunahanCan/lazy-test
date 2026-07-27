# Validex

Validex, HTTP API istekleri hazırlamak, göndermek, yanıtları incelemek ve açık
istekten Java test/client ya da contract başlangıç dosyaları üretmek için
geliştirilmiş bir masaüstü uygulamasıdır.

Uygulama [Wails v2](https://wails.io/) ile çalışır. Arayüz React ve TypeScript
ile, native işlemler ve HTTP çağrıları Go ile geliştirilmiştir.

## Mevcut özellikler

### HTTP çalışma alanı

- GET, POST, PUT, PATCH, DELETE, OPTIONS ve HEAD istekleri gönderir.
- URL, header ve request body içinde `{{variable}}` değişkenlerini çözer.
- `localhost:8080` gibi şemasız yerel adreslere `http://`, genel adreslere
  `https://` ekler. Yalnız HTTP ve HTTPS URL’lerini kabul eder.
- Tekrarlanan header adlarını destekler.
- JSON body için `Content-Type` verilmemişse
  `application/json` header’ını otomatik ekler.
- İstek sürerken **Cancel** ile native HTTP çağrısını iptal eder.
- Eksik değişkeni ve geçersiz URL’yi göndermeden önce belirtir; ağ ve timeout
  hatalarını response alanında gösterir.
- Açık isteği tanımlı değişkenleri çözerek cURL komutu olarak kopyalar.

### Response inceleme

- Status kodu, süre, boyut, content type ve HTTP protokolünü gösterir.
- Formatlanmış body ve ham response body arasında geçiş sağlar.
- Response header ve cookie’lerini listeler.
- DNS, bağlantı, TLS ve sunucu bekleme aşamalarını timeline üzerinde gösterir.
- Uzak adresi, TLS özetini ve response’ta bulunan trace kimliğini gösterir.

### Workspace

- Birden fazla isteği sekmelerde açık tutar.
- Sekmeleri sabitleme, çoğaltma, sıralama ve kapatılan sekmeyi yeniden açma
  işlemlerini destekler. Temiz, sabitlenmemiş ve çalışmayan sekmeler topluca
  kapatılabilir.
- Sistem, açık ve koyu tema seçenekleri sunar.
- Sol/sağ panellerin görünürlüğünü ve genişliğini, response panelinin
  konumunu ve boyutunu ayarlamaya izin verir.
- Komut paletini `⌘ K`, yeni isteği `⌘ N`, son kapatılan sekmeyi `⇧ ⌘ T` ile
  açar.

Workspace durumu cihazdaki WebView `localStorage` alanında tutulur. İstek
taslakları, secret anahtarı olarak tanınmayan environment değerleri, sekmeler,
tema ve panel düzeni uygulama yeniden açıldığında geri yüklenir. Response, hata
ve çalışan istek durumu saklanmaz.

Secret olarak tanınan environment anahtarlarının değerleri saklanmaz. Secret
header’lara doğrudan yazılan değerler `localStorage`’a yazılan kopyada
temizlenir ve ilgili header devre dışı bırakılır; `Bearer {{token}}` gibi yalnız
değişken referansı içeren değerler korunur. URL ve body sekme taslağının
parçası olarak saklanır.

### OpenAPI içe aktarma

- OpenAPI 3 YAML, YML veya JSON dosyasını native dosya seçiciyle açar.
- Dokümanı parse eder ve doğrular.
- İlk server adresi değişken içermeyen mutlak bir HTTP/HTTPS URL’siyse endpoint
  path’ini bu adresle birleştirir; aksi durumda düzenlenebilir `{{baseUrl}}`
  değişkenini kullanır.
- Sıralanan endpoint’lerin ilk 8 tanesini method ve URL içeren istek sekmeleri
  olarak açar.
- Bildirimde açılan endpoint sayısını, 8’den fazla endpoint bulunduğunda toplam
  sayıyı da gösterir.

### Kod üretimi

Aktif isteği ve varsa son response’u kullanarak şu hedefler için başlangıç
dosyaları üretir:

- REST Assured
- MockMvc
- WebTestClient
- WireMock
- Spring Cloud Contract
- Java HttpClient
- Spring RestClient
- Spring WebClient

Üretilen dosyanın önizlemesini gösterir, içeriği panoya kopyalar veya native
dosya seçiciyle tek dosya kaydeder. Maven ya da Gradle seçimine göre test
kaynağı, yardımcı sınıflar, fixture/resource dosyaları ve build dosyasından
oluşan bir proje klasörü de dışa aktarabilir.

## Gereksinimler

- Go 1.24 veya üzeri
- Node.js `^20.19.0` veya `>=22.12.0` ve npm
- `make`
- Kullanılan işletim sistemi için Wails native derleme araçları

`make dev` ve `make build`, projede sabitlenen Wails `v2.12.0` aracını
`$(go env GOPATH)/bin/wails` yolundan çalıştırır. Özel bir `GOBIN` ayarı farklı
bir dizini göstermemelidir.

## Geliştirme modunda çalıştırma

Projenin kök dizininde:

```bash
make dev
```

Bu hedef frontend bağımlılıklarını `npm ci` ile kurar, Vite geliştirme
sunucusunu ve Go backend’i başlatır, ardından Validex masaüstü penceresini açar.

`make` kullanmadan aynı akışı başlatmak için:

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
cd cmd/validex
"$(go env GOPATH)/bin/wails" dev -m -nosyncgomod
```

## Kullanım

1. Karşılama ekranındaki **New request** butonuyla bir istek sekmesi açın.
2. HTTP methodunu seçin ve URL’yi yazın.
3. Gerekirse **Variables**, **Headers** ve **Body** alanlarını düzenleyin.
   Authorization değeri **Headers** bölümünde `Authorization` header’ı olarak
   eklenir.
4. **Send** ile isteği gönderin. Çalışan isteği **Cancel** ile durdurabilirsiniz.
5. Response panelindeki **Body**, **Headers**, **Cookies**, **Timeline** ve
   **Raw** görünümlerini inceleyin.
6. Send menüsünden **Copy as cURL** veya **Generate Java test** işlemini seçin.

OpenAPI dosyası açmak için karşılama ekranındaki **Import OpenAPI** butonunu ya
da üst menüdeki **New → Import OpenAPI** yolunu kullanın.

## Native build

Kullanılan işletim sistemi için production build oluşturmak üzere:

```bash
make build
```

Build çıktısı `cmd/validex/build/bin` dizinine yazılır. macOS çıktısını açmak
için:

```bash
open cmd/validex/build/bin/Validex.app
```

### macOS imzalama

`make build`, sistemde tek bir Apple Development kimliği bulursa uygulamayı bu
kimlikle imzalar. Kimliği açıkça seçmek için:

```bash
MACOS_SIGN_IDENTITY="Apple Development: ..." make build
```

Geçerli bir imza kimliği olmadan build’in başarılı sayılmaması için:

```bash
MACOS_SIGN_REQUIRED=1 make build
```

## Testler

Projenin Makefile’da tanımlı test ve typecheck akışını çalıştırmak için:

```bash
make test
```

Bu hedef sırasıyla frontend bağımlılıklarını kurar, TypeScript typecheck ve
Vitest testlerini çalıştırır, ardından normal Go paketlerini test eder. Son
adımda `wails` build tag’li bridge testlerini çalıştırır ve masaüstü giriş
paketini derler.

Hedefli test komutları için
[test çalışma rehberine](examples/testlerin-nasil-calistigi.md) bakın.

## Aktif uygulama mimarisi

```text
cmd/validex/
├── main.go                    Wails girişi ve frontend embed
├── wails.json                 Uygulama ve build ayarları
├── build/                     Native ikon, plist ve build çıktıları
└── frontend/
    └── src/
        ├── components/        Ekranlar ve kullanıcı akışları
        ├── lib/backend.ts     Tek typed native backend adapter’ı
        ├── lib/               Query, schema ve OpenAPI yardımcıları
        └── stores/            Workspace durumu ve secret filtreleme

internal/wailsapp/             Aktif Wails bridge ve native işlemler
internal/core/openapi.go       Bridge’in kullandığı OpenAPI yükleyici
Makefile                       Dev, build ve test giriş noktaları
```

Production çağrı akışı:

```text
React bileşeni
    → src/lib/backend.ts
    → Wails tarafından üretilen binding
    → internal/wailsapp.Bridge
    → net/http, internal/core.LoadOpenAPI veya native dosya işlemleri
```

Frontend native runtime’ı bileşenlerden doğrudan çağırmaz. Bootstrap, istek ve
OpenAPI işlemlerinin durumunu TanStack Query yönetir; kod üreticisinin kaydetme
işlemleri typed adapter’ı doğrudan kullanır. Altı backend işlemi bu adapter
üzerinden geçer: bootstrap, istek gönderme, istek iptali, OpenAPI içe aktarma,
tek dosya kaydetme ve proje klasörü dışa aktarma.
