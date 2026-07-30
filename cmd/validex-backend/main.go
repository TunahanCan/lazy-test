package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"validex/internal/canbridge"
)

func main() {
	log.SetOutput(os.Stderr)
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)

	ctx, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer stop()

	if err := serve(
		ctx,
		os.Stdin,
		os.Stdout,
		canbridge.NewBridge(),
	); err != nil {
		log.Printf("[validex-backend:error] %v", err)
		os.Exit(1)
	}
}
