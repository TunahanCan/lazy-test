package canbridge

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"
)

const (
	defaultInvocationConcurrentDrainPeriod = 3 * time.Second
	defaultInvocationSerialDrainPeriod     = 3 * time.Second

	defaultInvocationConcurrentCalls   = 16
	defaultInvocationConcurrentBytes   = 64 << 20
	defaultInvocationCancellationCalls = 8
	defaultInvocationCancellationBytes = 1 << 20

	defaultInvocationSerialCalls = 128
	defaultInvocationSerialBytes = 64 << 20
)

// Invocation identifies one asynchronous call into Bridge. Arguments retains
// Bridge.Invoke's JSON-array string contract so desktop hosts do not need a
// second method-specific codec.
type Invocation struct {
	ID        string
	Method    string
	Arguments string
}

// InvocationResponse is delivered for an accepted invocation while the runtime
// remains open. A response has either Result or Error set.
type InvocationResponse struct {
	ID     string
	Result any
	Error  string
}

type invocationAdmissionLimits struct {
	maxCalls int
	maxBytes int
}

type invocationAdmissionState struct {
	inFlight int
	bytes    int
}

type invocationRuntimeConfig struct {
	concurrentLimits   invocationAdmissionLimits
	cancellationLimits invocationAdmissionLimits
	serialMaxCalls     int
	serialMaxBytes     int
	concurrentDrain    time.Duration
	serialDrain        time.Duration
	invoke             func(string, string) (any, error)
}

// InvocationRuntime owns Bridge's host-neutral invocation lifecycle. It keeps
// cancellation calls responsive under normal-lane saturation and serializes
// collection persistence calls in acceptance order.
type InvocationRuntime struct {
	bridge  *Bridge
	deliver func(InvocationResponse)
	invoke  func(string, string) (any, error)

	cancel context.CancelFunc

	mu                    sync.Mutex
	closed                bool
	concurrentAdmission   invocationAdmissionState
	cancellationAdmission invocationAdmissionState
	concurrentCalls       sync.WaitGroup
	serialQueue           *invocationSerialQueue

	concurrentLimits   invocationAdmissionLimits
	cancellationLimits invocationAdmissionLimits
	serialMaxCalls     int
	serialMaxBytes     int
	concurrentDrain    time.Duration
	serialDrain        time.Duration

	deliveryCalls sync.WaitGroup
	closeOnce     sync.Once
	closeDone     chan struct{}
	closeErr      error
}

// NewInvocationRuntime starts bridge lifecycle management for a desktop host.
// deliver must return promptly; the transport may serialize or buffer writes.
func NewInvocationRuntime(
	parent context.Context,
	bridge *Bridge,
	deliver func(InvocationResponse),
) (*InvocationRuntime, error) {
	return newInvocationRuntime(parent, bridge, deliver, invocationRuntimeConfig{})
}

func newInvocationRuntime(
	parent context.Context,
	bridge *Bridge,
	deliver func(InvocationResponse),
	config invocationRuntimeConfig,
) (*InvocationRuntime, error) {
	if bridge == nil {
		return nil, errors.New("canbridge invocation runtime requires a Bridge")
	}
	if deliver == nil {
		return nil, errors.New("canbridge invocation runtime requires a response callback")
	}
	if parent == nil {
		parent = context.Background()
	}

	config = withInvocationRuntimeDefaults(config)
	if config.invoke == nil {
		config.invoke = bridge.Invoke
	}
	runtimeContext, cancel := context.WithCancel(parent)
	runtime := &InvocationRuntime{
		bridge:             bridge,
		deliver:            deliver,
		invoke:             config.invoke,
		cancel:             cancel,
		concurrentLimits:   config.concurrentLimits,
		cancellationLimits: config.cancellationLimits,
		serialMaxCalls:     config.serialMaxCalls,
		serialMaxBytes:     config.serialMaxBytes,
		concurrentDrain:    config.concurrentDrain,
		serialDrain:        config.serialDrain,
		closeDone:          make(chan struct{}),
	}
	Startup(bridge)(runtimeContext)
	return runtime, nil
}

func withInvocationRuntimeDefaults(
	config invocationRuntimeConfig,
) invocationRuntimeConfig {
	if config.concurrentLimits.maxCalls <= 0 {
		config.concurrentLimits.maxCalls = defaultInvocationConcurrentCalls
	}
	if config.concurrentLimits.maxBytes <= 0 {
		config.concurrentLimits.maxBytes = defaultInvocationConcurrentBytes
	}
	if config.cancellationLimits.maxCalls <= 0 {
		config.cancellationLimits.maxCalls = defaultInvocationCancellationCalls
	}
	if config.cancellationLimits.maxBytes <= 0 {
		config.cancellationLimits.maxBytes = defaultInvocationCancellationBytes
	}
	if config.serialMaxCalls <= 0 {
		config.serialMaxCalls = defaultInvocationSerialCalls
	}
	if config.serialMaxBytes <= 0 {
		config.serialMaxBytes = defaultInvocationSerialBytes
	}
	if config.concurrentDrain <= 0 {
		config.concurrentDrain = defaultInvocationConcurrentDrainPeriod
	}
	if config.serialDrain <= 0 {
		config.serialDrain = defaultInvocationSerialDrainPeriod
	}
	return config
}

// Dispatch accepts one invocation without waiting for its handler. Admission
// failures are returned synchronously and accepted calls respond via deliver.
func (runtime *InvocationRuntime) Dispatch(invocation Invocation) error {
	if invocation.ID == "" || len(invocation.ID) > 256 {
		return errors.New("invalid canbridge invocation ID")
	}
	if invocation.Method == "" || len(invocation.Method) > 128 {
		return errors.New("invalid canbridge method")
	}
	if len(invocation.Arguments) > maxBridgeArgumentsBytes {
		return fmt.Errorf(
			"canbridge arguments exceed %d bytes",
			maxBridgeArgumentsBytes,
		)
	}

	runtime.mu.Lock()
	if runtime.closed {
		runtime.mu.Unlock()
		return errors.New("canbridge is shutting down")
	}
	if executionPolicyForBridgeMethod(invocation.Method) ==
		bridgeExecutionCollectionLibrarySerial {
		queue := runtime.serialQueueLocked()
		runtime.mu.Unlock()
		switch queue.enqueue(invocation) {
		case invocationSerialAccepted:
			return nil
		case invocationSerialClosed:
			return errors.New("canbridge is shutting down")
		default:
			busyResult, ok := busyResultForBridgeMethod(invocation.Method)
			if !ok {
				return fmt.Errorf(
					"canbridge serial method %s has no busy result",
					invocation.Method,
				)
			}
			runtime.deliverResponse(InvocationResponse{
				ID:     invocation.ID,
				Result: busyResult,
			})
			return nil
		}
	}

	lane := admissionLaneForBridgeMethod(invocation.Method)
	admission, limits := runtime.admissionLocked(lane)
	if err := admission.acquire(lane, len(invocation.Arguments), limits); err != nil {
		runtime.mu.Unlock()
		return err
	}
	runtime.concurrentCalls.Add(1)
	runtime.mu.Unlock()

	go func() {
		defer runtime.releaseConcurrent(lane, len(invocation.Arguments))
		runtime.execute(invocation)
	}()
	return nil
}

func (runtime *InvocationRuntime) serialQueueLocked() *invocationSerialQueue {
	if runtime.serialQueue == nil {
		runtime.serialQueue = newInvocationSerialQueue(
			runtime.serialMaxCalls,
			runtime.serialMaxBytes,
			runtime.execute,
		)
	}
	return runtime.serialQueue
}

func (runtime *InvocationRuntime) admissionLocked(
	lane ipcAdmissionLane,
) (*invocationAdmissionState, invocationAdmissionLimits) {
	if lane == ipcAdmissionCancellation {
		return &runtime.cancellationAdmission, runtime.cancellationLimits
	}
	return &runtime.concurrentAdmission, runtime.concurrentLimits
}

func (admission *invocationAdmissionState) acquire(
	lane ipcAdmissionLane,
	argumentBytes int,
	limits invocationAdmissionLimits,
) error {
	if admission.inFlight >= limits.maxCalls {
		return fmt.Errorf(
			"canbridge IPC %s lane is full: maximum %d in-flight calls",
			lane,
			limits.maxCalls,
		)
	}
	if argumentBytes > limits.maxBytes-admission.bytes {
		return fmt.Errorf(
			"canbridge IPC %s lane byte budget exceeded: maximum %d accepted argument bytes",
			lane,
			limits.maxBytes,
		)
	}
	admission.inFlight++
	admission.bytes += argumentBytes
	return nil
}

func (admission *invocationAdmissionState) release(argumentBytes int) {
	admission.inFlight--
	admission.bytes -= argumentBytes
}

func (runtime *InvocationRuntime) releaseConcurrent(
	lane ipcAdmissionLane,
	argumentBytes int,
) {
	runtime.mu.Lock()
	admission, _ := runtime.admissionLocked(lane)
	admission.release(argumentBytes)
	runtime.concurrentCalls.Done()
	runtime.mu.Unlock()
}

func (runtime *InvocationRuntime) execute(invocation Invocation) {
	response := InvocationResponse{ID: invocation.ID}
	defer func() {
		if recovered := recover(); recovered != nil {
			response.Result = nil
			response.Error = fmt.Sprintf(
				"canbridge method %s panicked",
				invocation.Method,
			)
		}
		runtime.deliverResponse(response)
	}()

	result, err := runtime.invoke(invocation.Method, invocation.Arguments)
	if err != nil {
		response.Error = err.Error()
		return
	}
	response.Result = result
}

func (runtime *InvocationRuntime) deliverResponse(response InvocationResponse) {
	runtime.mu.Lock()
	if runtime.closed {
		runtime.mu.Unlock()
		return
	}
	runtime.deliveryCalls.Add(1)
	deliver := runtime.deliver
	runtime.mu.Unlock()

	defer runtime.deliveryCalls.Done()
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf(
				"[canbridge:error] response callback for invocation %q panicked",
				response.ID,
			)
		}
	}()
	deliver(response)
}

// Close seals admission, cancels concurrent bridge work, drains accepted
// collection persistence work, and then shuts Bridge down. It is idempotent.
func (runtime *InvocationRuntime) Close(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	started := false
	runtime.closeOnce.Do(func() {
		started = true
		runtime.closeErr = runtime.close(ctx)
		close(runtime.closeDone)
	})
	if started {
		return runtime.closeErr
	}

	select {
	case <-runtime.closeDone:
		return runtime.closeErr
	default:
	}
	select {
	case <-runtime.closeDone:
		return runtime.closeErr
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (runtime *InvocationRuntime) close(ctx context.Context) error {
	runtime.mu.Lock()
	runtime.closed = true
	serialQueue := runtime.serialQueue
	runtime.mu.Unlock()

	runtime.cancel()

	concurrentDone := make(chan struct{})
	go func() {
		runtime.concurrentCalls.Wait()
		close(concurrentDone)
	}()
	concurrentDeadline := time.Now().Add(runtime.concurrentDrain)

	var closeErrors []error
	if serialQueue != nil && !serialQueue.closeAndDrain(runtime.serialDrain) {
		runtime.bridge.cancelCollectionPersistence()
		closeErrors = append(
			closeErrors,
			errors.New("collection persistence drain timed out"),
		)
	}
	if !waitForInvocationRuntime(
		ctx,
		concurrentDone,
		concurrentDeadline,
	) {
		closeErrors = append(
			closeErrors,
			errors.New("concurrent invocation drain timed out"),
		)
	}

	deliveryDone := make(chan struct{})
	go func() {
		runtime.deliveryCalls.Wait()
		close(deliveryDone)
	}()
	if !waitForInvocationRuntime(ctx, deliveryDone, concurrentDeadline) {
		closeErrors = append(
			closeErrors,
			errors.New("response delivery drain timed out"),
		)
	}

	Shutdown(runtime.bridge)(ctx)
	return errors.Join(closeErrors...)
}

func waitForInvocationRuntime(
	ctx context.Context,
	done <-chan struct{},
	deadline time.Time,
) bool {
	select {
	case <-done:
		return true
	default:
	}
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return false
	}
	timer := time.NewTimer(remaining)
	defer timer.Stop()
	select {
	case <-done:
		return true
	case <-timer.C:
		return false
	case <-ctx.Done():
		return false
	}
}

type invocationSerialStatus uint8

const (
	invocationSerialAccepted invocationSerialStatus = iota
	invocationSerialClosed
	invocationSerialFull
)

type invocationSerialQueue struct {
	mu          sync.Mutex
	wake        *sync.Cond
	closed      bool
	started     bool
	done        chan struct{}
	entries     []Invocation
	queuedBytes int
	maxEntries  int
	maxBytes    int
	execute     func(Invocation)
}

func newInvocationSerialQueue(
	maxEntries int,
	maxBytes int,
	execute func(Invocation),
) *invocationSerialQueue {
	queue := &invocationSerialQueue{
		maxEntries: maxEntries,
		maxBytes:   maxBytes,
		execute:    execute,
	}
	queue.wake = sync.NewCond(&queue.mu)
	return queue
}

func (queue *invocationSerialQueue) enqueue(
	invocation Invocation,
) invocationSerialStatus {
	queue.mu.Lock()
	defer queue.mu.Unlock()
	if queue.closed {
		return invocationSerialClosed
	}
	if len(queue.entries) >= queue.maxEntries ||
		queue.queuedBytes+len(invocation.Arguments) > queue.maxBytes {
		return invocationSerialFull
	}
	queue.entries = append(queue.entries, invocation)
	queue.queuedBytes += len(invocation.Arguments)
	if !queue.started {
		queue.started = true
		queue.done = make(chan struct{})
		go queue.run()
	}
	queue.wake.Signal()
	return invocationSerialAccepted
}

func (queue *invocationSerialQueue) run() {
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
		queue.queuedBytes -= len(invocation.Arguments)
		if len(queue.entries) == 1 {
			queue.entries = nil
		} else {
			queue.entries[0] = Invocation{}
			queue.entries = queue.entries[1:]
		}
		queue.mu.Unlock()
		queue.execute(invocation)
	}
}

func (queue *invocationSerialQueue) closeAndDrain(period time.Duration) bool {
	queue.mu.Lock()
	queue.closed = true
	queue.wake.Broadcast()
	done := queue.done
	queue.mu.Unlock()
	if done == nil {
		return true
	}

	timer := time.NewTimer(period)
	defer timer.Stop()
	select {
	case <-done:
		return true
	case <-timer.C:
		return false
	}
}
