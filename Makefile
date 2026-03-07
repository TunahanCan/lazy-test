.PHONY: build build-desktop test lint run run-desktop lt clean package-desktop package-windows package-macos package-linux

build:
	go build -o bin/lazytest ./cmd/lazytest

build-desktop:
	go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop

# Cross-platform desktop builds
build-desktop-windows:
	./scripts/build-desktop.sh windows

build-desktop-macos:
	./scripts/build-desktop.sh macos

build-desktop-linux:
	./scripts/build-desktop.sh linux

# Package desktop app with Fyne
package-desktop:
	./scripts/package-desktop.sh

package-windows:
	./scripts/package-desktop.sh windows

package-macos:
	./scripts/package-desktop.sh macos

package-linux:
	./scripts/package-desktop.sh linux

test:
	go test ./...

lint:
	go vet ./...
	golangci-lint run ./... 2>/dev/null || true

run: build
	./bin/lazytest run smoke -f openapi.sample.yaml -e dev --base http://localhost:8080

run-desktop: build-desktop
	./bin/lazytest-desktop

lt: build
	./bin/lazytest lt -f examples/taurus/checkouts.yaml

clean:
	rm -rf bin/
