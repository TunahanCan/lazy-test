//go:build desktop

package widgets

import (
	"strings"
	"testing"
)

func TestWindowPoints(t *testing.T) {
	in := []DataPoint{{X: 0, Y: 1}, {X: 1, Y: 2}, {X: 2, Y: 3}, {X: 3, Y: 4}}
	out := WindowPoints(in, 2)
	if len(out) != 2 {
		t.Fatalf("expected 2 points, got %d", len(out))
	}
	if out[0].Y != 3 || out[1].Y != 4 {
		t.Fatalf("unexpected points: %+v", out)
	}
}

func TestTopStatusBarsLimit(t *testing.T) {
	bars := TopStatusBars(map[int]int{500: 3, 200: 9, 404: 2}, 2)
	if len(bars) != 2 {
		t.Fatalf("expected 2 bars, got %d", len(bars))
	}
	if bars[0].Code != 200 || bars[1].Code != 404 {
		t.Fatalf("unexpected order: %+v", bars)
	}
}

func TestClipLines(t *testing.T) {
	lines := []string{"a", "b", "c", "d"}
	clipped := ClipLines(lines, 2)
	if len(clipped) != 2 || clipped[0] != "c" || clipped[1] != "d" {
		t.Fatalf("unexpected clipped lines: %+v", clipped)
	}
}

func TestSafeDiffText(t *testing.T) {
	text := strings.Repeat("x", 32)
	out := SafeDiffText(text, 8)
	if !strings.Contains(out, "truncated") {
		t.Fatalf("expected truncation marker, got %q", out)
	}
}
