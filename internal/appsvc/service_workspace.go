package appsvc

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// SaveWorkspace persists workspace.json.
//
// Java analogy: this behaves like a tiny file-based repository save().
func (s *Service) SaveWorkspace(ws Workspace) error {
	if ws.Version == 0 {
		ws.Version = 1
	}
	ws.UpdatedAtUnix = s.clk.Now().Unix()

	b, err := json.MarshalIndent(ws, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.wsPath), 0755); err != nil {
		return err
	}
	return os.WriteFile(s.wsPath, b, 0600)
}

// LoadWorkspace reads workspace.json.
func (s *Service) LoadWorkspace() (Workspace, error) {
	b, err := os.ReadFile(s.wsPath)
	if err != nil {
		return Workspace{}, err
	}
	var ws Workspace
	if err := json.Unmarshal(b, &ws); err != nil {
		return Workspace{}, err
	}
	if ws.Version == 0 {
		ws.Version = 1
	}
	return ws, nil
}
