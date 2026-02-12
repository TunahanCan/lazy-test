# lazytest

REST mikroservisleri için **OpenAPI tabanlı Smoke & Contract** testleri ve **Taurus YAML uyumlu** tek makinede performans (LT mode) koşumları yapan TUI uygulaması.

## Gereksinimler

- Go 1.22+

## Kurulum

```bash
go mod tidy
go run ./cmd/lazytest
```

Veya:

```bash
make build
./bin/lazytest
```

## TUI Menü (6 madde)

1. **Endpoint Explorer** – Tag/path listesi; tekil smoke (`r`), contract drift (`o`)
2. **Test Suites** – Smoke (critical/all), Contract (schema), Negative (401/403), Regression; `A` suite çalıştır
3. **Load Tests (LT)** – Taurus YAML planları; Scenarios/Data/Assertions özeti; `L` koştur, `W` warm-up, `E` error budget
4. **Live Metrics** – Son koşum: p50/p90/p95/p99, RPS, error rate; threshold ihlali kırmızı; `R` reset, `H` hide/show
5. **Contract Drift** – Drift bulunan path’ler (missing/extra/type_mismatch/enum)
6. **Environments & Settings** – Aktif env (dev/test/uat/prod), baseURL, timeout, rate-limit; Auth Profiles; OpenAPI Sources; `s` rapor kaydet

## Kısayollar

| Tuş | Açıklama |
|-----|----------|
| `q` | Çıkış |
| `Tab` / `Shift+Tab` | Odak değiştir |
| `/` | Tabloda filtre |
| `s` | JUnit XML + JSON rapor kaydet |
| **Endpoint Explorer** | `r` run, `o` drift |
| **Test Suites** | `A` suite run |
| **Load Tests** | `L` load run, `W` warm-up on/off, `E` error budget eşikleri |
| **Live Metrics** | `R` reset, `H` hide/show |
| **Settings** | `e` env seç, `p` auth profili seç, Enter uygula |

## Konfigürasyon

- **env.yaml**: `name`, `baseURL`, `headers`, `rateLimitRPS` (dev|test|uat|prod)
- **auth.yaml**: `profiles` (jwt / apikey)

## Örnek Komutlar

```bash
# TUI (OpenAPI + varsayılan LT plan)
lazytest -f openapi.sample.yaml -e dev --base http://localhost:8080

# OpenAPI yükle ve TUI
lazytest load -f openapi.yaml -e dev --base https://dev.api.local

# LT plan ile TUI
lazytest lt -f examples/taurus/checkouts.yaml

# Smoke + rapor (headless)
lazytest run smoke -f openapi.yaml -e dev --base https://dev.api.local --report junit.xml --json out.json

# Contract drift
lazytest run drift -f openapi.yaml --path /health --method GET -e dev --base http://localhost:8080

# A/B karşılaştırma
lazytest compare -f openapi.yaml --envA dev --envB test --path /users --method GET
```

## LT mode (Taurus YAML)

- **execution**: `concurrency`, `ramp-up`, `hold-for`, `scenario`
- **scenarios**: `base-url`, `headers`, `think-time`, `requests` (method/url/body, extract-jsonpath, assertions)
- **assertions**: status-code, p95-time-ms, jsonpath
- **data-sources**: CSV (opsiyonel)

Örnek plan: `examples/taurus/checkouts.yaml`. Tek node, goroutine VU’lar; warm-up ve error budget (E ile eşik) desteklenir.

## Raporlar

- `s`: junit.xml + out.json (Endpoint Explorer / Smoke sonuçlarına göre)
