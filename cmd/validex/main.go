//go:build canbridge

package main

import (
	"embed"
	"flag"
	"log"
	"os"

	"validex/internal/canbridge"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	devURL := flag.String("dev-url", os.Getenv("CANBRIDGE_DEV_URL"), "Vite development server URL")
	debug := flag.Bool("debug", false, "enable native WebView developer tools")
	flag.Parse()

	bridge := canbridge.NewBridge()
	err := canbridge.Run(canbridge.AppOptions{
		Title:     "Validex",
		Width:     1440,
		Height:    900,
		MinWidth:  1080,
		MinHeight: 700,
		Debug:     *debug || *devURL != "",
		DevURL:    *devURL,
		Assets:    assets,
		AssetRoot: "frontend/dist",
		Bridge:    bridge,
	})
	if err != nil {
		log.Fatal(err)
	}
}
