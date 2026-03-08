# lazytest

OpenAPI tabanli API dogrulama ve yuk testi aracidir.

- Headless CLI: smoke, drift, compare, tcp, lt
- Native desktop UI (Fyne): calisma yonetimi, canli metrik, canli log

## Neler yapar?

- OpenAPI spec'ten endpoint kesfi
- Paralel smoke test
- Contract drift kontrolu (schema uyumlulugu)
- Iki ortam arasinda A/B karsilastirma
- Taurus benzeri YAML plan ile load test
- TCP plan calistirma
- JUnit XML + JSON raporlama

## Gereksinimler

- Go 1.24+
- Desktop icin (Linux):
  - `libgl1-mesa-dev`
  - `xorg-dev`

## Kurulum ve Build

```bash
go mod tidy
make build
```

CLI binary:

```bash
./bin/lazytest
```

Desktop binary:

```bash
make build-desktop
./bin/lazytest-desktop
```

## Hemen Basla

Smoke:

```bash
./bin/lazytest run smoke -f openapi.sample.yaml -e dev --base http://localhost:8080
```

Drift:

```bash
./bin/lazytest run drift -f openapi.sample.yaml --path /health --method GET -e dev --base http://localhost:8080
```

Compare:

```bash
./bin/lazytest compare -f openapi.sample.yaml --envA dev --envB test --path /users --method GET
```

Load test:

```bash
./bin/lazytest lt -f examples/taurus/checkouts.yaml
```

TCP:

```bash
./bin/lazytest run tcp --plan plans/tcp.yaml
```

## Komutlar

- `lazytest load -f <openapi>`
- `lazytest run smoke -f <openapi> [--workers N] [--report junit.xml] [--json out.json]`
- `lazytest run drift -f <openapi> --path <path> [--method GET]`
- `lazytest run tcp --plan <tcp.yaml> [--report junit.xml] [--json out.json]`
- `lazytest compare -f <openapi> --envA <a> --envB <b> --path <path> [--method GET]`
- `lazytest lt -f <taurus.yaml>`
- `lazytest plan new --kind tcp --out plans/tcp.yaml`
- `lazytest plan edit <path>`
- `lazytest desktop`

Not: `lazytest desktop` komutu `-tags desktop` ile derlenmis binary gerektirir.

## Sık Kullanilan Flag'ler

- `-f, --file`: OpenAPI veya LT plan dosyasi
- `-e, --env`: ortam adi
- `--base`: base URL override
- `--env-config`: ortam dosyasi (varsayilan `env.yaml`)
- `--auth-config`: auth dosyasi (varsayilan `auth.yaml`)
- `-v, --verbose`: ayrintili cikti

## Desktop UI Ozet

Yeni desktop duzeni su sekildedir:

- Sol: komple navigation bar
- Orta: secili panel icerigi
- Orta alt: sabit canli log ekrani (run eventlerini anlik yazar)
- En alt: status bar

UI, terminal-modern bir gorunumle tasarlanmistir (monospace, yuksek kontrast).

## Java Developer Notu

Kod tabanini Java bakis acisiyla hizli okumak icin:

- [JAVA_DEVELOPER_GUIDE.md](JAVA_DEVELOPER_GUIDE.md)

## Makefile Hedefleri

```bash
make build
make build-desktop
make run
make run-desktop
make test
make lint
make package-desktop
```

## Raporlama

- Smoke ve TCP akislarinda JUnit + JSON dosyalari uretilir.
- Dosya yollari `--report` ve `--json` ile degistirilebilir.

## Proje Durumu

TUI kaldirilmistir.
Aktif arayuz: Desktop (Fyne) + Headless CLI.
