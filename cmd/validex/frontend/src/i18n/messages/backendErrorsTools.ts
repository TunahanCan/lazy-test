import { defineMessages } from "./defineMessages.js";

type UserErrorText = Readonly<{
  title: string;
  message: string;
  hint: string;
}>;

type UserErrorCatalog = Readonly<Record<string, UserErrorText>>;

type FlatUserErrorMessages<Catalog extends UserErrorCatalog> = {
  readonly [Key in keyof Catalog & string as `${Key}.title`]: string;
} & {
  readonly [Key in keyof Catalog & string as `${Key}.message`]: string;
} & {
  readonly [Key in keyof Catalog & string as `${Key}.hint`]: string;
};

function flattenUserErrorMessages<const Catalog extends UserErrorCatalog>(
  catalog: Catalog,
): FlatUserErrorMessages<Catalog> {
  const messages: Record<string, string> = {};
  for (const [messageKey, text] of Object.entries(catalog)) {
    messages[`${messageKey}.title`] = text.title;
    messages[`${messageKey}.message`] = text.message;
    messages[`${messageKey}.hint`] = text.hint;
  }
  return messages as FlatUserErrorMessages<Catalog>;
}

type DiagnosticContextCatalog = Readonly<Record<string, string>>;
type DiagnosticClassCatalog = Readonly<
  Record<string, Readonly<{ message: string; hint: string }>>
>;

type ExpandedDiagnosticCatalog<
  Contexts extends DiagnosticContextCatalog,
  Classes extends DiagnosticClassCatalog,
> = {
  readonly [ContextKey in keyof Contexts & string as `${ContextKey}.${
    keyof Classes & string
  }`]: UserErrorText;
};

function expandDiagnosticCatalog<
  const Contexts extends DiagnosticContextCatalog,
  const Classes extends DiagnosticClassCatalog,
>(
  contexts: Contexts,
  classes: Classes,
): ExpandedDiagnosticCatalog<Contexts, Classes> {
  const catalog: Record<string, UserErrorText> = {};
  for (const [messageKeyPrefix, title] of Object.entries(contexts)) {
    for (const [classification, text] of Object.entries(classes)) {
      catalog[`${messageKeyPrefix}.${classification}`] = {
        title,
        message: text.message,
        hint: text.hint,
      };
    }
  }
  return catalog as ExpandedDiagnosticCatalog<Contexts, Classes>;
}

const englishToolErrors = {
  "backend.error.mock.routes.update": {
    title: "Mock routes could not be applied",
    message: "The mock route configuration could not be validated or applied.",
    hint: "Check each route's method, path, status, and response fields.",
  },
  "backend.error.mock.server.alreadyRunning": {
    title: "The mock server is already running",
    message: "A new mock server cannot be started until the running server is stopped.",
    hint: "Stop the running mock server first.",
  },
  "backend.error.mock.routes.prepareStart": {
    title: "Mock routes could not be applied",
    message: "The saved routes could not be prepared for the new mock server.",
    hint: "Check each route's method, path, status, and response fields.",
  },
  "backend.error.mock.server.start": {
    title: "The mock server could not be started",
    message: "The mock server could not begin listening on the selected port.",
    hint: "Check that the port is available and review the server status.",
  },
  "backend.error.mock.server.stop": {
    title: "The mock server could not be stopped",
    message: "The mock server could not shut down within the allotted time.",
    hint: "Check the server status and try again.",
  },
  "backend.error.mock.import.runtimeUnavailable": {
    title: "OpenAPI file could not be selected",
    message: "The desktop runtime is not ready yet.",
    hint: "Try again after the application has started.",
  },
  "backend.error.mock.import.fileDialog": {
    title: "OpenAPI file could not be selected",
    message: "The system file picker could not complete.",
    hint: "Check file access permissions and try again.",
  },
  "backend.error.mock.import.invalidOpenApi": {
    title: "Mock routes could not be generated",
    message: "The OpenAPI document could not be converted into mock routes.",
    hint: "Check the OpenAPI version, syntax, and response example fields.",
  },
  "backend.error.mock.import.canceled": {
    title: "Mock route import was canceled",
    message: "The import was canceled while the application was closing or refreshing.",
    hint: "Select the file again when the application is ready.",
  },
  "backend.error.mock.import.applyRoutes": {
    title: "Mock routes could not be applied",
    message: "The routes generated from the OpenAPI document could not be applied to the mock server.",
    hint: "Check the generated route methods, paths, statuses, and response fields.",
  },
  "backend.error.diagnostics.coverage.specMissing": {
    title: "No coverage source was found",
    message: "No OpenAPI endpoints have been imported during this session.",
    hint: "Import an OpenAPI file first or enter the endpoint list manually.",
  },
  "backend.error.protocol.sse.start.failed": {
    title: "The SSE stream could not be started",
    message: "The connection or protocol operation failed.",
    hint: "Check the address, timeout, TLS, and authentication settings.",
  },
  "backend.error.protocol.sse.start.canceled": {
    title: "The SSE stream could not be started",
    message: "The operation was canceled.",
    hint: "Restart the stream if needed.",
  },
  "backend.error.protocol.sse.start.timeout": {
    title: "The SSE stream could not be started",
    message: "The target did not respond within the specified time.",
    hint: "Check the timeout setting and whether the target service is reachable.",
  },
  "backend.error.protocol.sse.start.invalidInput": {
    title: "The SSE stream could not be started",
    message: "The SSE request could not be validated.",
    hint: "Check the SSE URL, headers, timeout, and operationId fields.",
  },
  "backend.error.protocol.sse.read.failed": {
    title: "The SSE stream could not be completed",
    message: "The connection or protocol operation failed.",
    hint: "Check the address, timeout, TLS, and authentication settings.",
  },
  "backend.error.protocol.sse.read.canceled": {
    title: "The SSE stream could not be completed",
    message: "The operation was canceled.",
    hint: "Restart the stream if needed.",
  },
  "backend.error.protocol.sse.read.timeout": {
    title: "The SSE stream could not be completed",
    message: "The target did not respond within the specified time.",
    hint: "Check the timeout setting and whether the target service is reachable.",
  },
  "backend.error.protocol.sse.read.invalidInput": {
    title: "The SSE stream could not be completed",
    message: "The SSE request could not be validated.",
    hint: "Check the SSE URL, headers, timeout, and operationId fields.",
  },
} as const;

const turkishToolErrors = {
  "backend.error.mock.routes.update": {
    title: "Mock route’ları uygulanamadı",
    message: "Mock route yapılandırması doğrulanamadı veya uygulanamadı.",
    hint: "Route method, path, status ve yanıt alanlarını kontrol edin.",
  },
  "backend.error.mock.server.alreadyRunning": {
    title: "Mock server zaten çalışıyor",
    message: "Çalışan mock server durdurulmadan yeni bir server başlatılamaz.",
    hint: "Önce çalışan mock server’ı durdurun.",
  },
  "backend.error.mock.routes.prepareStart": {
    title: "Mock route’ları uygulanamadı",
    message: "Kayıtlı route’lar yeni mock server için hazırlanamadı.",
    hint: "Route method, path, status ve yanıt alanlarını kontrol edin.",
  },
  "backend.error.mock.server.start": {
    title: "Mock server başlatılamadı",
    message: "Mock server seçilen portta dinlemeye başlayamadı.",
    hint: "Portun kullanılabilir olduğunu ve server durumunu kontrol edin.",
  },
  "backend.error.mock.server.stop": {
    title: "Mock server durdurulamadı",
    message: "Mock server ayrılan sürede kapatılamadı.",
    hint: "Server durumunu kontrol edip yeniden deneyin.",
  },
  "backend.error.mock.import.runtimeUnavailable": {
    title: "OpenAPI dosyası seçilemedi",
    message: "Desktop runtime henüz hazır değil.",
    hint: "Uygulama başlatıldıktan sonra yeniden deneyin.",
  },
  "backend.error.mock.import.fileDialog": {
    title: "OpenAPI dosyası seçilemedi",
    message: "Sistem dosya seçicisi tamamlanamadı.",
    hint: "Dosya erişim izinlerini kontrol edip yeniden deneyin.",
  },
  "backend.error.mock.import.invalidOpenApi": {
    title: "Mock route’ları üretilemedi",
    message: "OpenAPI belgesi mock route’larına dönüştürülemedi.",
    hint: "OpenAPI sürümünü, sözdizimini ve response example alanlarını kontrol edin.",
  },
  "backend.error.mock.import.canceled": {
    title: "Mock route içe aktarma iptal edildi",
    message: "Uygulama kapanırken veya yenilenirken içe aktarma işlemi iptal edildi.",
    hint: "Uygulama hazır olduğunda dosyayı yeniden seçin.",
  },
  "backend.error.mock.import.applyRoutes": {
    title: "Mock route’ları uygulanamadı",
    message: "OpenAPI belgesinden üretilen route’lar mock server’a uygulanamadı.",
    hint: "Üretilen route method, path, status ve yanıt alanlarını kontrol edin.",
  },
  "backend.error.diagnostics.coverage.specMissing": {
    title: "Coverage kaynağı bulunamadı",
    message: "Bu oturumda içe aktarılmış OpenAPI endpoint’i yok.",
    hint: "Önce OpenAPI dosyası içe aktarın veya endpoint listesini elle girin.",
  },
  "backend.error.protocol.sse.start.failed": {
    title: "SSE akışı başlatılamadı",
    message: "Bağlantı veya protokol işlemi başarısız oldu.",
    hint: "Adres, timeout, TLS ve kimlik doğrulama bilgilerini kontrol edin.",
  },
  "backend.error.protocol.sse.start.canceled": {
    title: "SSE akışı başlatılamadı",
    message: "İşlem iptal edildi.",
    hint: "Gerekirse akışı yeniden başlatın.",
  },
  "backend.error.protocol.sse.start.timeout": {
    title: "SSE akışı başlatılamadı",
    message: "Hedef belirtilen sürede yanıt vermedi.",
    hint: "Timeout değerini ve hedef servisin erişilebilirliğini kontrol edin.",
  },
  "backend.error.protocol.sse.start.invalidInput": {
    title: "SSE akışı başlatılamadı",
    message: "SSE isteği doğrulanamadı.",
    hint: "SSE URL, header, timeout ve operationId alanlarını kontrol edin.",
  },
  "backend.error.protocol.sse.read.failed": {
    title: "SSE akışı tamamlanamadı",
    message: "Bağlantı veya protokol işlemi başarısız oldu.",
    hint: "Adres, timeout, TLS ve kimlik doğrulama bilgilerini kontrol edin.",
  },
  "backend.error.protocol.sse.read.canceled": {
    title: "SSE akışı tamamlanamadı",
    message: "İşlem iptal edildi.",
    hint: "Gerekirse akışı yeniden başlatın.",
  },
  "backend.error.protocol.sse.read.timeout": {
    title: "SSE akışı tamamlanamadı",
    message: "Hedef belirtilen sürede yanıt vermedi.",
    hint: "Timeout değerini ve hedef servisin erişilebilirliğini kontrol edin.",
  },
  "backend.error.protocol.sse.read.invalidInput": {
    title: "SSE akışı tamamlanamadı",
    message: "SSE isteği doğrulanamadı.",
    hint: "SSE URL, header, timeout ve operationId alanlarını kontrol edin.",
  },
} as const satisfies Readonly<Record<keyof typeof englishToolErrors, UserErrorText>>;

const englishDiagnosticContexts = {
  "backend.error.diagnostics.actuator.prepare":
    "Actuator connection could not be prepared",
  "backend.error.diagnostics.actuator.health":
    "Actuator health could not be read",
  "backend.error.diagnostics.actuator.metrics":
    "Actuator metrics could not be read",
  "backend.error.diagnostics.actuator.mappings":
    "Actuator mappings could not be read",
  "backend.error.diagnostics.environments.compare":
    "Environment comparison could not be completed",
  "backend.error.diagnostics.threadDump.analyze":
    "Thread dump could not be analyzed",
  "backend.error.diagnostics.traceLog.search":
    "Log search could not be completed",
  "backend.error.diagnostics.coverage.analyze":
    "Endpoint coverage could not be calculated",
} as const;

const turkishDiagnosticContexts = {
  "backend.error.diagnostics.actuator.prepare":
    "Actuator bağlantısı hazırlanamadı",
  "backend.error.diagnostics.actuator.health": "Actuator health okunamadı",
  "backend.error.diagnostics.actuator.metrics":
    "Actuator metric’leri okunamadı",
  "backend.error.diagnostics.actuator.mappings":
    "Actuator mappings okunamadı",
  "backend.error.diagnostics.environments.compare":
    "Ortam karşılaştırması tamamlanamadı",
  "backend.error.diagnostics.threadDump.analyze":
    "Thread dump analiz edilemedi",
  "backend.error.diagnostics.traceLog.search":
    "Log araması tamamlanamadı",
  "backend.error.diagnostics.coverage.analyze":
    "Endpoint coverage hesaplanamadı",
} as const satisfies Readonly<Record<keyof typeof englishDiagnosticContexts, string>>;

const englishDiagnosticClasses = {
  failed: {
    message: "The diagnostic operation could not be completed.",
    hint: "Check the input, access permissions, Actuator exposure, and timeout settings.",
  },
  canceled: {
    message: "The diagnostic operation was canceled.",
    hint: "Restart the operation if needed.",
  },
  timeout: {
    message: "The target did not respond within the specified time.",
    hint: "Check the timeout setting and whether the target service is reachable.",
  },
  invalidInput: {
    message: "The diagnostic input could not be validated.",
    hint: "Check the format and values of the required fields.",
  },
  unsafeMethod: {
    message: "Explicit confirmation is required for an unsafe HTTP method.",
    hint: "Check the method or deliberately allow unsafe requests.",
  },
  requestFailed: {
    message: "The target service could not be reached.",
    hint: "Check the URL, network access, authentication, and service status.",
  },
  responseTooLarge: {
    message: "The response exceeds the safe inspection limit.",
    hint: "Reduce the response size and try again.",
  },
  invalidResponse: {
    message: "The service did not return a readable diagnostic response.",
    hint: "Check that the endpoint returns the expected JSON or text format.",
  },
  limitExceeded: {
    message: "A diagnostic safety limit was exceeded.",
    hint: "Reduce the input or result size and try again.",
  },
} as const;

const turkishDiagnosticClasses = {
  failed: {
    message: "Tanılama işlemi tamamlanamadı.",
    hint: "Girdi, erişim yetkisi, Actuator görünürlüğü ve timeout değerlerini kontrol edin.",
  },
  canceled: {
    message: "Tanılama işlemi iptal edildi.",
    hint: "Gerekirse işlemi yeniden başlatın.",
  },
  timeout: {
    message: "Hedef belirtilen sürede yanıt vermedi.",
    hint: "Timeout değerini ve hedef servisin erişilebilirliğini kontrol edin.",
  },
  invalidInput: {
    message: "Tanılama girdisi doğrulanamadı.",
    hint: "Zorunlu alanların biçimini ve değerlerini kontrol edin.",
  },
  unsafeMethod: {
    message: "Güvenli olmayan HTTP yöntemi için açık onay gerekiyor.",
    hint: "Yöntemi kontrol edin veya bilinçli olarak unsafe isteklere izin verin.",
  },
  requestFailed: {
    message: "Hedef servise ulaşılamadı.",
    hint: "URL, ağ erişimi, kimlik doğrulama ve servis durumunu kontrol edin.",
  },
  responseTooLarge: {
    message: "Yanıt güvenli inceleme sınırını aşıyor.",
    hint: "Yanıt boyutunu azaltın ve yeniden deneyin.",
  },
  invalidResponse: {
    message: "Servis okunabilir bir tanılama yanıtı döndürmedi.",
    hint: "Endpoint’in beklenen JSON veya metin formatını döndürdüğünü kontrol edin.",
  },
  limitExceeded: {
    message: "Tanılama güvenlik sınırı aşıldı.",
    hint: "Girdi veya sonuç boyutunu azaltın ve yeniden deneyin.",
  },
} as const satisfies Readonly<
  Record<keyof typeof englishDiagnosticClasses, Readonly<{ message: string; hint: string }>>
>;

const englishErrorCatalog = {
  ...englishToolErrors,
  ...expandDiagnosticCatalog(
    englishDiagnosticContexts,
    englishDiagnosticClasses,
  ),
} as const;

const turkishErrorCatalog = {
  ...turkishToolErrors,
  ...expandDiagnosticCatalog(
    turkishDiagnosticContexts,
    turkishDiagnosticClasses,
  ),
} as const;

export const backendToolsErrorMessageKeys = new Set<string>(
  Object.keys(englishErrorCatalog),
);

export const backendToolsErrorHintKeys = new Set<string>(
  backendToolsErrorMessageKeys,
);

export const backendToolsErrorMessages = defineMessages(
  flattenUserErrorMessages(englishErrorCatalog),
  flattenUserErrorMessages(turkishErrorCatalog),
);
