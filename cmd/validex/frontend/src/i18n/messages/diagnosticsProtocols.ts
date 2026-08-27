import { defineMessages } from "./defineMessages.js";

export const diagnosticsProtocolsMessages = defineMessages(
  {
    "diagnostics.eyebrow": "SPRING BOOT · RUNTIME INSPECTION",
    "diagnostics.title": "Diagnostics",
    "diagnostics.description":
      "Analyze API responses, tokens, and runtime data in one workspace.",
    "diagnostics.toolsLabel": "Diagnostics tools",
    "diagnostics.status.busy": "Working…",
    "diagnostics.status.busyDetail":
      "Keep this workspace open while Validex prepares the result.",
    "diagnostics.status.ready": "Ready",
    "diagnostics.mode.spring": "Spring Error",
    "diagnostics.mode.springDescription":
      "Turn a Spring HTTP error response into a readable cause and troubleshooting checklist.",
    "diagnostics.mode.jwt": "JWT",
    "diagnostics.mode.jwtDescription":
      "Decode token claims locally and review expiry, roles, and scopes without verifying the signature.",
    "diagnostics.mode.runtime": "Runtime",
    "diagnostics.mode.runtimeDescription":
      "Inspect read-only Spring Actuator health and metrics, then compare them with a baseline.",
    "diagnostics.mode.performance": "URL Performance",
    "diagnostics.mode.performanceDescription":
      "Run a few bounded, cold end-to-end URL checks and compare their response times.",
    "diagnostics.mode.environments": "Environments",
    "diagnostics.mode.environmentsDescription":
      "Send the same request to two or more targets and compare status, headers, and JSON bodies.",
    "diagnostics.mode.threadLogs": "Thread & Logs",
    "diagnostics.mode.threadLogsDescription":
      "Find blocked JVM threads or isolate application log lines by trace identifier.",
    "diagnostics.mode.coverage": "Coverage",
    "diagnostics.mode.coverageDescription":
      "Match known API endpoints with observed calls to expose untested paths.",
    "diagnostics.field.timeoutMilliseconds": "Timeout (ms)",
    "diagnostics.operation.stale":
      "The input or tool changed; the previous operation result was ignored.",
    "diagnostics.error.operationTitle": "Diagnostics operation failed",
    "diagnostics.error.operationMessage":
      "The diagnostics operation could not be completed.",
    "diagnostics.error.operationHint":
      "Check the input, endpoint access, and timeout, then try again.",
    "diagnostics.error.bridgeTitle": "Validex backend connection was lost",
    "diagnostics.error.bridgeHint":
      "Make sure the desktop app is running, then try again.",
    "diagnostics.error.invalidInputMessage":
      "One or more diagnostics inputs are invalid.",
    "diagnostics.error.invalidInputHint":
      "Review the required fields and their formats, then try again.",
    "diagnostics.error.unsafeMethodMessage":
      "This HTTP method requires explicit approval before it can be sent to multiple environments.",
    "diagnostics.error.unsafeMethodHint":
      "Approve the method only if sending it to every target is intentional.",
    "diagnostics.error.requestFailedMessage":
      "The target service could not be reached.",
    "diagnostics.error.requestFailedHint":
      "Check the endpoint, network access, authentication, and timeout.",
    "diagnostics.error.responseTooLargeMessage":
      "The response is too large to inspect safely.",
    "diagnostics.error.responseTooLargeHint":
      "Narrow the request or reduce the amount of data returned by the target.",
    "diagnostics.error.invalidResponseMessage":
      "The service returned a response that Validex could not inspect.",
    "diagnostics.error.invalidResponseHint":
      "Verify that the endpoint returns the expected diagnostics format.",
    "diagnostics.error.limitExceededMessage":
      "The diagnostics input or result exceeded a safety limit.",
    "diagnostics.error.limitExceededHint":
      "Reduce the input or narrow the scope of the diagnostics operation.",
    "diagnostics.error.diagnosticFailedMessage":
      "The diagnostics operation failed before a result was produced.",
    "diagnostics.error.coverageSpecMissingMessage":
      "No imported OpenAPI specification is available for coverage analysis.",
    "diagnostics.error.coverageSpecMissingHint":
      "Import an OpenAPI specification, then run coverage analysis again.",
    "diagnostics.error.networkOperationInvalidMessage":
      "The URL performance operation could not be started.",
    "diagnostics.error.networkInspectionFailedMessage":
      "The target URL could not be inspected.",
    "diagnostics.error.networkInspectionFailedHint":
      "Check the URL, network access, redirect chain, and per-sample timeout.",
    "diagnostics.error.toolTimeoutMessage":
      "The URL check exceeded its timeout.",
    "diagnostics.error.toolCanceledMessage": "The URL check was canceled.",
    "diagnostics.error.headersJSON": "Headers must be a valid JSON object.",
    "diagnostics.error.headersObject": "Headers must be a JSON object.",
    "diagnostics.error.headersText":
      "Header names and values must be text.",
    "diagnostics.error.headerLine":
      "Header line {line} must use the “Name: value” format.",
    "diagnostics.error.knownLine":
      "Known endpoint line {line} must use the “METHOD /path” format.",
    "diagnostics.error.observedLine":
      "Observed call line {line} must use the “METHOD /path [count]” format.",
    "diagnostics.error.observedCount":
      "Observed count on line {line} must be a positive integer.",

    "diagnostics.spring.category": "Category",
    "diagnostics.spring.category.problemDetail": "Problem detail",
    "diagnostics.spring.category.validation": "Validation",
    "diagnostics.spring.category.unauthorized": "Unauthorized",
    "diagnostics.spring.category.forbidden": "Forbidden",
    "diagnostics.spring.category.notFound": "Not found",
    "diagnostics.spring.category.conflict": "Conflict",
    "diagnostics.spring.category.serverError": "Server error",
    "diagnostics.spring.category.httpError": "HTTP error",
    "diagnostics.spring.format": "Spring format",
    "diagnostics.spring.traceRequestID": "Trace / Request ID",
    "diagnostics.spring.exception": "Exception",
    "diagnostics.spring.instance": "Instance",
    "diagnostics.spring.beanValidation": "Bean Validation",
    "diagnostics.spring.recognized": "Recognized",
    "diagnostics.spring.genericResponse": "Generic HTTP response",
    "diagnostics.spring.notFound": "Not found",
    "diagnostics.spring.exceptionMissing": "Not present in response",
    "diagnostics.spring.fieldCount": "{count} field errors parsed",
    "diagnostics.spring.field": "Field",
    "diagnostics.spring.message": "Message",
    "diagnostics.spring.rejectedValue": "Rejected value",
    "diagnostics.spring.checklist": "Checklist",
    "diagnostics.spring.defaultTitle.problemDetail": "Problem Detail",
    "diagnostics.spring.defaultTitle.validation": "Bean Validation error",
    "diagnostics.spring.defaultTitle.unauthorized":
      "Authentication required",
    "diagnostics.spring.defaultTitle.forbidden":
      "Not authorized for this operation",
    "diagnostics.spring.defaultTitle.notFound":
      "Resource or endpoint not found",
    "diagnostics.spring.defaultTitle.conflict": "Resource conflict",
    "diagnostics.spring.defaultTitle.serverError": "Server error",
    "diagnostics.spring.defaultTitle.httpError": "HTTP error",
    "diagnostics.spring.noDetails": "The response contains no details.",
    "diagnostics.spring.advice.problemDetail.1":
      "Compare the type and instance fields with responses from the same error family.",
    "diagnostics.spring.advice.problemDetail.2":
      "If a trace ID is available, search the logs for the matching server record.",
    "diagnostics.spring.advice.validation.1":
      "Compare the field names in the error list with the request body.",
    "diagnostics.spring.advice.validation.2":
      "Check the Bean Validation constraints and nullability rules on the DTO.",
    "diagnostics.spring.advice.unauthorized.1":
      "Check that the Authorization header was sent and that the token has not expired.",
    "diagnostics.spring.advice.unauthorized.2":
      "Inspect issuer and audience values in the JWT tool.",
    "diagnostics.spring.advice.forbidden.1":
      "Compare the token roles and scopes with the endpoint authorization rule.",
    "diagnostics.spring.advice.forbidden.2":
      "Authentication may succeed while permission to access the resource is still missing.",
    "diagnostics.spring.advice.notFound.1":
      "Verify the base URL, context path, and endpoint method.",
    "diagnostics.spring.advice.notFound.2":
      "If Actuator mappings are enabled, confirm that the endpoint is registered in the running service.",
    "diagnostics.spring.advice.conflict.1":
      "Check for another record using the same unique value or resource version.",
    "diagnostics.spring.advice.conflict.2":
      "Compare the domain rule in the response detail with the request data.",
    "diagnostics.spring.advice.serverError.1":
      "Find the log record using the trace ID; focus on the exception and first root-cause line.",
    "diagnostics.spring.advice.serverError.2":
      "Check thread, heap, GC, and connection-pool values in Runtime.",
    "diagnostics.spring.advice.httpError.1":
      "Evaluate the status, response detail, and submitted request together.",
    "diagnostics.spring.advice.httpError.2":
      "Compare the request with a known working environment.",
    "diagnostics.spring.advice.status400":
      "Check request JSON syntax, Content-Type, field types, and required fields.",
    "diagnostics.spring.advice.status401":
      "Verify the token expiration, issuer, and audience claims in JWT.",
    "diagnostics.spring.advice.status403":
      "Compare the endpoint's expected role/scope with the token claims.",
    "diagnostics.spring.advice.status500":
      "Search the request logs using the trace ID and inspect the Runtime snapshot.",
    "diagnostics.spring.activeTab":
      "Active tab: {name} · HTTP {status}",
    "diagnostics.spring.responseTitle": "Spring error response",
    "diagnostics.spring.inputHint":
      "Paste a response or load it from the active request",
    "diagnostics.spring.loadActive": "Load active response",
    "diagnostics.spring.bodyLabel": "Spring error response body",
    "diagnostics.spring.headersLabel": "Response headers",
    "diagnostics.spring.httpStatus": "HTTP status",
    "diagnostics.spring.analyze": "Analyze error",
    "diagnostics.spring.emptyTitle": "Waiting for analysis",
    "diagnostics.spring.emptyDescription":
      "Turn ProblemDetail, Bean Validation, and 4xx/5xx responses into a readable summary.",
    "diagnostics.spring.noActiveResponse":
      "The active request tab has no response to analyze.",
    "diagnostics.spring.activeRequest": "Active request",
    "diagnostics.spring.responseLoaded": "{name} response loaded.",
    "diagnostics.spring.bodyRequired":
      "Enter a response body to analyze.",
    "diagnostics.spring.success":
      "Spring error response analyzed locally.",

    "diagnostics.jwt.localWarning":
      "The token was decoded locally only. Its signature and trustworthiness were not verified.",
    "diagnostics.jwt.active": "Token is active in its time window",
    "diagnostics.jwt.inactive": "Token is not active",
    "diagnostics.jwt.expired": "The token has expired.",
    "diagnostics.jwt.signaturePresent":
      "A signature segment is present, but cryptographic verification was not performed.",
    "diagnostics.jwt.signatureMissing": "The token signature segment is empty.",
    "diagnostics.jwt.algorithm": "Algorithm",
    "diagnostics.jwt.subject": "Subject",
    "diagnostics.jwt.issuer": "Issuer",
    "diagnostics.jwt.audience": "Audience",
    "diagnostics.jwt.roles": "Roles",
    "diagnostics.jwt.scopes": "Scopes",
    "diagnostics.jwt.tokenLabel": "JWT token",
    "diagnostics.jwt.issuedAt": "Issued at",
    "diagnostics.jwt.expires": "Expires",
    "diagnostics.jwt.notBefore": "Not before",
    "diagnostics.jwt.noRoles": "No role claim found.",
    "diagnostics.jwt.noScopes": "No scope claim found.",
    "diagnostics.jwt.details": "Header and payload",
    "diagnostics.jwt.inputHint":
      "A Bearer prefix is accepted; the token never leaves this device",
    "diagnostics.jwt.inputTitle": "JWT input",
    "diagnostics.jwt.decode": "Decode claims",
    "diagnostics.jwt.emptyTitle": "Waiting for a token",
    "diagnostics.jwt.emptyDescription":
      "Inspect expiration, issuer, audience, role, and scope claims.",
    "diagnostics.jwt.success":
      "JWT claims decoded locally; the signature was not verified.",
    "diagnostics.jwt.threeParts": "JWT must contain three segments.",
    "diagnostics.jwt.invalidBase64":
      "The JWT segment could not be decoded as base64url.",
    "diagnostics.jwt.invalidJSON":
      "The JWT header and payload must contain valid JSON.",

    "diagnostics.runtime.unknown": "Unknown",
    "diagnostics.runtime.healthEyebrow": "HEALTH",
    "diagnostics.runtime.metricsEyebrow": "METRICS",
    "diagnostics.runtime.baselineEyebrow": "BASELINE",
    "diagnostics.runtime.mappingsEyebrow": "MAPPINGS",
    "diagnostics.runtime.applicationContext": "application context",
    "diagnostics.runtime.components": "{count} components",
    "diagnostics.runtime.noSnapshotTime": "No snapshot timestamp",
    "diagnostics.runtime.deltaCount": "{count} deltas",
    "diagnostics.runtime.none": "None",
    "diagnostics.runtime.comparison": "Before / after comparison",
    "diagnostics.runtime.baselineHint": "You can capture a baseline",
    "diagnostics.runtime.disabled": "Disabled",
    "diagnostics.runtime.notRequested": "Not requested",
    "diagnostics.runtime.healthComponents": "Health components",
    "diagnostics.runtime.healthDescription":
      "Top level of the Actuator health tree",
    "diagnostics.runtime.component": "Component",
    "diagnostics.runtime.status": "Status",
    "diagnostics.runtime.metric": "Metric",
    "diagnostics.runtime.delta": "Delta",
    "diagnostics.runtime.metricSnapshot": "Metric snapshot",
    "diagnostics.runtime.metricDescription":
      "Selected JVM and dependency metrics",
    "diagnostics.runtime.statistic": "Statistic",
    "diagnostics.runtime.value": "Value",
    "diagnostics.runtime.unit": "Unit",
    "diagnostics.runtime.noMeasurement": "No measurement",
    "diagnostics.runtime.baselineDifference": "Baseline difference",
    "diagnostics.runtime.baselineDifferenceDescription":
      "Change between the first and latest snapshots",
    "diagnostics.runtime.before": "Before",
    "diagnostics.runtime.after": "After",
    "diagnostics.runtime.metricFailures":
      "Some metric endpoints are not available: {names}",
    "diagnostics.runtime.baseURL": "Actuator base URL",
    "diagnostics.runtime.includeMappings": "Read mappings too",
    "diagnostics.runtime.headers": "Headers",
    "diagnostics.runtime.metricNames": "Metric names",
    "diagnostics.runtime.captureBaseline": "Capture baseline",
    "diagnostics.runtime.captureSnapshot": "Capture snapshot",
    "diagnostics.runtime.captureDelta": "New snapshot and delta",
    "diagnostics.runtime.clearBaseline": "Clear baseline",
    "diagnostics.runtime.readOnlyHint":
      "Actuator calls are read-only. Header values are not saved to the workspace.",
    "diagnostics.runtime.emptyTitle": "No runtime snapshot",
    "diagnostics.runtime.emptyDescription":
      "Read Health, JVM, GC, Hikari, and messaging metrics from the running service.",
    "diagnostics.runtime.baseURLRequired": "Enter an Actuator base URL.",
    "diagnostics.runtime.metricRequired":
      "Enter at least one Actuator metric name.",
    "diagnostics.runtime.noBaselineSnapshot":
      "The Actuator response did not contain a metric snapshot that can be saved as a baseline.",
    "diagnostics.runtime.baselineSuccess":
      "Metric baseline captured. Exercise the service, then capture a new snapshot.",
    "diagnostics.runtime.compareSuccess":
      "Runtime snapshot compared with the baseline.",
    "diagnostics.runtime.snapshotSuccess": "Runtime snapshot captured.",
    "diagnostics.runtime.baselineFailure":
      "Runtime metric baseline could not be captured.",
    "diagnostics.runtime.snapshotFailure":
      "Runtime snapshot could not be captured.",
    "diagnostics.runtime.baselineCleared": "Runtime baseline cleared.",

    "diagnostics.performance.targetTitle": "Test a URL",
    "diagnostics.performance.targetDescription":
      "Measure cold end-to-end latency with isolated requests.",
    "diagnostics.performance.url": "Test URL",
    "diagnostics.performance.urlHelp":
      "Validex sends HEAD and uses a bounded GET fallback only when the server rejects HEAD.",
    "diagnostics.performance.methodLabel": "Request strategy",
    "diagnostics.performance.methodValue": "HEAD / GET fallback",
    "diagnostics.performance.timeout": "Timeout",
    "diagnostics.performance.samples": "Runs",
    "diagnostics.performance.samplesUnit": "runs",
    "diagnostics.performance.run": "Start test",
    "diagnostics.performance.stop": "Stop test",
    "diagnostics.performance.stopping": "Stopping…",
    "diagnostics.performance.cancelRejectedTitle":
      "URL test could not be stopped",
    "diagnostics.performance.cancelRejectedMessage":
      "The backend did not accept the stop command for the active sample.",
    "diagnostics.performance.cancelRejectedHint":
      "Retry Stop; the bounded sample remains active until it finishes or reaches its timeout.",
    "diagnostics.performance.cancelFailure":
      "The URL performance stop command could not be completed.",
    "diagnostics.performance.safetyHint":
      "Runs from this device. Test only systems you are authorized to access.",
    "diagnostics.performance.resultTitle": "Cold request latency",
    "diagnostics.performance.resultDescription":
      "Each run opens a fresh transport and includes DNS, connection, redirects, and response time.",
    "diagnostics.performance.metricsLabel": "Timing summary",
    "diagnostics.performance.fastest": "Fastest",
    "diagnostics.performance.average": "Average",
    "diagnostics.performance.slowest": "Slowest",
    "diagnostics.performance.completedSamples": "Completed samples",
    "diagnostics.performance.sample": "Sample",
    "diagnostics.performance.status": "HTTP status",
    "diagnostics.performance.duration": "Duration",
    "diagnostics.performance.finalURL": "Final URL",
    "diagnostics.performance.sampleBreakdown": "Run details",
    "diagnostics.performance.durationScale":
      "Bars are relative to the slowest run",
    "diagnostics.performance.emptyTitle": "Ready to measure",
    "diagnostics.performance.emptyDescription":
      "Results will appear here after the first bounded run.",
    "diagnostics.performance.success":
      "Completed {count} URL performance samples.",
    "diagnostics.performance.canceled": "URL performance test stopped.",
    "diagnostics.performance.failure":
      "The URL performance test could not be completed.",
    "diagnostics.performance.urlRequired": "Enter a target URL.",
    "diagnostics.performance.urlInvalid":
      "Enter a valid absolute HTTP or HTTPS URL.",
    "diagnostics.performance.urlProtocol":
      "Only HTTP and HTTPS URLs can be tested.",
    "diagnostics.performance.urlCredentials":
      "Remove the username or password from the URL.",
    "diagnostics.performance.urlFragment":
      "Remove the URL fragment (#…) before running the test.",
    "diagnostics.performance.sampleRange":
      "Samples must be a whole number from {minimum} to {maximum}.",
    "diagnostics.performance.timeoutRange":
      "Timeout must be a whole number from 1 to {maximum} ms.",
    "diagnostics.performance.budgetExceeded":
      "{samples} samples × {timeout} ms exceeds the {maximum} ms total safety budget.",

    "diagnostics.environment.error": "Error",
    "diagnostics.environment.shortLabel": "ENV {number}",
    "diagnostics.environment.summary":
      "Status {status} · Body {body}",
    "diagnostics.environment.status": "Status",
    "diagnostics.environment.path": "Path",
    "diagnostics.environment.baselineColumn": "Baseline",
    "diagnostics.environment.environmentColumn": "Environment",
    "diagnostics.environment.missingURL": "No URL",
    "diagnostics.environment.bodyTruncated":
      "Body truncated at the size limit",
    "diagnostics.environment.defaultBaseline": "Baseline",
    "diagnostics.environment.defaultCandidate": "Environment",
    "diagnostics.environment.same": "same",
    "diagnostics.environment.different": "different",
    "diagnostics.environment.matched": "Matched",
    "diagnostics.environment.hasDifference": "Differences found",
    "diagnostics.environment.bodyMode": "Body mode",
    "diagnostics.environment.headerDifference": "Header differences",
    "diagnostics.environment.noDifference": "None",
    "diagnostics.environment.firstDifferences": " · first 1000 differences",
    "diagnostics.environment.jsonDifference": "JSON differences",
    "diagnostics.environment.resultsLimited": " · results limited",
    "diagnostics.environment.type": "Type",
    "diagnostics.environment.change.added": "Added",
    "diagnostics.environment.change.removed": "Removed",
    "diagnostics.environment.change.changed": "Changed",
    "diagnostics.environment.change.type": "Type changed",
    "diagnostics.environment.emptyTitle": "No comparison result",
    "diagnostics.environment.emptyDescription":
      "Run the comparison for at least two environments.",
    "diagnostics.environment.responseBody": "{name} response body",
    "diagnostics.environment.emptyBody": "Body is empty.",
    "diagnostics.environment.method": "Method",
    "diagnostics.environment.relativePath": "Relative path",
    "diagnostics.environment.name": "Name",
    "diagnostics.environment.baseURL": "Base URL",
    "diagnostics.environment.defaultName.local": "Local",
    "diagnostics.environment.defaultName.test": "Test",
    "diagnostics.environment.defaultName.staging": "Staging",
    "diagnostics.environment.legend": "Environment {number}",
    "diagnostics.environment.ignorePaths": "Ignored JSONPaths",
    "diagnostics.environment.requestBody": "Request body",
    "diagnostics.environment.safeBodyHint":
      "Usually left empty for this method.",
    "diagnostics.environment.unsafeConsent":
      "I explicitly allow the {method} request to be sent to every populated environment.",
    "diagnostics.environment.compare": "Compare environments",
    "diagnostics.environment.baselineHint":
      "The first environment is used as the baseline.",
    "diagnostics.environment.noResultTitle": "No environment result",
    "diagnostics.environment.noResultDescription":
      "Inspect status, header, and JSON differences for the same request side by side.",
    "diagnostics.environment.twoRequired":
      "Enter base URLs for at least two environments.",
    "diagnostics.environment.unsafeWarning":
      "{method} can change data in multiple environments. Select the explicit consent checkbox first.",
    "diagnostics.environment.success": "{count} environments compared.",
    "diagnostics.environment.failure":
      "Environment comparison could not be completed.",

    "diagnostics.thread.deadlockWarning":
      "The JVM dump contains an explicit deadlock marker. Inspect the related thread and lock chains immediately.",
    "diagnostics.thread.eyebrow": "THREADS",
    "diagnostics.thread.threadColumn": "Thread",
    "diagnostics.thread.stateColumn": "State",
    "diagnostics.thread.dumpTitle": "JVM thread dump",
    "diagnostics.thread.limited": "Results limited",
    "diagnostics.thread.complete": "Complete analysis",
    "diagnostics.thread.count": "threads",
    "diagnostics.thread.blockedTitle": "Blocked / lock-waiting threads",
    "diagnostics.thread.findingCount": "{count} findings",
    "diagnostics.thread.clue": "Clue",
    "diagnostics.thread.unnamed": "unnamed",
    "diagnostics.thread.noLockDetails": "No lock details",
    "diagnostics.thread.repeatedTitle": "Repeated stacks",
    "diagnostics.thread.repeatedDescription":
      "Groups of threads stalled in similar work",
    "diagnostics.thread.group": "{count} threads · {names}",
    "diagnostics.thread.noFrames": "No stack frames",
    "diagnostics.thread.deadlockClues": "Deadlock / lock clues ({count})",
    "diagnostics.thread.toolsLabel": "Thread and log tools",
    "diagnostics.thread.dumpTab": "Thread dump",
    "diagnostics.thread.logTab": "Trace log search",
    "diagnostics.thread.dumpHint": "Paste a jstack-formatted text dump",
    "diagnostics.thread.dumpLabel": "JVM thread dump",
    "diagnostics.thread.analyze": "Analyze threads",
    "diagnostics.thread.emptyTitle": "Waiting for thread analysis",
    "diagnostics.thread.emptyDescription":
      "Find blocked threads, deadlock clues, and repeated stacks.",
    "diagnostics.thread.required":
      "Paste thread dump text to analyze.",
    "diagnostics.thread.success": "{count} threads analyzed.",
    "diagnostics.thread.failure":
      "Thread dump analysis could not be completed.",

    "diagnostics.log.title": "Application log",
    "diagnostics.log.description":
      "Search runs only on the pasted text and on this device",
    "diagnostics.log.traceLabel": "Trace / correlation ID",
    "diagnostics.log.inputLabel": "Log text to search",
    "diagnostics.log.caseSensitive": "Case-sensitive",
    "diagnostics.log.useActiveTitle":
      "Use the trace ID from the active request response",
    "diagnostics.log.noActiveTitle":
      "The active response has no trace ID",
    "diagnostics.log.activeResponseID": "Active response ID",
    "diagnostics.log.search": "Search logs",
    "diagnostics.log.emptyTitle": "Waiting for a log search",
    "diagnostics.log.emptyDescription":
      "Find log lines related to a trace or correlation ID from the response.",
    "diagnostics.log.matchCount": "{count} matches",
    "diagnostics.log.scannedCount": "{count} lines scanned",
    "diagnostics.log.noMatchTitle": "No matches found",
    "diagnostics.log.noMatchDescription":
      "Check the complete ID and the case-sensitivity setting.",
    "diagnostics.log.required":
      "Enter both log text and the trace/correlation ID to search for.",
    "diagnostics.log.success": "{count} log lines found.",
    "diagnostics.log.failure":
      "Trace/correlation ID search could not be completed.",

    "diagnostics.coverage.aria": "Endpoint coverage {percentage} percent",
    "diagnostics.coverage.called": "{covered} / {total} endpoints called",
    "diagnostics.coverage.disclaimer":
      "This ratio is based only on the supplied observed-call list; it is not code or test coverage.",
    "diagnostics.coverage.endpoints": "Endpoints",
    "diagnostics.coverage.method": "Method",
    "diagnostics.coverage.path": "Path",
    "diagnostics.coverage.matchDescription":
      "Known route → observed hit match",
    "diagnostics.coverage.hit": "Hits",
    "diagnostics.coverage.observedPath": "Observed path",
    "diagnostics.coverage.notSeen": "Not seen yet",
    "diagnostics.coverage.unknownCalls":
      "Calls not present in the known list",
    "diagnostics.coverage.routeCount": "{count} routes",
    "diagnostics.coverage.knownDescription": "Each line: METHOD /path",
    "diagnostics.coverage.knownTitle": "Known endpoints",
    "diagnostics.coverage.knownLabel": "Known endpoint list",
    "diagnostics.coverage.observedDescription":
      "Each line: METHOD /path [count]",
    "diagnostics.coverage.observedTitle": "Observed calls",
    "diagnostics.coverage.observedLabel": "Observed call list",
    "diagnostics.coverage.fromSession": "Calculate from this session",
    "diagnostics.coverage.calculate": "Calculate coverage",
    "diagnostics.coverage.templateHint":
      "{id}, *, and ** route templates are matched against concrete calls.",
    "diagnostics.coverage.emptyTitle": "No coverage result",
    "diagnostics.coverage.emptyDescription":
      "Match endpoints known from OpenAPI with requests from this session, or enter the lists manually.",
    "diagnostics.coverage.knownRequired":
      "Enter at least one known endpoint.",
    "diagnostics.coverage.success": "{covered}/{total} endpoints matched.",
    "diagnostics.coverage.sessionSuccess":
      "{covered}/{total} endpoints matched requests from this session.",
    "diagnostics.coverage.failure":
      "Endpoint coverage analysis could not be completed.",
    "diagnostics.coverage.sessionFailure":
      "Recorded endpoint coverage analysis could not be completed.",

    "protocol.eyebrow": "SERVER-SENT EVENTS · BOUNDED",
    "protocol.title": "SSE Stream",
    "protocol.description":
      "Connect to an SSE endpoint, inspect each event, and keep partial results when the stream stops.",
    "protocol.waiting":
      "Waiting for events until the stream closes, reaches its limit, or times out.",
    "protocol.cancel": "Cancel",
    "protocol.canceling": "Canceling…",
    "protocol.cancelRejectedTitle": "SSE stream could not be stopped",
    "protocol.cancelRejectedMessage":
      "The backend found no running SSE stream for this operation ID.",
    "protocol.cancelRejectedHint":
      "The stream may have completed. Wait for the result or start it again.",
    "protocol.error.bridgeTitle": "Validex backend connection was lost",
    "protocol.error.bridgeMessage":
      "The SSE stream could not be completed in the desktop backend.",
    "protocol.error.bridgeHint":
      "Check the SSE connection settings, then try the stream again.",
    "protocol.error.connectionTitle": "SSE connection could not be completed",
    "protocol.error.operationMessage": "The SSE stream could not be completed.",
    "protocol.error.operationHint":
      "Check the URL, timeout, TLS, and request headers, then try again.",
    "protocol.error.sseFailedTitle": "SSE stream failed",
    "protocol.error.sseFailedMessage":
      "The SSE stream could not be completed.",
    "protocol.error.toolTimeoutTitle": "SSE stream timed out",
    "protocol.error.toolTimeoutMessage":
      "The target did not respond within the configured timeout.",
    "protocol.error.toolCanceledTitle": "SSE stream canceled",
    "protocol.error.toolCanceledMessage":
      "The stream was canceled before it completed.",
    "protocol.error.invalidInputTitle": "SSE input is invalid",
    "protocol.error.invalidInputMessage":
      "One or more SSE connection settings are invalid.",
    "protocol.error.unknown": "An unknown error occurred.",
    "protocol.validation.json": "{label} must be a valid JSON object.",
    "protocol.validation.object":
      "{label} must be a JSON object containing key-value pairs.",
    "protocol.validation.emptyKey":
      "{label} cannot contain an empty key.",
    "protocol.validation.textValue":
      "The “{key}” value in {label} must be text.",
    "protocol.validation.integer":
      "{label} must be an integer between 1 and {maximum}.",
    "protocol.validation.required": "{label} address is required.",
    "protocol.validation.invalid": "{label} address is invalid.",
    "protocol.validation.protocol":
      "{label} address must start with {protocols}.",
    "protocol.validation.or": " or ",
    "protocol.validation.hostname":
      "{label} address is missing a hostname.",
    "protocol.label.header": "Header",
    "protocol.label.timeout": "Timeout",
    "protocol.label.eventLimit": "Event limit",
    "protocol.unit.seconds": "sec",
    "protocol.metric.duration": "Duration",
    "protocol.metric.event": "Events",

    "protocol.sse.connection": "SSE connection",
    "protocol.sse.connectionDescription":
      "Connect to an HTTP event-stream endpoint",
    "protocol.sse.url": "Event stream URL",
    "protocol.sse.urlHelp":
      "Use a complete HTTP or HTTPS URL that returns text/event-stream.",
    "protocol.sse.maxEvents": "Maximum events",
    "protocol.sse.timeoutHelp":
      "The stream closes after 1–600 seconds.",
    "protocol.sse.eventLimitHelp":
      "Keep between 1 and 10,000 events in this result.",
    "protocol.headers": "Request headers · JSON",
    "protocol.headersHint": "Every header value must be text.",
    "protocol.skipCertificate": "Skip certificate verification",
    "protocol.sse.certificateHint":
      "Use only with local, self-signed HTTPS development servers.",
    "protocol.sse.listening": "Listening…",
    "protocol.sse.listen": "Listen to stream",
    "protocol.sse.limitHint":
      "The connection closes when the event limit is reached.",
    "protocol.sse.resultLabel": "SSE result",
    "protocol.sse.events": "Events",
    "protocol.sse.resultDescription":
      "Event, ID, retry, and data fields are shown separately",
    "protocol.sse.completed":
      "Connection completed with HTTP {status}; {count} events received.",
    "protocol.sse.partialResult":
      "The stream stopped with an issue; {count} events were preserved.",
    "protocol.sse.eventTable": "Received server-sent events",
    "protocol.sse.column.event": "Event",
    "protocol.sse.column.id": "ID",
    "protocol.sse.column.retry": "Retry",
    "protocol.sse.column.data": "Data",
    "protocol.responseHeaders": "Response headers",
    "protocol.sse.emptyStreamTitle": "The stream sent no events",
    "protocol.sse.emptyStreamDescription":
      "The connection succeeded, but no event arrived before the stream closed.",
    "protocol.noConnectionTitle": "No connection yet",
    "protocol.sse.noConnectionDescription":
      "Set the URL and limits, then choose “Listen to stream”.",
    "protocol.sse.loading": "Waiting for the SSE stream",
  },
  {
    "diagnostics.eyebrow": "SPRING BOOT · ÇALIŞMA ZAMANI İNCELEMESİ",
    "diagnostics.title": "Tanılama",
    "diagnostics.description":
      "API yanıtlarını, token’ları ve çalışma zamanı verilerini tek çalışma alanında analiz edin.",
    "diagnostics.toolsLabel": "Tanılama araçları",
    "diagnostics.status.busy": "İşlem sürüyor…",
    "diagnostics.status.busyDetail":
      "Validex sonucu hazırlarken bu çalışma alanını açık tutun.",
    "diagnostics.status.ready": "Hazır",
    "diagnostics.mode.spring": "Spring Hatası",
    "diagnostics.mode.springDescription":
      "Spring HTTP hata response’unu okunabilir nedene ve çözüm kontrol listesine dönüştürün.",
    "diagnostics.mode.jwt": "JWT",
    "diagnostics.mode.jwtDescription":
      "İmzayı doğrulamadan token claim’lerini yerel olarak çözün; süre, rol ve scope’ları inceleyin.",
    "diagnostics.mode.runtime": "Çalışma Zamanı",
    "diagnostics.mode.runtimeDescription":
      "Salt okunur Spring Actuator health ve metric verilerini inceleyip baseline ile karşılaştırın.",
    "diagnostics.mode.performance": "URL Performansı",
    "diagnostics.mode.performanceDescription":
      "Sınırlı sayıda soğuk uçtan uca URL kontrolü çalıştırıp yanıt sürelerini karşılaştırın.",
    "diagnostics.mode.environments": "Ortamlar",
    "diagnostics.mode.environmentsDescription":
      "Aynı request’i iki veya daha fazla hedefe gönderip status, header ve JSON body’lerini karşılaştırın.",
    "diagnostics.mode.threadLogs": "İş Parçacıkları ve Loglar",
    "diagnostics.mode.threadLogsDescription":
      "Blocked JVM thread’lerini bulun veya uygulama log satırlarını trace kimliğiyle ayıklayın.",
    "diagnostics.mode.coverage": "Kapsama",
    "diagnostics.mode.coverageDescription":
      "Test edilmemiş path’leri görmek için bilinen API endpoint’lerini gözlemlenen çağrılarla eşleştirin.",
    "diagnostics.field.timeoutMilliseconds": "Zaman aşımı (ms)",
    "diagnostics.operation.stale":
      "Girdi veya araç değişti; önceki işlemin sonucu yok sayıldı.",
    "diagnostics.error.operationTitle": "Tanılama işlemi tamamlanamadı",
    "diagnostics.error.operationMessage":
      "Tanılama işlemi tamamlanamadı.",
    "diagnostics.error.operationHint":
      "Girdiyi, endpoint erişimini ve timeout değerini kontrol edip yeniden deneyin.",
    "diagnostics.error.bridgeTitle": "Validex backend bağlantısı kesildi",
    "diagnostics.error.bridgeHint":
      "Masaüstü uygulamasının çalıştığını kontrol edip yeniden deneyin.",
    "diagnostics.error.invalidInputMessage":
      "Bir veya daha fazla tanılama girdisi geçerli değil.",
    "diagnostics.error.invalidInputHint":
      "Zorunlu alanları ve biçimlerini kontrol edip yeniden deneyin.",
    "diagnostics.error.unsafeMethodMessage":
      "Bu HTTP metodunun birden fazla ortama gönderilmesi için açık onay gerekiyor.",
    "diagnostics.error.unsafeMethodHint":
      "Yalnızca tüm hedeflere göndermek istediğinizden eminseniz metodu onaylayın.",
    "diagnostics.error.requestFailedMessage":
      "Hedef servise ulaşılamadı.",
    "diagnostics.error.requestFailedHint":
      "Endpoint’i, ağ erişimini, kimlik doğrulamayı ve timeout değerini kontrol edin.",
    "diagnostics.error.responseTooLargeMessage":
      "Yanıt güvenli biçimde incelenemeyecek kadar büyük.",
    "diagnostics.error.responseTooLargeHint":
      "İsteği daraltın veya hedefin döndürdüğü veri miktarını azaltın.",
    "diagnostics.error.invalidResponseMessage":
      "Servis, Validex’in inceleyemediği bir yanıt döndürdü.",
    "diagnostics.error.invalidResponseHint":
      "Endpoint’in beklenen tanılama biçimini döndürdüğünü doğrulayın.",
    "diagnostics.error.limitExceededMessage":
      "Tanılama girdisi veya sonucu güvenlik sınırını aştı.",
    "diagnostics.error.limitExceededHint":
      "Girdiyi azaltın veya tanılama işleminin kapsamını daraltın.",
    "diagnostics.error.diagnosticFailedMessage":
      "Tanılama işlemi sonuç üretilemeden başarısız oldu.",
    "diagnostics.error.coverageSpecMissingMessage":
      "Coverage analizi için içe aktarılmış bir OpenAPI tanımı yok.",
    "diagnostics.error.coverageSpecMissingHint":
      "Bir OpenAPI tanımı içe aktarıp coverage analizini yeniden çalıştırın.",
    "diagnostics.error.networkOperationInvalidMessage":
      "URL performans işlemi başlatılamadı.",
    "diagnostics.error.networkInspectionFailedMessage":
      "Hedef URL incelenemedi.",
    "diagnostics.error.networkInspectionFailedHint":
      "URL’yi, ağ erişimini, yönlendirme zincirini ve örnek zaman aşımını kontrol edin.",
    "diagnostics.error.toolTimeoutMessage":
      "URL kontrolü zaman aşımı sınırını geçti.",
    "diagnostics.error.toolCanceledMessage": "URL kontrolü iptal edildi.",
    "diagnostics.error.headersJSON": "Headers geçerli bir JSON nesnesi değil.",
    "diagnostics.error.headersObject": "Headers bir JSON nesnesi olmalı.",
    "diagnostics.error.headersText":
      "Header adları ve değerleri metin olmalı.",
    "diagnostics.error.headerLine":
      "{line}. header satırı “Ad: değer” biçiminde olmalı.",
    "diagnostics.error.knownLine":
      "{line}. known satırı “METHOD /path” biçiminde olmalı.",
    "diagnostics.error.observedLine":
      "{line}. observed satırı “METHOD /path [count]” biçiminde olmalı.",
    "diagnostics.error.observedCount":
      "{line}. observed count pozitif bir tam sayı olmalı.",

    "diagnostics.spring.category": "Kategori",
    "diagnostics.spring.category.problemDetail": "Problem ayrıntısı",
    "diagnostics.spring.category.validation": "Doğrulama",
    "diagnostics.spring.category.unauthorized": "Kimlik doğrulanmadı",
    "diagnostics.spring.category.forbidden": "Erişim yasak",
    "diagnostics.spring.category.notFound": "Bulunamadı",
    "diagnostics.spring.category.conflict": "Çakışma",
    "diagnostics.spring.category.serverError": "Sunucu hatası",
    "diagnostics.spring.category.httpError": "HTTP hatası",
    "diagnostics.spring.format": "Spring biçimi",
    "diagnostics.spring.traceRequestID": "Trace / İstek kimliği",
    "diagnostics.spring.exception": "İstisna",
    "diagnostics.spring.instance": "Instance",
    "diagnostics.spring.beanValidation": "Bean Validation",
    "diagnostics.spring.recognized": "Tanındı",
    "diagnostics.spring.genericResponse": "Genel HTTP yanıtı",
    "diagnostics.spring.notFound": "Bulunamadı",
    "diagnostics.spring.exceptionMissing": "Yanıtta yok",
    "diagnostics.spring.fieldCount": "{count} alan hatası ayrıştırıldı",
    "diagnostics.spring.field": "Alan",
    "diagnostics.spring.message": "Mesaj",
    "diagnostics.spring.rejectedValue": "Reddedilen değer",
    "diagnostics.spring.checklist": "Kontrol listesi",
    "diagnostics.spring.defaultTitle.problemDetail": "Problem Detail",
    "diagnostics.spring.defaultTitle.validation": "Bean Validation hatası",
    "diagnostics.spring.defaultTitle.unauthorized":
      "Kimlik doğrulama gerekli",
    "diagnostics.spring.defaultTitle.forbidden":
      "Bu işlem için yetki yok",
    "diagnostics.spring.defaultTitle.notFound":
      "Kaynak veya endpoint bulunamadı",
    "diagnostics.spring.defaultTitle.conflict": "Kaynak çakışması",
    "diagnostics.spring.defaultTitle.serverError": "Sunucu hatası",
    "diagnostics.spring.defaultTitle.httpError": "HTTP hatası",
    "diagnostics.spring.noDetails": "Yanıt ayrıntı içermiyor.",
    "diagnostics.spring.advice.problemDetail.1":
      "type ve instance alanlarını aynı hata ailesindeki yanıtlarla karşılaştırın.",
    "diagnostics.spring.advice.problemDetail.2":
      "Trace ID varsa log aramasına geçerek aynı isteğin sunucu kaydını bulun.",
    "diagnostics.spring.advice.validation.1":
      "Field error listesindeki alan adlarını request body ile karşılaştırın.",
    "diagnostics.spring.advice.validation.2":
      "DTO üzerindeki Bean Validation constraint ve nullability kurallarını kontrol edin.",
    "diagnostics.spring.advice.unauthorized.1":
      "Authorization header’ın gönderildiğini ve token’ın süresinin dolmadığını kontrol edin.",
    "diagnostics.spring.advice.unauthorized.2":
      "Issuer ve audience değerlerini JWT ekranında inceleyin.",
    "diagnostics.spring.advice.forbidden.1":
      "Token içindeki role ve scope değerlerini endpoint yetki kuralıyla karşılaştırın.",
    "diagnostics.spring.advice.forbidden.2":
      "Kimlik doğrulama başarılı olsa bile kaynağa erişim izni eksik olabilir.",
    "diagnostics.spring.advice.notFound.1":
      "Base URL, context path ve endpoint methodunu doğrulayın.",
    "diagnostics.spring.advice.notFound.2":
      "Actuator mappings açıksa endpoint’in çalışan serviste kayıtlı olduğunu kontrol edin.",
    "diagnostics.spring.advice.conflict.1":
      "Aynı unique alanı veya mevcut kaynak sürümünü kullanan başka kayıt olup olmadığını kontrol edin.",
    "diagnostics.spring.advice.conflict.2":
      "Response detail içindeki domain kuralını request verisiyle karşılaştırın.",
    "diagnostics.spring.advice.serverError.1":
      "Trace ID ile log kaydını bulun; exception ve ilk root-cause satırına odaklanın.",
    "diagnostics.spring.advice.serverError.2":
      "Runtime ekranından thread, heap, GC ve connection pool değerlerini kontrol edin.",
    "diagnostics.spring.advice.httpError.1":
      "Status, response detail ve gönderilen request içeriğini birlikte değerlendirin.",
    "diagnostics.spring.advice.httpError.2":
      "Aynı isteği bilinen çalışan ortamla karşılaştırın.",
    "diagnostics.spring.advice.status400":
      "Request JSON syntax, Content-Type, alan tipleri ve zorunlu alanları kontrol edin.",
    "diagnostics.spring.advice.status401":
      "Token’ın expiration, issuer ve audience claim’lerini JWT ekranında doğrulayın.",
    "diagnostics.spring.advice.status403":
      "Endpoint’in beklediği role/scope ile token claim’lerini karşılaştırın.",
    "diagnostics.spring.advice.status500":
      "Trace ID ile aynı isteğin loglarını arayın ve Runtime snapshot’ını inceleyin.",
    "diagnostics.spring.activeTab":
      "Aktif sekme: {name} · HTTP {status}",
    "diagnostics.spring.responseTitle": "Spring hata yanıtı",
    "diagnostics.spring.inputHint":
      "Yanıtı yapıştırın veya etkin istekten alın",
    "diagnostics.spring.loadActive": "Etkin yanıtı al",
    "diagnostics.spring.bodyLabel": "Spring hata yanıtı gövdesi",
    "diagnostics.spring.headersLabel": "Yanıt üstbilgileri",
    "diagnostics.spring.httpStatus": "HTTP durumu",
    "diagnostics.spring.analyze": "Hatayı analiz et",
    "diagnostics.spring.emptyTitle": "Analiz bekleniyor",
    "diagnostics.spring.emptyDescription":
      "ProblemDetail, Bean Validation ve 4xx/5xx yanıtlarını okunabilir bir özete dönüştürün.",
    "diagnostics.spring.noActiveResponse":
      "Etkin istek sekmesinde analiz edilecek bir yanıt yok.",
    "diagnostics.spring.activeRequest": "Etkin istek",
    "diagnostics.spring.responseLoaded": "{name} yanıtı yüklendi.",
    "diagnostics.spring.bodyRequired":
      "Analiz için yanıt gövdesi girin.",
    "diagnostics.spring.success":
      "Spring hata yanıtı yerel olarak analiz edildi.",

    "diagnostics.jwt.localWarning":
      "Token yalnızca yerel olarak çözüldü. İmza ve token güvenilirliği doğrulanmadı.",
    "diagnostics.jwt.active": "Token zaman aralığında aktif",
    "diagnostics.jwt.inactive": "Token aktif değil",
    "diagnostics.jwt.expired": "Token süresi dolmuş.",
    "diagnostics.jwt.signaturePresent":
      "Signature bölümü mevcut fakat cryptographic doğrulama yapılmadı.",
    "diagnostics.jwt.signatureMissing": "Token signature bölümü boş.",
    "diagnostics.jwt.algorithm": "Algoritma",
    "diagnostics.jwt.subject": "Konu (sub)",
    "diagnostics.jwt.issuer": "Yayınlayan (iss)",
    "diagnostics.jwt.audience": "Hedef kitle (aud)",
    "diagnostics.jwt.roles": "Roller",
    "diagnostics.jwt.scopes": "Scope’lar",
    "diagnostics.jwt.tokenLabel": "JWT token",
    "diagnostics.jwt.issuedAt": "Düzenlenme zamanı (iat)",
    "diagnostics.jwt.expires": "Bitiş zamanı (exp)",
    "diagnostics.jwt.notBefore": "Geçerlilik başlangıcı (nbf)",
    "diagnostics.jwt.noRoles": "Role claim bulunamadı.",
    "diagnostics.jwt.noScopes": "Scope claim bulunamadı.",
    "diagnostics.jwt.details": "Header ve payload",
    "diagnostics.jwt.inputHint":
      "Bearer prefix’i kullanılabilir; token cihazdan çıkmaz",
    "diagnostics.jwt.inputTitle": "JWT girdisi",
    "diagnostics.jwt.decode": "Claim’leri çöz",
    "diagnostics.jwt.emptyTitle": "Token bekleniyor",
    "diagnostics.jwt.emptyDescription":
      "Expiration, issuer, audience, role ve scope claim’lerini inceleyin.",
    "diagnostics.jwt.success":
      "JWT claim’leri yerel olarak çözüldü; signature doğrulanmadı.",
    "diagnostics.jwt.threeParts": "JWT üç bölümden oluşmalıdır.",
    "diagnostics.jwt.invalidBase64":
      "JWT bölümü base64url olarak çözülemedi.",
    "diagnostics.jwt.invalidJSON":
      "JWT header ve payload bölümleri geçerli JSON içermeli.",

    "diagnostics.runtime.unknown": "Bilinmiyor",
    "diagnostics.runtime.healthEyebrow": "SAĞLIK",
    "diagnostics.runtime.metricsEyebrow": "METRİKLER",
    "diagnostics.runtime.baselineEyebrow": "BASELINE",
    "diagnostics.runtime.mappingsEyebrow": "MAPPINGS",
    "diagnostics.runtime.applicationContext": "uygulama context’i",
    "diagnostics.runtime.components": "{count} bileşen",
    "diagnostics.runtime.noSnapshotTime": "Anlık görüntü zamanı yok",
    "diagnostics.runtime.deltaCount": "{count} delta",
    "diagnostics.runtime.none": "Yok",
    "diagnostics.runtime.comparison": "Önce / sonra karşılaştırması",
    "diagnostics.runtime.baselineHint": "Baseline alabilirsiniz",
    "diagnostics.runtime.disabled": "Kapalı",
    "diagnostics.runtime.notRequested": "İstenmedi",
    "diagnostics.runtime.healthComponents": "Sağlık bileşenleri",
    "diagnostics.runtime.healthDescription":
      "Actuator health ağacının üst seviyesi",
    "diagnostics.runtime.component": "Bileşen",
    "diagnostics.runtime.status": "Durum",
    "diagnostics.runtime.metric": "Metrik",
    "diagnostics.runtime.delta": "Fark",
    "diagnostics.runtime.metricSnapshot": "Metrik anlık görüntüsü",
    "diagnostics.runtime.metricDescription":
      "Seçili JVM ve dependency metrikleri",
    "diagnostics.runtime.statistic": "İstatistik",
    "diagnostics.runtime.value": "Değer",
    "diagnostics.runtime.unit": "Birim",
    "diagnostics.runtime.noMeasurement": "Ölçüm yok",
    "diagnostics.runtime.baselineDifference": "Baseline farkı",
    "diagnostics.runtime.baselineDifferenceDescription":
      "İlk snapshot ile son snapshot arasındaki değişim",
    "diagnostics.runtime.before": "Önce",
    "diagnostics.runtime.after": "Sonra",
    "diagnostics.runtime.metricFailures":
      "Bazı metric endpoint’leri açık değil: {names}",
    "diagnostics.runtime.baseURL": "Actuator temel URL’si",
    "diagnostics.runtime.includeMappings": "Mappings’i de oku",
    "diagnostics.runtime.headers": "Üstbilgiler",
    "diagnostics.runtime.metricNames": "Metric isimleri",
    "diagnostics.runtime.captureBaseline": "Baseline al",
    "diagnostics.runtime.captureSnapshot": "Snapshot al",
    "diagnostics.runtime.captureDelta": "Yeni snapshot ve delta",
    "diagnostics.runtime.clearBaseline": "Baseline’ı temizle",
    "diagnostics.runtime.readOnlyHint":
      "Actuator çağrıları salt okunurdur. Header değerleri çalışma alanına kaydedilmez.",
    "diagnostics.runtime.emptyTitle": "Runtime snapshot yok",
    "diagnostics.runtime.emptyDescription":
      "Health, JVM, GC, Hikari ve messaging metriklerini çalışan servisten okuyun.",
    "diagnostics.runtime.baseURLRequired": "Actuator base URL girin.",
    "diagnostics.runtime.metricRequired":
      "En az bir Actuator metric adı girin.",
    "diagnostics.runtime.noBaselineSnapshot":
      "Actuator yanıtında baseline olarak saklanabilir metric snapshot bulunamadı.",
    "diagnostics.runtime.baselineSuccess":
      "Metric baseline alındı. Serviste işlemi çalıştırıp yeni snapshot alın.",
    "diagnostics.runtime.compareSuccess":
      "Runtime snapshot baseline ile karşılaştırıldı.",
    "diagnostics.runtime.snapshotSuccess": "Runtime snapshot alındı.",
    "diagnostics.runtime.baselineFailure":
      "Runtime metric baseline’ı alınamadı.",
    "diagnostics.runtime.snapshotFailure":
      "Runtime snapshot alınamadı.",
    "diagnostics.runtime.baselineCleared": "Runtime baseline temizlendi.",

    "diagnostics.performance.targetTitle": "URL’yi ölç",
    "diagnostics.performance.targetDescription":
      "Bağımsız isteklerle soğuk uçtan uca gecikmeyi ölçün.",
    "diagnostics.performance.url": "Test URL’si",
    "diagnostics.performance.urlHelp":
      "Validex HEAD gönderir; sunucu HEAD’i reddederse yalnızca sınırlı bir GET fallback kullanır.",
    "diagnostics.performance.methodLabel": "İstek yöntemi",
    "diagnostics.performance.methodValue": "HEAD / GET fallback",
    "diagnostics.performance.timeout": "Zaman aşımı",
    "diagnostics.performance.samples": "Tekrar",
    "diagnostics.performance.samplesUnit": "tekrar",
    "diagnostics.performance.run": "Testi başlat",
    "diagnostics.performance.stop": "Testi durdur",
    "diagnostics.performance.stopping": "Durduruluyor…",
    "diagnostics.performance.cancelRejectedTitle":
      "URL testi durdurulamadı",
    "diagnostics.performance.cancelRejectedMessage":
      "Backend, etkin örnek için durdurma komutunu kabul etmedi.",
    "diagnostics.performance.cancelRejectedHint":
      "Durdur’u yeniden deneyin; sınırlı örnek tamamlanana veya zaman aşımına ulaşana kadar etkin kalır.",
    "diagnostics.performance.cancelFailure":
      "URL performansı durdurma komutu tamamlanamadı.",
    "diagnostics.performance.safetyHint":
      "Ölçüm bu cihazdan çalışır. Yalnızca erişim yetkiniz olan sistemleri test edin.",
    "diagnostics.performance.resultTitle": "Soğuk istek gecikmesi",
    "diagnostics.performance.resultDescription":
      "Her ölçüm yeni bağlantı açar; DNS, bağlantı, yönlendirme ve yanıt süresi birlikte ölçülür.",
    "diagnostics.performance.metricsLabel": "Süre özeti",
    "diagnostics.performance.fastest": "En hızlı",
    "diagnostics.performance.average": "Ortalama",
    "diagnostics.performance.slowest": "En yavaş",
    "diagnostics.performance.completedSamples": "Tamamlanan tekrar",
    "diagnostics.performance.sample": "Örnek",
    "diagnostics.performance.status": "HTTP durumu",
    "diagnostics.performance.duration": "Süre",
    "diagnostics.performance.finalURL": "Son URL",
    "diagnostics.performance.sampleBreakdown": "Ölçüm detayları",
    "diagnostics.performance.durationScale":
      "Çubuklar en yavaş ölçüme göre ölçeklenir",
    "diagnostics.performance.emptyTitle": "Ölçüme hazır",
    "diagnostics.performance.emptyDescription":
      "İlk sınırlı ölçümden sonra sonuçlar burada görünecek.",
    "diagnostics.performance.success":
      "{count} URL performans ölçümü tamamlandı.",
    "diagnostics.performance.canceled": "URL performans testi durduruldu.",
    "diagnostics.performance.failure":
      "URL performans testi tamamlanamadı.",
    "diagnostics.performance.urlRequired": "Bir hedef URL girin.",
    "diagnostics.performance.urlInvalid":
      "Geçerli ve tam bir HTTP veya HTTPS URL’si girin.",
    "diagnostics.performance.urlProtocol":
      "Yalnızca HTTP ve HTTPS URL’leri test edilebilir.",
    "diagnostics.performance.urlCredentials":
      "URL içindeki kullanıcı adı veya parolayı kaldırın.",
    "diagnostics.performance.urlFragment":
      "Testi çalıştırmadan önce URL fragment’ını (#…) kaldırın.",
    "diagnostics.performance.sampleRange":
      "Tekrar sayısı {minimum} ile {maximum} arasında bir tam sayı olmalı.",
    "diagnostics.performance.timeoutRange":
      "Zaman aşımı 1 ile {maximum} ms arasında bir tam sayı olmalı.",
    "diagnostics.performance.budgetExceeded":
      "{samples} tekrar × {timeout} ms, {maximum} ms toplam güvenlik bütçesini aşıyor.",

    "diagnostics.environment.error": "Hata",
    "diagnostics.environment.shortLabel": "ORTAM {number}",
    "diagnostics.environment.summary":
      "Durum {status} · Gövde {body}",
    "diagnostics.environment.status": "Durum",
    "diagnostics.environment.path": "Yol",
    "diagnostics.environment.baselineColumn": "Baseline",
    "diagnostics.environment.environmentColumn": "Ortam",
    "diagnostics.environment.missingURL": "URL yok",
    "diagnostics.environment.bodyTruncated":
      "Gövde boyut sınırında kesildi",
    "diagnostics.environment.defaultBaseline": "Baseline",
    "diagnostics.environment.defaultCandidate": "Ortam",
    "diagnostics.environment.same": "aynı",
    "diagnostics.environment.different": "farklı",
    "diagnostics.environment.matched": "Eşleşti",
    "diagnostics.environment.hasDifference": "Fark var",
    "diagnostics.environment.bodyMode": "Gövde modu",
    "diagnostics.environment.headerDifference": "Üstbilgi farkı",
    "diagnostics.environment.noDifference": "Yok",
    "diagnostics.environment.firstDifferences": " · ilk 1000 fark",
    "diagnostics.environment.jsonDifference": "JSON farkı",
    "diagnostics.environment.resultsLimited": " · sonuç sınırlandırıldı",
    "diagnostics.environment.type": "Tür",
    "diagnostics.environment.change.added": "Eklendi",
    "diagnostics.environment.change.removed": "Kaldırıldı",
    "diagnostics.environment.change.changed": "Değişti",
    "diagnostics.environment.change.type": "Tür değişti",
    "diagnostics.environment.emptyTitle": "Karşılaştırma sonucu yok",
    "diagnostics.environment.emptyDescription":
      "En az iki ortam için karşılaştırmayı çalıştırın.",
    "diagnostics.environment.responseBody": "{name} yanıt gövdesi",
    "diagnostics.environment.emptyBody": "Gövde boş.",
    "diagnostics.environment.method": "Metot",
    "diagnostics.environment.relativePath": "Göreli yol",
    "diagnostics.environment.name": "Ad",
    "diagnostics.environment.baseURL": "Temel URL",
    "diagnostics.environment.defaultName.local": "Yerel",
    "diagnostics.environment.defaultName.test": "Test",
    "diagnostics.environment.defaultName.staging": "Ön üretim",
    "diagnostics.environment.legend": "Ortam {number}",
    "diagnostics.environment.ignorePaths": "Yok sayılan JSONPath’ler",
    "diagnostics.environment.requestBody": "İstek gövdesi",
    "diagnostics.environment.safeBodyHint":
      "Bu yöntem için genellikle boş bırakılır.",
    "diagnostics.environment.unsafeConsent":
      "{method} isteğini doldurulmuş tüm ortamlara göndermeye açıkça izin veriyorum.",
    "diagnostics.environment.compare": "Ortamları karşılaştır",
    "diagnostics.environment.baselineHint":
      "İlk ortam referans olarak kullanılır.",
    "diagnostics.environment.noResultTitle": "Ortam sonucu yok",
    "diagnostics.environment.noResultDescription":
      "Aynı isteğin durum, üstbilgi ve JSON farklarını yan yana inceleyin.",
    "diagnostics.environment.twoRequired":
      "Karşılaştırma için en az iki ortamın temel URL’sini girin.",
    "diagnostics.environment.unsafeWarning":
      "{method} birden fazla ortamda veri değiştirebilir. Önce açık izin kutusunu işaretleyin.",
    "diagnostics.environment.success": "{count} ortam karşılaştırıldı.",
    "diagnostics.environment.failure":
      "Ortam karşılaştırması tamamlanamadı.",

    "diagnostics.thread.deadlockWarning":
      "JVM dökümünde açık bir deadlock işareti bulundu. İlgili iş parçacığı ve kilit zincirlerini hemen inceleyin.",
    "diagnostics.thread.eyebrow": "İŞ PARÇACIKLARI",
    "diagnostics.thread.threadColumn": "İş parçacığı",
    "diagnostics.thread.stateColumn": "Durum",
    "diagnostics.thread.dumpTitle": "JVM iş parçacığı dökümü",
    "diagnostics.thread.limited": "Sonuç sınırlandırıldı",
    "diagnostics.thread.complete": "Tam analiz",
    "diagnostics.thread.count": "iş parçacığı",
    "diagnostics.thread.blockedTitle": "Engellenen / kilit bekleyen iş parçacıkları",
    "diagnostics.thread.findingCount": "{count} bulgu",
    "diagnostics.thread.clue": "İpucu",
    "diagnostics.thread.unnamed": "adsız",
    "diagnostics.thread.noLockDetails": "Kilit ayrıntısı yok",
    "diagnostics.thread.repeatedTitle": "Tekrar eden yığınlar",
    "diagnostics.thread.repeatedDescription":
      "Benzer işte yığılmış iş parçacığı grupları",
    "diagnostics.thread.group": "{count} iş parçacığı · {names}",
    "diagnostics.thread.noFrames": "Yığın çerçevesi yok",
    "diagnostics.thread.deadlockClues": "Deadlock / kilit ipuçları ({count})",
    "diagnostics.thread.toolsLabel": "İş parçacığı ve log araçları",
    "diagnostics.thread.dumpTab": "İş parçacığı dökümü",
    "diagnostics.thread.logTab": "Trace log araması",
    "diagnostics.thread.dumpHint": "jstack biçimindeki metin dökümünü yapıştırın",
    "diagnostics.thread.dumpLabel": "JVM iş parçacığı dökümü",
    "diagnostics.thread.analyze": "İş parçacıklarını analiz et",
    "diagnostics.thread.emptyTitle": "İş parçacığı analizi bekleniyor",
    "diagnostics.thread.emptyDescription":
      "Engellenen iş parçacıklarını, deadlock ipuçlarını ve tekrar eden yığınları bulun.",
    "diagnostics.thread.required":
      "Analiz için iş parçacığı dökümü yapıştırın.",
    "diagnostics.thread.success": "{count} iş parçacığı analiz edildi.",
    "diagnostics.thread.failure":
      "İş parçacığı dökümü analizi tamamlanamadı.",

    "diagnostics.log.title": "Uygulama logu",
    "diagnostics.log.description":
      "Arama yalnız yapıştırılan metinde ve cihazda çalışır",
    "diagnostics.log.traceLabel": "Trace / correlation ID",
    "diagnostics.log.inputLabel": "Aranacak log metni",
    "diagnostics.log.caseSensitive": "Büyük/küçük harf duyarlı",
    "diagnostics.log.useActiveTitle":
      "Aktif request response’undaki trace ID’yi kullan",
    "diagnostics.log.noActiveTitle":
      "Aktif response’ta trace ID yok",
    "diagnostics.log.activeResponseID": "Aktif response ID",
    "diagnostics.log.search": "Logda ara",
    "diagnostics.log.emptyTitle": "Log araması bekleniyor",
    "diagnostics.log.emptyDescription":
      "Response’taki trace veya correlation ID ile ilgili log satırlarını bulun.",
    "diagnostics.log.matchCount": "{count} eşleşme",
    "diagnostics.log.scannedCount": "{count} satır tarandı",
    "diagnostics.log.noMatchTitle": "Eşleşme bulunamadı",
    "diagnostics.log.noMatchDescription":
      "ID’nin tamamını ve büyük/küçük harf ayarını kontrol edin.",
    "diagnostics.log.required":
      "Log metnini ve aranacak trace/correlation ID’yi girin.",
    "diagnostics.log.success": "{count} log satırı bulundu.",
    "diagnostics.log.failure":
      "Trace/correlation ID araması tamamlanamadı.",

    "diagnostics.coverage.aria": "Endpoint coverage yüzde {percentage}",
    "diagnostics.coverage.called": "{covered} / {total} endpoint çağrıldı",
    "diagnostics.coverage.disclaimer":
      "Bu oran yalnız sağlanan observed call listesine dayanır; kod coverage veya test coverage değildir.",
    "diagnostics.coverage.endpoints": "Endpoint’ler",
    "diagnostics.coverage.method": "Yöntem",
    "diagnostics.coverage.path": "Yol",
    "diagnostics.coverage.matchDescription":
      "Bilinen rota → gözlemlenen çağrı eşleşmesi",
    "diagnostics.coverage.hit": "Hit",
    "diagnostics.coverage.observedPath": "Gözlemlenen yol",
    "diagnostics.coverage.notSeen": "Henüz görülmedi",
    "diagnostics.coverage.unknownCalls":
      "Known listesinde olmayan çağrılar",
    "diagnostics.coverage.routeCount": "{count} route",
    "diagnostics.coverage.knownDescription": "Her satır: METHOD /path",
    "diagnostics.coverage.knownTitle": "Bilinen endpoint’ler",
    "diagnostics.coverage.knownLabel": "Known endpoint listesi",
    "diagnostics.coverage.observedDescription":
      "Her satır: METHOD /path [count]",
    "diagnostics.coverage.observedTitle": "Gözlemlenen çağrılar",
    "diagnostics.coverage.observedLabel": "Observed call listesi",
    "diagnostics.coverage.fromSession": "Bu oturumdan hesapla",
    "diagnostics.coverage.calculate": "Coverage’i hesapla",
    "diagnostics.coverage.templateHint":
      "{id}, * ve ** route template’leri concrete çağrılarla eşleştirilir.",
    "diagnostics.coverage.emptyTitle": "Coverage sonucu yok",
    "diagnostics.coverage.emptyDescription":
      "OpenAPI’den bilinen endpoint’leri bu oturumdaki request’lerle eşleştirin veya listeleri elle girin.",
    "diagnostics.coverage.knownRequired":
      "En az bir known endpoint girin.",
    "diagnostics.coverage.success": "{covered}/{total} endpoint eşleşti.",
    "diagnostics.coverage.sessionSuccess":
      "{covered}/{total} endpoint bu oturumdaki request’lerle eşleşti.",
    "diagnostics.coverage.failure":
      "Endpoint coverage analizi tamamlanamadı.",
    "diagnostics.coverage.sessionFailure":
      "Kaydedilmiş endpoint coverage analizi tamamlanamadı.",

    "protocol.eyebrow": "SERVER-SENT EVENTS · SINIRLI",
    "protocol.title": "SSE Akışı",
    "protocol.description":
      "Bir SSE endpoint’ine bağlanın, her olayı inceleyin ve akış durduğunda kısmi sonuçları koruyun.",
    "protocol.waiting":
      "Akış kapanana, olay sınırına ulaşana veya timeout dolana kadar event bekleniyor.",
    "protocol.cancel": "İptal et",
    "protocol.canceling": "İptal ediliyor…",
    "protocol.cancelRejectedTitle": "SSE akışı durdurulamadı",
    "protocol.cancelRejectedMessage":
      "Backend bu operation ID için çalışan bir SSE akışı bulamadı.",
    "protocol.cancelRejectedHint":
      "Akış tamamlanmış olabilir. Sonucu bekleyin veya yeniden başlatın.",
    "protocol.error.bridgeTitle": "Validex backend bağlantısı kesildi",
    "protocol.error.bridgeMessage":
      "SSE akışı masaüstü backend’inde tamamlanamadı.",
    "protocol.error.bridgeHint":
      "SSE bağlantı ayarlarını kontrol edip akışı yeniden deneyin.",
    "protocol.error.connectionTitle": "SSE bağlantısı tamamlanamadı",
    "protocol.error.operationMessage": "SSE akışı tamamlanamadı.",
    "protocol.error.operationHint":
      "URL’yi, timeout değerini, TLS ve request header’larını kontrol edip yeniden deneyin.",
    "protocol.error.sseFailedTitle": "SSE akışı başarısız oldu",
    "protocol.error.sseFailedMessage":
      "SSE akışı tamamlanamadı.",
    "protocol.error.toolTimeoutTitle": "SSE akışı zaman aşımına uğradı",
    "protocol.error.toolTimeoutMessage":
      "Hedef, yapılandırılan timeout süresi içinde yanıt vermedi.",
    "protocol.error.toolCanceledTitle": "SSE akışı iptal edildi",
    "protocol.error.toolCanceledMessage":
      "Akış tamamlanmadan iptal edildi.",
    "protocol.error.invalidInputTitle": "SSE girdisi geçerli değil",
    "protocol.error.invalidInputMessage":
      "Bir veya daha fazla SSE bağlantı ayarı geçerli değil.",
    "protocol.error.unknown": "Bilinmeyen bir hata oluştu.",
    "protocol.validation.json": "{label} geçerli bir JSON nesnesi olmalı.",
    "protocol.validation.object":
      "{label} anahtar-değer içeren bir JSON nesnesi olmalı.",
    "protocol.validation.emptyKey":
      "{label} içinde boş anahtar kullanılamaz.",
    "protocol.validation.textValue":
      "{label} içindeki “{key}” değeri metin olmalı.",
    "protocol.validation.integer":
      "{label} 1 ile {maximum} arasında tam sayı olmalı.",
    "protocol.validation.required": "{label} adresi gerekli.",
    "protocol.validation.invalid": "{label} adresi geçerli değil.",
    "protocol.validation.protocol":
      "{label} adresi {protocols} ile başlamalı.",
    "protocol.validation.or": " veya ",
    "protocol.validation.hostname":
      "{label} adresinde sunucu adı eksik.",
    "protocol.label.header": "Üstbilgi",
    "protocol.label.timeout": "Zaman aşımı",
    "protocol.label.eventLimit": "Olay sınırı",
    "protocol.unit.seconds": "sn",
    "protocol.metric.duration": "Süre",
    "protocol.metric.event": "Olay",

    "protocol.sse.connection": "SSE bağlantısı",
    "protocol.sse.connectionDescription":
      "HTTP event-stream uç noktasına bağlanın",
    "protocol.sse.url": "Olay akışı URL’si",
    "protocol.sse.urlHelp":
      "text/event-stream döndüren eksiksiz bir HTTP veya HTTPS URL kullanın.",
    "protocol.sse.maxEvents": "En fazla olay",
    "protocol.sse.timeoutHelp":
      "Akış 1–600 saniye sonra kapatılır.",
    "protocol.sse.eventLimitHelp":
      "Bu sonuçta 1–10.000 olay saklayın.",
    "protocol.headers": "İstek üstbilgileri · JSON",
    "protocol.headersHint": "Her üstbilgi değeri metin olmalı.",
    "protocol.skipCertificate": "Sertifika doğrulamasını atla",
    "protocol.sse.certificateHint":
      "Yalnızca yerel, kendinden imzalı HTTPS geliştirme sunucularında kullanın.",
    "protocol.sse.listening": "Dinleniyor…",
    "protocol.sse.listen": "Akışı dinle",
    "protocol.sse.limitHint":
      "Olay sınırına ulaşıldığında bağlantı kapatılır.",
    "protocol.sse.resultLabel": "SSE sonucu",
    "protocol.sse.events": "Olaylar",
    "protocol.sse.resultDescription":
      "event, ID, retry ve data alanları ayrı gösterilir",
    "protocol.sse.completed":
      "Bağlantı HTTP {status} ile tamamlandı; {count} olay alındı.",
    "protocol.sse.partialResult":
      "Akış bir sorunla durdu; alınan {count} olay korundu.",
    "protocol.sse.eventTable": "Alınan sunucu kaynaklı olaylar",
    "protocol.sse.column.event": "Olay",
    "protocol.sse.column.id": "ID",
    "protocol.sse.column.retry": "Retry",
    "protocol.sse.column.data": "Veri",
    "protocol.responseHeaders": "Yanıt üstbilgileri",
    "protocol.sse.emptyStreamTitle": "Akış olay göndermedi",
    "protocol.sse.emptyStreamDescription":
      "Bağlantı kuruldu ancak akış kapanmadan önce olay alınmadı.",
    "protocol.noConnectionTitle": "Henüz bağlantı yok",
    "protocol.sse.noConnectionDescription":
      "URL ve sınırları belirleyip “Akışı dinle” seçeneğini kullanın.",
    "protocol.sse.loading": "SSE akışı bekleniyor",
  },
);
