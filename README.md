# lazytest

OpenAPI tabanli API dogrulama ve yuk testi aracidir.

`lazytest` iki ana calisma moduna sahiptir:

- Headless CLI
- Native Desktop UI (Fyne)

TUI artik kullanilmiyor.

## 1) Capability Ozeti

| Capability | CLI | Desktop | Cikti |
|---|---|---|---|
| OpenAPI yukleme ve endpoint kesfi | `lazytest load` | Workspace + Explorer | Spec ozeti |
| Smoke test | `lazytest run smoke` | Smoke paneli | JUnit + JSON |
| Contract drift | `lazytest run drift` | Drift paneli | Console + history |
| A/B compare | `lazytest compare` | Compare paneli | Console + history |
| Load test (Taurus benzeri YAML) | `lazytest lt` | Load Tests paneli | Console + metrics + history |
| TCP scenario | `lazytest run tcp` | (CLI odakli) | JUnit + JSON |
| Gecmis run inceleme/export | dolayli | Reports paneli | JSON/text export |

## 2) Gereksinimler

- Go `1.24+`
- Linux desktop icin Fyne bagimliliklari:
  - `libgl1-mesa-dev`
  - `xorg-dev`
- `make` opsiyonel (yoksa dogrudan `go build` komutlariyla devam edebilirsin)

## 3) Kurulum ve Build

### 3.1 Repository hazirligi

```bash
go mod tidy
```

### 3.2 CLI binary

```bash
go build -o bin/lazytest ./cmd/lazytest
```

### 3.3 Desktop binary

```bash
go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop
```

### 3.4 Makefile kullanimlari

```bash
make build
make build-desktop
make run
make run-desktop
make test
make lint
```

## 4) Konfigurasyon Dosyalari

### 4.1 `env.yaml`

Ortam bazli baseURL ve ortak header tanimlari:

```yaml
environments:
  - name: dev
    baseURL: https://dev.api.local
    headers:
      X-Trace: lazytest
    rateLimitRPS: 5
```

### 4.2 `auth.yaml`

Auth profile tanimlari:

```yaml
profiles:
  - name: default-jwt
    type: jwt
    token: "<paste-token>"
```

Notlar:

- CLI `resolveContext()` akisinda varsayilan olarak `default-jwt` profili okunur.
- Compare akisinda auth header su an aktif kullanilmiyor.

## 5) Hizli End-to-End Akis

### 5.1 Spec yukle

```bash
./bin/lazytest load -f openapi.sample.yaml
```

### 5.2 Smoke kos

```bash
./bin/lazytest run smoke -f openapi.sample.yaml -e dev --base http://localhost:8080
```

### 5.3 Drift kos

```bash
./bin/lazytest run drift -f openapi.sample.yaml --path /health --method GET --base http://localhost:8080
```

### 5.4 Compare kos

```bash
./bin/lazytest compare -f openapi.sample.yaml --envA dev --envB test --path /users --method GET --env-config env.yaml
```

### 5.5 LT kos

```bash
./bin/lazytest lt -f examples/taurus/checkouts.yaml
```

### 5.6 TCP kos

```bash
./bin/lazytest run tcp --plan plans/tcp.yaml --report junit.xml --json out.json
```

## 6) Capability Rehberi (Detayli)

### 6.1 `load` - OpenAPI dogrula ve ozetle

Amac:

- OpenAPI dosyasini parse/validate etmek
- Endpoint sayisi ve spec bilgisini gormek

Temel kullanim:

```bash
lazytest load -f openapi.sample.yaml
```

Beklenen cikti:

- `Loaded <N> endpoints from ...`
- `Spec: <title> <version>` (varsa)

### 6.2 `run smoke` - toplu endpoint smoke testi

Amac:

- Tum endpointleri veya secili endpointleri hizli saglik kontrolunden gecirmek

Temel kullanim:

```bash
lazytest run smoke -f openapi.sample.yaml --base http://localhost:8080
```

Raporlu kullanim:

```bash
lazytest run smoke \
  -f openapi.sample.yaml \
  -e dev \
  --workers 12 \
  --report out/smoke.junit.xml \
  --json out/smoke.json \
  --env-config env.yaml \
  --auth-config auth.yaml
```

Notlar:

- `--tags` flag'i mevcut ama headless modda aktif filtre uygulamiyor.
- Base URL zorunlu: `--base` ile ya da `env.yaml` icinden gelmeli.

### 6.3 `run drift` - contract drift analizi

Amac:

- Belirli endpoint response'unun schema ile uyumunu kontrol etmek

Temel kullanim:

```bash
lazytest run drift \
  -f openapi.sample.yaml \
  --path /users \
  --method GET \
  --base http://localhost:8080
```

Ortam dosyasi ile kullanim:

```bash
lazytest run drift \
  -f openapi.sample.yaml \
  --path /health \
  --method GET \
  -e dev \
  --env-config env.yaml
```

Drift ciktilari:

- `OK=true/false`
- finding listesi: `missing`, `extra`, `type_mismatch`, `enum_violation`

### 6.4 `compare` - iki ortami karsilastir

Amac:

- Ayni endpointi iki farkli ortamda cagirip status/header/body farklarini bulmak

Temel kullanim:

```bash
lazytest compare \
  -f openapi.sample.yaml \
  --envA dev \
  --envB test \
  --path /users \
  --method GET \
  --env-config env.yaml
```

Notlar:

- `envA/envB` mutlaka `env.yaml` icinde tanimli olmali.
- Compare akisinda baseURL `env.yaml` kaynaklidir.

### 6.5 `lt` - load test plani calistir

Amac:

- Taurus benzeri YAML planini tek node uzerinden calistirmak

Temel kullanim:

```bash
lazytest lt -f examples/taurus/checkouts.yaml
```

Kisa kullanim (varsayilan dosya):

```bash
lazytest lt
```

Plan alanlari (ozet):

- `execution[*].concurrency`, `ramp-up`, `hold-for`, `scenario`
- `scenarios.<name>.base-url`, `headers`, `requests`, `assertions`
- `data-sources` (CSV)

### 6.6 `run tcp` - TCP senaryo testi

Amac:

- TCP seviyesinde adim adim senaryo kosmak (connect/write/read/sleep/close)

Temel kullanim:

```bash
lazytest run tcp --plan plans/tcp.yaml
```

Raporlu kullanim:

```bash
lazytest run tcp \
  --plan plans/tcp.yaml \
  --report out/tcp.junit.xml \
  --json out/tcp.json \
  -v
```

TCP plani tipik adimlari:

- `connect`
- `write` (`bytes` / `base64` / `hex`)
- `read` (`until` / `size` + `assert`)
- `sleep`
- `close`

### 6.7 `plan` yardimci komutlari

Yeni plan olustur:

```bash
lazytest plan new --kind tcp --out plans/new-tcp.yaml
```

Plani editorde ac:

```bash
EDITOR=nano lazytest plan edit plans/new-tcp.yaml
```

### 6.8 `desktop` - native UI

CLI komutu:

```bash
lazytest desktop
```

Onemli:

- Bu komut, binary desktop tag ile build edilmediyse `desktop build tag required` hatasi verir.
- Dogru:
  - `go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop`
  - `./bin/lazytest-desktop`

## 7) Desktop UI Kullanim Rehberi

Layout:

- Sol: Navigation
- Orta: Secili panel
- Alt: Sabit canli log
- En alt: Status bar

Panel kullanimi:

- `Dashboard`: hizli gecis, calisma sagligi, telemetri ozeti
- `Workspace`: spec/env/auth dosyalarini sec, kaydet, spec yukle
- `Explorer`: endpoint filtrele, example request uret, istek gonder
- `Smoke`: run-all veya tek endpoint smoke baslat/iptal
- `Drift`: tek endpoint drift analizi
- `Compare`: envA-envB endpoint karsilastirma
- `Load Tests`: LT plan sec, threshold gir, run baslat/iptal
- `Live Metrics`: p95, rps, error-rate ve status dagilimi
- `Logs`: run loglarini tam panel olarak inceleme
- `Reports`: gecmis kosulari filtrele/export et

Kisayollar:

- `Ctrl+O` -> Workspace
- `Ctrl+E` -> Explorer
- `Ctrl+R` -> Reports
- `Esc` -> aktif run iptal

## 8) Raporlama ve Cikti Dosyalari

Varsayilan dosyalar:

- Smoke JUnit: `junit.xml`
- Smoke JSON: `out.json`
- TCP JUnit: `junit.xml`
- TCP JSON: `out.json`

Ornek:

```bash
lazytest run smoke -f openapi.sample.yaml --base http://localhost:8080 --report out/smoke.junit.xml --json out/smoke.json
```

## 9) Sorun Giderme

### 9.1 `package cmd/lazytest-desktop is not in std`

Yanlis komut:

```bash
go run -tags desktop cmd/lazytest-desktop
```

Dogru komut:

```bash
go run -tags desktop ./cmd/lazytest-desktop
```

### 9.2 `desktop build tag required`

Neden:

- Desktop komutu normal (tagsiz) binary ile calistiriliyor.

Cozum:

```bash
go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop
./bin/lazytest-desktop
```

### 9.3 `set --base or env config baseURL`

Neden:

- Smoke/Drift icin base URL cozulmedi.

Cozum:

- `--base http://...` gec
- veya `env.yaml` icinde ilgili `env` icin `baseURL` tanimla

### 9.4 `make: command not found`

Cozum:

- `make` kur
- veya dogrudan `go build` / `go run` komutlarini kullan

### 9.5 `X11: Failed to open display`

Neden:

- GUI olmayan ortamda desktop binary calistiriliyor.

Cozum:

- Desktop uygulamayi GUI olan lokal oturumda calistir.

## 10) Gelistirici Komutlari

```bash
# CLI + genel testler
go test ./...

# Desktop testleri
go test -tags desktop ./internal/desktop/...

# Desktop build
go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop

# CLI build
go build -o bin/lazytest ./cmd/lazytest
```

## 11) Java Gelistirici Notu

Kod tabanini Java mental modeliyle okumak icin:

- [JAVA_DEVELOPER_GUIDE.md](JAVA_DEVELOPER_GUIDE.md)
