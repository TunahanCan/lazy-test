.PHONY: build build-desktop test lint run run-desktop lt clean

build:
	go build -o bin/lazytest ./cmd/lazytest

build-desktop:
	go build -tags desktop -o bin/lazytest-desktop ./cmd/lazytest-desktop

test:
	go test ./...

lint:
	go vet ./...
	golangci-lint run ./... 2>/dev/null || true

run: build
	./bin/lazytest -f openapi.sample.yaml -e dev --base http://localhost:8080

run-desktop: build-desktop
	./bin/lazytest-desktop

lt: build
	./bin/lazytest lt -f examples/taurus/checkouts.yaml

clean:
	rm -rf bin/
