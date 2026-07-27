package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"validex/internal/cli"
)

func main() {
	ctx, stop := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	go func() {
		<-ctx.Done()
		stop()
	}()
	exitCode := cli.Execute(ctx, os.Args[1:], os.Stdout, os.Stderr)
	stop()
	os.Exit(exitCode)
}
