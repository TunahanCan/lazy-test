package plan

import (
	"context"
	"embed"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Kind string

const (
	KindHTTP Kind = "http"
	KindLT   Kind = "lt"
	KindTCP  Kind = "tcp"
)

type Loader interface {
	Load(path string) (any, Kind, error)
}
type YAMLLoader struct{}

func (l YAMLLoader) Load(path string) (any, Kind, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	var raw map[string]any
	if err := yaml.Unmarshal(b, &raw); err != nil {
		return nil, "", err
	}
	kind := Kind(fmt.Sprint(raw["kind"]))
	if kind == "" {
		kind = KindHTTP
	}
	if err := ValidateCUE(kind, b); err != nil {
		return nil, kind, err
	}
	return raw, kind, nil
}

//go:embed schemas/*.cue
var schemaFS embed.FS

func ValidateCUE(kind Kind, b []byte) error {
	if _, err := schemaFS.ReadFile(fmt.Sprintf("schemas/%s.cue", kind)); err != nil {
		return fmt.Errorf("unsupported plan kind %q", kind)
	}
	if kind != KindTCP {
		return nil
	}
	var m map[string]any
	if err := yaml.Unmarshal(b, &m); err != nil {
		return err
	}
	if fmt.Sprint(m["kind"]) != "tcp" {
		return fmt.Errorf("kind must be tcp")
	}
	if strings.TrimSpace(fmt.Sprint(m["name"])) == "" {
		return fmt.Errorf("name is required")
	}
	if strings.TrimSpace(fmt.Sprint(m["host"])) == "" {
		return fmt.Errorf("host is required")
	}
	port, _ := m["port"].(int)
	if port <= 0 || port > 65535 {
		return fmt.Errorf("port must be 1..65535")
	}
	steps, _ := m["steps"].([]any)
	if len(steps) == 0 {
		return fmt.Errorf("steps required")
	}
	return nil
}

type WatchEvent struct {
	Path  string
	Err   error
	Valid bool
	Kind  Kind
}
type Watcher struct{}

func NewWatcher() (*Watcher, error) { return &Watcher{}, nil }
func (w *Watcher) Close() error     { return nil }
func (w *Watcher) Watch(ctx context.Context, path string) (<-chan WatchEvent, error) {
	out := make(chan WatchEvent, 4)
	go func() {
		defer close(out)
		var last time.Time
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}
			st, err := os.Stat(path)
			if err == nil && st.ModTime().After(last) {
				last = st.ModTime()
				b, e := os.ReadFile(path)
				k := KindTCP
				if e == nil {
					var raw map[string]any
					_ = yaml.Unmarshal(b, &raw)
					k = Kind(fmt.Sprint(raw["kind"]))
					e = ValidateCUE(k, b)
				}
				out <- WatchEvent{Path: path, Err: e, Valid: e == nil, Kind: k}
			}
			time.Sleep(300 * time.Millisecond)
		}
	}()
	return out, nil
}

func Edit(path string) error {
	ed := os.Getenv("EDITOR")
	if strings.TrimSpace(ed) == "" {
		ed = "vi"
	}
	parts := strings.Fields(ed)
	cmd := exec.Command(parts[0], append(parts[1:], path)...) // #nosec G204
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	return cmd.Run()
}
