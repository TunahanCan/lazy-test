//go:build desktop

package widgets

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/widget"
)

// DataPoint is a point in the chart.
type DataPoint struct {
	X float64
	Y float64
}

// WindowPoints returns a bounded window of points.
func WindowPoints(points []DataPoint, max int) []DataPoint {
	if max <= 0 || len(points) <= max {
		return append([]DataPoint(nil), points...)
	}
	return append([]DataPoint(nil), points[len(points)-max:]...)
}

// LineChart is a lightweight canvas-based line chart.
type LineChart struct {
	widget.BaseWidget
	points []DataPoint
	max    int
	line   color.Color
}

func NewLineChart(maxPoints int) *LineChart {
	if maxPoints <= 0 {
		maxPoints = 120
	}
	c := &LineChart{max: maxPoints, line: color.RGBA{R: 0x0B, G: 0x72, B: 0xD9, A: 0xFF}}
	c.ExtendBaseWidget(c)
	return c
}

func (c *LineChart) SetPoints(points []DataPoint) {
	c.points = WindowPoints(points, c.max)
	c.Refresh()
}

func (c *LineChart) Points() []DataPoint {
	return append([]DataPoint(nil), c.points...)
}

func (c *LineChart) CreateRenderer() fyne.WidgetRenderer {
	bg := canvas.NewRectangle(color.RGBA{R: 0xF0, G: 0xF3, B: 0xF8, A: 0xFF})
	return &lineChartRenderer{chart: c, bg: bg, lines: []*canvas.Line{}}
}

type lineChartRenderer struct {
	chart *LineChart
	bg    *canvas.Rectangle
	lines []*canvas.Line
}

func (r *lineChartRenderer) Layout(size fyne.Size) {
	r.bg.Resize(size)
}

func (r *lineChartRenderer) MinSize() fyne.Size {
	return fyne.NewSize(220, 120)
}

func (r *lineChartRenderer) Refresh() {
	r.lines = []*canvas.Line{}
	pts := r.chart.points
	if len(pts) < 2 {
		canvas.Refresh(r.chart)
		return
	}

	minY := pts[0].Y
	maxY := pts[0].Y
	for _, p := range pts {
		if p.Y < minY {
			minY = p.Y
		}
		if p.Y > maxY {
			maxY = p.Y
		}
	}
	if maxY == minY {
		maxY = minY + 1
	}

	sz := r.chart.Size()
	w := float64(sz.Width)
	h := float64(sz.Height)
	for i := 1; i < len(pts); i++ {
		x1 := float32(float64(i-1) / float64(len(pts)-1) * w)
		x2 := float32(float64(i) / float64(len(pts)-1) * w)
		y1 := float32(h - ((pts[i-1].Y-minY)/(maxY-minY))*h)
		y2 := float32(h - ((pts[i].Y-minY)/(maxY-minY))*h)
		ln := canvas.NewLine(r.chart.line)
		ln.StrokeWidth = 2
		ln.Position1 = fyne.NewPos(x1, y1)
		ln.Position2 = fyne.NewPos(x2, y2)
		r.lines = append(r.lines, ln)
	}
	canvas.Refresh(r.chart)
}

func (r *lineChartRenderer) Objects() []fyne.CanvasObject {
	out := []fyne.CanvasObject{r.bg}
	for _, ln := range r.lines {
		out = append(out, ln)
	}
	return out
}

func (r *lineChartRenderer) Destroy() {}
