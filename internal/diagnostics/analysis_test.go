package diagnostics

import (
	"strings"
	"testing"
)

func TestAnalyzeThreadDumpFindsStatesDeadlockAndRepeatedStacks(t *testing.T) {
	t.Parallel()
	dump := `"worker-1" #1
   java.lang.Thread.State: BLOCKED (on object monitor)
        at com.example.OrderService.load(OrderService.java:42)
        at com.example.Worker.run(Worker.java:10)
        - waiting to lock <0x1> (a java.lang.Object)

"worker-2" #2
   java.lang.Thread.State: WAITING (parking)
        at com.example.OrderService.load(OrderService.java:99)
        at com.example.Worker.run(Worker.java:11)
        - parking to wait for <0x2>

"http-1" #3
   java.lang.Thread.State: RUNNABLE
        at com.example.HttpHandler.handle(HttpHandler.java:8)

Found one Java-level deadlock:
"worker-1":
  which is held by "worker-2"
`
	report, err := AnalyzeThreadDump(dump, ThreadDumpOptions{})
	if err != nil {
		t.Fatalf("AnalyzeThreadDump() error = %v", err)
	}
	if report.ThreadCount != 3 {
		t.Fatalf("ThreadCount = %d, want 3", report.ThreadCount)
	}
	if report.StateCounts["BLOCKED"] != 1 || report.StateCounts["WAITING"] != 1 || report.StateCounts["RUNNABLE"] != 1 {
		t.Fatalf("unexpected state counts: %#v", report.StateCounts)
	}
	if !report.DeadlockDetected || len(report.DeadlockClues) == 0 {
		t.Fatalf("deadlock not detected: %#v", report)
	}
	if len(report.BlockedThreads) != 2 {
		t.Fatalf("blocked/contention threads = %#v, want 2", report.BlockedThreads)
	}
	if len(report.RepeatedStacks) != 1 || report.RepeatedStacks[0].Count != 2 {
		t.Fatalf("repeated stacks = %#v, want one group of two", report.RepeatedStacks)
	}
}

func TestAnalyzeThreadDumpDoesNotTreatNoDeadlocksAsDeadlock(t *testing.T) {
	t.Parallel()
	report, err := AnalyzeThreadDump("No deadlocks found.\n", ThreadDumpOptions{})
	if err != nil {
		t.Fatalf("AnalyzeThreadDump() error = %v", err)
	}
	if report.DeadlockDetected {
		t.Fatal("no-deadlock marker produced a false positive")
	}
}

func TestAnalyzeThreadDumpEnforcesInputLimit(t *testing.T) {
	t.Parallel()
	_, err := AnalyzeThreadDump(strings.Repeat("x", 11), ThreadDumpOptions{MaxInputBytes: 10})
	if ErrorCode(err) != CodeLimitExceeded {
		t.Fatalf("error code = %q, want %q", ErrorCode(err), CodeLimitExceeded)
	}
}

func TestSearchTraceLogIsBoundedAndCaseInsensitiveByDefault(t *testing.T) {
	t.Parallel()
	text := "INFO no match\nINFO traceId=ABC-123 first\nWARN traceid=abc-123 " + strings.Repeat("x", 40) + "\nINFO traceId=ABC-123 third"
	result, err := SearchTraceLog(text, "abc-123", LogSearchOptions{MaxResults: 2, MaxLineBytes: 32})
	if err != nil {
		t.Fatalf("SearchTraceLog() error = %v", err)
	}
	if len(result.Matches) != 2 || !result.Truncated {
		t.Fatalf("unexpected search result: %#v", result)
	}
	if result.Matches[0].LineNumber != 2 || len(result.Matches[1].Line) > 35 {
		t.Fatalf("unexpected bounded matches: %#v", result.Matches)
	}

	caseSensitive, err := SearchTraceLog(text, "abc-123", LogSearchOptions{CaseSensitive: true})
	if err != nil {
		t.Fatalf("case-sensitive SearchTraceLog() error = %v", err)
	}
	if len(caseSensitive.Matches) != 1 || caseSensitive.Matches[0].LineNumber != 3 {
		t.Fatalf("unexpected case-sensitive matches: %#v", caseSensitive.Matches)
	}
}

func TestSearchTraceLogRejectsOversizedInput(t *testing.T) {
	t.Parallel()
	_, err := SearchTraceLog("trace=123", "123", LogSearchOptions{MaxInputBytes: 4})
	if ErrorCode(err) != CodeLimitExceeded {
		t.Fatalf("error code = %q, want %q", ErrorCode(err), CodeLimitExceeded)
	}
}
