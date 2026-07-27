package diagnostics

import "strings"

const (
	defaultMaxLogBytes   = 4 << 20
	maxLogBytes          = 32 << 20
	defaultMaxLogResults = 100
	maxLogResults        = 1_000
	defaultMaxLogLine    = 8 << 10
	maxLogLine           = 64 << 10
)

// LogSearchOptions bounds in-memory trace/correlation searches.
type LogSearchOptions struct {
	CaseSensitive bool
	MaxInputBytes int
	MaxResults    int
	MaxLineBytes  int
}

// LogMatch identifies one matching line.
type LogMatch struct {
	LineNumber int    `json:"lineNumber"`
	Line       string `json:"line"`
}

// LogSearchResult contains bounded matching lines from caller-provided text.
type LogSearchResult struct {
	Query        string     `json:"query"`
	Matches      []LogMatch `json:"matches"`
	ScannedLines int        `json:"scannedLines"`
	Truncated    bool       `json:"truncated"`
}

// SearchTraceLog performs a literal (non-regex) search for a trace or
// correlation identifier in provided log text.
func SearchTraceLog(text, query string, options LogSearchOptions) (LogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return LogSearchResult{}, invalidInput("The trace or correlation ID is empty.", "Enter an exact ID to search for.")
	}
	if len(query) > 256 {
		return LogSearchResult{}, invalidInput("The trace or correlation ID is too long.", "Use an identifier no longer than 256 characters.")
	}
	maxInputBytes := options.MaxInputBytes
	if maxInputBytes == 0 {
		maxInputBytes = defaultMaxLogBytes
	}
	if maxInputBytes < 1 || maxInputBytes > maxLogBytes {
		return LogSearchResult{}, invalidInput("The log size limit is outside the supported range.", "Use a limit from 1 byte through 32 MiB.")
	}
	if len(text) > maxInputBytes {
		return LogSearchResult{}, limitExceeded("The log text is too large to search safely.", "Provide a smaller log excerpt or increase the limit up to 32 MiB.")
	}
	maxResults := options.MaxResults
	if maxResults == 0 {
		maxResults = defaultMaxLogResults
	}
	if maxResults < 1 || maxResults > maxLogResults {
		return LogSearchResult{}, invalidInput("The log result limit is outside the supported range.", "Use a limit from 1 through 1000 matches.")
	}
	maxLineBytes := options.MaxLineBytes
	if maxLineBytes == 0 {
		maxLineBytes = defaultMaxLogLine
	}
	if maxLineBytes < 1 || maxLineBytes > maxLogLine {
		return LogSearchResult{}, invalidInput("The log line limit is outside the supported range.", "Use a limit from 1 byte through 64 KiB.")
	}

	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	result := LogSearchResult{Query: query, ScannedLines: len(lines)}
	needle := query
	if !options.CaseSensitive {
		needle = strings.ToLower(needle)
	}
	for index, line := range lines {
		haystack := line
		if !options.CaseSensitive {
			haystack = strings.ToLower(haystack)
		}
		if !strings.Contains(haystack, needle) {
			continue
		}
		if len(result.Matches) >= maxResults {
			result.Truncated = true
			break
		}
		result.Matches = append(result.Matches, LogMatch{
			LineNumber: index + 1,
			Line:       truncateUTF8(line, maxLineBytes),
		})
	}
	return result, nil
}
