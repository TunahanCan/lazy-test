package runner

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"validex/internal/assertions"
)

// ParseCollection decodes one JSON collection from bytes under the supplied
// limits. Zero-valued limits use DefaultLimits.
func ParseCollection(data []byte, limits Limits) (Collection, error) {
	return DecodeCollection(bytes.NewReader(data), limits)
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
	if err := validateCollection(collection, normalized); err != nil {
		return Collection{}, err
	}
	return collection, nil
}

func validateCollection(collection Collection, limits Limits) error {
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
