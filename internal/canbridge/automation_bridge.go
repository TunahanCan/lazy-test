package canbridge

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"validex/internal/netinspector"
	"validex/internal/openapilint"
	"validex/internal/runner"
)

// CollectionRunInput is the desktop boundary for the same JSON collection
// consumed by validex-cli.
type CollectionRunInput struct {
	OperationID string            `json:"operationId"`
	Definition  string            `json:"definition"`
	Variables   map[string]string `json:"variables"`
}

type CollectionRunResult struct {
	Report *runner.Report `json:"report,omitempty"`
	Error  *UserError     `json:"error,omitempty"`
}

type NetworkInspectInput struct {
	OperationID        string `json:"operationId"`
	URL                string `json:"url"`
	TimeoutMS          int    `json:"timeoutMs"`
	MaxRedirects       int    `json:"maxRedirects"`
	InsecureSkipVerify bool   `json:"insecureSkipVerify"`
}

type NetworkInspectResult struct {
	Report *netinspector.Report `json:"report,omitempty"`
	Error  *UserError           `json:"error,omitempty"`
}

type OpenAPILintResult struct {
	Path     string              `json:"path"`
	Report   *openapilint.Report `json:"report,omitempty"`
	Canceled bool                `json:"canceled"`
	Error    *UserError          `json:"error,omitempty"`
}

func (b *Bridge) RunCollection(input CollectionRunInput) CollectionRunResult {
	ctx, finish, err := b.beginToolOperation(input.OperationID)
	if err != nil {
		return CollectionRunResult{Error: automationError(
			"collection_operation_invalid",
			"Collection çalıştırılamadı",
			"Collection işlemi başlatılamadı.",
			"Aynı operationId ile çalışan başka bir işlem olmadığını kontrol edin.",
			err,
		)}
	}
	defer finish()

	limits := runner.DefaultLimits()
	collection, err := runner.ParseCollection(
		[]byte(input.Definition),
		limits,
	)
	if err != nil {
		return CollectionRunResult{Error: automationError(
			"collection_invalid",
			"Collection çalıştırılamadı",
			"Collection JSON tanımı geçerli değil.",
			"JSON yapısını, request alanlarını ve assertion kurallarını kontrol edin.",
			err,
		)}
	}
	if err := ctx.Err(); err != nil {
		return CollectionRunResult{Error: automationContextError(
			"collection_run_failed",
			"Collection tamamlanamadı",
			"Collection çalıştırılmadan önce iptal edildi.",
			err,
		)}
	}

	sender := runner.NewHTTPSender(nil)
	defer sender.CloseIdleConnections()
	report, runErr := runner.Run(
		ctx,
		collection,
		sender,
		runner.Options{Limits: limits, Variables: input.Variables},
	)
	result := CollectionRunResult{Report: &report}
	if runErr != nil {
		result.Error = automationContextError(
			"collection_run_failed",
			"Collection tamamlanamadı",
			"Collection çalışırken beklenmeyen bir hata oluştu.",
			runErr,
		)
	}
	return result
}

func (b *Bridge) AnalyzeNetwork(input NetworkInspectInput) NetworkInspectResult {
	ctx, finish, err := b.beginToolOperation(input.OperationID)
	if err != nil {
		return NetworkInspectResult{Error: automationError(
			"network_operation_invalid",
			"Ağ analizi başlatılamadı",
			"DNS ve redirect işlemi başlatılamadı.",
			"Aynı operationId ile çalışan başka bir işlem olmadığını kontrol edin.",
			err,
		)}
	}
	defer finish()

	report, inspectErr := netinspector.Inspect(ctx, input.URL, netinspector.Options{
		Timeout:            milliseconds(input.TimeoutMS),
		MaxRedirects:       input.MaxRedirects,
		InsecureSkipVerify: input.InsecureSkipVerify,
	})
	result := NetworkInspectResult{Report: &report}
	if inspectErr != nil {
		result.Error = automationContextError(
			"network_inspection_failed",
			"Ağ analizi tamamlanamadı",
			"DNS çözümü veya redirect zinciri tamamlanamadı.",
			inspectErr,
		)
	}
	return result
}

func (b *Bridge) LintOpenAPI() OpenAPILintResult {
	ctx := b.runtimeContext()
	if ctx == nil {
		return OpenAPILintResult{Error: automationError(
			"runtime_unavailable",
			"OpenAPI dosyası seçilemedi",
			"Desktop runtime henüz hazır değil.",
			"Uygulamayı native canbridge runtime içinde açın.",
			nil,
		)}
	}
	path, err := b.filePicker.Open(ctx, fileDialogOptions{
		Title:      "Lint uygulanacak OpenAPI dosyasını seç",
		Extensions: []string{"yaml", "yml", "json"},
	})
	if err != nil {
		return OpenAPILintResult{Error: automationError(
			"file_dialog_failed",
			"OpenAPI dosyası seçilemedi",
			"Sistem dosya seçicisi tamamlanamadı.",
			"Dosya izinlerini ve masaüstü ortamını kontrol edin.",
			err,
		)}
	}
	if strings.TrimSpace(path) == "" {
		return OpenAPILintResult{Canceled: true}
	}

	report, err := openapilint.LintFile(path, openapilint.Options{})
	if err != nil {
		return OpenAPILintResult{
			Path: path,
			Error: automationError(
				"openapi_lint_failed",
				"OpenAPI lint tamamlanamadı",
				"OpenAPI dosyası okunamadı.",
				"Dosya izinlerini ve dosyanın hâlâ mevcut olduğunu kontrol edin.",
				err,
			),
		}
	}
	return OpenAPILintResult{Path: path, Report: &report}
}

func milliseconds(value int) time.Duration {
	if value <= 0 {
		return 0
	}
	return time.Duration(value) * time.Millisecond
}

func automationContextError(
	code string,
	title string,
	message string,
	err error,
) *UserError {
	switch {
	case errors.Is(err, context.Canceled):
		return &UserError{
			Code:    "tool_canceled",
			Title:   title,
			Message: "İşlem kullanıcı tarafından iptal edildi.",
		}
	case errors.Is(err, context.DeadlineExceeded):
		return &UserError{
			Code:    "tool_timeout",
			Title:   title,
			Message: "İşlem belirtilen timeout süresinde tamamlanamadı.",
			Hint:    "Timeout değerini artırın veya hedef servisi kontrol edin.",
		}
	default:
		return automationError(
			code,
			title,
			message,
			"Girdi ve hedef servis ayrıntılarını kontrol edin.",
			err,
		)
	}
}

func automationError(
	code string,
	title string,
	message string,
	hint string,
	err error,
) *UserError {
	result := &UserError{
		Code:    code,
		Title:   title,
		Message: message,
		Hint:    hint,
	}
	if err != nil {
		result.Technical = fmt.Sprint(err)
	}
	return result
}
