// Package styles defines LazyGit-like colors and frame settings for the TUI.
package styles

import (
	"github.com/jroimartin/gocui"
)

// Colors: dark background, yellow frame, status colors.
const (
	FrameFg     = gocui.ColorYellow
	FrameBg     = gocui.ColorDefault
	ViewBg      = gocui.ColorDefault
	ViewFg      = gocui.ColorWhite
	SelBg       = gocui.ColorCyan
	SelFg       = gocui.ColorBlack
	StatusOK    = gocui.ColorGreen
	StatusFail  = gocui.ColorRed
	StatusDrift = gocui.ColorYellow
	StatusInProgress = gocui.ColorGreen
	ErrorFg     = gocui.ColorRed
)

// Frame returns frame color attributes for a view (yellow border).
func Frame() (fg, bg gocui.Attribute) {
	return FrameFg, FrameBg
}

// Highlight returns attributes for selected row.
func Highlight() (fg, bg gocui.Attribute) {
	return SelFg, SelBg
}
