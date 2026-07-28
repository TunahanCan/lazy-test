package diagnostics

import (
	"strings"
	"unicode"
)

const (
	defaultMaxLogBytes   = 4 << 20
	maxLogBytes          = 32 << 20
	defaultMaxLogResults = 100
	maxLogResults        = 1_000
	defaultMaxLogLine    = 8 << 10
	maxLogLine           = 64 << 10
)

type logSearchMode string

const (
	logSearchCaseInsensitive logSearchMode = "case_insensitive"
	logSearchCaseSensitive   logSearchMode = "case_sensitive"
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
	Query   string     `json:"query"`
	Matches []LogMatch `json:"matches"`
	// ScannedLines reports the number of lines actually inspected. A truncated
	// search stops after the first matching line that cannot be retained.
	ScannedLines int  `json:"scannedLines"`
	Truncated    bool `json:"truncated"`
}

type logLineMatcher interface {
	Contains(line string) bool
}

type exactLogLineMatcher string

func (m exactLogLineMatcher) Contains(line string) bool {
	return strings.Contains(line, string(m))
}

// foldedLogLineMatcher uses a prefix table so case-insensitive matching stays
// linear without allocating a lower-cased copy of every log line.
type foldedLogLineMatcher struct {
	pattern []rune
	prefix  []int
}

func newFoldedLogLineMatcher(query string) foldedLogLineMatcher {
	pattern := make([]rune, 0, len(query))
	for _, value := range query {
		pattern = append(pattern, unicode.ToLower(value))
	}
	prefix := make([]int, len(pattern))
	for index, matched := 1, 0; index < len(pattern); {
		if pattern[index] == pattern[matched] {
			matched++
			prefix[index] = matched
			index++
			continue
		}
		if matched > 0 {
			matched = prefix[matched-1]
			continue
		}
		index++
	}
	return foldedLogLineMatcher{pattern: pattern, prefix: prefix}
}

func (m foldedLogLineMatcher) Contains(line string) bool {
	matched := 0
	for _, value := range line {
		value = unicode.ToLower(value)
		for matched > 0 && value != m.pattern[matched] {
			matched = m.prefix[matched-1]
		}
		if value != m.pattern[matched] {
			continue
		}
		matched++
		if matched == len(m.pattern) {
			return true
		}
	}
	return false
}

func newLogLineMatcher(query string, mode logSearchMode) logLineMatcher {
	if mode == logSearchCaseSensitive {
		return exactLogLineMatcher(query)
	}
	return newFoldedLogLineMatcher(query)
}

// logLineCursor returns slices backed by the original text. It deliberately
// mirrors strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n"),
// including its final empty line, without copying the complete input.
type logLineCursor struct {
	text       string
	nextOffset int
	done       bool
	lineNumber int
}

func (c *logLineCursor) Next() (line string, lineNumber int, ok bool) {
	if c.done {
		return "", 0, false
	}

	start := c.nextOffset
	newlineOffset := strings.IndexByte(c.text[start:], '\n')
	hasNewline := newlineOffset >= 0
	if newlineOffset < 0 {
		c.done = true
		line = c.text[start:]
	} else {
		end := start + newlineOffset
		line = c.text[start:end]
		c.nextOffset = end + 1
	}
	if hasNewline && strings.HasSuffix(line, "\r") {
		line = line[:len(line)-1]
	}

	c.lineNumber++
	return line, c.lineNumber, true
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

	mode := logSearchCaseInsensitive
	if options.CaseSensitive {
		mode = logSearchCaseSensitive
	}
	matcher := newLogLineMatcher(query, mode)
	cursor := logLineCursor{text: text}
	result := LogSearchResult{Query: query}
	for {
		line, lineNumber, ok := cursor.Next()
		if !ok {
			break
		}
		result.ScannedLines++
		if !matcher.Contains(line) {
			continue
		}
		if len(result.Matches) >= maxResults {
			result.Truncated = true
			break
		}
		result.Matches = append(result.Matches, LogMatch{
			LineNumber: lineNumber,
			Line:       truncateUTF8(line, maxLineBytes),
		})
	}
	return result, nil
}
