package core

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ABCompareResult holds diff between env A and env B for one request.
type ABCompareResult struct {
	Path         string
	Method       string
	StatusA      int
	StatusB      int
	StatusMatch  bool
	HeadersDiff  []string
	BodyStructureDiff []string
	BodyValueDiff []string
	ErrA         string
	ErrB         string
}

// RunABCompare sends the same request to baseURLA and baseURLB and diffs status, headers, body structure.
func RunABCompare(ep Endpoint, baseURLA, baseURLB string, headers map[string]string, authHeader map[string]string, timeout time.Duration) ABCompareResult {
	res := ABCompareResult{Path: ep.Path, Method: ep.Method, StatusMatch: true}
	body, _ := ExampleBody(ep.Schema)
	urlA, _ := BuildURL(baseURLA, ep.Path, nil)
	urlB, _ := BuildURL(baseURLB, ep.Path, nil)
	respA, errA := doRequest(ep, urlA, body, headers, authHeader, timeout)
	respB, errB := doRequest(ep, urlB, body, headers, authHeader, timeout)
	if errA != nil {
		res.ErrA = errA.Error()
	}
	if errB != nil {
		res.ErrB = errB.Error()
	}
	if respA != nil {
		res.StatusA = respA.StatusCode
		defer respA.Body.Close()
	}
	if respB != nil {
		res.StatusB = respB.StatusCode
		defer respB.Body.Close()
	}
	if respA != nil && respB != nil {
		res.StatusMatch = res.StatusA == res.StatusB
		if !res.StatusMatch {
			res.HeadersDiff = append(res.HeadersDiff, "status: "+strconv.Itoa(res.StatusA)+" vs "+strconv.Itoa(res.StatusB))
		}
		// Compare header keys (structure)
		keysA := headerKeys(respA.Header)
		keysB := headerKeys(respB.Header)
		for k := range keysA {
			if !keysB[k] {
				res.HeadersDiff = append(res.HeadersDiff, "header only in A: "+k)
			}
		}
		for k := range keysB {
			if !keysA[k] {
				res.HeadersDiff = append(res.HeadersDiff, "header only in B: "+k)
			}
		}
		bodyA, _ := io.ReadAll(respA.Body)
		bodyB, _ := io.ReadAll(respB.Body)
		res.BodyStructureDiff, res.BodyValueDiff = diffBody(bodyA, bodyB)
	}
	return res
}

func doRequest(ep Endpoint, urlStr string, body []byte, headers, authHeader map[string]string, timeout time.Duration) (*http.Response, error) {
	var bodyReader io.Reader
	if len(body) > 0 && (ep.Method == "POST" || ep.Method == "PUT" || ep.Method == "PATCH") {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(ep.Method, urlStr, bodyReader)
	if err != nil {
		return nil, err
	}
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	for k, v := range authHeader {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: timeout}
	return client.Do(req)
}

func headerKeys(h http.Header) map[string]bool {
	m := make(map[string]bool)
	for k := range h {
		m[strings.ToLower(k)] = true
	}
	return m
}


// diffBody returns structure diff (keys/types) and optional value diff.
func diffBody(a, b []byte) (structureDiff, valueDiff []string) {
	var ma, mb map[string]interface{}
	if json.Unmarshal(a, &ma) != nil {
		var arrA, arrB []interface{}
		if json.Unmarshal(a, &arrA) == nil && json.Unmarshal(b, &arrB) == nil {
			if len(arrA) != len(arrB) {
				structureDiff = append(structureDiff, "array length: "+strconv.Itoa(len(arrA))+" vs "+strconv.Itoa(len(arrB)))
			}
		}
		return structureDiff, valueDiff
	}
	if json.Unmarshal(b, &mb) != nil {
		structureDiff = append(structureDiff, "B is not JSON object")
		return structureDiff, valueDiff
	}
	diffMaps(ma, mb, "$", &structureDiff, &valueDiff)
	return structureDiff, valueDiff
}

func diffMaps(a, b map[string]interface{}, path string, structureDiff, valueDiff *[]string) {
	allKeys := make(map[string]bool)
	for k := range a {
		allKeys[k] = true
	}
	for k := range b {
		allKeys[k] = true
	}
	for k := range allKeys {
		subPath := path + "." + k
		va, okA := a[k]
		vb, okB := b[k]
		if !okA {
			*structureDiff = append(*structureDiff, subPath+" only in B")
			continue
		}
		if !okB {
			*structureDiff = append(*structureDiff, subPath+" only in A")
			continue
		}
		ta := reflectType(va)
		tb := reflectType(vb)
		if ta != tb {
			*structureDiff = append(*structureDiff, subPath+" type: "+ta+" vs "+tb)
			continue
		}
		switch va.(type) {
		case map[string]interface{}:
			diffMaps(va.(map[string]interface{}), vb.(map[string]interface{}), subPath, structureDiff, valueDiff)
		case []interface{}:
			arA, arB := va.([]interface{}), vb.([]interface{})
			if len(arA) != len(arB) {
				*structureDiff = append(*structureDiff, subPath+" array len: "+strconv.Itoa(len(arA))+" vs "+strconv.Itoa(len(arB)))
			}
			for i := 0; i < len(arA) && i < len(arB); i++ {
				if m1, ok1 := arA[i].(map[string]interface{}); ok1 {
					if m2, ok2 := arB[i].(map[string]interface{}); ok2 {
						diffMaps(m1, m2, subPath+"["+strconv.Itoa(i)+"]", structureDiff, valueDiff)
					}
				}
			}
		default:
			if !valuesEqual(va, vb) {
				*valueDiff = append(*valueDiff, subPath)
			}
		}
	}
}

func reflectType(v interface{}) string {
	switch v.(type) {
	case map[string]interface{}:
		return "object"
	case []interface{}:
		return "array"
	case string:
		return "string"
	case float64:
		return "number"
	case bool:
		return "boolean"
	case nil:
		return "null"
	}
	return "unknown"
}

func valuesEqual(a, b interface{}) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return reflectDeepEqual(a, b)
}

func reflectDeepEqual(a, b interface{}) bool {
	// simple equality for primitives
	switch va := a.(type) {
	case string:
		if vb, ok := b.(string); ok {
			return va == vb
		}
	case float64:
		if vb, ok := b.(float64); ok {
			return va == vb
		}
	case bool:
		if vb, ok := b.(bool); ok {
			return va == vb
		}
	}
	return false
}
