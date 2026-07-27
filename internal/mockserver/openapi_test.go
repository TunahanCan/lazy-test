package mockserver

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestImportOpenAPIUsesExamplesAndSchemaSamples(t *testing.T) {
	spec := `openapi: 3.0.3
info:
  title: Mock import
  version: 1.0.0
paths:
  /pets:
    post:
      operationId: createPet
      responses:
        "201":
          description: Created
          content:
            application/json:
              schema:
                type: object
                required: [id, active]
                properties:
                  id:
                    type: integer
                  active:
                    type: boolean
                  ownerEmail:
                    type: string
                    format: email
  /users/{id}:
    get:
      operationId: getUser
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: User
          content:
            application/json:
              example:
                id: "42"
                name: Ada
`
	path := filepath.Join(t.TempDir(), "openapi.yaml")
	if err := os.WriteFile(path, []byte(spec), 0o600); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	routes, err := ImportOpenAPI(path)
	if err != nil {
		t.Fatalf("ImportOpenAPI() error = %v", err)
	}
	if len(routes) != 2 {
		t.Fatalf("len(routes) = %d", len(routes))
	}
	if routes[0].ID != "POST /pets" || routes[0].Status != 201 || !routes[0].Enabled {
		t.Fatalf("schema route = %#v", routes[0])
	}
	var pet map[string]any
	if err := json.Unmarshal([]byte(routes[0].Body), &pet); err != nil {
		t.Fatalf("schema sample body = %q: %v", routes[0].Body, err)
	}
	if pet["id"] != float64(1) || pet["active"] != true ||
		pet["ownerEmail"] != "user@example.com" {
		t.Fatalf("schema sample = %#v", pet)
	}

	if routes[1].ID != "GET /users/{id}" || routes[1].Status != 200 {
		t.Fatalf("example route = %#v", routes[1])
	}
	var user map[string]any
	if err := json.Unmarshal([]byte(routes[1].Body), &user); err != nil {
		t.Fatalf("example body = %q: %v", routes[1].Body, err)
	}
	if user["id"] != "42" || user["name"] != "Ada" {
		t.Fatalf("explicit example = %#v", user)
	}
}

func TestImportOpenAPIGeneratedSamplesRespectArrayAndNumericBounds(t *testing.T) {
	spec := `openapi: 3.0.3
info:
  title: Bounded samples
  version: 1.0.0
paths:
  /measurements:
    get:
      responses:
        "200":
          description: Measurements
          content:
            application/json:
              schema:
                type: object
                required: [scores, sequence]
                properties:
                  scores:
                    type: array
                    minItems: 5
                    items:
                      type: number
                      minimum: 1.5
                      exclusiveMinimum: true
                  sequence:
                    type: integer
                    minimum: 2.2
                    exclusiveMinimum: true
`
	path := filepath.Join(t.TempDir(), "bounded.yaml")
	if err := os.WriteFile(path, []byte(spec), 0o600); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	routes, err := ImportOpenAPI(path)
	if err != nil {
		t.Fatalf("ImportOpenAPI() error = %v", err)
	}
	var body struct {
		Scores   []float64 `json:"scores"`
		Sequence int64     `json:"sequence"`
	}
	if err := json.Unmarshal([]byte(routes[0].Body), &body); err != nil {
		t.Fatalf("decode body %q: %v", routes[0].Body, err)
	}
	if len(body.Scores) != 5 {
		t.Fatalf("len(scores) = %d, want 5", len(body.Scores))
	}
	for _, score := range body.Scores {
		if score <= 1.5 {
			t.Fatalf("score = %v, want > 1.5", score)
		}
	}
	if body.Sequence != 3 {
		t.Fatalf("sequence = %d, want 3", body.Sequence)
	}
}

func TestImportOpenAPIRejectsUnsafeGeneratedArraySize(t *testing.T) {
	spec := `openapi: 3.0.3
info:
  title: Unsafe sample
  version: 1.0.0
paths:
  /items:
    get:
      responses:
        "200":
          description: Items
          content:
            application/json:
              schema:
                type: array
                minItems: 1001
                items:
                  type: string
`
	path := filepath.Join(t.TempDir(), "unsafe.yaml")
	if err := os.WriteFile(path, []byte(spec), 0o600); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	if _, err := ImportOpenAPI(path); err == nil {
		t.Fatal("ImportOpenAPI() error = nil, want safe generation limit error")
	}
}
