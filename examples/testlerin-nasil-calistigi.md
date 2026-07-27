# Validex Testlerini Çalıştırma

Bu doküman, repoda bulunan frontend, Go ve Wails bridge testlerinin mevcut
çalıştırma komutlarını açıklar.

## Tüm test akışı

Projenin kök dizininde:

```bash
make test
```

`make test` şu adımları sırasıyla çalıştırır:

```bash
cd cmd/validex/frontend
npm ci
npm run typecheck
npm test

cd ../../..
go test ./...
go test -tags wails ./internal/wailsapp ./cmd/validex
```

- `npm run typecheck`, TypeScript kaynaklarını çıktı üretmeden kontrol eder.
- `npm test`, Vitest testlerini tek sefer çalıştırır.
- `go test ./...`, normal build tag’leriyle Go paket testlerini çalıştırır.
- Son komut, `wails` build tag’li bridge testlerini çalıştırır ve masaüstü
  giriş paketini derler.

## Frontend testleri

Frontend testleri `cmd/validex/frontend/src` altındaki `*.test.ts` ve
`*.test.tsx` dosyalarındadır.

Testlerin doğruladığı ana alanlar:

| Alan | Test dosyaları |
| --- | --- |
| Uygulama açılışı, URL düzenleme, gönderme ve hata akışı | `App.test.tsx` |
| Request değişkenleri, header’lar ve cURL üretimi | `components/RequestWorkbench.test.tsx` |
| Response görünümleri ve timeline | `components/ResponsePanel.test.tsx` |
| Sekme kapatma, pin ve çalışan istek güvenliği | `components/RequestTabs.test.tsx`, `stores/workspace.test.ts` |
| Panel düzeni, OpenAPI importu ve komut paleti | `components/AppShell.test.tsx`, `components/WorkspaceChrome.test.tsx` |
| Java/contract dosyası üretimi | `components/CodeGeneratorDialog.test.ts` |
| URL şeması ve OpenAPI URL oluşturma | `lib/schemas.test.ts`, `lib/openapi.test.ts` |
| Ortak UI davranışı | `components/ui.test.tsx` |

Tüm frontend testlerini doğrudan çalıştırmak için:

```bash
cd cmd/validex/frontend
npm ci
npm test
```

Tek bir dosyayı çalıştırmak için dosya yolunu Vitest’e verin:

```bash
npm test -- src/components/RequestWorkbench.test.tsx
```

Değişiklikleri izleyerek test çalıştırmak için:

```bash
npm run test:watch
```

Yalnız TypeScript kontrolünü çalıştırmak için:

```bash
npm run typecheck
```

## Go testleri

Normal Go paket testlerini projenin kökünden çalıştırmak için:

```bash
go test ./...
```

Native HTTP gönderme, URL normalizasyonu, değişken çözme, timeout, bilinmeyen
iptal kimliği, path traversal koruması ve atomik dosya yazma davranışları
`internal/wailsapp/bridge_test.go` içinde, `wails` build tag’iyle test edilir:

```bash
go test -tags wails ./internal/wailsapp -v
```

Tek bir bridge testini çalıştırmak için:

```bash
go test -tags wails ./internal/wailsapp \
  -run TestSendRequestReturnsRichResponse -v
```

Masaüstü giriş paketini de aynı build tag’iyle derleyip kontrol etmek için:

```bash
go test -tags wails ./internal/wailsapp ./cmd/validex
```
