# Validex Testlerini Çalıştırma

## Tüm test ve tip kontrolü

Proje kökünde:

```bash
make test
```

Çalıştırılan adımlar:

```bash
cd cmd/validex/frontend
node scripts/typecheck.mjs
node scripts/build.mjs
node --test

cd ../../..
go test ./...
go test -tags canbridge ./internal/nativewebview ./internal/canbridge ./cmd/validex
```

Frontend testleri için paket kurulumu veya ağ erişimi yapılmaz. TypeScript
5.9.3 derleyicisi `cmd/validex/frontend/third_party/typescript` altında
vendored build bağımlılığıdır.

## Frontend

Tüm frontend testleri:

```bash
cd cmd/validex/frontend
node scripts/typecheck.mjs
node scripts/build.mjs
node --test
```

Tek dosya:

```bash
node scripts/build.mjs
node --test scripts/request-workspace.test.mjs
```

Yalnız tip kontrolü:

```bash
node scripts/typecheck.mjs
```

Aktif test alanları:

| Alan | Başlıca test dosyaları |
| --- | --- |
| URL/OpenAPI, JSON/DTO, diagnostics, collection, store ve layout modelleri | `scripts/frontend.test.mjs` |
| Request draft, sekme klavyesi, response resize ve clipboard davranışı | `scripts/request-workspace.test.mjs` |
| Production/development emit, hata rollback’i ve build kilidi | `scripts/build.test.mjs` |
| Modül grafiği, güvenli path/import ve atomik artifact promotion | `scripts/package-typescript.test.mjs` |
| Development sunucusu, watcher ve rebuild kuyruğu | `scripts/dev.test.mjs` |
| Sıfır runtime bağımlılığı, vendored derleyici ve yalnız TypeScript kaynak politikası | `scripts/dependency-policy.test.mjs` |

## Go paketleri

Normal paketler:

```bash
go test ./...
```

Hedefli örnekler:

```bash
go test ./internal/mockserver -v
go test ./internal/diagnostics -v
go test ./internal/protocols -v
```

Mock route, Actuator, environment ve SSE network akışları yerel test
sunucularıyla doğrulanır. OpenAPI örnekleri, thread dump, log ve coverage
analizleri deterministik fixture’larla kontrol edilir.

canbridge native IPC ve masaüstü giriş paketini kontrol etmek için:

```bash
go test -tags canbridge ./internal/nativewebview ./internal/canbridge ./cmd/validex
```

Tek bridge testi:

```bash
go test -tags canbridge ./internal/canbridge \
  -run TestMockServerBridgeLifecycleAndHitSnapshot -v
```

## Race ve vet

Değişiklik tesliminden önce önerilen ek kontroller:

```bash
go test -race ./...
go test -race -tags canbridge ./internal/canbridge
go vet ./...
go vet -tags canbridge ./internal/nativewebview ./internal/canbridge ./cmd/validex
```
