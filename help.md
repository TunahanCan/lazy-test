# lazytest Help (Detayli Komut Rehberi)

Bu dosya, `lazytest` komutlarini capability bazinda ayrintili anlatir.
Her capability icin:

- ne yaptigi
- zorunlu parametreler
- tavsiye edilen kullanim
- ornek komutlar

yer alir.

## 1) Komut Agaci

```text
lazytest
|- load
|- run
|  |- smoke
|  |- drift
|  |- tcp
|- compare
|- lt
|- plan
|  |- new
|  |- edit
|- desktop
```

## 2) Global Flag'ler

Asagidaki flag'ler cogu komutta global olarak vardir:

- `-f, --file`: OpenAPI veya LT plan dosyasi
- `-e, --env`: ortam adi (`dev|test|prod`, varsayilan `dev`)
- `--base`: base URL override
- `--env-config`: env config yolu (varsayilan `env.yaml`)
- `--auth-config`: auth config yolu (varsayilan `auth.yaml`)
- `-v, --verbose`: detayli log

Not:

- Her komut tum global flag'leri aktif olarak kullanmayabilir.
- Davranis detaylari komut bolumlerinde ayrica belirtilmistir.

## 3) `load`

Amac:

- OpenAPI dosyasini parse/validate edip endpoint sayisini gormek.

Kullanim:

```bash
lazytest load -f openapi.sample.yaml
```

Beklenen cikti:

- `Loaded N endpoints from ...`
- `Spec: <title> <version>` (spec info varsa)

Sik hata:

- `--file is required` -> `-f` vermedin.

## 4) `run smoke`

Amac:

- OpenAPI'deki endpointler uzerinde smoke calistirir.

Flag'ler:

- `--workers` (default `10`)
- `--report` (default `junit.xml`)
- `--json` (default `out.json`)
- `--tags` (su an headless modda aktif filtre degil)

Temel ornek:

```bash
lazytest run smoke -f openapi.sample.yaml --base http://localhost:8080
```

Raporlu ileri ornek:

```bash
lazytest run smoke \
  -f openapi.sample.yaml \
  -e dev \
  --env-config env.yaml \
  --auth-config auth.yaml \
  --workers 12 \
  --report out/smoke.junit.xml \
  --json out/smoke.json
```

Davranis notlari:

- Base URL cozulmeli (`--base` veya `env.yaml`).
- Cikti her zaman JUnit + JSON yazmayi dener.

## 5) `run drift`

Amac:

- Belirli endpoint response'unun schema ile uyumunu kontrol eder.

Flag'ler:

- `--path` (zorunlu)
- `--method` (default `GET`)

Temel ornek:

```bash
lazytest run drift \
  -f openapi.sample.yaml \
  --path /health \
  --method GET \
  --base http://localhost:8080
```

Env tabanli ornek:

```bash
lazytest run drift \
  -f openapi.sample.yaml \
  --path /users \
  --method GET \
  -e dev \
  --env-config env.yaml
```

Beklenen cikti:

- `Drift GET /path: OK=<bool> findings=<n>`
- finding satirlari (`missing`, `extra`, `type_mismatch`, `enum_violation`)

## 6) `run tcp`

Amac:

- TCP scenario plani calistirir.

Flag'ler:

- `--plan` (default `plans/tcp.yaml`)
- `--report` (default `junit.xml`)
- `--json` (default `out.json`)

Temel ornek:

```bash
lazytest run tcp --plan plans/tcp.yaml
```

Detayli ornek:

```bash
lazytest run tcp \
  --plan plans/tcp.yaml \
  --report out/tcp.junit.xml \
  --json out/tcp.json \
  -v
```

Davranis notlari:

- Plan CUE schema ile dogrulanir.
- Plan fail olursa non-zero exit doner.

## 7) `compare`

Amac:

- Ayni endpointi iki ortamda calistirir, status/header/body farkini raporlar.

Flag'ler:

- `--envA` (default `dev`)
- `--envB` (default `test`)
- `--path` (zorunlu)
- `--method` (default `GET`)

Temel ornek:

```bash
lazytest compare \
  -f openapi.sample.yaml \
  --envA dev \
  --envB test \
  --path /users \
  --method GET \
  --env-config env.yaml
```

Beklenen cikti:

- `A/B GET /users: Status A=... B=... Match=...`
- header/body fark satirlari

Onemli not:

- Compare baseURL bilgilerini `env.yaml` icinden alir.
- `--base` override compare akisinda kullanilmiyor.

## 8) `lt`

Amac:

- Taurus benzeri YAML planini headless kosar.

Flag:

- `-f, --file` (opsiyonel; verilmezse varsayilan plan kullanilir)

Temel ornek:

```bash
lazytest lt -f examples/taurus/checkouts.yaml
```

Varsayilan dosya ile:

```bash
lazytest lt
```

Beklenen cikti:

- `LT done: total=... rps=... p95=... err=...`

## 9) `plan new` ve `plan edit`

### 9.1 plan olusturma

```bash
lazytest plan new --kind tcp --out plans/new-tcp.yaml
```

### 9.2 plani editorde acma

```bash
EDITOR=vim lazytest plan edit plans/new-tcp.yaml
```

Not:

- `plan edit` komutu `$EDITOR` ortam degiskenini kullanir.

## 10) `desktop`

Amac:

- Native Fyne UI acar.

Komut:

```bash
lazytest desktop
```

Onemli:

- Bu komut ancak `desktop` build tag ile derlenmis binaryde calisir.

Dogru build:

```bash
go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop
./bin/lazytest-desktop
```

Alternatif:

```bash
go run -tags desktop ./cmd/lazytest-desktop
```

## 11) Desktop Capability Rehberi (Panel Bazli)

### 11.1 Workspace

- OpenAPI, env, auth dosyalarini sec
- Workspace kaydet
- Spec yukle

### 11.2 Explorer

- Query/method/tag ile endpoint filtrele
- Example request uret
- Header/body duzenleyip request gonder
- Response status/body gor

### 11.3 Smoke / Drift / Compare / Load Tests

- Parametre formunu doldur
- Run baslat
- Gerekirse iptal et
- Sonucu panel kartinda ve global log dock'ta takip et

### 11.4 Live Metrics

- p95, rps, error-rate trendlerini izle
- status dagilimini gor

### 11.5 Logs

- Aktif run loglarini tam panelde gor

### 11.6 Reports

- Gecmis runlari type/status ile filtrele
- Secili run detayini JSON olarak incele
- JSON veya summary export al

## 12) Capability Bazli Ornek Senaryolar

### Senaryo A - Sifirdan smoke

```bash
lazytest load -f openapi.sample.yaml
lazytest run smoke -f openapi.sample.yaml --base http://localhost:8080 --report out/smoke.junit.xml --json out/smoke.json
```

### Senaryo B - Drift sonra compare

```bash
lazytest run drift -f openapi.sample.yaml --path /users --method GET --base http://localhost:8080
lazytest compare -f openapi.sample.yaml --envA dev --envB test --path /users --method GET --env-config env.yaml
```

### Senaryo C - LT + TCP birlikte

```bash
lazytest lt -f examples/taurus/checkouts.yaml
lazytest run tcp --plan plans/tcp.yaml --report out/tcp.junit.xml --json out/tcp.json -v
```

## 13) Cikti Dosyalari ve Nerede Olusur

Varsayilan:

- `junit.xml`
- `out.json`

Ozel klasore yazmak icin:

```bash
mkdir -p out
lazytest run smoke -f openapi.sample.yaml --base http://localhost:8080 --report out/smoke.junit.xml --json out/smoke.json
```

## 14) SSS / Sorun Giderme

### 14.1 `package cmd/lazytest-desktop is not in std`

Neden:

- `./` eksik.

Cozum:

```bash
go run -tags desktop ./cmd/lazytest-desktop
```

### 14.2 `desktop build tag required`

Neden:

- Desktop komutu tagsiz binaryde calisti.

Cozum:

```bash
go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop
./bin/lazytest-desktop
```

### 14.3 `set --base or env config baseURL`

Neden:

- Smoke/Drift icin baseURL cozulmedi.

Cozum:

- `--base http://...` ver
- veya `env.yaml` icinde ilgili ortam icin `baseURL` tanimla

### 14.4 `make: command not found`

Cozum:

- `make` kur
- veya dogrudan:

```bash
go build -o bin/lazytest ./cmd/lazytest
go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop
```

### 14.5 GUI ortaminda degilim, desktop acilmiyor

Belirti:

- `X11: Failed to open display`

Cozum:

- Desktop binaryyi GUI oturumunda calistir.

## 15) Test ve Dogrulama Komutlari

```bash
# tum testler
go test ./...

# desktop testleri
go test -tags desktop ./internal/desktop/...

# desktop build dogrulamasi
go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop

# CLI build dogrulamasi
go build -o bin/lazytest ./cmd/lazytest
```
