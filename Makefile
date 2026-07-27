WAILS_VERSION := v2.12.0
WAILS_BIN := $(shell go env GOPATH)/bin/wails
APP_DIR := cmd/lazytest
FRONTEND_DIR := $(APP_DIR)/frontend

.PHONY: tools dev build test

tools:
	go install github.com/wailsapp/wails/v2/cmd/wails@$(WAILS_VERSION)

dev: tools
	cd $(APP_DIR) && $(WAILS_BIN) dev -m -nosyncgomod

build: tools
	cd $(APP_DIR) && $(WAILS_BIN) build -clean -m -nosyncgomod

test:
	cd $(FRONTEND_DIR) && npm ci && npm run typecheck && npm test
	go test ./...
	go test -tags wails ./internal/wailsapp ./cmd/lazytest
