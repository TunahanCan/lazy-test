// Package cli implements the testable command boundary for validex-cli.
package cli

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
)

const (
	exitSuccess = 0
	exitFailure = 1
	exitUsage   = 2
)

// Execute runs one CLI invocation. args excludes the executable name.
func Execute(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) int {
	return execute(ctx, args, os.Stdin, stdout, stderr)
}

func execute(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
) int {
	if ctx == nil {
		ctx = context.Background()
	}
	if stdin == nil {
		stdin = strings.NewReader("")
	}
	if stdout == nil {
		stdout = io.Discard
	}
	if stderr == nil {
		stderr = io.Discard
	}
	if len(args) == 0 {
		writeIgnoringError(stderr, cliCommands.usage())
		return exitUsage
	}

	if args[0] == "help" || args[0] == "-h" || args[0] == "--help" {
		writeIgnoringError(stdout, cliCommands.usage())
		return exitSuccess
	}
	command, ok := cliCommands.lookup(args[0])
	if !ok {
		writeIgnoringError(stderr, fmt.Sprintf("validex-cli: unknown command %q\n\n", args[0]))
		writeIgnoringError(stderr, cliCommands.usage())
		return exitUsage
	}
	return command.execute(ctx, args[1:], stdin, stdout, stderr)
}

func newFlagSet(name string) *flag.FlagSet {
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.Usage = func() {}
	return flags
}

func parseFlags(
	flags *flag.FlagSet,
	args []string,
	usage string,
	stdout io.Writer,
	stderr io.Writer,
) (bool, int) {
	err := flags.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		writeIgnoringError(stdout, usage)
		return false, exitSuccess
	}
	if err != nil {
		writeIgnoringError(stderr, fmt.Sprintf("validex-cli %s: %v\n\n", flags.Name(), err))
		writeIgnoringError(stderr, usage)
		return false, exitUsage
	}
	if flags.NArg() != 0 {
		writeIgnoringError(
			stderr,
			fmt.Sprintf(
				"validex-cli %s: unexpected arguments: %s\n\n",
				flags.Name(),
				strings.Join(flags.Args(), " "),
			),
		)
		writeIgnoringError(stderr, usage)
		return false, exitUsage
	}
	return true, exitSuccess
}

func openInput(
	ctx context.Context,
	path string,
	stdin io.Reader,
) (io.ReadCloser, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if path == "-" {
		if closer, ok := stdin.(io.ReadCloser); ok {
			return closer, nil
		}
		return io.NopCloser(stdin), nil
	}

	type openResult struct {
		file *os.File
		err  error
	}
	result := make(chan openResult)
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		file, err := os.Open(path)
		select {
		case result <- openResult{file: file, err: err}:
		case <-ctx.Done():
			if file != nil {
				_ = file.Close()
			}
		}
	}()

	select {
	case completed := <-result:
		if completed.err != nil {
			return nil, completed.err
		}
		return completed.file, nil
	case <-ctx.Done():
		if unblocker := unblockNamedPipeOpen(path); unblocker != nil {
			go func() {
				<-finished
				_ = unblocker.Close()
			}()
		}
		return nil, ctx.Err()
	}
}

func readAllContext(
	ctx context.Context,
	reader io.Reader,
	maxBytes int64,
) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	type readResult struct {
		data []byte
		err  error
	}
	result := make(chan readResult, 1)
	go func() {
		data, err := io.ReadAll(io.LimitReader(reader, maxBytes+1))
		result <- readResult{data: data, err: err}
	}()

	select {
	case completed := <-result:
		return completed.data, completed.err
	case <-ctx.Done():
		if closer, ok := reader.(io.Closer); ok {
			_ = closer.Close()
		}
		return nil, ctx.Err()
	}
}

func writeJSON(writer io.Writer, value any) error {
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func writeOutputError(stderr io.Writer, command string, err error) int {
	writeIgnoringError(
		stderr,
		fmt.Sprintf("validex-cli %s: write output: %v\n", command, err),
	)
	return exitFailure
}

func writeCommandError(stderr io.Writer, command string, err error) {
	writeIgnoringError(stderr, fmt.Sprintf("validex-cli %s: %v\n", command, err))
}

func writeIgnoringError(writer io.Writer, value string) {
	_, _ = io.WriteString(writer, value)
}
