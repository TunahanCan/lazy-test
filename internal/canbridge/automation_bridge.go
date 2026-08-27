package canbridge

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"validex/internal/netinspector"
	"validex/internal/openapilint"
	"validex/internal/runner"
)

const maximumDurationMilliseconds = int64(math.MaxInt64) / int64(time.Millisecond)

// CollectionRunInput is the desktop boundary for the same JSON collection
// consumed by validex-cli.
type CollectionRunInput struct {
	OperationID string            `json:"operationId"`
	Definition  string            `json:"definition"`
	Variables   map[string]string `json:"variables"`
}

type CollectionRunResult struct {
	Report *runner.Report `json:"report,omitempty"`
	Error  *UserError     `json:"error,omitempty"`
}

type NetworkInspectInput struct {
	OperationID        string `json:"operationId"`
	URL                string `json:"url"`
	TimeoutMS          int    `json:"timeoutMs"`
	MaxRedirects       int    `json:"maxRedirects"`
	InsecureSkipVerify bool   `json:"insecureSkipVerify"`
}

type NetworkInspectResult struct {
	Report *netinspector.Report `json:"report,omitempty"`
	Error  *UserError           `json:"error,omitempty"`
}

type OpenAPILintResult struct {
	Path     string              `json:"path"`
	Report   *openapilint.Report `json:"report,omitempty"`
	Canceled bool                `json:"canceled"`
	Error    *UserError          `json:"error,omitempty"`
}

func (b *Bridge) RunCollection(input CollectionRunInput) CollectionRunResult {
	ctx, finish, err := b.beginToolOperation(input.OperationID)
	if err != nil {
		return CollectionRunResult{Error: newUserError(
			automationCollectionOperationInvalidError,
			nil,
			err,
		)}
	}
	defer finish()

	limits := runner.DefaultLimits()
	collection, err := runner.ParseCollection(
		[]byte(input.Definition),
		limits,
	)
	if err != nil {
		return CollectionRunResult{Error: newUserError(
			automationCollectionDefinitionInvalidError,
			nil,
			err,
		)}
	}
	if err := ctx.Err(); err != nil {
		return CollectionRunResult{Error: automationContextError(
			automationCollectionRunFailedError,
			automationCollectionRunCanceledError,
			automationCollectionRunTimeoutError,
			err,
		)}
	}

	sender := runner.NewHTTPSender(nil)
	defer sender.CloseIdleConnections()
	report, runErr := runner.Run(
		ctx,
		collection,
		sender,
		runner.Options{Limits: limits, Variables: input.Variables},
	)
	result := CollectionRunResult{Report: &report}
	if runErr != nil {
		result.Error = automationContextError(
			automationCollectionRunFailedError,
			automationCollectionRunCanceledError,
			automationCollectionRunTimeoutError,
			runErr,
		)
	}
	return result
}

func (b *Bridge) AnalyzeNetwork(input NetworkInspectInput) NetworkInspectResult {
	ctx, finish, err := b.beginToolOperation(input.OperationID)
	if err != nil {
		return NetworkInspectResult{Error: newUserError(
			automationNetworkOperationInvalidError,
			nil,
			err,
		)}
	}
	defer finish()

	report, inspectErr := netinspector.Inspect(ctx, input.URL, netinspector.Options{
		Timeout:            milliseconds(input.TimeoutMS),
		MaxRedirects:       input.MaxRedirects,
		InsecureSkipVerify: input.InsecureSkipVerify,
	})
	result := NetworkInspectResult{Report: &report}
	if inspectErr != nil {
		result.Error = automationContextError(
			automationNetworkInspectionFailedError,
			automationNetworkInspectionCanceledError,
			automationNetworkInspectionTimeoutError,
			inspectErr,
		)
	}
	return result
}

func (b *Bridge) LintOpenAPI() OpenAPILintResult {
	ctx := b.runtimeContext()
	if ctx == nil {
		return OpenAPILintResult{Error: newUserError(
			automationOpenAPIRuntimeUnavailableError,
			nil,
			nil,
		)}
	}
	path, err := b.filePicker.Open(ctx, fileDialogOptions{
		Title:      "Lint uygulanacak OpenAPI dosyasını seç",
		Extensions: []string{"yaml", "yml", "json"},
	})
	if err != nil {
		return OpenAPILintResult{Error: newUserError(
			automationOpenAPIFileDialogFailedError,
			nil,
			err,
		)}
	}
	if strings.TrimSpace(path) == "" {
		return OpenAPILintResult{Canceled: true}
	}

	report, err := openapilint.LintFileContext(
		ctx,
		path,
		openapilint.Options{},
	)
	if err != nil {
		return OpenAPILintResult{
			Path: path,
			Error: newUserError(
				automationOpenAPILintFailedError,
				nil,
				err,
			),
		}
	}
	return OpenAPILintResult{Path: path, Report: &report}
}

func milliseconds(value int) time.Duration {
	if value == 0 {
		return 0
	}
	if value < 0 || int64(value) > maximumDurationMilliseconds {
		return -1
	}
	return time.Duration(value) * time.Millisecond
}

func automationContextError(
	failure userErrorDefinition,
	canceled userErrorDefinition,
	timedOut userErrorDefinition,
	err error,
) *UserError {
	switch {
	case errors.Is(err, context.Canceled):
		return newUserError(canceled, nil, nil)
	case errors.Is(err, context.DeadlineExceeded):
		return newUserError(timedOut, nil, nil)
	default:
		return newUserError(failure, nil, err)
	}
}
