//go:build desktop

package widgets

import (
	"fmt"
	"image/color"
	"sort"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

type StatusBar struct {
	Code  int
	Count int
}

// TopStatusBars returns sorted status bars.
func TopStatusBars(statuses map[int]int, maxBars int) []StatusBar {
	bars := make([]StatusBar, 0, len(statuses))
	for code, count := range statuses {
		bars = append(bars, StatusBar{Code: code, Count: count})
	}
	sort.Slice(bars, func(i, j int) bool { return bars[i].Code < bars[j].Code })
	if maxBars > 0 && len(bars) > maxBars {
		bars = bars[:maxBars]
	}
	return bars
}

// BarChart shows status distribution as simple bars.
type BarChart struct {
	widget.BaseWidget
	statuses map[int]int
	maxBars  int
	root     *fyne.Container
}

func NewBarChart(maxBars int) *BarChart {
	if maxBars <= 0 {
		maxBars = 8
	}
	b := &BarChart{maxBars: maxBars, statuses: map[int]int{}}
	b.ExtendBaseWidget(b)
	return b
}

func (b *BarChart) SetStatuses(statuses map[int]int) {
	b.statuses = map[int]int{}
	for k, v := range statuses {
		b.statuses[k] = v
	}
	b.Refresh()
}

func (b *BarChart) CreateRenderer() fyne.WidgetRenderer {
	b.root = container.NewVBox(widget.NewLabel("No data"))
	return widget.NewSimpleRenderer(b.root)
}

func (b *BarChart) Refresh() {
	if b.root == nil {
		return
	}
	bars := TopStatusBars(b.statuses, b.maxBars)
	if len(bars) == 0 {
		b.root.Objects = []fyne.CanvasObject{widget.NewLabel("No status distribution yet")}
		b.root.Refresh()
		return
	}
	maxV := 1
	for _, bar := range bars {
		if bar.Count > maxV {
			maxV = bar.Count
		}
	}
	objs := make([]fyne.CanvasObject, 0, len(bars))
	for _, bar := range bars {
		w := float32(bar.Count) / float32(maxV)
		if w < 0.05 {
			w = 0.05
		}
		rect := canvas.NewRectangle(color.RGBA{R: 0x4B, G: 0x85, B: 0xD1, A: 0xFF})
		rect.SetMinSize(fyne.NewSize(180*w, 18))
		objs = append(objs, container.NewHBox(
			widget.NewLabelWithStyle(fmt.Sprintf("%d", bar.Code), fyne.TextAlignLeading, fyne.TextStyle{Monospace: true}),
			rect,
			widget.NewLabel(fmt.Sprintf("%d", bar.Count)),
		))
	}
	b.root.Objects = objs
	b.root.Refresh()
}
