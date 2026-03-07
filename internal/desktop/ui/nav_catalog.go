//go:build desktop

package ui

// NavOption is a single selectable destination in navigation/menu.
type NavOption struct {
	ID    string
	Label string
}

var viewNavOptions = []NavOption{
	{ID: "Dashboard", Label: "Dashboard"},
	{ID: "Workspace", Label: "Workspace"},
	{ID: "Explorer", Label: "Explorer"},
	{ID: "Smoke", Label: "Smoke"},
	{ID: "Drift", Label: "Drift"},
	{ID: "Compare", Label: "Compare"},
	{ID: "LoadTests", Label: "Load Tests"},
	{ID: "LiveMetrics", Label: "Live Metrics"},
	{ID: "Logs", Label: "Logs"},
	{ID: "Reports", Label: "Reports"},
}

var systemNavOptions = []NavOption{
	{ID: "LoadSpec", Label: "Load Spec"},
	{ID: "About", Label: "About"},
	{ID: "Quit", Label: "Quit"},
}

// ViewNavOptions returns all View section options.
func ViewNavOptions() []NavOption {
	return append([]NavOption(nil), viewNavOptions...)
}

// SystemNavOptions returns all System section options.
func SystemNavOptions() []NavOption {
	return append([]NavOption(nil), systemNavOptions...)
}
