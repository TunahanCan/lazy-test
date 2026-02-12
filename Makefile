.PHONY: build test lint run lt clean

build:
	go build -o bin/lazytest ./cmd/lazytest

test:
	go test ./...

lint:
	go vet ./...
	golangci-lint run ./... 2>/dev/null || true

run: build
	./bin/lazytest -f openapi.sample.yaml -e dev --base http://localhost:8080

lt: build
	./bin/lazytest lt -f examples/taurus/checkouts.yaml

clean:
	rm -rf bin/
