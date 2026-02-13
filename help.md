# lazytest — Mimari ve Özellik Dokümantasyonu

Bu doküman, `lazytest` projesinin **mimarisini, modül sınırlarını, veri akışlarını, çalışma modlarını ve genişletilebilirlik noktalarını**; geliştirici ve çözüm mimarı perspektifiyle özetler.

---

## 1) Ürün Özeti

`lazytest`, REST mikroservislerini tek araçla doğrulamak için tasarlanmış bir CLI/TUI uygulamasıdır. Temel hedefi, API kalite yaşam döngüsünde sıklıkla ayrık araçlarla yapılan işleri tek bir akışta toplamaktır:

- OpenAPI’den endpoint keşfi
- Smoke test (tek endpoint + toplu)
- Contract drift analizi (OpenAPI response schema vs gerçek response)
- A/B environment karşılaştırması
- Taurus-benzeri YAML planlarıyla tek-node load test
- JUnit + JSON raporlama
- Canlı operasyon takibi için terminal tabanlı TUI

---

## 2) Sistem Sınırı ve Katmanlar

Proje, teknik olarak aşağıdaki katmanlara ayrılmıştır:

1. **Entry/Orchestration katmanı (`cmd/lazytest`)**
   - Cobra komutları, global flag’ler, çalışma moduna göre yönlendirme.
2. **Domain/Core doğrulama katmanı (`internal/core`)**
   - OpenAPI parse, smoke, drift, A/B karşılaştırma.
3. **Load test katmanı (`internal/lt`)**
   - Taurus plan parse + goroutine tabanlı execution + metrik hesaplama.
4. **Presentation katmanı (`internal/tui`)**
   - gocui tabanlı ekranlar, state, keybinding’ler, kullanıcı etkileşimi.
5. **Destekleyici altyapı katmanları**
   - `internal/config`: env/auth konfigürasyonu
   - `internal/report`: JUnit/JSON dışa aktarım

Bu ayrım sayesinde **UI (TUI/CLI) ile test iş mantığı gevşek bağlı** tutulur ve aynı core fonksiyonları hem headless hem interaktif modlarda yeniden kullanılır.

---

## 3) Dizin Bazlı Mimari Harita

## `cmd/lazytest/main.go`

Uygulamanın komut sözleşmesi burada tanımlıdır:

- `lazytest` → varsayılan TUI akışı
- `lazytest load` → OpenAPI yükleyip TUI
- `lazytest run smoke` → headless smoke + rapor
- `lazytest run drift` → tek endpoint drift
- `lazytest compare` → A/B karşılaştırma
- `lazytest lt` → Taurus planı ile LT odaklı TUI

Ayrıca:
- Ortam (`env.yaml`) ve auth (`auth.yaml`) yükleme
- `--base` override davranışı
- Sonuçların raporlayıcıya aktarılması
- TUI state’in başlangıç değerlerinin hazırlanması

## `internal/core`

### `openapi.go`
- OpenAPI dokümanını okur, parse/validate eder.
- `path + method` kombinasyonlarını `Endpoint` listesine dönüştürür.
- Request body için şema tabanlı örnek payload üretir (`ExampleBody`).
- Base URL + path birleştirme ve path param çözümleme (`BuildURL`).

### `smoke.go`
- Tek endpoint smoke (`RunSmokeSingle`) ve bulk smoke (`RunSmokeBulk`).
- Worker pool ve RPS limiter (`ticker`) ile paralel yürütme.
- Smoke sonucu modeli: status, latency, hata metni, OK bilgisi.
- Drift kullanımına yönelik response alma yardımcı fonksiyonu (`FetchResponse`).

### `drift.go`
- OpenAPI response schema ile gerçek JSON body karşılaştırması.
- Bulgu tipleri:
  - `missing`
  - `extra`
  - `type_mismatch`
  - `enum_violation`
- Nesne/dizi/iç içe alanlarda yol bazlı (`$.field[0].x`) bulgu üretimi.

### `abcompare.go`
- Aynı endpoint’i iki base URL’e gönderir.
- Fark analizi:
  - status karşılaştırma
  - header anahtar seti karşılaştırması
  - body structure diff
  - body value diff

## `internal/lt`

### `taurus.go`
- Taurus YAML planını `Plan` modeline parse eder.
- `execution`, `scenarios`, `data-sources` yapılarını normalize eder.
- Request method normalizasyonu (default GET).
- `${var}` biçimli değişken çözümleme (`ResolveVars`).

### `runner.go`
- Planın ilk execution bloğuna göre concurrency/ramp-up/hold-for ile koşum.
- Tek-node, goroutine tabanlı VU yaklaşımı.
- Request/assertion/extraction döngüsü.
- Warm-up sonrasını metriğe dahil eden akış.
- Think-time uygulama ve threshold odaklı LT config.

### `metrics.go`
- Latency/OK/status örneklerini thread-safe toplar.
- `Snapshot` üretir:
  - p50/p90/p95/p99
  - RPS
  - error rate
  - status dağılımı
- Eşik ihlali kontrolü (`ThresholdCheck`).

## `internal/tui`

### `state.go`
- Uygulamanın merkezi state modeli (`AppState`).
- Endpoint/smoke/drift/A-B/LT metrikleri, env/auth ve rapor durumu burada tutulur.
- Her menü için tablo projeksiyonları üretir.

### `app.go`
- gocui layout yönetimi ve event loop.
- Keybinding’ler:
  - `r`: seçili endpoint smoke
  - `a`: tüm endpoint smoke
  - `o`: drift
  - `c/C`: A/B compare
  - `L`: load test çalıştır
  - `W/E/R/H`: warm-up/error budget/reset/hide metrics
  - `s`: rapor kaydı
  - `e/p`: env ve auth profili döngüsü

### `views/*`
- Sol menü, tablo, detay paneli, status bar, logo ve tema bileşenleri.

## `internal/config`
- `env.yaml` -> environment modeli (baseURL, headers, RPS)
- `auth.yaml` -> auth profilleri (jwt/apikey)
- Basit lookup fonksiyonlarıyla tüketim (`GetEnvironment`, `GetAuthProfile`).

## `internal/report`
- `junit.go`: test sonuçlarından JUnit XML üretimi
- `json.go`: smoke/drift/compare çıktıları için JSON raporlama

---

## 4) Çalışma Modları

### 4.1 Headless (CI/CD dostu)

- `run smoke`:
  - OpenAPI parse
  - Bulk smoke koşumu
  - JUnit + JSON rapor yazımı
- `run drift`:
  - Endpoint seçimi (`--path --method`)
  - Tek request + schema karşılaştırma
- `compare`:
  - İki env’in aynı endpoint sonuçlarının diff’i

### 4.2 Interaktif TUI

- Çoklu menü üzerinden operasyonel kullanım
- Canlı geri bildirim (status, latency, bulgular, metrikler)
- Çalışma sırasında env/auth değiştirme
- Raporu UI’dan kaydetme

---

## 5) Uçtan Uca Veri Akışları

### Akış A — OpenAPI’den smoke’a
1. Spec yüklenir, endpoint listesi çıkarılır.
2. Endpointler state’e alınır.
3. Smoke tetiklenir (tekli veya bulk).
4. Sonuçlar state’e yazılır ve UI güncellenir.
5. İstenirse sonuçlar JUnit/JSON’a aktarılır.

### Akış B — Drift
1. Endpoint seçilir.
2. İstek atılır, response body alınır.
3. İlgili status için response schema bulunur.
4. Recursive karşılaştırma ile bulgular üretilir.
5. Sonuç UI veya CLI stdout üzerinden sunulur.

### Akış C — LT
1. Taurus plan parse edilir.
2. Runner, concurrency/ramp-up/hold-for ile VU’ları başlatır.
3. Request/assertion/extraction döngüsü çalışır.
4. Metrics örnekleri toplanır ve snapshot hesaplanır.
5. TUI Live Metrics ekranı veriyi görselleştirir.

---

## 6) Mimari Kararlar ve Rasyonel

- **`internal/` sınırı**: Domain paketlerinin dış tüketime kapatılması.
- **CLI ve TUI ayrımı**: Aynı iş mantığı iki kullanım modelinde tekrar kullanılabilir.
- **YAML + OpenAPI merkezli yaklaşım**: Mevcut ekip artefaktlarını (spec, test planı) yeniden değerlendirme.
- **Tek-node LT**: Hafif ve hızlı geri bildirim odaklı; dağıtık yük üretimi hedeflenmez.

---

## 7) Özellik Matrisi

- OpenAPI parse + doğrulama
- Endpoint keşfi ve tag bilgisi
- Request body örnek üretimi
- Parallel smoke (worker + rate limit)
- Contract drift bulguları (missing/extra/type/enum)
- A/B diff (status/header/body)
- Taurus plan parse + execute
- Percentile/RPS/error-rate canlı metrikleri
- Environment ve auth profile yönetimi
- JUnit XML + JSON raporlama

---

## 8) Kısıtlar / Bilinçli Trade-off’lar

- LT runner tek execution bloğuna odaklıdır (ilk blok üzerinden yürür).
- JSONPath extraction sadeleştirilmiş uygulanır (tam JSONPath motoru değildir).
- Drift analizi `application/json` response odaklıdır.
- A/B body diff yaklaşımı pratik ve hızlıdır; semantik eşdeğerlik (ör. sırasız koleksiyon eşleme) sınırlıdır.

---

## 9) Genişletme Rehberi

### Yeni test tipi eklemek
1. `internal/core` veya `internal/lt` altında domain modeli + yürütücü ekleyin.
2. Gerekirse `internal/report` tarafında çıktı formatı ekleyin.
3. CLI komutu (`cmd/lazytest/main.go`) ile headless akışı bağlayın.
4. TUI aksiyonu (`internal/tui/app.go`) ve tablo/detay görünümü (`state.go`, `views/*`) ekleyin.

### LT yeteneklerini büyütmek
- Çoklu execution block stratejisi
- Daha zengin assertion türleri
- Data source ve değişken çözümlemede kapsam genişletme
- Gelişmiş JSONPath implementasyonu

### Kurumsal kullanım için öneriler
- CI’de `run smoke` + JUnit yayınlama
- Nightly pipeline’da LT planı + threshold gate
- Sözleşme yönetişimi için düzenli drift scan

---

## 10) Sonuç

`lazytest`, API kalite mühendisliğinde üç kritik ekseni (fonksiyonel erişilebilirlik, sözleşme uyumu, yük altında davranış) tek bir operasyonel yüzeyde birleştiren modüler bir mimariye sahiptir. Kod tabanı; **komut yönlendirme**, **domain yürütme**, **sunum** ve **raporlama** sorumluluklarını net ayırdığı için hem geliştirmesi hem de ölçeklendirmesi görece düşüktür.
