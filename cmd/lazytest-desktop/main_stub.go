//go:build !desktop

package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "desktop UI icin '-tags desktop' ile derleyin. Ornek: make run-desktop")
	os.Exit(1)
}
