//go:build desktop

package panels

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"lazytest/internal/appsvc"
)

type ExplorerPanel struct {
	app    DesktopApp
	state  SharedState
	status func(string)

	queryEntry  *widget.Entry
	methodEntry *widget.SelectEntry
	tagEntry    *widget.SelectEntry
	list        *widget.List

	detail   *widget.Label
	headers  *widget.Entry
	body     *widget.Entry
	respMeta *widget.Label
	respBody *widget.Entry

	filtered  []appsvc.EndpointDTO
	container fyne.CanvasObject
}

func NewExplorerPanel(app DesktopApp, state SharedState, status func(string)) *ExplorerPanel {
	p := &ExplorerPanel{app: app, state: state, status: status, filtered: []appsvc.EndpointDTO{}}
	p.build()
	state.OnEndpointsChange(func(_ []appsvc.EndpointDTO) { p.refreshFilter() })
	return p
}

func (p *ExplorerPanel) build() {
	p.queryEntry = widget.NewEntry()
	p.queryEntry.SetPlaceHolder("path, summary, operationId")
	p.queryEntry.OnChanged = func(string) { p.refreshFilter() }

	p.methodEntry = widget.NewSelectEntry([]string{"", "GET", "POST", "PUT", "PATCH", "DELETE"})
	p.methodEntry.SetPlaceHolder("method")
	p.methodEntry.OnChanged = func(string) { p.refreshFilter() }

	p.tagEntry = widget.NewSelectEntry([]string{""})
	p.tagEntry.SetPlaceHolder("tag")
	p.tagEntry.OnChanged = func(string) { p.refreshFilter() }

	p.list = widget.NewList(
		func() int { return len(p.filtered) },
		func() fyne.CanvasObject { return widget.NewLabel("endpoint") },
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			if id < 0 || id >= len(p.filtered) {
				obj.(*widget.Label).SetText("")
				return
			}
			ep := p.filtered[id]
			obj.(*widget.Label).SetText(fmt.Sprintf("%s %s", strings.ToUpper(ep.Method), ep.Path))
		},
	)
	p.list.OnSelected = func(id widget.ListItemID) {
		if id < 0 || id >= len(p.filtered) {
			return
		}
		ep := p.filtered[id]
		p.state.SetSelectedEndpoint(&ep)
		p.detail.SetText(fmt.Sprintf("%s\n%s\n%s", ep.ID, ep.OperationID, ep.Summary))
		p.loadExample(ep)
	}

	p.detail = widget.NewLabel("No endpoint selected")
	p.detail.Wrapping = fyne.TextWrapWord
	p.headers = widget.NewMultiLineEntry()
	p.body = widget.NewMultiLineEntry()
	p.respMeta = widget.NewLabel("Response: -")
	p.respBody = widget.NewMultiLineEntry()
	p.respBody.Disable()

	sendBtn := widget.NewButton("Send", p.sendRequest)

	left := container.NewBorder(
		container.NewVBox(container.NewGridWithColumns(3, p.queryEntry, p.methodEntry, p.tagEntry), widget.NewSeparator()),
		nil, nil, nil,
		p.list,
	)

	right := container.NewVBox(
		widget.NewCard("Endpoint Detail", "", p.detail),
		widget.NewCard("Headers (JSON)", "", p.headers),
		widget.NewCard("Body", "", p.body),
		sendBtn,
		widget.NewCard("Response", p.respMeta.Text, p.respBody),
	)

	split := container.NewHSplit(left, container.NewScroll(right))
	split.SetOffset(0.40)
	p.container = split
	p.refreshFilter()
}

func (p *ExplorerPanel) refreshFilter() {
	f := appsvc.EndpointFilter{
		Query:  strings.TrimSpace(p.queryEntry.Text),
		Method: strings.TrimSpace(p.methodEntry.Text),
		Tag:    strings.TrimSpace(p.tagEntry.Text),
	}
	p.filtered = p.app.ListEndpoints(f)
	if len(p.filtered) == 0 {
		p.detail.SetText("No endpoints")
	}

	tags := map[string]struct{}{"": {}}
	for _, ep := range p.app.ListEndpoints(appsvc.EndpointFilter{}) {
		for _, t := range ep.Tags {
			tags[t] = struct{}{}
		}
	}
	var options []string
	for t := range tags {
		options = append(options, t)
	}
	sort.Strings(options)
	p.tagEntry.SetOptions(options)
	p.list.Refresh()
}

func (p *ExplorerPanel) loadExample(ep appsvc.EndpointDTO) {
	ws := p.state.GetWorkspace()
	req, err := p.app.BuildExampleRequest(ep.ID, ws.EnvName, ws.AuthProfile, map[string]string{"baseURL": ws.BaseURL})
	if err != nil {
		p.status("example request error: " + err.Error())
		return
	}
	h := map[string]string{}
	for k, v := range req.Headers {
		h[k] = v
	}
	b, _ := json.MarshalIndent(h, "", "  ")
	p.headers.SetText(string(b))
	p.body.SetText(req.Body)
}

func (p *ExplorerPanel) sendRequest() {
	ep := p.state.GetSelectedEndpoint()
	if ep == nil {
		p.status("Select an endpoint first")
		return
	}
	ws := p.state.GetWorkspace()
	req, err := p.app.BuildExampleRequest(ep.ID, ws.EnvName, ws.AuthProfile, map[string]string{"baseURL": ws.BaseURL})
	if err != nil {
		p.status("request build error: " + err.Error())
		return
	}
	if strings.TrimSpace(p.headers.Text) != "" {
		var m map[string]string
		if err := json.Unmarshal([]byte(p.headers.Text), &m); err == nil {
			req.Headers = m
		}
	}
	req.Body = p.body.Text
	resp, err := p.app.SendRequest(req)
	if err != nil {
		p.respMeta.SetText("Request failed: " + err.Error())
		p.status("request failed")
		return
	}
	p.respMeta.SetText(fmt.Sprintf("Status %d | %dms", resp.StatusCode, resp.LatencyMS))
	p.respBody.SetText(resp.Body)
	p.status("request sent")
}

func (p *ExplorerPanel) Container() fyne.CanvasObject { return p.container }
func (p *ExplorerPanel) OnShow()                      { p.refreshFilter() }
func (p *ExplorerPanel) OnHide()                      {}
func (p *ExplorerPanel) Dispose()                     {}
