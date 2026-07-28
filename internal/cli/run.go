package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"validex/internal/runner"
)

const runUsage = `Usage:
  validex-cli run --file collection.json [--variables vars.json] [--json]

Options:
  --file PATH       Collection JSON path, or - for standard input.
  --variables PATH  JSON object containing runtime variable overrides.
  --json            Emit the runner report as JSON.
`

func executeRun(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
) int {
	flags := newFlagSet("run")
	var filePath string
	var variablesPath string
	var jsonOutput bool
	flags.StringVar(&filePath, "file", "", "")
	flags.StringVar(&variablesPath, "variables", "", "")
	flags.BoolVar(&jsonOutput, "json", false, "")
	ok, code := parseFlags(flags, args, runUsage, stdout, stderr)
	if !ok {
		return code
	}
	if strings.TrimSpace(filePath) == "" {
		writeIgnoringError(stderr, "validex-cli run: --file is required\n\n")
		writeIgnoringError(stderr, runUsage)
		return exitUsage
	}
	if filePath == "-" && variablesPath == "-" {
		writeIgnoringError(
			stderr,
			"validex-cli run: --file and --variables cannot both read standard input\n\n",
		)
		writeIgnoringError(stderr, runUsage)
		return exitUsage
	}

	collectionInput, err := openInput(ctx, filePath, stdin)
	if err != nil {
		writeCommandError(stderr, "run", fmt.Errorf("open collection: %w", err))
		return exitFailure
	}
	collectionData, readErr := readAllContext(
		ctx,
		collectionInput,
		runner.DefaultMaxCollectionBytes,
	)
	closeErr := collectionInput.Close()
	if readErr != nil {
		writeCommandError(stderr, "run", fmt.Errorf("read collection: %w", readErr))
		return exitFailure
	}
	collection, decodeErr := runner.ParseCollection(collectionData, runner.Limits{})
	if decodeErr != nil {
		writeCommandError(stderr, "run", decodeErr)
		return exitFailure
	}
	if closeErr != nil {
		writeCommandError(stderr, "run", fmt.Errorf("close collection: %w", closeErr))
		return exitFailure
	}

	variables, err := loadVariables(ctx, variablesPath, stdin)
	if err != nil {
		writeCommandError(stderr, "run", err)
		return exitFailure
	}
	sender := runner.NewHTTPSender(nil)
	defer sender.CloseIdleConnections()
	report, runErr := runner.Run(
		ctx,
		collection,
		sender,
		runner.Options{Variables: variables},
	)
	if jsonOutput {
		if err := writeJSON(stdout, report); err != nil {
			return writeOutputError(stderr, "run", err)
		}
	} else if err := writeRunReport(stdout, report); err != nil {
		return writeOutputError(stderr, "run", err)
	}
	if runErr != nil {
		writeCommandError(stderr, "run", runErr)
		return exitFailure
	}
	if report.Failed > 0 {
		return exitFailure
	}
	return exitSuccess
}

func loadVariables(
	ctx context.Context,
	path string,
	stdin io.Reader,
) (map[string]string, error) {
	if strings.TrimSpace(path) == "" {
		return nil, nil
	}
	input, err := openInput(ctx, path, stdin)
	if err != nil {
		return nil, fmt.Errorf("open variables: %w", err)
	}
	defer input.Close()

	data, err := readAllContext(
		ctx,
		input,
		runner.DefaultMaxCollectionBytes,
	)
	if err != nil {
		return nil, fmt.Errorf("read variables: %w", err)
	}
	if int64(len(data)) > runner.DefaultMaxCollectionBytes {
		return nil, fmt.Errorf(
			"variables exceed %d bytes",
			runner.DefaultMaxCollectionBytes,
		)
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	var variables map[string]string
	if err := decoder.Decode(&variables); err != nil {
		return nil, fmt.Errorf("decode variables: %w", err)
	}
	if variables == nil {
		return nil, fmt.Errorf("decode variables: expected a JSON object")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("decode variables: multiple JSON values")
		}
		return nil, fmt.Errorf("decode variables: %w", err)
	}
	return variables, nil
}

func writeRunReport(writer io.Writer, report runner.Report) error {
	var output strings.Builder
	name := strings.TrimSpace(report.Name)
	if name == "" {
		name = "Unnamed collection"
	}
	fmt.Fprintf(&output, "Collection: %s\n", name)
	fmt.Fprintf(
		&output,
		"Summary: %d passed, %d failed, %d total, %d ms\n",
		report.Passed,
		report.Failed,
		len(report.Results),
		report.DurationMS,
	)
	for index, result := range report.Results {
		status := "PASS"
		if !result.Passed || result.Failure != nil {
			status = "FAIL"
		}
		label := strings.TrimSpace(result.Name)
		if label == "" {
			label = strings.TrimSpace(result.ID)
		}
		if label == "" {
			label = fmt.Sprintf("request %d", index+1)
		}
		statusCode := "—"
		if result.StatusCode > 0 {
			statusCode = fmt.Sprintf("%d", result.StatusCode)
		}
		fmt.Fprintf(
			&output,
			"%s  %s  %s  HTTP %s  %d ms  %s\n",
			status,
			result.Method,
			result.URL,
			statusCode,
			result.DurationMS,
			label,
		)
		if result.Failure != nil {
			fmt.Fprintf(
				&output,
				"  failure [%s]: %s\n",
				result.Failure.Code,
				result.Failure.Message,
			)
			if result.Failure.Hint != "" {
				fmt.Fprintf(&output, "  hint: %s\n", result.Failure.Hint)
			}
		}
		for _, assertion := range result.Assertions {
			if assertion.Passed {
				continue
			}
			message := assertion.Message
			if assertion.Error != "" {
				message = assertion.Error
			}
			fmt.Fprintf(
				&output,
				"  assertion [%s %s]: %s\n",
				assertion.Assertion.Target,
				assertion.Assertion.Operator,
				message,
			)
		}
	}
	_, err := io.WriteString(writer, output.String())
	return err
}
