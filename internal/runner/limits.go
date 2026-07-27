package runner

import "fmt"

func normalizeLimits(input Limits) (Limits, error) {
	defaults := DefaultLimits()
	if input.MaxCollectionBytes == 0 {
		input.MaxCollectionBytes = defaults.MaxCollectionBytes
	}
	if input.MaxRequests == 0 {
		input.MaxRequests = defaults.MaxRequests
	}
	if input.MaxRequestBodyBytes == 0 {
		input.MaxRequestBodyBytes = defaults.MaxRequestBodyBytes
	}
	if input.MaxResponseBodyBytes == 0 {
		input.MaxResponseBodyBytes = defaults.MaxResponseBodyBytes
	}
	if input.MaxResponseHeaderBytes == 0 {
		input.MaxResponseHeaderBytes = defaults.MaxResponseHeaderBytes
	}
	if input.MaxReportBodyBytes == 0 {
		input.MaxReportBodyBytes = defaults.MaxReportBodyBytes
	}
	if input.MaxReportHeaderBytes == 0 {
		input.MaxReportHeaderBytes = defaults.MaxReportHeaderBytes
	}
	if input.DefaultTimeoutMS == 0 {
		input.DefaultTimeoutMS = defaults.DefaultTimeoutMS
	}
	if input.MaxTimeoutMS == 0 {
		input.MaxTimeoutMS = defaults.MaxTimeoutMS
	}

	switch {
	case input.MaxCollectionBytes < 1 || input.MaxCollectionBytes > hardMaxCollectionBytes:
		return Limits{}, fmt.Errorf("max collection bytes must be between 1 and %d", hardMaxCollectionBytes)
	case input.MaxRequests < 1 || input.MaxRequests > hardMaxRequests:
		return Limits{}, fmt.Errorf("max requests must be between 1 and %d", hardMaxRequests)
	case input.MaxRequestBodyBytes < 1 || input.MaxRequestBodyBytes > hardMaxRequestBodyBytes:
		return Limits{}, fmt.Errorf("max request body bytes must be between 1 and %d", hardMaxRequestBodyBytes)
	case input.MaxResponseBodyBytes < 1 || input.MaxResponseBodyBytes > hardMaxResponseBodyBytes:
		return Limits{}, fmt.Errorf("max response body bytes must be between 1 and %d", hardMaxResponseBodyBytes)
	case input.MaxResponseHeaderBytes < 1 || input.MaxResponseHeaderBytes > hardMaxResponseHeaderBytes:
		return Limits{}, fmt.Errorf("max response header bytes must be between 1 and %d", hardMaxResponseHeaderBytes)
	case input.MaxReportBodyBytes < 1 || input.MaxReportBodyBytes > hardMaxReportBodyBytes:
		return Limits{}, fmt.Errorf("max report body bytes must be between 1 and %d", hardMaxReportBodyBytes)
	case input.MaxReportHeaderBytes < 1 || input.MaxReportHeaderBytes > hardMaxReportHeaderBytes:
		return Limits{}, fmt.Errorf("max report header bytes must be between 1 and %d", hardMaxReportHeaderBytes)
	case input.MaxTimeoutMS < 1 || input.MaxTimeoutMS > hardMaxTimeoutMS:
		return Limits{}, fmt.Errorf("max timeout must be between 1 and %d ms", hardMaxTimeoutMS)
	case input.DefaultTimeoutMS < 1 || input.DefaultTimeoutMS > input.MaxTimeoutMS:
		return Limits{}, fmt.Errorf("default timeout must be between 1 and %d ms", input.MaxTimeoutMS)
	default:
		return input, nil
	}
}
