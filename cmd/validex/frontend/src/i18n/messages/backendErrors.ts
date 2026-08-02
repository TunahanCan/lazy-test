import { defineMessages } from "./defineMessages.js";

export const backendUserErrorMessageKeys = new Set<string>([
  "backend.error.collectionFile.runtimeUnavailable",
  "backend.error.collectionFile.dialogFailed",
  "backend.error.collectionFile.invalid",
  "backend.error.collectionFile.readFailed",
  "backend.error.collectionFile.writeFailed",
  "backend.error.collectionLibrary.conflict",
  "backend.error.collectionLibrary.invalid",
  "backend.error.collectionLibrary.corrupt",
  "backend.error.collectionLibrary.busy",
  "backend.error.collectionLibrary.notLoaded",
  "backend.error.collectionLibrary.readFailed",
  "backend.error.collectionLibrary.writeFailed",
  "backend.error.collectionLibrary.browserReadFailed",
  "backend.error.collectionLibrary.browserWriteFailed",
  "backend.error.collectionLibrary.bridgeReadFailed",
  "backend.error.collectionLibrary.bridgeWriteFailed",
  "backend.error.collectionLibrary.newerVersion",
]);

export const backendUserErrorHintKeys = new Set<string>([
  "backend.error.collectionFile.invalid",
  "backend.error.collectionFile.readFailed",
  "backend.error.collectionFile.writeFailed",
  "backend.error.collectionLibrary.conflict",
  "backend.error.collectionLibrary.invalid",
  "backend.error.collectionLibrary.corrupt",
  "backend.error.collectionLibrary.busy",
  "backend.error.collectionLibrary.notLoaded",
  "backend.error.collectionLibrary.readFailed",
  "backend.error.collectionLibrary.writeFailed",
  "backend.error.collectionLibrary.newerVersion",
]);

export const backendErrorMessages = defineMessages(
  {
    "backend.error.collectionFile.runtimeUnavailable.title":
      "Collection file could not be opened",
    "backend.error.collectionFile.runtimeUnavailable.message":
      "The desktop runtime is not ready yet.",
    "backend.error.collectionFile.dialogFailed.title":
      "Collection file could not be selected",
    "backend.error.collectionFile.dialogFailed.message":
      "The system file picker could not complete.",
    "backend.error.collectionFile.invalid.title":
      "Invalid collection file",
    "backend.error.collectionFile.invalid.message":
      "The collection transfer must be a valid UTF-8 JSON file within the size limit.",
    "backend.error.collectionFile.invalid.hint":
      "Check the file's JSON format and size.",
    "backend.error.collectionFile.readFailed.title":
      "Collection file could not be read",
    "backend.error.collectionFile.readFailed.message":
      "The selected collection file could not be read.",
    "backend.error.collectionFile.readFailed.hint":
      "Check the file permissions and confirm that the file is still accessible.",
    "backend.error.collectionFile.writeFailed.title":
      "Collection file could not be written",
    "backend.error.collectionFile.writeFailed.message":
      "The collections could not be saved to the selected location.",
    "backend.error.collectionFile.writeFailed.hint":
      "Check the folder permissions and available disk space.",

    "backend.error.collectionLibrary.conflict.title":
      "Collection change conflicted",
    "backend.error.collectionLibrary.conflict.message":
      "The collections were changed in another Validex window.",
    "backend.error.collectionLibrary.conflict.hint":
      "Load the latest collections, then apply your change again.",
    "backend.error.collectionLibrary.invalid.title":
      "Collection could not be saved",
    "backend.error.collectionLibrary.invalid.message":
      "The collection data is not a valid versioned JSON record.",
    "backend.error.collectionLibrary.invalid.hint":
      "Refresh the app and try saving again.",
    "backend.error.collectionLibrary.corrupt.title":
      "Collections could not be loaded",
    "backend.error.collectionLibrary.corrupt.message":
      "The local collection file is not a valid Validex record.",
    "backend.error.collectionLibrary.corrupt.hint":
      "Back up the file, then create a new collection in the app.",
    "backend.error.collectionLibrary.busy.title":
      "Collection operation is waiting",
    "backend.error.collectionLibrary.busy.message":
      "The collection storage queue is temporarily full.",
    "backend.error.collectionLibrary.busy.hint":
      "Try again after the current save completes.",
    "backend.error.collectionLibrary.notLoaded.title":
      "Collections must be loaded first",
    "backend.error.collectionLibrary.notLoaded.message":
      "The existing collection file has not been loaded in this session yet.",
    "backend.error.collectionLibrary.notLoaded.hint":
      "Refresh the collections, then apply your change again.",
    "backend.error.collectionLibrary.readFailed.title":
      "Collections could not be loaded",
    "backend.error.collectionLibrary.readFailed.message":
      "The local application data could not be read.",
    "backend.error.collectionLibrary.readFailed.hint":
      "Check that the application data directory is accessible.",
    "backend.error.collectionLibrary.writeFailed.title":
      "Collection could not be saved",
    "backend.error.collectionLibrary.writeFailed.message":
      "The collections could not be written to local application data.",
    "backend.error.collectionLibrary.writeFailed.hint":
      "Check disk space and the application data directory permissions.",
    "backend.error.collectionLibrary.browserReadFailed.title":
      "Collections could not be loaded",
    "backend.error.collectionLibrary.browserReadFailed.message":
      "Browser development storage could not be read.",
    "backend.error.collectionLibrary.browserWriteFailed.title":
      "Collection could not be saved",
    "backend.error.collectionLibrary.browserWriteFailed.message":
      "Browser development storage could not be written.",
    "backend.error.collectionLibrary.bridgeReadFailed.title":
      "Collections could not be loaded",
    "backend.error.collectionLibrary.bridgeReadFailed.message":
      "The desktop storage connection did not respond.",
    "backend.error.collectionLibrary.bridgeWriteFailed.title":
      "Collection could not be saved",
    "backend.error.collectionLibrary.bridgeWriteFailed.message":
      "The desktop storage connection did not respond.",
    "backend.error.collectionLibrary.newerVersion.title":
      "Collections were saved by a newer version",
    "backend.error.collectionLibrary.newerVersion.message":
      "Update Validex to open this collection file safely.",
    "backend.error.collectionLibrary.newerVersion.hint":
      "The stored collection library uses version {version}.",
  },
  {
    "backend.error.collectionFile.runtimeUnavailable.title":
      "Koleksiyon dosyası açılamadı",
    "backend.error.collectionFile.runtimeUnavailable.message":
      "Desktop runtime henüz hazır değil.",
    "backend.error.collectionFile.dialogFailed.title":
      "Koleksiyon dosyası seçilemedi",
    "backend.error.collectionFile.dialogFailed.message":
      "Sistem dosya seçicisi tamamlanamadı.",
    "backend.error.collectionFile.invalid.title":
      "Koleksiyon dosyası geçersiz",
    "backend.error.collectionFile.invalid.message":
      "Koleksiyon aktarımı geçerli, boyut sınırları içindeki bir UTF-8 JSON dosyası olmalıdır.",
    "backend.error.collectionFile.invalid.hint":
      "Dosyanın JSON biçimini ve boyutunu kontrol edin.",
    "backend.error.collectionFile.readFailed.title":
      "Koleksiyon dosyası okunamadı",
    "backend.error.collectionFile.readFailed.message":
      "Seçilen koleksiyon dosyasının içeriği okunamadı.",
    "backend.error.collectionFile.readFailed.hint":
      "Dosya izinlerini ve dosyanın hâlâ erişilebilir olduğunu kontrol edin.",
    "backend.error.collectionFile.writeFailed.title":
      "Koleksiyon dosyası yazılamadı",
    "backend.error.collectionFile.writeFailed.message":
      "Koleksiyonlar seçilen konuma kaydedilemedi.",
    "backend.error.collectionFile.writeFailed.hint":
      "Klasör izinlerini ve kullanılabilir disk alanını kontrol edin.",

    "backend.error.collectionLibrary.conflict.title":
      "Koleksiyon değişikliği çakıştı",
    "backend.error.collectionLibrary.conflict.message":
      "Koleksiyonlar başka bir Validex penceresinde değiştirildi.",
    "backend.error.collectionLibrary.conflict.hint":
      "En güncel koleksiyonları yükleyip değişikliğinizi yeniden uygulayın.",
    "backend.error.collectionLibrary.invalid.title":
      "Koleksiyon kaydedilemedi",
    "backend.error.collectionLibrary.invalid.message":
      "Koleksiyon verisi geçerli bir sürümlü JSON kaydı değil.",
    "backend.error.collectionLibrary.invalid.hint":
      "Uygulamayı yenileyip kaydetmeyi yeniden deneyin.",
    "backend.error.collectionLibrary.corrupt.title":
      "Koleksiyonlar yüklenemedi",
    "backend.error.collectionLibrary.corrupt.message":
      "Yerel koleksiyon dosyası geçerli bir Validex kaydı değil.",
    "backend.error.collectionLibrary.corrupt.hint":
      "Dosyayı yedekleyip uygulamada yeni bir koleksiyon oluşturun.",
    "backend.error.collectionLibrary.busy.title":
      "Koleksiyon işlemi bekliyor",
    "backend.error.collectionLibrary.busy.message":
      "Koleksiyon depolama kuyruğu geçici olarak dolu.",
    "backend.error.collectionLibrary.busy.hint":
      "Devam eden kayıt tamamlandıktan sonra yeniden deneyin.",
    "backend.error.collectionLibrary.notLoaded.title":
      "Koleksiyonlar önce yüklenmeli",
    "backend.error.collectionLibrary.notLoaded.message":
      "Var olan koleksiyon dosyası bu oturumda henüz yüklenmedi.",
    "backend.error.collectionLibrary.notLoaded.hint":
      "Koleksiyonları yenileyip değişikliğinizi yeniden uygulayın.",
    "backend.error.collectionLibrary.readFailed.title":
      "Koleksiyonlar yüklenemedi",
    "backend.error.collectionLibrary.readFailed.message":
      "Yerel uygulama verisi okunamadı.",
    "backend.error.collectionLibrary.readFailed.hint":
      "Uygulama veri dizininin erişilebilir olduğunu kontrol edin.",
    "backend.error.collectionLibrary.writeFailed.title":
      "Koleksiyon kaydedilemedi",
    "backend.error.collectionLibrary.writeFailed.message":
      "Koleksiyonlar yerel uygulama verisine yazılamadı.",
    "backend.error.collectionLibrary.writeFailed.hint":
      "Disk alanını ve uygulama veri dizini izinlerini kontrol edin.",
    "backend.error.collectionLibrary.browserReadFailed.title":
      "Koleksiyonlar yüklenemedi",
    "backend.error.collectionLibrary.browserReadFailed.message":
      "Tarayıcı geliştirme depolaması okunamadı.",
    "backend.error.collectionLibrary.browserWriteFailed.title":
      "Koleksiyon kaydedilemedi",
    "backend.error.collectionLibrary.browserWriteFailed.message":
      "Tarayıcı geliştirme depolamasına yazılamadı.",
    "backend.error.collectionLibrary.bridgeReadFailed.title":
      "Koleksiyonlar yüklenemedi",
    "backend.error.collectionLibrary.bridgeReadFailed.message":
      "Masaüstü depolama bağlantısı yanıt vermedi.",
    "backend.error.collectionLibrary.bridgeWriteFailed.title":
      "Koleksiyon kaydedilemedi",
    "backend.error.collectionLibrary.bridgeWriteFailed.message":
      "Masaüstü depolama bağlantısı yanıt vermedi.",
    "backend.error.collectionLibrary.newerVersion.title":
      "Koleksiyonlar daha yeni bir sürümle kaydedilmiş",
    "backend.error.collectionLibrary.newerVersion.message":
      "Bu koleksiyon dosyasını güvenle açmak için Validex’i güncelleyin.",
    "backend.error.collectionLibrary.newerVersion.hint":
      "Kayıtlı koleksiyon kitaplığı {version} sürümünü kullanıyor.",
  },
);
