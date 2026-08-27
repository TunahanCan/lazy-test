package cli

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"validex/internal/netinspector"
)

const maximumInspectTimeout = 5 * time.Minute

const inspectUsage = `Usage:
  validex-cli inspect --url URL [--timeout 15s] [--max-redirects 10] [--insecure] [--json]

Options:
  --url URL             HTTP or HTTPS URL to inspect.
  --timeout DURATION    Overall timeout, at most 5m (default 15s).
  --max-redirects N     Maximum redirects (default 10).
  --insecure            Allow self-signed HTTPS certificates.
  --json                Emit the inspection report as JSON.
`

type inspectJSONReport struct {
	netinspector.Report
	Error string `json:"error,omitempty"`
}

func executeInspect(
	ctx context.Context,
	args []string,
	stdout io.Writer,
	stderr io.Writer,
) int {
	flags := newFlagSet("inspect")
	var rawURL string
	var timeout time.Duration
	var maxRedirects int
	var insecure bool
	var jsonOutput bool
	flags.StringVar(&rawURL, "url", "", "")
	flags.DurationVar(&timeout, "timeout", 15*time.Second, "")
	flags.IntVar(&maxRedirects, "max-redirects", 10, "")
	flags.BoolVar(&insecure, "insecure", false, "")
	flags.BoolVar(&jsonOutput, "json", false, "")
	ok, code := parseFlags(flags, args, inspectUsage, stdout, stderr)
	if !ok {
		return code
	}
	if strings.TrimSpace(rawURL) == "" {
		writeIgnoringError(stderr, "validex-cli inspect: --url is required\n\n")
		writeIgnoringError(stderr, inspectUsage)
		return exitUsage
	}
	if timeout <= 0 {
		writeIgnoringError(stderr, "validex-cli inspect: --timeout must be positive\n\n")
		writeIgnoringError(stderr, inspectUsage)
		return exitUsage
	}
	if timeout > maximumInspectTimeout {
		writeIgnoringError(
			stderr,
			fmt.Sprintf(
				"validex-cli inspect: --timeout must not exceed %s\n\n",
				maximumInspectTimeout,
			),
		)
		writeIgnoringError(stderr, inspectUsage)
		return exitUsage
	}
	if maxRedirects < 1 {
		writeIgnoringError(
			stderr,
			"validex-cli inspect: --max-redirects must be positive\n\n",
		)
		writeIgnoringError(stderr, inspectUsage)
		return exitUsage
	}

	report, inspectErr := netinspector.Inspect(ctx, rawURL, netinspector.Options{
		Timeout:            timeout,
		MaxRedirects:       maxRedirects,
		InsecureSkipVerify: insecure,
	})
	if jsonOutput {
		output := inspectJSONReport{Report: report}
		if inspectErr != nil {
			output.Error = inspectErr.Error()
		}
		if err := writeJSON(stdout, output); err != nil {
			return writeOutputError(stderr, "inspect", err)
		}
	} else if inspectErr == nil ||
		len(report.DNSLookups) > 0 ||
		len(report.Hops) > 0 {
		if err := writeInspectionReport(stdout, report); err != nil {
			return writeOutputError(stderr, "inspect", err)
		}
	}
	if inspectErr != nil {
		writeCommandError(stderr, "inspect", inspectErr)
		if errors.Is(inspectErr, netinspector.ErrInvalidOptions) ||
			errors.Is(inspectErr, netinspector.ErrInvalidURL) {
			return exitUsage
		}
		return exitFailure
	}
	return exitSuccess
}

func writeInspectionReport(writer io.Writer, report netinspector.Report) error {
	var output strings.Builder
	fmt.Fprintf(&output, "Inspect: %s\n", report.InputURL)
	for _, lookup := range report.DNSLookups {
		fmt.Fprintf(
			&output,
			"DNS  %s  %s  %d ms\n",
			lookup.Host,
			strings.Join(lookup.IPs, ", "),
			lookup.DurationMS,
		)
	}
	for index, hop := range report.Hops {
		fmt.Fprintf(
			&output,
			"HOP %d  %s  %s  HTTP %d  %d ms",
			index+1,
			hop.Method,
			hop.URL,
			hop.StatusCode,
			hop.DurationMS,
		)
		if hop.Location != "" {
			fmt.Fprintf(&output, "  -> %s", hop.Location)
		}
		output.WriteByte('\n')
	}
	if report.FinalURL != "" {
		fmt.Fprintf(
			&output,
			"Final: %s  HTTP %d  %d ms\n",
			report.FinalURL,
			report.FinalStatusCode,
			report.TotalDurationMS,
		)
	}
	if report.UsedGETFallback {
		output.WriteString("GET fallback: yes\n")
	}
	_, err := io.WriteString(writer, output.String())
	return err
}
