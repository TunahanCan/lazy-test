//go:build wails

package main

import (
	"embed"
	"log"

	"lazytest/internal/wailsapp"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	bridge := wailsapp.NewBridge()

	err := wails.Run(&options.App{
		Title:             "LazyTest",
		Width:             1440,
		Height:            900,
		MinWidth:          1080,
		MinHeight:         700,
		DisableResize:     false,
		Frameless:         false,
		StartHidden:       false,
		HideWindowOnClose: false,
		BackgroundColour:  &options.RGBA{R: 16, G: 20, B: 27, A: 255},
		AssetServer:       &assetserver.Options{Assets: assets},
		OnStartup:         wailsapp.Startup(bridge),
		OnShutdown:        wailsapp.Shutdown(bridge),
		Bind:              []interface{}{bridge},
	})
	if err != nil {
		log.Fatal(err)
	}
}
