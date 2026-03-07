//go:build desktop

package widgets

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

// MetricCard is a custom widget for displaying metric information
type MetricCard struct {
	widget.BaseWidget

	title     string
	value     string
	subtitle  string
	bgColor   color.Color
	textColor color.Color

	titleLabel    *canvas.Text
	valueLabel    *canvas.Text
	subtitleLabel *canvas.Text
	background    *canvas.Rectangle
	container     *fyne.Container
}

// NewMetricCard creates a new metric card
func NewMetricCard(title, value, subtitle string, bgColor color.Color) *MetricCard {
	mc := &MetricCard{
		title:     title,
		value:     value,
		subtitle:  subtitle,
		bgColor:   bgColor,
		textColor: color.White,
	}
	mc.ExtendBaseWidget(mc)
	return mc
}

// CreateRenderer returns the widget renderer
func (mc *MetricCard) CreateRenderer() fyne.WidgetRenderer {
	mc.background = canvas.NewRectangle(mc.bgColor)
	mc.background.CornerRadius = 8

	mc.titleLabel = canvas.NewText(mc.title, mc.textColor)
	mc.titleLabel.TextSize = 12
	mc.titleLabel.TextStyle = fyne.TextStyle{Bold: true}

	mc.valueLabel = canvas.NewText(mc.value, mc.textColor)
	mc.valueLabel.TextSize = 28
	mc.valueLabel.TextStyle = fyne.TextStyle{Bold: true}

	mc.subtitleLabel = canvas.NewText(mc.subtitle, mc.textColor)
	mc.subtitleLabel.TextSize = 10

	content := container.NewVBox(
		mc.titleLabel,
		mc.valueLabel,
		mc.subtitleLabel,
	)

	mc.container = container.NewPadded(content)

	return &metricCardRenderer{
		card:       mc,
		background: mc.background,
		container:  mc.container,
	}
}

// SetValue updates the metric value
func (mc *MetricCard) SetValue(value string) {
	mc.value = value
	if mc.valueLabel != nil {
		mc.valueLabel.Text = value
		mc.valueLabel.Refresh()
	}
}

// SetSubtitle updates the subtitle
func (mc *MetricCard) SetSubtitle(subtitle string) {
	mc.subtitle = subtitle
	if mc.subtitleLabel != nil {
		mc.subtitleLabel.Text = subtitle
		mc.subtitleLabel.Refresh()
	}
}

type metricCardRenderer struct {
	card       *MetricCard
	background *canvas.Rectangle
	container  *fyne.Container
}

func (r *metricCardRenderer) Layout(size fyne.Size) {
	r.background.Resize(size)
	r.container.Resize(size)
}

func (r *metricCardRenderer) MinSize() fyne.Size {
	return fyne.NewSize(150, 100)
}

func (r *metricCardRenderer) Refresh() {
	r.background.FillColor = r.card.bgColor
	r.background.Refresh()
	canvas.Refresh(r.card)
}

func (r *metricCardRenderer) Objects() []fyne.CanvasObject {
	return []fyne.CanvasObject{r.background, r.container}
}

func (r *metricCardRenderer) Destroy() {}

// Predefined colors for metrics
var (
	ColorBlue   = color.RGBA{R: 0x1E, G: 0x88, B: 0xE5, A: 0xFF}
	ColorGreen  = color.RGBA{R: 0x4C, G: 0xAF, B: 0x50, A: 0xFF}
	ColorOrange = color.RGBA{R: 0xFF, G: 0x98, B: 0x00, A: 0xFF}
	ColorRed    = color.RGBA{R: 0xF4, G: 0x43, B: 0x36, A: 0xFF}
	ColorPurple = color.RGBA{R: 0x9C, G: 0x27, B: 0xB0, A: 0xFF}
)

// NewClickableCard creates a metric card with click handler
func NewClickableCard(title, value, subtitle string, bgColor color.Color, onClick func()) *fyne.Container {
	card := NewMetricCard(title, value, subtitle, bgColor)

	button := widget.NewButton("", onClick)
	button.Importance = widget.LowImportance

	// Overlay the button on the card
	return container.NewStack(
		card,
		container.NewPadded(button),
	)
}

// CreateMetricCardGrid creates a grid of metric cards
func CreateMetricCardGrid(cards ...*MetricCard) *fyne.Container {
	objects := make([]fyne.CanvasObject, len(cards))
	for i, card := range cards {
		objects[i] = card
	}
	return container.NewGridWithColumns(len(cards), objects...)
}
