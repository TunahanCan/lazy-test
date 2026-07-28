package runner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strconv"
)

type collectionHeaderFormat uint8

const (
	collectionHeadersUnspecified collectionHeaderFormat = iota
	collectionHeadersObject
	collectionHeadersArray
)

type canonicalCollectionWire struct {
	Version   int               `json:"version"`
	Name      string            `json:"name,omitempty"`
	Variables map[string]string `json:"variables,omitempty"`
	Requests  []Request         `json:"requests"`
}

// MarshalJSON is the collection serialization boundary. Decoded source
// versions remain available in memory for compatibility validation, while
// every persisted representation is upgraded to the canonical v2 wire model.
func (collection Collection) MarshalJSON() ([]byte, error) {
	wire, err := collection.canonicalWire()
	if err != nil {
		return nil, err
	}
	return json.Marshal(wire)
}

func (collection Collection) canonicalWire() (canonicalCollectionWire, error) {
	switch collection.Version {
	case CollectionVersionUnspecified,
		CollectionVersionV1,
		CollectionVersionV2:
	default:
		return canonicalCollectionWire{}, fmt.Errorf(
			"collection version %s is not supported",
			collection.Version,
		)
	}
	currentVersion, err := strconv.Atoi(string(CurrentCollectionVersion))
	if err != nil {
		return canonicalCollectionWire{}, fmt.Errorf(
			"current collection version %q is not numeric: %w",
			CurrentCollectionVersion,
			err,
		)
	}
	return canonicalCollectionWire{
		Version:   currentVersion,
		Name:      collection.Name,
		Variables: collection.Variables,
		Requests:  collection.Requests,
	}, nil
}

// UnmarshalJSON is the anti-corruption boundary between the legacy v1 header
// object and the ordered v2 header array. The rest of runner only sees the
// canonical []Header model.
func (request *Request) UnmarshalJSON(data []byte) error {
	type requestAlias Request
	type requestWire struct {
		*requestAlias
		Headers json.RawMessage `json:"headers,omitempty"`
	}

	decoded := requestAlias{}
	wire := requestWire{requestAlias: &decoded}
	if err := decodeStrictJSON(data, &wire); err != nil {
		return err
	}
	headers, format, err := decodeCollectionHeaders(wire.Headers)
	if err != nil {
		return err
	}
	decoded.Headers = headers
	*request = Request(decoded)
	request.headerFormat = format
	return nil
}

func decodeCollectionHeaders(
	data json.RawMessage,
) ([]Header, collectionHeaderFormat, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil, collectionHeadersUnspecified, nil
	}
	switch trimmed[0] {
	case '{':
		var legacy map[string]string
		if err := decodeStrictJSON(trimmed, &legacy); err != nil {
			return nil, collectionHeadersObject, fmt.Errorf(
				"decode legacy headers: %w",
				err,
			)
		}
		names := make([]string, 0, len(legacy))
		for name := range legacy {
			names = append(names, name)
		}
		sort.Strings(names)
		headers := make([]Header, 0, len(names))
		for _, name := range names {
			headers = append(headers, Header{
				Enabled: true,
				Key:     name,
				Value:   legacy[name],
			})
		}
		return headers, collectionHeadersObject, nil
	case '[':
		type headerWire struct {
			Enabled *bool  `json:"enabled,omitempty"`
			Key     string `json:"key"`
			Value   string `json:"value"`
		}
		var entries []json.RawMessage
		if err := decodeStrictJSON(trimmed, &entries); err != nil {
			return nil, collectionHeadersArray, fmt.Errorf(
				"decode ordered headers: %w",
				err,
			)
		}
		headers := make([]Header, 0, len(entries))
		for index, entry := range entries {
			var wire headerWire
			if err := decodeStrictJSON(entry, &wire); err != nil {
				return nil, collectionHeadersArray, fmt.Errorf(
					"decode ordered header %d: %w",
					index+1,
					err,
				)
			}
			enabled := true
			if wire.Enabled != nil {
				enabled = *wire.Enabled
			}
			headers = append(headers, Header{
				Enabled: enabled,
				Key:     wire.Key,
				Value:   wire.Value,
			})
		}
		return headers, collectionHeadersArray, nil
	default:
		return nil, collectionHeadersUnspecified, fmt.Errorf(
			"headers must be an object for version 1 or an array for version 2",
		)
	}
}

func decodeStrictJSON(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("multiple JSON values")
		}
		return err
	}
	return nil
}
