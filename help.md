# lazytest Help

Bu dokuman, komut referansi ve calisma modeli icin teknik yardim sayfasidir.

## 1) Calisma Modlari

- Headless CLI
- Desktop UI (Fyne)

TUI artik desteklenmiyor.

## 2) Global Flag'ler

Tum komutlarin cogu su flag'leri destekler:

- `-f, --file`: OpenAPI/LT dosyasi
- `-e, --env`: ortam adi (`dev`, `test`, `prod`)
- `--base`: base URL override
- `--env-config`: varsayilan `env.yaml`
- `--auth-config`: varsayilan `auth.yaml`
- `-v, --verbose`: ayrintili cikti

## 3) Komut Referansi

### `lazytest load`
OpenAPI dosyasini yukler ve ozet bilgi basar.

```bash
lazytest load -f openapi.yaml
```

### `lazytest run smoke`
Tum endpoint'ler icin smoke kosar.

```bash
lazytest run smoke -f openapi.yaml --workers 10 --report junit.xml --json out.json
```

### `lazytest run drift`
Tek endpoint icin schema drift kontrolu yapar.

```bash
lazytest run drift -f openapi.yaml --path /health --method GET
```

### `lazytest run tcp`
TCP senaryo plani kosar.

```bash
lazytest run tcp --plan plans/tcp.yaml --report junit.xml --json out.json
```

### `lazytest compare`
Ayni endpoint'i iki ortamda calistirip farklari raporlar.

```bash
lazytest compare -f openapi.yaml --envA dev --envB test --path /users --method GET
```

### `lazytest lt`
Taurus benzeri plani headless kosar.

```bash
lazytest lt -f examples/taurus/checkouts.yaml
```

### `lazytest plan new`
Ornek plan olusturur.

```bash
lazytest plan new --kind tcp --out plans/tcp.yaml
```

### `lazytest plan edit`
Plan dosyasini editor ile acar.

```bash
lazytest plan edit plans/tcp.yaml
```

### `lazytest desktop`
Native desktop UI baslatir.

```bash
# onerilen
make run-desktop

# veya
go run -tags desktop ./cmd/lazytest-desktop
```

## 4) Desktop UI Rehberi

Layout:

- Sol: navigation
- Orta ust: yetenekler (hizli gecis / aksiyon)
- Orta alt: sabit live log paneli
- Alt bar: genel durum

Canli log paneli:

- Smoke/Drift/Compare/Load calisirken event satirlari anlik akar
- Run biterse final status satiri gorunur
- `Clear` ile panel temizlenebilir

## 5) Rapor Dosyalari

- Smoke: JUnit + JSON
- TCP: JUnit + JSON
- Drift/Compare: stdout odakli; gerektiğinde desktop export kullanilabilir

## 6) Sik Hatalar

### `package cmd/lazytest-desktop is not in std`
Yanlis paket yolu kullanimi.

Dogru:

```bash
go run -tags desktop ./cmd/lazytest-desktop
```

### `desktop build tag required`
`lazytest desktop` komutu normal binary ile calisti.
Desktop tag ile derleyin:

```bash
make build-desktop
./bin/lazytest-desktop
```

## 7) Gelistirici Notlari

- Desktop test:

```bash
go test -tags desktop ./internal/desktop/...
```

- Desktop build:

```bash
go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop
```

- CLI build:

```bash
go build -o bin/lazytest ./cmd/lazytest
```
