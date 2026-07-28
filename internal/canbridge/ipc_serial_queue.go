//go:build canbridge

package canbridge

import (
	"log"
	"sync"
	"time"
)

const (
	maxQueuedCollectionLibraryCalls          = 128
	maxQueuedCollectionLibraryCallBytes      = 64 << 20
	defaultCollectionLibraryQueueDrainPeriod = 3 * time.Second
)

type ipcInvocation struct {
	callbackID       string
	method           string
	encodedArguments string
}

type ipcSerialQueueEnqueueStatus uint8

const (
	ipcSerialQueueAccepted ipcSerialQueueEnqueueStatus = iota
	ipcSerialQueueClosed
	ipcSerialQueueFull
)

// ipcSerialInvocationQueue is a bounded, single-consumer FIFO for IPC methods
// whose call order is part of their persistence contract. Queued limits exclude
// the invocation currently executing.
type ipcSerialInvocationQueue struct {
	mu          sync.Mutex
	wake        *sync.Cond
	closed      bool
	started     bool
	done        chan struct{}
	entries     []ipcInvocation
	queuedBytes int
	maxEntries  int
	maxBytes    int
	execute     func(ipcInvocation)
}

func newIPCSerialInvocationQueue(
	maxEntries int,
	maxBytes int,
	execute func(ipcInvocation),
) *ipcSerialInvocationQueue {
	queue := &ipcSerialInvocationQueue{
		maxEntries: maxEntries,
		maxBytes:   maxBytes,
		execute:    execute,
	}
	queue.wake = sync.NewCond(&queue.mu)
	return queue
}

// collectionLibraryQueueLocked returns the runtime-owned persistence queue.
// runtime.mu must be held so close cannot pass queue creation.
func (runtime *ipcRuntime) collectionLibraryQueueLocked() *ipcSerialInvocationQueue {
	if runtime.collectionLibraryQueue == nil {
		runtime.collectionLibraryQueue = newIPCSerialInvocationQueue(
			maxQueuedCollectionLibraryCalls,
			maxQueuedCollectionLibraryCallBytes,
			runtime.execute,
		)
	}
	return runtime.collectionLibraryQueue
}

func (queue *ipcSerialInvocationQueue) enqueue(
	invocation ipcInvocation,
) ipcSerialQueueEnqueueStatus {
	queue.mu.Lock()
	defer queue.mu.Unlock()

	if queue.closed {
		return ipcSerialQueueClosed
	}
	if len(queue.entries) >= queue.maxEntries ||
		queue.queuedBytes+len(invocation.encodedArguments) > queue.maxBytes {
		return ipcSerialQueueFull
	}

	queue.entries = append(queue.entries, invocation)
	queue.queuedBytes += len(invocation.encodedArguments)
	if !queue.started {
		queue.started = true
		queue.done = make(chan struct{})
		go queue.run()
	}
	queue.wake.Signal()
	return ipcSerialQueueAccepted
}

func (queue *ipcSerialInvocationQueue) run() {
	defer close(queue.done)
	for {
		queue.mu.Lock()
		for len(queue.entries) == 0 && !queue.closed {
			queue.wake.Wait()
		}
		if len(queue.entries) == 0 && queue.closed {
			queue.mu.Unlock()
			return
		}
		invocation := queue.entries[0]
		queue.queuedBytes -= len(invocation.encodedArguments)
		if len(queue.entries) == 1 {
			queue.entries = nil
		} else {
			queue.entries[0] = ipcInvocation{}
			queue.entries = queue.entries[1:]
		}
		queue.mu.Unlock()

		queue.executeOne(invocation)
	}
}

func (queue *ipcSerialInvocationQueue) executeOne(invocation ipcInvocation) {
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf(
				"[canbridge:error] serial IPC method %s panicked",
				invocation.method,
			)
		}
	}()
	queue.execute(invocation)
}

func (queue *ipcSerialInvocationQueue) closeAndDrain(
	drainPeriod time.Duration,
	cancel func(),
) bool {
	queue.mu.Lock()
	queue.closed = true
	queue.wake.Broadcast()
	done := queue.done
	queue.mu.Unlock()
	if done == nil {
		return true
	}

	if drainPeriod <= 0 {
		drainPeriod = defaultCollectionLibraryQueueDrainPeriod
	}
	timer := time.NewTimer(drainPeriod)
	defer timer.Stop()
	select {
	case <-done:
		return true
	case <-timer.C:
		if cancel != nil {
			cancel()
		}
		return false
	}
}
