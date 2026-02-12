// Package lt provides Taurus YAML–compatible load test parsing and single-node execution.
package lt

import (
	"fmt"
	"os"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

// Plan is the internal model of a Taurus YAML plan (execution + scenarios + data-sources).
type Plan struct {
	Execution   []ExecutionBlock  `yaml:"execution"`
	Scenarios   map[string]Scenario `yaml:"scenarios"`
	DataSources []DataSource       `yaml:"data-sources"`
}

// ExecutionBlock maps execution[*] (executor: http).
type ExecutionBlock struct {
	Executor    string `yaml:"executor"`
	Concurrency int    `yaml:"concurrency"`
	RampUp      string `yaml:"ramp-up"`   // e.g. "45s"
	HoldFor     string `yaml:"hold-for"`  // e.g. "4m"
	Scenario    string `yaml:"scenario"`
	TargetRPS   int    `yaml:"target-rps,omitempty"`
}

// Scenario maps scenarios[name].
type Scenario struct {
	BaseURL   string            `yaml:"base-url"`
	Headers   map[string]string  `yaml:"headers"`
	ThinkTime ThinkTime         `yaml:"think-time"`
	Requests  []Request         `yaml:"requests"`
}

// ThinkTime is constant or uniform_random.
type ThinkTime struct {
	Constant string `yaml:"constant"`       // e.g. "300ms"
	Uniform  string `yaml:"uniform_random"` // e.g. "100ms-500ms" (min-max)
}

// Request is one HTTP request in a scenario.
type Request struct {
	Label          string            `yaml:"label"`
	Method         string            `yaml:"method"`
	URL            string            `yaml:"url"`
	Body           string            `yaml:"body"`
	Headers        map[string]string `yaml:"headers"`
	ExtractJSONPath []ExtractRule    `yaml:"extract-jsonpath"`
	Assertions     []Assertion       `yaml:"assertions"`
}

// ExtractRule binds a JSONPath result to a variable.
type ExtractRule struct {
	JSONPath  string `yaml:"jsonpath"`
	Variable  string `yaml:"variable"`
	Default   string `yaml:"default,omitempty"`
}

// Assertion is status-code, p95-time-ms, or jsonpath.
type Assertion struct {
	StatusCode  *int   `yaml:"status-code,omitempty"`
	P95TimeMs   *int   `yaml:"p95-time-ms,omitempty"`
	JSONPath    *struct {
		Path string `yaml:"path"`
		Type string `yaml:"type"` // string, number, etc.
	} `yaml:"jsonpath,omitempty"`
	Contains    string `yaml:"contains,omitempty"`
}

// DataSource is a CSV file for variable iteration.
type DataSource struct {
	Path      string `yaml:"path"`
	Delimiter string `yaml:"delimiter"`
	Variable  string `yaml:"variable"` // e.g. "user" -> ${user.name}, ${user.pass}
}

// ParseFile reads and parses a Taurus YAML file.
func ParseFile(path string) (*Plan, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read plan: %w", err)
	}
	return Parse(data)
}

// Parse parses Taurus YAML bytes into a Plan.
func Parse(data []byte) (*Plan, error) {
	var plan Plan
	if err := yaml.Unmarshal(data, &plan); err != nil {
		return nil, fmt.Errorf("parse yaml: %w", err)
	}
	// Concurrency default
	for i := range plan.Execution {
		e := &plan.Execution[i]
		if e.Concurrency <= 0 {
			e.Concurrency = 1
		}
	}
	for name, sc := range plan.Scenarios {
		for j := range sc.Requests {
			sc.Requests[j].Method = strings.ToUpper(strings.TrimSpace(sc.Requests[j].Method))
			if sc.Requests[j].Method == "" {
				sc.Requests[j].Method = "GET"
			}
		}
		plan.Scenarios[name] = sc
	}
	return &plan, nil
}

// ResolveVars replaces ${var} and ${var.field} in s with values from vars (e.g. {"token":"x","user.name":"u"}).
var varRe = regexp.MustCompile(`\$\{([^}]+)\}`)

func ResolveVars(s string, vars map[string]string) string {
	return varRe.ReplaceAllStringFunc(s, func(match string) string {
		key := match[2 : len(match)-1]
		if v, ok := vars[key]; ok {
			return v
		}
		return match
	})
}

// ScenarioSummary returns a short summary for the TUI (request count, assertion count).
func (p *Plan) ScenarioSummary() []string {
	var lines []string
	for name, sc := range p.Scenarios {
		lines = append(lines, fmt.Sprintf("%s: %d requests, %d assertions",
			name, len(sc.Requests), countAssertions(sc.Requests)))
	}
	return lines
}

func countAssertions(requests []Request) int {
	n := 0
	for _, r := range requests {
		n += len(r.Assertions)
	}
	return n
}
