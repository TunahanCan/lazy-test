# Validex Testlerini Çalıştırma

## Tüm test ve tip kontrolü

Proje kökünde:

```bash
make test
```

Çalıştırılan adımlar:

```bash
cd cmd/validex/frontend
npm ci
npm run typecheck
npm test

cd ../../..
go test ./...
go test -tags wails ./internal/wailsapp ./cmd/validex
```

## Frontend

Tüm frontend testleri:

```bash
cd cmd/validex/frontend
npm ci
npm test
```

Tek dosya:

```bash
npm test -- src/components/MockServerLab.test.tsx
```

Watch modu ve yalnız tip kontrolü:

```bash
npm run test:watch
npm run typecheck
```

Aktif test alanları:

| Alan | Başlıca test dosyaları |
| --- | --- |
| Uygulama açılışı, request gönderme, iptal ve hatalar | `App.test.tsx`, `components/RequestWorkbench.test.tsx` |
| Sekmeler, layout, OpenAPI import ve komut paleti | `components/RequestTabs.test.tsx`, `components/AppShell.test.tsx`, `components/WorkspaceChrome.test.tsx` |
| Response, timeline ve contract drift görünümü | `components/ResponsePanel.test.tsx` |
| Mock server arayüzü | `components/MockServerLab.test.tsx` |
| Spring/JWT/Actuator/ortam/thread/log/coverage arayüzü | `components/DiagnosticsLab.test.tsx` |
| SSE, WebSocket ve gRPC arayüzü | `components/ProtocolLab.test.tsx` |
| JSON ve Java DTO araçları | `components/JSONLab.test.tsx`, `lib/developerTools.test.ts` |
| URL, OpenAPI URL ve güvenli workspace persistence | `lib/schemas.test.ts`, `lib/openapi.test.ts`, `stores/workspace.test.ts` |

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

Mock route, Actuator, environment, SSE, WebSocket ve gRPC network akışları yerel
test sunucularıyla doğrulanır. OpenAPI örnekleri, thread dump, log ve coverage
analizleri deterministik fixture’larla kontrol edilir.

Wails bridge ve masaüstü giriş paketini kontrol etmek için:

```bash
go test -tags wails ./internal/wailsapp ./cmd/validex
```

Tek bridge testi:

```bash
go test -tags wails ./internal/wailsapp \
  -run TestMockServerBridgeLifecycleAndHitSnapshot -v
```

## Race ve vet

Değişiklik tesliminden önce önerilen ek kontroller:

```bash
go test -race ./...
go test -race -tags wails ./internal/wailsapp
go vet ./...
go vet -tags wails ./internal/wailsapp ./cmd/validex
```
