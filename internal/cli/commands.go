package cli

import (
	"context"
	"fmt"
	"io"
	"strings"
)

type commandName string

const (
	commandRun     commandName = "run"
	commandInspect commandName = "inspect"
	commandLint    commandName = "lint"
)

type commandHandler func(
	context.Context,
	[]string,
	io.Reader,
	io.Writer,
	io.Writer,
) int

type commandDefinition struct {
	name     commandName
	synopsis string
	execute  commandHandler
}

type commandCatalog struct {
	ordered []commandDefinition
	byName  map[commandName]commandDefinition
}

func newCommandCatalog(
	definitions ...commandDefinition,
) (commandCatalog, error) {
	catalog := commandCatalog{
		ordered: append([]commandDefinition(nil), definitions...),
		byName:  make(map[commandName]commandDefinition, len(definitions)),
	}
	for index, definition := range catalog.ordered {
		name := string(definition.name)
		if strings.TrimSpace(name) == "" {
			return commandCatalog{}, fmt.Errorf(
				"command descriptor %d: name is required",
				index,
			)
		}
		if name != strings.TrimSpace(name) {
			return commandCatalog{}, fmt.Errorf(
				"command %q has surrounding whitespace",
				name,
			)
		}
		if !validCommandName(name) {
			return commandCatalog{}, fmt.Errorf(
				"command %q has an invalid name",
				name,
			)
		}
		if isReservedCommandName(name) {
			return commandCatalog{}, fmt.Errorf(
				"command %q uses a reserved help alias",
				name,
			)
		}
		if strings.TrimSpace(definition.synopsis) == "" {
			return commandCatalog{}, fmt.Errorf(
				"command %q has no usage synopsis",
				name,
			)
		}
		if definition.execute == nil {
			return commandCatalog{}, fmt.Errorf(
				"command %q has no handler",
				name,
			)
		}
		if _, duplicate := catalog.byName[definition.name]; duplicate {
			return commandCatalog{}, fmt.Errorf(
				"duplicate command %q",
				name,
			)
		}
		catalog.byName[definition.name] = definition
	}
	return catalog, nil
}

func validCommandName(name string) bool {
	for index, character := range name {
		if character >= 'a' && character <= 'z' {
			continue
		}
		if index > 0 &&
			(character >= '0' && character <= '9' || character == '-') {
			continue
		}
		return false
	}
	return name != ""
}

func isReservedCommandName(name string) bool {
	return name == "help" || name == "-h" || name == "--help"
}

func mustCommandCatalog(
	definitions ...commandDefinition,
) commandCatalog {
	catalog, err := newCommandCatalog(definitions...)
	if err != nil {
		panic("invalid CLI command registry: " + err.Error())
	}
	return catalog
}

func (catalog commandCatalog) lookup(
	name string,
) (commandDefinition, bool) {
	definition, ok := catalog.byName[commandName(name)]
	return definition, ok
}

func (catalog commandCatalog) usage() string {
	var usage strings.Builder
	usage.WriteString("Usage:\n")
	for _, definition := range catalog.ordered {
		usage.WriteString("  ")
		usage.WriteString(definition.synopsis)
		usage.WriteByte('\n')
	}
	usage.WriteString(
		"\nUse --file - to read a collection or OpenAPI document from standard input.\n",
	)
	return usage.String()
}

// cliCommands is the single source of truth for command discovery, root usage
// ordering, and dispatch. Command-specific flag parsing remains in its adapter
// file so adding a command does not grow a root switch.
var cliCommands = mustCommandCatalog(
	commandDefinition{
		name:     commandRun,
		synopsis: "validex-cli run --file collection.json [--variables vars.json] [--json]",
		execute:  executeRun,
	},
	commandDefinition{
		name:     commandInspect,
		synopsis: "validex-cli inspect --url URL [--timeout 15s] [--max-redirects 10] [--insecure] [--json]",
		execute: func(
			ctx context.Context,
			args []string,
			_ io.Reader,
			stdout io.Writer,
			stderr io.Writer,
		) int {
			return executeInspect(ctx, args, stdout, stderr)
		},
	},
	commandDefinition{
		name:     commandLint,
		synopsis: "validex-cli lint --file openapi.yaml [--json] [--strict]",
		execute:  executeLint,
	},
)
