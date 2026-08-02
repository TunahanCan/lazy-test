package canbridge

var (
	userErrorRequestTimeoutInvalid = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.timeoutInvalid",
		Title:      "Timeout geçerli değil",
		Message:    "Request gönderilmedi çünkü timeout desteklenen aralığın dışında.",
		Hint:       "Timeout değerini {minTimeoutMs} ile {maxTimeoutMs} ms arasında girin.",
	}
	userErrorRequestURLVariablesMissing = userErrorDefinition{
		Code:       UserErrorMissingVariables,
		MessageKey: "backend.error.request.urlVariablesMissing",
		Title:      "Eksik değişken var",
		Message:    "Request gönderilmedi çünkü URL içindeki bazı değişkenlerin değeri yok.",
		Hint:       "Environment veya context panelinden şu değerleri tanımlayın: {variables}",
	}
	userErrorRequestURLInvalid = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.urlInvalid",
		Title:      "URL geçerli değil",
		Message:    "Request gönderilmedi çünkü URL eksiksiz bir HTTP adresi değil.",
		Hint:       "URL’yi http:// veya https:// ile başlayacak şekilde açıkça yazın.",
	}
	userErrorRequestURLUserInfoUnsupported = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.urlUserInfoUnsupported",
		Title:      "URL içinde kullanıcı bilgisi desteklenmiyor",
		Message:    "URL’deki kullanıcı adı veya parola gizli bir Authorization header’ına dönüşebilir.",
		Hint:       "Kimlik bilgisini URL’den kaldırın; gerekiyorsa Authorization header’ını açıkça ekleyip etkinleştirin.",
	}
	userErrorRequestURLFragmentUnsupported = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.urlFragmentUnsupported",
		Title:      "URL fragment içeriyor",
		Message:    "URL’nin # işaretinden sonraki bölümü HTTP request’ine gönderilmez.",
		Hint:       "Fragment bölümünü URL’den kaldırın.",
	}
	userErrorRequestAlreadyRunning = userErrorDefinition{
		Code:       UserErrorRequestAlreadyRunning,
		MessageKey: "backend.error.request.alreadyRunning",
		Title:      "Request zaten çalışıyor",
		Message:    "Aynı request ID ile başka bir istek halen devam ediyor.",
		Hint:       "Çalışan isteği iptal edin veya tamamlanmasını bekleyin.",
	}
	userErrorRequestBodyVariablesMissing = userErrorDefinition{
		Code:       UserErrorMissingVariables,
		MessageKey: "backend.error.request.bodyVariablesMissing",
		Title:      "Body içinde eksik değişken var",
		Message:    "Request body çözümlenemedi.",
		Hint:       "Şu değişkenleri tanımlayın: {variables}",
	}
	userErrorRequestHeaderVariablesMissing = userErrorDefinition{
		Code:       UserErrorMissingVariables,
		MessageKey: "backend.error.request.headerVariablesMissing",
		Title:      "Header içinde eksik değişken var",
		Message:    "{headerName} header değeri çözümlenemedi.",
		Hint:       "Şu değişkenleri tanımlayın: {variables}",
	}
	userErrorRequestCanceled = userErrorDefinition{
		Code:       UserErrorRequestCanceled,
		MessageKey: "backend.error.request.canceled",
		Title:      "Request iptal edildi",
		Message:    "İstek kullanıcı tarafından durduruldu.",
		Hint:       "URL ve form değerleri sekmede korunuyor.",
	}
	userErrorRequestTimeout = userErrorDefinition{
		Code:       UserErrorRequestTimeout,
		MessageKey: "backend.error.request.timeout",
		Title:      "Request zaman aşımına uğradı",
		Message:    "{timeoutMs} ms içinde yanıt alınamadı.",
		Hint:       "Timeout değerini artırın veya hedef servisin erişilebilirliğini kontrol edin.",
	}
	userErrorRequestInvalidDefinition = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.invalidDefinition",
		Title:      "Request oluşturulamadı",
		Message:    "Method, URL veya header tanımı geçerli görünmüyor.",
		Hint:       "URL’yi, method seçimini ve etkin header’ları kontrol edin.",
	}
	userErrorRequestNetwork = userErrorDefinition{
		Code:       UserErrorNetwork,
		MessageKey: "backend.error.request.network",
		Title:      "Sunucuya ulaşılamadı",
		Message:    "Ağ bağlantısı kurulamadı.",
		Hint:       "Base URL, VPN, proxy ve sunucu durumunu kontrol edin.",
	}
	userErrorRequestFailed = userErrorDefinition{
		Code:       UserErrorRequestFailed,
		MessageKey: "backend.error.request.failed",
		Title:      "Request tamamlanamadı",
		Message:    "Beklenmeyen bir bağlantı hatası oluştu.",
		Hint:       "Teknik ayrıntıyı kopyalayıp servis loglarıyla karşılaştırın.",
	}
	userErrorRequestResponseBodyTooLarge = userErrorDefinition{
		Code:       UserErrorResponseTooLarge,
		MessageKey: "backend.error.request.responseBodyTooLarge",
		Title:      "Response sınırı aştı",
		Message:    "Sunucunun bildirdiği veya alınan response body {maxMiB} MiB güvenlik sınırını aştığı için indirme durduruldu.",
		Hint:       "Daha küçük bir veri kümesi isteyin veya endpoint’e sayfalama/filtre ekleyin.",
	}
	userErrorRequestBodyTooLarge = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.bodyTooLarge",
		Title:      "Request body sınırı aştı",
		Message:    "Request body {maxMiB} MiB güvenlik sınırını aştığı için gönderilmedi.",
		Hint:       "Body boyutunu küçültün veya büyük dosya aktarımı için özel bir istemci kullanın.",
	}
	userErrorRequestResponseHeadersTooLarge = userErrorDefinition{
		Code:       UserErrorResponseHeadersTooLarge,
		MessageKey: "backend.error.request.responseHeadersTooLarge",
		Title:      "Response header’ları sınırı aştı",
		Message:    "Sunucunun response header’ları {maxMiB} MiB güvenlik sınırını aştığı için request durduruldu.",
		Hint:       "Sunucunun büyük header değerlerini küçültün veya gereksiz response header’larını kaldırın.",
	}
	userErrorRequestHeaderInvalid = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.headerInvalid",
		Title:      "{headerName} header geçerli değil",
		Message:    "Header adı veya değeri geçerli değil.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestHeaderNameInvalid = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.headerNameInvalid",
		Title:      "{headerName} header geçerli değil",
		Message:    "Header adı geçerli bir HTTP token değeri olmalıdır.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestHeaderValueInvalid = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.headerValueInvalid",
		Title:      "{headerName} header geçerli değil",
		Message:    "Header değeri güvenli olmayan satır sonu karakterleri içeriyor.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestHostHeaderDuplicate = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.hostHeaderDuplicate",
		Title:      "{headerName} header geçerli değil",
		Message:    "Bir request birden fazla Host header içeremez.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestHostHeaderInvalid = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.hostHeaderInvalid",
		Title:      "{headerName} header geçerli değil",
		Message:    "Host değeri geçersiz veya güvenli olmayan karakterler içeriyor.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestContentLengthDuplicate = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.contentLengthDuplicate",
		Title:      "{headerName} header geçerli değil",
		Message:    "Bir request birden fazla Content-Length header içeremez.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestContentLengthInvalid = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.contentLengthInvalid",
		Title:      "{headerName} header geçerli değil",
		Message:    "Content-Length negatif olmayan bir tam sayı olmalıdır.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestContentLengthMismatch = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.contentLengthMismatch",
		Title:      "{headerName} header geçerli değil",
		Message:    "Content-Length {declaredLength} ancak çözümlenmiş request body {bodyLength} byte.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestContentLengthUnsupported = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.contentLengthUnsupported",
		Title:      "{headerName} header geçerli değil",
		Message:    "Bu method için açık Content-Length: 0 net/http tarafından wire’a yazılamaz; header’ı kaldırın.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestFramingConflict = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.framingConflict",
		Title:      "{headerName} header geçerli değil",
		Message:    "Content-Length ve Transfer-Encoding aynı request’te birlikte kullanılamaz.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestTransferEncodingDuplicate = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.transferEncodingDuplicate",
		Title:      "{headerName} header geçerli değil",
		Message:    "Bir request birden fazla Transfer-Encoding header içeremez.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestTransferEncodingInvalid = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.transferEncodingInvalid",
		Title:      "{headerName} header geçerli değil",
		Message:    "Yalnız chunked Transfer-Encoding destekleniyor.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestTransferEncodingBodyUnsupported = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.transferEncodingBodyUnsupported",
		Title:      "{headerName} header geçerli değil",
		Message:    "HEAD ve TRACE requestleri chunked body taşıyamaz.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestTrailerUnsupported = userErrorDefinition{
		Code:       UserErrorInvalidRequest,
		MessageKey: "backend.error.request.trailerUnsupported",
		Title:      "{headerName} header geçerli değil",
		Message:    "Trailer alanları düz bir header listesi olarak güvenilir biçimde gönderilemez.",
		Hint:       "Header değerini düzeltin veya header’ı kaldırıp Validex’in güvenli varsayılanını kullanın.",
	}
	userErrorRequestUnsupportedContentEncoding = userErrorDefinition{
		Code:       UserErrorUnsupportedEncoding,
		MessageKey: "backend.error.request.unsupportedContentEncoding",
		Title:      "Response sıkıştırması desteklenmiyor",
		Message:    "Sunucu yanıtı \"{encoding}\" Content-Encoding ile gönderdi; Validex yalnız gzip ve deflate yanıtlarını açabilir.",
		Hint:       "Accept-Encoding header’ından bu formatı kaldırın ve gzip veya deflate isteyin.",
	}
	userErrorRequestTooManyContentEncodings = userErrorDefinition{
		Code:       UserErrorTooManyEncodings,
		MessageKey: "backend.error.request.tooManyContentEncodings",
		Title:      "Response sıkıştırması çok karmaşık",
		Message:    "Sunucu {maxLayers} katmandan fazla Content-Encoding bildirdi.",
		Hint:       "Sunucuyu daha az sıkıştırma katmanı kullanacak şekilde yapılandırın.",
	}
	userErrorRequestResponseDecodeFailed = userErrorDefinition{
		Code:       UserErrorResponseDecodeFailed,
		MessageKey: "backend.error.request.responseDecodeFailed",
		Title:      "Response açılamadı",
		Message:    "Sunucu \"{encoding}\" ile sıkıştırılmış bir yanıt verdi ancak body çözülemedi.",
		Hint:       "Sunucunun Content-Encoding header’ı ile gönderdiği body formatının eşleştiğini kontrol edin.",
	}
)

var (
	userErrorOpenAPIRuntimeUnavailable = userErrorDefinition{
		Code:       UserErrorRuntimeUnavailable,
		MessageKey: "backend.error.openapi.runtimeUnavailable",
		Title:      "Dosya seçici açılamadı",
		Message:    "Desktop runtime henüz hazır değil.",
	}
	userErrorOpenAPIFileDialogFailed = userErrorDefinition{
		Code:       UserErrorFileDialogFailed,
		MessageKey: "backend.error.openapi.fileDialogFailed",
		Title:      "Dosya seçilemedi",
		Message:    "Sistem dosya seçicisi tamamlanamadı.",
	}
	userErrorOpenAPIInvalidDocument = userErrorDefinition{
		Code:       UserErrorInvalidOpenAPI,
		MessageKey: "backend.error.openapi.invalidDocument",
		Title:      "OpenAPI içe aktarılamadı",
		Message:    "Dosya geçerli bir OpenAPI dokümanı değil.",
		Hint:       "YAML/JSON sözdizimini ve schema referanslarını kontrol edin.",
	}
	userErrorOpenAPISessionCanceled = userErrorDefinition{
		Code:       UserErrorOperationCanceled,
		MessageKey: "backend.error.openapi.sessionCanceled",
		Title:      "OpenAPI içe aktarma iptal edildi",
		Message:    "Önceki uygulama oturumunda başlayan işlem artık geçerli değil.",
		Hint:       "Dosyayı açık oturumda yeniden seçin.",
	}
	userErrorOpenAPISpecUnavailable = userErrorDefinition{
		Code:       UserErrorSpecUnavailable,
		MessageKey: "backend.error.openapi.specUnavailable",
		Title:      "OpenAPI contract bulunamadı",
		Message:    "Bu request’in OpenAPI dokümanı artık bellekte değil.",
		Hint:       "OpenAPI dosyasını yeniden içe aktarın.",
	}
	userErrorOpenAPIBodyEncodingInvalid = userErrorDefinition{
		Code:       UserErrorBodyEncodingInvalid,
		MessageKey: "backend.error.openapi.bodyEncodingInvalid",
		Title:      "Response body çözülemedi",
		Message:    "Contract kontrolüne verilen response body encoding değeri geçerli değil.",
		Hint:       "Request’i yeniden gönderip contract kontrolünü tekrar çalıştırın.",
	}
	userErrorOpenAPIResponseSchemaUnavailable = userErrorDefinition{
		Code:       UserErrorResponseSchemaUnavailable,
		MessageKey: "backend.error.openapi.responseSchemaUnavailable",
		Title:      "Karşılaştırılacak JSON schema yok",
		Message:    "{statusCode} response’u için \"{contentType}\" ile eşleşen JSON media schema bulunamadı.",
		Hint:       "OpenAPI dokümanında bu status veya default response altına gerçek response media type’ıyla eşleşen JSON schema ekleyin.",
	}
	userErrorOpenAPIResponseSchemaUnavailableWithoutContentType = userErrorDefinition{
		Code:       UserErrorResponseSchemaUnavailable,
		MessageKey: "backend.error.openapi.responseSchemaUnavailableWithoutContentType",
		Title:      "Karşılaştırılacak JSON schema yok",
		Message:    "{statusCode} response’u için \"Content-Type belirtilmedi\" ile eşleşen JSON media schema bulunamadı.",
		Hint:       "OpenAPI dokümanında bu status veya default response altına gerçek response media type’ıyla eşleşen JSON schema ekleyin.",
	}
	userErrorOpenAPIOperationUnavailable = userErrorDefinition{
		Code:       UserErrorOperationUnavailable,
		MessageKey: "backend.error.openapi.operationUnavailable",
		Title:      "OpenAPI operation bulunamadı",
		Message:    "{method} {path} bu dokümanda bulunamadı.",
	}
)
