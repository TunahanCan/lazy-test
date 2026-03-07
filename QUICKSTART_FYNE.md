# LazyTest Fyne Desktop - Quick Start

## Current State
The modular Fyne desktop UI is implemented and wired as the default desktop path.

## Build and Run

```bash
# Desktop tests
GOCACHE=/tmp/go-build go test -tags desktop ./internal/desktop/...

# Desktop binary
GOCACHE=/tmp/go-build go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop

# Run
./bin/lazytest-desktop
```

## Implemented Surface
- Main window orchestration + panel contract
- Navigation + status bar + global shortcuts
- Workspace panel (browse, validate, save, load spec)
- Explorer panel (filter, select endpoint, send request)
- Smoke / Drift / Compare run panels
- LoadTests panel + LiveMetrics charts
- Reports panel with type/status filters
- Run event aggregation (`RunEventAggregator`)
- Reusable widgets (`ProgressCard`, `LogViewer`, `DiffViewer`, `LineChart`, `BarChart`, `Collapsible`)
- Desktop theme (`internal/styles/theme_desktop.go`)

## Notes
- Legacy `internal/desktop/fyne_ui.go` remains as deprecated fallback reference.
- Full repository tests may fail in restricted sandboxes due local socket limitations; desktop package tests are passing.
