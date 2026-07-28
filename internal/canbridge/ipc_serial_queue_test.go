//go:build canbridge

package canbridge

import (
	"reflect"
	"sync"
	"testing"
	"time"
)

func TestIPCSerialInvocationQueueDrainsInFIFOOrder(t *testing.T) {
	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	var orderMu sync.Mutex
	order := []string{}

	queue := newIPCSerialInvocationQueue(
		8,
		1<<10,
		func(invocation ipcInvocation) {
			if invocation.callbackID == "first" {
				close(firstStarted)
				<-releaseFirst
			}
			orderMu.Lock()
			order = append(order, invocation.callbackID)
			orderMu.Unlock()
		},
	)
	if status := queue.enqueue(ipcTestInvocation("first", 8)); status != ipcSerialQueueAccepted {
		t.Fatalf("first enqueue status = %d", status)
	}
	select {
	case <-firstStarted:
	case <-time.After(time.Second):
		t.Fatal("first invocation did not start")
	}
	if status := queue.enqueue(ipcTestInvocation("second", 8)); status != ipcSerialQueueAccepted {
		t.Fatalf("second enqueue status = %d", status)
	}

	cancelled := false
	drained := make(chan struct{})
	go func() {
		queue.closeAndDrain(time.Second, func() {
			cancelled = true
		})
		close(drained)
	}()
	select {
	case <-drained:
		t.Fatal("queue closed before its in-flight invocation completed")
	case <-time.After(25 * time.Millisecond):
	}
	close(releaseFirst)
	select {
	case <-drained:
	case <-time.After(time.Second):
		t.Fatal("queue did not drain")
	}
	orderMu.Lock()
	gotOrder := append([]string(nil), order...)
	orderMu.Unlock()
	if !reflect.DeepEqual(gotOrder, []string{"first", "second"}) {
		t.Fatalf("execution order = %#v", gotOrder)
	}
	if cancelled {
		t.Fatal("queue canceled a drain that completed within its grace period")
	}
	if status := queue.enqueue(ipcTestInvocation("late", 1)); status != ipcSerialQueueClosed {
		t.Fatalf("enqueue after close status = %d", status)
	}
}

func TestIPCSerialInvocationQueueBoundsOnlyQueuedWork(t *testing.T) {
	firstStarted := make(chan struct{})
	releaseFirst := make(chan struct{})
	queue := newIPCSerialInvocationQueue(
		2,
		10,
		func(invocation ipcInvocation) {
			if invocation.callbackID == "in-flight" {
				close(firstStarted)
				<-releaseFirst
			}
		},
	)

	if status := queue.enqueue(ipcTestInvocation("in-flight", 6)); status != ipcSerialQueueAccepted {
		t.Fatalf("in-flight enqueue status = %d", status)
	}
	select {
	case <-firstStarted:
	case <-time.After(time.Second):
		t.Fatal("in-flight invocation did not start")
	}
	if status := queue.enqueue(ipcTestInvocation("queued-7", 7)); status != ipcSerialQueueAccepted {
		t.Fatalf("first queued status = %d", status)
	}
	if status := queue.enqueue(ipcTestInvocation("byte-overflow", 4)); status != ipcSerialQueueFull {
		t.Fatalf("byte overflow status = %d", status)
	}
	if status := queue.enqueue(ipcTestInvocation("queued-3", 3)); status != ipcSerialQueueAccepted {
		t.Fatalf("second queued status = %d", status)
	}
	if status := queue.enqueue(ipcTestInvocation("entry-overflow", 0)); status != ipcSerialQueueFull {
		t.Fatalf("entry overflow status = %d", status)
	}

	close(releaseFirst)
	queue.closeAndDrain(time.Second, nil)
}

func TestIPCSerialInvocationQueueCancelsAfterDrainTimeout(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	cancelled := make(chan struct{})
	queue := newIPCSerialInvocationQueue(
		1,
		32,
		func(ipcInvocation) {
			close(started)
			<-release
		},
	)
	if status := queue.enqueue(ipcTestInvocation("blocked", 1)); status != ipcSerialQueueAccepted {
		t.Fatalf("enqueue status = %d", status)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("blocked invocation did not start")
	}

	startedAt := time.Now()
	drained := queue.closeAndDrain(25*time.Millisecond, func() {
		close(cancelled)
	})
	if drained {
		t.Fatal("queue reported a blocked invocation as drained")
	}
	if elapsed := time.Since(startedAt); elapsed > time.Second {
		t.Fatalf("timed drain took %s", elapsed)
	}
	select {
	case <-cancelled:
	default:
		t.Fatal("drain timeout did not invoke cancellation")
	}
	close(release)
	select {
	case <-queue.done:
	case <-time.After(time.Second):
		t.Fatal("queue worker did not finish after the blocked call was released")
	}
}

func TestIPCSerialInvocationQueueContinuesAfterInvocationPanic(t *testing.T) {
	secondExecuted := make(chan struct{})
	queue := newIPCSerialInvocationQueue(
		2,
		32,
		func(invocation ipcInvocation) {
			if invocation.callbackID == "panic" {
				panic("test panic")
			}
			close(secondExecuted)
		},
	)
	if status := queue.enqueue(
		ipcTestInvocation("panic", 1),
	); status != ipcSerialQueueAccepted {
		t.Fatalf("panic enqueue status = %d", status)
	}
	if status := queue.enqueue(
		ipcTestInvocation("second", 1),
	); status != ipcSerialQueueAccepted {
		t.Fatalf("second enqueue status = %d", status)
	}
	if drained := queue.closeAndDrain(time.Second, nil); !drained {
		t.Fatal("queue did not drain after recovering the invocation panic")
	}
	select {
	case <-secondExecuted:
	default:
		t.Fatal("queue abandoned work accepted after the panicking invocation")
	}
}

func ipcTestInvocation(callbackID string, encodedBytes int) ipcInvocation {
	return ipcInvocation{
		callbackID:       callbackID,
		method:           bridgeMethodSaveCollectionLibrary,
		encodedArguments: string(make([]byte, encodedBytes)),
	}
}
