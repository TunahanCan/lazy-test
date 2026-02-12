// Package config loads and validates env.yaml and auth.yaml.
package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// EnvConfig represents env.yaml: environments (dev/test/prod).
type EnvConfig struct {
	Environments []Environment `yaml:"environments"`
}

// Environment holds baseURL, headers, rate limit for one env.
type Environment struct {
	Name        string            `yaml:"name"`
	BaseURL     string            `yaml:"baseURL"`
	Headers     map[string]string `yaml:"headers"`
	RateLimitRPS int               `yaml:"rateLimitRPS"`
}

// AuthConfig represents auth.yaml: JWT / API key profiles.
type AuthConfig struct {
	Profiles []AuthProfile `yaml:"profiles"`
}

// AuthProfile is one auth method (jwt or apikey).
type AuthProfile struct {
	Name   string `yaml:"name"`
	Type   string `yaml:"type"` // "jwt" or "apikey"
	Token  string `yaml:"token,omitempty"`
	Header string `yaml:"header,omitempty"`
	Key    string `yaml:"key,omitempty"`
}

// LoadEnvConfig reads env.yaml from path.
func LoadEnvConfig(path string) (*EnvConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read env config: %w", err)
	}
	var cfg EnvConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse env config: %w", err)
	}
	return &cfg, nil
}

// LoadAuthConfig reads auth.yaml from path.
func LoadAuthConfig(path string) (*AuthConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read auth config: %w", err)
	}
	var cfg AuthConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse auth config: %w", err)
	}
	return &cfg, nil
}

// GetEnvironment returns env by name from EnvConfig.
func (e *EnvConfig) GetEnvironment(name string) *Environment {
	for i := range e.Environments {
		if e.Environments[i].Name == name {
			return &e.Environments[i]
		}
	}
	return nil
}

// GetAuthProfile returns profile by name.
func (a *AuthConfig) GetAuthProfile(name string) *AuthProfile {
	for i := range a.Profiles {
		if a.Profiles[i].Name == name {
			return &a.Profiles[i]
		}
	}
	return nil
}
