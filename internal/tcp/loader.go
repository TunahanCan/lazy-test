package tcp

import (
	"os"

	"gopkg.in/yaml.v3"
)

func LoadScenario(path string) (Scenario, error) {
	var s Scenario
	b, err := os.ReadFile(path)
	if err != nil {
		return s, err
	}
	err = yaml.Unmarshal(b, &s)
	return s, err
}
