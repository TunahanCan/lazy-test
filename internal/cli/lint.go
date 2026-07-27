package cli

import (
	"context"
	"fmt"
	"io"
	"strings"

	"validex/internal/openapilint"
)

const lintUsage = `Usage:
  validex-cli lint --file openapi.yaml [--json] [--strict]

Options:
  --file PATH  OpenAPI YAML/JSON path, or - for standard input.
  --json       Emit the lint report as JSON.
  --strict     Treat warnings as failures.
`

func executeLint(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	stderr io.Writer,
) int {
	flags := newFlagSet("lint")
	var filePath string
	var jsonOutput bool
	var strict bool
	flags.StringVar(&filePath, "file", "", "")
	flags.BoolVar(&jsonOutput, "json", false, "")
	flags.BoolVar(&strict, "strict", false, "")
	ok, code := parseFlags(flags, args, lintUsage, stdout, stderr)
	if !ok {
		return code
	}
	if strings.TrimSpace(filePath) == "" {
		writeIgnoringError(stderr, "validex-cli lint: --file is required\n\n")
		writeIgnoringError(stderr, lintUsage)
		return exitUsage
	}

	input, err := openInput(ctx, filePath, stdin)
	if err != nil {
		writeCommandError(
			stderr,
			"lint",
			fmt.Errorf("read OpenAPI document: open file: %w", err),
		)
		return exitFailure
	}
	data, readErr := readAllContext(ctx, input, openapilint.MaxDocumentBytes)
	closeErr := input.Close()
	if readErr != nil {
		writeCommandError(stderr, "lint", fmt.Errorf("read OpenAPI document: %w", readErr))
		return exitFailure
	}
	if closeErr != nil {
		writeCommandError(stderr, "lint", fmt.Errorf("close OpenAPI document: %w", closeErr))
		return exitFailure
	}

	report, err := lintDocumentContext(ctx, data)
	if err != nil {
		writeCommandError(stderr, "lint", err)
		return exitFailure
	}

	if jsonOutput {
		if err := writeJSON(stdout, report); err != nil {
			return writeOutputError(stderr, "lint", err)
		}
	} else if err := writeLintReport(stdout, report, strict); err != nil {
		return writeOutputError(stderr, "lint", err)
	}
	if report.Summary.Errors > 0 ||
		strict && report.Summary.Warnings > 0 {
		return exitFailure
	}
	return exitSuccess
}

func lintDocumentContext(
	ctx context.Context,
	data []byte,
) (openapilint.Report, error) {
	if err := ctx.Err(); err != nil {
		return openapilint.Report{}, err
	}
	result := make(chan openapilint.Report, 1)
	go func() {
		result <- openapilint.LintBytes(data, openapilint.Options{})
	}()
	select {
	case report := <-result:
		return report, nil
	case <-ctx.Done():
		return openapilint.Report{}, ctx.Err()
	}
}

func writeLintReport(
	writer io.Writer,
	report openapilint.Report,
	strict bool,
) error {
	var output strings.Builder
	fmt.Fprintf(
		&output,
		"OpenAPI: %d paths, %d operations\n",
		report.Summary.Paths,
		report.Summary.Operations,
	)
	fmt.Fprintf(
		&output,
		"Issues: %d total, %d errors, %d warnings, %d info\n",
		report.Summary.Total,
		report.Summary.Errors,
		report.Summary.Warnings,
		report.Summary.Infos,
	)
	for _, issue := range report.Issues {
		fmt.Fprintf(
			&output,
			"%s  [%s]  %s\n",
			strings.ToUpper(string(issue.Severity)),
			issue.Code,
			issue.Path,
		)
		fmt.Fprintf(&output, "  %s\n", issue.Message)
		if issue.Hint != "" {
			fmt.Fprintf(&output, "  hint: %s\n", issue.Hint)
		}
	}
	if report.Truncated {
		fmt.Fprintf(
			&output,
			"Report truncated: showing %d of %d issues.\n",
			len(report.Issues),
			report.Summary.Total,
		)
	}
	result := "PASS"
	if report.Summary.Errors > 0 ||
		strict && report.Summary.Warnings > 0 {
		result = "FAIL"
	}
	fmt.Fprintf(&output, "Result: %s\n", result)
	_, err := io.WriteString(writer, output.String())
	return err
}
