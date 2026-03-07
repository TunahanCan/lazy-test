//go:build desktop

package main

import (
	"log"

	"lazytest/internal/desktop"
)

func main() {
	if err := desktop.Run(); err != nil {
		log.Fatal(err)
	}
}
