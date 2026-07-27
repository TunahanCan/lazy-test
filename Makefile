APP_DIR := cmd/validex
FRONTEND_DIR := $(APP_DIR)/frontend
BUILD_DIR := $(APP_DIR)/build/bin
DEV_HOST := 127.0.0.1
DEV_PREFERRED_PORT := 34116
HOST_GOOS := $(shell go env GOOS)

.PHONY: frontend-deps dev build test

frontend-deps:
	cd $(FRONTEND_DIR) && npm ci

dev: frontend-deps
	@set -eu; \
	dev_port="$$(node "$(FRONTEND_DIR)/scripts/find-port.mjs" "$(DEV_PREFERRED_PORT)")"; \
	dev_url="http://$(DEV_HOST):$$dev_port"; \
	cd $(FRONTEND_DIR) && npm run dev -- --host "$(DEV_HOST)" --port "$$dev_port" --strictPort & \
	vite_pid=$$!; \
	trap 'kill "$$vite_pid" 2>/dev/null || true' EXIT INT TERM; \
	attempt=0; \
	until curl --fail --silent --show-error "$$dev_url" >/dev/null 2>&1; do \
		attempt=$$((attempt + 1)); \
		if ! kill -0 "$$vite_pid" 2>/dev/null; then \
			wait "$$vite_pid"; \
			exit 1; \
		fi; \
		if [ "$$attempt" -ge 100 ]; then \
			echo "Vite development server did not start at $$dev_url" >&2; \
			exit 1; \
		fi; \
		sleep 0.1; \
	done; \
	CANBRIDGE_DEV_URL="$$dev_url" go run -tags canbridge ./$(APP_DIR)

build: frontend-deps
	cd $(FRONTEND_DIR) && npm run build
ifeq ($(HOST_GOOS),darwin)
	@set -eu; \
	rm -rf "$(APP_DIR)/build/bin/Validex.app"; \
	mkdir -p "$(APP_DIR)/build/bin/Validex.app/Contents/MacOS"; \
	mkdir -p "$(APP_DIR)/build/bin/Validex.app/Contents/Resources"; \
	go build -tags canbridge -o "$(APP_DIR)/build/bin/Validex.app/Contents/MacOS/validex" ./$(APP_DIR); \
	cp "$(APP_DIR)/build/darwin/Info.plist" "$(APP_DIR)/build/bin/Validex.app/Contents/Info.plist"; \
	mkdir -p "$(APP_DIR)/build/bin/Validex.iconset"; \
	sips -z 16 16 "$(APP_DIR)/build/appicon.png" --out "$(APP_DIR)/build/bin/Validex.iconset/icon_16x16.png" >/dev/null; \
	sips -z 32 32 "$(APP_DIR)/build/appicon.png" --out "$(APP_DIR)/build/bin/Validex.iconset/icon_16x16@2x.png" >/dev/null; \
	sips -z 32 32 "$(APP_DIR)/build/appicon.png" --out "$(APP_DIR)/build/bin/Validex.iconset/icon_32x32.png" >/dev/null; \
	sips -z 64 64 "$(APP_DIR)/build/appicon.png" --out "$(APP_DIR)/build/bin/Validex.iconset/icon_32x32@2x.png" >/dev/null; \
	sips -z 128 128 "$(APP_DIR)/build/appicon.png" --out "$(APP_DIR)/build/bin/Validex.iconset/icon_128x128.png" >/dev/null; \
	sips -z 256 256 "$(APP_DIR)/build/appicon.png" --out "$(APP_DIR)/build/bin/Validex.iconset/icon_128x128@2x.png" >/dev/null; \
	sips -z 256 256 "$(APP_DIR)/build/appicon.png" --out "$(APP_DIR)/build/bin/Validex.iconset/icon_256x256.png" >/dev/null; \
	sips -z 512 512 "$(APP_DIR)/build/appicon.png" --out "$(APP_DIR)/build/bin/Validex.iconset/icon_256x256@2x.png" >/dev/null; \
	sips -z 512 512 "$(APP_DIR)/build/appicon.png" --out "$(APP_DIR)/build/bin/Validex.iconset/icon_512x512.png" >/dev/null; \
	cp "$(APP_DIR)/build/appicon.png" "$(APP_DIR)/build/bin/Validex.iconset/icon_512x512@2x.png"; \
	iconutil -c icns "$(APP_DIR)/build/bin/Validex.iconset" -o "$(APP_DIR)/build/bin/Validex.app/Contents/Resources/iconfile.icns"; \
	rm -rf "$(APP_DIR)/build/bin/Validex.iconset"
else ifeq ($(HOST_GOOS),windows)
	mkdir -p $(BUILD_DIR)
	go build -tags canbridge -ldflags="-H windowsgui" -o $(BUILD_DIR)/validex.exe ./$(APP_DIR)
else
	mkdir -p $(BUILD_DIR)
	go build -tags canbridge -o $(BUILD_DIR)/validex ./$(APP_DIR)
endif

test: frontend-deps
	cd $(FRONTEND_DIR) && npm run typecheck && npm test
	go test ./...
	go test -tags canbridge ./internal/canbridge ./cmd/validex
