// lazytest: OpenAPI smoke tests, contract drift, A/B compare + desktop UI.
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"lazytest/internal/config"
	"lazytest/internal/core"
	"lazytest/internal/desktop"
	"lazytest/internal/lt"
	"lazytest/internal/plan"
	"lazytest/internal/report"
	"lazytest/internal/tcp"

	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	openAPIPath string
	envName     string
	baseURL     string
	envFile     string
	authFile    string
	reportPath  string
	jsonPath    string
	workers     int
	tags        string
	pathFlag    string
	methodFlag  string
	envA        string
	envB        string
	verbose     bool
)

func main() {
	root := &cobra.Command{
		Use:   "lazytest",
		Short: "OpenAPI smoke tests, contract drift, A/B compare",
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}
	root.PersistentFlags().StringVarP(&openAPIPath, "file", "f", "", "OpenAPI spec file (yaml/json)")
	root.PersistentFlags().StringVarP(&envName, "env", "e", "dev", "Environment name (dev|test|prod)")
	root.PersistentFlags().StringVar(&baseURL, "base", "", "Base URL (overrides env config)")
	root.PersistentFlags().StringVar(&envFile, "env-config", "env.yaml", "env.yaml path")
	root.PersistentFlags().StringVar(&authFile, "auth-config", "auth.yaml", "auth.yaml path")
	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Verbose logs")

	loadCmd := &cobra.Command{Use: "load", Short: "Load OpenAPI spec and print summary", RunE: runLoad}
	loadCmd.Flags().StringVarP(&openAPIPath, "file", "f", "", "OpenAPI spec file")
	loadCmd.MarkFlagRequired("file")

	runCmd := &cobra.Command{Use: "run", Short: "Run smoke, drift or tcp tests"}
	smokeCmd := &cobra.Command{Use: "smoke", Short: "Run smoke tests", RunE: runSmoke}
	smokeCmd.Flags().StringVar(&tags, "tags", "", "Filter by tags (unused in headless mode)")
	smokeCmd.Flags().StringVar(&reportPath, "report", "junit.xml", "JUnit XML output path")
	smokeCmd.Flags().StringVar(&jsonPath, "json", "out.json", "JSON report output path")
	smokeCmd.Flags().IntVar(&workers, "workers", 10, "Number of workers")
	runCmd.AddCommand(smokeCmd)

	driftCmd := &cobra.Command{Use: "drift", Short: "Run contract drift check", RunE: runDrift}
	driftCmd.Flags().StringVar(&pathFlag, "path", "", "Path to check (e.g. /customers)")
	driftCmd.Flags().StringVar(&methodFlag, "method", "GET", "HTTP method")
	runCmd.AddCommand(driftCmd)

	tcpCmd := &cobra.Command{Use: "tcp", Short: "Run TCP plan", RunE: runTCP}
	tcpCmd.Flags().StringVar(&openAPIPath, "plan", "plans/tcp.yaml", "TCP plan YAML path")
	tcpCmd.Flags().StringVar(&reportPath, "report", "junit.xml", "JUnit XML output path")
	tcpCmd.Flags().StringVar(&jsonPath, "json", "out.json", "JSON report output path")
	runCmd.AddCommand(tcpCmd)

	compareCmd := &cobra.Command{Use: "compare", Short: "A/B compare two environments", RunE: runCompare}
	compareCmd.Flags().StringVar(&envA, "envA", "dev", "First environment")
	compareCmd.Flags().StringVar(&envB, "envB", "test", "Second environment")
	compareCmd.Flags().StringVar(&pathFlag, "path", "", "Path to compare")
	compareCmd.Flags().StringVar(&methodFlag, "method", "GET", "HTTP method")

	ltCmd := &cobra.Command{Use: "lt", Short: "Run Taurus YAML plan (headless)", RunE: runLT}
	ltCmd.Flags().StringVarP(&openAPIPath, "file", "f", "", "Taurus plan YAML")

	planCmd := &cobra.Command{Use: "plan", Short: "Plan utilities"}
	planNewCmd := &cobra.Command{Use: "new", Short: "Create new plan", RunE: runPlanNew}
	planNewCmd.Flags().String("kind", "tcp", "Plan kind")
	planNewCmd.Flags().String("out", "plans/tcp.yaml", "Output path")
	planEditCmd := &cobra.Command{Use: "edit <path>", Short: "Edit plan with $EDITOR", Args: cobra.ExactArgs(1), RunE: runPlanEdit}
	planCmd.AddCommand(planNewCmd, planEditCmd)

	desktopCmd := &cobra.Command{Use: "desktop", Short: "Run native desktop UI", RunE: runDesktop}

	root.AddCommand(loadCmd, runCmd, compareCmd, ltCmd, planCmd, desktopCmd)

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
}

func runDesktop(cmd *cobra.Command, args []string) error {
	return desktop.Run()
}

func runLoad(cmd *cobra.Command, args []string) error {
	if openAPIPath == "" {
		return fmt.Errorf("--file is required")
	}
	endpoints, doc, err := core.LoadOpenAPI(openAPIPath)
	if err != nil {
		return err
	}
	title, version := "", ""
	if doc != nil && doc.Info != nil {
		title = doc.Info.Title
		version = doc.Info.Version
	}
	fmt.Printf("Loaded %d endpoints from %s\n", len(endpoints), openAPIPath)
	if title != "" || version != "" {
		fmt.Printf("Spec: %s %s\n", title, version)
	}
	return nil
}

func resolveContext() (string, map[string]string, map[string]string, error) {
	base := ""
	headers := map[string]string{}
	authHeader := map[string]string{}

	if envFile != "" {
		envCfg, err := config.LoadEnvConfig(envFile)
		if err == nil {
			if e := envCfg.GetEnvironment(envName); e != nil {
				base = e.BaseURL
				for k, v := range e.Headers {
					headers[k] = v
				}
			}
		}
	}
	if baseURL != "" {
		base = baseURL
	}
	if authFile != "" {
		authCfg, err := config.LoadAuthConfig(authFile)
		if err == nil {
			if p := authCfg.GetAuthProfile("default-jwt"); p != nil && p.Type == "jwt" {
				authHeader["Authorization"] = "Bearer " + p.Token
			}
		}
	}
	return base, headers, authHeader, nil
}

func runSmoke(cmd *cobra.Command, args []string) error {
	if openAPIPath == "" {
		return fmt.Errorf("--file is required")
	}
	endpoints, _, err := core.LoadOpenAPI(openAPIPath)
	if err != nil {
		return err
	}
	base, headers, authHeader, _ := resolveContext()
	if base == "" {
		return fmt.Errorf("set --base or env config baseURL")
	}
	cfg := core.SmokeConfig{
		BaseURL:      base,
		Headers:      headers,
		AuthHeader:   authHeader,
		Timeout:      5 * time.Second,
		Workers:      workers,
		RateLimitRPS: 5,
	}
	start := time.Now()
	results := core.RunSmokeBulk(context.Background(), cfg, endpoints)
	duration := time.Since(start)
	if err := report.WriteJUnitSmoke(reportPath, results, duration); err != nil {
		fmt.Fprintf(os.Stderr, "write junit: %v\n", err)
	}
	rep := report.SmokeReportFromResults(results, duration)
	if err := report.WriteJSON(jsonPath, rep); err != nil {
		fmt.Fprintf(os.Stderr, "write json: %v\n", err)
	}
	fmt.Printf("Smoke: %d total, %d passed, %d failed in %v\n", len(results), rep.Smoke.Passed, rep.Smoke.Failed, duration)
	_ = tags
	return nil
}

func runDrift(cmd *cobra.Command, args []string) error {
	if openAPIPath == "" {
		return fmt.Errorf("--file is required")
	}
	endpoints, _, err := core.LoadOpenAPI(openAPIPath)
	if err != nil {
		return err
	}
	method := strings.ToUpper(methodFlag)
	var ep *core.Endpoint
	for i := range endpoints {
		if endpoints[i].Path == pathFlag && strings.ToUpper(endpoints[i].Method) == method {
			ep = &endpoints[i]
			break
		}
	}
	if ep == nil {
		return fmt.Errorf("endpoint %s %s not found", methodFlag, pathFlag)
	}
	base, headers, authHeader, _ := resolveContext()
	cfg := core.SmokeConfig{BaseURL: base, Headers: headers, AuthHeader: authHeader, Timeout: 5 * time.Second}
	statusCode, body, err := core.FetchResponse(cfg, *ep)
	if err != nil {
		return err
	}
	dr := core.RunDrift(body, ep.Schema, statusCode)
	dr.Path = ep.Path
	dr.Method = ep.Method
	fmt.Printf("Drift %s %s: OK=%v findings=%d\n", ep.Method, ep.Path, dr.OK, len(dr.Findings))
	for _, f := range dr.Findings {
		fmt.Printf("  %s %s\n", f.Type, f.Path)
	}
	return nil
}

func runLT(cmd *cobra.Command, args []string) error {
	planPath := openAPIPath
	if planPath == "" {
		planPath = "examples/taurus/checkouts.yaml"
	}
	p, err := lt.ParseFile(planPath)
	if err != nil {
		return fmt.Errorf("parse Taurus plan: %w", err)
	}
	r := &lt.Runner{Plan: p, Config: lt.DefaultRunConfig()}
	if err := r.Run(context.Background()); err != nil {
		return err
	}
	s := r.Metrics.Snapshot()
	fmt.Printf("LT done: total=%d rps=%.2f p95=%dms err=%.2f%%\n", s.Total, s.RPS, s.P95, s.ErrorRatePct)
	return nil
}

func runCompare(cmd *cobra.Command, args []string) error {
	if openAPIPath == "" {
		return fmt.Errorf("--file is required")
	}
	endpoints, _, err := core.LoadOpenAPI(openAPIPath)
	if err != nil {
		return err
	}
	method := strings.ToUpper(methodFlag)
	var ep *core.Endpoint
	for i := range endpoints {
		if endpoints[i].Path == pathFlag && strings.ToUpper(endpoints[i].Method) == method {
			ep = &endpoints[i]
			break
		}
	}
	if ep == nil {
		return fmt.Errorf("endpoint %s %s not found", methodFlag, pathFlag)
	}
	envCfg, err := config.LoadEnvConfig(envFile)
	if err != nil {
		return err
	}
	ea := envCfg.GetEnvironment(envA)
	eb := envCfg.GetEnvironment(envB)
	if ea == nil || eb == nil {
		return fmt.Errorf("environments %s and %s must be in env config", envA, envB)
	}
	res := core.RunABCompare(*ep, ea.BaseURL, eb.BaseURL, ea.Headers, nil, 5*time.Second)
	fmt.Printf("A/B %s %s: Status A=%d B=%d Match=%v\n", ep.Method, ep.Path, res.StatusA, res.StatusB, res.StatusMatch)
	for _, d := range res.HeadersDiff {
		fmt.Println("  ", d)
	}
	for _, d := range res.BodyStructureDiff {
		fmt.Println("  [struct]", d)
	}
	return nil
}

func runPlanNew(cmd *cobra.Command, args []string) error {
	kind, _ := cmd.Flags().GetString("kind")
	out, _ := cmd.Flags().GetString("out")
	var sample string
	switch kind {
	case "tcp":
		sample = `kind: tcp
name: redis-banner
host: 127.0.0.1
port: 6379
options:
  dial_timeout_ms: 2000
  timeout_ms: 1500
  keepalive_ms: 30000
  nodelay: true
  retry: { max_attempts: 3, strategy: exponential, base_ms: 100, max_ms: 2000 }
  breaker: { window_sec: 60, failures: 5, half_open: 2 }
steps:
  - kind: connect
  - kind: read
    read: { until: "\n", assert: { contains: "REDIS" } }
  - kind: close
`
	default:
		sample = "kind: " + kind + "\n"
	}
	if err := os.WriteFile(out, []byte(sample), 0o644); err != nil {
		return err
	}
	fmt.Println("created:", out)
	return nil
}

func runPlanEdit(cmd *cobra.Command, args []string) error {
	return plan.Edit(args[0])
}

func runTCP(cmd *cobra.Command, args []string) error {
	b, err := os.ReadFile(openAPIPath)
	if err != nil {
		return err
	}
	if err := plan.ValidateCUE(plan.KindTCP, b); err != nil {
		return err
	}
	var s tcp.Scenario
	if err := yaml.Unmarshal(b, &s); err != nil {
		return err
	}
	res, err := tcp.Run(context.Background(), s)
	if verbose {
		for _, st := range res.Steps {
			fmt.Printf("step=%d kind=%s bytes(w/r)=%d/%d latency=%s err=%s breaker=%s\n", st.Index, st.Kind, st.BytesWrite, st.BytesRead, st.Latency, st.Err, res.BreakerState)
		}
	}
	if e := report.WriteJUnitTCP(reportPath, res); e != nil {
		fmt.Fprintln(os.Stderr, "write junit:", e)
	}
	if e := report.WriteJSON(jsonPath, report.TCPReportFromResult(res, res.Duration)); e != nil {
		fmt.Fprintln(os.Stderr, "write json:", e)
	}
	if err != nil {
		return err
	}
	fmt.Printf("TCP %s: ok=%v attempts=%d duration=%s\n", s.Name, res.OK, res.Attempts, res.Duration)
	return nil
}
