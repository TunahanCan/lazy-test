//go:build desktop

package styles

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/theme"
)

// DesktopTheme is the Fyne theme for LazyTest desktop.
type DesktopTheme struct {
	base fyne.Theme
}

func NewDesktopTheme() fyne.Theme {
	return &DesktopTheme{base: theme.DefaultTheme()}
}

func (t *DesktopTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNamePrimary:
		return color.RGBA{R: 0x0B, G: 0x72, B: 0xD9, A: 0xFF}
	case theme.ColorNameForeground:
		if variant == theme.VariantDark {
			return color.RGBA{R: 0xE7, G: 0xEC, B: 0xF3, A: 0xFF}
		}
		return color.RGBA{R: 0x15, G: 0x26, B: 0x38, A: 0xFF}
	case theme.ColorNameBackground:
		if variant == theme.VariantDark {
			return color.RGBA{R: 0x0F, G: 0x17, B: 0x21, A: 0xFF}
		}
		return color.RGBA{R: 0xF5, G: 0xF8, B: 0xFC, A: 0xFF}
	case theme.ColorNameError:
		return color.RGBA{R: 0xD9, G: 0x2C, B: 0x2C, A: 0xFF}
	case theme.ColorNameWarning:
		return color.RGBA{R: 0xE2, G: 0x8A, B: 0x14, A: 0xFF}
	case theme.ColorNameSuccess:
		return color.RGBA{R: 0x1F, G: 0x9D, B: 0x55, A: 0xFF}
	}
	return t.base.Color(name, variant)
}

func (t *DesktopTheme) Font(style fyne.TextStyle) fyne.Resource {
	return t.base.Font(style)
}

func (t *DesktopTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return t.base.Icon(name)
}

func (t *DesktopTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNamePadding:
		return 10
	case theme.SizeNameText:
		return 13
	}
	return t.base.Size(name)
}
