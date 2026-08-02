import { defineMessages } from "./defineMessages.js";

export const backendRequestErrorMessageKeys = new Set<string>([
  "backend.error.request.timeoutInvalid",
  "backend.error.request.urlVariablesMissing",
  "backend.error.request.urlInvalid",
  "backend.error.request.urlUserInfoUnsupported",
  "backend.error.request.urlFragmentUnsupported",
  "backend.error.request.alreadyRunning",
  "backend.error.request.bodyVariablesMissing",
  "backend.error.request.headerVariablesMissing",
  "backend.error.request.canceled",
  "backend.error.request.timeout",
  "backend.error.request.invalidDefinition",
  "backend.error.request.network",
  "backend.error.request.failed",
  "backend.error.request.responseBodyTooLarge",
  "backend.error.request.bodyTooLarge",
  "backend.error.request.responseHeadersTooLarge",
  "backend.error.request.headerInvalid",
  "backend.error.request.headerNameInvalid",
  "backend.error.request.headerValueInvalid",
  "backend.error.request.hostHeaderDuplicate",
  "backend.error.request.hostHeaderInvalid",
  "backend.error.request.contentLengthDuplicate",
  "backend.error.request.contentLengthInvalid",
  "backend.error.request.contentLengthMismatch",
  "backend.error.request.contentLengthUnsupported",
  "backend.error.request.framingConflict",
  "backend.error.request.transferEncodingDuplicate",
  "backend.error.request.transferEncodingInvalid",
  "backend.error.request.transferEncodingBodyUnsupported",
  "backend.error.request.trailerUnsupported",
  "backend.error.request.unsupportedContentEncoding",
  "backend.error.request.tooManyContentEncodings",
  "backend.error.request.responseDecodeFailed",
  "backend.error.openapi.runtimeUnavailable",
  "backend.error.openapi.fileDialogFailed",
  "backend.error.openapi.invalidDocument",
  "backend.error.openapi.sessionCanceled",
  "backend.error.openapi.specUnavailable",
  "backend.error.openapi.bodyEncodingInvalid",
  "backend.error.openapi.responseSchemaUnavailable",
  "backend.error.openapi.responseSchemaUnavailableWithoutContentType",
  "backend.error.openapi.operationUnavailable",
]);

export const backendRequestErrorHintKeys = new Set<string>([
  "backend.error.request.timeoutInvalid",
  "backend.error.request.urlVariablesMissing",
  "backend.error.request.urlInvalid",
  "backend.error.request.urlUserInfoUnsupported",
  "backend.error.request.urlFragmentUnsupported",
  "backend.error.request.alreadyRunning",
  "backend.error.request.bodyVariablesMissing",
  "backend.error.request.headerVariablesMissing",
  "backend.error.request.canceled",
  "backend.error.request.timeout",
  "backend.error.request.invalidDefinition",
  "backend.error.request.network",
  "backend.error.request.failed",
  "backend.error.request.responseBodyTooLarge",
  "backend.error.request.bodyTooLarge",
  "backend.error.request.responseHeadersTooLarge",
  "backend.error.request.headerInvalid",
  "backend.error.request.headerNameInvalid",
  "backend.error.request.headerValueInvalid",
  "backend.error.request.hostHeaderDuplicate",
  "backend.error.request.hostHeaderInvalid",
  "backend.error.request.contentLengthDuplicate",
  "backend.error.request.contentLengthInvalid",
  "backend.error.request.contentLengthMismatch",
  "backend.error.request.contentLengthUnsupported",
  "backend.error.request.framingConflict",
  "backend.error.request.transferEncodingDuplicate",
  "backend.error.request.transferEncodingInvalid",
  "backend.error.request.transferEncodingBodyUnsupported",
  "backend.error.request.trailerUnsupported",
  "backend.error.request.unsupportedContentEncoding",
  "backend.error.request.tooManyContentEncodings",
  "backend.error.request.responseDecodeFailed",
  "backend.error.openapi.invalidDocument",
  "backend.error.openapi.sessionCanceled",
  "backend.error.openapi.specUnavailable",
  "backend.error.openapi.bodyEncodingInvalid",
  "backend.error.openapi.responseSchemaUnavailable",
  "backend.error.openapi.responseSchemaUnavailableWithoutContentType",
]);

export const backendRequestErrorMessages = defineMessages(
  {
    "backend.error.request.timeoutInvalid.title": "Invalid timeout",
    "backend.error.request.timeoutInvalid.message":
      "The request was not sent because the timeout is outside the supported range.",
    "backend.error.request.timeoutInvalid.hint":
      "Enter a timeout between {minTimeoutMs} and {maxTimeoutMs} ms.",
    "backend.error.request.urlVariablesMissing.title": "Missing variables",
    "backend.error.request.urlVariablesMissing.message":
      "The request was not sent because some variables in the URL have no value.",
    "backend.error.request.urlVariablesMissing.hint":
      "Define these values in the environment or context panel: {variables}",
    "backend.error.request.urlInvalid.title": "Invalid URL",
    "backend.error.request.urlInvalid.message":
      "The request was not sent because the URL is not a complete HTTP address.",
    "backend.error.request.urlInvalid.hint":
      "Enter the full URL, starting with http:// or https://.",
    "backend.error.request.urlUserInfoUnsupported.title":
      "User information in URLs is not supported",
    "backend.error.request.urlUserInfoUnsupported.message":
      "A username or password in the URL could be converted into a hidden Authorization header.",
    "backend.error.request.urlUserInfoUnsupported.hint":
      "Remove the credentials from the URL; if needed, explicitly add and enable an Authorization header.",
    "backend.error.request.urlFragmentUnsupported.title":
      "URL contains a fragment",
    "backend.error.request.urlFragmentUnsupported.message":
      "The part of the URL after # is not sent in the HTTP request.",
    "backend.error.request.urlFragmentUnsupported.hint":
      "Remove the fragment from the URL.",
    "backend.error.request.alreadyRunning.title":
      "Request is already running",
    "backend.error.request.alreadyRunning.message":
      "Another request with the same request ID is still running.",
    "backend.error.request.alreadyRunning.hint":
      "Cancel the running request or wait for it to finish.",
    "backend.error.request.bodyVariablesMissing.title":
      "Variables are missing from the body",
    "backend.error.request.bodyVariablesMissing.message":
      "The request body could not be resolved.",
    "backend.error.request.bodyVariablesMissing.hint":
      "Define these variables: {variables}",
    "backend.error.request.headerVariablesMissing.title":
      "Variables are missing from a header",
    "backend.error.request.headerVariablesMissing.message":
      "The value of the {headerName} header could not be resolved.",
    "backend.error.request.headerVariablesMissing.hint":
      "Define these variables: {variables}",
    "backend.error.request.canceled.title": "Request canceled",
    "backend.error.request.canceled.message":
      "The request was stopped by the user.",
    "backend.error.request.canceled.hint":
      "The URL and form values are preserved in the tab.",
    "backend.error.request.timeout.title": "Request timed out",
    "backend.error.request.timeout.message":
      "No response was received within {timeoutMs} ms.",
    "backend.error.request.timeout.hint":
      "Increase the timeout or check whether the target service is reachable.",
    "backend.error.request.invalidDefinition.title":
      "Request could not be created",
    "backend.error.request.invalidDefinition.message":
      "The method, URL, or header definition appears to be invalid.",
    "backend.error.request.invalidDefinition.hint":
      "Check the URL, selected method, and enabled headers.",
    "backend.error.request.network.title": "Server could not be reached",
    "backend.error.request.network.message":
      "The network connection could not be established.",
    "backend.error.request.network.hint":
      "Check the base URL, VPN, proxy, and server status.",
    "backend.error.request.failed.title": "Request could not be completed",
    "backend.error.request.failed.message":
      "An unexpected connection error occurred.",
    "backend.error.request.failed.hint":
      "Copy the technical details and compare them with the service logs.",
    "backend.error.request.responseBodyTooLarge.title":
      "Response exceeded the limit",
    "backend.error.request.responseBodyTooLarge.message":
      "The download was stopped because the declared or received response body exceeded the {maxMiB} MiB safety limit.",
    "backend.error.request.responseBodyTooLarge.hint":
      "Request a smaller data set, or add pagination or filtering to the endpoint.",
    "backend.error.request.bodyTooLarge.title":
      "Request body exceeded the limit",
    "backend.error.request.bodyTooLarge.message":
      "The request body was not sent because it exceeded the {maxMiB} MiB safety limit.",
    "backend.error.request.bodyTooLarge.hint":
      "Reduce the body size or use a dedicated client for large file transfers.",
    "backend.error.request.responseHeadersTooLarge.title":
      "Response headers exceeded the limit",
    "backend.error.request.responseHeadersTooLarge.message":
      "The request was stopped because the server's response headers exceeded the {maxMiB} MiB safety limit.",
    "backend.error.request.responseHeadersTooLarge.hint":
      "Reduce large server header values or remove unnecessary response headers.",
    "backend.error.request.headerInvalid.title":
      "{headerName} header is invalid",
    "backend.error.request.headerInvalid.message":
      "The header name or value is invalid.",
    "backend.error.request.headerInvalid.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.headerNameInvalid.title":
      "{headerName} header is invalid",
    "backend.error.request.headerNameInvalid.message":
      "The header name must be a valid HTTP token.",
    "backend.error.request.headerNameInvalid.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.headerValueInvalid.title":
      "{headerName} header is invalid",
    "backend.error.request.headerValueInvalid.message":
      "The header value contains unsafe newline characters.",
    "backend.error.request.headerValueInvalid.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.hostHeaderDuplicate.title":
      "{headerName} header is invalid",
    "backend.error.request.hostHeaderDuplicate.message":
      "A request cannot contain more than one Host header.",
    "backend.error.request.hostHeaderDuplicate.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.hostHeaderInvalid.title":
      "{headerName} header is invalid",
    "backend.error.request.hostHeaderInvalid.message":
      "The Host value is invalid or contains unsafe characters.",
    "backend.error.request.hostHeaderInvalid.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.contentLengthDuplicate.title":
      "{headerName} header is invalid",
    "backend.error.request.contentLengthDuplicate.message":
      "A request cannot contain more than one Content-Length header.",
    "backend.error.request.contentLengthDuplicate.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.contentLengthInvalid.title":
      "{headerName} header is invalid",
    "backend.error.request.contentLengthInvalid.message":
      "Content-Length must be a non-negative integer.",
    "backend.error.request.contentLengthInvalid.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.contentLengthMismatch.title":
      "{headerName} header is invalid",
    "backend.error.request.contentLengthMismatch.message":
      "Content-Length is {declaredLength}, but the resolved request body is {bodyLength} bytes.",
    "backend.error.request.contentLengthMismatch.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.contentLengthUnsupported.title":
      "{headerName} header is invalid",
    "backend.error.request.contentLengthUnsupported.message":
      "For this method, net/http cannot write an explicit Content-Length: 0 to the wire; remove the header.",
    "backend.error.request.contentLengthUnsupported.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.framingConflict.title":
      "{headerName} header is invalid",
    "backend.error.request.framingConflict.message":
      "Content-Length and Transfer-Encoding cannot be used together in the same request.",
    "backend.error.request.framingConflict.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.transferEncodingDuplicate.title":
      "{headerName} header is invalid",
    "backend.error.request.transferEncodingDuplicate.message":
      "A request cannot contain more than one Transfer-Encoding header.",
    "backend.error.request.transferEncodingDuplicate.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.transferEncodingInvalid.title":
      "{headerName} header is invalid",
    "backend.error.request.transferEncodingInvalid.message":
      "Only chunked Transfer-Encoding is supported.",
    "backend.error.request.transferEncodingInvalid.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.transferEncodingBodyUnsupported.title":
      "{headerName} header is invalid",
    "backend.error.request.transferEncodingBodyUnsupported.message":
      "HEAD and TRACE requests cannot carry a chunked body.",
    "backend.error.request.transferEncodingBodyUnsupported.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.trailerUnsupported.title":
      "{headerName} header is invalid",
    "backend.error.request.trailerUnsupported.message":
      "Trailer fields cannot be sent reliably as a flat header list.",
    "backend.error.request.trailerUnsupported.hint":
      "Correct the header value, or remove the header and use Validex's safe default.",
    "backend.error.request.unsupportedContentEncoding.title":
      "Response compression is not supported",
    "backend.error.request.unsupportedContentEncoding.message":
      'The server sent the response with Content-Encoding "{encoding}"; Validex can only decode gzip and deflate responses.',
    "backend.error.request.unsupportedContentEncoding.hint":
      "Remove this format from the Accept-Encoding header and request gzip or deflate.",
    "backend.error.request.tooManyContentEncodings.title":
      "Response compression is too complex",
    "backend.error.request.tooManyContentEncodings.message":
      "The server declared more than {maxLayers} Content-Encoding layers.",
    "backend.error.request.tooManyContentEncodings.hint":
      "Configure the server to use fewer compression layers.",
    "backend.error.request.responseDecodeFailed.title":
      "Response could not be decoded",
    "backend.error.request.responseDecodeFailed.message":
      'The server returned a response compressed with "{encoding}", but the body could not be decoded.',
    "backend.error.request.responseDecodeFailed.hint":
      "Check that the server's Content-Encoding header matches the body format it sent.",

    "backend.error.openapi.runtimeUnavailable.title":
      "File picker could not be opened",
    "backend.error.openapi.runtimeUnavailable.message":
      "The desktop runtime is not ready yet.",
    "backend.error.openapi.fileDialogFailed.title":
      "File could not be selected",
    "backend.error.openapi.fileDialogFailed.message":
      "The system file picker could not complete.",
    "backend.error.openapi.invalidDocument.title":
      "OpenAPI document could not be imported",
    "backend.error.openapi.invalidDocument.message":
      "The file is not a valid OpenAPI document.",
    "backend.error.openapi.invalidDocument.hint":
      "Check the YAML/JSON syntax and schema references.",
    "backend.error.openapi.sessionCanceled.title":
      "OpenAPI import was canceled",
    "backend.error.openapi.sessionCanceled.message":
      "An operation started in a previous application session is no longer valid.",
    "backend.error.openapi.sessionCanceled.hint":
      "Select the file again in the current session.",
    "backend.error.openapi.specUnavailable.title":
      "OpenAPI contract was not found",
    "backend.error.openapi.specUnavailable.message":
      "This request's OpenAPI document is no longer in memory.",
    "backend.error.openapi.specUnavailable.hint":
      "Import the OpenAPI file again.",
    "backend.error.openapi.bodyEncodingInvalid.title":
      "Response body could not be decoded",
    "backend.error.openapi.bodyEncodingInvalid.message":
      "The response body encoding supplied for contract validation is invalid.",
    "backend.error.openapi.bodyEncodingInvalid.hint":
      "Send the request again, then rerun contract validation.",
    "backend.error.openapi.responseSchemaUnavailable.title":
      "No JSON schema is available for comparison",
    "backend.error.openapi.responseSchemaUnavailable.message":
      'No JSON media schema matching "{contentType}" was found for the {statusCode} response.',
    "backend.error.openapi.responseSchemaUnavailable.hint":
      "In the OpenAPI document, add a JSON schema matching the actual response media type under this status or the default response.",
    "backend.error.openapi.responseSchemaUnavailableWithoutContentType.title":
      "No JSON schema is available for comparison",
    "backend.error.openapi.responseSchemaUnavailableWithoutContentType.message":
      "No Content-Type was provided, and no matching JSON media schema was found for the {statusCode} response.",
    "backend.error.openapi.responseSchemaUnavailableWithoutContentType.hint":
      "In the OpenAPI document, add a JSON schema matching the actual response media type under this status or the default response.",
    "backend.error.openapi.operationUnavailable.title":
      "OpenAPI operation was not found",
    "backend.error.openapi.operationUnavailable.message":
      "{method} {path} was not found in this document.",
  },
  {
    "backend.error.request.timeoutInvalid.title": "Timeout geçerli değil",
    "backend.error.request.timeoutInvalid.message":
      "Request gönderilmedi çünkü timeout desteklenen aralığın dışında.",
    "backend.error.request.timeoutInvalid.hint":
      "Timeout değerini {minTimeoutMs} ile {maxTimeoutMs} ms arasında girin.",
    "backend.error.request.urlVariablesMissing.title": "Eksik değişken var",
    "backend.error.request.urlVariablesMissing.message":
      "Request gönderilmedi çünkü URL içindeki bazı değişkenlerin değeri yok.",
    "backend.error.request.urlVariablesMissing.hint":
      "Environment veya context panelinden şu değerleri tanımlayın: {variables}",
    "backend.error.request.urlInvalid.title": "URL geçerli değil",
    "backend.error.request.urlInvalid.message":
      "Request gönderilmedi çünkü URL eksiksiz bir HTTP adresi değil.",
    "backend.error.request.urlInvalid.hint":
      "URL’yi http:// veya https:// ile başlayacak şekilde açıkça yazın.",
    "backend.error.request.urlUserInfoUnsupported.title":
      "URL içinde kullanıcı bilgisi desteklenmiyor",
    "backend.error.request.urlUserInfoUnsupported.message":
      "URL’deki kullanıcı adı veya parola gizli bir Authorization header’ına dönüşebilir.",
    "backend.error.request.urlUserInfoUnsupported.hint":
      "Kimlik bilgisini URL’den kaldırın; gerekiyorsa Authorization header’ını açıkça ekleyip etkinleştirin.",
    "backend.error.request.urlFragmentUnsupported.title":
      "URL fragment içeriyor",
    "backend.error.request.urlFragmentUnsupported.message":
      "URL’nin # işaretinden sonraki bölümü HTTP request’ine gönderilmez.",
    "backend.error.request.urlFragmentUnsupported.hint":
      "Fragment bölümünü URL’den kaldırın.",
    "backend.error.request.alreadyRunning.title": "Request zaten çalışıyor",
    "backend.error.request.alreadyRunning.message":
      "Aynı request ID ile başka bir istek halen devam ediyor.",
    "backend.error.request.alreadyRunning.hint":
      "Çalışan isteği iptal edin veya tamamlanmasını bekleyin.",
    "backend.error.request.bodyVariablesMissing.title":
      "Body içinde eksik değişken var",
    "backend.error.request.bodyVariablesMissing.message":
      "Request body çözümlenemedi.",
    "backend.error.request.bodyVariablesMissing.hint":
      "Şu değişkenleri tanımlayın: {variables}",
    "backend.error.request.headerVariablesMissing.title":
      "Header içinde eksik değişken var",
    "backend.error.request.headerVariablesMissing.message":
      "{headerName} header değeri çözümlenemedi.",
    "backend.error.request.headerVariablesMissing.hint":
      "Şu değişkenleri tanımlayın: {variables}",
    "backend.error.request.canceled.title": "Request iptal edildi",
    "backend.error.request.canceled.message":
      "İstek kullanıcı tarafından durduruldu.",
    "backend.error.request.canceled.hint":
      "URL ve form değerleri sekmede korunuyor.",
    "backend.error.request.timeout.title": "Request zaman aşımına uğradı",
    "backend.error.request.timeout.message":
      "{timeoutMs} ms içinde yanıt alınamadı.",
    "backend.error.request.timeout.hint":
      "Timeout değerini artırın veya hedef servisin erişilebilirliğini kontrol edin.",
    "backend.error.request.invalidDefinition.title":
      "Request oluşturulamadı",
    "backend.error.request.invalidDefinition.message":
      "Method, URL veya header tanımı geçerli görünmüyor.",
    "backend.error.request.invalidDefinition.hint":
      "URL’yi, method seçimini ve etkin header’ları kontrol edin.",
    "backend.error.request.network.title": "Sunucuya ulaşılamadı",
    "backend.error.request.network.message": "Ağ bağlantısı kurulamadı.",
    "backend.error.request.network.hint":
      "Base URL, VPN, proxy ve sunucu durumunu kontrol edin.",
    "backend.error.request.failed.title": "Request tamamlanamadı",
    "backend.error.request.failed.message":
      "Beklenmeyen bir bağlantı hatası oluştu.",
    "backend.error.request.failed.hint":
      "Teknik ayrıntıyı kopyalayıp servis loglarıyla karşılaştırın.",
    "backend.error.request.responseBodyTooLarge.title":
      "Response sınırı aştı",
    "backend.error.request.responseBodyTooLarge.message":
      "Sunucunun bildirdiği veya alınan response body {maxMiB} MiB güvenlik sınırını aştığı için indirme durduruldu.",
    "backend.error.request.responseBodyTooLarge.hint":
      "Daha küçük bir veri kümesi isteyin veya endpoint’e sayfalama/filtre ekleyin.",
    "backend.error.request.bodyTooLarge.title":
      "Request body sınırı aştı",
    "backend.error.request.bodyTooLarge.message":
      "Request body {maxMiB} MiB güvenlik sınırını aştığı için gönderilmedi.",
    "backend.error.request.bodyTooLarge.hint":
      "Body boyutunu küçültün veya büyük dosya aktarımı için özel bir istemci kullanın.",
    "backend.error.request.responseHeadersTooLarge.title":
      "Response header’ları sınırı aştı",
    "backend.error.request.responseHeadersTooLarge.message":
      "Sunucunun response header’ları {maxMiB} MiB güvenlik sınırını aştığı için request durduruldu.",
    "backend.error.request.responseHeadersTooLarge.hint":
      "Sunucunun büyük header değerlerini küçültün veya gereksiz response header’larını kaldırın.",
    "backend.error.request.headerInvalid.title":
      "{headerName} header geçerli değil",
    "backend.error.request.headerInvalid.message":
      "Header adı veya değeri geçerli değil.",
    "backend.error.request.headerInvalid.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.headerNameInvalid.title":
      "{headerName} header geçerli değil",
    "backend.error.request.headerNameInvalid.message":
      "Header adı geçerli bir HTTP token değeri olmalıdır.",
    "backend.error.request.headerNameInvalid.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.headerValueInvalid.title":
      "{headerName} header geçerli değil",
    "backend.error.request.headerValueInvalid.message":
      "Header değeri güvenli olmayan satır sonu karakterleri içeriyor.",
    "backend.error.request.headerValueInvalid.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.hostHeaderDuplicate.title":
      "{headerName} header geçerli değil",
    "backend.error.request.hostHeaderDuplicate.message":
      "Bir request birden fazla Host header içeremez.",
    "backend.error.request.hostHeaderDuplicate.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.hostHeaderInvalid.title":
      "{headerName} header geçerli değil",
    "backend.error.request.hostHeaderInvalid.message":
      "Host değeri geçersiz veya güvenli olmayan karakterler içeriyor.",
    "backend.error.request.hostHeaderInvalid.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.contentLengthDuplicate.title":
      "{headerName} header geçerli değil",
    "backend.error.request.contentLengthDuplicate.message":
      "Bir request birden fazla Content-Length header içeremez.",
    "backend.error.request.contentLengthDuplicate.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.contentLengthInvalid.title":
      "{headerName} header geçerli değil",
    "backend.error.request.contentLengthInvalid.message":
      "Content-Length negatif olmayan bir tam sayı olmalıdır.",
    "backend.error.request.contentLengthInvalid.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.contentLengthMismatch.title":
      "{headerName} header geçerli değil",
    "backend.error.request.contentLengthMismatch.message":
      "Content-Length {declaredLength} ancak çözümlenmiş request body {bodyLength} byte.",
    "backend.error.request.contentLengthMismatch.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.contentLengthUnsupported.title":
      "{headerName} header geçerli değil",
    "backend.error.request.contentLengthUnsupported.message":
      "Bu method için açık Content-Length: 0 net/http tarafından wire’a yazılamaz; header’ı kaldırın.",
    "backend.error.request.contentLengthUnsupported.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.framingConflict.title":
      "{headerName} header geçerli değil",
    "backend.error.request.framingConflict.message":
      "Content-Length ve Transfer-Encoding aynı request’te birlikte kullanılamaz.",
    "backend.error.request.framingConflict.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.transferEncodingDuplicate.title":
      "{headerName} header geçerli değil",
    "backend.error.request.transferEncodingDuplicate.message":
      "Bir request birden fazla Transfer-Encoding header içeremez.",
    "backend.error.request.transferEncodingDuplicate.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.transferEncodingInvalid.title":
      "{headerName} header geçerli değil",
    "backend.error.request.transferEncodingInvalid.message":
      "Yalnız chunked Transfer-Encoding destekleniyor.",
    "backend.error.request.transferEncodingInvalid.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.transferEncodingBodyUnsupported.title":
      "{headerName} header geçerli değil",
    "backend.error.request.transferEncodingBodyUnsupported.message":
      "HEAD ve TRACE requestleri chunked body taşıyamaz.",
    "backend.error.request.transferEncodingBodyUnsupported.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.trailerUnsupported.title":
      "{headerName} header geçerli değil",
    "backend.error.request.trailerUnsupported.message":
      "Trailer alanları düz bir header listesi olarak güvenilir biçimde gönderilemez.",
    "backend.error.request.trailerUnsupported.hint":
      "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
    "backend.error.request.unsupportedContentEncoding.title":
      "Response sıkıştırması desteklenmiyor",
    "backend.error.request.unsupportedContentEncoding.message":
      'Sunucu yanıtı "{encoding}" Content-Encoding ile gönderdi; Validex yalnız gzip ve deflate yanıtlarını açabilir.',
    "backend.error.request.unsupportedContentEncoding.hint":
      "Accept-Encoding header’ından bu formatı kaldırın ve gzip veya deflate isteyin.",
    "backend.error.request.tooManyContentEncodings.title":
      "Response sıkıştırması çok karmaşık",
    "backend.error.request.tooManyContentEncodings.message":
      "Sunucu {maxLayers} katmandan fazla Content-Encoding bildirdi.",
    "backend.error.request.tooManyContentEncodings.hint":
      "Sunucuyu daha az sıkıştırma katmanı kullanacak şekilde yapılandırın.",
    "backend.error.request.responseDecodeFailed.title":
      "Response açılamadı",
    "backend.error.request.responseDecodeFailed.message":
      'Sunucu "{encoding}" ile sıkıştırılmış bir yanıt verdi ancak body çözülemedi.',
    "backend.error.request.responseDecodeFailed.hint":
      "Sunucunun Content-Encoding header’ı ile gönderdiği body formatının eşleştiğini kontrol edin.",

    "backend.error.openapi.runtimeUnavailable.title":
      "Dosya seçici açılamadı",
    "backend.error.openapi.runtimeUnavailable.message":
      "Desktop runtime henüz hazır değil.",
    "backend.error.openapi.fileDialogFailed.title": "Dosya seçilemedi",
    "backend.error.openapi.fileDialogFailed.message":
      "Sistem dosya seçicisi tamamlanamadı.",
    "backend.error.openapi.invalidDocument.title":
      "OpenAPI içe aktarılamadı",
    "backend.error.openapi.invalidDocument.message":
      "Dosya geçerli bir OpenAPI dokümanı değil.",
    "backend.error.openapi.invalidDocument.hint":
      "YAML/JSON sözdizimini ve schema referanslarını kontrol edin.",
    "backend.error.openapi.sessionCanceled.title":
      "OpenAPI içe aktarma iptal edildi",
    "backend.error.openapi.sessionCanceled.message":
      "Önceki uygulama oturumunda başlayan işlem artık geçerli değil.",
    "backend.error.openapi.sessionCanceled.hint":
      "Dosyayı açık oturumda yeniden seçin.",
    "backend.error.openapi.specUnavailable.title":
      "OpenAPI contract bulunamadı",
    "backend.error.openapi.specUnavailable.message":
      "Bu request’in OpenAPI dokümanı artık bellekte değil.",
    "backend.error.openapi.specUnavailable.hint":
      "OpenAPI dosyasını yeniden içe aktarın.",
    "backend.error.openapi.bodyEncodingInvalid.title":
      "Response body çözülemedi",
    "backend.error.openapi.bodyEncodingInvalid.message":
      "Contract kontrolüne verilen response body encoding değeri geçerli değil.",
    "backend.error.openapi.bodyEncodingInvalid.hint":
      "Request’i yeniden gönderip contract kontrolünü tekrar çalıştırın.",
    "backend.error.openapi.responseSchemaUnavailable.title":
      "Karşılaştırılacak JSON schema yok",
    "backend.error.openapi.responseSchemaUnavailable.message":
      '{statusCode} response’u için "{contentType}" ile eşleşen JSON media schema bulunamadı.',
    "backend.error.openapi.responseSchemaUnavailable.hint":
      "OpenAPI dokümanında bu status veya default response altına gerçek response media type’ıyla eşleşen JSON schema ekleyin.",
    "backend.error.openapi.responseSchemaUnavailableWithoutContentType.title":
      "Karşılaştırılacak JSON schema yok",
    "backend.error.openapi.responseSchemaUnavailableWithoutContentType.message":
      '{statusCode} response’u için "Content-Type belirtilmedi" ile eşleşen JSON media schema bulunamadı.',
    "backend.error.openapi.responseSchemaUnavailableWithoutContentType.hint":
      "OpenAPI dokümanında bu status veya default response altına gerçek response media type’ıyla eşleşen JSON schema ekleyin.",
    "backend.error.openapi.operationUnavailable.title":
      "OpenAPI operation bulunamadı",
    "backend.error.openapi.operationUnavailable.message":
      "{method} {path} bu dokümanda bulunamadı.",
  },
);
