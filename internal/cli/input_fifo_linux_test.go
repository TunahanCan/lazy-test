package cli

import (
	"bytes"
	"context"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestRunCancellationInterruptsNamedPipeOpen(t *testing.T) {
	fifoPath := t.TempDir() + "/collection.fifo"
	if err := syscall.Mkfifo(fifoPath, 0o600); err != nil {
		t.Fatalf("create named pipe: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	result := make(chan invocation, 1)
	go func() {
		var stdout bytes.Buffer
		var stderr bytes.Buffer
		code := execute(
			ctx,
			[]string{"run", "--file", fifoPath},
			strings.NewReader(""),
			&stdout,
			&stderr,
		)
		result <- invocation{
			code:   code,
			stdout: stdout.String(),
			stderr: stderr.String(),
		}
	}()

	select {
	case early := <-result:
		t.Fatalf("command returned before cancellation: %#v", early)
	case <-time.After(50 * time.Millisecond):
	}

	cancel()
	select {
	case got := <-result:
		if got.code != exitFailure {
			t.Fatalf(
				"code = %d, want %d\nstdout:\n%s\nstderr:\n%s",
				got.code,
				exitFailure,
				got.stdout,
				got.stderr,
			)
		}
		if !strings.Contains(got.stderr, context.Canceled.Error()) {
			t.Fatalf("stderr = %q, want context cancellation", got.stderr)
		}
		if got.stdout != "" {
			t.Fatalf("stdout = %q, want no output", got.stdout)
		}
	case <-time.After(time.Second):
		t.Fatal("command did not stop after cancellation during FIFO open")
	}
}
