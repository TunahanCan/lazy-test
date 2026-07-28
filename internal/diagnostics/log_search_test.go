package diagnostics

import (
	"strings"
	"testing"
)

func TestSearchTraceLogReportsOnlyActuallyScannedLines(t *testing.T) {
	t.Parallel()

	text := "trace=target first\nno match\ntrace=target second\ntrace=target omitted\nnever scanned\n"
	result, err := SearchTraceLog(text, "target", LogSearchOptions{MaxResults: 2})
	if err != nil {
		t.Fatalf("SearchTraceLog() error = %v", err)
	}
	if !result.Truncated {
		t.Fatal("Truncated = false, want true")
	}
	if result.ScannedLines != 4 {
		t.Fatalf("ScannedLines = %d, want 4", result.ScannedLines)
	}
	if len(result.Matches) != 2 {
		t.Fatalf("len(Matches) = %d, want 2", len(result.Matches))
	}
}

func TestSearchTraceLogStreamsCRLFAndTrailingEmptyLine(t *testing.T) {
	t.Parallel()

	result, err := SearchTraceLog("skip\r\nTRACE=target\r\n", "target", LogSearchOptions{})
	if err != nil {
		t.Fatalf("SearchTraceLog() error = %v", err)
	}
	if result.ScannedLines != 3 {
		t.Fatalf("ScannedLines = %d, want 3", result.ScannedLines)
	}
	if len(result.Matches) != 1 {
		t.Fatalf("len(Matches) = %d, want 1", len(result.Matches))
	}
	if result.Matches[0].LineNumber != 2 || result.Matches[0].Line != "TRACE=target" {
		t.Fatalf("Matches[0] = %#v, want CRLF-free line 2", result.Matches[0])
	}
}

func TestSearchTraceLogCaseInsensitiveMatcherHandlesUnicodeWithoutLineCopies(t *testing.T) {
	t.Parallel()

	result, err := SearchTraceLog("trace=İD-42\ntrace=id-42\ntrace=ſd-42", "id-42", LogSearchOptions{})
	if err != nil {
		t.Fatalf("SearchTraceLog() error = %v", err)
	}
	if len(result.Matches) != 2 || result.Matches[0].LineNumber != 1 || result.Matches[1].LineNumber != 2 {
		t.Fatalf("Matches = %#v, want Unicode lowercase-equivalent lines 1 and 2", result.Matches)
	}
}

func TestSearchTraceLogPreservesStandaloneCarriageReturn(t *testing.T) {
	t.Parallel()

	result, err := SearchTraceLog("trace=target\r", "target", LogSearchOptions{})
	if err != nil {
		t.Fatalf("SearchTraceLog() error = %v", err)
	}
	if len(result.Matches) != 1 || result.Matches[0].Line != "trace=target\r" {
		t.Fatalf("Matches = %#v, want the standalone carriage return preserved", result.Matches)
	}
}

func TestSearchTraceLogHandlesLargeSingleLineAndBoundsReturnedText(t *testing.T) {
	t.Parallel()

	text := strings.Repeat("x", 1<<20) + " TARGET"
	result, err := SearchTraceLog(text, "target", LogSearchOptions{MaxLineBytes: 32})
	if err != nil {
		t.Fatalf("SearchTraceLog() error = %v", err)
	}
	if result.ScannedLines != 1 || len(result.Matches) != 1 {
		t.Fatalf("unexpected result: %#v", result)
	}
	if len(result.Matches[0].Line) > 35 {
		t.Fatalf("len(Matches[0].Line) = %d, want a bounded UTF-8 line", len(result.Matches[0].Line))
	}
}
