APP_DIR := cmd/validex
CLI_DIR := cmd/validex-cli
FRONTEND_DIR := $(APP_DIR)/frontend
BUILD_DIR := $(APP_DIR)/build/bin
DEV_HOST := 127.0.0.1
DEV_PREFERRED_PORT := 34116
HOST_GOOS := $(shell go env GOOS)
HOST_GOARCH := $(shell go env GOARCH)
APP_ID := com.validex.Validex
WINDOWS_ICON_RC := $(APP_DIR)/build/windows/appicon.rc
WINDOWS_RESOURCE := $(APP_DIR)/app_windows_$(HOST_GOARCH).syso
THIRD_PARTY_NOTICES := THIRD_PARTY_NOTICES.md
LINUX_INSTALL_PREFIX ?= $(HOME)/.local
WINDRES ?= windres

.PHONY: dev build build-cli install-linux test test-e2e test-production

dev:
	@set -eu; \
	dev_port="$$(node "$(FRONTEND_DIR)/scripts/find-port.mjs" "$(DEV_PREFERRED_PORT)")"; \
	dev_url="http://$(DEV_HOST):$$dev_port"; \
	( cd $(FRONTEND_DIR) && exec node scripts/dev.mjs --host "$(DEV_HOST)" --port "$$dev_port" ) & \
	frontend_pid=$$!; \
	windows_resource=""; \
	cleanup() { \
		if [ -n "$$frontend_pid" ]; then \
			cleanup_pid="$$frontend_pid"; \
			frontend_pid=""; \
			kill "$$cleanup_pid" 2>/dev/null || true; \
			wait "$$cleanup_pid" 2>/dev/null || true; \
		fi; \
		if [ -n "$$windows_resource" ]; then \
			rm -f "$$windows_resource"; \
			windows_resource=""; \
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
	if [ "$(HOST_GOOS)" = "linux" ]; then \
		snap_runtime="$${SNAP:-}$${SNAP_LIBRARY_PATH:-}$${GTK_PATH:-}$${GTK_EXE_PREFIX:-}$${GTK_IM_MODULE_FILE:-}$${GIO_MODULE_DIR:-}$${GI_TYPELIB_PATH:-}$${GDK_PIXBUF_MODULEDIR:-}$${GDK_PIXBUF_MODULE_FILE:-}$${LD_LIBRARY_PATH:-}$${LD_PRELOAD:-}"; \
		case "$$snap_runtime" in \
			*"/snap/"*|*"/var/lib/snapd/"*) \
				unset GTK_PATH GTK_EXE_PREFIX GTK_IM_MODULE_FILE GTK_MODULES; \
				unset GIO_MODULE_DIR GI_TYPELIB_PATH; \
				unset GDK_PIXBUF_MODULEDIR GDK_PIXBUF_MODULE_FILE; \
				unset LD_LIBRARY_PATH LD_PRELOAD SNAP_LIBRARY_PATH; \
				;; \
		esac; \
	fi; \
	if [ "$(HOST_GOOS)" = "windows" ]; then \
		if ! command -v "$(WINDRES)" >/dev/null 2>&1; then \
			echo "windres is required to embed the Validex icon in the Windows development window." >&2; \
			exit 1; \
		fi; \
		windows_resource="$(WINDOWS_RESOURCE)"; \
		"$(WINDRES)" -I "$(APP_DIR)/build/windows" -i "$(WINDOWS_ICON_RC)" -o "$$windows_resource" -O coff; \
	fi; \
	CANBRIDGE_DEV_URL="$$dev_url" go run -tags canbridge ./$(APP_DIR)

build: build-cli
	cd $(FRONTEND_DIR) && node scripts/build.mjs
ifeq ($(HOST_GOOS),darwin)
	@set -eu; \
	rm -rf "$(APP_DIR)/build/bin/Validex.app"; \
	mkdir -p "$(APP_DIR)/build/bin/Validex.app/Contents/MacOS"; \
	mkdir -p "$(APP_DIR)/build/bin/Validex.app/Contents/Resources"; \
	go build -tags canbridge -o "$(APP_DIR)/build/bin/Validex.app/Contents/MacOS/validex" ./$(APP_DIR); \
	cp "$(APP_DIR)/build/darwin/Info.plist" "$(APP_DIR)/build/bin/Validex.app/Contents/Info.plist"; \
	cp "$(THIRD_PARTY_NOTICES)" "$(APP_DIR)/build/bin/Validex.app/Contents/Resources/THIRD_PARTY_NOTICES.md"; \
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
	rm -rf "$(APP_DIR)/build/bin/Validex.iconset"; \
	codesign --force --sign - --identifier "$(APP_ID)" "$(APP_DIR)/build/bin/Validex.app"; \
	codesign --verify --deep --strict "$(APP_DIR)/build/bin/Validex.app"
else ifeq ($(HOST_GOOS),windows)
	@set -eu; \
	mkdir -p "$(BUILD_DIR)"; \
	if ! command -v "$(WINDRES)" >/dev/null 2>&1; then \
		echo "windres is required to embed the Validex icon in the Windows executable." >&2; \
		exit 1; \
	fi; \
	trap 'rm -f "$(WINDOWS_RESOURCE)"' EXIT; \
	"$(WINDRES)" -I "$(APP_DIR)/build/windows" -i "$(WINDOWS_ICON_RC)" -o "$(WINDOWS_RESOURCE)" -O coff; \
	go build -tags canbridge -ldflags="-H windowsgui" -o "$(BUILD_DIR)/validex.exe" ./$(APP_DIR); \
	cp "$(THIRD_PARTY_NOTICES)" "$(BUILD_DIR)/THIRD_PARTY_NOTICES.md"
else
	mkdir -p $(BUILD_DIR)
	go build -tags canbridge -o $(BUILD_DIR)/validex ./$(APP_DIR)
	cp "$(THIRD_PARTY_NOTICES)" "$(BUILD_DIR)/THIRD_PARTY_NOTICES.md"
endif

build-cli:
	mkdir -p $(BUILD_DIR)
ifeq ($(HOST_GOOS),windows)
	go build -o $(BUILD_DIR)/validex-cli.exe ./$(CLI_DIR)
else
	go build -o $(BUILD_DIR)/validex-cli ./$(CLI_DIR)
endif

install-linux: build
ifeq ($(HOST_GOOS),linux)
	@set -eu; \
	install_prefix="$(abspath $(LINUX_INSTALL_PREFIX))"; \
	executable="$$install_prefix/bin/validex"; \
	desktop_file="$(BUILD_DIR)/$(APP_ID).desktop"; \
	install -Dm755 "$(BUILD_DIR)/validex" "$$executable"; \
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

test:
	cd $(FRONTEND_DIR) && node scripts/typecheck.mjs && node scripts/build.mjs && node --test
	go test ./...
	go test -tags canbridge ./internal/nativewebview ./internal/canbridge ./cmd/validex

test-e2e:
	cd $(FRONTEND_DIR) && node scripts/build.mjs
	cd tests/e2e && go test -count=1 -timeout=15m -v ./...

test-production: test
	$(MAKE) test-e2e
	go test -race ./...
	go test -race -tags canbridge ./internal/canbridge
	go vet ./...
	go vet -tags canbridge ./internal/nativewebview ./internal/canbridge ./cmd/validex
