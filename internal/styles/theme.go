// Package styles defines LazyGit-like colors and frame settings for the TUI.
package styles

import (
	"github.com/jroimartin/gocui"
)

// Colors for a high-contrast terminal theme with calmer accents.
const (
	FrameFg          = gocui.ColorCyan
	FrameBg          = gocui.ColorDefault
	ViewBg           = gocui.ColorDefault
	ViewFg           = gocui.ColorWhite
	SelBg            = gocui.ColorGreen
	SelFg            = gocui.ColorBlack
	StatusOK         = gocui.ColorGreen
	StatusFail       = gocui.ColorRed
	StatusDrift      = gocui.ColorYellow
	StatusInProgress = gocui.ColorCyan
	ErrorFg          = gocui.ColorRed
)

// Frame returns frame color attributes for a view.
func Frame() (fg, bg gocui.Attribute) {
	return FrameFg, FrameBg
}

// Highlight returns attributes for selected row.
func Highlight() (fg, bg gocui.Attribute) {
	return SelFg, SelBg
}
