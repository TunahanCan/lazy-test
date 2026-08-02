package canbridge

var automationCollectionOperationInvalidError = userErrorDefinition{
	Code:       UserErrorCollectionOperationInvalid,
	MessageKey: "backend.error.automation.collection.operation_invalid",
	Title:      "Collection çalıştırılamadı",
	Message:    "Collection işlemi başlatılamadı.",
	Hint:       "Aynı operationId ile çalışan başka bir işlem olmadığını kontrol edin.",
}

var automationCollectionDefinitionInvalidError = userErrorDefinition{
	Code:       UserErrorCollectionInvalid,
	MessageKey: "backend.error.automation.collection.definition_invalid",
	Title:      "Collection çalıştırılamadı",
	Message:    "Collection JSON tanımı geçerli değil.",
	Hint:       "JSON yapısını, request alanlarını ve assertion kurallarını kontrol edin.",
}

var automationCollectionRunCanceledError = userErrorDefinition{
	Code:       UserErrorToolCanceled,
	MessageKey: "backend.error.automation.collection.run_canceled",
	Title:      "Collection tamamlanamadı",
	Message:    "İşlem kullanıcı tarafından iptal edildi.",
}

var automationCollectionRunTimeoutError = userErrorDefinition{
	Code:       UserErrorToolTimeout,
	MessageKey: "backend.error.automation.collection.run_timeout",
	Title:      "Collection tamamlanamadı",
	Message:    "İşlem belirtilen timeout süresinde tamamlanamadı.",
	Hint:       "Timeout değerini artırın veya hedef servisi kontrol edin.",
}

var automationCollectionRunFailedError = userErrorDefinition{
	Code:       UserErrorCollectionRunFailed,
	MessageKey: "backend.error.automation.collection.run_failed",
	Title:      "Collection tamamlanamadı",
	Message:    "Collection çalışırken beklenmeyen bir hata oluştu.",
	Hint:       "Girdi ve hedef servis ayrıntılarını kontrol edin.",
}

var automationNetworkOperationInvalidError = userErrorDefinition{
	Code:       UserErrorNetworkOperationInvalid,
	MessageKey: "backend.error.automation.network.operation_invalid",
	Title:      "Ağ analizi başlatılamadı",
	Message:    "DNS ve redirect işlemi başlatılamadı.",
	Hint:       "Aynı operationId ile çalışan başka bir işlem olmadığını kontrol edin.",
}

var automationNetworkInspectionCanceledError = userErrorDefinition{
	Code:       UserErrorToolCanceled,
	MessageKey: "backend.error.automation.network.inspection_canceled",
	Title:      "Ağ analizi tamamlanamadı",
	Message:    "İşlem kullanıcı tarafından iptal edildi.",
}

var automationNetworkInspectionTimeoutError = userErrorDefinition{
	Code:       UserErrorToolTimeout,
	MessageKey: "backend.error.automation.network.inspection_timeout",
	Title:      "Ağ analizi tamamlanamadı",
	Message:    "İşlem belirtilen timeout süresinde tamamlanamadı.",
	Hint:       "Timeout değerini artırın veya hedef servisi kontrol edin.",
}

var automationNetworkInspectionFailedError = userErrorDefinition{
	Code:       UserErrorNetworkInspectionFailed,
	MessageKey: "backend.error.automation.network.inspection_failed",
	Title:      "Ağ analizi tamamlanamadı",
	Message:    "DNS çözümü veya redirect zinciri tamamlanamadı.",
	Hint:       "Girdi ve hedef servis ayrıntılarını kontrol edin.",
}

var automationOpenAPIRuntimeUnavailableError = userErrorDefinition{
	Code:       UserErrorRuntimeUnavailable,
	MessageKey: "backend.error.automation.openapi.runtime_unavailable",
	Title:      "OpenAPI dosyası seçilemedi",
	Message:    "Desktop runtime henüz hazır değil.",
	Hint:       "Uygulamayı native canbridge runtime içinde açın.",
}

var automationOpenAPIFileDialogFailedError = userErrorDefinition{
	Code:       UserErrorFileDialogFailed,
	MessageKey: "backend.error.automation.openapi.file_dialog_failed",
	Title:      "OpenAPI dosyası seçilemedi",
	Message:    "Sistem dosya seçicisi tamamlanamadı.",
	Hint:       "Dosya izinlerini ve masaüstü ortamını kontrol edin.",
}

var automationOpenAPILintFailedError = userErrorDefinition{
	Code:       UserErrorOpenAPILintFailed,
	MessageKey: "backend.error.automation.openapi.lint_failed",
	Title:      "OpenAPI lint tamamlanamadı",
	Message:    "OpenAPI dosyası okunamadı.",
	Hint:       "Dosya izinlerini ve dosyanın hâlâ mevcut olduğunu kontrol edin.",
}
