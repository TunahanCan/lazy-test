APP_DIR := cmd/validex
BACKEND_DIR := cmd/validex-backend
CLI_DIR := cmd/validex-cli
FRONTEND_DIR := $(APP_DIR)/frontend
BUILD_DIR := $(APP_DIR)/build/bin
NPM_STAMP := $(APP_DIR)/node_modules/.validex-deps-stamp
DEV_HOST := 127.0.0.1
DEV_PREFERRED_PORT := 34116
HOST_GOOS := $(shell go env GOOS)
APP_ID := com.validex.Validex
THIRD_PARTY_NOTICES := THIRD_PARTY_NOTICES.md
LINUX_INSTALL_PREFIX ?= $(HOME)/.local

ifeq ($(HOST_GOOS),windows)
BACKEND_BINARY := $(BUILD_DIR)/validex-backend.exe
CLI_BINARY := $(BUILD_DIR)/validex-cli.exe
else
BACKEND_BINARY := $(BUILD_DIR)/validex-backend
CLI_BINARY := $(BUILD_DIR)/validex-cli
endif

.PHONY: deps dev build build-backend build-cli install-linux test test-e2e test-production

deps: $(NPM_STAMP)

$(NPM_STAMP): $(APP_DIR)/package.json $(APP_DIR)/package-lock.json
	cd $(APP_DIR) && npm ci
	touch $(NPM_STAMP)

build-backend:
	mkdir -p $(BUILD_DIR)
	go build -o $(BACKEND_BINARY) ./$(BACKEND_DIR)

build-cli:
	mkdir -p $(BUILD_DIR)
	go build -o $(CLI_BINARY) ./$(CLI_DIR)

dev: deps build-backend
	cd $(APP_DIR) && npm run electron:build
	@set -eu; \
	dev_port="$$(node "$(FRONTEND_DIR)/scripts/find-port.mjs" "$(DEV_PREFERRED_PORT)")"; \
	dev_url="http://$(DEV_HOST):$$dev_port"; \
	( cd $(FRONTEND_DIR) && exec node scripts/dev.mjs --host "$(DEV_HOST)" --port "$$dev_port" ) & \
	frontend_pid=$$!; \
	cleanup() { \
		if [ -n "$$frontend_pid" ]; then \
			cleanup_pid="$$frontend_pid"; \
			frontend_pid=""; \
			kill "$$cleanup_pid" 2>/dev/null || true; \
			wait "$$cleanup_pid" 2>/dev/null || true; \
		fi; \
	}; \
	trap cleanup EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	attempt=0; \
	until curl --fail --silent --show-error "$$dev_url" >/dev/null 2>&1; do \
		attempt=$$((attempt + 1)); \
		if ! kill -0 "$$frontend_pid" 2>/dev/null; then \
			wait "$$frontend_pid"; \
			exit 1; \
		fi; \
		if [ "$$attempt" -ge 100 ]; then \
			echo "TypeScript development server did not start at $$dev_url" >&2; \
			exit 1; \
		fi; \
		sleep 0.1; \
	done; \
	cd $(APP_DIR); \
	unset ELECTRON_RUN_AS_NODE; \
	npm run start -- \
		"--dev-url=$$dev_url" \
		"--backend=$(abspath $(BACKEND_BINARY))"

build: deps build-cli build-backend
	cd $(FRONTEND_DIR) && node scripts/build.mjs
	cd $(APP_DIR) && npm run electron:build
ifeq ($(HOST_GOOS),darwin)
	@set -eu; \
	iconset="$(APP_DIR)/build/Validex.iconset"; \
	icon="$(APP_DIR)/build/Validex.icns"; \
	rm -rf "$$iconset"; \
	mkdir -p "$$iconset"; \
	sips -z 16 16 "$(APP_DIR)/build/appicon.png" --out "$$iconset/icon_16x16.png" >/dev/null; \
	sips -z 32 32 "$(APP_DIR)/build/appicon.png" --out "$$iconset/icon_16x16@2x.png" >/dev/null; \
	sips -z 32 32 "$(APP_DIR)/build/appicon.png" --out "$$iconset/icon_32x32.png" >/dev/null; \
	sips -z 64 64 "$(APP_DIR)/build/appicon.png" --out "$$iconset/icon_32x32@2x.png" >/dev/null; \
	sips -z 128 128 "$(APP_DIR)/build/appicon.png" --out "$$iconset/icon_128x128.png" >/dev/null; \
	sips -z 256 256 "$(APP_DIR)/build/appicon.png" --out "$$iconset/icon_128x128@2x.png" >/dev/null; \
	sips -z 256 256 "$(APP_DIR)/build/appicon.png" --out "$$iconset/icon_256x256.png" >/dev/null; \
	sips -z 512 512 "$(APP_DIR)/build/appicon.png" --out "$$iconset/icon_256x256@2x.png" >/dev/null; \
	sips -z 512 512 "$(APP_DIR)/build/appicon.png" --out "$$iconset/icon_512x512.png" >/dev/null; \
	cp "$(APP_DIR)/build/appicon.png" "$$iconset/icon_512x512@2x.png"; \
	iconutil -c icns "$$iconset" -o "$$icon"; \
	rm -rf "$$iconset"
endif
	node $(APP_DIR)/scripts/package-electron.mjs
ifeq ($(HOST_GOOS),darwin)
	codesign --force --deep --sign - "$(BUILD_DIR)/Validex.app"
	codesign --verify --deep --strict "$(BUILD_DIR)/Validex.app"
endif

install-linux: build
ifeq ($(HOST_GOOS),linux)
	@set -eu; \
	install_prefix="$(abspath $(LINUX_INSTALL_PREFIX))"; \
	if [ "$$install_prefix" = "/" ]; then \
		echo "Refusing to install Validex into filesystem root." >&2; \
		exit 1; \
	fi; \
	install_root="$$install_prefix/lib/validex"; \
	executable="$$install_prefix/bin/validex"; \
	desktop_file="$(BUILD_DIR)/$(APP_ID).desktop"; \
	rm -rf "$$install_root"; \
	mkdir -p "$$install_root" "$$install_prefix/bin"; \
	cp -R "$(BUILD_DIR)/Validex/." "$$install_root/"; \
	ln -sfn "$$install_root/validex" "$$executable"; \
	install -Dm644 "$(THIRD_PARTY_NOTICES)" \
		"$$install_prefix/share/doc/validex/THIRD_PARTY_NOTICES.md"; \
	install -Dm644 "$(APP_DIR)/build/appicon.svg" \
		"$$install_prefix/share/icons/hicolor/scalable/apps/$(APP_ID).svg"; \
	sed "s|@VALIDEX_EXEC@|$$executable|g" \
		"$(APP_DIR)/build/linux/$(APP_ID).desktop.in" > "$$desktop_file"; \
	if command -v desktop-file-validate >/dev/null 2>&1; then \
		desktop-file-validate "$$desktop_file"; \
	fi; \
	install -Dm644 "$$desktop_file" \
		"$$install_prefix/share/applications/$(APP_ID).desktop"; \
	if command -v update-desktop-database >/dev/null 2>&1; then \
		update-desktop-database "$$install_prefix/share/applications" >/dev/null 2>&1 || true; \
	fi; \
	if command -v gtk-update-icon-cache >/dev/null 2>&1; then \
		gtk-update-icon-cache -f -t "$$install_prefix/share/icons/hicolor" >/dev/null 2>&1 || true; \
	fi; \
	echo "Validex installed at $$executable"
else
	@echo "install-linux is available only when GOOS=linux." >&2
	@exit 1
endif

test: deps
	cd $(APP_DIR) && npm run electron:typecheck && npm run electron:test
	cd $(FRONTEND_DIR) && node scripts/typecheck.mjs && node scripts/build.mjs && node --test
	go test ./...

test-e2e: deps
	cd $(FRONTEND_DIR) && node scripts/build.mjs
	cd tests/e2e && go test -count=1 -timeout=15m -v ./...

test-production: test
	$(MAKE) test-e2e
	go test -race ./...
	go vet ./...
