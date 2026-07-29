package canbridge

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	maxBridgeArgumentsBytes = 32 << 20

	bridgeMethodBootstrap               = "Bootstrap"
	bridgeMethodLoadCollectionLibrary   = "LoadCollectionLibrary"
	bridgeMethodSaveCollectionLibrary   = "SaveCollectionLibrary"
	bridgeMethodImportCollectionFile    = "ImportCollectionFile"
	bridgeMethodExportCollectionFile    = "ExportCollectionFile"
	bridgeMethodSendRequest             = "SendRequest"
	bridgeMethodCancelRequest           = "CancelRequest"
	bridgeMethodImportOpenAPI           = "ImportOpenAPI"
	bridgeMethodValidateOpenAPIResponse = "ValidateOpenAPIResponse"
	bridgeMethodGetMockServer           = "GetMockServer"
	bridgeMethodUpdateMockRoutes        = "UpdateMockRoutes"
	bridgeMethodStartMockServer         = "StartMockServer"
	bridgeMethodStopMockServer          = "StopMockServer"
	bridgeMethodClearMockHits           = "ClearMockHits"
	bridgeMethodImportMockOpenAPI       = "ImportMockOpenAPI"
	bridgeMethodRunSSE                  = "RunSSE"
	bridgeMethodCancelToolOperation     = "CancelToolOperation"
	bridgeMethodInspectActuator         = "InspectActuator"
	bridgeMethodCompareEnvironments     = "CompareEnvironments"
	bridgeMethodAnalyzeThreadDump       = "AnalyzeThreadDump"
	bridgeMethodSearchTraceLog          = "SearchTraceLog"
	bridgeMethodAnalyzeEndpointCoverage = "AnalyzeEndpointCoverage"
	bridgeMethodRunCollection           = "RunCollection"
	bridgeMethodAnalyzeNetwork          = "AnalyzeNetwork"
	bridgeMethodLintOpenAPI             = "LintOpenAPI"
)

type bridgeExecutionPolicy uint8

const (
	bridgeExecutionConcurrent bridgeExecutionPolicy = iota
	bridgeExecutionCollectionLibrarySerial
)

// ipcAdmissionLane classifies concurrent calls by operational purpose. Keeping
// the lane on the method descriptor makes transport admission policy part of
// the same catalog as dispatch and argument decoding.
type ipcAdmissionLane uint8

const (
	ipcAdmissionConcurrent ipcAdmissionLane = iota
	ipcAdmissionCancellation
)

type bridgeMethodDescriptor struct {
	Name          string
	Policy        bridgeExecutionPolicy
	AdmissionLane ipcAdmissionLane
	BusyResult    func() any
	invoke        bridgeMethodInvoker
}

type bridgeMethodInvoker func(*Bridge, string) (any, error)

type bridgeMethodOption func(*bridgeMethodDescriptor)

type bridgeMethodCatalog struct {
	methods []bridgeMethodDescriptor
	byName  map[string]bridgeMethodDescriptor
}

func withBridgeExecutionPolicy(
	policy bridgeExecutionPolicy,
	busyResult func() any,
) bridgeMethodOption {
	return func(method *bridgeMethodDescriptor) {
		method.Policy = policy
		method.BusyResult = busyResult
	}
}

func withBridgeAdmissionLane(
	lane ipcAdmissionLane,
) bridgeMethodOption {
	return func(method *bridgeMethodDescriptor) {
		method.AdmissionLane = lane
	}
}

// registerBridgeMethod0 adapts a typed, argument-free Bridge method into one
// command descriptor. The closure keeps argument validation and the handler
// together without reflection.
func registerBridgeMethod0[Result any](
	name string,
	handler func(*Bridge) Result,
	options ...bridgeMethodOption,
) bridgeMethodDescriptor {
	method := bridgeMethodDescriptor{Name: name}
	if handler != nil {
		method.invoke = func(bridge *Bridge, encodedArguments string) (any, error) {
			if err := requireNoArguments(encodedArguments); err != nil {
				return nil, err
			}
			return handler(bridge), nil
		}
	}
	applyBridgeMethodOptions(&method, options)
	return method
}

// registerBridgeMethod1 adapts a single-argument typed Bridge method. Argument
// decoding remains compile-time typed because Argument is inferred from the
// concrete method expression at registration.
func registerBridgeMethod1[Argument, Result any](
	name string,
	handler func(*Bridge, Argument) Result,
	options ...bridgeMethodOption,
) bridgeMethodDescriptor {
	method := bridgeMethodDescriptor{Name: name}
	if handler != nil {
		method.invoke = func(bridge *Bridge, encodedArguments string) (any, error) {
			var argument Argument
			if err := decodeArguments(encodedArguments, &argument); err != nil {
				return nil, err
			}
			return handler(bridge, argument), nil
		}
	}
	applyBridgeMethodOptions(&method, options)
	return method
}

func applyBridgeMethodOptions(
	method *bridgeMethodDescriptor,
	options []bridgeMethodOption,
) {
	for _, option := range options {
		if option != nil {
			option(method)
		}
	}
}

func newBridgeMethodCatalog(
	methods ...bridgeMethodDescriptor,
) (bridgeMethodCatalog, error) {
	catalog := bridgeMethodCatalog{
		methods: append([]bridgeMethodDescriptor(nil), methods...),
		byName:  make(map[string]bridgeMethodDescriptor, len(methods)),
	}
	for index, method := range catalog.methods {
		if err := validateBridgeMethodDescriptor(method); err != nil {
			return bridgeMethodCatalog{}, fmt.Errorf(
				"method descriptor %d: %w",
				index,
				err,
			)
		}
		if _, duplicate := catalog.byName[method.Name]; duplicate {
			return bridgeMethodCatalog{}, fmt.Errorf(
				"duplicate bridge method %q",
				method.Name,
			)
		}
		catalog.byName[method.Name] = method
	}
	return catalog, nil
}

func validateBridgeMethodDescriptor(method bridgeMethodDescriptor) error {
	if strings.TrimSpace(method.Name) == "" {
		return fmt.Errorf("bridge method name is required")
	}
	if method.Name != strings.TrimSpace(method.Name) {
		return fmt.Errorf("bridge method name %q has surrounding whitespace", method.Name)
	}
	if method.invoke == nil {
		return fmt.Errorf("bridge method %q has no invocation handler", method.Name)
	}
	switch method.AdmissionLane {
	case ipcAdmissionConcurrent, ipcAdmissionCancellation:
	default:
		return fmt.Errorf(
			"bridge method %q has unsupported admission lane %d",
			method.Name,
			method.AdmissionLane,
		)
	}
	switch method.Policy {
	case bridgeExecutionConcurrent:
		if method.BusyResult != nil {
			return fmt.Errorf(
				"concurrent bridge method %q has an unused busy result",
				method.Name,
			)
		}
	case bridgeExecutionCollectionLibrarySerial:
		if method.AdmissionLane != ipcAdmissionConcurrent {
			return fmt.Errorf(
				"serial bridge method %q has an unused admission lane",
				method.Name,
			)
		}
		if method.BusyResult == nil {
			return fmt.Errorf(
				"serial bridge method %q has no typed busy result",
				method.Name,
			)
		}
	default:
		return fmt.Errorf(
			"bridge method %q has unsupported execution policy %d",
			method.Name,
			method.Policy,
		)
	}
	return nil
}

func mustBridgeMethodCatalog(
	methods ...bridgeMethodDescriptor,
) bridgeMethodCatalog {
	catalog, err := newBridgeMethodCatalog(methods...)
	if err != nil {
		panic("invalid canbridge method registry: " + err.Error())
	}
	return catalog
}

func (catalog bridgeMethodCatalog) names() []string {
	names := make([]string, len(catalog.methods))
	for index, method := range catalog.methods {
		names[index] = method.Name
	}
	return names
}

func (catalog bridgeMethodCatalog) lookup(
	methodName string,
) (bridgeMethodDescriptor, bool) {
	method, ok := catalog.byName[methodName]
	return method, ok
}

// bridgeMethodRegistry is the single source of truth for browser advertising,
// transport scheduling, typed argument decoding and Bridge dispatch.
var bridgeMethodRegistry = mustBridgeMethodCatalog(
	registerBridgeMethod0(bridgeMethodBootstrap, (*Bridge).Bootstrap),
	registerBridgeMethod0(
		bridgeMethodLoadCollectionLibrary,
		(*Bridge).LoadCollectionLibrary,
		withBridgeExecutionPolicy(
			bridgeExecutionCollectionLibrarySerial,
			func() any {
				return CollectionLibraryLoadResult{
					Error: collectionLibraryBusyError(),
				}
			},
		),
	),
	registerBridgeMethod1(
		bridgeMethodSaveCollectionLibrary,
		(*Bridge).SaveCollectionLibrary,
		withBridgeExecutionPolicy(
			bridgeExecutionCollectionLibrarySerial,
			func() any {
				return CollectionLibrarySaveResult{
					Error: collectionLibraryBusyError(),
				}
			},
		),
	),
	registerBridgeMethod0(
		bridgeMethodImportCollectionFile,
		(*Bridge).ImportCollectionFile,
	),
	registerBridgeMethod1(
		bridgeMethodExportCollectionFile,
		(*Bridge).ExportCollectionFile,
	),
	registerBridgeMethod1(bridgeMethodSendRequest, (*Bridge).SendRequest),
	registerBridgeMethod1(
		bridgeMethodCancelRequest,
		(*Bridge).CancelRequest,
		withBridgeAdmissionLane(ipcAdmissionCancellation),
	),
	registerBridgeMethod0(bridgeMethodImportOpenAPI, (*Bridge).ImportOpenAPI),
	registerBridgeMethod1(
		bridgeMethodValidateOpenAPIResponse,
		(*Bridge).ValidateOpenAPIResponse,
	),
	registerBridgeMethod0(bridgeMethodGetMockServer, (*Bridge).GetMockServer),
	registerBridgeMethod1(bridgeMethodUpdateMockRoutes, (*Bridge).UpdateMockRoutes),
	registerBridgeMethod1(bridgeMethodStartMockServer, (*Bridge).StartMockServer),
	registerBridgeMethod0(bridgeMethodStopMockServer, (*Bridge).StopMockServer),
	registerBridgeMethod0(bridgeMethodClearMockHits, (*Bridge).ClearMockHits),
	registerBridgeMethod0(
		bridgeMethodImportMockOpenAPI,
		(*Bridge).ImportMockOpenAPI,
	),
	registerBridgeMethod1(bridgeMethodRunSSE, (*Bridge).RunSSE),
	registerBridgeMethod1(
		bridgeMethodCancelToolOperation,
		(*Bridge).CancelToolOperation,
		withBridgeAdmissionLane(ipcAdmissionCancellation),
	),
	registerBridgeMethod1(bridgeMethodInspectActuator, (*Bridge).InspectActuator),
	registerBridgeMethod1(
		bridgeMethodCompareEnvironments,
		(*Bridge).CompareEnvironments,
	),
	registerBridgeMethod1(
		bridgeMethodAnalyzeThreadDump,
		(*Bridge).AnalyzeThreadDump,
	),
	registerBridgeMethod1(bridgeMethodSearchTraceLog, (*Bridge).SearchTraceLog),
	registerBridgeMethod1(
		bridgeMethodAnalyzeEndpointCoverage,
		(*Bridge).AnalyzeEndpointCoverage,
	),
	registerBridgeMethod1(bridgeMethodRunCollection, (*Bridge).RunCollection),
	registerBridgeMethod1(bridgeMethodAnalyzeNetwork, (*Bridge).AnalyzeNetwork),
	registerBridgeMethod0(bridgeMethodLintOpenAPI, (*Bridge).LintOpenAPI),
)

var bridgeMethodNames = bridgeMethodRegistry.names()

func bridgeMethodForName(
	methodName string,
) (bridgeMethodDescriptor, bool) {
	return bridgeMethodRegistry.lookup(methodName)
}

func executionPolicyForBridgeMethod(methodName string) bridgeExecutionPolicy {
	method, ok := bridgeMethodForName(methodName)
	if !ok {
		return bridgeExecutionConcurrent
	}
	return method.Policy
}

func busyResultForBridgeMethod(methodName string) (any, bool) {
	method, ok := bridgeMethodForName(methodName)
	if !ok || method.BusyResult == nil {
		return nil, false
	}
	return method.BusyResult(), true
}

func admissionLaneForBridgeMethod(methodName string) ipcAdmissionLane {
	method, ok := bridgeMethodForName(methodName)
	if !ok {
		return ipcAdmissionConcurrent
	}
	return method.AdmissionLane
}

func (lane ipcAdmissionLane) String() string {
	if lane == ipcAdmissionCancellation {
		return "cancellation"
	}
	return "concurrent"
}

// Invoke dispatches the small, explicit API exposed to the frontend. Keeping an
// allowlist here prevents every exported Go method from becoming callable just
// because it exists on Bridge.
func (b *Bridge) Invoke(method string, encodedArguments string) (result any, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			result = nil
			err = fmt.Errorf("canbridge method %s panicked", method)
		}
	}()

	if len(encodedArguments) > maxBridgeArgumentsBytes {
		return nil, fmt.Errorf("canbridge arguments exceed %d bytes", maxBridgeArgumentsBytes)
	}

	registeredMethod, ok := bridgeMethodForName(method)
	if !ok {
		return nil, fmt.Errorf("canbridge method %q is not registered", method)
	}
	return registeredMethod.invoke(b, encodedArguments)
}

func requireNoArguments(encoded string) error {
	var arguments []json.RawMessage
	if err := json.Unmarshal([]byte(encoded), &arguments); err != nil {
		return fmt.Errorf("decode canbridge arguments: %w", err)
	}
	if len(arguments) != 0 {
		return fmt.Errorf("expected no arguments, received %d", len(arguments))
	}
	return nil
}

func decodeArguments(encoded string, targets ...any) error {
	var arguments []json.RawMessage
	if err := json.Unmarshal([]byte(encoded), &arguments); err != nil {
		return fmt.Errorf("decode canbridge arguments: %w", err)
	}
	if len(arguments) != len(targets) {
		return fmt.Errorf("expected %d arguments, received %d", len(targets), len(arguments))
	}
	for index, target := range targets {
		if err := json.Unmarshal(arguments[index], target); err != nil {
			return fmt.Errorf("decode canbridge argument %d: %w", index+1, err)
		}
	}
	return nil
}
