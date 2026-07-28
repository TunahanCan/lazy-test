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
  HTTP istemcisi · OpenAPI · Mock Server · Spring tanılama · SSE · WebSocket · gRPC · Otomasyon
</p>

Validex, bir API üzerinde çalışırken farklı araçlar arasında kaybolmanızı
engelleyen yerel bir masaüstü uygulamasıdır. İsteklerinizi oluşturun, gerçek
isteklerinizi kalıcı koleksiyonlarda düzenleyin, yanıtları OpenAPI
sözleşmenizle karşılaştırın, mock servisler ayağa kaldırın, protokol
oturumlarını inceleyin ve aynı çekirdeği CI süreçlerinde headless olarak
çalıştırın.

Türkçe ve İngilizce arayüz, açık/koyu tema, klavye odaklı çalışma alanı ve
Linux, macOS, Windows için native uygulama çıktılarıyla Validex; günlük backend
geliştirme akışını tek, hızlı ve yerel bir araçta toplar.

## Neden Validex?

| Öne çıkan | Sağladığı değer |
| --- | --- |
| **Tek çalışma alanı** | Requests, OpenAPI, Diagnostics, Mock Server, JSON araçları, protokoller ve otomasyon aynı uygulamada. |
| **Kalıcı request koleksiyonları** | İstekleri gruplayın, arayın, taşıyın ve Save As ile cihazınızda yeniden kullanılabilir bir API kütüphanesi oluşturun. |
| **Sözleşmeye güven** | Gerçek HTTP yanıtını OpenAPI operasyonu ve şemasıyla karşılaştıran contract drift görünümü. |
| **Backend odaklı tanılama** | Spring/Actuator, environment farkı, thread dump, log, JWT ve endpoint coverage araçları. |
| **Gerçek protokol desteği** | SSE, WebSocket ve gRPC reflection oturumlarını native Go çekirdeğiyle çalıştırma. |
| **Yerel geliştirme** | Masaüstü arayüzü sistem WebView’iyle, backend işlemleri cihazınızdaki Go çekirdeğiyle çalışır. |
| **CI ile aynı çekirdek** | Collection runner, ağ inceleme ve OpenAPI lint işlemlerini `validex-cli` ile headless yürütme. |

## Hızlı başlangıç

### Ortak gereksinimler

- Go 1.24 veya üzeri
- Node.js `^20.19.0` veya `>=22.12.0`
- npm
- GNU Make
- `curl`
- İşletim sistemine ait C/C++ derleyicisi ve native WebView geliştirme
  bileşenleri

Repoyu alın:

```bash
git clone https://github.com/TunahanCan/validex.git
cd validex
```

Geliştirme modunu başlatın:

```bash
make dev
```

Bu komut frontend bağımlılıklarını kurar, uygun bir loopback portunda Vite
sunucusunu başlatır ve native Go uygulamasını geliştirme arayüzüne bağlayarak
Validex penceresini açar.

> Frontend dizininde çalıştırılan
> `cd cmd/validex/frontend && npm run dev` yalnızca frontend geliştirme
> sunucusunu açar. Native dosya seçici, HTTP motoru, Mock Server, protokoller
> ve tanılama araçları için repo kökünde `make dev` kullanın.

## Production build

Geçerli işletim sistemi için masaüstü uygulamasını ve CLI’ı üretin:

```bash
make build
```

`make build` şu işlemleri birlikte yapar:

1. Frontend paketlerini kilit dosyasından kurar.
2. TypeScript kontrolü ve Vite production build’ini çalıştırır.
3. `validex-cli` dosyasını üretir.
4. Frontend çıktısını içine gömen native masaüstü uygulamasını derler.

Platforma göre çıktılar:

| Platform | Masaüstü çıktısı | CLI çıktısı |
| --- | --- | --- |
| Linux | `cmd/validex/build/bin/validex` | `cmd/validex/build/bin/validex-cli` |
| macOS | `cmd/validex/build/bin/Validex.app` | `cmd/validex/build/bin/validex-cli` |
| Windows | `cmd/validex/build/bin/validex.exe` | `cmd/validex/build/bin/validex-cli.exe` |

Yalnızca headless CLI’ı derlemek isterseniz:

```bash
make build-cli
```

Bu hedef için native WebView, Node.js veya frontend bağımlılıkları gerekmez;
Go 1.24+ ile Make/POSIX shell yeterlidir.

Build sistemi host platforma yöneliktir. Başka bir işletim sisteminin native
paketini cross-compile etmek yerine build’i hedef işletim sisteminde çalıştırın.
Çıktı host CPU mimarisine aittir; repository universal veya multi-arch artifact
üretmez. Örneğin macOS build’i çalıştırıldığı makineye göre `arm64` ya da
`amd64` olur ve DMG oluşturmak bu `.app` dosyasını universal hale getirmez.

## Linux executable oluşturma

### 1. Native bağımlılıkları kurun

Ubuntu veya Debian:

```bash
sudo apt update
sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev zenity curl make
```

`zenity` yerine masaüstü ortamınız destekliyorsa `kdialog` kullanılabilir. Go
ve Node.js sürümlerinin ortak gereksinimleri karşıladığından ayrıca emin olun.

### 2. Executable dosyasını üretin

```bash
make build
```

Çalıştırılabilir dosya:

```text
cmd/validex/build/bin/validex
```

Uygulamayı açın:

```bash
./cmd/validex/build/bin/validex
```

Dosya başka bir ortam üzerinden kopyalanırken executable biti kaybolduysa:

```bash
chmod +x cmd/validex/build/bin/validex
```

### 3. Uygulama menüsüne kurun

```bash
make install-linux
```

Varsayılan kullanıcı kurulumu:

| Öğe | Konum |
| --- | --- |
| Executable | `~/.local/bin/validex` |
| Uygulama kısayolu | `~/.local/share/applications/com.validex.Validex.desktop` |
| İkon | `~/.local/share/icons/hicolor/scalable/apps/com.validex.Validex.svg` |

Farklı bir kullanıcı prefix’i seçmek için:

```bash
make install-linux LINUX_INSTALL_PREFIX=/hedef/dizin
```

Linux çıktısı tek bir executable dosyasıdır ancak GTK ve WebKitGTK
kütüphanelerine dinamik olarak bağlıdır. Bu nedenle tamamen statik, her Linux
dağıtımında bağımlılıksız çalışan evrensel bir binary değildir. Repo şu anda
AppImage, `.deb` veya `.rpm` üretmez.

## macOS `.app` ve `.dmg` oluşturma

### 1. Geliştirme araçlarını kurun

```bash
xcode-select --install
```

Go, Node.js, npm ve GNU Make gereksinimlerini de kurduktan sonra build alın:

```bash
make build
```

Oluşan uygulama bundle’ı:

```text
cmd/validex/build/bin/Validex.app
```

Yerel olarak açın:

```bash
open cmd/validex/build/bin/Validex.app
```

### 2. DMG oluşturun

Repo içinde hazır bir `make dmg` hedefi yoktur. `.app` build’inden sonra
macOS’un `hdiutil` aracıyla sürükle-bırak düzenine sahip bir DMG oluşturun:

```bash
make build

(
  set -eu

  dmg_root="$(mktemp -d)"
  trap 'rm -rf -- "$dmg_root"' EXIT

  cp -R cmd/validex/build/bin/Validex.app "$dmg_root/"
  ln -s /Applications "$dmg_root/Applications"

  hdiutil create \
    -volname "Validex" \
    -srcfolder "$dmg_root" \
    -ov \
    -format UDZO \
    cmd/validex/build/bin/Validex.dmg
)
```

Çıktı:

```text
cmd/validex/build/bin/Validex.dmg
```

Bu işlem geliştirici kullanımı için imzasız ve notarize edilmemiş bir DMG
üretir. Son kullanıcılara dağıtım için `.app` bundle’ını Apple Developer ID ile
imzalamanız, notarization işleminden geçirmeniz ve bileti pakete eklemeniz
gerekir; proje bu yayın adımlarını otomatikleştirmez.

## Windows `.exe` oluşturma

### 1. Gerekli araçları hazırlayın

Windows build’i aşağıdakileri gerektirir:

- CGO destekli Go 1.24+
- Node.js ve npm
- MinGW-w64 C++14 toolchain
- `g++` ve `windres`
- GNU Make ve POSIX uyumlu bir shell
- Microsoft Edge WebView2 Runtime

MSYS2 MinGW/UCRT64 gibi MinGW araçlarını görebilen bir shell kullanın. Ardından
repo kökünde:

```bash
make build
```

Oluşan masaüstü uygulaması:

```text
cmd/validex/build/bin/validex.exe
```

MSYS2 shell’den çalıştırın:

```bash
./cmd/validex/build/bin/validex.exe
```

PowerShell’den çalıştırın:

```powershell
.\cmd\validex\build\bin\validex.exe
```

Build sırasında uygulama ikonu `windres` ile executable içine gömülür ve GUI
subsystem’i kullanıldığı için ayrı bir konsol penceresi açılmaz. Repo şu anda
MSI, MSIX veya kurulum sihirbazı üretmez; oluşan dosya doğrudan çalıştırılabilir
bir `.exe` build’idir.

## Teknik mimari

Runtime katmanları, frontend ve Go paket sınırları, native IPC sözleşmesi, veri
akışları, güvenlik sınırları, kaynak limitleri, test yaklaşımı ve yeni özellik
ekleme rehberi için ayrıntılı [architect.md](architect.md) belgesine bakın.
