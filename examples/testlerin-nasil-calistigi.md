# Validex Testlerini Çalıştırma

## Hazırlık

Desktop araç zinciri `cmd/validex/package.json` altında merkezidir. Temiz bir
checkout'ta kilitli bağımlılıkları kurun:

```bash
cd cmd/validex
npm ci
cd ../..
```

Doğrudan npm `devDependencies` yalnız `electron` ve `typescript` paketleridir.
Frontend renderer'ın runtime paketi yoktur.

Make hedefleri POSIX shell kullanır. Windows'ta aşağıdaki komutları Git Bash
içinden çalıştırın; `make dev` ayrıca `curl` komutunu bekler.

## Geliştirme ve build

Proje kökünde Electron 43, frontend development sunucusu ve Go sidecar'ı
birlikte başlatmak için:

```bash
make dev
```

Host platform için production frontend, Electron shell, `validex-backend`
sidecar ve CLI çıktısını üretmek için:

```bash
make build
```

Yalnız headless CLI:

```bash
make build-cli
```

`make build` runnable host-platform çıktı üretir; installer veya otomatik
güncelleyici üretildiği anlamına gelmez.

## Tüm test ve tip kontrolü

Proje kökünde:

```bash
make test
```

Bu hedef genel olarak:

- frontend TypeScript typecheck, production build ve Node unit testlerini;
- Electron main/preload TypeScript typecheck ve build kontrolünü;
- `go test ./...` ile domain, `internal/canbridge` ve
  `cmd/validex-backend` sidecar protokol testlerini

çalıştırır. Electron–Go mimarisi için CGO veya özel bir build tag gerekmez.

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

Frontend scriptleri `cmd/validex` altına `npm ci` ile kurulmuş TypeScript
compiler'ını kullanır. Testlerin kendisi Node'un yerleşik `node:test` ve
`node:assert` modülleriyle çalışır.

Aktif test alanları:

| Alan | Başlıca test dosyaları |
| --- | --- |
| URL/OpenAPI, JSON/DTO, diagnostics, collection, store ve layout modelleri | `scripts/frontend.test.mjs` |
| Request draft, sekme klavyesi, response resize ve clipboard davranışı | `scripts/request-workspace.test.mjs` |
| Production/development emit, hata rollback'i ve build kilidi | `scripts/build.test.mjs` |
| Modül grafiği, güvenli path/import ve atomik artifact promotion | `scripts/package-typescript.test.mjs` |
| Development sunucusu, watcher ve rebuild kuyruğu | `scripts/dev.test.mjs` |
| Renderer'ın sıfır runtime paketi ve browser-native TypeScript sınırı | `scripts/dependency-policy.test.mjs` |

## Electron shell

Electron shell kaynakları `cmd/validex/electron/src` altındadır. Normal kalite
kapısı için proje kökündeki hedefi kullanın:

```bash
make test
```

Bu kontrol secure preload, bridge allowlist'i, Electron main ve sidecar client
TypeScript kaynaklarının typecheck/build aşamasını kapsar. Renderer'da
`nodeIntegration` kapalı, `contextIsolation` ve sandbox açık kalmalıdır.

## Go paketleri ve sidecar

Normal paketler:

```bash
go test ./...
```

Hedefli örnekler:

```bash
go test ./internal/mockserver -v
go test ./internal/diagnostics -v
go test ./internal/protocols -v
go test ./cmd/validex-backend -v
```

Mock route, Actuator, environment ve SSE network akışları yerel test
sunucularıyla doğrulanır. OpenAPI örnekleri, thread dump, log ve coverage
analizleri deterministik fixture'larla kontrol edilir.

Host-neutral canbridge invocation runtime'ını hedeflemek için:

```bash
go test ./internal/canbridge -v
```

Tek bridge testi:

```bash
go test ./internal/canbridge \
  -run TestMockServerBridgeLifecycleAndHitSnapshot -v
```

`cmd/validex-backend` testleri dört byte big-endian uzunlukla çerçevelenen JSON
request/response protokolünü, boyut sınırlarını, korelasyon ID'lerini ve kapanış
davranışını doğrular. Bu testler gerçek Electron penceresi açmaz.

## Browser kabul testleri

Production frontend'i gerçek Chrome üzerinde Godog/Cucumber senaryolarıyla
çalıştırmak için:

```bash
make test-e2e
```

Frontend, Electron shell, Go, browser kabul, race ve vet kapılarını birlikte
çalıştırmak için:

```bash
make test-production
```

Raw Chrome testlerinde Electron preload bulunmadığından test fixture'ı
deterministik `window.canbridge.Bridge` yüzeyi enjekte eder. Bu suite UI
contract'ını doğrular; Electron process lifecycle ve paketleme smoke testi
değildir.

## Race ve vet

Değişiklik tesliminden önce önerilen doğrudan kontroller:

```bash
go test -race ./...
go vet ./...
```

Bu kontroller de `internal/canbridge` ve `cmd/validex-backend` paketlerini
normal Go grafiğinde, build tag olmadan kapsar.
