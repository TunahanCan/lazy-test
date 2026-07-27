package diagnostics

import (
	"regexp"
	"sort"
	"strings"
)

const (
	defaultThreadDumpBytes = 8 << 20
	maxThreadDumpBytes     = 32 << 20
	defaultMaxThreads      = 20_000
	maxThreadCount         = 100_000
	defaultTopStackGroups  = 10
	maxTopStackGroups      = 100
	defaultTopFrames       = 6
	maxTopFrames           = 32
	defaultMaxThreadIssues = 500
)

var stackLineNumberPattern = regexp.MustCompile(`:\d+\)`)

// ThreadDumpOptions sets memory and result limits for text analysis.
type ThreadDumpOptions struct {
	MaxInputBytes    int
	MaxThreads       int
	MaxIssues        int
	TopStackGroups   int
	FingerprintDepth int
}

// ThreadIssue describes a blocked or lock-contended Java thread.
type ThreadIssue struct {
	Name  string   `json:"name"`
	State string   `json:"state"`
	Clues []string `json:"clues,omitempty"`
}

// RepeatedStack groups threads that share the same leading stack frames.
type RepeatedStack struct {
	Count   int      `json:"count"`
	Frames  []string `json:"frames"`
	Threads []string `json:"threads"`
}

// ThreadDumpReport summarizes a JVM text thread dump without contacting the
// target JVM.
type ThreadDumpReport struct {
	ThreadCount      int             `json:"threadCount"`
	StateCounts      map[string]int  `json:"stateCounts"`
	BlockedThreads   []ThreadIssue   `json:"blockedThreads,omitempty"`
	DeadlockDetected bool            `json:"deadlockDetected"`
	DeadlockClues    []string        `json:"deadlockClues,omitempty"`
	RepeatedStacks   []RepeatedStack `json:"repeatedStacks,omitempty"`
	Truncated        bool            `json:"truncated"`
}

type parsedThread struct {
	name   string
	state  string
	frames []string
	clues  []string
}

// AnalyzeThreadDump extracts thread states, lock clues, explicit JVM deadlock
// markers, and the most common leading stacks.
func AnalyzeThreadDump(text string, options ThreadDumpOptions) (ThreadDumpReport, error) {
	maxInputBytes := options.MaxInputBytes
	if maxInputBytes == 0 {
		maxInputBytes = defaultThreadDumpBytes
	}
	if maxInputBytes < 1 || maxInputBytes > maxThreadDumpBytes {
		return ThreadDumpReport{}, invalidInput("The thread dump size limit is outside the supported range.", "Use a limit from 1 byte through 32 MiB.")
	}
	if len(text) > maxInputBytes {
		return ThreadDumpReport{}, limitExceeded("The thread dump is too large to inspect safely.", "Capture a smaller dump or increase the limit up to 32 MiB.")
	}
	maxThreads := options.MaxThreads
	if maxThreads == 0 {
		maxThreads = defaultMaxThreads
	}
	if maxThreads < 1 || maxThreads > maxThreadCount {
		return ThreadDumpReport{}, invalidInput("The thread count limit is outside the supported range.", "Use a limit from 1 through 100000 threads.")
	}
	maxIssues := options.MaxIssues
	if maxIssues == 0 {
		maxIssues = defaultMaxThreadIssues
	}
	if maxIssues < 1 || maxIssues > 5_000 {
		return ThreadDumpReport{}, invalidInput("The thread issue limit is outside the supported range.", "Use a limit from 1 through 5000 issues.")
	}
	topGroups := options.TopStackGroups
	if topGroups == 0 {
		topGroups = defaultTopStackGroups
	}
	if topGroups < 1 || topGroups > maxTopStackGroups {
		return ThreadDumpReport{}, invalidInput("The repeated stack limit is outside the supported range.", "Use a limit from 1 through 100 groups.")
	}
	fingerprintDepth := options.FingerprintDepth
	if fingerprintDepth == 0 {
		fingerprintDepth = defaultTopFrames
	}
	if fingerprintDepth < 1 || fingerprintDepth > maxTopFrames {
		return ThreadDumpReport{}, invalidInput("The stack fingerprint depth is outside the supported range.", "Use from 1 through 32 leading frames.")
	}

	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	report := ThreadDumpReport{StateCounts: make(map[string]int)}
	threads := make([]parsedThread, 0, min(len(lines)/5, maxThreads))
	var current *parsedThread
	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if name, ok := threadHeaderName(line); ok {
			if current != nil {
				threads = append(threads, *current)
				if len(threads) >= maxThreads {
					report.Truncated = true
					current = nil
					break
				}
			}
			current = &parsedThread{name: name}
			continue
		}
		if line == "" && current != nil {
			threads = append(threads, *current)
			current = nil
			if len(threads) >= maxThreads {
				report.Truncated = true
				break
			}
			continue
		}
		if explicitDeadlockMarker(line) {
			if current != nil {
				threads = append(threads, *current)
				current = nil
				if len(threads) >= maxThreads {
					report.Truncated = true
				}
			}
			report.DeadlockDetected = true
		}
		if isDeadlockClue(line) && len(report.DeadlockClues) < 100 {
			report.DeadlockClues = append(report.DeadlockClues, truncateUTF8(line, 500))
		}
		if current == nil {
			continue
		}
		if state := parseThreadState(line); state != "" {
			current.state = state
		}
		if strings.HasPrefix(line, "at ") {
			if len(current.frames) < maxTopFrames {
				current.frames = append(current.frames, normalizeStackFrame(line))
			}
		}
		if isContentionClue(line) && len(current.clues) < 12 {
			current.clues = append(current.clues, truncateUTF8(line, 500))
		}
	}
	if current != nil && len(threads) < maxThreads {
		threads = append(threads, *current)
	}

	report.ThreadCount = len(threads)
	for _, thread := range threads {
		state := thread.state
		if state == "" {
			state = "UNKNOWN"
		}
		report.StateCounts[state]++
		if (state == "BLOCKED" || len(thread.clues) > 0) && len(report.BlockedThreads) < maxIssues {
			report.BlockedThreads = append(report.BlockedThreads, ThreadIssue{
				Name:  thread.name,
				State: state,
				Clues: thread.clues,
			})
		} else if (state == "BLOCKED" || len(thread.clues) > 0) && len(report.BlockedThreads) >= maxIssues {
			report.Truncated = true
		}
	}
	report.RepeatedStacks = repeatedStackGroups(threads, fingerprintDepth, topGroups)
	if len(report.DeadlockClues) == 100 {
		report.Truncated = true
	}
	return report, nil
}

func threadHeaderName(line string) (string, bool) {
	if len(line) < 2 || line[0] != '"' {
		return "", false
	}
	end := strings.IndexByte(line[1:], '"')
	if end < 0 {
		return "", false
	}
	suffix := strings.TrimSpace(line[end+2:])
	if strings.HasPrefix(suffix, ":") {
		return "", false
	}
	return line[1 : end+1], true
}

func parseThreadState(line string) string {
	const marker = "java.lang.Thread.State:"
	index := strings.Index(line, marker)
	if index < 0 {
		return ""
	}
	state := strings.TrimSpace(line[index+len(marker):])
	if separator := strings.IndexAny(state, " ("); separator >= 0 {
		state = state[:separator]
	}
	return strings.ToUpper(strings.TrimSpace(state))
}

func normalizeStackFrame(line string) string {
	line = strings.Join(strings.Fields(line), " ")
	return stackLineNumberPattern.ReplaceAllString(line, ":line)")
}

func explicitDeadlockMarker(line string) bool {
	lower := strings.ToLower(line)
	if strings.Contains(lower, "no deadlock") || strings.Contains(lower, "0 deadlock") {
		return false
	}
	return strings.Contains(lower, "found one java-level deadlock") ||
		strings.Contains(lower, "deadlock detected") ||
		(strings.Contains(lower, "found a total of") && strings.Contains(lower, "deadlock"))
}

func isContentionClue(line string) bool {
	lower := strings.ToLower(line)
	return strings.Contains(lower, "waiting to lock") ||
		strings.Contains(lower, "waiting for monitor entry") ||
		strings.Contains(lower, "parking to wait for") ||
		strings.Contains(lower, "which is held by")
}

func isDeadlockClue(line string) bool {
	lower := strings.ToLower(line)
	return explicitDeadlockMarker(line) ||
		strings.Contains(lower, "waiting to lock") ||
		strings.Contains(lower, "which is held by")
}

func repeatedStackGroups(threads []parsedThread, depth, limit int) []RepeatedStack {
	type group struct {
		frames  []string
		threads []string
		count   int
	}
	groups := make(map[string]*group)
	for _, thread := range threads {
		frameCount := min(len(thread.frames), depth)
		if frameCount == 0 {
			continue
		}
		frames := append([]string(nil), thread.frames[:frameCount]...)
		fingerprint := strings.Join(frames, "\n")
		item := groups[fingerprint]
		if item == nil {
			item = &group{frames: frames}
			groups[fingerprint] = item
		}
		item.count++
		if len(item.threads) < 100 {
			item.threads = append(item.threads, thread.name)
		}
	}
	result := make([]RepeatedStack, 0, len(groups))
	for _, item := range groups {
		if item.count < 2 {
			continue
		}
		sort.Strings(item.threads)
		result = append(result, RepeatedStack{
			Count:   item.count,
			Frames:  item.frames,
			Threads: item.threads,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Count == result[j].Count {
			return strings.Join(result[i].Frames, "\n") < strings.Join(result[j].Frames, "\n")
		}
		return result[i].Count > result[j].Count
	})
	if len(result) > limit {
		result = result[:limit]
	}
	return result
}
