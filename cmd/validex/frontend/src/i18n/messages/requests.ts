import { defineMessages } from "./defineMessages.js";

export const requestMessages = defineMessages(
  {
    "requests.untitled": "Untitled request",

    "requests.welcome.eyebrow": "WELCOME TO VALIDEX",
    "requests.welcome.title": "Bring all your API work into one place.",
    "requests.welcome.description":
      "Create your first request manually or import endpoints from an OpenAPI file.",
    "requests.welcome.newRequest": "New request",
    "requests.welcome.importing": "Importing…",
    "requests.welcome.importOpenAPI": "Import OpenAPI",
    "requests.welcome.quickTools": "Quick tools",
    "requests.welcome.quickToolsDescription":
      "Go directly to the workspace you need.",
    "requests.welcome.openTool": "Open {tool}",
    "requests.welcome.dismissNotice": "Dismiss import notice",
    "requests.welcome.searchCommands": "Search commands",
    "requests.welcome.reopenTab": "Reopen tab",

    "requests.tabs.openRequests": "Open requests",
    "requests.tabs.renameHint": "Double-click to rename",
    "requests.tabs.localDraft": "Local draft",
    "requests.tabs.running": "Request running",
    "requests.tabs.error": "Request error",
    "requests.tabs.pinned": "Pinned",
    "requests.tabs.closeNamed": "Close {name} tab",
    "requests.tabs.renameNamed": "Rename {name}",
    "requests.tabs.cancelBeforeClose":
      "Cancel the request before closing the tab",
    "requests.tabs.rename": "Rename",
    "requests.tabs.duplicate": "Duplicate",
    "requests.tabs.duplicateName": "{name} copy",
    "requests.tabs.pin": "Pin tab",
    "requests.tabs.unpin": "Unpin tab",
    "requests.tabs.closeOtherClean": "Close other clean tabs",
    "requests.tabs.closeCleanRight": "Close clean tabs to the right",
    "requests.tabs.reopenClosed": "Reopen closed tab",
    "requests.tabs.close": "Close tab",
    "requests.tabs.new": "New request tab",
    "requests.tabs.closeDraftTitle": "Close draft tab?",
    "requests.tabs.closeDraftDescription":
      "“{name}” has changes that are not saved to a collection. Closing it will discard those changes from the active workspace.",
    "requests.tabs.closeDraftHint":
      "You can reopen the most recently closed tab from the command palette.",
    "requests.tabs.cancel": "Cancel",
    "requests.tabs.closeDraft": "Close tab",
    "requests.tabs.renameTitle": "Rename request",
    "requests.tabs.renameDescription":
      "A short, distinctive name makes switching between tabs easier.",
    "requests.tabs.requestName": "Request name",
    "requests.tabs.newName": "New request name",
    "requests.tabs.updateName": "Update name",
    "requests.tabs.nameUpdated": "Request renamed to {name}",

    "requests.workbench.section.params": "Params",
    "requests.workbench.section.headers": "Headers",
    "requests.workbench.section.body": "Body",
    "requests.workbench.section.variables": "Variables",
    "requests.workbench.composer": "Request composer",
    "requests.workbench.urlPlaceholder":
      "https://api.example.com/v1/users or {{baseUrl}}/v1/users",
    "requests.workbench.url": "Request URL",
    "requests.workbench.missingVariable": "Missing variable",
    "requests.workbench.cancel": "Cancel",
    "requests.workbench.canceling": "Canceling…",
    "requests.workbench.send": "Send",
    "requests.workbench.sendShortcut": "Send request (Ctrl+Enter)",
    "requests.workbench.urlHelp":
      "Enter an HTTP or HTTPS address. You can use variables such as {{baseUrl}}.",
    "requests.workbench.completeVariables":
      "Provide values for the missing variables",
    "requests.workbench.enterValidURL": "Enter a valid HTTP or HTTPS URL",
    "requests.workbench.moreSendOptions": "More send options",
    "requests.workbench.copyAsCurl": "Copy as cURL",
    "requests.curlImport.action": "Import",
    "requests.curlImport.actionLong": "Paste cURL / Bash",
    "requests.curlImport.title": "Import a browser request",
    "requests.curlImport.description":
      "Paste the “Copy as cURL (bash)” output from your browser’s network panel. Validex creates a new editable request without executing the shell command.",
    "requests.curlImport.field": "cURL / Bash command",
    "requests.curlImport.placeholder":
      "curl 'https://api.example.com/orders' \\\n  -H 'accept: application/json' \\\n  -H 'cookie: session=…'",
    "requests.curlImport.help":
      "Supports Chrome, Edge, Firefox, and Safari-style Bash quoting, repeated headers, cookies, authentication, JSON, and request bodies.",
    "requests.curlImport.security":
      "The imported browser request stays in this session until you explicitly save it. Sensitive Cookie, Authorization, CSRF, and session header values are never stored.",
    "requests.curlImport.cancel": "Cancel",
    "requests.curlImport.confirm": "Import as new request",
    "requests.curlImport.headerDescription":
      "Imported from browser cURL",
    "requests.curlImport.imported":
      "Browser request imported · {count} headers.",
    "requests.curlImport.importedSensitive":
      "Sensitive header values kept only in this tab: {count}.",
    "requests.curlImport.importedWarnings":
      "Adjusted for Validex: {warnings}.",
    "requests.curlImport.error.unknown":
      "The cURL command could not be imported.",
    "requests.curlImport.error.empty": "Paste a cURL command first.",
    "requests.curlImport.error.tooLarge":
      "The copied command exceeds the 16 MiB import limit.",
    "requests.curlImport.error.tooComplex":
      "The command contains too many shell tokens.",
    "requests.curlImport.error.quote":
      "A quoted value is not closed. Copy the complete command again.",
    "requests.curlImport.error.unsafeShell":
      "Shell pipes, redirects, substitutions, and chained commands are not imported.",
    "requests.curlImport.error.notCurl":
      "The pasted text does not begin with a cURL command.",
    "requests.curlImport.error.missingValue":
      "The cURL option “{detail}” is missing its value.",
    "requests.curlImport.error.unsupportedOption":
      "The cURL option “{detail}” is not supported yet.",
    "requests.curlImport.error.binary":
      "This request contains binary body bytes that cannot be represented safely in the text editor. Import was stopped without changing the payload.",
    "requests.curlImport.error.file":
      "File references cannot be imported from another application. Paste literal body or form data instead.",
    "requests.curlImport.error.header":
      "One of the copied headers is not valid.",
    "requests.curlImport.error.tooManyHeaders":
      "The command exceeds the 512-header safety limit.",
    "requests.curlImport.error.url":
      "The cURL command does not contain a request URL.",
    "requests.curlImport.error.multipleURLs":
      "Import one request URL at a time.",
    "requests.curlImport.error.method":
      "The HTTP method “{detail}” is not supported by the request editor.",
    "requests.curlImport.error.bodyTooLarge":
      "The request body exceeds the 16 MiB import limit.",
    "requests.curlImport.error.form":
      "The multipart form definition could not be imported.",
    "requests.curlImport.warning.acceptEncoding":
      "unsupported response encodings were removed",
    "requests.curlImport.warning.compressed":
      "compression was limited to gzip and deflate",
    "requests.curlImport.warning.globoff": "URL globbing is not performed",
    "requests.curlImport.warning.httpVersion":
      "the HTTP version is selected automatically",
    "requests.curlImport.warning.pathAsIs":
      "the URL path uses Validex’s normal URL handling",
    "requests.curlImport.warning.redirect":
      "redirects remain visible instead of being followed",
    "requests.curlImport.warning.tls":
      "TLS certificate verification remains enabled",
    "requests.workbench.save": "Save",
    "requests.workbench.saving": "Saving…",
    "requests.workbench.saved": "Saved",
    "requests.workbench.saveRequest": "Save request",
    "requests.workbench.saveAs": "Save as…",
    "requests.workbench.saveShortcut": "Save request (Ctrl+S)",
    "requests.workbench.saveDialogTitle": "Save to a collection",
    "requests.workbench.saveDialogDescription":
      "Keep this request available after its tab is closed.",
    "requests.workbench.saveDialogHelp":
      "Choose an existing collection or enter a name to create a new one.",
    "requests.workbench.saveDialogFirstCollectionHelp":
      "Name your first collection. You can add more requests to it later.",
    "requests.workbench.collectionRequired":
      "Choose a collection or enter a new collection name.",
    "requests.workbench.firstCollectionRequired":
      "Enter a name for your first collection.",
    "requests.workbench.requestName": "Request name",
    "requests.workbench.collection": "Collection",
    "requests.workbench.selectCollection": "Select a collection",
    "requests.workbench.createNewCollection": "Create new collection",
    "requests.workbench.newCollectionName": "New collection name",
    "requests.workbench.firstCollectionName": "First collection name",
    "requests.workbench.createFirstCollection":
      "Create your first collection",
    "requests.workbench.cancelSave": "Cancel",
    "requests.workbench.confirmSave": "Save request",
    "requests.workbench.savedTo": "Saved in {collection}",
    "requests.workbench.secretHeadersNotSaved":
      "Literal secret header values were not saved. Keep credentials in Variables and reference them with {{variable}}.",
    "requests.workbench.saveWriteFailed":
      "This request is still an unsaved draft because the device write failed.",
    "requests.workbench.missingVariables": "Missing variables: {variables}",
    "requests.workbench.settings": "Request settings",
    "requests.workbench.queryCount.one": "Params, {count} query parameter",
    "requests.workbench.queryCount.many": "Params, {count} query parameters",
    "requests.workbench.headerCount.one": "Headers, {count} enabled header",
    "requests.workbench.headerCount.many":
      "Headers, {count} enabled headers",
    "requests.workbench.templateVariables": "Template variables",
    "requests.workbench.workspace": "Workspace",
    "requests.workbench.bodyUnavailable":
      "{method} requests cannot include a body. Choose GET, POST, PUT, PATCH, DELETE, or OPTIONS.",
    "requests.workbench.resize": "Resize request and response areas",
    "requests.workbench.resizeInstructions":
      "Use the arrow keys to resize. Home sets the minimum and End sets the maximum.",
    "requests.workbench.resizeValue": "Response area: {value}%",

    "requests.validation.urlRequired": "Request URL is required.",
    "requests.validation.urlWhitespace":
      "The URL cannot contain leading or trailing spaces.",
    "requests.validation.urlScheme":
      "The URL must explicitly start with http:// or https://.",
    "requests.validation.httpOnly": "Only HTTP and HTTPS URLs are supported.",
    "requests.validation.userInfo":
      "The URL cannot contain user credentials. Configure authentication in Headers.",
    "requests.validation.fragment": "The URL cannot contain a fragment (#…).",
    "requests.validation.invalidURL": "Enter a valid HTTP or HTTPS URL.",
    "requests.validation.invalidMethod": "The HTTP method is invalid.",

    "requests.error.operationChanged.title":
      "Request no longer matches the OpenAPI operation",
    "requests.error.operationChanged.message":
      "The edited URL path does not match {path}.",
    "requests.error.operationChanged.hint":
      "Restore the URL path to compare this response with the operation, or open a new tab from the OpenAPI file.",
    "requests.error.contractCheck.title":
      "Contract check couldn’t be completed",
    "requests.error.contractCheck.message":
      "An HTTP response was received, but the OpenAPI comparison could not run.",
    "requests.error.emptyResponse.title": "Request couldn’t be completed",
    "requests.error.emptyResponse.message":
      "The backend did not return a valid response.",
    "requests.error.emptyResponse.hint":
      "Restart the application and try the request again.",
    "requests.error.bridge.title": "Backend connection lost",
    "requests.error.bridge.message":
      "The request could not be sent to the native backend.",
    "requests.error.bridge.hint": "Restart the application and try again.",
    "requests.error.cancelNotFound.title": "Running request not found",
    "requests.error.cancelNotFound.message":
      "The backend did not find an active operation for this request.",
    "requests.error.cancelNotFound.hint":
      "Send the request again or restart the application.",
    "requests.error.cancelFailed.title": "Couldn’t cancel request",
    "requests.error.cancelFailed.message":
      "The native backend did not respond to the cancellation command.",
    "requests.error.cancelFailed.hint":
      "Restart the application and try again.",
    "requests.error.invalidRequest.title": "Invalid request",
    "requests.error.invalidRequest.message":
      "The method, URL, headers, body, or timeout is not valid.",
    "requests.error.invalidRequest.hint":
      "Review the request fields and try again.",
    "requests.error.missingVariables.title": "Missing variables",
    "requests.error.missingVariables.message":
      "The request contains one or more variables without a value.",
    "requests.error.missingVariables.hint":
      "Provide the missing values in the active environment.",
    "requests.error.alreadyRunning.title": "Request already running",
    "requests.error.alreadyRunning.message":
      "Another operation with the same request ID is still running.",
    "requests.error.alreadyRunning.hint":
      "Cancel the running request or wait for it to finish.",
    "requests.error.canceled.title": "Request canceled",
    "requests.error.canceled.message": "The request was stopped by the user.",
    "requests.error.canceled.hint":
      "The URL and form values remain available in this tab.",
    "requests.error.timeout.title": "Request timed out",
    "requests.error.timeout.message":
      "The target did not respond before the request timeout.",
    "requests.error.timeout.hint":
      "Increase the timeout or check whether the target service is reachable.",
    "requests.error.network.title": "Couldn’t reach server",
    "requests.error.network.message":
      "A network connection could not be established.",
    "requests.error.network.hint":
      "Check the base URL, VPN, proxy, and server status.",
    "requests.error.failed.title": "Request failed",
    "requests.error.failed.message":
      "An unexpected connection error occurred.",
    "requests.error.failed.hint":
      "Compare the technical details with the service logs.",
    "requests.error.responseRead.title": "Couldn’t read response",
    "requests.error.responseRead.message":
      "The server responded, but the response body could not be completed.",
    "requests.error.responseRead.hint":
      "Check the connection and send the request again.",
    "requests.error.responseTooLarge.title": "Response exceeds limit",
    "requests.error.responseTooLarge.message":
      "The response body exceeded the safety limit, so the download was stopped.",
    "requests.error.responseTooLarge.hint":
      "Request a smaller data set or add pagination or filters to the endpoint.",
    "requests.error.responseHeadersTooLarge.title":
      "Response headers exceed limit",
    "requests.error.responseHeadersTooLarge.message":
      "The response headers exceeded the 1 MiB safety limit, so the request was stopped.",
    "requests.error.responseHeadersTooLarge.hint":
      "Reduce oversized header values or remove unnecessary response headers on the server.",

    "requests.editor.method.select": "Select HTTP method",
    "requests.editor.method.search": "Search method",
    "requests.editor.query.label": "Query parameters",
    "requests.editor.query.title": "Query parameters",
    "requests.editor.query.description":
      "Detected from the URL · changes are written directly to the URL.",
    "requests.editor.query.add": "Add param",
    "requests.editor.query.added": "Query parameter added",
    "requests.editor.query.removed": "Query parameter removed",
    "requests.editor.column.description": "Description",
    "requests.editor.column.key": "Key",
    "requests.editor.column.value": "Value",
    "requests.editor.column.type": "Type",
    "requests.editor.column.source": "Source",
    "requests.editor.query.nameAt": "Query parameter {index} name",
    "requests.editor.query.valueAt": "Query parameter {index} value",
    "requests.editor.query.detected": "Detected from URL",
    "requests.editor.query.deleteAt": "Delete query parameter {index}",
    "requests.editor.query.empty":
      "There are no query parameters in the URL. Add ?key=value to the URL or use “Add param”.",
    "requests.editor.query.namePlaceholder": "Param name",
    "requests.editor.query.newName": "New query parameter name",
    "requests.editor.query.newValue": "New query parameter value",
    "requests.editor.query.confirmAdd": "Add",
    "requests.editor.query.cancelAdd": "Cancel adding query parameter",
    "requests.editor.query.nameRequired":
      "The query parameter name cannot be empty.",

    "requests.editor.variables.title": "{scope} variables",
    "requests.editor.variables.description":
      "Used for variables in the URL, headers, and body.",
    "requests.editor.variables.add": "Add variable",
    "requests.editor.variables.removeOverride":
      "Remove the {key} variable override",
    "requests.editor.variables.environmentDefault": "Environment default",
    "requests.editor.variables.name": "{key} variable name",
    "requests.editor.variables.value": "{key} variable value",
    "requests.editor.variables.empty":
      "There are no variables yet. Add a value first if you plan to use an expression such as {{baseUrl}} in the URL.",
    "requests.editor.variables.namePlaceholder": "Variable name",
    "requests.editor.variables.newName": "New variable name",
    "requests.editor.variables.newValue": "New variable value",
    "requests.editor.variables.confirmAdd": "Add",
    "requests.editor.variables.cancelAdd": "Cancel adding variable",
    "requests.editor.variables.invalidName":
      "The variable name must start with a letter or _.",
    "requests.editor.variables.duplicate": "This variable already exists.",
    "requests.editor.variables.added": "{key} variable added",
    "requests.editor.variables.overrideRemoved":
      "{key} override removed; the environment default is active.",
    "requests.editor.variables.scope": "{name} environment",
    "requests.editor.variables.secretHint":
      "Secret values stay hidden on screen. Reference them as {{variable}}.",
    "requests.editor.variables.resolve":
      "Resolve {{variables}} when sending",
    "requests.editor.variables.resolveDescription":
      "Turn this off to send braces literally. Browser cURL imports start in literal mode for exact request fidelity.",
    "requests.editor.variables.literalEnabled":
      "Variable resolution is off; {{expressions}} will be sent literally.",
    "requests.editor.variables.resolutionEnabled":
      "Variable resolution is on.",
    "requests.editor.variables.showSecret": "Show {key}",
    "requests.editor.variables.hideSecret": "Hide {key}",
    "requests.editor.type.secret": "Secret",
    "requests.editor.type.string": "String",
    "requests.editor.source.override": "{scope} override",
    "requests.editor.source.default": "Default",
    "requests.editor.source.manual": "Manual",
    "requests.editor.source.openapi": "OpenAPI",
    "requests.editor.source.environment": "Environment",
    "requests.editor.source.extracted": "Extracted",
    "requests.editor.source.generated": "Generated",

    "requests.editor.headers.title": "Request headers",
    "requests.editor.headers.description":
      "Repeated header names are supported.",
    "requests.editor.headers.add": "Add header",
    "requests.editor.headers.added": "Header added",
    "requests.editor.headers.removed": "Header removed",
    "requests.editor.headers.enabledAt": "Header {index} enabled",
    "requests.editor.headers.namePlaceholder": "Header name",
    "requests.editor.headers.nameAt": "Header {index} name",
    "requests.editor.headers.valuePlaceholder": "Value or {{variable}}",
    "requests.editor.headers.valueAt": "Header {index} value",
    "requests.editor.headers.descriptionAt": "Header {index} description",
    "requests.editor.headers.delete": "Delete header",
    "requests.editor.headers.empty":
      "No headers added. Validex does not add headers to the request automatically.",
    "requests.editor.headers.descriptionPlaceholder": "Optional note",

    "requests.editor.body.title": "JSON / raw body",
    "requests.editor.body.format": "Format",
    "requests.editor.body.minify": "Minify",
    "requests.editor.body.invalidJSON":
      "The JSON syntax is invalid. Fix the incorrect line.",
    "requests.editor.body.minifyFailed":
      "Couldn’t minify JSON; check the syntax.",
    "requests.editor.body.description":
      "Send JSON, text, XML, or another raw payload supported by the endpoint.",
    "requests.editor.body.placeholder": "Enter the request body",
    "requests.editor.body.formatted": "JSON body formatted.",
    "requests.editor.body.minified": "JSON body minified.",
    "requests.editor.body.loading": "Preparing editor…",

    "requests.response.section.body": "Body",
    "requests.response.section.headers": "Headers",
    "requests.response.section.cookies": "Cookies",
    "requests.response.section.timeline": "Timeline",
    "requests.response.section.raw": "Raw",
    "requests.response.section.contract": "Contract",
    "requests.response.viewerLoading": "Preparing response viewer…",
    "requests.response.formatted": "Formatted response",
    "requests.response.copied": "Copied",
    "requests.response.traceCopied": "Trace ID copied",
    "requests.response.copyBody": "Copy body",
    "requests.response.copyRaw": "Copy raw response",
    "requests.response.noHeaders.title": "This response has no headers",
    "requests.response.noHeaders.description":
      "Headers returned by the server will appear here.",
    "requests.response.header": "Header",
    "requests.response.value": "Value",
    "requests.response.noCookies.title": "This response has no cookies",
    "requests.response.noCookies.description":
      "Set-Cookie headers will appear here with their security and expiry details.",
    "requests.response.cookie": "Cookie",
    "requests.response.valueAndAttributes": "Value and attributes",
    "requests.response.cookie.domain": "Domain {value}",
    "requests.response.cookie.path": "Path {value}",
    "requests.response.cookie.expires": "Expires {value}",
    "requests.response.finding.missing": "Missing field",
    "requests.response.finding.extra": "Extra field",
    "requests.response.finding.enum": "Enum violation",
    "requests.response.finding.type": "Type or constraint",
    "requests.response.contract.pending.title": "Contract check pending",
    "requests.response.contract.pending.description":
      "Requests opened from OpenAPI are compared with the actual response schema after they are sent.",
    "requests.response.contract.ok.title":
      "Response matches the OpenAPI contract",
    "requests.response.contract.ok.description":
      "No missing fields, extra fields, type differences, schema constraint violations, or enum differences were found for {method} {path}.",
    "requests.response.contract.drift.one": "{count} contract difference found",
    "requests.response.contract.drift.many":
      "{count} contract differences found",
    "requests.response.contract.truncated": "first 1000 shown",
    "requests.response.contract.driftDescription":
      "The response is usable, but the following fields do not match the OpenAPI schema.",
    "requests.response.contract.truncatedDescription":
      "The comparison found more differences; only the first 1000 are shown.",
    "requests.response.contract.jsonPath": "JSON path",
    "requests.response.contract.difference": "Difference",
    "requests.response.contract.expected": "Expected",
    "requests.response.contract.actual": "Actual",
    "requests.response.contract.specUnavailable.title":
      "OpenAPI contract unavailable",
    "requests.response.contract.specUnavailable.message":
      "The OpenAPI document for this request is no longer in memory.",
    "requests.response.contract.specUnavailable.hint":
      "Import the OpenAPI file again.",
    "requests.response.contract.schemaUnavailable.title":
      "No JSON schema to compare",
    "requests.response.contract.schemaUnavailable.message":
      "No matching JSON media schema was found for the {status} response with content type {contentType}.",
    "requests.response.contract.schemaUnavailable.hint":
      "Add a JSON schema under this status or default response using the actual response media type.",
    "requests.response.contract.operationUnavailable.title":
      "OpenAPI operation unavailable",
    "requests.response.contract.operationUnavailable.message":
      "{method} {path} was not found in this document.",
    "requests.response.timeline.preparation": "Request preparation",
    "requests.response.timeline.dns": "DNS",
    "requests.response.timeline.tcp": "TCP connection",
    "requests.response.timeline.tls": "TLS handshake",
    "requests.response.timeline.request": "Request send",
    "requests.response.timeline.server": "Server wait",
    "requests.response.timeline.download": "Response download",
    "requests.response.timeline.reused": "Existing connection reused.",
    "requests.response.timeline.slow":
      "{percent}% of the total time was spent waiting for the server response.",
    "requests.response.timeline.empty":
      "Timing phases were not available for this response.",
    "requests.response.label": "Response",
    "requests.response.unknownContentType": "Unknown content type",
    "requests.response.status": "Status: {value}",
    "requests.response.duration": "Duration: {value}",
    "requests.response.size": "Response size: {value}",
    "requests.response.contentType": "Content type: {value}",
    "requests.response.protocol": "Protocol: {value}",
    "requests.response.sending": "Sending…",
    "requests.response.canceled": "Canceled",
    "requests.response.failed": "Request failed",
    "requests.response.traceCopy": "Copy Trace ID",
    "requests.response.traceShort": "Trace {value}",
    "requests.response.remoteAddress": "Remote address: {value}",
    "requests.response.tlsVersion": "TLS: {value}",
    "requests.response.views": "Response views",
    "requests.response.loading.title": "Sending request…",
    "requests.response.loading.description":
      "You can stop it with the Cancel button above.",
    "requests.response.technicalDetails": "Technical details",
    "requests.response.tryAgain": "Send again",
    "requests.response.rawEmpty.title": "The response body is empty",
    "requests.response.rawEmpty.description":
      "The server returned no raw response content.",
    "requests.response.empty.title": "No response yet",
    "requests.response.empty.description":
      "After you send the request, its status, duration, body, headers, and detailed timeline will appear here.",

    "requests.openapiImport.empty": "{title} · No usable endpoints found.",
    "requests.openapiImport.loaded.one":
      "{title} · {count} endpoint loaded. Open it from the APIs section.",
    "requests.openapiImport.loaded.many":
      "{title} · {count} endpoints loaded. Open them from the APIs section.",
    "requests.openapiImport.failed":
      "Couldn’t import OpenAPI: {details}",
    "requests.openapiImport.unexpected": "An unexpected error occurred.",
    "requests.openapiImport.runtimeUnavailable":
      "File picker unavailable: The desktop runtime is not ready yet.",
    "requests.openapiImport.fileDialogFailed":
      "Couldn’t select file: The system file picker did not complete.",
    "requests.openapiImport.invalid":
      "Couldn’t import OpenAPI: The file is not a valid OpenAPI document.",
  },
  {
    "requests.untitled": "Adsız istek",

    "requests.welcome.eyebrow": "VALIDEX’E HOŞ GELDİNİZ",
    "requests.welcome.title": "Tüm API çalışmalarınızı tek bir yerde toplayın.",
    "requests.welcome.description":
      "İlk isteğinizi elle oluşturun veya endpoint’leri bir OpenAPI dosyasından içe aktarın.",
    "requests.welcome.newRequest": "Yeni istek",
    "requests.welcome.importing": "İçe aktarılıyor…",
    "requests.welcome.importOpenAPI": "OpenAPI içe aktar",
    "requests.welcome.quickTools": "Hızlı araçlar",
    "requests.welcome.quickToolsDescription":
      "İhtiyacınız olan çalışma alanına doğrudan geçin.",
    "requests.welcome.openTool": "{tool} aracını aç",
    "requests.welcome.dismissNotice": "İçe aktarma bildirimini kapat",
    "requests.welcome.searchCommands": "Komutlarda ara",
    "requests.welcome.reopenTab": "Sekmeyi yeniden aç",

    "requests.tabs.openRequests": "Açık istekler",
    "requests.tabs.renameHint": "Yeniden adlandırmak için çift tıklayın",
    "requests.tabs.localDraft": "Yerel taslak",
    "requests.tabs.running": "İstek çalışıyor",
    "requests.tabs.error": "İstek hatası",
    "requests.tabs.pinned": "Sabitlenmiş",
    "requests.tabs.closeNamed": "{name} sekmesini kapat",
    "requests.tabs.renameNamed": "{name} isteğini yeniden adlandır",
    "requests.tabs.cancelBeforeClose":
      "Sekmeyi kapatmadan önce isteği iptal edin",
    "requests.tabs.rename": "Yeniden adlandır",
    "requests.tabs.duplicate": "Çoğalt",
    "requests.tabs.duplicateName": "{name} kopyası",
    "requests.tabs.pin": "Sekmeyi sabitle",
    "requests.tabs.unpin": "Sekme sabitlemesini kaldır",
    "requests.tabs.closeOtherClean": "Diğer temiz sekmeleri kapat",
    "requests.tabs.closeCleanRight": "Sağdaki temiz sekmeleri kapat",
    "requests.tabs.reopenClosed": "Kapatılan sekmeyi yeniden aç",
    "requests.tabs.close": "Sekmeyi kapat",
    "requests.tabs.new": "Yeni istek sekmesi",
    "requests.tabs.closeDraftTitle": "Taslak sekme kapatılsın mı?",
    "requests.tabs.closeDraftDescription":
      "“{name}” koleksiyona kaydedilmemiş değişiklikler içeriyor. Kapatırsanız bu değişiklikler etkin çalışma alanından silinecek.",
    "requests.tabs.closeDraftHint":
      "Son kapatılan sekmeyi komut paletinden yeniden açabilirsiniz.",
    "requests.tabs.cancel": "İptal",
    "requests.tabs.closeDraft": "Sekmeyi kapat",
    "requests.tabs.renameTitle": "İsteği yeniden adlandır",
    "requests.tabs.renameDescription":
      "Kısa ve ayırt edilebilir bir ad, sekmeler arasında geçişi kolaylaştırır.",
    "requests.tabs.requestName": "İstek adı",
    "requests.tabs.newName": "Yeni istek adı",
    "requests.tabs.updateName": "Adı güncelle",
    "requests.tabs.nameUpdated": "İsteğin adı {name} olarak değiştirildi",

    "requests.workbench.section.params": "Parametreler",
    "requests.workbench.section.headers": "Header’lar",
    "requests.workbench.section.body": "Body",
    "requests.workbench.section.variables": "Değişkenler",
    "requests.workbench.composer": "İstek oluşturucu",
    "requests.workbench.urlPlaceholder":
      "https://api.example.com/v1/users veya {{baseUrl}}/v1/users",
    "requests.workbench.url": "İstek URL’si",
    "requests.workbench.missingVariable": "Eksik değişken",
    "requests.workbench.cancel": "İptal",
    "requests.workbench.canceling": "İptal ediliyor…",
    "requests.workbench.send": "Gönder",
    "requests.workbench.sendShortcut": "İsteği gönder (Ctrl+Enter)",
    "requests.workbench.urlHelp":
      "HTTP veya HTTPS adresi girin. {{baseUrl}} gibi değişkenler kullanabilirsiniz.",
    "requests.workbench.completeVariables":
      "Eksik değişken değerlerini tamamlayın",
    "requests.workbench.enterValidURL":
      "Geçerli bir HTTP veya HTTPS URL’si girin",
    "requests.workbench.moreSendOptions": "Diğer gönderme seçenekleri",
    "requests.workbench.copyAsCurl": "cURL olarak kopyala",
    "requests.curlImport.action": "İçe aktar",
    "requests.curlImport.actionLong": "cURL / Bash yapıştır",
    "requests.curlImport.title": "Tarayıcı isteğini içe aktar",
    "requests.curlImport.description":
      "Tarayıcının ağ panelindeki “Copy as cURL (bash)” çıktısını yapıştırın. Validex shell komutunu çalıştırmadan düzenlenebilir yeni bir istek oluşturur.",
    "requests.curlImport.field": "cURL / Bash komutu",
    "requests.curlImport.placeholder":
      "curl 'https://api.example.com/orders' \\\n  -H 'accept: application/json' \\\n  -H 'cookie: session=…'",
    "requests.curlImport.help":
      "Chrome, Edge, Firefox ve Safari tarzı Bash tırnaklarını; tekrarlanan header, cookie, kimlik doğrulama, JSON ve request body’lerini destekler.",
    "requests.curlImport.security":
      "İçe aktarılan tarayıcı isteği siz açıkça kaydedene kadar yalnızca bu oturumda tutulur. Hassas Cookie, Authorization, CSRF ve oturum header değerleri hiçbir zaman kaydedilmez.",
    "requests.curlImport.cancel": "İptal",
    "requests.curlImport.confirm": "Yeni istek olarak içe aktar",
    "requests.curlImport.headerDescription":
      "Tarayıcı cURL’ünden içe aktarıldı",
    "requests.curlImport.imported":
      "Tarayıcı isteği içe aktarıldı · {count} header.",
    "requests.curlImport.importedSensitive":
      "Yalnızca bu sekmede tutulan hassas header değeri: {count}.",
    "requests.curlImport.importedWarnings":
      "Validex için uyarlananlar: {warnings}.",
    "requests.curlImport.error.unknown":
      "cURL komutu içe aktarılamadı.",
    "requests.curlImport.error.empty": "Önce bir cURL komutu yapıştırın.",
    "requests.curlImport.error.tooLarge":
      "Kopyalanan komut 16 MiB içe aktarma sınırını aşıyor.",
    "requests.curlImport.error.tooComplex":
      "Komut çok fazla shell parçası içeriyor.",
    "requests.curlImport.error.quote":
      "Tırnak içine alınan bir değer kapanmamış. Komutun tamamını yeniden kopyalayın.",
    "requests.curlImport.error.unsafeShell":
      "Shell pipe, yönlendirme, substitution ve zincirlenmiş komutlar içe aktarılmaz.",
    "requests.curlImport.error.notCurl":
      "Yapıştırılan metin bir cURL komutuyla başlamıyor.",
    "requests.curlImport.error.missingValue":
      "“{detail}” cURL seçeneğinin değeri eksik.",
    "requests.curlImport.error.unsupportedOption":
      "“{detail}” cURL seçeneği henüz desteklenmiyor.",
    "requests.curlImport.error.binary":
      "Bu istek, metin editöründe güvenle temsil edilemeyen binary body byte’ları içeriyor. Payload değiştirilmeden içe aktarma durduruldu.",
    "requests.curlImport.error.file":
      "Başka bir uygulamadaki dosya referansı içe aktarılamaz. Body veya form verisini doğrudan yapıştırın.",
    "requests.curlImport.error.header":
      "Kopyalanan header’lardan biri geçerli değil.",
    "requests.curlImport.error.tooManyHeaders":
      "Komut 512 header güvenlik sınırını aşıyor.",
    "requests.curlImport.error.url":
      "cURL komutunda request URL’si bulunamadı.",
    "requests.curlImport.error.multipleURLs":
      "Her seferinde tek bir request URL’si içe aktarın.",
    "requests.curlImport.error.method":
      "“{detail}” HTTP metodu request editörü tarafından desteklenmiyor.",
    "requests.curlImport.error.bodyTooLarge":
      "Request body 16 MiB içe aktarma sınırını aşıyor.",
    "requests.curlImport.error.form":
      "Multipart form tanımı içe aktarılamadı.",
    "requests.curlImport.warning.acceptEncoding":
      "desteklenmeyen response encoding’leri kaldırıldı",
    "requests.curlImport.warning.compressed":
      "sıkıştırma gzip ve deflate ile sınırlandı",
    "requests.curlImport.warning.globoff": "URL glob işlemi uygulanmaz",
    "requests.curlImport.warning.httpVersion":
      "HTTP sürümü otomatik seçilir",
    "requests.curlImport.warning.pathAsIs":
      "URL path’i Validex’in normal URL işleme davranışını kullanır",
    "requests.curlImport.warning.redirect":
      "redirect’ler takip edilmek yerine görünür bırakılır",
    "requests.curlImport.warning.tls":
      "TLS sertifika doğrulaması açık kalır",
    "requests.workbench.save": "Kaydet",
    "requests.workbench.saving": "Kaydediliyor…",
    "requests.workbench.saved": "Kaydedildi",
    "requests.workbench.saveRequest": "İsteği kaydet",
    "requests.workbench.saveAs": "Farklı kaydet…",
    "requests.workbench.saveShortcut": "İsteği kaydet (Ctrl+S)",
    "requests.workbench.saveDialogTitle": "Koleksiyona kaydet",
    "requests.workbench.saveDialogDescription":
      "Sekmesi kapandıktan sonra da bu isteğe erişin.",
    "requests.workbench.saveDialogHelp":
      "Mevcut bir koleksiyon seçin veya yeni koleksiyon oluşturmak için ad girin.",
    "requests.workbench.saveDialogFirstCollectionHelp":
      "İlk koleksiyonunuza ad verin. Daha sonra başka istekler de ekleyebilirsiniz.",
    "requests.workbench.collectionRequired":
      "Bir koleksiyon seçin veya yeni koleksiyon adı girin.",
    "requests.workbench.firstCollectionRequired":
      "İlk koleksiyonunuz için bir ad girin.",
    "requests.workbench.requestName": "İstek adı",
    "requests.workbench.collection": "Koleksiyon",
    "requests.workbench.selectCollection": "Koleksiyon seç",
    "requests.workbench.createNewCollection": "Yeni koleksiyon oluştur",
    "requests.workbench.newCollectionName": "Yeni koleksiyon adı",
    "requests.workbench.firstCollectionName": "İlk koleksiyon adı",
    "requests.workbench.createFirstCollection":
      "İlk koleksiyonunuzu oluşturun",
    "requests.workbench.cancelSave": "İptal",
    "requests.workbench.confirmSave": "İsteği kaydet",
    "requests.workbench.savedTo": "{collection} içine kaydedildi",
    "requests.workbench.secretHeadersNotSaved":
      "Doğrudan yazılan gizli header değerleri kaydedilmedi. Kimlik bilgilerini Değişkenler’de tutup {{variable}} ile referans verin.",
    "requests.workbench.saveWriteFailed":
      "Cihaza yazma başarısız olduğu için bu istek hâlâ kaydedilmemiş bir taslak.",
    "requests.workbench.missingVariables": "Eksik değişkenler: {variables}",
    "requests.workbench.settings": "İstek ayarları",
    "requests.workbench.queryCount.one": "Parametreler, {count} sorgu parametresi",
    "requests.workbench.queryCount.many":
      "Parametreler, {count} sorgu parametresi",
    "requests.workbench.headerCount.one": "Header’lar, {count} etkin header",
    "requests.workbench.headerCount.many": "Header’lar, {count} etkin header",
    "requests.workbench.templateVariables": "Şablon değişkenleri",
    "requests.workbench.workspace": "Çalışma alanı",
    "requests.workbench.bodyUnavailable":
      "{method} istekleri body içeremez. GET, POST, PUT, PATCH, DELETE veya OPTIONS seçin.",
    "requests.workbench.resize": "İstek ve yanıt alanlarını yeniden boyutlandır",
    "requests.workbench.resizeInstructions":
      "Yeniden boyutlandırmak için ok tuşlarını kullanın. Home en küçük, End en büyük boyutu ayarlar.",
    "requests.workbench.resizeValue": "Yanıt alanı: %{value}",

    "requests.validation.urlRequired": "İstek URL’si gerekli.",
    "requests.validation.urlWhitespace":
      "URL’nin başında veya sonunda boşluk bulunamaz.",
    "requests.validation.urlScheme":
      "URL açıkça http:// veya https:// ile başlamalı.",
    "requests.validation.httpOnly":
      "Yalnızca HTTP ve HTTPS URL’leri desteklenir.",
    "requests.validation.userInfo":
      "URL kullanıcı bilgisi içeremez. Kimlik doğrulamayı Header’lar üzerinden yönetin.",
    "requests.validation.fragment": "URL fragment (#…) içeremez.",
    "requests.validation.invalidURL":
      "Geçerli bir HTTP veya HTTPS URL’si girin.",
    "requests.validation.invalidMethod": "HTTP metodu geçersiz.",

    "requests.error.operationChanged.title":
      "İstek artık OpenAPI operation ile eşleşmiyor",
    "requests.error.operationChanged.message":
      "Düzenlenen URL path’i {path} ile eşleşmiyor.",
    "requests.error.operationChanged.hint":
      "Bu yanıtı operation ile karşılaştırmak için URL path’ini geri alın veya OpenAPI dosyasından yeni bir sekme açın.",
    "requests.error.contractCheck.title":
      "Contract kontrolü tamamlanamadı",
    "requests.error.contractCheck.message":
      "HTTP yanıtı alındı ancak OpenAPI karşılaştırması çalışmadı.",
    "requests.error.emptyResponse.title": "İstek tamamlanamadı",
    "requests.error.emptyResponse.message":
      "Backend geçerli bir yanıt döndürmedi.",
    "requests.error.emptyResponse.hint":
      "Uygulamayı yeniden başlatıp isteği tekrar deneyin.",
    "requests.error.bridge.title": "Backend bağlantısı koptu",
    "requests.error.bridge.message":
      "İstek native backend’e iletilemedi.",
    "requests.error.bridge.hint":
      "Uygulamayı yeniden başlatıp tekrar deneyin.",
    "requests.error.cancelNotFound.title": "Çalışan istek bulunamadı",
    "requests.error.cancelNotFound.message":
      "Backend bu istek için etkin bir işlem bulamadı.",
    "requests.error.cancelNotFound.hint":
      "İsteği yeniden gönderin veya uygulamayı yeniden başlatın.",
    "requests.error.cancelFailed.title": "İstek iptal edilemedi",
    "requests.error.cancelFailed.message":
      "Native backend iptal komutuna yanıt vermedi.",
    "requests.error.cancelFailed.hint":
      "Uygulamayı yeniden başlatıp tekrar deneyin.",
    "requests.error.invalidRequest.title": "İstek geçersiz",
    "requests.error.invalidRequest.message":
      "Metot, URL, header’lar, body veya timeout geçerli değil.",
    "requests.error.invalidRequest.hint":
      "İstek alanlarını kontrol edip tekrar deneyin.",
    "requests.error.missingVariables.title": "Eksik değişkenler",
    "requests.error.missingVariables.message":
      "İstek, değeri tanımlanmamış bir veya daha fazla değişken içeriyor.",
    "requests.error.missingVariables.hint":
      "Eksik değerleri etkin ortamda tanımlayın.",
    "requests.error.alreadyRunning.title": "İstek zaten çalışıyor",
    "requests.error.alreadyRunning.message":
      "Aynı istek ID’sine sahip başka bir işlem hâlâ çalışıyor.",
    "requests.error.alreadyRunning.hint":
      "Çalışan isteği iptal edin veya tamamlanmasını bekleyin.",
    "requests.error.canceled.title": "İstek iptal edildi",
    "requests.error.canceled.message": "İstek kullanıcı tarafından durduruldu.",
    "requests.error.canceled.hint":
      "URL ve form değerleri bu sekmede korunuyor.",
    "requests.error.timeout.title": "İstek zaman aşımına uğradı",
    "requests.error.timeout.message":
      "Hedef, istek zaman aşımı dolmadan yanıt vermedi.",
    "requests.error.timeout.hint":
      "Timeout değerini artırın veya hedef servisin erişilebilirliğini kontrol edin.",
    "requests.error.network.title": "Sunucuya ulaşılamadı",
    "requests.error.network.message": "Ağ bağlantısı kurulamadı.",
    "requests.error.network.hint":
      "Base URL, VPN, proxy ve sunucu durumunu kontrol edin.",
    "requests.error.failed.title": "İstek başarısız",
    "requests.error.failed.message":
      "Beklenmeyen bir bağlantı hatası oluştu.",
    "requests.error.failed.hint":
      "Teknik ayrıntıyı servis loglarıyla karşılaştırın.",
    "requests.error.responseRead.title": "Yanıt okunamadı",
    "requests.error.responseRead.message":
      "Sunucu yanıt verdi ancak yanıt body’si tamamlanamadı.",
    "requests.error.responseRead.hint":
      "Bağlantıyı kontrol edip isteği yeniden gönderin.",
    "requests.error.responseTooLarge.title": "Yanıt sınırı aştı",
    "requests.error.responseTooLarge.message":
      "Yanıt body’si güvenlik sınırını aştığı için indirme durduruldu.",
    "requests.error.responseTooLarge.hint":
      "Daha küçük bir veri kümesi isteyin veya endpoint’e sayfalama ya da filtre ekleyin.",
    "requests.error.responseHeadersTooLarge.title":
      "Response header’ları sınırı aştı",
    "requests.error.responseHeadersTooLarge.message":
      "Response header’ları 1 MiB güvenlik sınırını aştığı için istek durduruldu.",
    "requests.error.responseHeadersTooLarge.hint":
      "Sunucudaki büyük header değerlerini küçültün veya gereksiz response header’larını kaldırın.",

    "requests.editor.method.select": "HTTP metodu seç",
    "requests.editor.method.search": "Metotta ara",
    "requests.editor.query.label": "Sorgu parametreleri",
    "requests.editor.query.title": "Sorgu parametreleri",
    "requests.editor.query.description":
      "URL’den algılandı · değişiklikler doğrudan URL’ye yazılır.",
    "requests.editor.query.add": "Parametre ekle",
    "requests.editor.query.added": "Sorgu parametresi eklendi",
    "requests.editor.query.removed": "Sorgu parametresi silindi",
    "requests.editor.column.description": "Açıklama",
    "requests.editor.column.key": "Anahtar",
    "requests.editor.column.value": "Değer",
    "requests.editor.column.type": "Tür",
    "requests.editor.column.source": "Kaynak",
    "requests.editor.query.nameAt": "{index}. sorgu parametresinin adı",
    "requests.editor.query.valueAt": "{index}. sorgu parametresinin değeri",
    "requests.editor.query.detected": "URL’den algılandı",
    "requests.editor.query.deleteAt": "{index}. sorgu parametresini sil",
    "requests.editor.query.empty":
      "URL’de sorgu parametresi yok. URL’ye ?key=value ekleyin veya “Parametre ekle”yi kullanın.",
    "requests.editor.query.namePlaceholder": "Parametre adı",
    "requests.editor.query.newName": "Yeni sorgu parametresinin adı",
    "requests.editor.query.newValue": "Yeni sorgu parametresinin değeri",
    "requests.editor.query.confirmAdd": "Ekle",
    "requests.editor.query.cancelAdd":
      "Sorgu parametresi eklemeyi iptal et",
    "requests.editor.query.nameRequired":
      "Sorgu parametresinin adı boş bırakılamaz.",

    "requests.editor.variables.title": "{scope} değişkenleri",
    "requests.editor.variables.description":
      "URL, header ve body içindeki değişkenlerde kullanılır.",
    "requests.editor.variables.add": "Değişken ekle",
    "requests.editor.variables.removeOverride":
      "{key} değişken override’ını kaldır",
    "requests.editor.variables.environmentDefault": "Ortam varsayılanı",
    "requests.editor.variables.name": "{key} değişkeninin adı",
    "requests.editor.variables.value": "{key} değişkeninin değeri",
    "requests.editor.variables.empty":
      "Henüz değişken yok. URL’de {{baseUrl}} gibi bir ifade kullanacaksanız önce değerini ekleyin.",
    "requests.editor.variables.namePlaceholder": "Değişken adı",
    "requests.editor.variables.newName": "Yeni değişken adı",
    "requests.editor.variables.newValue": "Yeni değişken değeri",
    "requests.editor.variables.confirmAdd": "Ekle",
    "requests.editor.variables.cancelAdd": "Değişken eklemeyi iptal et",
    "requests.editor.variables.invalidName":
      "Değişken adı harf veya _ ile başlamalıdır.",
    "requests.editor.variables.duplicate": "Bu değişken zaten mevcut.",
    "requests.editor.variables.added": "{key} değişkeni eklendi",
    "requests.editor.variables.overrideRemoved":
      "{key} override’ı kaldırıldı; ortam varsayılanı etkin.",
    "requests.editor.variables.scope": "{name} ortamı",
    "requests.editor.variables.secretHint":
      "Gizli değerler ekranda saklanır. Bunlara {{variable}} biçiminde referans verin.",
    "requests.editor.variables.resolve":
      "Gönderirken {{değişkenleri}} çözümle",
    "requests.editor.variables.resolveDescription":
      "Süslü parantezleri olduğu gibi göndermek için kapatın. Tarayıcı cURL içe aktarımları tam istek doğruluğu için literal modda başlar.",
    "requests.editor.variables.literalEnabled":
      "Değişken çözümleme kapalı; {{ifadeler}} olduğu gibi gönderilecek.",
    "requests.editor.variables.resolutionEnabled":
      "Değişken çözümleme açık.",
    "requests.editor.variables.showSecret": "{key} değerini göster",
    "requests.editor.variables.hideSecret": "{key} değerini gizle",
    "requests.editor.type.secret": "Gizli",
    "requests.editor.type.string": "Metin",
    "requests.editor.source.override": "{scope} override",
    "requests.editor.source.default": "Varsayılan",
    "requests.editor.source.manual": "Elle",
    "requests.editor.source.openapi": "OpenAPI",
    "requests.editor.source.environment": "Ortam",
    "requests.editor.source.extracted": "Çıkarılan",
    "requests.editor.source.generated": "Üretilen",

    "requests.editor.headers.title": "İstek header’ları",
    "requests.editor.headers.description":
      "Tekrarlanan header adları desteklenir.",
    "requests.editor.headers.add": "Header ekle",
    "requests.editor.headers.added": "Header eklendi",
    "requests.editor.headers.removed": "Header silindi",
    "requests.editor.headers.enabledAt": "{index}. header etkin",
    "requests.editor.headers.namePlaceholder": "Header adı",
    "requests.editor.headers.nameAt": "{index}. header adı",
    "requests.editor.headers.valuePlaceholder": "Değer veya {{variable}}",
    "requests.editor.headers.valueAt": "{index}. header değeri",
    "requests.editor.headers.descriptionAt": "{index}. header açıklaması",
    "requests.editor.headers.delete": "Header’ı sil",
    "requests.editor.headers.empty":
      "Header eklenmedi. Validex isteğe otomatik header eklemez.",
    "requests.editor.headers.descriptionPlaceholder": "İsteğe bağlı not",

    "requests.editor.body.title": "JSON / raw body",
    "requests.editor.body.format": "Biçimlendir",
    "requests.editor.body.minify": "Küçült",
    "requests.editor.body.invalidJSON":
      "JSON sözdizimi geçerli değil. Hatalı satırı düzeltin.",
    "requests.editor.body.minifyFailed":
      "JSON küçültülemedi; sözdizimini kontrol edin.",
    "requests.editor.body.description":
      "Endpoint’in desteklediği JSON, metin, XML veya başka bir ham payload gönderin.",
    "requests.editor.body.placeholder": "İstek body’sini girin",
    "requests.editor.body.formatted": "JSON body biçimlendirildi.",
    "requests.editor.body.minified": "JSON body küçültüldü.",
    "requests.editor.body.loading": "Editör hazırlanıyor…",

    "requests.response.section.body": "Body",
    "requests.response.section.headers": "Header’lar",
    "requests.response.section.cookies": "Cookie’ler",
    "requests.response.section.timeline": "Zaman çizelgesi",
    "requests.response.section.raw": "Ham",
    "requests.response.section.contract": "Contract",
    "requests.response.viewerLoading": "Yanıt görüntüleyici hazırlanıyor…",
    "requests.response.formatted": "Biçimlendirilmiş yanıt",
    "requests.response.copied": "Kopyalandı",
    "requests.response.traceCopied": "Trace ID kopyalandı",
    "requests.response.copyBody": "Body’yi kopyala",
    "requests.response.copyRaw": "Ham yanıtı kopyala",
    "requests.response.noHeaders.title": "Bu yanıt header içermiyor",
    "requests.response.noHeaders.description":
      "Sunucudan header döndüğünde burada listelenir.",
    "requests.response.header": "Header",
    "requests.response.value": "Değer",
    "requests.response.noCookies.title": "Bu yanıt cookie içermiyor",
    "requests.response.noCookies.description":
      "Set-Cookie header’ları alındığında güvenlik ve süre bilgileriyle burada listelenir.",
    "requests.response.cookie": "Cookie",
    "requests.response.valueAndAttributes": "Değer ve nitelikler",
    "requests.response.cookie.domain": "Domain {value}",
    "requests.response.cookie.path": "Path {value}",
    "requests.response.cookie.expires": "Bitiş {value}",
    "requests.response.finding.missing": "Eksik alan",
    "requests.response.finding.extra": "Fazladan alan",
    "requests.response.finding.enum": "Enum ihlali",
    "requests.response.finding.type": "Tip veya kısıt",
    "requests.response.contract.pending.title": "Contract kontrolü bekleniyor",
    "requests.response.contract.pending.description":
      "OpenAPI’den açılan istek gönderildiğinde gerçek yanıt şemasıyla karşılaştırılır.",
    "requests.response.contract.ok.title":
      "Yanıt OpenAPI contract ile uyumlu",
    "requests.response.contract.ok.description":
      "{method} {path} için eksik alan, fazladan alan, tip farkı, şema kısıtı ihlali veya enum farkı bulunmadı.",
    "requests.response.contract.drift.one": "{count} contract farkı bulundu",
    "requests.response.contract.drift.many": "{count} contract farkı bulundu",
    "requests.response.contract.truncated": "ilk 1000 gösteriliyor",
    "requests.response.contract.driftDescription":
      "Yanıt kullanılabilir; aşağıdaki alanlar OpenAPI şemasıyla uyuşmuyor.",
    "requests.response.contract.truncatedDescription":
      "Karşılaştırmada daha fazla fark bulundu; yalnızca ilk 1000 tanesi gösteriliyor.",
    "requests.response.contract.jsonPath": "JSON path",
    "requests.response.contract.difference": "Fark",
    "requests.response.contract.expected": "Beklenen",
    "requests.response.contract.actual": "Gerçek",
    "requests.response.contract.specUnavailable.title":
      "OpenAPI contract bulunamadı",
    "requests.response.contract.specUnavailable.message":
      "Bu isteğin OpenAPI dokümanı artık bellekte değil.",
    "requests.response.contract.specUnavailable.hint":
      "OpenAPI dosyasını yeniden içe aktarın.",
    "requests.response.contract.schemaUnavailable.title":
      "Karşılaştırılacak JSON şeması yok",
    "requests.response.contract.schemaUnavailable.message":
      "{status} yanıtı için {contentType} content type ile eşleşen JSON media şeması bulunamadı.",
    "requests.response.contract.schemaUnavailable.hint":
      "Bu status veya default yanıt altına gerçek response media type ile eşleşen bir JSON şeması ekleyin.",
    "requests.response.contract.operationUnavailable.title":
      "OpenAPI operation bulunamadı",
    "requests.response.contract.operationUnavailable.message":
      "{method} {path} bu dokümanda bulunamadı.",
    "requests.response.timeline.preparation": "İstek hazırlığı",
    "requests.response.timeline.dns": "DNS",
    "requests.response.timeline.tcp": "TCP bağlantısı",
    "requests.response.timeline.tls": "TLS el sıkışması",
    "requests.response.timeline.request": "İstek gönderimi",
    "requests.response.timeline.server": "Sunucu bekleme",
    "requests.response.timeline.download": "Yanıt indirme",
    "requests.response.timeline.reused": "Mevcut bağlantı yeniden kullanıldı.",
    "requests.response.timeline.slow":
      "Toplam sürenin %{percent} kadarı sunucu yanıtını beklerken geçti.",
    "requests.response.timeline.empty":
      "Bu yanıt için zamanlama aşamaları alınamadı.",
    "requests.response.label": "Yanıt",
    "requests.response.unknownContentType": "Bilinmeyen content type",
    "requests.response.status": "Status: {value}",
    "requests.response.duration": "Süre: {value}",
    "requests.response.size": "Yanıt boyutu: {value}",
    "requests.response.contentType": "Content type: {value}",
    "requests.response.protocol": "Protokol: {value}",
    "requests.response.sending": "Gönderiliyor…",
    "requests.response.canceled": "İptal edildi",
    "requests.response.failed": "İstek başarısız",
    "requests.response.traceCopy": "Trace ID’yi kopyala",
    "requests.response.traceShort": "Trace {value}",
    "requests.response.remoteAddress": "Uzak adres: {value}",
    "requests.response.tlsVersion": "TLS: {value}",
    "requests.response.views": "Yanıt görünümleri",
    "requests.response.loading.title": "İstek gönderiliyor…",
    "requests.response.loading.description":
      "Üstteki İptal düğmesiyle durdurabilirsiniz.",
    "requests.response.technicalDetails": "Teknik ayrıntılar",
    "requests.response.tryAgain": "Yeniden gönder",
    "requests.response.rawEmpty.title": "Yanıt body’si boş",
    "requests.response.rawEmpty.description":
      "Sunucu ham yanıt içeriği döndürmedi.",
    "requests.response.empty.title": "Henüz yanıt yok",
    "requests.response.empty.description":
      "İsteği gönderdiğinizde status, süre, body, header ve ayrıntılı zaman çizelgesi burada görünecek.",

    "requests.openapiImport.empty":
      "{title} · Açılabilir endpoint bulunamadı.",
    "requests.openapiImport.loaded.one":
      "{title} · {count} endpoint yüklendi. API’ler bölümünden açabilirsiniz.",
    "requests.openapiImport.loaded.many":
      "{title} · {count} endpoint yüklendi. API’ler bölümünden açabilirsiniz.",
    "requests.openapiImport.failed":
      "OpenAPI içe aktarılamadı: {details}",
    "requests.openapiImport.unexpected": "Beklenmeyen bir hata oluştu.",
    "requests.openapiImport.runtimeUnavailable":
      "Dosya seçici açılamadı: Desktop runtime henüz hazır değil.",
    "requests.openapiImport.fileDialogFailed":
      "Dosya seçilemedi: Sistem dosya seçicisi tamamlanamadı.",
    "requests.openapiImport.invalid":
      "OpenAPI içe aktarılamadı: Dosya geçerli bir OpenAPI dokümanı değil.",
  },
);
