# 🚀 lazytest

> REST mikroservisleri için **OpenAPI tabanlı kalite doğrulama** + **Taurus uyumlu yük testi** yapan CLI/TUI aracı.

![terminal demo gif](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3o3ZG5xOHV5djRtNmh0djM4NXN6N2pqd3B0eW5rNTI4OHh4eDhxNSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/coxQHKASG60HrHtvkt/giphy.gif)

---

## 🎯 lazytest neyi çözüyor?

Klasik süreçte smoke test, contract kontrolü ve load test farklı araçlara dağılır.
`lazytest` bunları **tek akışta** birleştirir:

- ✅ OpenAPI'dan endpoint keşfi
- ✅ Paralel smoke test
- ✅ Contract drift analizi
- ✅ A/B environment karşılaştırması
- ✅ Taurus planı ile load test
- ✅ Canlı TUI metrik ekranı

---

## 🧩 Özellikler

- **Smoke test:** Endpoint erişilebilirliği ve temel davranış kontrolü
- **Contract drift:** `missing`, `extra`, `type_mismatch`, `enum_violation` tespiti
- **A/B compare:** status / header / body fark analizi
- **LT mode:** Taurus YAML planlarını tek node’da çalıştırma
- **Raporlama:** JUnit XML + JSON
- **TUI ekranı:** p50/p90/p95/p99, RPS, error rate

![metrics gif](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3h5M2h6dWZmMHF0M3N2ajByMHo2M2s2aHhnNmQ4b2M4M2hoYnU3MCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/l0MYt5jPR6QX5pnqM/giphy.gif)

---

## ⚙️ Gereksinimler

- **Go 1.24+**

---

## 🛠️ Kurulum

### 1) Kaynaktan çalıştır

```bash
go mod tidy
go run ./cmd/lazytest
```

### 2) Binary üret

```bash
make build
./bin/lazytest
```

---

## ⚡ Hızlı Başlangıç

### Tüm testleri çalıştır

```bash
make test
```

### Headless smoke

```bash
./bin/lazytest run smoke -f openapi.sample.yaml -e dev --base http://localhost:8080
```

### Tek endpoint drift

```bash
./bin/lazytest run drift -f openapi.sample.yaml --path /health --method GET -e dev --base http://localhost:8080
```

### A/B compare

```bash
./bin/lazytest compare -f openapi.sample.yaml --envA dev --envB test --path /users --method GET
```

### LT mode

```bash
./bin/lazytest lt -f examples/taurus/checkouts.yaml
```

---

## 🧪 Komutlar

| Komut | Açıklama |
|---|---|
| `lazytest` | Varsayılan olarak TUI açar |
| `lazytest load -f <openapi>` | OpenAPI yükler ve TUI’ye geçer |
| `lazytest run smoke ...` | Headless smoke test çalıştırır |
| `lazytest run drift ...` | Tek endpoint için drift kontrolü yapar |
| `lazytest compare ...` | İki environment arasında A/B karşılaştırma yapar |
| `lazytest lt -f <taurus.yaml>` | LT planını yükleyip TUI açar |

### Sık kullanılan flag’ler

- `-f, --file`: OpenAPI veya LT plan dosyası
- `-e, --env`: environment adı (`dev`, `test`, `prod`)
- `--base`: base URL override
- `--env-config`: env dosyası (varsayılan `env.yaml`)
- `--auth-config`: auth dosyası (varsayılan `auth.yaml`)

Smoke için ek:
- `--workers`
- `--report`
- `--json`

Drift/A-B için ek:
- `--path`
- `--method`

---

## 🖥️ TUI bölümleri

1. **Endpoint Explorer** → Tek endpoint smoke (`r`) ve drift (`o`)
2. **Test Suites** → Toplu suite koşumu (`A`)
3. **Load Tests (LT)** → Plan çalıştırma (`L`), warm-up (`W`), error budget (`E`)
4. **Live Metrics** → p50/p90/p95/p99, RPS, error rate (`R`, `H`)
5. **Contract Drift** → Endpoint bazlı drift özeti
6. **Environments & Settings** → Env/baseURL/header/auth ve çalışma parametreleri

---

## 📁 Konfigürasyon

### `env.yaml`
- `name`
- `baseURL`
- `headers`
- `rateLimitRPS`

### `auth.yaml`
- JWT (`type: jwt`, `token`)
- API key (`type: apikey`, `header`, `key`)

---

## 📈 LT mode (Taurus YAML) desteği

Desteklenen alanlar:
- `execution`: `concurrency`, `ramp-up`, `hold-for`, `scenario`
- `scenarios`: `base-url`, `headers`, `think-time`, `requests`
- `requests`: `method`, `url`, `body`, `extract-jsonpath`, `assertions`
- `assertions`: `status-code`, `p95-time-ms`, `jsonpath`
- `data-sources`: CSV tanımları

Örnek plan: `examples/taurus/checkouts.yaml`

---

## 🧾 Raporlama

- **JUnit XML:** CI/CD test raporu
- **JSON:** Programatik analiz / arşivleme
- TUI’de `s` ile hızlı rapor kaydetme

---

## 🔧 Makefile hedefleri

```bash
make build   # bin/lazytest üretir
make test    # go test ./...
make lint    # go vet + golangci-lint (varsa)
make run     # örnek TUI çalıştırma
make lt      # örnek LT planı ile çalıştırma
```

---

## 🎬 Mini akış özeti (animasyon mantığı)

```text
OpenAPI yükle → Endpoint seç → Smoke/Drift çalıştır → Compare/LT ile derinleş → Raporla
```

İstersen bir sonraki adımda repo içine gerçek demo GIF’lerini (`docs/gifs/*.gif`) ekleyip README’de dış bağlantı yerine lokal dosya kullanabiliriz.
