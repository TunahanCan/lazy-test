package canbridge

import (
	"encoding/json"
	"fmt"
)

const (
	maxBridgeArgumentsBytes = 32 << 20

	bridgeMethodBootstrap               = "Bootstrap"
	bridgeMethodLoadCollectionLibrary   = "LoadCollectionLibrary"
	bridgeMethodSaveCollectionLibrary   = "SaveCollectionLibrary"
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

type bridgeMethodDescriptor struct {
	Name       string
	Policy     bridgeExecutionPolicy
	BusyResult func() any
}

// bridgeMethodRegistry is the single source of truth for methods advertised to
// the browser and transport-level scheduling policy. Invoke remains an explicit
// switch so each method keeps compile-time argument decoding.
var bridgeMethodRegistry = []bridgeMethodDescriptor{
	{Name: bridgeMethodBootstrap},
	{
		Name:   bridgeMethodLoadCollectionLibrary,
		Policy: bridgeExecutionCollectionLibrarySerial,
		BusyResult: func() any {
			return CollectionLibraryLoadResult{
				Error: collectionLibraryBusyError(),
			}
		},
	},
	{
		Name:   bridgeMethodSaveCollectionLibrary,
		Policy: bridgeExecutionCollectionLibrarySerial,
		BusyResult: func() any {
			return CollectionLibrarySaveResult{
				Error: collectionLibraryBusyError(),
			}
		},
	},
	{Name: bridgeMethodSendRequest},
	{Name: bridgeMethodCancelRequest},
	{Name: bridgeMethodImportOpenAPI},
	{Name: bridgeMethodValidateOpenAPIResponse},
	{Name: bridgeMethodGetMockServer},
	{Name: bridgeMethodUpdateMockRoutes},
	{Name: bridgeMethodStartMockServer},
	{Name: bridgeMethodStopMockServer},
	{Name: bridgeMethodClearMockHits},
	{Name: bridgeMethodImportMockOpenAPI},
	{Name: bridgeMethodRunSSE},
	{Name: bridgeMethodCancelToolOperation},
	{Name: bridgeMethodInspectActuator},
	{Name: bridgeMethodCompareEnvironments},
	{Name: bridgeMethodAnalyzeThreadDump},
	{Name: bridgeMethodSearchTraceLog},
	{Name: bridgeMethodAnalyzeEndpointCoverage},
	{Name: bridgeMethodRunCollection},
	{Name: bridgeMethodAnalyzeNetwork},
	{Name: bridgeMethodLintOpenAPI},
}

var bridgeMethodNames = func() []string {
	names := make([]string, len(bridgeMethodRegistry))
	for index, method := range bridgeMethodRegistry {
		names[index] = method.Name
	}
	return names
}()

func executionPolicyForBridgeMethod(methodName string) bridgeExecutionPolicy {
	for _, method := range bridgeMethodRegistry {
		if method.Name == methodName {
			return method.Policy
		}
	}
	return bridgeExecutionConcurrent
}

func busyResultForBridgeMethod(methodName string) (any, bool) {
	for _, method := range bridgeMethodRegistry {
		if method.Name == methodName && method.BusyResult != nil {
			return method.BusyResult(), true
		}
	}
	return nil, false
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

	switch method {
	case bridgeMethodBootstrap:
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.Bootstrap(), nil
	case bridgeMethodLoadCollectionLibrary:
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.LoadCollectionLibrary(), nil
	case bridgeMethodSaveCollectionLibrary:
		var data string
		if err := decodeArguments(encodedArguments, &data); err != nil {
			return nil, err
		}
		return b.SaveCollectionLibrary(data), nil
	case bridgeMethodSendRequest:
		var input RequestInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.SendRequest(input), nil
	case bridgeMethodCancelRequest:
		var requestID string
		if err := decodeArguments(encodedArguments, &requestID); err != nil {
			return nil, err
		}
		return b.CancelRequest(requestID), nil
	case bridgeMethodImportOpenAPI:
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.ImportOpenAPI(), nil
	case bridgeMethodValidateOpenAPIResponse:
		var input ContractCheckInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.ValidateOpenAPIResponse(input), nil
	case bridgeMethodGetMockServer:
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.GetMockServer(), nil
	case bridgeMethodUpdateMockRoutes:
		var routes []MockRoute
		if err := decodeArguments(encodedArguments, &routes); err != nil {
			return nil, err
		}
		return b.UpdateMockRoutes(routes), nil
	case bridgeMethodStartMockServer:
		var input MockStartInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.StartMockServer(input), nil
	case bridgeMethodStopMockServer:
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.StopMockServer(), nil
	case bridgeMethodClearMockHits:
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.ClearMockHits(), nil
	case bridgeMethodImportMockOpenAPI:
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.ImportMockOpenAPI(), nil
	case bridgeMethodRunSSE:
		var input SSEInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.RunSSE(input), nil
	case bridgeMethodCancelToolOperation:
		var operationID string
		if err := decodeArguments(encodedArguments, &operationID); err != nil {
			return nil, err
		}
		return b.CancelToolOperation(operationID), nil
	case bridgeMethodInspectActuator:
		var input ActuatorInspectInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.InspectActuator(input), nil
	case bridgeMethodCompareEnvironments:
		var input EnvironmentCompareInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.CompareEnvironments(input), nil
	case bridgeMethodAnalyzeThreadDump:
		var input ThreadDumpInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.AnalyzeThreadDump(input), nil
	case bridgeMethodSearchTraceLog:
		var input LogSearchInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.SearchTraceLog(input), nil
	case bridgeMethodAnalyzeEndpointCoverage:
		var input CoverageInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.AnalyzeEndpointCoverage(input), nil
	case bridgeMethodRunCollection:
		var input CollectionRunInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.RunCollection(input), nil
	case bridgeMethodAnalyzeNetwork:
		var input NetworkInspectInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.AnalyzeNetwork(input), nil
	case bridgeMethodLintOpenAPI:
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.LintOpenAPI(), nil
	default:
		return nil, fmt.Errorf("canbridge method %q is not registered", method)
	}
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
