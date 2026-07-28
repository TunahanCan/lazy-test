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

Bir endpoint’i denerken istek aracı, OpenAPI belgesi, terminal, log ekranı ve
mock servis arasında gidip gelmek yorucu olabiliyor. Validex bu dağınık akışı
tek pencerede toplamak için geliştirildi.

İsteklerinizi hazırlayabilir, koleksiyonlarda düzenleyebilir, ortam
değişkenleriyle tekrar çalıştırabilir, gelen cevabı OpenAPI sözleşmesiyle
karşılaştırabilir ve gerektiğinde aynı uygulama içinden mock server
başlatabilirsiniz. JSON araçları, Spring/JVM tanılama ekranları, SSE istemcisi
ve otomasyon araçları da günlük backend geliştirme akışının bir parçası olarak
yanınızda olur.

Validex yerel çalışır ve kullanmak için bir hesap açmanızı istemez. Kaydettiğiniz
koleksiyonlar kendi bilgisayarınızda tutulur. İstekler Validex’e ait bir bulut
servisine gönderilmez; işletim sisteminizde tanımlı proxy ve ağ ayarları
uygulanabilir.

## Validex ile neler yapabilirsiniz?

| Alan | Ne sağlar? |
| --- | --- |
| Requests | Method, URL, query, header ve body hazırlayın; cevabı, cookie’leri ve bağlantı zamanlamasını inceleyin. |
| Collections | İstekleri klasörlü koleksiyonlarda saklayın, taşıyın ve daha sonra yeniden çalıştırın. |
| OpenAPI | YAML veya JSON belge içe aktarın, endpoint’ten istek oluşturun ve response contract farklarını görün. |
| Mock Server | Route’ları elle veya OpenAPI’den üretin; status, header, body ve gecikme davranışını belirleyin. |
| JSON Lab | JSON biçimlendirin, karşılaştırın, JSON Path çalıştırın, şema çıkarın ve örnek veri üretin. |
| Diagnostics | Spring hatalarını, JWT’leri, Actuator verilerini, thread dump’ları, logları ve environment farklarını inceleyin. |
| SSE | Header ve timeout desteğiyle Server-Sent Events akışlarını canlı izleyin ve gerektiğinde durdurun. |
| Automation | Collection’ları assertion’larla çalıştırın, ağ yönlendirmelerini inceleyin ve OpenAPI lint alın. |
| CLI | Aynı otomasyon, network inspection ve lint işlerini masaüstü arayüzü olmadan terminalde çalıştırın. |

## Başlamadan önce

Bu repository şu anda hazır bir MSI, notarized macOS paketi veya evrensel Linux
paketi yayınlamıyor. Uygulamayı kaynak koddan, kullanacağınız işletim sistemi
üzerinde derliyorsunuz.

`make build`, yalnız çalıştırıldığı işletim sistemi ve CPU mimarisi için çıktı
üretir. Windows sürümünü Windows’ta, macOS sürümünü macOS’ta, Linux sürümünü
Linux’ta oluşturun.

Ortak gereksinimler:

- Git
- [Go](https://go.dev/dl/) 1.24 veya üzeri
- [Node.js](https://nodejs.org/en/download) 20 veya üzeri
- GNU Make
- Masaüstü build’i için CGO ve platformun C/C++ araç zinciri

Go ve Node sürümlerini kontrol etmek için:

```bash
go version
node --version
make --version
```

Frontend derleyicisi repository içinde hazır gelir. `npm install` veya
`npm ci` çalıştırmanız gerekmez.

## Windows

Bu bölümdeki MSYS2 araç zinciri adımları 64-bit x86 Windows içindir. Repository
şu anda ayrı bir Windows ARM64 paketleme hedefi sunmaz.

### Hazır EXE’yi çalıştırmak

Elinizde daha önce derlenmiş bir Validex paketi varsa klasörü herhangi bir
konuma çıkarın ve `validex.exe` dosyasını çalıştırın. Validex portable
çalışabildiği için ayrıca kurulum sihirbazına ihtiyaç duymaz.

Uygulama penceresi açılmıyorsa bilgisayarda
[Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
bulunduğunu kontrol edin. Windows 11’de genellikle hazırdır; bazı Windows 10,
Windows Server veya sadeleştirilmiş kurulumlarda ayrıca yüklenmesi gerekebilir.

### Geliştirme ortamını hazırlamak

Windows build’i GNU Make, POSIX shell, GCC/G++ ve `windres` kullandığı için
komutları normal PowerShell yerine
[MSYS2 UCRT64](https://www.msys2.org/docs/environments/) terminalinde
çalıştırmak en sorunsuz yoldur.

Önce PowerShell’de MSYS2’yi kurun:

```powershell
winget install --id MSYS2.MSYS2 -e
```

Ardından Başlat menüsünden **MSYS2 UCRT64** terminalini açın ve Go, Node.js ile
derleme araçlarını aynı ortam içine kurun:

```bash
pacman -Syu
pacman -S --needed git make curl \
  mingw-w64-ucrt-x86_64-go \
  mingw-w64-ucrt-x86_64-nodejs \
  mingw-w64-ucrt-x86_64-gcc \
  mingw-w64-ucrt-x86_64-binutils
```

İlk güncelleme terminali kapatmanızı isterse UCRT64 terminalini yeniden açın,
`pacman -Syu` komutunu tekrar çalıştırın ve kuruluma devam edin.

Araçların görünür olduğunu doğrulayın:

```bash
go version
node --version
gcc --version
g++ --version
windres --version
```

### Kaynak koddan çalıştırmak

MSYS2 UCRT64 terminalinde:

```bash
export CGO_ENABLED=1
export CC=gcc
export CXX=g++

git clone https://github.com/TunahanCan/validex.git
cd validex
make dev
```

`make dev`, frontend geliştirme sunucusunu uygun bir yerel portta başlatır ve
native Validex penceresini bu sunucuya bağlar. Terminal açık kaldığı sürece
uygulama çalışmaya devam eder.

### EXE oluşturmak

Repository kökünde:

```bash
make build
```

Oluşan dosyalar:

```text
cmd/validex/build/bin/validex.exe
cmd/validex/build/bin/validex-cli.exe
cmd/validex/build/bin/THIRD_PARTY_NOTICES.md
```

Masaüstü uygulamasını terminalden çalıştırabilirsiniz:

```bash
./cmd/validex/build/bin/validex.exe
```

Ya da `cmd\validex\build\bin` klasörünü Dosya Gezgini’nde açıp
`validex.exe` dosyasına çift tıklayabilirsiniz.

Portable bir ZIP hazırlamak isterseniz repository kökünde PowerShell açın:

```powershell
Compress-Archive `
  -Path .\cmd\validex\build\bin\validex.exe,`
        .\cmd\validex\build\bin\validex-cli.exe,`
        .\cmd\validex\build\bin\THIRD_PARTY_NOTICES.md `
  -DestinationPath .\Validex-windows.zip `
  -Force
```

Bu işlem bir `.exe` ve ZIP üretir; MSI/setup oluşturmaz. Üretilen executable
Authenticode ile imzalanmadığı için başka bilgisayarlarda SmartScreen uyarısı
görülebilir.

## macOS

### Hazır uygulamayı kurmak

Elinizde bir `Validex.app` varsa uygulamayı `Applications` klasörüne taşıyıp
açabilirsiniz.

Bir DMG dosyanız varsa:

```bash
open Validex.dmg
```

Açılan pencerede `Validex.app` dosyasını `Applications` klasörüne sürükleyin.

### Geliştirme ortamını hazırlamak

Önce Xcode Command Line Tools’u kurun:

```bash
xcode-select --install
```

Go ve Node.js kurulu değilse Homebrew ile yükleyebilirsiniz:

```bash
brew install go node
```

Ardından repository’yi alın:

```bash
git clone https://github.com/TunahanCan/validex.git
cd validex
```

### Kaynak koddan çalıştırmak

```bash
make dev
```

### Uygulama paketi (.app) oluşturmak

```bash
make build
```

Çıktılar:

```text
cmd/validex/build/bin/Validex.app
cmd/validex/build/bin/validex-cli
```

Uygulamayı doğrudan açmak için:

```bash
open cmd/validex/build/bin/Validex.app
```

Yalnız kendi kullanıcı hesabınıza kurmak isterseniz:

```bash
mkdir -p "$HOME/Applications"
ditto \
  cmd/validex/build/bin/Validex.app \
  "$HOME/Applications/Validex.app"
open "$HOME/Applications/Validex.app"
```

### DMG oluşturmak

Önce `.app` bundle’ını oluşturun:

```bash
make build
```

Sonra uygulama ve `Applications` kısayolunu içeren DMG’yi hazırlayın:

```bash
(
  dmg_stage="$(mktemp -d)"
  trap 'rm -rf "$dmg_stage"' EXIT

  ditto \
    cmd/validex/build/bin/Validex.app \
    "$dmg_stage/Validex.app"
  ln -s /Applications "$dmg_stage/Applications"

  hdiutil create \
    -volname "Validex" \
    -srcfolder "$dmg_stage" \
    -ov \
    -format UDZO \
    cmd/validex/build/bin/Validex.dmg
)
```

Oluşan dosya:

```text
cmd/validex/build/bin/Validex.dmg
```

`make build`, uygulamayı yerel geliştirme için ad-hoc olarak imzalar. DMG
oluşturmak bu imzayı bir yayın imzasına dönüştürmez. Uygulamayı başka
kullanıcılara dağıtmak istiyorsanız Apple Developer ID ile imzalama, hardened
runtime ve notarization adımlarını ayrıca tamamlamanız gerekir. Build yalnız
çalıştırdığınız Mac’in mimarisi içindir; universal binary üretilmez.

## Linux

### Hazır executable’ı çalıştırmak

Elinizde derlenmiş `validex` dosyası varsa çalıştırma izni verip açın:

```bash
chmod +x validex
./validex
```

Validex, Linux’ta GTK 3 ve WebKitGTK 4.1 kullanır. Dosya seçici için `zenity`
önerilir; `zenity` yoksa `kdialog` kullanılabilir.

Ubuntu veya Debian tabanlı bir sistemde runtime paketlerini kurmak için:

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-0 zenity
```

Başka bir dağıtım kullanıyorsanız paket yöneticinizde GTK 3,
`webkit2gtk-4.1` ve `zenity` veya `kdialog` karşılıklarını kurun.

### Geliştirme ortamını hazırlamak

Ubuntu veya Debian tabanlı sistemlerde:

```bash
sudo apt update
sudo apt install -y \
  git \
  make \
  curl \
  build-essential \
  pkg-config \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  zenity
```

Ayrıca Go 1.24+ ve Node.js 20+ kurulu olmalıdır. Dağıtımınızın paketleri daha
eski sürüm veriyorsa Go ve Node.js’in güncel sürümlerini resmi dağıtım
kanallarından kurun.

Native bağımlılıkları kontrol edebilirsiniz:

```bash
pkg-config --modversion gtk+-3.0
pkg-config --modversion webkit2gtk-4.1
```

Repository’yi alın:

```bash
git clone https://github.com/TunahanCan/validex.git
cd validex
```

### Kaynak koddan çalıştırmak

```bash
make dev
```

### Linux executable oluşturmak

```bash
make build
```

Çıktılar:

```text
cmd/validex/build/bin/validex
cmd/validex/build/bin/validex-cli
cmd/validex/build/bin/THIRD_PARTY_NOTICES.md
```

Masaüstü uygulamasını doğrudan çalıştırmak için:

```bash
./cmd/validex/build/bin/validex
```

### Kullanıcı hesabına kurmak

```bash
make install-linux
```

Bu komut:

- executable’ı `~/.local/bin/validex` konumuna,
- uygulama menüsü kaydını `~/.local/share/applications` altına,
- ikonu `~/.local/share/icons` altına

kurar.

Kurulumdan sonra uygulamayı menüden veya şu komutla açabilirsiniz:

```bash
"$HOME/.local/bin/validex"
```

Farklı bir kurulum kökü kullanmak için:

```bash
make install-linux LINUX_INSTALL_PREFIX=/hedef/dizin
```

### Host sistem için arşiv hazırlamak

```bash
make build

tar -czf "Validex-linux-$(go env GOARCH).tar.gz" \
  -C cmd/validex/build/bin \
  validex \
  validex-cli \
  THIRD_PARTY_NOTICES.md
```

Bu arşiv evrensel veya tamamen statik bir Linux paketi değildir. Hedef
bilgisayar build aldığınız sistemle aynı CPU mimarisine ve uyumlu Linux
ABI’sine sahip olmalıdır; uyumlu glibc, libstdc++, GTK 3 ve WebKitGTK 4.1
runtime’ları gerekir. Özellikle yeni bir dağıtımda oluşturulan executable daha
eski bir dağıtımda çalışmayabilir.

## Yalnızca CLI kullanmak

Masaüstü arayüzüne ihtiyacınız yoksa yalnız CLI’yi derleyebilirsiniz:

```bash
make build-cli
```

Bu hedef Node.js, CGO veya WebView gerektirmez; Go ile çalışan terminal
uygulamasını üretir.

Örnek kullanımlar:

```bash
# Bir collection çalıştır
./cmd/validex/build/bin/validex-cli run \
  --file collection.sample.json

# DNS ve redirect zincirini incele
./cmd/validex/build/bin/validex-cli inspect \
  --url https://example.com \
  --timeout 15s

# OpenAPI belgesini lint et
./cmd/validex/build/bin/validex-cli lint \
  --file openapi.sample.yaml \
  --strict
```

Windows’ta aynı komutlarda `validex-cli.exe` kullanın.

`collection.sample.json`, varsayılan olarak
`http://localhost:8080/actuator/health` adresine istek gönderir. Örneği
çalıştırmadan önce bu endpoint’i sunan yerel servisin açık olduğundan emin
olun.

## Sık karşılaşılan durumlar

### `make dev` çalışıyor ama native özellikler görünmüyor

Frontend’i yalnız şu komutla açtıysanız:

```bash
cd cmd/validex/frontend
node scripts/dev.mjs
```

sadece arayüz geliştirme sunucusu çalışır. Dosya seçici, yerel collection
kaydı, mock server ve native HTTP işlemleri için repository kökünden
`make dev` kullanın.

### Linux’ta WebKitGTK bulunamıyor

Şu komut hata veriyorsa geliştirme paketi eksiktir:

```bash
pkg-config --modversion webkit2gtk-4.1
```

Ubuntu/Debian üzerinde `libwebkit2gtk-4.1-dev` paketini kurun.

### Windows’ta `windres: command not found`

Komutu MSYS2 UCRT64 terminalinde çalıştırdığınızdan ve
`mingw-w64-ucrt-x86_64-binutils` paketini kurduğunuzdan emin olun.

### Windows’ta boş pencere veya WebView hatası

[WebView2 Runtime’ın](https://developer.microsoft.com/microsoft-edge/webview2/)
kurulu ve güncel olduğunu kontrol edin.

### macOS başka bir bilgisayarda uygulamayı doğrulamıyor

Yerel build yalnız ad-hoc imzalıdır. Başka kullanıcılara gönderilecek sürüm
Developer ID ile imzalanmalı ve Apple tarafından notarize edilmelidir.

## Build komutlarının kısa özeti

| Komut | Sonuç |
| --- | --- |
| `make dev` | Frontend geliştirme sunucusunu ve native masaüstü penceresini birlikte açar. |
| `make build` | Geçerli işletim sistemi için masaüstü uygulamasını ve CLI’yi üretir. |
| `make build-cli` | Yalnızca terminal uygulamasını üretir. |
| `make install-linux` | Linux masaüstü uygulamasını kullanıcı hesabına kurar. |

Uygulamanın teknik sınırları, veri akışları ve yeni özellik ekleme rehberi
[architect.md](architect.md) içinde tutulur.
