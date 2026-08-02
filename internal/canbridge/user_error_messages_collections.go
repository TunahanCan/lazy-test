package canbridge

var (
	errorCollectionFileRuntimeUnavailable = userErrorDefinition{
		Code:       UserErrorRuntimeUnavailable,
		MessageKey: "backend.error.collectionFile.runtimeUnavailable",
		Title:      "Koleksiyon dosyası açılamadı",
		Message:    "Desktop runtime henüz hazır değil.",
	}
	errorCollectionFileDialogFailed = userErrorDefinition{
		Code:       UserErrorFileDialogFailed,
		MessageKey: "backend.error.collectionFile.dialogFailed",
		Title:      "Koleksiyon dosyası seçilemedi",
		Message:    "Sistem dosya seçicisi tamamlanamadı.",
	}
	errorCollectionFileInvalid = userErrorDefinition{
		Code:       UserErrorCollectionFileInvalid,
		MessageKey: "backend.error.collectionFile.invalid",
		Title:      "Koleksiyon dosyası geçersiz",
		Message:    "Koleksiyon aktarımı geçerli, boyut sınırları içindeki bir UTF-8 JSON dosyası olmalıdır.",
		Hint:       "Dosyanın JSON biçimini ve boyutunu kontrol edin.",
	}
	errorCollectionFileReadFailed = userErrorDefinition{
		Code:       UserErrorCollectionFileReadFailed,
		MessageKey: "backend.error.collectionFile.readFailed",
		Title:      "Koleksiyon dosyası okunamadı",
		Message:    "Seçilen koleksiyon dosyasının içeriği okunamadı.",
		Hint:       "Dosya izinlerini ve dosyanın hâlâ erişilebilir olduğunu kontrol edin.",
	}
	errorCollectionFileWriteFailed = userErrorDefinition{
		Code:       UserErrorCollectionFileWriteFailed,
		MessageKey: "backend.error.collectionFile.writeFailed",
		Title:      "Koleksiyon dosyası yazılamadı",
		Message:    "Koleksiyonlar seçilen konuma kaydedilemedi.",
		Hint:       "Klasör izinlerini ve kullanılabilir disk alanını kontrol edin.",
	}

	errorCollectionLibraryConflict = userErrorDefinition{
		Code:       CollectionLibraryErrorConflict,
		MessageKey: "backend.error.collectionLibrary.conflict",
		Title:      "Koleksiyon değişikliği çakıştı",
		Message:    "Koleksiyonlar başka bir Validex penceresinde değiştirildi.",
		Hint:       "En güncel koleksiyonları yükleyip değişikliğinizi yeniden uygulayın.",
	}
	errorCollectionLibraryInvalid = userErrorDefinition{
		Code:       CollectionLibraryErrorInvalid,
		MessageKey: "backend.error.collectionLibrary.invalid",
		Title:      "Koleksiyon kaydedilemedi",
		Message:    "Koleksiyon verisi geçerli bir sürümlü JSON kaydı değil.",
		Hint:       "Uygulamayı yenileyip kaydetmeyi yeniden deneyin.",
	}
	errorCollectionLibraryCorrupt = userErrorDefinition{
		Code:       CollectionLibraryErrorCorrupt,
		MessageKey: "backend.error.collectionLibrary.corrupt",
		Title:      "Koleksiyonlar yüklenemedi",
		Message:    "Yerel koleksiyon dosyası geçerli bir Validex kaydı değil.",
		Hint:       "Dosyayı yedekleyip uygulamada yeni bir koleksiyon oluşturun.",
	}
	errorCollectionLibraryBusy = userErrorDefinition{
		Code:       CollectionLibraryErrorBusy,
		MessageKey: "backend.error.collectionLibrary.busy",
		Title:      "Koleksiyon işlemi bekliyor",
		Message:    "Koleksiyon depolama kuyruğu geçici olarak dolu.",
		Hint:       "Devam eden kayıt tamamlandıktan sonra yeniden deneyin.",
	}
	errorCollectionLibraryNotLoaded = userErrorDefinition{
		Code:       CollectionLibraryErrorNotLoaded,
		MessageKey: "backend.error.collectionLibrary.notLoaded",
		Title:      "Koleksiyonlar önce yüklenmeli",
		Message:    "Var olan koleksiyon dosyası bu oturumda henüz yüklenmedi.",
		Hint:       "Koleksiyonları yenileyip değişikliğinizi yeniden uygulayın.",
	}
	errorCollectionLibraryReadFailed = userErrorDefinition{
		Code:       CollectionLibraryErrorReadFailed,
		MessageKey: "backend.error.collectionLibrary.readFailed",
		Title:      "Koleksiyonlar yüklenemedi",
		Message:    "Yerel uygulama verisi okunamadı.",
		Hint:       "Uygulama veri dizininin erişilebilir olduğunu kontrol edin.",
	}
	errorCollectionLibraryWriteFailed = userErrorDefinition{
		Code:       CollectionLibraryErrorWriteFailed,
		MessageKey: "backend.error.collectionLibrary.writeFailed",
		Title:      "Koleksiyon kaydedilemedi",
		Message:    "Koleksiyonlar yerel uygulama verisine yazılamadı.",
		Hint:       "Disk alanını ve uygulama veri dizini izinlerini kontrol edin.",
	}
)
