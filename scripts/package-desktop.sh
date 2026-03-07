#!/bin/bash

set -e

echo "📦 Packaging LazyTest Desktop with Fyne..."

# Install fyne CLI if not present
if ! command -v fyne &> /dev/null; then
    echo "Installing fyne CLI..."
    go install fyne.io/fyne/v2/cmd/fyne@latest
fi

APP_NAME="LazyTest"
APP_ID="com.lazytest.desktop"
ICON="resources/icon.png"

# Create resources directory if doesn't exist
mkdir -p resources

# Create a placeholder icon if it doesn't exist
if [ ! -f "$ICON" ]; then
    echo "⚠️  No icon found, using default"
    ICON=""
fi

case "$1" in
  windows)
    echo "Packaging for Windows..."
    if [ -n "$ICON" ]; then
        fyne package -os windows -name "$APP_NAME" -appID "$APP_ID" -icon "$ICON" -src cmd/lazytest-desktop
    else
        fyne package -os windows -name "$APP_NAME" -appID "$APP_ID" -src cmd/lazytest-desktop
    fi
    echo "✅ Created: ${APP_NAME}.exe"
    ;;
  macos)
    echo "Packaging for macOS..."
    if [ -n "$ICON" ]; then
        fyne package -os darwin -name "$APP_NAME" -appID "$APP_ID" -icon "$ICON" -src cmd/lazytest-desktop
    else
        fyne package -os darwin -name "$APP_NAME" -appID "$APP_ID" -src cmd/lazytest-desktop
    fi
    echo "✅ Created: ${APP_NAME}.app"
    ;;
  linux)
    echo "Packaging for Linux..."
    if [ -n "$ICON" ]; then
        fyne package -os linux -name "$APP_NAME" -appID "$APP_ID" -icon "$ICON" -src cmd/lazytest-desktop
    else
        fyne package -os linux -name "$APP_NAME" -appID "$APP_ID" -src cmd/lazytest-desktop
    fi
    echo "✅ Created: ${APP_NAME}.tar.xz"
    ;;
  *)
    echo "Packaging for current OS..."
    if [ -n "$ICON" ]; then
        fyne package -name "$APP_NAME" -appID "$APP_ID" -icon "$ICON" -src cmd/lazytest-desktop
    else
        fyne package -name "$APP_NAME" -appID "$APP_ID" -src cmd/lazytest-desktop
    fi
    echo "✅ Created package for current OS"
    ;;
esac

echo "🎉 Done!"

