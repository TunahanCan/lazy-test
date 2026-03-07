package desktop

import (
	"context"
	"testing"
	"time"
)

func TestRunManagerSubscribePublishClose(t *testing.T) {
	rm := NewRunManager()
	ch, unsub := rm.Subscribe("run-1")
	defer unsub()

	rm.Publish("run-1", "hello")

	select {
	case got := <-ch:
		if got != "hello" {
			t.Fatalf("got %v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting event")
	}

	rm.Close("run-1")
	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("expected closed channel")
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting close")
	}
}

func TestRunManagerSetActiveCancelsPrevious(t *testing.T) {
	rm := NewRunManager()
	ctx1, cancel1 := context.WithCancel(context.Background())
	_ = ctx1
	rm.SetActive("run-1", cancel1)

	_, cancel2 := context.WithCancel(context.Background())
	defer cancel2()
	prevCanceled := rm.SetActive("run-2", cancel2)
	if !prevCanceled {
		t.Fatalf("expected previous active run to be canceled")
	}

	select {
	case <-ctx1.Done():
	case <-time.After(time.Second):
		t.Fatal("previous run not canceled")
	}
}
