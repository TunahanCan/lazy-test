package e2e

import (
	stdjson "encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/chromedp/chromedp/kb"
	"github.com/cucumber/godog"
)

const (
	jsonSharedInput = `{"group":"shared-json","z":2,"a":1}`
	jsonDiffInput   = `{"group":"diff","status":"READY"}`
	jsonDTOInput    = `public record GroupResponse(String group, boolean active) {}`
)

func registerJSONSteps(context *godog.ScenarioContext, world *browserWorld) {
	context.Step(
		`^I open the "([^"]+)" JSON Lab mode$`,
		world.jsonOpenMode,
	)
	context.Step(
		`^I provide the "([^"]+)" JSON Lab fixture$`,
		world.jsonProvideFixture,
	)
	context.Step(
		`^I run the "([^"]+)" JSON Lab operation$`,
		world.jsonRunOperation,
	)
	context.Step(
		`^the JSON Lab result matches the "([^"]+)" fixture$`,
		world.jsonResultMatchesFixture,
	)
	context.Step(
		`^a successful operation status is announced$`,
		world.jsonSuccessIsAnnounced,
	)
	context.Step(
		`^the active JSON Lab mode keeps keyboard focus$`,
		world.jsonActiveModeKeepsFocus,
	)
	context.Step(
		`^each JSON Lab input group contains distinct text$`,
		world.jsonSeedDistinctInputGroups,
	)
	context.Step(
		`^I navigate the JSON Lab modes with Arrow keys, Home, and End$`,
		world.jsonNavigateModesByKeyboard,
	)
	context.Step(
		`^each selected mode is announced as active$`,
		world.jsonEachSelectedModeIsActive,
	)
	context.Step(
		`^each mode restores its own input text$`,
		world.jsonEachModeRestoresInput,
	)
	context.Step(
		`^derived results are cleared when the mode changes$`,
		world.jsonDerivedResultsAreCleared,
	)
	context.Step(
		`^I am in the "Format" JSON Lab mode$`,
		func() error { return world.jsonOpenMode("Format") },
	)
	context.Step(
		`^I run JSON formatting with malformed JSON$`,
		world.jsonRunMalformedFormatting,
	)
	context.Step(
		`^an accessible JSON validation error is shown$`,
		world.jsonAccessibleValidationErrorIsShown,
	)
	context.Step(
		`^I replace the input with valid JSON and format it$`,
		world.jsonReplaceWithValidInput,
	)
	context.Step(
		`^I copy the JSON Lab result$`,
		world.jsonCopyResult,
	)
	context.Step(
		`^the clipboard contains the formatted result$`,
		world.jsonClipboardContainsResult,
	)
	context.Step(
		`^the copy action temporarily reports success$`,
		world.jsonCopyReportsSuccess,
	)
}

func jsonQuoted(value string) string {
	encoded, _ := stdjson.Marshal(value)
	return string(encoded)
}

func jsonModeID(label string) (string, error) {
	modes := map[string]string{
		"Format": "format",
		"Diff":   "diff",
		"Query":  "query",
		"Schema": "schema",
		"DTO":    "dto",
	}
	mode, ok := modes[label]
	if !ok {
		return "", fmt.Errorf("unknown JSON Lab mode %q", label)
	}
	return mode, nil
}

func (w *browserWorld) jsonOpenMode(label string) error {
	mode, err := jsonModeID(label)
	if err != nil {
		return err
	}
	selector := fmt.Sprintf(`[data-json-mode="%s"]`, mode)
	if err := w.run(
		chromedp.WaitVisible(selector, chromedp.ByQuery),
		chromedp.Click(selector, chromedp.ByQuery),
		chromedp.Poll(
			fmt.Sprintf(
				`document.querySelector(%s)?.getAttribute("aria-selected") === "true"`,
				jsonQuoted(selector),
			),
			nil,
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return fmt.Errorf("open JSON Lab mode %q: %w", label, err)
	}
	return w.jsonAssertModeActive(mode)
}

func (w *browserWorld) jsonAssertModeActive(mode string) error {
	selector := fmt.Sprintf(`[data-json-mode="%s"]`, mode)
	var state struct {
		Selected string `json:"selected"`
		TabIndex int    `json:"tabIndex"`
		Visible  bool   `json:"visible"`
	}
	expression := fmt.Sprintf(`(() => {
		const tab = document.querySelector(%s);
		const panel = tab && document.getElementById(tab.getAttribute("aria-controls"));
		return {
			selected: tab?.getAttribute("aria-selected") || "",
			tabIndex: tab?.tabIndex ?? -99,
			visible: Boolean(panel && !panel.hidden && panel.getAttribute("role") === "tabpanel")
		};
	})()`, jsonQuoted(selector))
	if err := w.run(chromedp.Evaluate(expression, &state)); err != nil {
		return err
	}
	if state.Selected != "true" || state.TabIndex != 0 || !state.Visible {
		return fmt.Errorf(
			"JSON mode %q accessibility state = selected %q, tabindex %d, visible %t",
			mode,
			state.Selected,
			state.TabIndex,
			state.Visible,
		)
	}
	return nil
}

func (w *browserWorld) jsonSetControl(control, value string) error {
	selector := fmt.Sprintf(`[data-json-control="%s"]`, control)
	var updated bool
	expression := fmt.Sprintf(`(() => {
		const element = document.querySelector(%s);
		if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
			return false;
		}
		element.focus();
		element.value = %s;
		element.setSelectionRange?.(element.value.length, element.value.length);
		element.dispatchEvent(new InputEvent("input", {
			bubbles: true,
			inputType: "insertText",
			data: null
		}));
		return element.value === %s;
	})()`, jsonQuoted(selector), jsonQuoted(value), jsonQuoted(value))
	if err := w.run(
		chromedp.WaitVisible(selector, chromedp.ByQuery),
		chromedp.Evaluate(expression, &updated),
	); err != nil {
		return err
	}
	if !updated {
		return fmt.Errorf("JSON control %q could not be updated", control)
	}
	return nil
}

func (w *browserWorld) jsonProvideFixture(name string) error {
	switch name {
	case "unsorted JSON document":
		return w.jsonSetControl(
			"source",
			`{"z":2,"a":1,"nested":{"z":3,"a":2}}`,
		)
	case "two JSON documents":
		if err := w.jsonSetControl(
			"source",
			`{"id":"order-42","status":"READY","traceId":"ignored-a"}`,
		); err != nil {
			return err
		}
		if err := w.jsonSetControl(
			"compare",
			`{"id":"order-42","status":"SHIPPED","traceId":"ignored-b"}`,
		); err != nil {
			return err
		}
		return w.jsonSetControl("ignore", "$.traceId")
	case "nested JSON document":
		if err := w.jsonSetControl(
			"source",
			`{"users":[{"id":1,"profile":{"name":"Ada"}}]}`,
		); err != nil {
			return err
		}
		return w.jsonSetControl("path", "$.users[0].profile.name")
	case "representative JSON":
		return w.jsonSetControl(
			"source",
			`{"id":42,"tags":["api"],"active":true}`,
		)
	case "Java response record":
		return w.jsonSetControl(
			"source",
			`public record OrderResponse(
				UUID id,
				List<OrderLineResponse> lines,
				OrderStatus status
			) {}
			record OrderLineResponse(String sku, BigDecimal price) {}
			enum OrderStatus { CREATED, SHIPPED }`,
		)
	default:
		return fmt.Errorf("unknown JSON Lab fixture %q", name)
	}
}

func jsonActionForOperation(operation string) (string, error) {
	actions := map[string]string{
		"format and sort": "sort",
		"compare":         "compare",
		"query JSONPath":  "query",
		"infer schema":    "schema",
		"create example":  "dto",
	}
	action, ok := actions[operation]
	if !ok {
		return "", fmt.Errorf("unknown JSON Lab operation %q", operation)
	}
	return action, nil
}

func (w *browserWorld) jsonRunOperation(operation string) error {
	action, err := jsonActionForOperation(operation)
	if err != nil {
		return err
	}
	selector := fmt.Sprintf(`[data-json-action="%s"]`, action)
	if err := w.run(
		chromedp.WaitVisible(selector, chromedp.ByQuery),
		chromedp.Click(selector, chromedp.ByQuery),
		chromedp.Poll(
			`Boolean(document.querySelector('[data-json-slot="notice"] [role="status"]'))`,
			nil,
			chromedp.WithPollingTimeout(3*time.Second),
		),
	); err != nil {
		return fmt.Errorf("run JSON Lab operation %q: %w", operation, err)
	}
	return nil
}

func (w *browserWorld) jsonResultMatchesFixture(name string) error {
	checks := map[string]string{
		"formatted JSON": `(() => {
			const result = document.querySelector('[data-json-slot="result"] textarea')?.value;
			if (!result || !result.includes("\n  ")) return false;
			const value = JSON.parse(result);
			return value.a === 1 &&
				value.z === 2 &&
				value.nested?.a === 2 &&
				result.indexOf('"a"') < result.indexOf('"z"');
		})()`,
		"JSON differences": `(() => {
			const list = document.querySelector('[data-json-slot="differences"] [role="list"]');
			const text = list?.textContent || "";
			return list?.querySelectorAll('[role="listitem"]').length === 1 &&
				text.includes("$.status") &&
				text.includes("READY") &&
				text.includes("SHIPPED") &&
				!text.includes("$.traceId");
		})()`,
		"selected JSON value": `(() => {
			const result = document.querySelector('[data-json-slot="result"] textarea')?.value;
			return result === '"Ada"' && JSON.parse(result) === "Ada";
		})()`,
		"inferred schema": `(() => {
			const result = document.querySelector('[data-json-slot="result"] textarea')?.value;
			if (!result) return false;
			const schema = JSON.parse(result);
			return schema.type === "object" &&
				schema.properties?.id?.type === "integer" &&
				schema.properties?.tags?.items?.type === "string" &&
				schema.properties?.active?.type === "boolean";
		})()`,
		"DTO JSON example": `(() => {
			const result = document.querySelector('[data-json-slot="result"] textarea')?.value;
			if (!result) return false;
			const example = JSON.parse(result);
			return example.id === "00000000-0000-0000-0000-000000000001" &&
				example.lines?.[0]?.sku === "example" &&
				example.lines?.[0]?.price === 0 &&
				example.status === "CREATED";
		})()`,
	}
	expression, ok := checks[name]
	if !ok {
		return fmt.Errorf("unknown JSON result fixture %q", name)
	}
	var matches bool
	if err := w.run(chromedp.Evaluate(expression, &matches)); err != nil {
		return err
	}
	if !matches {
		return fmt.Errorf("JSON Lab result does not match fixture %q", name)
	}
	return nil
}

func (w *browserWorld) jsonSuccessIsAnnounced() error {
	var status struct {
		Text     string `json:"text"`
		Role     string `json:"role"`
		Live     string `json:"live"`
		HasCheck bool   `json:"hasCheck"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const notice = document.querySelector(
			'[data-json-slot="notice"] .tool-notice.success'
		);
		return {
			text: notice?.textContent?.trim() || "",
			role: notice?.getAttribute("role") || "",
			live: notice?.getAttribute("aria-live") || "",
			hasCheck: Boolean(notice?.querySelector("svg"))
		};
	})()`, &status)); err != nil {
		return err
	}
	if status.Text == "" || status.Role != "status" ||
		status.Live != "polite" || !status.HasCheck {
		return fmt.Errorf(
			"JSON success announcement is incomplete: text=%q role=%q live=%q icon=%t",
			status.Text,
			status.Role,
			status.Live,
			status.HasCheck,
		)
	}
	return nil
}

func (w *browserWorld) jsonActiveModeKeepsFocus() error {
	var state struct {
		ActiveMode  string `json:"activeMode"`
		Focused     string `json:"focused"`
		FocusInside bool   `json:"focusInside"`
		TabIndex    int    `json:"tabIndex"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const tab = document.querySelector('[data-json-mode][aria-selected="true"]');
		const panel = tab && document.getElementById(tab.getAttribute("aria-controls"));
		const focused = document.activeElement;
		return {
			activeMode: tab?.dataset.jsonMode || "",
			focused:
				focused?.dataset?.jsonAction ||
				focused?.dataset?.jsonControl ||
				focused?.dataset?.jsonMode ||
				focused?.tagName ||
				"",
			focusInside: Boolean(focused && (focused === tab || panel?.contains(focused))),
			tabIndex: tab?.tabIndex ?? -99
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.ActiveMode == "" || state.Focused == "" ||
		!state.FocusInside || state.TabIndex != 0 {
		return fmt.Errorf(
			"active JSON mode lost keyboard focus: mode=%q focused=%q inside=%t tabindex=%d",
			state.ActiveMode,
			state.Focused,
			state.FocusInside,
			state.TabIndex,
		)
	}
	return nil
}

func (w *browserWorld) jsonSeedDistinctInputGroups() error {
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E_JSON_NAVIGATION__ = {
			visited: {},
			derivedCleared: true,
		}`,
		nil,
	)); err != nil {
		return err
	}
	if err := w.jsonOpenMode("Format"); err != nil {
		return err
	}
	if err := w.jsonSetControl("source", jsonSharedInput); err != nil {
		return err
	}
	if err := w.run(chromedp.Click(
		`[data-json-action="sort"]`,
		chromedp.ByQuery,
	)); err != nil {
		return err
	}
	if err := w.jsonOpenMode("Diff"); err != nil {
		return err
	}
	if err := w.jsonSetControl("source", jsonDiffInput); err != nil {
		return err
	}
	if err := w.jsonOpenMode("DTO"); err != nil {
		return err
	}
	return w.jsonSetControl("source", jsonDTOInput)
}

func (w *browserWorld) jsonNavigateModesByKeyboard() error {
	type navigation struct {
		key  string
		want string
	}
	sequence := []navigation{
		{key: kb.Home, want: "format"},
		{key: kb.ArrowRight, want: "diff"},
		{key: kb.ArrowRight, want: "query"},
		{key: kb.ArrowRight, want: "schema"},
		{key: kb.End, want: "dto"},
		{key: kb.ArrowLeft, want: "schema"},
		{key: kb.ArrowRight, want: "dto"},
	}
	for _, item := range sequence {
		activeSelector := `[data-json-mode][aria-selected="true"]`
		if err := w.run(
			chromedp.Focus(activeSelector, chromedp.ByQuery),
			chromedp.KeyEvent(item.key),
			chromedp.Poll(
				fmt.Sprintf(
					`document.querySelector('[data-json-mode][aria-selected="true"]')?.dataset.jsonMode === %s`,
					jsonQuoted(item.want),
				),
				nil,
				chromedp.WithPollingTimeout(3*time.Second),
			),
		); err != nil {
			return fmt.Errorf("navigate JSON modes to %q: %w", item.want, err)
		}
		if err := w.jsonAssertModeActive(item.want); err != nil {
			return err
		}
		var state struct {
			Focused        bool `json:"focused"`
			DerivedCleared bool `json:"derivedCleared"`
		}
		if err := w.run(chromedp.Evaluate(fmt.Sprintf(
			`(() => {
				const focused =
					document.activeElement === document.querySelector(
						'[data-json-mode="%s"]',
					);
				const derivedCleared =
					!document.querySelector(
						'[data-json-slot="result"] textarea',
					)?.value &&
					document.querySelectorAll(
						'[data-json-slot="differences"] [role="listitem"]',
					).length === 0 &&
					!document.querySelector(
						'[data-json-slot="notice"]',
					)?.textContent?.trim();
				const navigation =
					globalThis.__VALIDEX_E2E_JSON_NAVIGATION__ ??= {
						visited: {},
						derivedCleared: true,
					};
				navigation.visited[%q] = true;
				navigation.derivedCleared =
					navigation.derivedCleared && derivedCleared;
				return { focused, derivedCleared };
			})()`,
			item.want,
			item.want,
		), &state)); err != nil {
			return err
		}
		if !state.Focused {
			return fmt.Errorf("keyboard-selected JSON mode %q did not receive focus", item.want)
		}
		if !state.DerivedCleared {
			return fmt.Errorf(
				"keyboard transition to JSON mode %q retained derived state",
				item.want,
			)
		}
	}
	return nil
}

func (w *browserWorld) jsonEachSelectedModeIsActive() error {
	var visited map[string]bool
	if err := w.run(chromedp.Evaluate(
		`globalThis.__VALIDEX_E2E_JSON_NAVIGATION__?.visited ?? {}`,
		&visited,
	)); err != nil {
		return err
	}
	for _, mode := range []string{"format", "diff", "query", "schema", "dto"} {
		if !visited[mode] {
			return fmt.Errorf("JSON mode %q was not reached by keyboard", mode)
		}
	}
	return w.jsonAssertModeActive("dto")
}

func (w *browserWorld) jsonEachModeRestoresInput() error {
	expectations := []struct {
		label string
		value string
	}{
		{label: "Format", value: jsonSharedInput},
		{label: "Diff", value: jsonDiffInput},
		{label: "Query", value: jsonSharedInput},
		{label: "Schema", value: jsonSharedInput},
		{label: "DTO", value: jsonDTOInput},
	}
	for _, expectation := range expectations {
		if err := w.jsonOpenMode(expectation.label); err != nil {
			return err
		}
		var value string
		if err := w.run(chromedp.Value(
			`[data-json-control="source"]`,
			&value,
			chromedp.ByQuery,
		)); err != nil {
			return err
		}
		if value != expectation.value {
			return fmt.Errorf(
				"JSON mode %q restored %q, want %q",
				expectation.label,
				value,
				expectation.value,
			)
		}
	}
	return nil
}

func (w *browserWorld) jsonDerivedResultsAreCleared() error {
	var state struct {
		EveryChange bool   `json:"everyChange"`
		Result      string `json:"result"`
		Differences int    `json:"differences"`
		Notice      string `json:"notice"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		everyChange:
			globalThis.__VALIDEX_E2E_JSON_NAVIGATION__?.derivedCleared === true,
		result:
			document.querySelector('[data-json-slot="result"] textarea')?.value || "",
		differences:
			document.querySelectorAll(
				'[data-json-slot="differences"] [role="listitem"]'
			).length,
		notice:
			document.querySelector('[data-json-slot="notice"]')?.textContent?.trim() || ""
	}))()`, &state)); err != nil {
		return err
	}
	if !state.EveryChange ||
		state.Result != "" ||
		state.Differences != 0 ||
		state.Notice != "" {
		return fmt.Errorf(
			"mode change retained derived JSON state: every=%t result=%q differences=%d notice=%q",
			state.EveryChange,
			state.Result,
			state.Differences,
			state.Notice,
		)
	}
	return nil
}

func (w *browserWorld) jsonRunMalformedFormatting() error {
	if err := w.jsonSetControl("source", `{"broken":`); err != nil {
		return err
	}
	return w.run(
		chromedp.Click(`[data-json-action="format"]`, chromedp.ByQuery),
		chromedp.WaitVisible(
			`[data-json-slot="notice"] [role="alert"]`,
			chromedp.ByQuery,
		),
	)
}

func (w *browserWorld) jsonAccessibleValidationErrorIsShown() error {
	var state struct {
		Text   string `json:"text"`
		Role   string `json:"role"`
		Live   string `json:"live"`
		Result string `json:"result"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const alert = document.querySelector('[data-json-slot="notice"] [role="alert"]');
		return {
			text: alert?.textContent?.trim() || "",
			role: alert?.getAttribute("role") || "",
			live: alert?.getAttribute("aria-live") || "",
			result:
				document.querySelector('[data-json-slot="result"] textarea')?.value || ""
		};
	})()`, &state)); err != nil {
		return err
	}
	if state.Role != "alert" || state.Live != "assertive" ||
		!strings.Contains(state.Text, "Invalid JSON") || state.Result != "" {
		return fmt.Errorf(
			"JSON validation error is not accessible: text=%q role=%q live=%q result=%q",
			state.Text,
			state.Role,
			state.Live,
			state.Result,
		)
	}
	return nil
}

func (w *browserWorld) jsonReplaceWithValidInput() error {
	if err := w.jsonSetControl("source", `{"z":2,"a":1}`); err != nil {
		return err
	}
	return w.run(
		chromedp.Click(`[data-json-action="format"]`, chromedp.ByQuery),
		chromedp.Poll(
			`Boolean(document.querySelector('[data-json-slot="result"] textarea')?.value)`,
			nil,
			chromedp.WithPollingTimeout(3*time.Second),
		),
	)
}

func (w *browserWorld) jsonCopyResult() error {
	return w.run(
		chromedp.WaitVisible(`[data-json-action="copy"]`, chromedp.ByQuery),
		chromedp.Click(`[data-json-action="copy"]`, chromedp.ByQuery),
		chromedp.Poll(
			`document.querySelector('[data-json-action="copy"]')?.textContent?.includes("Copied")`,
			nil,
			chromedp.WithPollingTimeout(time.Second),
		),
	)
}

func (w *browserWorld) jsonClipboardContainsResult() error {
	var values struct {
		Clipboard string `json:"clipboard"`
		Result    string `json:"result"`
	}
	if err := w.run(chromedp.Evaluate(`(() => ({
		clipboard: globalThis.__VALIDEX_E2E__.clipboard,
		result: document.querySelector('[data-json-slot="result"] textarea')?.value || ""
	}))()`, &values)); err != nil {
		return err
	}
	if values.Result == "" || values.Clipboard != values.Result {
		return fmt.Errorf(
			"clipboard/result mismatch: clipboard=%q result=%q",
			values.Clipboard,
			values.Result,
		)
	}
	return nil
}

func (w *browserWorld) jsonCopyReportsSuccess() error {
	var state struct {
		Text string `json:"text"`
		Live string `json:"live"`
	}
	if err := w.run(chromedp.Evaluate(`(() => {
		const copy = document.querySelector('[data-json-action="copy"]');
		return {
			text: copy?.textContent?.trim() || "",
			live: copy?.getAttribute("aria-live") || ""
		};
	})()`, &state)); err != nil {
		return err
	}
	if !strings.Contains(state.Text, "Copied") || state.Live != "polite" {
		return fmt.Errorf(
			"copy success state is not announced: text=%q live=%q",
			state.Text,
			state.Live,
		)
	}
	return w.run(chromedp.Poll(
		`(() => {
			const copy = document.querySelector('[data-json-action="copy"]');
			return copy?.getAttribute("aria-live") === "polite" &&
				!copy?.textContent?.includes("Copied");
		})()`,
		nil,
		chromedp.WithPollingInterval(25*time.Millisecond),
		chromedp.WithPollingTimeout(3*time.Second),
	))
}
