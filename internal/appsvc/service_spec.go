package appsvc

import (
	"fmt"
	"sort"
	"strings"

	"lazytest/internal/config"
	"lazytest/internal/core"
)

// LoadSpec parses OpenAPI and rebuilds endpoint read-model cache.
//
// Java analogy: this is the "spec import use-case" that updates an in-memory repository.
func (s *Service) LoadSpec(filePath string) (SpecSummary, error) {
	eps, doc, err := core.LoadOpenAPI(filePath)
	if err != nil {
		return SpecSummary{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.specPath = filePath
	s.endpoints = eps
	s.byID = map[string]core.Endpoint{}

	tags := map[string]struct{}{}
	for _, ep := range eps {
		id := endpointID(ep)
		s.byID[id] = ep
		for _, t := range ep.Tags {
			tags[t] = struct{}{}
		}
	}

	tagList := make([]string, 0, len(tags))
	for t := range tags {
		tagList = append(tagList, t)
	}
	sort.Strings(tagList)

	if doc != nil && doc.Info != nil {
		s.docTitle = doc.Info.Title
		s.docVer = doc.Info.Version
	}

	return SpecSummary{
		Title:          s.docTitle,
		Version:        s.docVer,
		EndpointCount:  len(eps),
		EndpointsCount: len(eps),
		TagCount:       len(tagList),
		Tags:           tagList,
	}, nil
}

// ListEndpoints returns filtered/sorted endpoint DTOs for UI presentation.
func (s *Service) ListEndpoints(filter EndpointFilter) []EndpointDTO {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := strings.ToLower(strings.TrimSpace(filter.Query))
	out := make([]EndpointDTO, 0, len(s.endpoints))

	for _, ep := range s.endpoints {
		id := endpointID(ep)
		if filter.Tag != "" && !contains(ep.Tags, filter.Tag) {
			continue
		}
		if filter.Method != "" && !strings.EqualFold(ep.Method, filter.Method) {
			continue
		}
		if query != "" {
			h := strings.ToLower(ep.Summary + " " + ep.Path + " " + ep.OperationID)
			if !strings.Contains(h, query) {
				continue
			}
		}
		out = append(out, EndpointDTO{
			ID:          id,
			Method:      ep.Method,
			Path:        ep.Path,
			Summary:     ep.Summary,
			OperationID: ep.OperationID,
			Tags:        ep.Tags,
		})
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Path == out[j].Path {
			return out[i].Method < out[j].Method
		}
		return out[i].Path < out[j].Path
	})
	return out
}

// BuildExampleRequest builds a ready-to-send request template for an endpoint.
func (s *Service) BuildExampleRequest(endpointID, envName, authProfile string, overrides map[string]string) (RequestDTO, error) {
	s.mu.RLock()
	ep, ok := s.byID[endpointID]
	s.mu.RUnlock()
	if !ok {
		return RequestDTO{}, fmt.Errorf("endpoint not found: %s", endpointID)
	}

	baseURL, headers, authHeader := s.resolveContext(envName, authProfile)
	if v := overrides["baseURL"]; v != "" {
		baseURL = v
	}

	urlStr, err := core.BuildURL(baseURL, ep.Path, nil)
	if err != nil {
		return RequestDTO{}, err
	}
	body, _ := core.ExampleBody(ep.Schema)

	merged := map[string]string{}
	for k, v := range headers {
		merged[k] = v
	}
	for k, v := range authHeader {
		merged[k] = v
	}

	return RequestDTO{
		EndpointID: endpointID,
		Method:     ep.Method,
		URL:        urlStr,
		Headers:    merged,
		Body:       string(body),
	}, nil
}

// resolveContext reads env/auth settings and produces merged transport context.
func (s *Service) resolveContext(envName, authProfile string) (string, map[string]string, map[string]string) {
	base := ""
	headers := map[string]string{}
	authHeader := map[string]string{}

	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.envCfg != nil {
		if env := s.envCfg.GetEnvironment(envName); env != nil {
			base = env.BaseURL
			for k, v := range env.Headers {
				headers[k] = v
			}
		}
	}

	if s.authCfg != nil {
		if p := s.authCfg.GetAuthProfile(authProfile); p != nil {
			if p.Type == "jwt" && p.Token != "" {
				authHeader["Authorization"] = "Bearer " + p.Token
			}
			if p.Type == "apikey" && p.Header != "" && p.Key != "" {
				authHeader[p.Header] = p.Key
			}
		}
	}
	return base, headers, authHeader
}

// LoadConfigs loads env/auth yaml files and stores them in service context.
func (s *Service) LoadConfigs(envPath, authPath string) error {
	if envPath != "" {
		e, err := config.LoadEnvConfig(envPath)
		if err != nil {
			return err
		}
		s.envCfg = e
	}
	if authPath != "" {
		a, err := config.LoadAuthConfig(authPath)
		if err != nil {
			return err
		}
		s.authCfg = a
	}
	return nil
}

func endpointID(ep core.Endpoint) string {
	if ep.OperationID != "" {
		return ep.OperationID
	}
	return strings.ToUpper(ep.Method) + " " + ep.Path
}

func contains(s []string, x string) bool {
	for _, v := range s {
		if v == x {
			return true
		}
	}
	return false
}
