import { defineMessages } from "./defineMessages.js";

export const automationToolsMessages = defineMessages(
  {
    "automation.eyebrow": "AUTOMATION · HEADLESS READY",
    "automation.title": "Automation",
    "automation.description":
      "Run collections and assertions, then inspect DNS/redirect chains and OpenAPI quality findings with the same engine.",
    "automation.meta.noDependency": "No new runtime dependencies",
    "automation.tabs.label": "Automation tools",
    "automation.tab.runner": "Collection Runner",
    "automation.tab.network": "DNS & Redirect",
    "automation.tab.openapi": "OpenAPI Lint",
    "automation.action.stop": "Stop",
    "automation.duration.total": "Total duration",
    "automation.status.passed": "Passed",
    "automation.status.failed": "Failed",
    "automation.status.error": "Error",
    "automation.status.warning": "Warning",
    "automation.status.info": "Info",

    "automation.runner.empty.title": "No collection run yet",
    "automation.runner.empty.description":
      "Add requests and assertions to the JSON definition, then start the run.",
    "automation.runner.summary.requests": "Requests",
    "automation.runner.results": "Collection results",
    "automation.runner.requestAria.passed": "Passed request: {name}",
    "automation.runner.requestAria.failed": "Failed request: {name}",
    "automation.runner.assertionAria.passed": "Passed assertion: ",
    "automation.runner.assertionAria.failed": "Failed assertion: ",
    "automation.runner.assertionMismatch":
      "Check failed · expected {expected} · received {actual}",
    "automation.runner.assertionError":
      "The assertion could not be evaluated: {details}",
    "automation.runner.failure.invalid_request":
      "The request definition is not valid.",
    "automation.runner.failure.missing_variables":
      "The request contains unresolved variables.",
    "automation.runner.failure.request_body_too_large":
      "The request body exceeds the safe size limit.",
    "automation.runner.failure.response_body_too_large":
      "The response body exceeds the safe size limit.",
    "automation.runner.failure.response_headers_too_large":
      "The response headers exceed the safe size limit.",
    "automation.runner.failure.request_timeout":
      "The request did not finish within its timeout.",
    "automation.runner.failure.request_canceled":
      "The request was canceled.",
    "automation.runner.failure.send_failed":
      "The request could not be completed.",
    "automation.runner.failure.hint":
      "Review the request definition, limits, network, and target service.",
    "automation.runner.failedFallback": "Collection could not be run.",
    "automation.runner.success": "The collection and all assertions passed.",
    "automation.runner.failureCount":
      "{count} request or assertion failed.",
    "automation.runner.editor.title": "Collection JSON",
    "automation.runner.editor.description":
      "Request, variable, and assertion definition",
    "automation.runner.collectionHelp":
      "JSON collection definition. Requests run from top to bottom.",
    "automation.runner.loadSample": "Load sample",
    "automation.runner.variables": "Runtime variable override JSON",
    "automation.runner.variablesHelp":
      "Optional JSON object. Values override variables in the collection for this run only.",
    "automation.runner.run": "Run collection",
    "automation.runner.constraints":
      "Sequential · bounded response · failure report",
    "automation.runner.result.title": "Run result",
    "automation.runner.result.runningDescription":
      "Requests are running sequentially",
    "automation.runner.result.description":
      "Assertion results are grouped by request",
    "automation.runner.running.title": "Collection is running",
    "automation.runner.running.description":
      "Wait for the active request to finish or stop the run.",

    "automation.network.empty.title": "No network analysis yet",
    "automation.network.empty.description":
      "Inspect DNS resolution and the HTTP redirect chain together.",
    "automation.network.summary.dnsHosts": "DNS hosts",
    "automation.network.summary.httpSteps": "HTTP steps",
    "automation.network.summary.finalStatus": "Final status",
    "automation.network.dns.title": "DNS resolutions",
    "automation.network.dns.empty": "No DNS resolution was recorded.",
    "automation.network.dns.noIP": "No IP address found",
    "automation.network.redirect.title": "Redirect chain",
    "automation.network.redirect.empty":
      "No HTTP connection step was recorded.",
    "automation.network.finalURL": "Final URL",
    "automation.network.urlProtocol":
      "URL must start with http:// or https://.",
    "automation.network.failedFallback":
      "Network analysis could not be completed.",
    "automation.network.success":
      "DNS and redirect analysis completed.",
    "automation.network.target.title": "Network target",
    "automation.network.target.description":
      "DNS timing for each host and redirect timing for every HTTP step",
    "automation.network.urlHelp":
      "Use a complete HTTP or HTTPS address, including its protocol.",
    "automation.network.timeout": "Timeout (s)",
    "automation.network.timeoutHelp":
      "Maximum time for the complete analysis: 1–300 seconds.",
    "automation.network.redirectLimit": "Redirect limit",
    "automation.network.redirectHelp":
      "Stops the analysis after 1–50 HTTP redirect responses.",
    "automation.network.allowSelfSigned":
      "Allow a self-signed TLS certificate",
    "automation.network.allowSelfSignedHint":
      "Use only for local development targets.",
    "automation.network.analyze": "Analyze network",
    "automation.network.result.title": "DNS and redirect result",
    "automation.network.result.description":
      "Actual connection steps measured up to the final target",
    "automation.network.running.title": "Analyzing network target",
    "automation.network.running.description":
      "Waiting for the DNS response and HTTP redirect chain.",

    "automation.lint.empty.title": "No OpenAPI document scanned yet",
    "automation.lint.empty.description":
      "Select a YAML or JSON file to run the quality rules.",
    "automation.lint.summary.operations": "Operations",
    "automation.lint.success": "No issues found by the configured lint rules.",
    "automation.lint.results": "OpenAPI lint results",
    "automation.lint.truncated":
      "The result limit was reached; remaining lint findings are not shown.",
    "automation.lint.failedFallback":
      "OpenAPI lint could not be completed.",
    "automation.lint.summary":
      "{errors} errors and {warnings} warnings found.",
    "automation.lint.document.title": "OpenAPI document",
    "automation.lint.document.description":
      "YAML or JSON · maximum 16 MiB",
    "automation.lint.intro.title":
      "Scan the API contract with quality rules",
    "automation.lint.intro.description":
      "Finds missing operation IDs, summaries, tags, responses, success codes, JSON schemas, and examples.",
    "automation.lint.select": "Select file and scan",
    "automation.lint.result.title": "Lint result",
    "automation.lint.result.description":
      "Deterministic findings grouped by severity",
    "automation.lint.running": "Scanning OpenAPI document",
    "automation.lint.issue.document.too_large":
      "The OpenAPI document exceeds the supported size limit.",
    "automation.lint.issue.document.parse":
      "The OpenAPI YAML/JSON document could not be parsed.",
    "automation.lint.issue.document.invalid":
      "The OpenAPI document is not valid.",
    "automation.lint.issue.operation.operation_id.missing":
      "This operation does not define an operationId.",
    "automation.lint.issue.operation.operation_id.duplicate":
      "This operationId is used more than once.",
    "automation.lint.issue.operation.summary.missing":
      "This operation does not define a short summary.",
    "automation.lint.issue.operation.tags.missing":
      "This operation is not grouped with a tag.",
    "automation.lint.issue.operation.responses.missing":
      "This operation does not define a response.",
    "automation.lint.issue.operation.responses.2xx_missing":
      "This operation has no 2xx success response.",
    "automation.lint.issue.response.json.schema_missing":
      "This JSON response does not define a schema.",
    "automation.lint.issue.response.json.example_missing":
      "This JSON response does not define an example.",
    "automation.lint.hint.document.too_large":
      "Reduce the file or keep only the required paths and components.",
    "automation.lint.hint.document.parse":
      "Check the YAML/JSON syntax and $ref targets.",
    "automation.lint.hint.document.invalid":
      "Check required fields and references for the selected OpenAPI version.",
    "automation.lint.hint.operation.operation_id.missing":
      "Add a unique and stable operationId for SDK and client generation.",
    "automation.lint.hint.operation.operation_id.duplicate":
      "Use a unique operationId.",
    "automation.lint.hint.operation.summary.missing":
      "Add a short sentence that explains the operation's purpose.",
    "automation.lint.hint.operation.tags.missing":
      "Add at least one tag for consistent grouping in API browsers.",
    "automation.lint.hint.operation.responses.missing":
      "Add at least one HTTP response code and description.",
    "automation.lint.hint.operation.responses.2xx_missing":
      "Add an explicit 2xx or 2XX response for the successful flow.",
    "automation.lint.hint.response.json.schema_missing":
      "Add a schema that describes the JSON response body.",
    "automation.lint.hint.response.json.example_missing":
      "Add a realistic example to the media type or schema.",

    "automation.validation.variables.object":
      "Environment variables must be a JSON object.",
    "automation.validation.collectionJSON":
      "Collection JSON is invalid: {details}",
    "automation.validation.variablesJSON":
      "Runtime variable JSON is invalid: {details}",
    "automation.validation.url":
      "Enter a valid HTTP or HTTPS URL.",
    "automation.validation.variables.maximum":
      "Environment variables can contain at most {maximum} fields.",
    "automation.validation.variables.name":
      "Environment variable name “{name}” is not valid.",
    "automation.validation.variables.string":
      "Environment variable “{name}” must be a string.",
    "automation.validation.integer":
      "{label} must be an integer between 1 and {maximum}.",
    "automation.error.collection.title": "Collection could not be run",
    "automation.error.network.title": "Network analysis could not be completed",
    "automation.error.openapi.title": "OpenAPI lint could not be completed",
    "automation.error.operation.title": "Operation could not be completed",
    "automation.error.operationInvalid":
      "Another operation may already be using this operation ID.",
    "automation.error.collectionInvalid":
      "The collection JSON definition is not valid.",
    "automation.error.collectionRun":
      "An unexpected error occurred while running the collection.",
    "automation.error.networkStart":
      "DNS and redirect analysis could not be started.",
    "automation.error.networkRun":
      "DNS resolution or the redirect chain could not be completed.",
    "automation.error.runtime":
      "The desktop runtime is not ready yet.",
    "automation.error.fileDialog":
      "The system file picker could not be completed.",
    "automation.error.openapiRead":
      "The OpenAPI document could not be read.",
    "automation.error.canceled":
      "The operation was canceled by the user.",
    "automation.error.timeout":
      "The operation did not finish within the configured timeout.",
    "automation.error.hint.operationID":
      "Make sure another operation is not running with the same operationId.",
    "automation.error.hint.collection":
      "Check the JSON structure, request fields, and assertion rules.",
    "automation.error.hint.target":
      "Review the input and target service details.",
    "automation.error.hint.native":
      "Open the application inside the native canbridge runtime.",
    "automation.error.hint.fileDialog":
      "Check file permissions and the desktop environment.",
    "automation.error.hint.file":
      "Check file permissions and confirm that the file still exists.",
    "automation.error.hint.timeout":
      "Increase the timeout or check the target service.",

    "automation.cli.summary":
      "Use the same tools from the headless CLI",

    "mock.eyebrow": "LOCAL · LOOPBACK ONLY",
    "mock.title": "Mock Server",
    "mock.description.before":
      "Generate real HTTP responses from OpenAPI examples or your own routes. The server listens only on",
    "mock.description.after":
      "and is not exposed to other devices on your network.",
    "mock.state.processing": "Processing…",
    "mock.state.running": "Running",
    "mock.state.stopped": "Stopped",
    "mock.state.refreshing": "Reading server status",
    "mock.state.activeRoutes": "{enabled}/{total} routes active",
    "mock.state.localConnection": "Local connection",
    "mock.server.controls": "Mock server controls",
    "mock.port": "Port",
    "mock.portAria": "Mock server port",
    "mock.portModeAria": "Mock server port selection",
    "mock.portAuto": "Automatic",
    "mock.portManual": "Choose port",
    "mock.portNumber": "Port number",
    "mock.cors": "Allow browser CORS",
    "mock.portHintAuto":
      "Validex will find an available local port automatically.",
    "mock.portHintManual":
      "The server will use this exact local port.",
    "mock.portInvalidTitle": "Choose a valid port",
    "mock.portInvalid":
      "Enter a whole number from 1 through 65535.",
    "mock.action.stop": "Stop",
    "mock.action.start": "Start",
    "mock.action.add": "Add",
    "mock.action.importOpenAPI": "Import OpenAPI",
    "mock.action.delete": "Delete",
    "mock.action.apply": "Apply changes",
    "mock.action.addFirst": "Add first route",
    "mock.action.activeResponse": "Active response",
    "mock.action.clearHistory": "Clear history",
    "mock.startBlocked": "Apply route changes first.",
    "mock.dirtyNotice":
      "Route changes have not been applied to the server yet. Use “Apply changes” before starting.",
    "mock.technicalDetails": "Technical details",
    "mock.lastError.title":
      "The mock server could not complete its last operation",
    "mock.lastError.description":
      "Review the server's latest error details.",
    "mock.routes.aria": "Mock route list",
    "mock.routes.title": "Routes",
    "mock.routes.count":
      "{count} definitions · edit, then apply changes",
    "mock.routes.empty.title": "No routes yet",
    "mock.routes.empty.description":
      "Add a route or import response examples from an OpenAPI file.",
    "mock.routes.dirty": "Unapplied changes",
    "mock.routes.synced": "Synced with server",
    "mock.route.enabled": "Enabled route",
    "mock.route.disabled": "Disabled route",
    "mock.editor.aria": "Selected mock route",
    "mock.editor.empty": "Select a route to edit",
    "mock.editor.emptyDescription":
      "Choose a route from the list or add a new definition.",
    "mock.editor.description": "Deterministic HTTP response",
    "mock.editor.useResponse":
      "Copy the active request's latest response to this route",
    "mock.editor.noResponse":
      "The active request tab has no response",
    "mock.delete.title": "Delete mock route?",
    "mock.delete.description":
      "{method} {path} will be removed from the editable route list.",
    "mock.delete.confirm": "Delete route",
    "mock.field.method": "Method",
    "mock.field.path": "Path",
    "mock.field.pathHint":
      "Begin with /; use {name} segments for path parameters.",
    "mock.field.status": "Status",
    "mock.field.delay": "Delay (ms)",
    "mock.field.enabled": "Enabled",
    "mock.field.headers": "Headers · JSON object",
    "mock.field.headersAria": "Response headers JSON",
    "mock.field.headersHint":
      "Optional JSON object with text header names and values.",
    "mock.field.body": "Response body · JSON",
    "mock.field.bodyAria": "Response body",
    "mock.field.bodyHint": "A valid JSON value returned as the response body.",
    "mock.hits.title": "Hit history",
    "mock.hits.summary":
      "{total} total requests · showing the latest {visible}",
    "mock.hits.empty":
      "No requests received yet. Start the server and send an HTTP request to the URL above.",
    "mock.hits.column.time": "Time",
    "mock.hits.column.method": "Method",
    "mock.hits.column.path": "Path",
    "mock.hits.column.route": "Route",
    "mock.hits.column.status": "Status",
    "mock.hits.column.duration": "Duration",
    "mock.hits.matched": "Matched",
    "mock.hits.notMatched": "Not matched",
    "mock.refresh.failed":
      "The mock server status could not be read from the desktop backend.",
    "mock.operation.failed":
      "The mock server operation could not be completed by the desktop backend.",
    "mock.activeResponse.invalid":
      "The active response is not JSON and could not be copied to the mock route body.",
    "mock.activeResponse.copied":
      "The response from {name} was copied to the selected mock route. Save the changes to apply it.",
    "mock.routes.invalid.title": "Route validation failed",
    "mock.routes.applied": "{count} routes applied to the mock server.",
    "mock.import.confirm":
      "Unapplied route changes may be replaced by the OpenAPI import. Continue?",
    "mock.import.success":
      "OpenAPI response examples were converted into mock routes.",
    "mock.copy.success": "Mock server URL copied to the clipboard.",
    "mock.copy.urlAria": "Copy mock server URL {url}",
    "mock.copy.failed": "Clipboard is not available.",
    "mock.stop.success": "Mock server stopped.",
    "mock.start.success":
      "Mock server started on the loopback address.",
    "mock.history.cleared": "Hit history cleared.",
    "mock.backend.title": "Lost connection to the Validex backend",
    "mock.backend.hint":
      "Make sure the desktop application is running and try again.",
    "mock.operation.title": "Mock server operation failed",
    "mock.operation.resultMessage":
      "The desktop backend could not apply the operation result.",
    "mock.error.routes": "The mock routes could not be applied.",
    "mock.error.alreadyRunning": "The mock server is already running.",
    "mock.error.start": "The mock server could not be started.",
    "mock.error.stop": "The mock server could not be stopped.",
    "mock.error.runtime": "The desktop runtime is not ready yet.",
    "mock.error.fileDialog":
      "The system file picker could not be completed.",
    "mock.error.invalidOpenAPI":
      "Mock routes could not be generated from this OpenAPI document.",
    "mock.error.hint":
      "Check the routes, port, server status, and file permissions.",
    "mock.validation.routeLabel": "Route {index}",
    "mock.validation.idRequired": "{label}: route ID cannot be empty.",
    "mock.validation.idDuplicate":
      "{label}: route ID “{id}” is duplicated.",
    "mock.validation.methodRequired": "{label}: select an HTTP method.",
    "mock.validation.path":
      "{label}: path must start with “/”.",
    "mock.validation.signatureDuplicate":
      "{label}: {signature} is defined more than once.",
    "mock.validation.status":
      "{label}: final status must be between 200 and 599.",
    "mock.validation.delay":
      "{label}: delay must be between 0 and 600000 ms.",
    "mock.validation.headersObject":
      "{label}: headers must be a valid JSON object.",
    "mock.validation.headersString":
      "{label}: header names and values must be strings.",
    "mock.validation.body":
      "{label}: response body must be valid JSON.",

    "json.eyebrow": "LOCAL · READ ONLY",
    "json.title": "JSON Lab",
    "json.description":
      "Format, compare, and query JSON data; derive a schema or mock example from a Java response DTO.",
    "json.meta.private": "Content stays on this device",
    "json.tabs.label": "JSON tools",
    "json.tab.format": "Formatter",
    "json.tab.diff": "Diff",
    "json.tab.query": "JSONPath",
    "json.tab.schema": "Schema",
    "json.tab.dto": "Java DTO → JSON",
    "json.mode.format.description":
      "Pretty-print, minify, or sort JSON keys without sending data off this device.",
    "json.mode.diff.description":
      "Compare two JSON documents and optionally ignore changing fields.",
    "json.mode.query.description":
      "Read one value or branch with a focused JSONPath expression.",
    "json.mode.schema.description":
      "Infer a reusable JSON Schema from a representative example.",
    "json.mode.dto.description":
      "Create a realistic JSON example from a Java record or response class.",
    "json.difference.same":
      "The JSON documents match with the selected ignore rules.",
    "json.difference.aria": "JSON differences",
    "json.difference.added": "Added",
    "json.difference.removed": "Removed",
    "json.difference.changed": "Changed",
    "json.difference.type": "Type changed",
    "json.difference.before": "Before",
    "json.difference.after": "After",
    "json.notice.noDifference": "No differences found.",
    "json.notice.differences": "{count} differences found.",
    "json.notice.queryReady": "JSONPath result is ready.",
    "json.notice.formatted": "JSON formatted.",
    "json.notice.minified": "JSON minified.",
    "json.notice.sorted": "JSON keys sorted.",
    "json.notice.schemaCreated": "JSON Schema created.",
    "json.notice.dtoCreated":
      "A mock JSON example was created from the response DTO.",
    "json.input.source": "A · Source",
    "json.input.dto": "Java response DTO",
    "json.input.json": "JSON input",
    "json.input.dtoDescription":
      "Paste a record or a class with fields",
    "json.input.jsonDescription": "Paste or type JSON",
    "json.action.clear": "Clear",
    "json.action.format": "Format",
    "json.action.minify": "Minify",
    "json.action.sort": "Sort keys",
    "json.action.query": "Query",
    "json.query.pathHelp":
      "Start with $; for example $.users[0].name.",
    "json.action.schema": "Create schema",
    "json.action.mock": "Create mock JSON",
    "json.dto.hint": "You can copy the output into a mock route body.",
    "json.diff.target": "B · Compared",
    "json.diff.targetDescription": "Compare changes with A",
    "json.diff.targetAria": "JSON to compare",
    "json.diff.ignore": "Ignored JSONPaths",
    "json.diff.ignoreAria": "JSONPath expressions to ignore",
    "json.diff.ignoreHelp":
      "Enter one JSONPath per line or separate paths with commas.",
    "json.action.compare": "Compare",
    "json.result.title": "Result",
    "json.result.description": "The operation result appears here",
    "json.result.aria": "JSON operation result",
    "json.result.empty.title": "No result yet",
    "json.result.empty.description":
      "Run one of the operations on the left.",
    "json.copy.action": "Copy",
    "json.copy.copied": "Copied",
    "json.copy.failed": "Clipboard is not available.",
    "json.error.empty": "JSON content is empty.",
    "json.error.invalid": "Invalid JSON: {details}",
    "json.error.pathRoot": "JSONPath must start with $.",
    "json.error.pathUnsupported":
      "This JSONPath expression is not supported.",
    "json.error.pathMissing": "No value was found for {path}.",
    "json.error.dtoEmpty": "Java response DTO content is empty.",
    "json.error.dtoUnsupported":
      "No supported record or class with fields was found.",
  },
  {
    "automation.eyebrow": "OTOMASYON · HEADLESS HAZIR",
    "automation.title": "Otomasyon",
    "automation.description":
      "Koleksiyon ve doğrulamaları çalıştırın; DNS/yönlendirme zincirini ve OpenAPI kalite bulgularını aynı çekirdekle inceleyin.",
    "automation.meta.noDependency": "Yeni çalışma zamanı bağımlılığı yok",
    "automation.tabs.label": "Otomasyon araçları",
    "automation.tab.runner": "Koleksiyon Çalıştırıcı",
    "automation.tab.network": "DNS ve Yönlendirme",
    "automation.tab.openapi": "OpenAPI Denetimi",
    "automation.action.stop": "Durdur",
    "automation.duration.total": "Toplam süre",
    "automation.status.passed": "Başarılı",
    "automation.status.failed": "Başarısız",
    "automation.status.error": "Hata",
    "automation.status.warning": "Uyarı",
    "automation.status.info": "Bilgi",

    "automation.runner.empty.title": "Henüz collection çalıştırılmadı",
    "automation.runner.empty.description":
      "JSON tanımına request ve assertion’ları ekleyip çalıştırın.",
    "automation.runner.summary.requests": "Request",
    "automation.runner.results": "Collection sonuçları",
    "automation.runner.requestAria.passed": "Başarılı request: {name}",
    "automation.runner.requestAria.failed": "Başarısız request: {name}",
    "automation.runner.assertionAria.passed": "Başarılı assertion: ",
    "automation.runner.assertionAria.failed": "Başarısız assertion: ",
    "automation.runner.assertionMismatch":
      "Kontrol başarısız · beklenen {expected} · alınan {actual}",
    "automation.runner.assertionError":
      "Assertion değerlendirilemedi: {details}",
    "automation.runner.failure.invalid_request":
      "Request tanımı geçerli değil.",
    "automation.runner.failure.missing_variables":
      "Request çözümlenmemiş variable içeriyor.",
    "automation.runner.failure.request_body_too_large":
      "Request body güvenli boyut sınırını aşıyor.",
    "automation.runner.failure.response_body_too_large":
      "Response body güvenli boyut sınırını aşıyor.",
    "automation.runner.failure.response_headers_too_large":
      "Response header’ları güvenli boyut sınırını aşıyor.",
    "automation.runner.failure.request_timeout":
      "Request belirtilen timeout süresinde tamamlanmadı.",
    "automation.runner.failure.request_canceled":
      "Request iptal edildi.",
    "automation.runner.failure.send_failed":
      "Request tamamlanamadı.",
    "automation.runner.failure.hint":
      "Request tanımını, sınırları, ağı ve hedef servisi kontrol edin.",
    "automation.runner.failedFallback": "Collection çalıştırılamadı.",
    "automation.runner.success": "Collection ve tüm assertion’lar başarılı.",
    "automation.runner.failureCount":
      "{count} request veya assertion başarısız oldu.",
    "automation.runner.editor.title": "Koleksiyon JSON’u",
    "automation.runner.editor.description":
      "Request, variable ve assertion tanımı",
    "automation.runner.collectionHelp":
      "JSON collection tanımı. Request’ler yukarıdan aşağıya sırayla çalışır.",
    "automation.runner.loadSample": "Örneği yükle",
    "automation.runner.variables": "Çalıştırma değişkenleri · JSON",
    "automation.runner.variablesHelp":
      "İsteğe bağlı JSON object. Değerler yalnız bu çalıştırmada collection variable’larını geçersiz kılar.",
    "automation.runner.run": "Collection’ı çalıştır",
    "automation.runner.constraints":
      "Sıralı · sınırlı yanıt · hata raporu",
    "automation.runner.result.title": "Run sonucu",
    "automation.runner.result.runningDescription":
      "Request’ler sırayla çalıştırılıyor",
    "automation.runner.result.description":
      "Assertion sonuçları request bazında gösterilir",
    "automation.runner.running.title": "Collection çalışıyor",
    "automation.runner.running.description":
      "Aktif request tamamlanana veya iptal edilene kadar bekleyin.",

    "automation.network.empty.title": "Henüz ağ analizi yok",
    "automation.network.empty.description":
      "DNS çözümünü ve HTTP redirect zincirini birlikte inceleyin.",
    "automation.network.summary.dnsHosts": "DNS host",
    "automation.network.summary.httpSteps": "HTTP adımı",
    "automation.network.summary.finalStatus": "Son durum",
    "automation.network.dns.title": "DNS çözümleri",
    "automation.network.dns.empty": "DNS çözümü kaydedilmedi.",
    "automation.network.dns.noIP": "IP bulunamadı",
    "automation.network.redirect.title": "Redirect zinciri",
    "automation.network.redirect.empty":
      "HTTP bağlantı adımı kaydedilmedi.",
    "automation.network.finalURL": "Son URL",
    "automation.network.urlProtocol":
      "URL http:// veya https:// ile başlamalı.",
    "automation.network.failedFallback":
      "Ağ analizi tamamlanamadı.",
    "automation.network.success":
      "DNS ve redirect analizi tamamlandı.",
    "automation.network.target.title": "Ağ hedefi",
    "automation.network.target.description":
      "Her host için DNS ve her HTTP adımı için redirect ölçümü",
    "automation.network.urlHelp":
      "Protokolüyle birlikte eksiksiz bir HTTP veya HTTPS adresi kullanın.",
    "automation.network.timeout": "Zaman aşımı (sn)",
    "automation.network.timeoutHelp":
      "Analizin tamamı için en uzun süre: 1–300 saniye.",
    "automation.network.redirectLimit": "Yönlendirme sınırı",
    "automation.network.redirectHelp":
      "Analizi 1–50 HTTP redirect response’undan sonra durdurur.",
    "automation.network.allowSelfSigned":
      "Kendinden imzalı TLS sertifikasına izin ver",
    "automation.network.allowSelfSignedHint":
      "Yalnız yerel geliştirme hedeflerinde kullanın.",
    "automation.network.analyze": "Ağı analiz et",
    "automation.network.result.title": "DNS ve redirect sonucu",
    "automation.network.result.description":
      "Final hedefe kadar ölçülen gerçek bağlantı adımları",
    "automation.network.running.title": "Ağ hedefi analiz ediliyor",
    "automation.network.running.description":
      "DNS yanıtı ve HTTP redirect zinciri bekleniyor.",

    "automation.lint.empty.title": "Henüz OpenAPI belgesi taranmadı",
    "automation.lint.empty.description":
      "YAML veya JSON dosyası seçerek kalite kurallarını çalıştırın.",
    "automation.lint.summary.operations": "Operation",
    "automation.lint.success": "Tanımlı lint kurallarında sorun bulunmadı.",
    "automation.lint.results": "OpenAPI lint sonuçları",
    "automation.lint.truncated":
      "Sonuç sınırına ulaşıldı; kalan lint bulguları gösterilmedi.",
    "automation.lint.failedFallback":
      "OpenAPI lint tamamlanamadı.",
    "automation.lint.summary":
      "{errors} hata ve {warnings} uyarı bulundu.",
    "automation.lint.document.title": "OpenAPI belgesi",
    "automation.lint.document.description":
      "YAML veya JSON · maksimum 16 MiB",
    "automation.lint.intro.title":
      "API sözleşmesini kalite kurallarıyla tara",
    "automation.lint.intro.description":
      "Operation ID, summary, tag, response, başarı kodu, JSON schema ve example eksiklerini bulur.",
    "automation.lint.select": "Dosya seç ve tara",
    "automation.lint.result.title": "Lint sonucu",
    "automation.lint.result.description":
      "Deterministik ve önem derecesine göre sınıflandırılmış",
    "automation.lint.running": "OpenAPI belgesi taranıyor",
    "automation.lint.issue.document.too_large":
      "OpenAPI belgesi desteklenen boyut sınırını aşıyor.",
    "automation.lint.issue.document.parse":
      "OpenAPI YAML/JSON belgesi ayrıştırılamadı.",
    "automation.lint.issue.document.invalid":
      "OpenAPI belgesi geçerli değil.",
    "automation.lint.issue.operation.operation_id.missing":
      "Bu işlem operationId tanımlamıyor.",
    "automation.lint.issue.operation.operation_id.duplicate":
      "Bu operationId birden fazla kez kullanılıyor.",
    "automation.lint.issue.operation.summary.missing":
      "Bu işlem kısa bir summary tanımlamıyor.",
    "automation.lint.issue.operation.tags.missing":
      "Bu işlem bir tag ile gruplandırılmamış.",
    "automation.lint.issue.operation.responses.missing":
      "Bu işlem response tanımlamıyor.",
    "automation.lint.issue.operation.responses.2xx_missing":
      "Bu işlemin 2xx başarı response’u yok.",
    "automation.lint.issue.response.json.schema_missing":
      "Bu JSON response bir schema tanımlamıyor.",
    "automation.lint.issue.response.json.example_missing":
      "Bu JSON response bir example tanımlamıyor.",
    "automation.lint.hint.document.too_large":
      "Dosyayı küçültün veya yalnız gerekli path ve component tanımlarını bırakın.",
    "automation.lint.hint.document.parse":
      "YAML/JSON sözdizimini ve $ref hedeflerini kontrol edin.",
    "automation.lint.hint.document.invalid":
      "Seçilen OpenAPI sürümünün zorunlu alanlarını ve referanslarını kontrol edin.",
    "automation.lint.hint.operation.operation_id.missing":
      "SDK ve istemci üretimi için benzersiz, kararlı bir operationId ekleyin.",
    "automation.lint.hint.operation.operation_id.duplicate":
      "Benzersiz bir operationId kullanın.",
    "automation.lint.hint.operation.summary.missing":
      "İşlemin amacını anlatan kısa bir cümle ekleyin.",
    "automation.lint.hint.operation.tags.missing":
      "API tarayıcılarında tutarlı gruplama için en az bir tag ekleyin.",
    "automation.lint.hint.operation.responses.missing":
      "En az bir HTTP response kodu ve açıklaması ekleyin.",
    "automation.lint.hint.operation.responses.2xx_missing":
      "Başarılı akış için açık bir 2xx veya 2XX response ekleyin.",
    "automation.lint.hint.response.json.schema_missing":
      "JSON response gövdesini açıklayan bir schema ekleyin.",
    "automation.lint.hint.response.json.example_missing":
      "Media type veya schema üzerinde gerçekçi bir example tanımlayın.",

    "automation.validation.variables.object":
      "Environment variables bir JSON object olmalı.",
    "automation.validation.collectionJSON":
      "Collection JSON geçerli değil: {details}",
    "automation.validation.variablesJSON":
      "Runtime variable JSON geçerli değil: {details}",
    "automation.validation.url":
      "Geçerli bir HTTP veya HTTPS URL girin.",
    "automation.validation.variables.maximum":
      "Environment variables en fazla {maximum} alan içerebilir.",
    "automation.validation.variables.name":
      "Environment variable adı “{name}” geçerli değil.",
    "automation.validation.variables.string":
      "Environment variable “{name}” string olmalı.",
    "automation.validation.integer":
      "{label} 1–{maximum} arasında bir tam sayı olmalı.",
    "automation.error.collection.title": "Collection çalıştırılamadı",
    "automation.error.network.title": "Ağ analizi tamamlanamadı",
    "automation.error.openapi.title": "OpenAPI lint tamamlanamadı",
    "automation.error.operation.title": "İşlem tamamlanamadı",
    "automation.error.operationInvalid":
      "Başka bir işlem bu operation ID’yi kullanıyor olabilir.",
    "automation.error.collectionInvalid":
      "Collection JSON tanımı geçerli değil.",
    "automation.error.collectionRun":
      "Collection çalışırken beklenmeyen bir hata oluştu.",
    "automation.error.networkStart":
      "DNS ve redirect analizi başlatılamadı.",
    "automation.error.networkRun":
      "DNS çözümü veya redirect zinciri tamamlanamadı.",
    "automation.error.runtime":
      "Desktop runtime henüz hazır değil.",
    "automation.error.fileDialog":
      "Sistem dosya seçicisi tamamlanamadı.",
    "automation.error.openapiRead":
      "OpenAPI belgesi okunamadı.",
    "automation.error.canceled":
      "İşlem kullanıcı tarafından iptal edildi.",
    "automation.error.timeout":
      "İşlem belirtilen timeout süresinde tamamlanamadı.",
    "automation.error.hint.operationID":
      "Aynı operationId ile çalışan başka bir işlem olmadığını kontrol edin.",
    "automation.error.hint.collection":
      "JSON yapısını, request alanlarını ve assertion kurallarını kontrol edin.",
    "automation.error.hint.target":
      "Girdi ve hedef servis ayrıntılarını kontrol edin.",
    "automation.error.hint.native":
      "Uygulamayı native canbridge runtime içinde açın.",
    "automation.error.hint.fileDialog":
      "Dosya izinlerini ve masaüstü ortamını kontrol edin.",
    "automation.error.hint.file":
      "Dosya izinlerini ve dosyanın hâlâ mevcut olduğunu kontrol edin.",
    "automation.error.hint.timeout":
      "Timeout değerini artırın veya hedef servisi kontrol edin.",

    "automation.cli.summary":
      "Aynı araçları headless CLI’da kullan",

    "mock.eyebrow": "YEREL · YALNIZCA GERİ DÖNGÜ",
    "mock.title": "Mock Sunucu",
    "mock.description.before":
      "OpenAPI örneklerinden veya kendi rotalarınızdan gerçek HTTP yanıtları üretin. Sunucu yalnızca",
    "mock.description.after":
      "üzerinde dinler; ağınızdaki diğer cihazlara açılmaz.",
    "mock.state.processing": "İşleniyor…",
    "mock.state.running": "Çalışıyor",
    "mock.state.stopped": "Durduruldu",
    "mock.state.refreshing": "Sunucu durumu okunuyor",
    "mock.state.activeRoutes": "{enabled}/{total} rota etkin",
    "mock.state.localConnection": "Yerel bağlantı",
    "mock.server.controls": "Mock sunucu denetimleri",
    "mock.port": "Port",
    "mock.portAria": "Mock sunucu portu",
    "mock.portModeAria": "Mock sunucu port seçimi",
    "mock.portAuto": "Otomatik",
    "mock.portManual": "Port seç",
    "mock.portNumber": "Port numarası",
    "mock.cors": "Tarayıcı CORS’una izin ver",
    "mock.portHintAuto":
      "Validex kullanılabilir bir yerel portu otomatik bulur.",
    "mock.portHintManual":
      "Sunucu tam olarak bu yerel portu kullanır.",
    "mock.portInvalidTitle": "Geçerli bir port seçin",
    "mock.portInvalid":
      "1 ile 65535 arasında bir tam sayı girin.",
    "mock.action.stop": "Durdur",
    "mock.action.start": "Başlat",
    "mock.action.add": "Ekle",
    "mock.action.importOpenAPI": "OpenAPI içe aktar",
    "mock.action.delete": "Sil",
    "mock.action.apply": "Değişiklikleri uygula",
    "mock.action.addFirst": "İlk rotayı ekle",
    "mock.action.activeResponse": "Etkin yanıt",
    "mock.action.clearHistory": "Geçmişi temizle",
    "mock.startBlocked": "Önce rota değişikliklerini uygulayın.",
    "mock.dirtyNotice":
      "Rota değişiklikleri henüz sunucuya uygulanmadı. Başlatmadan önce “Değişiklikleri uygula” düğmesini kullanın.",
    "mock.technicalDetails": "Teknik ayrıntı",
    "mock.lastError.title":
      "Mock sunucu son işlemi tamamlayamadı",
    "mock.lastError.description":
      "Sunucunun son hata ayrıntısını inceleyin.",
    "mock.routes.aria": "Mock rota listesi",
    "mock.routes.title": "Rotalar",
    "mock.routes.count":
      "{count} tanım · düzenleyip değişiklikleri uygulayın",
    "mock.routes.empty.title": "Henüz rota yok",
    "mock.routes.empty.description":
      "Bir rota ekleyin veya OpenAPI dosyasındaki yanıt örneklerini içe aktarın.",
    "mock.routes.dirty": "Uygulanmamış değişiklik var",
    "mock.routes.synced": "Sunucuyla eşitlendi",
    "mock.route.enabled": "Etkin rota",
    "mock.route.disabled": "Devre dışı rota",
    "mock.editor.aria": "Seçili mock rota",
    "mock.editor.empty": "Düzenlemek için bir rota seçin",
    "mock.editor.emptyDescription":
      "Listeden bir rota seçin veya yeni bir tanım ekleyin.",
    "mock.editor.description": "Öngörülebilir HTTP yanıtı",
    "mock.editor.useResponse":
      "Etkin isteğin son yanıtını bu rotaya aktar",
    "mock.editor.noResponse":
      "Etkin istek sekmesinde yanıt yok",
    "mock.delete.title": "Mock rota silinsin mi?",
    "mock.delete.description":
      "{method} {path} düzenlenebilir rota listesinden kaldırılacak.",
    "mock.delete.confirm": "Rotayı sil",
    "mock.field.method": "Metot",
    "mock.field.path": "Yol",
    "mock.field.pathHint":
      "/ ile başlayın; yol parametreleri için {name} bölümlerini kullanın.",
    "mock.field.status": "Durum",
    "mock.field.delay": "Gecikme (ms)",
    "mock.field.enabled": "Aktif",
    "mock.field.headers": "Yanıt üstbilgileri · JSON nesnesi",
    "mock.field.headersAria": "JSON yanıt üstbilgileri",
    "mock.field.headersHint":
      "Metin üstbilgi adları ve değerlerinden oluşan isteğe bağlı JSON nesnesi.",
    "mock.field.body": "Yanıt gövdesi · JSON",
    "mock.field.bodyAria": "Yanıt gövdesi",
    "mock.field.bodyHint":
      "Yanıt gövdesi olarak döndürülecek geçerli bir JSON değeri.",
    "mock.hits.title": "Hit geçmişi",
    "mock.hits.summary":
      "{total} toplam istek · son {visible} kayıt gösteriliyor",
    "mock.hits.empty":
      "Henüz istek alınmadı. Sunucuyu başlatıp yukarıdaki URL’ye bir HTTP isteği gönderin.",
    "mock.hits.column.time": "Saat",
    "mock.hits.column.method": "Metot",
    "mock.hits.column.path": "Yol",
    "mock.hits.column.route": "Rota",
    "mock.hits.column.status": "Durum",
    "mock.hits.column.duration": "Süre",
    "mock.hits.matched": "Eşleşti",
    "mock.hits.notMatched": "Eşleşmedi",
    "mock.refresh.failed":
      "Mock sunucu durumu masaüstü arka ucundan okunamadı.",
    "mock.operation.failed":
      "Mock sunucu işlemi masaüstü arka ucunda tamamlanamadı.",
    "mock.activeResponse.invalid":
      "Etkin yanıt JSON değil; mock rota gövdesine aktarılamadı.",
    "mock.activeResponse.copied":
      "{name} yanıtı seçili mock rotaya aktarıldı. Uygulamak için değişiklikleri kaydedin.",
    "mock.routes.invalid.title": "Rota doğrulanamadı",
    "mock.routes.applied": "{count} rota mock sunucuya uygulandı.",
    "mock.import.confirm":
      "Uygulanmamış rota değişiklikleri OpenAPI içe aktarımıyla değişebilir. Devam edilsin mi?",
    "mock.import.success":
      "OpenAPI yanıt örnekleri mock rotalara dönüştürüldü.",
    "mock.copy.success": "Mock sunucu URL’si panoya kopyalandı.",
    "mock.copy.urlAria": "{url} mock sunucu URL’sini kopyala",
    "mock.copy.failed": "Pano kullanılamadı.",
    "mock.stop.success": "Mock sunucu durduruldu.",
    "mock.start.success":
      "Mock sunucu geri döngü adresinde başlatıldı.",
    "mock.history.cleared": "Hit geçmişi temizlendi.",
    "mock.backend.title": "Validex backend bağlantısı kesildi",
    "mock.backend.hint":
      "Masaüstü uygulamasının çalıştığını kontrol edip yeniden deneyin.",
    "mock.operation.title": "Mock server işlemi tamamlanamadı",
    "mock.operation.resultMessage":
      "Masaüstü backend’i işlem sonucunu uygulayamadı.",
    "mock.error.routes": "Mock route’ları uygulanamadı.",
    "mock.error.alreadyRunning": "Mock server zaten çalışıyor.",
    "mock.error.start": "Mock server başlatılamadı.",
    "mock.error.stop": "Mock server durdurulamadı.",
    "mock.error.runtime": "Desktop runtime henüz hazır değil.",
    "mock.error.fileDialog":
      "Sistem dosya seçicisi tamamlanamadı.",
    "mock.error.invalidOpenAPI":
      "Bu OpenAPI belgesinden mock route üretilemedi.",
    "mock.error.hint":
      "Route, port, sunucu durumu ve dosya izinlerini kontrol edin.",
    "mock.validation.routeLabel": "{index}. route",
    "mock.validation.idRequired": "{label}: route ID boş olamaz.",
    "mock.validation.idDuplicate":
      "{label}: “{id}” route ID’si tekrarlanıyor.",
    "mock.validation.methodRequired": "{label}: HTTP method seçin.",
    "mock.validation.path":
      "{label}: path “/” ile başlamalı.",
    "mock.validation.signatureDuplicate":
      "{label}: {signature} birden fazla kez tanımlanmış.",
    "mock.validation.status":
      "{label}: final status 200–599 arasında olmalı.",
    "mock.validation.delay":
      "{label}: gecikme 0–600000 ms arasında olmalı.",
    "mock.validation.headersObject":
      "{label}: headers geçerli bir JSON object olmalı.",
    "mock.validation.headersString":
      "{label}: header adları ve değerleri string olmalı.",
    "mock.validation.body":
      "{label}: response body geçerli JSON olmalı.",

    "json.eyebrow": "YEREL · SALT OKUNUR",
    "json.title": "JSON Laboratuvarı",
    "json.description":
      "JSON verisini biçimlendirin, karşılaştırın ve sorgulayın; şema veya Java yanıt DTO’sundan mock örneği çıkarın.",
    "json.meta.private": "İçerik cihazdan çıkmaz",
    "json.tabs.label": "JSON araçları",
    "json.tab.format": "Biçimlendirici",
    "json.tab.diff": "Karşılaştırma",
    "json.tab.query": "JSONPath",
    "json.tab.schema": "Şema",
    "json.tab.dto": "Java DTO → JSON",
    "json.mode.format.description":
      "Veriyi cihazdan çıkarmadan JSON’u okunaklı biçimlendirin, küçültün veya anahtarları sıralayın.",
    "json.mode.diff.description":
      "İki JSON içeriğini karşılaştırın ve değişken alanları isteğe bağlı olarak yok sayın.",
    "json.mode.query.description":
      "Odaklı bir JSONPath ifadesiyle tek bir değeri veya dalı okuyun.",
    "json.mode.schema.description":
      "Temsili bir örnekten yeniden kullanılabilir JSON Schema üretin.",
    "json.mode.dto.description":
      "Java record veya response class’tan gerçekçi bir JSON örneği oluşturun.",
    "json.difference.same":
      "JSON içerikleri seçilen ignore kurallarıyla aynı.",
    "json.difference.aria": "JSON farkları",
    "json.difference.added": "Eklendi",
    "json.difference.removed": "Silindi",
    "json.difference.changed": "Değişti",
    "json.difference.type": "Tip değişti",
    "json.difference.before": "Önce",
    "json.difference.after": "Sonra",
    "json.notice.noDifference": "Fark bulunamadı.",
    "json.notice.differences": "{count} fark bulundu.",
    "json.notice.queryReady": "JSONPath sonucu hazır.",
    "json.notice.formatted": "JSON formatlandı.",
    "json.notice.minified": "JSON küçültüldü.",
    "json.notice.sorted": "JSON anahtarları sıralandı.",
    "json.notice.schemaCreated": "JSON Schema oluşturuldu.",
    "json.notice.dtoCreated":
      "Response DTO’dan mock JSON örneği oluşturuldu.",
    "json.input.source": "A · Kaynak",
    "json.input.dto": "Java yanıt DTO’su",
    "json.input.json": "JSON girdisi",
    "json.input.dtoDescription":
      "Record veya field içeren class yapıştırın",
    "json.input.jsonDescription": "JSON yapıştırın veya yazın",
    "json.action.clear": "Temizle",
    "json.action.format": "Biçimlendir",
    "json.action.minify": "Küçült",
    "json.action.sort": "Anahtarları sırala",
    "json.action.query": "Sorgula",
    "json.query.pathHelp":
      "$ ile başlayın; örneğin $.users[0].name.",
    "json.action.schema": "Schema oluştur",
    "json.action.mock": "Mock JSON oluştur",
    "json.dto.hint":
      "Çıktıyı bir mock route body’sine kopyalayabilirsiniz.",
    "json.diff.target": "B · Karşılaştırılan",
    "json.diff.targetDescription": "Değişiklikleri A ile karşılaştırın",
    "json.diff.targetAria": "Karşılaştırılacak JSON",
    "json.diff.ignore": "Ignore JSONPath’leri",
    "json.diff.ignoreAria": "Yok sayılacak JSONPath ifadeleri",
    "json.diff.ignoreHelp":
      "Her satıra bir JSONPath yazın veya ifadeleri virgülle ayırın.",
    "json.action.compare": "Karşılaştır",
    "json.result.title": "Sonuç",
    "json.result.description": "İşlem sonucu burada görünür",
    "json.result.aria": "JSON işlem sonucu",
    "json.result.empty.title": "Henüz sonuç yok",
    "json.result.empty.description":
      "Soldaki işlemlerden birini çalıştırın.",
    "json.copy.action": "Kopyala",
    "json.copy.copied": "Kopyalandı",
    "json.copy.failed": "Pano kullanılamadı.",
    "json.error.empty": "JSON içeriği boş.",
    "json.error.invalid": "Geçersiz JSON: {details}",
    "json.error.pathRoot": "JSONPath $ ile başlamalıdır.",
    "json.error.pathUnsupported":
      "Bu JSONPath ifadesi desteklenmiyor.",
    "json.error.pathMissing": "{path} için değer bulunamadı.",
    "json.error.dtoEmpty": "Java response DTO içeriği boş.",
    "json.error.dtoUnsupported":
      "Desteklenen record veya field içeren class bulunamadı.",
  },
);
