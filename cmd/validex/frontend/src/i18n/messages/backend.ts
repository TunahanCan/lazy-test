import { defineMessages } from "./defineMessages.js";

export const backendMessages = defineMessages(
  {
    "backend.bootstrap.workspaceName": "Validex Workspace",
    "backend.bootstrap.environment.none": "No environment",
    "backend.bootstrap.environment.local": "Local",
    "backend.bootstrap.onboarding.sendRequest": "Send your first request",
    "backend.bootstrap.onboarding.reviewContract":
      "Review OpenAPI contract differences",
    "backend.bootstrap.onboarding.startMockServer": "Start a mock server",

    "backend.error.bindingUnavailable":
      "The canbridge backend binding is unavailable.",
    "backend.error.request.title":
      "Desktop backend connection is unavailable",
    "backend.error.request.message":
      "Validex could not reach the desktop backend to send the request.",
    "backend.error.request.hint":
      "Open Validex through canbridge with `make dev` to send real requests.",
    "backend.error.openAPIImport.title": "File picker is unavailable",
    "backend.error.openAPIImport.message":
      "OpenAPI import runs in the Validex desktop backend.",
    "backend.error.openAPIImport.hint":
      "Open Validex through canbridge with `make dev`.",
    "backend.error.contractValidation.title":
      "Contract validation is unavailable",
    "backend.error.contractValidation.message":
      "OpenAPI validation runs in the native desktop backend.",
    "backend.error.mock.desktopOnly":
      "The mock server is available only in the Validex desktop app.",
    "backend.error.mock.routesUnavailable":
      "Mock routes cannot be applied without the native backend.",
    "backend.error.mock.startUnavailable":
      "The mock server cannot be started without the native backend.",
    "backend.error.mock.stopUnavailable":
      "The mock server cannot be stopped without a native backend connection.",
    "backend.error.mock.hitsUnavailable":
      "Mock hit history cannot be accessed without the native backend.",
    "backend.error.mock.importUnavailable":
      "The OpenAPI file picker is available only in the desktop app.",
    "backend.error.unavailable.title": "{feature} is unavailable",
    "backend.error.unavailable.message":
      "This tool runs in the Validex desktop backend.",
    "backend.error.unavailable.hint":
      "Open Validex with the canbridge desktop version.",

    "backend.feature.collectionStorage": "Collection storage",
    "backend.feature.collectionImport": "Collection import",
    "backend.feature.collectionExport": "Collection export",
    "backend.feature.sseClient": "SSE client",
    "backend.feature.springActuatorDiagnostics":
      "Spring Actuator diagnostics",
    "backend.feature.environmentComparison": "Environment comparison",
    "backend.feature.threadDumpAnalyzer": "Thread dump analyzer",
    "backend.feature.traceLogSearch": "Trace log search",
    "backend.feature.endpointCoverage": "Endpoint coverage",
    "backend.feature.collectionRunner": "Collection Runner",
    "backend.feature.networkAnalysis": "DNS and redirect analysis",
    "backend.feature.openAPILint": "OpenAPI lint",
    "backend.feature.mockServer": "Mock server",
  },
  {
    "backend.bootstrap.workspaceName": "Validex Çalışma Alanı",
    "backend.bootstrap.environment.none": "Ortam yok",
    "backend.bootstrap.environment.local": "Yerel",
    "backend.bootstrap.onboarding.sendRequest": "İlk isteğini gönder",
    "backend.bootstrap.onboarding.reviewContract":
      "OpenAPI contract farklarını incele",
    "backend.bootstrap.onboarding.startMockServer": "Mock server başlat",

    "backend.error.bindingUnavailable":
      "canbridge backend bağlantısı kullanılamıyor.",
    "backend.error.request.title":
      "Masaüstü backend bağlantısı kullanılamıyor",
    "backend.error.request.message":
      "Validex, isteği göndermek için masaüstü backend’ine ulaşamadı.",
    "backend.error.request.hint":
      "Gerçek istekler göndermek için Validex’i `make dev` ile canbridge içinde açın.",
    "backend.error.openAPIImport.title": "Dosya seçici kullanılamıyor",
    "backend.error.openAPIImport.message":
      "OpenAPI içe aktarma, Validex masaüstü backend’inde çalışır.",
    "backend.error.openAPIImport.hint":
      "Validex’i `make dev` ile canbridge içinde açın.",
    "backend.error.contractValidation.title":
      "Contract doğrulaması kullanılamıyor",
    "backend.error.contractValidation.message":
      "OpenAPI doğrulaması, native masaüstü backend’inde çalışır.",
    "backend.error.mock.desktopOnly":
      "Mock server yalnızca Validex masaüstü uygulamasında çalışır.",
    "backend.error.mock.routesUnavailable":
      "Mock route’ları native backend olmadan uygulanamaz.",
    "backend.error.mock.startUnavailable":
      "Mock server native backend olmadan başlatılamaz.",
    "backend.error.mock.stopUnavailable":
      "Mock server native backend bağlantısı olmadan durdurulamaz.",
    "backend.error.mock.hitsUnavailable":
      "Mock hit geçmişine native backend olmadan erişilemez.",
    "backend.error.mock.importUnavailable":
      "OpenAPI dosya seçici yalnızca masaüstü uygulamasında çalışır.",
    "backend.error.unavailable.title": "{feature} kullanılamıyor",
    "backend.error.unavailable.message":
      "Bu araç Validex masaüstü backend’inde çalışır.",
    "backend.error.unavailable.hint":
      "Validex’i canbridge masaüstü sürümüyle açın.",

    "backend.feature.collectionStorage": "Koleksiyon depolama",
    "backend.feature.collectionImport": "Koleksiyon içe aktarma",
    "backend.feature.collectionExport": "Koleksiyon dışa aktarma",
    "backend.feature.sseClient": "SSE istemcisi",
    "backend.feature.springActuatorDiagnostics":
      "Spring Actuator tanılama",
    "backend.feature.environmentComparison": "Ortam karşılaştırma",
    "backend.feature.threadDumpAnalyzer": "Thread dump analizörü",
    "backend.feature.traceLogSearch": "Trace log arama",
    "backend.feature.endpointCoverage": "Endpoint kapsam analizi",
    "backend.feature.collectionRunner": "Koleksiyon Çalıştırıcı",
    "backend.feature.networkAnalysis": "DNS ve yönlendirme analizi",
    "backend.feature.openAPILint": "OpenAPI lint",
    "backend.feature.mockServer": "Mock server",
  },
);
