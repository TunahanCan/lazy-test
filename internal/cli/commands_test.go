package cli

import (
	"context"
	"io"
	"strings"
	"testing"
)

func TestCommandCatalogValidatesExtensionDescriptors(t *testing.T) {
	t.Parallel()
	handler := func(
		context.Context,
		[]string,
		io.Reader,
		io.Writer,
		io.Writer,
	) int {
		return exitSuccess
	}
	valid := commandDefinition{
		name:     "valid",
		synopsis: "validex-cli valid",
		execute:  handler,
	}
	tests := []struct {
		name        string
		definitions []commandDefinition
		want        string
	}{
		{
			name: "invalid token",
			definitions: []commandDefinition{{
				name: "not reachable",
				synopsis: "validex-cli invalid",
				execute: handler,
			}},
			want: "invalid name",
		},
		{
			name: "reserved alias",
			definitions: []commandDefinition{{
				name: "help",
				synopsis: "validex-cli help",
				execute: handler,
			}},
			want: "reserved help alias",
		},
		{
			name:        "duplicate",
			definitions: []commandDefinition{valid, valid},
			want:        "duplicate command",
		},
		{
			name: "missing synopsis",
			definitions: []commandDefinition{{
				name:    "missing",
				execute: handler,
			}},
			want: "no usage synopsis",
		},
		{
			name: "missing handler",
			definitions: []commandDefinition{{
				name:     "missing",
				synopsis: "validex-cli missing",
			}},
			want: "no handler",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := newCommandCatalog(test.definitions...)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("catalog error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestCommandCatalogBuildsDeterministicRootUsage(t *testing.T) {
	t.Parallel()
	usage := cliCommands.usage()
	runIndex := strings.Index(usage, "validex-cli run")
	inspectIndex := strings.Index(usage, "validex-cli inspect")
	lintIndex := strings.Index(usage, "validex-cli lint")
	if runIndex < 0 || inspectIndex <= runIndex || lintIndex <= inspectIndex {
		t.Fatalf("unexpected command usage order:\n%s", usage)
	}
}
