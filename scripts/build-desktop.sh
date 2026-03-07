#!/bin/bash

set -e

echo "🚀 Building LazyTest Desktop..."

# Build tags
BUILD_TAGS="desktop"

# Output directory
mkdir -p bin

# Output binary
OUTPUT="bin/lazytest-desktop"

# Platform-specific builds
case "$1" in
  windows)
    echo "Building for Windows..."
    GOOS=windows GOARCH=amd64 go build -tags $BUILD_TAGS -o ${OUTPUT}.exe cmd/lazytest-desktop/main.go
    echo "✅ Built: ${OUTPUT}.exe"
    ;;
  macos)
    echo "Building universal binary for macOS..."
    GOOS=darwin GOARCH=amd64 go build -tags $BUILD_TAGS -o ${OUTPUT}-amd64 cmd/lazytest-desktop/main.go
    GOOS=darwin GOARCH=arm64 go build -tags $BUILD_TAGS -o ${OUTPUT}-arm64 cmd/lazytest-desktop/main.go
    lipo -create ${OUTPUT}-amd64 ${OUTPUT}-arm64 -output ${OUTPUT}
    rm ${OUTPUT}-amd64 ${OUTPUT}-arm64
    echo "✅ Built universal binary: ${OUTPUT}"
    ;;
  linux)
    echo "Building for Linux..."
    GOOS=linux GOARCH=amd64 go build -tags $BUILD_TAGS -o ${OUTPUT} cmd/lazytest-desktop/main.go
    echo "✅ Built: ${OUTPUT}"
    ;;
  *)
    echo "Building for current OS..."
    go build -tags $BUILD_TAGS -o ${OUTPUT} cmd/lazytest-desktop/main.go
    echo "✅ Built: ${OUTPUT}"
    ;;
esac

echo "🎉 Done!"

