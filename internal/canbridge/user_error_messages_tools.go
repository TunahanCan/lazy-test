package canbridge

// Mock server errors are intentionally split by operation. The frontend can
// therefore translate two failures with the same stable code without losing
// the action that failed.
var (
	userErrorMockRoutesUpdate = userErrorDefinition{
		Code:       UserErrorMockRoutesInvalid,
		MessageKey: "backend.error.mock.routes.update",
		Title:      "Mock route’ları uygulanamadı",
		Message:    "Mock route yapılandırması doğrulanamadı veya uygulanamadı.",
		Hint:       "Route method, path, status ve yanıt alanlarını kontrol edin.",
	}
	userErrorMockAlreadyRunning = userErrorDefinition{
		Code:       UserErrorMockAlreadyRunning,
		MessageKey: "backend.error.mock.server.alreadyRunning",
		Title:      "Mock server zaten çalışıyor",
		Message:    "Çalışan mock server durdurulmadan yeni bir server başlatılamaz.",
		Hint:       "Önce çalışan mock server’ı durdurun.",
	}
	userErrorMockRoutesPrepareStart = userErrorDefinition{
		Code:       UserErrorMockRoutesInvalid,
		MessageKey: "backend.error.mock.routes.prepareStart",
		Title:      "Mock route’ları uygulanamadı",
		Message:    "Kayıtlı route’lar yeni mock server için hazırlanamadı.",
		Hint:       "Route method, path, status ve yanıt alanlarını kontrol edin.",
	}
	userErrorMockServerStart = userErrorDefinition{
		Code:       UserErrorMockStartFailed,
		MessageKey: "backend.error.mock.server.start",
		Title:      "Mock server başlatılamadı",
		Message:    "Mock server seçilen portta dinlemeye başlayamadı.",
		Hint:       "Portun kullanılabilir olduğunu ve server durumunu kontrol edin.",
	}
	userErrorMockServerStop = userErrorDefinition{
		Code:       UserErrorMockStopFailed,
		MessageKey: "backend.error.mock.server.stop",
		Title:      "Mock server durdurulamadı",
		Message:    "Mock server ayrılan sürede kapatılamadı.",
		Hint:       "Server durumunu kontrol edip yeniden deneyin.",
	}
	userErrorMockImportRuntimeUnavailable = userErrorDefinition{
		Code:       UserErrorRuntimeUnavailable,
		MessageKey: "backend.error.mock.import.runtimeUnavailable",
		Title:      "OpenAPI dosyası seçilemedi",
		Message:    "Desktop runtime henüz hazır değil.",
		Hint:       "Uygulama başlatıldıktan sonra yeniden deneyin.",
	}
	userErrorMockImportFileDialog = userErrorDefinition{
		Code:       UserErrorFileDialogFailed,
		MessageKey: "backend.error.mock.import.fileDialog",
		Title:      "OpenAPI dosyası seçilemedi",
		Message:    "Sistem dosya seçicisi tamamlanamadı.",
		Hint:       "Dosya erişim izinlerini kontrol edip yeniden deneyin.",
	}
	userErrorMockImportInvalidOpenAPI = userErrorDefinition{
		Code:       UserErrorInvalidOpenAPI,
		MessageKey: "backend.error.mock.import.invalidOpenApi",
		Title:      "Mock route’ları üretilemedi",
		Message:    "OpenAPI belgesi mock route’larına dönüştürülemedi.",
		Hint:       "OpenAPI sürümünü, sözdizimini ve response example alanlarını kontrol edin.",
	}
	userErrorMockImportCanceled = userErrorDefinition{
		Code:       UserErrorOperationCanceled,
		MessageKey: "backend.error.mock.import.canceled",
		Title:      "Mock route içe aktarma iptal edildi",
		Message:    "Uygulama kapanırken veya yenilenirken içe aktarma işlemi iptal edildi.",
		Hint:       "Uygulama hazır olduğunda dosyayı yeniden seçin.",
	}
	userErrorMockImportApplyRoutes = userErrorDefinition{
		Code:       UserErrorMockRoutesInvalid,
		MessageKey: "backend.error.mock.import.applyRoutes",
		Title:      "Mock route’ları uygulanamadı",
		Message:    "OpenAPI belgesinden üretilen route’lar mock server’a uygulanamadı.",
		Hint:       "Üretilen route method, path, status ve yanıt alanlarını kontrol edin.",
	}
	userErrorDiagnosticsCoverageSpecMissing = userErrorDefinition{
		Code:       UserErrorCoverageSpecMissing,
		MessageKey: "backend.error.diagnostics.coverage.specMissing",
		Title:      "Coverage kaynağı bulunamadı",
		Message:    "Bu oturumda içe aktarılmış OpenAPI endpoint’i yok.",
		Hint:       "Önce OpenAPI dosyası içe aktarın veya endpoint listesini elle girin.",
	}
)

type protocolUserErrorDefinitions struct {
	Failed       userErrorDefinition
	Canceled     userErrorDefinition
	Timeout      userErrorDefinition
	InvalidInput userErrorDefinition
}

var (
	userErrorProtocolSSEStart = protocolUserErrorDefinitions{
		Failed: userErrorDefinition{
			Code:       UserErrorSSEFailed,
			MessageKey: "backend.error.protocol.sse.start.failed",
			Title:      "SSE akışı başlatılamadı",
			Message:    "Bağlantı veya protokol işlemi başarısız oldu.",
			Hint:       "Adres, timeout, TLS ve kimlik doğrulama bilgilerini kontrol edin.",
		},
		Canceled: userErrorDefinition{
			Code:       UserErrorToolCanceled,
			MessageKey: "backend.error.protocol.sse.start.canceled",
			Title:      "SSE akışı başlatılamadı",
			Message:    "İşlem iptal edildi.",
			Hint:       "Gerekirse akışı yeniden başlatın.",
		},
		Timeout: userErrorDefinition{
			Code:       UserErrorToolTimeout,
			MessageKey: "backend.error.protocol.sse.start.timeout",
			Title:      "SSE akışı başlatılamadı",
			Message:    "Hedef belirtilen sürede yanıt vermedi.",
			Hint:       "Timeout değerini ve hedef servisin erişilebilirliğini kontrol edin.",
		},
		InvalidInput: userErrorDefinition{
			Code:       UserErrorInvalidInput,
			MessageKey: "backend.error.protocol.sse.start.invalidInput",
			Title:      "SSE akışı başlatılamadı",
			Message:    "SSE isteği doğrulanamadı.",
			Hint:       "SSE URL, header, timeout ve operationId alanlarını kontrol edin.",
		},
	}
	userErrorProtocolSSERead = protocolUserErrorDefinitions{
		Failed: userErrorDefinition{
			Code:       UserErrorSSEFailed,
			MessageKey: "backend.error.protocol.sse.read.failed",
			Title:      "SSE akışı tamamlanamadı",
			Message:    "Bağlantı veya protokol işlemi başarısız oldu.",
			Hint:       "Adres, timeout, TLS ve kimlik doğrulama bilgilerini kontrol edin.",
		},
		Canceled: userErrorDefinition{
			Code:       UserErrorToolCanceled,
			MessageKey: "backend.error.protocol.sse.read.canceled",
			Title:      "SSE akışı tamamlanamadı",
			Message:    "İşlem iptal edildi.",
			Hint:       "Gerekirse akışı yeniden başlatın.",
		},
		Timeout: userErrorDefinition{
			Code:       UserErrorToolTimeout,
			MessageKey: "backend.error.protocol.sse.read.timeout",
			Title:      "SSE akışı tamamlanamadı",
			Message:    "Hedef belirtilen sürede yanıt vermedi.",
			Hint:       "Timeout değerini ve hedef servisin erişilebilirliğini kontrol edin.",
		},
		InvalidInput: userErrorDefinition{
			Code:       UserErrorInvalidInput,
			MessageKey: "backend.error.protocol.sse.read.invalidInput",
			Title:      "SSE akışı tamamlanamadı",
			Message:    "SSE isteği doğrulanamadı.",
			Hint:       "SSE URL, header, timeout ve operationId alanlarını kontrol edin.",
		},
	}
)

type diagnosticUserErrorClass string

const (
	diagnosticErrorFailed           diagnosticUserErrorClass = "failed"
	diagnosticErrorCanceled         diagnosticUserErrorClass = "canceled"
	diagnosticErrorTimeout          diagnosticUserErrorClass = "timeout"
	diagnosticErrorInvalidInput     diagnosticUserErrorClass = "invalidInput"
	diagnosticErrorUnsafeMethod     diagnosticUserErrorClass = "unsafeMethod"
	diagnosticErrorRequestFailed    diagnosticUserErrorClass = "requestFailed"
	diagnosticErrorResponseTooLarge diagnosticUserErrorClass = "responseTooLarge"
	diagnosticErrorInvalidResponse  diagnosticUserErrorClass = "invalidResponse"
	diagnosticErrorLimitExceeded    diagnosticUserErrorClass = "limitExceeded"
)

type diagnosticUserErrorClassDefinition struct {
	Code    UserErrorCode
	Message string
	Hint    string
}

var diagnosticUserErrorClasses = map[diagnosticUserErrorClass]diagnosticUserErrorClassDefinition{
	diagnosticErrorFailed: {
		Code:    UserErrorDiagnosticFailed,
		Message: "Tanılama işlemi tamamlanamadı.",
		Hint:    "Girdi, erişim yetkisi, Actuator görünürlüğü ve timeout değerlerini kontrol edin.",
	},
	diagnosticErrorCanceled: {
		Code:    UserErrorToolCanceled,
		Message: "Tanılama işlemi iptal edildi.",
		Hint:    "Gerekirse işlemi yeniden başlatın.",
	},
	diagnosticErrorTimeout: {
		Code:    UserErrorToolTimeout,
		Message: "Hedef belirtilen sürede yanıt vermedi.",
		Hint:    "Timeout değerini ve hedef servisin erişilebilirliğini kontrol edin.",
	},
	diagnosticErrorInvalidInput: {
		Code:    UserErrorInvalidInput,
		Message: "Tanılama girdisi doğrulanamadı.",
		Hint:    "Zorunlu alanların biçimini ve değerlerini kontrol edin.",
	},
	diagnosticErrorUnsafeMethod: {
		Code:    UserErrorCode("unsafe_method"),
		Message: "Güvenli olmayan HTTP yöntemi için açık onay gerekiyor.",
		Hint:    "Yöntemi kontrol edin veya bilinçli olarak unsafe isteklere izin verin.",
	},
	diagnosticErrorRequestFailed: {
		Code:    UserErrorRequestFailed,
		Message: "Hedef servise ulaşılamadı.",
		Hint:    "URL, ağ erişimi, kimlik doğrulama ve servis durumunu kontrol edin.",
	},
	diagnosticErrorResponseTooLarge: {
		Code:    UserErrorResponseTooLarge,
		Message: "Yanıt güvenli inceleme sınırını aşıyor.",
		Hint:    "Yanıt boyutunu azaltın ve yeniden deneyin.",
	},
	diagnosticErrorInvalidResponse: {
		Code:    UserErrorCode("invalid_response"),
		Message: "Servis okunabilir bir tanılama yanıtı döndürmedi.",
		Hint:    "Endpoint’in beklenen JSON veya metin formatını döndürdüğünü kontrol edin.",
	},
	diagnosticErrorLimitExceeded: {
		Code:    UserErrorCode("limit_exceeded"),
		Message: "Tanılama güvenlik sınırı aşıldı.",
		Hint:    "Girdi veya sonuç boyutunu azaltın ve yeniden deneyin.",
	},
}

type diagnosticUserErrorContext struct {
	MessageKeyPrefix string
	Title            string
}

func (context diagnosticUserErrorContext) definition(
	class diagnosticUserErrorClass,
) userErrorDefinition {
	classification, ok := diagnosticUserErrorClasses[class]
	if !ok {
		classification = diagnosticUserErrorClasses[diagnosticErrorFailed]
		class = diagnosticErrorFailed
	}
	return userErrorDefinition{
		Code:       classification.Code,
		MessageKey: context.MessageKeyPrefix + "." + string(class),
		Title:      context.Title,
		Message:    classification.Message,
		Hint:       classification.Hint,
	}
}

var (
	userErrorDiagnosticsActuatorPrepare = diagnosticUserErrorContext{
		MessageKeyPrefix: "backend.error.diagnostics.actuator.prepare",
		Title:            "Actuator bağlantısı hazırlanamadı",
	}
	userErrorDiagnosticsActuatorHealth = diagnosticUserErrorContext{
		MessageKeyPrefix: "backend.error.diagnostics.actuator.health",
		Title:            "Actuator health okunamadı",
	}
	userErrorDiagnosticsActuatorMetrics = diagnosticUserErrorContext{
		MessageKeyPrefix: "backend.error.diagnostics.actuator.metrics",
		Title:            "Actuator metric’leri okunamadı",
	}
	userErrorDiagnosticsActuatorMappings = diagnosticUserErrorContext{
		MessageKeyPrefix: "backend.error.diagnostics.actuator.mappings",
		Title:            "Actuator mappings okunamadı",
	}
	userErrorDiagnosticsEnvironmentCompare = diagnosticUserErrorContext{
		MessageKeyPrefix: "backend.error.diagnostics.environments.compare",
		Title:            "Ortam karşılaştırması tamamlanamadı",
	}
	userErrorDiagnosticsThreadDumpAnalyze = diagnosticUserErrorContext{
		MessageKeyPrefix: "backend.error.diagnostics.threadDump.analyze",
		Title:            "Thread dump analiz edilemedi",
	}
	userErrorDiagnosticsTraceLogSearch = diagnosticUserErrorContext{
		MessageKeyPrefix: "backend.error.diagnostics.traceLog.search",
		Title:            "Log araması tamamlanamadı",
	}
	userErrorDiagnosticsCoverageAnalyze = diagnosticUserErrorContext{
		MessageKeyPrefix: "backend.error.diagnostics.coverage.analyze",
		Title:            "Endpoint coverage hesaplanamadı",
	}
)
