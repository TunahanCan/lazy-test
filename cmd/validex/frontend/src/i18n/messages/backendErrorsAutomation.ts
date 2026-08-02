import { defineMessages } from "./defineMessages.js";

export const backendAutomationErrorMessageKeys = new Set<string>([
  "backend.error.automation.collection.operation_invalid",
  "backend.error.automation.collection.definition_invalid",
  "backend.error.automation.collection.run_canceled",
  "backend.error.automation.collection.run_timeout",
  "backend.error.automation.collection.run_failed",
  "backend.error.automation.network.operation_invalid",
  "backend.error.automation.network.inspection_canceled",
  "backend.error.automation.network.inspection_timeout",
  "backend.error.automation.network.inspection_failed",
  "backend.error.automation.openapi.runtime_unavailable",
  "backend.error.automation.openapi.file_dialog_failed",
  "backend.error.automation.openapi.lint_failed",
]);

export const backendAutomationErrorHintKeys = new Set<string>([
  "backend.error.automation.collection.operation_invalid",
  "backend.error.automation.collection.definition_invalid",
  "backend.error.automation.collection.run_timeout",
  "backend.error.automation.collection.run_failed",
  "backend.error.automation.network.operation_invalid",
  "backend.error.automation.network.inspection_timeout",
  "backend.error.automation.network.inspection_failed",
  "backend.error.automation.openapi.runtime_unavailable",
  "backend.error.automation.openapi.file_dialog_failed",
  "backend.error.automation.openapi.lint_failed",
]);

export const backendAutomationErrorMessages = defineMessages(
  {
    "backend.error.automation.collection.operation_invalid.title":
      "Collection could not be run",
    "backend.error.automation.collection.operation_invalid.message":
      "The collection operation could not be started.",
    "backend.error.automation.collection.operation_invalid.hint":
      "Check that no other operation is running with the same operationId.",
    "backend.error.automation.collection.definition_invalid.title":
      "Collection could not be run",
    "backend.error.automation.collection.definition_invalid.message":
      "The collection JSON definition is invalid.",
    "backend.error.automation.collection.definition_invalid.hint":
      "Check the JSON structure, request fields, and assertion rules.",
    "backend.error.automation.collection.run_canceled.title":
      "Collection could not be completed",
    "backend.error.automation.collection.run_canceled.message":
      "The operation was canceled by the user.",
    "backend.error.automation.collection.run_timeout.title":
      "Collection could not be completed",
    "backend.error.automation.collection.run_timeout.message":
      "The operation did not complete within the specified timeout.",
    "backend.error.automation.collection.run_timeout.hint":
      "Increase the timeout or check the target service.",
    "backend.error.automation.collection.run_failed.title":
      "Collection could not be completed",
    "backend.error.automation.collection.run_failed.message":
      "An unexpected error occurred while running the collection.",
    "backend.error.automation.collection.run_failed.hint":
      "Check the input and target service details.",

    "backend.error.automation.network.operation_invalid.title":
      "Network analysis could not be started",
    "backend.error.automation.network.operation_invalid.message":
      "The DNS and redirect operation could not be started.",
    "backend.error.automation.network.operation_invalid.hint":
      "Check that no other operation is running with the same operationId.",
    "backend.error.automation.network.inspection_canceled.title":
      "Network analysis could not be completed",
    "backend.error.automation.network.inspection_canceled.message":
      "The operation was canceled by the user.",
    "backend.error.automation.network.inspection_timeout.title":
      "Network analysis could not be completed",
    "backend.error.automation.network.inspection_timeout.message":
      "The operation did not complete within the specified timeout.",
    "backend.error.automation.network.inspection_timeout.hint":
      "Increase the timeout or check the target service.",
    "backend.error.automation.network.inspection_failed.title":
      "Network analysis could not be completed",
    "backend.error.automation.network.inspection_failed.message":
      "The DNS resolution or redirect chain could not be completed.",
    "backend.error.automation.network.inspection_failed.hint":
      "Check the input and target service details.",

    "backend.error.automation.openapi.runtime_unavailable.title":
      "OpenAPI file could not be selected",
    "backend.error.automation.openapi.runtime_unavailable.message":
      "The desktop runtime is not ready yet.",
    "backend.error.automation.openapi.runtime_unavailable.hint":
      "Open the app using the native canbridge runtime.",
    "backend.error.automation.openapi.file_dialog_failed.title":
      "OpenAPI file could not be selected",
    "backend.error.automation.openapi.file_dialog_failed.message":
      "The system file picker could not complete.",
    "backend.error.automation.openapi.file_dialog_failed.hint":
      "Check the file permissions and your desktop environment.",
    "backend.error.automation.openapi.lint_failed.title":
      "OpenAPI lint could not be completed",
    "backend.error.automation.openapi.lint_failed.message":
      "The OpenAPI file could not be read.",
    "backend.error.automation.openapi.lint_failed.hint":
      "Check the file permissions and confirm that the file still exists.",
  },
  {
    "backend.error.automation.collection.operation_invalid.title":
      "Collection çalıştırılamadı",
    "backend.error.automation.collection.operation_invalid.message":
      "Collection işlemi başlatılamadı.",
    "backend.error.automation.collection.operation_invalid.hint":
      "Aynı operationId ile çalışan başka bir işlem olmadığını kontrol edin.",
    "backend.error.automation.collection.definition_invalid.title":
      "Collection çalıştırılamadı",
    "backend.error.automation.collection.definition_invalid.message":
      "Collection JSON tanımı geçerli değil.",
    "backend.error.automation.collection.definition_invalid.hint":
      "JSON yapısını, request alanlarını ve assertion kurallarını kontrol edin.",
    "backend.error.automation.collection.run_canceled.title":
      "Collection tamamlanamadı",
    "backend.error.automation.collection.run_canceled.message":
      "İşlem kullanıcı tarafından iptal edildi.",
    "backend.error.automation.collection.run_timeout.title":
      "Collection tamamlanamadı",
    "backend.error.automation.collection.run_timeout.message":
      "İşlem belirtilen timeout süresinde tamamlanamadı.",
    "backend.error.automation.collection.run_timeout.hint":
      "Timeout değerini artırın veya hedef servisi kontrol edin.",
    "backend.error.automation.collection.run_failed.title":
      "Collection tamamlanamadı",
    "backend.error.automation.collection.run_failed.message":
      "Collection çalışırken beklenmeyen bir hata oluştu.",
    "backend.error.automation.collection.run_failed.hint":
      "Girdi ve hedef servis ayrıntılarını kontrol edin.",

    "backend.error.automation.network.operation_invalid.title":
      "Ağ analizi başlatılamadı",
    "backend.error.automation.network.operation_invalid.message":
      "DNS ve redirect işlemi başlatılamadı.",
    "backend.error.automation.network.operation_invalid.hint":
      "Aynı operationId ile çalışan başka bir işlem olmadığını kontrol edin.",
    "backend.error.automation.network.inspection_canceled.title":
      "Ağ analizi tamamlanamadı",
    "backend.error.automation.network.inspection_canceled.message":
      "İşlem kullanıcı tarafından iptal edildi.",
    "backend.error.automation.network.inspection_timeout.title":
      "Ağ analizi tamamlanamadı",
    "backend.error.automation.network.inspection_timeout.message":
      "İşlem belirtilen timeout süresinde tamamlanamadı.",
    "backend.error.automation.network.inspection_timeout.hint":
      "Timeout değerini artırın veya hedef servisi kontrol edin.",
    "backend.error.automation.network.inspection_failed.title":
      "Ağ analizi tamamlanamadı",
    "backend.error.automation.network.inspection_failed.message":
      "DNS çözümü veya redirect zinciri tamamlanamadı.",
    "backend.error.automation.network.inspection_failed.hint":
      "Girdi ve hedef servis ayrıntılarını kontrol edin.",

    "backend.error.automation.openapi.runtime_unavailable.title":
      "OpenAPI dosyası seçilemedi",
    "backend.error.automation.openapi.runtime_unavailable.message":
      "Desktop runtime henüz hazır değil.",
    "backend.error.automation.openapi.runtime_unavailable.hint":
      "Uygulamayı native canbridge runtime içinde açın.",
    "backend.error.automation.openapi.file_dialog_failed.title":
      "OpenAPI dosyası seçilemedi",
    "backend.error.automation.openapi.file_dialog_failed.message":
      "Sistem dosya seçicisi tamamlanamadı.",
    "backend.error.automation.openapi.file_dialog_failed.hint":
      "Dosya izinlerini ve masaüstü ortamını kontrol edin.",
    "backend.error.automation.openapi.lint_failed.title":
      "OpenAPI lint tamamlanamadı",
    "backend.error.automation.openapi.lint_failed.message":
      "OpenAPI dosyası okunamadı.",
    "backend.error.automation.openapi.lint_failed.hint":
      "Dosya izinlerini ve dosyanın hâlâ mevcut olduğunu kontrol edin.",
  },
);
