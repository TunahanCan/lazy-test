# <p align="center"><img src="cmd/validex/build/appicon.svg" width="144" height="144" alt="Validex uygulama ikonu"></p>

<h1 align="center">Validex</h1>

<p align="center">
  <strong>API geliştirme, doğrulama ve backend tanılaması için yerel masaüstü çalışma alanı.</strong>
</p>

<p align="center">
  HTTP · OpenAPI · Mock Server · JSON · Spring Diagnostics · SSE · Automation
</p>

Validex, API ile uğraşırken tek pencerede kalmak isteyenler için yapıldı. Bir isteği sıfırdan kurabilir, koleksiyonlarda düzenleyebilir, OpenAPI sözleşmesiyle eşleştirebilir, mock server ile akışları canlandırabilir ve backend sorunlarını aynı ortamda inceleyebilirsiniz.

Mimarinin ana fikri basit: ağır bir frontend runtime bağımlılığı taşımamak, paketi şişirmemek ve yine de masaüstü deneyimini kaybetmemek. UI, sistem WebView üzerinde çalışır; işin asıl mantığı Go tarafındadır. Frontend için npm runtime bağımlılığı yoktur, TypeScript derleyicisi repository içine sabitlenmiştir ve canlı akış tarafında gRPC/WebSocket yerine iptal edilebilir SSE istemcisi kullanılır.

## Türkçe

### Validex ne yapar?

| Alan | Kısa açıklama |
| --- | --- |
| Requests | HTTP istekleri oluşturur, query/header/body düzenler, yanıtı ve timeline’ı gösterir. |
| Collections | İstekleri collection’larda toplar, arar, taşır, yeniden adlandırır, siler ve güvenli şekilde kaydeder. |
| OpenAPI | YAML/JSON OpenAPI dosyalarını içe aktarır, endpoint’ten istek üretir ve contract drift kontrolü yapar. |
| Mock Server | Elle ya da OpenAPI’den route üretir, gecikme/header/body davranışlarını ayarlatır. |
| JSON Lab | JSON biçimlendirme, fark alma, JSON Path, şema çıkarımı ve Java DTO’dan örnek JSON üretme sağlar. |
| Diagnostics | Spring hata analizi, JWT inceleme, Actuator görünümü, thread dump, trace log ve environment karşılaştırma sunar. |
| SSE | HTTP(S) üzerinden Server-Sent Events dinler; timeout, header ve iptal desteği verir. |
| Automation | Collection runner, assertion motoru, DNS/redirect analizi ve OpenAPI lint sağlar. |
| CLI | Headless çalıştırma, network inspection ve lint işlemlerini terminalden yapar. |

### Nasıl çalışır?

Validex iki parçalı düşünülür:

1. Go çekirdeği, ağ isteklerini, dosya işlemlerini, mock server’ı, runner’ı ve native köprüleri yönetir.
2. Frontend, yalnızca arayüz ve kullanıcı akışını sağlar; gerçek iş yükü browser içinde değil, Go tarafında yürür.

Bu sayede uygulama hafif kalır. WebView sadece ekranı taşır; koleksiyon kaydı, HTTP istekleri, OpenAPI kontrolü, SSE ve diagnostics gibi işler doğrudan yerel uygulama içinde çözülür.

### Executable nasıl oluşur?

Üretim build’inde frontend önce derlenir, sonra üretilen `dist` çıktısı Go uygulamasına gömülür. Desktop executable açıldığında bu gömülü dosyalar yerel bir asset sunucusundan servis edilir ve sistem WebView o adrese bağlanır.

Kısaca akış şu şekildedir:

1. TypeScript kaynakları derlenir.
2. Frontend `dist` üretir.
3. Go binary, bu çıktıyı `go:embed` ile içine alır.
4. Uygulama açılırken local asset server başlar.
5. Sistem WebView bu yerel adrese bağlanır.

Bu yapı sayesinde dağıtılan executable kendi arayüzünü yanında taşır; ayrıca runtime npm paketi gerekmez.

### Kurulum ve kullanım

Gereksinimler:

| İş akışı | Gereksinimler |
| --- | --- |
| `make build-cli` | Go 1.24+, GNU Make, POSIX uyumlu shell |
| Doğrudan Go testleri | Go 1.24+ |
| Frontend typecheck/build/test | Node.js 20+ |
| Masaüstü build | Go 1.24+, Node.js 20+, GNU Make, CGO ve platform toolchain |
| `make dev` | Masaüstü gereksinimlerine ek olarak `curl` |
| `make test` | Go 1.24+, Node.js 20+, GNU Make, CGO ve native platform toolchain |

Repoyu alıp geliştirme modunu başlatmak için:

```bash
git clone https://github.com/TunahanCan/validex.git
cd validex
make dev
```

`make dev`, uygun bir loopback portu seçer, Node standart kütüphanesiyle çalışan geliştirme sunucusunu açar ve native pencereyi bu sunucuya bağlar.

Sadece frontend tarafını görmek isterseniz:

```bash
cd cmd/validex/frontend
node scripts/dev.mjs
```

Bu mod arayüz geliştirmek içindir; native backend gerektiren özellikler burada çalışmaz.

### Build

Geçerli platform için masaüstü uygulaması ve CLI üretmek:

```bash
make build
```

Çıktılar:

| Platform | Masaüstü uygulaması | CLI |
| --- | --- | --- |
| macOS | `cmd/validex/build/bin/Validex.app` | `cmd/validex/build/bin/validex-cli` |
| Linux | `cmd/validex/build/bin/validex` | `cmd/validex/build/bin/validex-cli` |
| Windows | `cmd/validex/build/bin/validex.exe` | `cmd/validex/build/bin/validex-cli.exe` |

Çalıştırma:

```bash
# macOS
open cmd/validex/build/bin/Validex.app

# Linux
./cmd/validex/build/bin/validex
```

```powershell
# Windows
.\cmd\validex\build\bin\validex.exe
```

macOS build’i yerel geliştirme için ad-hoc imzalanır ve sıkı bundle doğrulamasından geçirilir. Son kullanıcı dağıtımı için ayrıca Developer ID imzası ve notarization gerekir.

### Linux kurulumu

Ubuntu veya Debian tabanlı sistemlerde native bağımlılıklar:

```bash
sudo apt update
sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev zenity curl make
```

Kullanıcı hesabına kurmak için:

```bash
make install-linux
```

Başka bir kurulum kökü seçmek için:

```bash
make install-linux LINUX_INSTALL_PREFIX=/hedef/dizin
```

### Yalnızca CLI

Headless araçları derlemek için:

```bash
make build-cli
```

Bu hedef Node.js, WebView ve CGO gerektirmez; yalnızca Go ile çalışan bir terminal aracı üretir.

### CLI kullanımı

`collection.sample.json`, varsayılan olarak `http://localhost:8080/actuator/health` adresini çağırır. Örnek runner’ı denemeden önce bu endpoint’i sunan yerel servisi açın.

```bash
# Koleksiyon çalıştır
./cmd/validex/build/bin/validex-cli run \
  --file collection.sample.json

# DNS, redirect zinciri ve son HTTP sonucunu incele
./cmd/validex/build/bin/validex-cli inspect \
  --url https://example.com \
  --timeout 15s

# OpenAPI belgesini lint et
./cmd/validex/build/bin/validex-cli lint \
  --file openapi.sample.yaml \
  --strict
```

Runtime değişkenleri için önce `variables.json` dosyasını oluşturun:

```json
{
  "baseUrl": "http://localhost:8080"
}
```

Sonra çalıştırın:

```bash
./cmd/validex/build/bin/validex-cli run \
  --file collection.sample.json \
  --variables variables.json \
  --json
```

### Bağımlılık politikası

- Frontend runtime tarafında React, Vite, Vitest, jsdom veya başka bir UI framework’ü yoktur.
- `package.json` runtime bağımlılığı taşımaz.
- `npm install` ve `npm ci` gerekmez.
- TypeScript 5.9.3 derleyicisi `cmd/validex/frontend/third_party/typescript` altında build-only olarak vendor edilir.
- Native pencere katmanı yalnızca Validex’in gerçekten kullandığı yetenekleri açar.

### Veriler nerede tutulur?

| Veri | Nerede tutulur |
| --- | --- |
| Kaydedilmiş koleksiyonlar | `<kullanıcı config dizini>/Validex/collection-library.json` |
| Frontend-only fallback | WebView/browser `localStorage` |
| Açık sekmeler ve görünüm durumu | WebView origin’ine ait `localStorage` |
| OpenAPI cache, mock durumları, çalışan işlemler | Go process belleği |
| CLI çıktıları | Kullanıcının verdiği stdin/stdout ve dosyalar |

### Test

Tüm zinciri çalıştırmak için:

```bash
make test
```

Parça parça çalıştırmak isterseniz:

```bash
cd cmd/validex/frontend
node scripts/typecheck.mjs
node scripts/build.mjs
node --test
```

```bash
go test ./...
go test -tags canbridge ./internal/nativewebview ./internal/canbridge ./cmd/validex
```

## English

### What Validex does

Validex is a local desktop workspace for API development, validation, and backend troubleshooting. It is designed to keep the whole workflow in one place: build a request, organize it in a collection, compare it with an OpenAPI contract, replay behavior with a mock server, and inspect backend issues without switching tools.

The architecture keeps the runtime surface intentionally small. The UI runs on the system WebView, while the real application logic lives in Go. There is no npm runtime dependency, the TypeScript compiler is vendored in the repository, and live protocol work uses a cancellable SSE client instead of gRPC or WebSocket.

### How it works

Validex is split into two cooperating parts:

1. The Go core handles networking, files, mock server behavior, the runner, and native bridge code.
2. The frontend provides the user interface and workflow state, but the heavy lifting is performed on the Go side.

That keeps the desktop app light while still giving you a native-like experience. The WebView simply hosts the screen; collections, HTTP requests, OpenAPI checks, SSE, and diagnostics are handled locally inside the application.

### How the executable is produced

In the production build, the frontend is compiled first. The resulting `dist` output is embedded into the Go application, and the desktop executable serves those files from a local asset server when it starts. The system WebView then connects to that local address.

In short:

1. TypeScript sources are compiled.
2. The frontend produces a `dist` directory.
3. The Go binary embeds that output with `go:embed`.
4. A local asset server starts on application launch.
5. The system WebView attaches to that local server.

This means the packaged app carries its own UI with it, without needing a runtime npm install.

### Build and run

Requirements:

| Workflow | Requirements |
| --- | --- |
| `make build-cli` | Go 1.24+, GNU Make, POSIX-compatible shell |
| Direct Go tests | Go 1.24+ |
| Frontend typecheck/build/test | Node.js 20+ |
| Desktop build | Go 1.24+, Node.js 20+, GNU Make, CGO, and the platform toolchain |
| `make dev` | Desktop build requirements plus `curl` |
| `make test` | Go 1.24+, Node.js 20+, GNU Make, CGO, and native platform toolchain |

Clone the repository and start development mode:

```bash
git clone https://github.com/TunahanCan/validex.git
cd validex
make dev
```

`make dev` picks a free loopback port, starts the Node-based development server, and connects the native window to it.

If you want the frontend only:

```bash
cd cmd/validex/frontend
node scripts/dev.mjs
```

That mode is useful for UI work, but native backend features are not available there.

### Build

Build the desktop app and CLI for the current platform:

```bash
make build
```

Outputs:

| Platform | Desktop app | CLI |
| --- | --- | --- |
| macOS | `cmd/validex/build/bin/Validex.app` | `cmd/validex/build/bin/validex-cli` |
| Linux | `cmd/validex/build/bin/validex` | `cmd/validex/build/bin/validex-cli` |
| Windows | `cmd/validex/build/bin/validex.exe` | `cmd/validex/build/bin/validex-cli.exe` |

Run it with:

```bash
# macOS
open cmd/validex/build/bin/Validex.app

# Linux
./cmd/validex/build/bin/validex
```

```powershell
# Windows
.\cmd\validex\build\bin\validex.exe
```

macOS builds are ad-hoc signed for local development and then verified strictly. For end-user distribution, Developer ID signing and notarization are still required.

### Linux install

On Ubuntu or Debian-based systems:

```bash
sudo apt update
sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev zenity curl make
```

Install for your user account:

```bash
make install-linux
```

Choose a different prefix:

```bash
make install-linux LINUX_INSTALL_PREFIX=/target/path
```

### CLI only

To build only the headless tool:

```bash
make build-cli
```

That target does not require Node.js, WebView, or CGO. It produces a pure Go terminal executable.

### CLI usage

`collection.sample.json` calls `http://localhost:8080/actuator/health` by default. Start a local service that exposes that endpoint before trying the sample runner.

```bash
# Run a collection
./cmd/validex/build/bin/validex-cli run \
  --file collection.sample.json

# Inspect DNS, redirect chain, and the final HTTP result
./cmd/validex/build/bin/validex-cli inspect \
  --url https://example.com \
  --timeout 15s

# Lint an OpenAPI document
./cmd/validex/build/bin/validex-cli lint \
  --file openapi.sample.yaml \
  --strict
```

Create `variables.json` first if you want runtime overrides:

```json
{
  "baseUrl": "http://localhost:8080"
}
```

Then run:

```bash
./cmd/validex/build/bin/validex-cli run \
  --file collection.sample.json \
  --variables variables.json \
  --json
```

### Dependency policy

- There is no React, Vite, Vitest, jsdom, or other UI framework in the runtime path.
- `package.json` does not carry runtime dependencies.
- No `npm install` or `npm ci` is needed.
- TypeScript 5.9.3 is vendored as a build-only compiler under `cmd/validex/frontend/third_party/typescript`.
- The native window layer exposes only the capabilities Validex actually uses.

### Where data lives

| Data | Storage |
| --- | --- |
| Saved collections | `<user config dir>/Validex/collection-library.json` |
| Frontend-only fallback | WebView/browser `localStorage` |
| Open tabs and view state | WebView origin `localStorage` |
| OpenAPI cache, mock state, running operations | Go process memory |
| CLI output | The files/stdin/stdout provided by the user |

### Testing

Run the full chain with:

```bash
make test
```

For individual steps:

```bash
cd cmd/validex/frontend
node scripts/typecheck.mjs
node scripts/build.mjs
node --test
```

```bash
go test ./...
go test -tags canbridge ./internal/nativewebview ./internal/canbridge ./cmd/validex
```

## Repository map

```text
cmd/validex/             Native desktop composition root and frontend
cmd/validex-cli/         Headless CLI composition root
internal/canbridge/      TypeScript ↔ Go IPC and desktop application adapter
internal/nativewebview/  Narrow native WebView/CGO layer
internal/core/           OpenAPI parse and contract drift
internal/mockserver/     Loopback mock HTTP server
internal/protocols/      SSE client
internal/diagnostics/    Backend and JVM analysis tools
internal/runner/         Collection runner
internal/assertions/     Assertion engine
internal/netinspector/   DNS and redirect inspection
internal/openapilint/    OpenAPI lint
examples/                Explanatory usage notes
```

For component boundaries, IPC contracts, data flow, and extension rules, see [architect.md](architect.md).

## Current limits

- Only HTTP(S) and SSE are supported; gRPC and WebSocket are out of scope.
- The desktop build targets the host OS and CPU architecture; there is no cross-platform packaging pipeline yet.
- Running the frontend alone in a browser does not provide native features.
- Release installers, Developer ID / Authenticode signing, and notarization are not part of the current pipeline.
