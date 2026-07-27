WAILS_VERSION := v2.12.0
GO_BIN := $(shell go env GOBIN)
ifeq ($(GO_BIN),)
GO_BIN := $(shell go env GOPATH)/bin
endif
WAILS_BIN := $(GO_BIN)/wails
APP_DIR := cmd/validex
FRONTEND_DIR := $(APP_DIR)/frontend

.PHONY: tools dev build test

tools:
	go install github.com/wailsapp/wails/v2/cmd/wails@$(WAILS_VERSION)

dev: tools
	cd $(APP_DIR) && $(WAILS_BIN) dev -m -nosyncgomod

build: tools
	cd $(APP_DIR) && $(WAILS_BIN) build -clean -m -nosyncgomod
	@set -eu; \
	if [ "$$(uname -s)" = "Darwin" ]; then \
		app="$(APP_DIR)/build/bin/Validex.app"; \
		binary="$$app/Contents/MacOS/validex"; \
		identity="$${MACOS_SIGN_IDENTITY:-}"; \
		if [ "$$identity" = "-" ]; then \
			echo "error: MACOS_SIGN_IDENTITY gerçek bir Apple signing identity olmalı"; \
			exit 1; \
		fi; \
		if [ -z "$$identity" ]; then \
			identity_output="$$(security find-identity -v -p codesigning)"; \
			identities="$$(echo "$$identity_output" | awk -F '"' '/"Apple Development:/ { print $$2 }')"; \
			count="$$(echo "$$identities" | sed '/^$$/d' | wc -l | tr -d ' ')"; \
			if [ "$$count" = "1" ]; then \
				identity="$$identities"; \
			elif [ "$$count" = "0" ]; then \
				if [ "$${MACOS_SIGN_REQUIRED:-0}" = "1" ]; then \
					echo "error: macOS signing identity bulunamadı"; \
					exit 1; \
				fi; \
				echo "warning: macOS signing identity bulunamadı; Wails ad-hoc imzası korunuyor"; \
				exit 0; \
			else \
				echo "error: birden fazla macOS signing identity bulundu; MACOS_SIGN_IDENTITY seçin"; \
				exit 1; \
			fi; \
		fi; \
		test -x "$$binary"; \
		timestamp_arg="--timestamp=none"; \
		case "$$identity" in \
			Developer\ ID\ Application:*) timestamp_arg="--timestamp" ;; \
		esac; \
		codesign --force --options runtime "$$timestamp_arg" --sign "$$identity" "$$binary"; \
		codesign --force --options runtime "$$timestamp_arg" --sign "$$identity" "$$app"; \
		codesign --verify --deep --strict --verbose=2 "$$app"; \
		validate_signature() { \
			signature="$$(codesign -dvvv "$$1" 2>&1)"; \
			echo "$$signature" | grep -q '^Authority='; \
			team="$$(echo "$$signature" | sed -n 's/^TeamIdentifier=//p' | head -n 1)"; \
			test -n "$$team"; \
			test "$$team" != "not set"; \
			if echo "$$signature" | grep -q '^Signature=adhoc'; then \
				echo "error: $$1 ad-hoc imzalı kaldı" >&2; \
				return 1; \
			fi; \
			echo "$$team"; \
		}; \
		app_team="$$(validate_signature "$$app")"; \
		binary_team="$$(validate_signature "$$binary")"; \
		test "$$app_team" = "$$binary_team"; \
		echo "macOS app signed: $$identity"; \
	fi

test:
	cd $(FRONTEND_DIR) && npm ci && npm run typecheck && npm test
	go test ./...
	go test -tags wails ./internal/wailsapp ./cmd/validex
