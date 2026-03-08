# Java Developer Guide (Go Codebase Orientation)

Bu dosya, Go kodunu Java bakis acisiyla hizli okumak icin hazirlandi.

## Katman Haritasi

- `cmd/*`
  - Java: `main()` + bootstrap
  - Gorev: uygulamayi baslatir.

- `internal/appsvc/*`
  - Java: `ApplicationService` katmani
  - Gorev: use-case orchestration, run lifecycle, workspace persistence, request hazirlama.

- `internal/core/*`
  - Java: domain/use-case helpers
  - Gorev: OpenAPI parsing, smoke/drift/compare saf is kurallari.

- `internal/desktop/*`
  - Java: presentation adapter (UI controller shell)
  - Gorev: Fyne UI, panel yonetimi, run event projection.

- `internal/report/*`
  - Java: outbound adapter (report writer)

- `internal/config/*`
  - Java: config loader/repository

## appsvc Dosya Ayrimi (Yeni)

- `service.go`
  - Facade state + constructor.
- `service_spec.go`
  - Spec import, endpoint query, request template olusturma.
- `service_http.go`
  - Tek HTTP request execution.
- `service_runs.go`
  - Smoke/Drift/Compare/LT/TCP run orchestration.
- `service_workspace.go`
  - Workspace save/load (file repository).
- `service_events.go`
  - Event sink publishing.

Bu ayrim Java tarafindaki `Service + Repository + Async Orchestrator` ayrimina daha yakindir.

## Okuma Sirasi (Onerilen)

1. `internal/appsvc/service.go`
2. `internal/appsvc/service_spec.go`
3. `internal/appsvc/service_runs.go`
4. `internal/desktop/app.go`
5. `internal/desktop/ui/main_window.go`
6. `internal/desktop/panels/*`

## Go -> Java Mental Model

- `struct` -> class (field + method)
- `interface` -> interface (duck typing, implicit implementation)
- `goroutine` -> lightweight async task/thread
- `channel` -> blocking queue / reactive stream primitive
- `context.Context` -> cancellation/deadline token
- `defer` -> finally benzeri cleanup mekanizmasi

## Pratik Refactor Kurallari

- DTO tipleri (`RequestDTO`, `ResponseDTO`, `RunSnapshot`) genelde immutable gibi dusunulmeli.
- `Service` icindeki `mu` (mutex) korunmadan shared state degistirme.
- UI paneli yazarken `DesktopApp` ve `SharedState` uzerinden git; dogrudan core/appsvc'ye baglanma.
