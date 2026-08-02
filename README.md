<p align="center">
  <img src="cmd/validex/build/appicon.svg" width="144" height="144" alt="Validex uygulama ikonu">
</p>

<h1 align="center">Validex</h1>

<p align="center">
  <strong>API geliştirirken ihtiyaç duyduğunuz araçları tek, yerel çalışma alanında buluşturan masaüstü uygulaması.</strong>
</p>

<p align="center">
  HTTP Requests · Collections · OpenAPI · Mock Server · JSON Lab · Diagnostics · SSE · Automation
</p>

Validex; istek hazırlama, response inceleme, collection, OpenAPI ve mock server
işlerini tek pencerede topluyor. Kullanmak için hesap açmanız gerekmez:
koleksiyonlar bilgisayarınızda tutulur, istekleriniz Validex’e ait bir sunucu
üzerinden geçmez.

## Neler yapabilirsiniz?

| Alan | Ne işe yarar? |
| --- | --- |
| Requests | Method, URL, query, header ve body hazırlayın; cevabı, cookie’leri ve bağlantı zamanlamasını inceleyin. |
| Collections | İstekleri klasörlü koleksiyonlarda saklayın, taşıyın ve yeniden çalıştırın. |
| OpenAPI | YAML veya JSON belge içe aktarın, endpoint’ten istek oluşturun ve response contract farklarını görün. |
| Mock Server | Route’ları elle ya da OpenAPI’den üretin; status, header, body ve gecikme davranışını belirleyin. |
| JSON Lab | JSON biçimlendirin, karşılaştırın, JSON Path çalıştırın, şema çıkarın ve örnek veri üretin. |
| Diagnostics | Spring hatalarını, JWT’leri, Actuator verilerini, URL yanıt sürelerini, thread dump’ları, logları ve environment farklarını inceleyin. |
| SSE | Header ve timeout desteğiyle Server-Sent Events akışlarını canlı izleyin ve durdurun. |
| Automation | Koleksiyonları assertion’larla çalıştırın, ağ yönlendirmelerini inceleyin ve OpenAPI lint alın. |
| CLI | Otomasyon, network inspection ve lint işlerini masaüstü arayüzü olmadan çalıştırın. |

## Hızlı başlangıç

Kaynak koddan geliştirmek için şunlar gerekiyor:

- Git
- [Go](https://go.dev/dl/) 1.24 veya üzeri
- [Node.js](https://nodejs.org/en/download) 22.12 veya üzeri
- npm veya Corepack
- GNU Make

Make hedefleri POSIX shell kullanıyor. Windows’ta repository’yi Git Bash
içinden çalıştırın; `make dev` için `curl` komutunun da erişilebilir olduğundan
emin olun.

Repository kökünde geliştirme sürümünü açın:

```bash
make dev
```

Bu komut eksik npm bağımlılıklarını kurar, TypeScript arayüzünü, Electron
masaüstü kabuğunu ve Go arka uç sürecini birlikte başlatır. Geliştirme sunucusu
yalnız loopback adresinde dinler ve açık bir portu otomatik seçer.
Make hedefleri PATH'te `npm` bulamazsa `package.json` içinde sabitlenen npm
sürümünü Corepack üzerinden çalıştırır.
VS Code'un Snap paketi geliştirme sürecine kendi GLib şema yollarını aktarmışsa
hedef Electron'u başlatmadan önce özgün masaüstü veri yollarını geri yükler.

Uygulamayı açmadan yalnız bağımlılıkları hazırlamak isterseniz:

```bash
make deps
```

Doğrudan npm kullanmak isterseniz aynı kurulum `cd cmd/validex && npm ci`
komutuyla yapılabilir. Masaüstü tarafındaki doğrudan npm bağımlılıkları yalnız
Electron `43.2.0` ve TypeScript `5.9.3`; sürümleri
`cmd/validex/package-lock.json` ile sabitlenmiştir.

Arayüzü tek başına görmek için:

```bash
cd cmd/validex/frontend
node scripts/dev.mjs
```

Bu hafif profilde masaüstü API’si ve Go arka uç süreci yoktur. Gerçek istek,
dosya seçici ve yerel koleksiyon kaydı için `make dev` kullanın.

## Masaüstü uygulaması nasıl çalışıyor?

Validex artık işletim sisteminin WebView motorunu kullanmıyor. Electron 43,
kendi Chromium sürümünü uygulamayla birlikte getiriyor; dolayısıyla macOS’ta
WebKit, Windows’ta WebView2 veya Linux’ta WebKitGTK kurulumuna bağlı değiliz.
Arayüz browser-native TypeScript’tir; ağ, dosya, collection, mock server ve
otomasyon işleri Go arka uç sürecinde çalışır.

Kodda göreceğiniz `window.canbridge.Bridge` adı eski frontend sözleşmesini
bozmamak için tutuluyor. Bu, eski native WebView/canbridge katmanı değil;
Electron preload’un sunduğu dar ve izin listeli API’nin uyumluluk adı.
Renderer sandbox içinde çalışır, Node API’lerine doğrudan erişemez.

Uygulama hazır olduğunda terminale kısa bir çalışma özeti basılır. Böylece
hangi Electron/Chromium sürümünün, hangi arka uçla ve hangi modda açıldığını
tek bakışta görebilirsiniz. macOS/Linux production örneği şöyle görünür;
Windows’ta backend adı `validex-backend.exe` olur:

```text
╭─ VALIDEX 0.2.0 ──────────────────────────────────────────────╮
│  API workbench · Web UI. Go core. Chromium desktop.          │
├──────────────────────────────────────────────────────────────┤
│  Interface  app://validex/                                   │
│  Mode       Production                                       │
│  Runtime    Electron 43.2.0 · Chromium 150.0.7871.129        │
│  Frontend   browser-native TypeScript · Node isolated        │
│  Backend    validex-backend · Go sidecar                     │
│  Transport  secure preload IPC → framed JSON stdio           │
├──────────────────────────────────────────────────────────────┤
│  ● Validex desktop ready                                     │
╰──────────────────────────────────────────────────────────────╯
```

Sürüm ve mod bilgileri çalışma anında üretildiği için geliştirme ve paketli
uygulamada satırlar güncel değeri gösterir. Süreç sınırları, güvenlik kararları
ve veri akışlarının ayrıntısı [architect.md](architect.md) içinde.

## Build ve çıktılar

Geçerli işletim sistemi ve CPU mimarisi için şu komutu çalıştırın:

```bash
make build
```

| Platform | Masaüstü uygulaması | CLI | Çalıştırma |
| --- | --- | --- | --- |
| macOS | `cmd/validex/build/bin/Validex.app` | `cmd/validex/build/bin/validex-cli` | `open cmd/validex/build/bin/Validex.app` |
| Linux | `cmd/validex/build/bin/Validex/` | `cmd/validex/build/bin/validex-cli` | `./cmd/validex/build/bin/Validex/validex` |
| Windows | `cmd\validex\build\bin\Validex\` | `cmd\validex\build\bin\validex-cli.exe` | `./cmd/validex/build/bin/Validex/validex.exe` |

Linux ve Windows çıktılarında `Validex` klasörünün tamamını birlikte taşıyın;
Chromium runtime’ı, frontend ve Go arka uç dosyaları bu klasörün parçalarıdır.

Birkaç platform notu:

- macOS build’i yerel geliştirme için ad-hoc imzalanır. Dağıtım sürümünün
  Developer ID ile imzalanması ve notarize edilmesi gerekir.
- Linux’ta Go dosya seçicisinin çalışması için `zenity` ya da `kdialog`
  bulunmalıdır. Electron ayrıca dağıtımın temel masaüstü/GUI kitaplıklarını
  kullanır.
- Windows paketinde Chromium yer aldığı için ayrıca WebView2 kurmanız gerekmez.
  PowerShell’den açarken
  `.\cmd\validex\build\bin\Validex\validex.exe` komutunu kullanın.

Repository şu anda çalıştırılabilir uygulama klasörü üretir; installer,
otomatik güncelleyici, cross-build veya yayın imzalama hattı sağlamaz.

Linux’ta uygulamayı kullanıcı hesabına kurmak isterseniz:

```bash
make install-linux
```

Varsayılan hedef `~/.local` altıdır; farklı bir konum için
`LINUX_INSTALL_PREFIX` verilebilir.

## Yalnızca CLI

Masaüstü arayüzüne ihtiyacınız yoksa Node.js veya Electron kurmadan Go CLI’yi
derleyebilirsiniz:

```bash
make build-cli
```

Örneğin bir koleksiyonu çalıştırmak için:

```bash
./cmd/validex/build/bin/validex-cli run --file collection.sample.json
```

Diğer komutlar ve seçenekler için:

```bash
./cmd/validex/build/bin/validex-cli --help
```

Windows’ta executable adı `validex-cli.exe` olur.

## Testler

| Komut | Kapsam |
| --- | --- |
| `make test` | Electron, frontend ve Go unit/contract testleri |
| `make test-e2e` | Üretim frontend’i üzerinde tarayıcı kabul senaryoları |
| `make test-production` | Tüm testler, Go race detector ve `go vet` |

Kullanıcı akışı değiştiyse `make test-e2e`, concurrency etkilendiyse
`make test-production`, paketleme değiştiyse host platformda ayrıca
`make build` çalıştırın.

E2E testleri makinede Chrome veya Chromium bulunmasını bekler. Otomatik
bulunamazsa executable yolunu açıkça verebilirsiniz:

```bash
VALIDEX_E2E_CHROME=/path/to/chrome make test-e2e
```

## WebView sürümünden geçiş notu

Eski sistem WebView motoruna ait `localStorage` tercihleri — tema, açık
sekmeler ve panel düzeni — Chromium profiline otomatik taşınmaz. Koleksiyonlar
ise Go tarafındaki aynı `Validex/collection-library.json` dosyasında tutulduğu
için korunur.

Üçüncü taraf lisansları [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
içinde tutulur.
