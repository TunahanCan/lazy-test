//go:build desktop

package main

import (
	"embed"
	"path/filepath"

	"lazytest/internal/desktop"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:web
var assets embed.FS

func main() {
	app := desktop.NewApp(filepath.Join(".", "workspace.json"))
	err := wails.Run(&options.App{
		Title:       "lazytest-desktop",
		Width:       1400,
		Height:      900,
		OnStartup:   app.Startup,
		AssetServer: &assetserver.Options{Assets: assets},
		Bind:        []interface{}{app},
	})
	if err != nil {
		panic(err)
	}
}
