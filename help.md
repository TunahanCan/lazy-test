# lazytest – Proje Mimarisi

Bu doküman, `lazytest` projesinin klasör yapısını, modüller arası ilişkiyi ve ana veri akışını açıklar.

---

## 1) Yüksek seviye mimari

`lazytest`, katmanlı ve sorumlulukları ayrılmış bir yapıya sahiptir:

- **CLI giriş katmanı (`cmd/`)**  
  Uygulama komutları, flag yönetimi ve çalışma modlarının yönlendirilmesi.

- **Domain/iş mantığı katmanı (`internal/core`)**  
  OpenAPI parse, smoke test, drift analizi, A/B compare.

- **Load test katmanı (`internal/lt`)**  
  Taurus YAML planının parse edilmesi, runner ve metrik hesaplama.

- **Sunum katmanı (`internal/tui`)**  
  Terminal arayüzü (gocui), menüler, state yönetimi, tuş aksiyonları.

- **Altyapı yardımcıları (`internal/config`, `internal/report`)**  
  YAML config yükleme ve test raporu üretimi.

Bu sayede iş kuralları (core/lt) ile kullanıcı etkileşimi (tui/cli) ayrılmıştır.

---

## 2) Dizin yapısı ve sorumluluklar

## `cmd/lazytest/main.go`

Uygulamanın giriş noktasıdır.

- Cobra komutlarını tanımlar:
  - `load`
  - `run smoke`
  - `run drift`
  - `compare`
  - `lt`
- Global flag’leri toplar (`--file`, `--env`, `--base`, config dosyaları vb.).
- Varsayılan kullanımda TUI başlatır.
- Komut türüne göre `internal/core`, `internal/lt`, `internal/report`, `internal/tui` paketlerini çağırır.

---

## `internal/core`

OpenAPI ve API doğrulama mantığının merkezidir.

### `openapi.go`
- OpenAPI dosyasını okur ve valide eder.
- `path+method` kombinasyonlarını `Endpoint` listesine dönüştürür.
- İstek body’si için örnek payload üretir (`ExampleBody`).
- Base URL + endpoint path birleştirme (`BuildURL`).

### `smoke.go`
- Tek endpoint smoke (`RunSmokeSingle`) ve toplu smoke (`RunSmokeBulk`) çalıştırır.
- Worker pool + rate limiter (`ticker`) ile paralel istek gönderir.
- Sonuçları `SmokeResult` ile toplar.
- Drift kontrolü için ham response alma fonksiyonu (`FetchResponse`) içerir.

### `drift.go`
- OpenAPI response şeması ile gerçek JSON response’u karşılaştırır.
- Bulgular:
  - `missing`
  - `extra`
  - `type_mismatch`
  - `enum_violation`
- Çıktı modelini `DriftResult` içinde döndürür.

### `abcompare.go`
- Aynı endpoint’i iki farklı environment’a gönderir.
- Karşılaştırma boyutları:
  - status code
  - header yapısı
  - body structure farkı
  - body value farkı

---

## `internal/lt`

Taurus uyumlu yük testi modülüdür.

### `taurus.go`
- YAML planını `Plan` modeline parse eder.
- `execution`, `scenarios`, `requests`, `assertions`, `data-sources` alanlarını taşır.
- Request method normalize eder ve değişken çözümleme (`ResolveVars`) sunar.

### `runner.go`
- Tek node üzerinde goroutine tabanlı VU (virtual user) çalıştırır.
- `execution` ayarlarından:
  - concurrency
  - ramp-up
  - hold-for
  - scenario
  bilgilerini kullanır.
- Scenario içindeki request zincirini döngüde çalıştırır.
- Assertion kontrolü ve JSONPath extraction uygular.
- Warm-up sonrası örnekleri metriğe yazar.

### `metrics.go`
- İstek örneklerini toplar (`Sample`).
- Snapshot üretir:
  - p50/p90/p95/p99
  - RPS
  - error rate
  - status dağılımı
- Eşik ihlali kontrolü (error budget, p95 threshold) sağlar.

---

## `internal/tui`

Terminal arayüz katmanıdır.

### `state.go`
- Uygulamanın tekil state modelini taşır (`AppState`).
- Menü modu, endpoint listesi, smoke/drift sonuçları, LT metrikleri, environment ve auth bilgilerini tutar.
- Her menü için tablo verisi üretir (`table*` fonksiyonları).

### `app.go`
- gocui event loop, layout ve keybinding akışını yönetir.
- Kullanıcı aksiyonlarını state güncellemesi + core/lt çağrıları ile yürütür.

### `views/`
- Sol menü, tablo, detay paneli, status bar, logo gibi görsel parçaların render kodları.

---

## `internal/config`

Konfigürasyon yükleme katmanıdır.

- `env.yaml` -> environment listesi (`baseURL`, `headers`, `rateLimitRPS`)
- `auth.yaml` -> auth profilleri (jwt/apikey)
- Basit lookup fonksiyonları:
  - `GetEnvironment(name)`
  - `GetAuthProfile(name)`

---

## `internal/report`

Koşum sonuçlarını dışa aktarma katmanıdır.

- `junit.go`
  - Smoke ve drift için JUnit XML üretimi
- `json.go`
  - Smoke/drift/A-B sonuçları için JSON rapor modeli ve yazımı

Bu katman, CI/CD sistemleriyle entegrasyonu kolaylaştırır.

---

## 3) Veri akışı (örnek senaryolar)

### A) TUI üzerinden endpoint smoke

1. Kullanıcı OpenAPI dosyası yükler.
2. `core.LoadOpenAPI` endpoint listesini üretir.
3. Endpoint’ler `tui.AppState` içine aktarılır.
4. Kullanıcı `r` ile endpoint smoke tetikler.
5. `core.RunSmokeSingle` çalışır, sonuç state’e yazılır.
6. TUI tablo ve detay paneli güncellenir.

### B) Headless smoke (`run smoke`)

1. CLI komutu `runSmoke` fonksiyonuna düşer.
2. OpenAPI parse edilir, env/base URL belirlenir.
3. `core.RunSmokeBulk` paralel testleri çalıştırır.
4. Sonuçlar:
   - `report.WriteJUnitSmoke`
   - `report.WriteJSON`
   ile dosyaya kaydedilir.

### C) LT koşumu

1. Taurus planı `lt.ParseFile` ile parse edilir.
2. `lt.Runner.Run` VU’ları başlatır.
3. Her istek sonrası `lt.Metrics.Record` çağrılır.
4. TUI `Live Metrics` ekranı snapshot’ı okur ve günceller.

---

## 4) Tasarım kararları

- `internal/` kullanımı ile paketler dışa kapalı tutulur.
- CLI ve TUI ayrıdır; aynı core fonksiyonları yeniden kullanır.
- Raporlama ve konfigürasyon paketleri bağımsızdır.
- LT runner tek node ve hafif bir yürütme modeline odaklanır.

---

## 5) Geliştirme notları

- Yeni test türü eklemek için önce `internal/core` veya `internal/lt` içinde iş mantığı eklenmeli, ardından TUI aksiyonlarına bağlanmalıdır.
- Yeni rapor formatı gerekiyorsa `internal/report` altına ayrı encoder eklemek en temiz yaklaşımdır.
- Daha detaylı assertion/JSONPath davranışı LT tarafında `runner.go` ve `taurus.go` üzerinden genişletilebilir.

---

## 6) Özet

`lazytest`, API kalite süreçlerinde sık kullanılan üç ihtiyacı tek araçta toplar:
1. Fonksiyonel erişilebilirlik (smoke)
2. Sözleşme doğruluğu (drift)
3. Trafik altında davranış (LT)

Mimari olarak **CLI/TUI giriş katmanı + core/lt iş mantığı + config/report destek katmanları** şeklinde modüler bir yapı sunar.
