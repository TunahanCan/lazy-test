// Package report produces JUnit XML and JSON test reports.
package report

import (
	"encoding/xml"
	"fmt"
	"os"
	"time"

	"lazytest/internal/core"
	"lazytest/internal/tcp"
)

// JUnitTestSuites is the root element for JUnit XML.
type JUnitTestSuites struct {
	XMLName  xml.Name         `xml:"testsuites"`
	Name     string           `xml:"name,attr"`
	Tests    int              `xml:"tests,attr"`
	Failures int              `xml:"failures,attr"`
	Time     string           `xml:"time,attr"`
	Suites   []JUnitTestSuite `xml:"testsuite"`
}

// JUnitTestSuite represents one testsuite (e.g. smoke or drift).
type JUnitTestSuite struct {
	XMLName  xml.Name        `xml:"testsuite"`
	Name     string          `xml:"name,attr"`
	Tests    int             `xml:"tests,attr"`
	Failures int             `xml:"failures,attr"`
	Time     string          `xml:"time,attr"`
	Cases    []JUnitTestCase `xml:"testcase"`
}

// JUnitTestCase is one test case.
type JUnitTestCase struct {
	XMLName   xml.Name      `xml:"testcase"`
	Name      string        `xml:"name,attr"`
	Classname string        `xml:"classname,attr"`
	Time      string        `xml:"time,attr"`
	Failure   *JUnitFailure `xml:"failure,omitempty"`
}

// JUnitFailure holds failure message.
type JUnitFailure struct {
	Message string `xml:"message,attr"`
	Type    string `xml:"type,attr"`
	Body    string `xml:",chardata"`
}

// WriteJUnitSmoke writes smoke results to JUnit XML file.
func WriteJUnitSmoke(path string, results []core.SmokeResult, duration time.Duration) error {
	suite := JUnitTestSuite{
		Name:  "lazytest-smoke",
		Tests: len(results),
		Time:  fmt.Sprintf("%.3f", duration.Seconds()),
	}
	var failures int
	for _, r := range results {
		name := r.Method + " " + r.Path
		tc := JUnitTestCase{
			Name:      name,
			Classname: "lazytest.smoke",
			Time:      fmt.Sprintf("%.3f", float64(r.LatencyMS)/1000.0),
		}
		if !r.OK {
			failures++
			tc.Failure = &JUnitFailure{
				Message: r.Err,
				Type:    "SmokeTestFailure",
				Body:    fmt.Sprintf("status=%d err=%s", r.StatusCode, r.Err),
			}
		}
		suite.Cases = append(suite.Cases, tc)
	}
	suite.Failures = failures
	root := JUnitTestSuites{
		Name:     "lazytest",
		Tests:    len(results),
		Failures: failures,
		Time:     fmt.Sprintf("%.3f", duration.Seconds()),
		Suites:   []JUnitTestSuite{suite},
	}
	data, err := xml.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append([]byte(xml.Header), data...), 0644)
}

// WriteJUnitDrift writes drift results to JUnit XML file.
func WriteJUnitDrift(path string, results []core.DriftResult, duration time.Duration) error {
	suite := JUnitTestSuite{
		Name:  "lazytest-drift",
		Tests: len(results),
		Time:  fmt.Sprintf("%.3f", duration.Seconds()),
	}
	var failures int
	for _, r := range results {
		name := r.Method + " " + r.Path
		tc := JUnitTestCase{
			Name:      name,
			Classname: "lazytest.drift",
			Time:      "0",
		}
		if !r.OK {
			failures++
			msg := ""
			for _, f := range r.Findings {
				msg += string(f.Type) + " " + f.Path + "; "
			}
			tc.Failure = &JUnitFailure{
				Message: msg,
				Type:    "ContractDrift",
				Body:    msg,
			}
		}
		suite.Cases = append(suite.Cases, tc)
	}
	suite.Failures = failures
	root := JUnitTestSuites{
		Name:     "lazytest",
		Tests:    len(results),
		Failures: failures,
		Time:     fmt.Sprintf("%.3f", duration.Seconds()),
		Suites:   []JUnitTestSuite{suite},
	}
	data, err := xml.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append([]byte(xml.Header), data...), 0644)
}

// WriteJUnitTCP writes tcp step results to JUnit XML file.
func WriteJUnitTCP(path string, result tcp.Result) error {
	suite := JUnitTestSuite{Name: "lazytest-tcp", Tests: len(result.Steps), Time: fmt.Sprintf("%.3f", result.Duration.Seconds())}
	failures := 0
	for _, st := range result.Steps {
		name := fmt.Sprintf("tcp/%s/%d-%s", result.PlanName, st.Index, st.Kind)
		tc := JUnitTestCase{Name: name, Classname: "lazytest.tcp", Time: fmt.Sprintf("%.3f", st.Latency.Seconds())}
		if st.Err != "" {
			failures++
			tc.Failure = &JUnitFailure{Message: st.Err, Type: st.ErrorClass, Body: "hexdump=" + st.Hexdump}
		}
		suite.Cases = append(suite.Cases, tc)
	}
	suite.Failures = failures
	root := JUnitTestSuites{Name: "lazytest", Tests: len(result.Steps), Failures: failures, Time: fmt.Sprintf("%.3f", result.Duration.Seconds()), Suites: []JUnitTestSuite{suite}}
	data, err := xml.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append([]byte(xml.Header), data...), 0644)
}
