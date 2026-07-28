package runner

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"

	"validex/internal/assertions"
)

// ParseCollection decodes one JSON collection from bytes under the supplied
// limits. Zero-valued limits use DefaultLimits.
func ParseCollection(data []byte, limits Limits) (Collection, error) {
	return DecodeCollection(bytes.NewReader(data), limits)
}

// EncodeCollection validates and writes one collection using the canonical v2
// wire model. It is the persistence boundary for collection files: legacy v1
// input can be decoded, edited, and encoded without producing the invalid
// combination of a v1 version field and v2 ordered headers.
func EncodeCollection(
	writer io.Writer,
	collection Collection,
	limits Limits,
) error {
	if writer == nil {
		return fmt.Errorf("collection writer is required")
	}
	normalized, err := normalizeLimits(limits)
	if err != nil {
		return err
	}
	if err := validateCollection(collection, normalized); err != nil {
		return err
	}
	wire, err := collection.canonicalWire()
	if err != nil {
		return err
	}
	if _, err := boundedJSONSize(wire, normalized.MaxCollectionBytes); err != nil {
		if errors.Is(err, errJSONSizeLimit) {
			return fmt.Errorf(
				"encoded collection exceeds %d bytes",
				normalized.MaxCollectionBytes,
			)
		}
		return fmt.Errorf("preflight collection encoding: %w", err)
	}
	encoded, err := json.Marshal(wire)
	if err != nil {
		return fmt.Errorf("encode collection: %w", err)
	}
	if int64(len(encoded)) > normalized.MaxCollectionBytes {
		return fmt.Errorf(
			"encoded collection exceeds %d bytes",
			normalized.MaxCollectionBytes,
		)
	}
	if _, err := io.Copy(writer, bytes.NewReader(encoded)); err != nil {
		return fmt.Errorf("write collection: %w", err)
	}
	return nil
}

// DecodeCollection decodes exactly one JSON collection and rejects unknown
// fields, trailing JSON values, and unsafe sizes.
func DecodeCollection(reader io.Reader, limits Limits) (Collection, error) {
	normalized, err := normalizeLimits(limits)
	if err != nil {
		return Collection{}, err
	}
	if reader == nil {
		return Collection{}, fmt.Errorf("collection reader is required")
	}
	data, err := io.ReadAll(io.LimitReader(reader, normalized.MaxCollectionBytes+1))
	if err != nil {
		return Collection{}, fmt.Errorf("read collection: %w", err)
	}
	if int64(len(data)) > normalized.MaxCollectionBytes {
		return Collection{}, fmt.Errorf("collection exceeds %d bytes", normalized.MaxCollectionBytes)
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	decoder.UseNumber()
	var collection Collection
	if err := decoder.Decode(&collection); err != nil {
		return Collection{}, fmt.Errorf("decode collection: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return Collection{}, fmt.Errorf("decode collection: multiple JSON values")
		}
		return Collection{}, fmt.Errorf("decode collection: %w", err)
	}
	if err := validateCollectionWireCompatibility(collection); err != nil {
		return Collection{}, err
	}
	if err := validateCollection(collection, normalized); err != nil {
		return Collection{}, err
	}
	return collection, nil
}

func validateCollection(collection Collection, limits Limits) error {
	switch collection.Version {
	case CollectionVersionUnspecified, CollectionVersionV1:
	case CollectionVersionV2:
	default:
		return fmt.Errorf(
			"collection version %s is not supported",
			collection.Version,
		)
	}
	if len(collection.Requests) > limits.MaxRequests {
		return fmt.Errorf("collection has %d requests; maximum is %d", len(collection.Requests), limits.MaxRequests)
	}
	if err := validateVariables("collection", collection.Variables); err != nil {
		return err
	}
	seenIDs := make(map[string]struct{}, len(collection.Requests))
	assertionCount := 0
	for index, request := range collection.Requests {
		label := fmt.Sprintf("request %d", index+1)
		if strings.TrimSpace(request.ID) != "" {
			if _, exists := seenIDs[request.ID]; exists {
				return fmt.Errorf("%s uses duplicate id %q", label, request.ID)
			}
			seenIDs[request.ID] = struct{}{}
		}
		if strings.TrimSpace(request.Method) == "" {
			return fmt.Errorf("%s method is required", label)
		}
		if strings.TrimSpace(request.URL) == "" {
			return fmt.Errorf("%s URL is required", label)
		}
		if request.TimeoutMS < 0 || request.TimeoutMS > limits.MaxTimeoutMS {
			return fmt.Errorf("%s timeoutMs must be between 1 and %d, or zero for the default", label, limits.MaxTimeoutMS)
		}
		if int64(len(request.Body)) > limits.MaxRequestBodyBytes {
			return fmt.Errorf("%s body exceeds %d bytes", label, limits.MaxRequestBodyBytes)
		}
		if len(request.Headers) > maxHeaders {
			return fmt.Errorf("%s has %d headers; maximum is %d", label, len(request.Headers), maxHeaders)
		}
		for headerIndex, header := range request.Headers {
			if len(header.Value) > maxHeaderValueBytes {
				return fmt.Errorf(
					"%s header %d exceeds %d bytes",
					label,
					headerIndex+1,
					maxHeaderValueBytes,
				)
			}
		}
		if err := validateVariables(label, request.Variables); err != nil {
			return err
		}
		if len(request.Assertions) > maxAssertionsPerRequest {
			return fmt.Errorf(
				"%s has %d assertions; maximum is %d",
				label,
				len(request.Assertions),
				maxAssertionsPerRequest,
			)
		}
		assertionCount += len(request.Assertions)
		if assertionCount > maxAssertionsPerCollection {
			return fmt.Errorf(
				"collection has %d assertions; maximum is %d",
				assertionCount,
				maxAssertionsPerCollection,
			)
		}
		for assertionIndex, assertion := range request.Assertions {
			if err := assertions.Validate(assertion); err != nil {
				return fmt.Errorf("%s assertion %d: %w", label, assertionIndex+1, err)
			}
		}
	}
	return nil
}

func validateCollectionWireCompatibility(collection Collection) error {
	for index, request := range collection.Requests {
		label := fmt.Sprintf("request %d", index+1)
		if isLegacyCollectionVersion(collection.Version) &&
			request.headerFormat == collectionHeadersArray {
			return fmt.Errorf(
				"%s uses ordered header arrays, which require collection version 2",
				label,
			)
		}
		if collection.Version == CollectionVersionV2 &&
			request.headerFormat == collectionHeadersObject {
			return fmt.Errorf(
				"%s uses a legacy header object; version 2 requires an ordered header array",
				label,
			)
		}
	}
	return nil
}

func isLegacyCollectionVersion(version CollectionVersion) bool {
	return version == CollectionVersionUnspecified ||
		version == CollectionVersionV1
}

// UnmarshalJSON preserves the numeric collection-version wire contract while
// exposing a string-backed closed domain inside runner.
func (version *CollectionVersion) UnmarshalJSON(data []byte) error {
	if version == nil {
		return fmt.Errorf("collection version destination is required")
	}
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		*version = CollectionVersionUnspecified
		return nil
	}
	var number int
	if err := json.Unmarshal(data, &number); err != nil {
		return fmt.Errorf("collection version must be an integer: %w", err)
	}
	if number == 0 {
		*version = CollectionVersionUnspecified
		return nil
	}
	*version = CollectionVersion(strconv.Itoa(number))
	return nil
}

// MarshalJSON preserves the numeric collection-version wire contract. A
// Collection itself always overrides this with CurrentCollectionVersion.
func (version CollectionVersion) MarshalJSON() ([]byte, error) {
	if version == CollectionVersionUnspecified {
		return []byte("0"), nil
	}
	number, err := strconv.Atoi(string(version))
	if err != nil {
		return nil, fmt.Errorf("invalid collection version %q", version)
	}
	return json.Marshal(number)
}
