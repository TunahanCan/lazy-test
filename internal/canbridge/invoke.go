package canbridge

import (
	"encoding/json"
	"fmt"
)

const maxBridgeArgumentsBytes = 32 << 20

var bridgeMethodNames = []string{
	"Bootstrap",
	"SendRequest",
	"CancelRequest",
	"ImportOpenAPI",
	"ValidateOpenAPIResponse",
	"GetMockServer",
	"UpdateMockRoutes",
	"StartMockServer",
	"StopMockServer",
	"ClearMockHits",
	"ImportMockOpenAPI",
	"RunSSE",
	"RunWebSocket",
	"InspectGRPC",
	"CancelToolOperation",
	"InspectActuator",
	"CompareEnvironments",
	"AnalyzeThreadDump",
	"SearchTraceLog",
	"AnalyzeEndpointCoverage",
	"RunCollection",
	"AnalyzeNetwork",
	"LintOpenAPI",
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
	case "Bootstrap":
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.Bootstrap(), nil
	case "SendRequest":
		var input RequestInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.SendRequest(input), nil
	case "CancelRequest":
		var requestID string
		if err := decodeArguments(encodedArguments, &requestID); err != nil {
			return nil, err
		}
		return b.CancelRequest(requestID), nil
	case "ImportOpenAPI":
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.ImportOpenAPI(), nil
	case "ValidateOpenAPIResponse":
		var input ContractCheckInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.ValidateOpenAPIResponse(input), nil
	case "GetMockServer":
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.GetMockServer(), nil
	case "UpdateMockRoutes":
		var routes []MockRoute
		if err := decodeArguments(encodedArguments, &routes); err != nil {
			return nil, err
		}
		return b.UpdateMockRoutes(routes), nil
	case "StartMockServer":
		var input MockStartInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.StartMockServer(input), nil
	case "StopMockServer":
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.StopMockServer(), nil
	case "ClearMockHits":
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.ClearMockHits(), nil
	case "ImportMockOpenAPI":
		if err := requireNoArguments(encodedArguments); err != nil {
			return nil, err
		}
		return b.ImportMockOpenAPI(), nil
	case "RunSSE":
		var input SSEInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.RunSSE(input), nil
	case "RunWebSocket":
		var input WebSocketInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.RunWebSocket(input), nil
	case "InspectGRPC":
		var input GRPCInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.InspectGRPC(input), nil
	case "CancelToolOperation":
		var operationID string
		if err := decodeArguments(encodedArguments, &operationID); err != nil {
			return nil, err
		}
		return b.CancelToolOperation(operationID), nil
	case "InspectActuator":
		var input ActuatorInspectInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.InspectActuator(input), nil
	case "CompareEnvironments":
		var input EnvironmentCompareInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.CompareEnvironments(input), nil
	case "AnalyzeThreadDump":
		var input ThreadDumpInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.AnalyzeThreadDump(input), nil
	case "SearchTraceLog":
		var input LogSearchInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.SearchTraceLog(input), nil
	case "AnalyzeEndpointCoverage":
		var input CoverageInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.AnalyzeEndpointCoverage(input), nil
	case "RunCollection":
		var input CollectionRunInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.RunCollection(input), nil
	case "AnalyzeNetwork":
		var input NetworkInspectInput
		if err := decodeArguments(encodedArguments, &input); err != nil {
			return nil, err
		}
		return b.AnalyzeNetwork(input), nil
	case "LintOpenAPI":
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
