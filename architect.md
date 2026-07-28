# Validex Teknik Mimari

Bu belge Validex’in mevcut kod tabanını, çalışma zamanı sınırlarını ve güvenli
genişletme kurallarını açıklar. Yeni bir özellik geliştirmeden, native bridge
metodu eklemeden, kalıcı state şemasını değiştirmeden veya yeni bir domain
paketi oluşturmadan önce başvurulacak ana teknik kaynaktır.

Belge mevcut uygulamayı tarif eder; “gelecek yönü” olarak işaretlenen maddeler
henüz uygulanmış kabul edilmemelidir.

## 1. Mimari hedefler

Validex aşağıdaki hedefler etrafında tasarlanmıştır:

1. Masaüstü arayüzü ile headless CLI aynı domain davranışını paylaşmalıdır.
2. React bileşenleri işletim sistemi ve native WebView ayrıntılarını
   bilmemelidir.
3. Domain paketleri UI, IPC ve CLI adaptörlerinden bağımsız kalmalıdır.
4. Ağ, dosya, parser ve raporlama işlemleri açık kaynak limitleriyle
   çalışmalıdır.
5. Uzun süren işlemler mümkün olduğunda `context.Context` ve kullanıcı
   cancellation akışı taşımalıdır.
6. Hata sonuçları kullanıcıya güvenli, geliştiriciye teşhis edilebilir ve
   makine tarafından dallandırılabilir olmalıdır.
7. UI’nin zorunlu gördüğü collection alanları hiçbir hata yolunda `null`
   olmamalıdır.
8. Yeni özellikler mevcut bağımlılık yönünü bozmak yerine bağımsız domain
   paketleri ve ince adaptörlerle eklenmelidir.
9. Machine-readable durumlar serbest metin yerine enum, named string type,
   `as const` tuple veya sabit kümeleriyle modellenmelidir.
10. İmkânsız durumlar birbirinden bağımsız boolean kombinasyonları yerine
    discriminated union veya açık state enum’larıyla temsil edilmelidir.

### Mimari olmayan hedefler

Mevcut repository:

- genel amaçlı bir web sunucusu değildir;
- native bridge’i uzak web içeriğine açmayı hedeflemez;
- Linux için tamamen statik, dağıtımdan bağımsız binary vadetmez;
- MSI, MSIX, AppImage, DEB, RPM veya imzalı/notarize release pipeline’ı
  içermez;
- kullanıcı secret’ları için güvenli kasa görevi görmez;
- URL tabanlı router veya çok pencereli masaüstü modeli kullanmaz.

## 2. Sistem bağlamı

Validex iki kullanıcı yüzeyi sunar:

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         Validex Desktop                              │
│                                                                      │
│  React + TypeScript UI                                               │
│           │                                                          │
│           ▼                                                          │
│  frontend/src/lib/backend.ts                                         │
│           │ JSON IPC                                                 │
│           ▼                                                          │
│  internal/canbridge                                                  │
│           │                                                          │
│           ├────────► domain packages                                 │
│           └────────► platform adapters / native WebView              │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                         validex-cli                                  │
│                                                                      │
│  cmd/validex-cli ──► internal/cli ──► shared domain packages         │
└──────────────────────────────────────────────────────────────────────┘
```

Masaüstü uygulamasında React yalnız sunum ve kullanıcı etkileşiminden
sorumludur. HTTP çağrısı, OpenAPI parse/validation, mock server, SSE akışı ve
backend tanılaması Go tarafında çalışır. JSON Lab içindeki saf
metin dönüşümleri gibi işletim sistemi erişimi gerektirmeyen bazı araçlar
frontend içinde kalır.

CLI, WebView veya `internal/canbridge` kullanmaz. Collection Runner, network
inspector ve OpenAPI lint işlevlerini aynı Go domain paketlerinden çağırır.

## 3. Çalışma profilleri

### 3.1 Development desktop

`make dev` aşağıdaki çalışma topolojisini kurar:

```text
Vite dev server
127.0.0.1:34116..34215
        │
        │ CANBRIDGE_DEV_URL
        ▼
Go native process ──► system WebView ──► Vite origin
        │
        └──────────── JSON IPC bridge
```

Vite portu `34116` değerinden başlanarak en fazla 100 loopback portu içinde
seçilir. Native uygulama yalnız bu tanımlı development aralığındaki HTTP
loopback origin’ini kabul eder.

Frontend dizininde çalıştırılan
`cd cmd/validex/frontend && npm run dev` yalnız frontend’i çalıştırır. Bu mod UI
geliştirme fallback’lerini gösterebilir fakat gerçek native araçları sağlamaz.

### 3.2 Production desktop

Production build’de `cmd/validex/frontend/dist` Go executable içine gömülür:

```text
embedded dist
    │
    ▼
loopback asset server
127.0.0.1:34117 veya dinamik loopback port
    │
    ▼
system WebView
    │
    ▼
native IPC
```

`file://` kullanılmaz. Frontend gömülü olsa da sistem WebView’i onu process
içindeki sınırlı bir loopback HTTP sunucusundan yükler. Bu yaklaşım origin
kontrolünü ve web kaynaklarının standart yüklenme davranışını korur.

### 3.3 Headless CLI

CLI tek Go process’idir:

```text
shell / CI
    │
    ▼
cmd/validex-cli
    │
    ▼
internal/cli
    ├── internal/runner
    ├── internal/netinspector
    └── internal/openapilint
```

CLI sonucu human-readable veya JSON olarak yazar. Exit code sözleşmesi:

| Kod | Anlam |
| ---: | --- |
| `0` | İşlem ve kalite kapısı başarılı |
| `1` | Domain çalışması, assertion veya lint kalite kapısı başarısız |
| `2` | Komut, flag veya kullanım hatası |

`SIGINT` ve `SIGTERM` root context’i iptal eder. Runner ve network işlemleri bu
context’i aşağı katmanlara taşır.

## 4. Repository topolojisi

```text
validex/
├── cmd/
│   ├── validex/
│   │   ├── main.go                    # desktop composition root
│   │   ├── frontend/
│   │   │   ├── src/                   # React uygulaması
│   │   │   ├── public/                # frontend statik varlıkları
│   │   │   ├── scripts/               # development yardımcıları
│   │   │   └── dist/                  # üretilen/gömülen frontend
│   │   └── build/
│   │       ├── appicon.*              # kaynak ikonlar
│   │       ├── darwin/                 # macOS bundle metadata
│   │       ├── linux/                  # desktop entry template
│   │       ├── windows/                # Windows resource
│   │       └── bin/                    # yerel build çıktıları
│   └── validex-cli/
│       └── main.go                    # CLI composition root
├── internal/
│   ├── assertions/                    # saf assertion motoru
│   ├── canbridge/                     # desktop application adapter + IPC
│   ├── cli/                           # CLI command adapter
│   ├── core/                          # OpenAPI parse ve contract drift
│   ├── diagnostics/                   # backend/JVM/environment analizleri
│   ├── mockserver/                    # loopback mock HTTP server
│   ├── netinspector/                  # DNS ve redirect analizi
│   ├── openapilint/                   # bounded OpenAPI lint
│   ├── protocols/                     # bounded SSE istemcisi
│   └── runner/                        # collection runner
├── examples/                          # açıklayıcı geliştirici örnekleri
├── Makefile                           # development/build orchestration
├── collection.sample.json             # örnek collection
└── openapi.sample.yaml                # örnek OpenAPI
```

Build çıktısı, frontend `node_modules` ve diğer üretilen dosyalar mimari kaynak
olarak kabul edilmez.

## 5. Katmanlar ve bağımlılık yönü

```text
React features
      │
      ▼
frontend backend facade
      │ JSON IPC
      ▼
internal/canbridge
      ├──► internal/core
      ├──► internal/mockserver ──► internal/core
      ├──► internal/diagnostics
      ├──► internal/protocols
      ├──► internal/runner ──────► internal/assertions
      ├──► internal/netinspector
      └──► internal/openapilint

cmd/validex-cli
      ▼
internal/cli
      ├──► internal/runner ──────► internal/assertions
      ├──► internal/netinspector
      └──► internal/openapilint
```

Kurallar:

- `internal/canbridge` ve `internal/cli` application adapter’larıdır.
- Domain paketleri `canbridge`, frontend veya CLI import etmemelidir.
- Domain paketi kullanıcı dilindeki hata metnine bağımlı olmamalıdır. Stabil
  kod ve tipli hata üretmeli, kullanıcı mesajı adaptörde şekillenmelidir.
- Platforma özel kod yalnız build-tag veya platform dosyalarında kalmalıdır.
- Cross-domain davranış doğrudan iki UI bileşeni arasında kopyalanmamalı;
  uygun ortak domain paketine taşınmalıdır.
- Test edilebilir dış erişimler interface veya enjekte edilen fonksiyon
  arkasında tutulmalıdır.

### Paket sahiplik tablosu

| Paket | Sahip olduğu davranış | Sahip olmaması gereken davranış |
| --- | --- | --- |
| `canbridge` | IPC, lifecycle, DTO mapping, platform adaptasyonu | Tekrar kullanılabilir domain algoritması |
| `cli` | Argüman parse, çıktı, exit code | Runner/lint/network iş kurallarının kopyası |
| `core` | OpenAPI load ve contract drift | WebView, UI mesajları |
| `mockserver` | Route compile/match, server ve hit ring | React form state’i |
| `protocols` | Bounded SSE istemcisi | Tool ekranı düzeni |
| `diagnostics` | Read-only analiz ve karşılaştırma | Native file picker |
| `runner` | Collection parse/execute/report | CLI flag veya UI state’i |
| `assertions` | Assertion validate/evaluate | HTTP transport |
| `netinspector` | DNS ve redirect gözlemi | Komut satırı biçimlendirmesi |
| `openapilint` | Deterministik lint raporu | Dosya dialog’u |

## 6. Desktop composition root

`cmd/validex/main.go` yalnız `canbridge` build tag’iyle derlenir. Bu dosya:

- frontend `dist` dizinini `embed.FS` içine alır;
- uygulama ikonunu gömer;
- tek bir `canbridge.Bridge` oluşturur;
- pencere ID, başlık, boyut ve minimum boyutlarını tanımlar;
- development URL varsa debug modunu açar;
- `canbridge.Run` ile native event loop’u başlatır.

Doğrudan `go run ./cmd/validex` doğru desktop başlangıcı değildir; build tag
zorunludur. Makefile bu ayrıntıyı tek giriş noktasında toplar.

### Startup sırası

1. Production ise gömülü asset’ler için loopback listener açılır.
2. Development ise `CANBRIDGE_DEV_URL` doğrulanır.
3. İzin verilen frontend origin’i hesaplanır.
4. Process’e özel rastgele IPC capability üretilir.
5. Application lifecycle context’i oluşturulur ve `Startup(bridge)` çağrılır.
6. Platform uygulama metadata’sı hazırlanır.
7. Native WebView oluşturulur.
8. Native dispatch ve browser log binding’leri eklenir.
9. Güvenli browser runtime JavaScript’i enjekte edilir.
10. Pencere başlığı, boyutu ve minimum boyutu uygulanır.
11. WebView frontend URL’sine gider.
12. Native event loop çalışır.

### Shutdown sırası

1. IPC runtime yeni çağrılara kapanır.
2. Genel application context hemen iptal edilir; collection service ayrı
   context sahibi olduğu için kabul edilmiş persistence komutları korunur.
3. Collection `Load`/`Save` FIFO’su ile collection dışı concurrent IPC çağrıları
   aynı üç saniyelik kapanış penceresinde bounded biçimde drain/join edilir.
4. Collection drain süresi aşılırsa persistence context’i iptal edilir ve
   runtime worker’ı beklemeyi bırakır; concurrent çağrı süresi aşılırsa runtime
   bu çağrıyı loglayıp beklemeyi bırakır.
5. `Shutdown(bridge)` kalan request/tool cancel kayıtlarını temizler,
   collection service’i durdurur ve mock server’ı en fazla üç saniyede kapatır.
6. Native WebView yok edilir.
7. Production asset server iki saniyelik timeout ile kapatılır.

Bu sıra değiştirilirken in-flight callback’lerin kapatılmış WebView’a sonuç
göndermemesi ve mock listener’ın process kapanışından sonra açık kalmaması
korunmalıdır. Runtime kapandıktan sonra `deliver` callback’i sessizce düşürür.
Context dinlemeyen işletim sistemi I/O’su veya başka bir concurrent operasyon
arka planda geç dönebilir; uygulama kapanışı bu goroutine’i sınırsız beklemez.

## 7. Production asset server

`internal/canbridge/asset_server.go` yalnız gömülü frontend’i sunar.

Güvenlik ve davranış kuralları:

- Listener yalnız IPv4 loopback’e bind edilir.
- Tercih edilen port `34117`, doluysa işletim sistemi dinamik loopback portu
  seçer.
- `Host` header listener host’u ile tam eşleşmelidir.
- Yalnız `GET` ve `HEAD` desteklenir.
- URL path normalize edilir.
- Yalnız gerçekten var olan gömülü dosyalar sunulur.
- Bilinmeyen route için SPA fallback yapılmaz.
- `Cache-Control: no-store` kullanılır.
- `X-Content-Type-Options: nosniff` gönderilir.
- HTTP server için `ReadHeaderTimeout` tanımlıdır.

URL router kullanılmadığı için SPA fallback gerekmemektedir. Gelecekte URL
router eklenirse fallback davranışı güvenlik testiyle birlikte ayrıca
tasarlanmalıdır.

## 8. Native IPC sınırı

### 8.1 Çağrı yolu

```text
React feature
  → frontend/src/lib/backend.ts
  → window.canbridge.Bridge.Method(...)
  → browser runtime Promise/callback registry
  → native dispatch(capability, callbackId, method, JSON args)
  → ipcRuntime.dispatch
  → Bridge.Invoke
  → typed Bridge adapter method
  → domain package
  → Go DTO
  → JSON ipcResponse
  → WebView.Dispatch + Eval
  → window.__canbridgeReceive
  → Promise resolve/reject
```

### 8.2 Yayınlama kuralları

Bridge herhangi bir exported Go metodunu otomatik yayınlamaz.
`internal/canbridge/invoke.go` iki ayrı açık kontrol uygular:

1. `bridgeMethodRegistry` browser tarafına sunulacak isim ve execution
   policy’nin tek allowlist’idir; `bridgeMethodNames` bu registry’den üretilir.
2. `Bridge.Invoke` switch’i her metodun argüman sayısını ve tipini açıkça
   decode eder.

Yeni metodun yalnız Go struct üzerinde exported olması frontend’den
çağrılabilmesi için yeterli değildir. Yeni metod registry’ye eklenirken
`concurrent` veya `collectionLibrarySerial` çalışma politikası bilinçli
seçilmelidir.
Collection `Load` ve `Save` aynı single-consumer kuyruğu kullanır; kabul sırası
goroutine scheduler’a bırakılmaz. Serial policy seçilen her descriptor typed
`BusyResult` factory’si de sağlamalıdır; registry contract testi bunu korur.

### 8.3 IPC güvenlik kontrolleri

- Her process açılışında `crypto/rand` ile 32 byte capability üretilir.
- Capability constant-time karşılaştırmayla kontrol edilir.
- Development origin’i yalnız loopback HTTP ve `34116–34215` port aralığıdır.
- Production origin’i process’in açtığı asset listener’dan türetilir.
- Browser runtime bridge’i yalnız tam origin eşleşmesinde kurar.
- Düşük seviye native binding’ler public global alandan kaldırılır.
- Callback ID en fazla 256 karakterdir.
- Metod adı en fazla 128 karakterdir.
- JSON argüman paketi en fazla 32 MiB’tır.
- Panic IPC sınırında yakalanıp transport hatasına dönüştürülür.
- Browser log level’i 16 karakter, mesajı 16 KiB ile sınırlıdır.

Bu kontroller native bridge’i genel ağa güvenli bir RPC servisi yapmaz. Temel
varsayım, aynı process içindeki beklenen loopback frontend’in güvenilir
olmasıdır. WebView uzak bir URL’ye navigate ettirilmemelidir.

### 8.4 Result ve rejection ayrımı

Beklenen domain başarısızlıkları çoğunlukla şu modele döner:

```ts
type OperationResult<T> = {
  data?: T;
  error?: UserError;
};
```

IPC decode hatası, kayıtlı olmayan metod, panic veya runtime kapanışı gibi
boundary hataları Promise rejection üretir. Feature katmanı bu iki yolu ayrı
ele almalıdır:

- result içindeki `error`: kullanıcıya gösterilebilir kontrollü hata;
- rejected Promise: bridge/runtime arızası, güvenli fallback mesajı ve teknik
  ayrıntı.

Collection serial kuyruğunun dolması beklenen backpressure durumudur ve
transport rejection değildir. Dispatch aynı callback’e
`collection_library_busy` kodlu kontrollü `LoadResult`/`SaveResult` gönderir.

`ipcRuntime.deliver` ile WebView kapanışı iki ayrı gate kullanır:
`viewDispatchMu` callback planlama çağrısını, `viewEvalMu` ise gerçekten
çalışan `Eval` çağrısını korur. İki gate gereklidir; test WebView’ı callback’i
senkron, native WebView asenkron çalıştırabilir. `close` yeni planlamayı kapatır,
aktif `Eval` bitene kadar bekler; daha önce planlanıp henüz başlamamış callback
`closed` kontrolünde düşer. Böylece bounded worker shutdown uğruna kaldırılan
global/unbounded `concurrentCalls.Wait`, kapatılmış WebView’a erişim yarışına
dönüşmez.

Mevcut result tipleri tam bir ortak generic union kullanmamaktadır. Yeni veya
yeniden düzenlenen sözleşmelerde aşağıdaki discriminated union tercih
edilmelidir:

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: UserError };
```

Bu örnek gelecek yönüdür; mevcut Go ve TypeScript DTO’larını tek taraflı
değiştirerek uygulanmamalıdır.

## 9. Bridge state ve lifecycle

`internal/canbridge.Bridge` masaüstü oturumu boyunca yaşayan stateful
application service’tir.

| State | Sorumluluk | Yaşam süresi |
| --- | --- | --- |
| `ctx` | Native runtime ve file picker parent context’i | Uygulama oturumu |
| `lifecycleCtx` | Bütün operasyonların parent context’i | Startup–Shutdown |
| `cancels` | Request ID → cancel | Request tamamlanana kadar |
| `toolCancels` | Operation ID → cancel | Tool tamamlanana kadar |
| `specs` | Spec ID → OpenAPI endpoint graph’ı | En fazla 8 import |
| `specOrder` | OpenAPI eviction sırası | Uygulama oturumu |
| `mock` | Tek mock server instance’ı | Uygulama oturumu |
| `observed` | Method/path hit sayısı | En fazla 10.000 anahtar |
| `filePicker` | Platform dialog adapter’ı | Uygulama oturumu |
| `collectionLibrary` | Saved-request application service, bağımsız drain context’i | Uygulama ömrü |

Bridge’in genel paylaşılan state’i `Bridge.mu` ile korunur. Collection service
kendi operation ve lifecycle mutex’lerine sahiptir; filesystem repository de
kendi process-içi mutex’ini taşır. Cancellation kayıtları silinirken
yalnız anahtar eşleşmesine değil operation nesnesinin kimliğine de bakılır. Bu,
eski bir goroutine cleanup’ının aynı ID ile daha sonra başlayan yeni işlemi
silmesini önler.

OpenAPI cache, mock state ve coverage state process belleğindedir; uygulama
yeniden açıldığında geri yüklenmez.

Collection domain state’i Bridge belleğinde tutulmaz; native app-data
dosyasından yüklenir. `collectionLibraryService` yalnız optimistic concurrency
için son revision’ı ve lifecycle context’ini taşır. Bridge burada Facade’dır.
`Startup` collection context’ini `context.WithoutCancel(appContext)` üzerinden
kurar; bu bilinçli ayrım genel IPC iptal edilirken kabul edilmiş save’lerin
drain olmasını sağlar. Context’in gerçek bitiş sahibi queue timeout’u veya
`Shutdown` içindeki service `Stop` çağrısıdır.
IPC runtime collection load/save çağrılarını ayrı bounded serial queue
üzerinden işler; normal request/tool çağrıları bağımsız goroutine modelini
kullanmaya devam eder.

## 10. Frontend mimarisi

### 10.1 Teknoloji yığını

| Alan | Teknoloji |
| --- | --- |
| UI runtime | React 19 |
| Dil | TypeScript 5.9, strict mode |
| Build | Vite 8 |
| Global state | Zustand |
| Formlar | React Hook Form |
| Accessible primitives | Radix UI |
| Büyük metin editörü | Monaco Editor |
| İkonlar | Lucide |
| Test | Vitest, jsdom, React Testing Library |

TypeScript `strict`, `isolatedModules` ve `noEmit` ile kontrol edilir. Vite
production build sourcemap üretir ve React runtime’ını ayrı chunk’a ayırır.

### 10.2 Başlatma ağacı

```text
index.html
  └── main.tsx
      └── React.StrictMode
          └── LocaleProvider
              └── Tooltip.Provider
                  └── App
                      ├── bootstrap loading/error/retry
                      └── AppShell
```

`App` önce tema tercihini uygular, sonra `useBootstrap` ile native başlangıç
verisini ister. Bootstrap tamamlanmadan workspace render edilmez. Loading,
detayları açılabilir hata ve retry tek sınırda tutulur.

### 10.3 Shell ve navigasyon

Frontend URL router kullanmaz. Aktif ekran `WorkspaceView` union’ı ve Zustand
store içindeki `activeView` ile belirlenir.

```text
AppShell
├── TopBar
├── Application body
│   ├── ActivityBar
│   ├── Requests workspace
│   │   ├── Sidebar
│   │   ├── RequestTabs veya WelcomeWorkspace
│   │   ├── RequestWorkbench
│   │   └── ContextPanel
│   └── Lazy tool workspaces
│       ├── MockServerLab
│       ├── JSONLab
│       ├── DiagnosticsLab
│       ├── ProtocolLab
│       └── AutomationLab
├── StatusBar
└── CommandPalette
```

Tool metadata’sı `app/workspaceRegistry.ts` içindeki
`workspaceDefinitions` kaynağında tutulur. Activity Bar ve Command Palette
aynı registry’yi tüketir.

Requests workspace uygulamanın ana, eager yüklenen akışıdır. Diğer tool
bileşenleri lazy import edilir. Tool ilk açıldığında `visitedToolViews`
listesine eklenir; daha sonra workspace değişiminde unmount edilmek yerine
`hidden` tutulur. Böylece feature-local form ve sonuç state’i ekranlar arası
geçişte korunur.

Bu davranışın bedeli, ziyaret edilen bütün tool’ların uygulama kapanana kadar
DOM/state belleğinde kalmasıdır. Büyük yeni tool’lar eklenirken state koruma
gereksinimi ile bellek maliyeti birlikte değerlendirilmelidir.

### 10.4 Responsive düzen

Requests ekranı sol sidebar, merkez workbench ve sağ context panelinden oluşur.
AppShell container genişliğini ölçerek:

- sol ve sağ panel genişliklerini sınırlar;
- merkez alan için minimum genişliği korur;
- response panelinin vertical/horizontal yönüne göre hesap yapar;
- dar ekranda yan panelleri overlay’e dönüştürür.

Resize separator’ları pointer ve klavyeyle kullanılabilir; ARIA min/max/current
değerlerini taşır. Ana breakpoint’ler `1180`, `900`, `600`, `480` ve `380`
pikseldir.

Tema token’ları `styles.css` başındaki CSS custom property’lerinde tanımlıdır.
`useResolvedTheme`, `system | light | dark` tercihini işletim sistemi temasıyla
birleştirir. Reduced-motion tercihi desteklenir.

### 10.5 State domain’leri

Frontend state’i iki ayrı Zustand domain’ine ayrılır:

| Store | Source of truth olduğu alan |
| --- | --- |
| `useWorkspaceStore` | Açık/kapalı tab taslakları, çalışma alanı ve panel tercihleri |
| `useCollectionLibraryStore` | Kullanıcının kalıcı request koleksiyonları ve kayıtlı request tanımları |

`useWorkspaceStore` sorumlulukları:

- environment ve kullanıcı override variable’ları;
- açık request tabları ve aktif tab;
- en fazla 10 recently-closed tab;
- panel görünürlüğü, boyutları ve response yönü;
- aktif workspace;
- tema ve command palette;
- sidebar bölümü;
- oturumdaki son OpenAPI import metadata’sı.

Request tab varsayılanları tek factory’de üretilir. Tek-tab close aksiyonu
dirty/running kontrolünü store’da uygular; pinned tek-tab kapatma kuralı
`RequestTabs` UI’sındadır. Bulk close store aksiyonları pinned, dirty ve running
tabları korur. Recently-closed listesi de store tarafından yönetilir.

`useCollectionLibraryStore` iki açık model taşır:

```text
RequestCollection
├── id, name
├── createdAt, updatedAt
└── sortOrder

SavedRequest
├── id, collectionId, name
├── method, url, headers, body
├── createdAt, updatedAt
└── sortOrder
```

Bu model automation ekranındaki runner `CollectionRunInput`/`Collection`
modeliyle aynı şey değildir. Saved-request library, düzenleme ve tekrar açma
için kalıcı bir katalogdur. Runner collection ise variable, assertion ve
execution sırası taşıyan çalıştırılabilir bir test tanımıdır. Benzer adlar
katmanlar arasında birbirinin yerine kullanılmamalıdır.

### 10.6 Persistence

Workspace taslağı Zustand `persist` middleware’iyle `localStorage` kullanır:

| Özellik | Değer |
| --- | --- |
| Anahtar | `validex:workspace:validex-workspace` |
| Şema sürümü | `7` |
| Strateji | Allowlist `partialize` + migration + sanitize |

Persist edilmeyen request alanları:

- `running`;
- `error` ve user error;
- response;
- runtime OpenAPI contract referansı;
- diğer transient execution state’i.

Secret isimli environment variable’ları persist edilmez. Secret header değeri
yalnız güvenli bir `{{variable}}` referansıysa korunur; doğrudan secret değer
temizlenir ve header devre dışı bırakılır.

Önemli sınır: secret algılama anahtar adına dayalı heuristic’tir. URL query veya
body içine yazılan credential otomatik secret sayılmaz. `localStorage` güvenli
secret vault değildir.

`latestImportedSpec` global state içinde olsa da persistence allowlist’inde
değildir. OpenAPI uygulama yeniden açıldığında tekrar import edilmelidir.

Saved-request library farklı dayanıklılık gereksinimine sahiptir:

| Özellik | Değer |
| --- | --- |
| Frontend anahtarı | `validex:collection-library` |
| Şema sürümü | `1` |
| Native dosya | `os.UserConfigDir()/Validex/collection-library.json` |
| Belge | `{ "state": {…}, "version": 1 }` |
| Ham belge sınırı | 15 MiB |
| Yazma | Aynı dizinde temporary file, file sync ve atomic replace; Unix’te data + parent directory sync |
| Eşzamanlılık | Process’ler arası file lock + SHA-256 revision/CAS |
| IPC sırası | `Load` + `Save` için en fazla 128 komut/64 MiB tutan bounded serial queue |
| Kapanış | 3 saniye drain; sonra persistence context iptal edilir ve runtime beklemeyi bırakır |

Native repository ham versioned JSON’u saklar; frontend şemanın sahibidir.
Go katmanı belge boyutunu, JSON wrapper’ını, pozitif version’ı ve object
`state` alanını sınırda doğrular. Frontend hydration ise collection/request
alanlarını normalize eder, orphan request’leri düşürür, duplicate ID’lerde ilk
geçerli kaydı korur ve desteklediğinden yeni bir version’ı açmayı reddeder.
Böylece eski binary bilinmeyen yeni alanları sessizce silip dosyanın üstüne
yazamaz.

Unix benzeri sistemlerde app-data dizini `0700`, dosya ve lock file `0600`
oluşturulur. Windows’ta replace `MoveFileEx(REPLACE_EXISTING |
WRITE_THROUGH)` ile yapılır; POSIX mode bitleri Windows ACL garantisi değildir,
erişim sınırı kullanıcıya ait config dizinine dayanır. Parent config yolunun
işletim sistemi/user profile tarafından güvenilir sağlandığı varsayılır.

#### 10.6.1 Native Go pattern sınırları

Native persistence büyük bir `Bridge` metodu değildir. Sorumluluk zinciri
bilinçli olarak aşağıdaki pattern’lere ayrılır:

```text
Bridge facade
  → collectionLibraryService           Application Service
      ├── revision + lifecycle          optimistic concurrency owner
      └── collectionLibraryRepository   Repository port
          └── file adapter
              └── collection_filesystem_{unix,windows,other}
                                          platform Strategy

ipcRuntime
  → bridgeMethodRegistry                command metadata/policy registry
  → ipcSerialInvocationQueue            bounded single-consumer command queue
```

| Dosya | Tek ana sorumluluk |
| --- | --- |
| `collection_library.go` | IPC DTO’ları, stabil collection error constant’ları ve ince Bridge Facade |
| `collection_library_service.go` | Load/Save use-case’i, revision sahipliği, lifecycle ve güvenli `UserError` mapping |
| `collection_library_repository.go` | Repository portu, validated-document/snapshot/commit value object’leri ve file adapter |
| `collection_filesystem_*.go` | Platform lock/replace/directory-sync Strategy implementasyonu |
| `invoke.go` | Merkezi IPC method constant’ları, açık registry/policy ve typed argument dispatch |
| `ipc_serial_queue.go` | Kapasite, FIFO worker, item-level panic isolation ve bounded drain |

`collectionLibrarySnapshot` positional `(data, revision, found)` tuple’ı yerine
okuma sonucunu isimlendirir. `collectionLibraryCommit{Revision, Published}` ise
önemli bir partial-commit durumunu görünür yapar: atomic replace tamamlandıktan
sonra directory sync hata verebilir. Bu durumda kullanıcıya save başarısız
döner, fakat service revision’ı ilerletir; retry kendi yazdığı dosyayla yanlış
conflict üretmez.

`collectionLibraryDocument` private alanlı validated value object’tir. Service
JSON wrapper’ı bir kez parse eder ve repository yalnız bu tipi kabul eder.
Böylece 15 MiB payload application ve infrastructure katmanlarında iki kez
parse edilmez; yeni repository adapter’ı da doğrulanmamış string alamaz.

Service operation mutex’i repository çağrılarını process içinde serialize
eder. Bu mutex tek başına kabul sırasını garanti etmez; bu nedenle IPC
registry’de hem `LoadCollectionLibrary` hem `SaveCollectionLibrary`
`collectionLibrarySerial` policy’sindedir. Queue kapasitesi yalnız bekleyen
komutları sayar; o anda çalışan komut 128 kayıt/64 MiB bütçesine dahil değildir.
Kapasite aşımı kullanıcıya retry edilebilir `collection_library_busy` sonucu
olarak döner. Worker her invocation panic’ini item sınırında recover edip loglar
ve sonraki kabul edilmiş komutla devam eder; tek bozuk callback bütün FIFO’yu
terk edemez.

Frontend’in ilk mutation’dan önce hydration `Load` çağrısını tamamlaması
zorunlu invariant’tır. Service ilk `Save` sırasında revision bilinmiyorsa lock
altında head’i kontrol eder: dosya yoksa `missing` revision ile ilk create’e
izin verir; mevcut snapshot varsa onu sessizce sahiplenmez ve
`collection_library_not_loaded` döndürür. Caller önce `Load` etmelidir. İleride
revision frontend DTO’suna taşınırsa `LoadResult.revision` →
`Save(expectedRevision)` protokolü Go ve TypeScript tarafında tek değişiklik
olarak tasarlanmalıdır.

Belge doğrulamada iki ayrı sentinel kullanılır:

- `errInvalidCollectionLibraryDocument`: frontend’den gelen payload geçersiz;
- `errCorruptCollectionLibraryDocument`: diskte okunan payload geçersiz.

Bu ayrım bozuk diskin `collection_library_invalid` sanılmasını ve yanlış
recovery davranışını önler. Corruption nedeni ve beklenmeyen repository
hataları yalnız native log’a gider; filesystem path veya platform hata detayı
`UserError` DTO’suna taşınmaz. Conflict/invalid gibi beklenen branch’ler log
gürültüsü üretmez.

Native yazma her snapshot için durable acknowledgement döndürür. UI ancak bu
acknowledgement başarılıysa request tabını clean ve “Kaydedildi” durumuna
geçirir. Yazma başarısızsa in-memory kayıt korunur, tab dirty kalır ve
persistence hatası görünür olur. Art arda gelen snapshot’lar browser
Promise kuyruğunda bekletilmez; FIFO kapasitesi elverdiği sürece native kuyruğa
teslim edilir. Kuyruk dolarsa bridge kontrollü `collection_library_busy`
sonucu döndürür ve frontend kaydı dirty tutar. Runtime kapanırken kabul edilmiş
FIFO işleri en fazla üç saniye drain edilir; süre dolunca persistence context
iptal edilir ve runtime worker’ı beklemeyi bırakır. Context-aware lock bekleyişi
hızla döner; context dinlemeyen filesystem çağrısı geç tamamlansa bile WebView
callback’i kapalı runtime tarafından düşürülür.

İki Validex instance aynı dosyayı açabilir. Her collection application service
son yüklediği/başarıyla commit ettiği revision’ı taşır. Repository file lock
altında mevcut revision’ı karşılaştırır; stale instance
`collection_library_conflict` alır ve başka pencerenin verisini ezmez.
Conflict durumunda library mutation kontrolleri read-only olur; kullanıcı
güncel state’i yeniden yüklemek için pencereyi yeniden başlatır. Normal
çalışmada lock bekleyişinin kendi üst sınırı beş saniyedir.

Collection adapter hata kodları transport string’lerine göre dallanmak yerine
Go named constant’larıyla tanımlanan sabit contract değerleridir:

| Kod | Anlam |
| --- | --- |
| `collection_library_corrupt` | Diskteki belge wrapper doğrulamasını geçmedi |
| `collection_library_invalid` | Frontend geçersiz/boyutu aşan belge göndermeye çalıştı |
| `collection_library_busy` | Native serial queue kapasitesi geçici olarak doldu |
| `collection_library_not_loaded` | Mevcut snapshot görülmeden blind save denendi |
| `collection_library_read_failed` | App-data/lock okuması başarısız |
| `collection_library_write_failed` | Temporary write, sync veya replace başarısız |
| `collection_library_conflict` | Application service revision’ı diskteki revision’dan eski |

`collectionLibraryStorage.ts` hydration ve persistence state machine’ini
`loading | saving | ready | error` olarak yayınlar. `hydrated=true` yalnız
Zustand parse, migrate ve merge tamamlandıktan sonra verilir. AppShell bu
işaretten önce saved request bağlantılarını reconcile etmez; Save, Save As ve
linked rename işlemleri de bloklanır. Bu kural boş başlangıç state’inin henüz
yüklenmemiş native dosyanın üstüne yazmasını engeller.

Doğrudan Vite/browser geliştirmesinde native Bridge yoksa aynı versioned belge
`localStorage` fallback’inde tutulur. Native uygulama ilk açılışta dosya yoksa
bu origin kaydını okur; yalnız native commit doğrulandıktan sonra fallback
anahtarını kaldırır. Bu migration domain verisi içindir. Collection
expand/collapse tercihi ise disposable UI state olduğu için
`validex:collection-library:view` anahtarında kalır ve büyük native belgeyi her
chevron tıklamasında yeniden yazdırmaz.

Saved request persistence secret vault değildir. Secret isimli header:

- yalnız tamamen güvenli `{{variable}}` referansıysa kaydedilir;
- literal değer içeriyorsa library kopyasında boşaltılır ve devre dışı kalır;
- açık tabdaki raw taslak korunur, dirty kalır ve kullanıcıya Variables
  referansı kullanması gerektiği bildirilir.

URL ve body içerikleri plaintext uygulama verisidir; otomatik credential
scanner yoktur. Credential değerleri Variables üzerinden referanslanmalıdır.

### 10.7 Saved request yaşam döngüsü

Bir request için iki ayrı kimlik vardır:

| Kimlik | Anlam |
| --- | --- |
| `RequestTab.id` | O an açık olan editör sekmesinin geçici kimliği |
| `savedRequestId` | Native library’deki kalıcı request kaydının kimliği |

`collectionId`, bağlı kaydın mevcut parent koleksiyonunu gösterir. Tab açma ve
recently-closed reopen işlemleri `savedRequestId` ile deduplicate edilir;
aynı kalıcı request iki farklı tab ID’siyle açılmaz. Duplicate Tab işlemi yeni
bir taslak üretir ve iki kalıcı kimlik alanını temizler.

```text
Collection row click
  → SavedRequest snapshot
  → openTab(savedRequestId, collectionId, definition)
  → existing savedRequestId varsa yalnız focus

Save / Save As
  → form snapshot
  → store sanitize + upsert
  → native FIFO write
  → durable acknowledgement
  → tab clean veya explicit dirty/error
```

Library değiştiğinde AppShell tek reconciliation sahibidir ve hem açık hem
recently-closed tabları işler:

- clean tabda library request tanımı source of truth’tür;
- dirty tabın method/URL/body/header taslağı korunur;
- move/rename metadata değişikliği response’u geçersiz kılmaz;
- method/URL/body/header değişikliği clean tabın eski response/error state’ini
  temizler;
- silinmiş request’e bağlı tab ilişkisiz dirty taslağa dönüşür;
- saved request yeniden adlandırma library ile tab adını aynı işlemde tutar.

Request Workbench’te Params yalnız query parametrelerini, Variables yalnız
template/environment değerlerini gösterir. Headers ve Body ayrı tablarda
kalır. Bu ayrım aynı veriyi birden fazla panelde tekrarlamadan request ekranı
yoğunluğunu azaltır. Save ana aksiyonda, Save As ise send split menüsündedir;
`Ctrl/Cmd+S` yalnız aktif Requests görünümünde, request çalışmıyorken ve modal
yokken işler.

### 10.8 Frontend native facade

Frontend’de native erişimin tek kapısı `src/lib/backend.ts` olmalıdır. Feature
bileşenleri doğrudan `window.canbridge` çağırmamalıdır.

Facade şu işleri yapar:

- native PascalCase metodları frontend camelCase API’sine çevirir;
- browser-only development için bootstrap fallback’i sağlar;
- seçili native DTO’ları feature’a ulaşmadan normalize eder;
- runtime-yok fallback semantiğini metoda göre uygular: bazı metotlar
  yapılandırılmış sonuç, cancel metotları `false`, bootstrap ve bazı state
  okumaları ise exception üretir;
- bridge implementasyon ayrıntılarını UI’dan gizler.

Collection library için facade `loadCollectionLibrary` ve
`saveCollectionLibrary` metodlarını sunar. Feature/store kodu
`window.canbridge` yüzeyine doğrudan erişmez; native capability kontrolü ve
browser-development fallback seçimi persistence adapter’ında facade üzerinden
yapılır.

Native API yüzeyi `CanbridgeAPI` interface’iyle tanımlıdır. Go ve TypeScript
DTO’ları şu anda manuel olarak paralel tutulur; değişiklik iki tarafta ve
contract testlerinde birlikte yapılmalıdır.

### 10.9 Boundary normalization

`src/lib/bridge-contract.ts`, zorunlu collection alanlarını normalize eder.
Örnekler:

- OpenAPI endpoint ve tag listeleri;
- finding ve route listeleri;
- mock hits;
- mock route header map’leri ile SSE header alanları;
- SSE event listeleri;
- Actuator metric/delta map’leri;
- diagnostics sonuç collection’ları.

Normalizer tam runtime schema validator değildir. Ana görevi eski native
binary, hata DTO’su veya version skew nedeniyle gelen `null` collection’ın UI
render’ını kırmasını önlemektir. Normal HTTP `SendResult/ResponseEnvelope`
şu anda bu normalizer’dan geçmez.

### 10.10 Async hook katmanı

Harici query/cache kütüphanesi yoktur. `src/lib/queries.ts` küçük bir hook
katmanı sağlar.

`useBootstrap`:

- eşzamanlı bootstrap çağrılarını aynı Promise üzerinde birleştirir;
- ilk hata sonrası bir kez tekrar dener;
- unmount sonrası state yazmaz;
- request version ile stale sonucun güncel sonucu ezmesini önler.

`useMutation`, tek boolean yerine aktif mutation sayısını takip eder. Birden
fazla çağrı varken ilk tamamlanan işlem loading state’ini yanlışlıkla
kapatamaz.

Bootstrap, request gönderme, OpenAPI import ve request cancellation hook
facade’ı kullanır. Bazı tool lab’leri backend facade’ını doğrudan çağırır.

### 10.11 Feature klasörleri

Her feature mümkün olduğunca aşağıdaki yapıyı izler:

```text
features/<feature>/
├── <Feature>Lab.tsx       # UI ve orchestration
├── model.ts               # saf parse/validation/view model dönüşümleri
├── *.test.ts              # saf model testleri
└── *.test.tsx             # UI/async davranış testleri
```

Saf algoritmalar DOM veya native backend gerektirmeden test edilebilmelidir.
Paylaşılan görsel primitive’ler `src/shared/ui` altında tutulur. Yeni feature
mevcut Button, IconButton, ToolPage, ToolTabs, ToolNotice, EmptyState ve benzeri
primitive’leri yeniden kullanmalıdır.

### 10.12 i18n

Desteklenen locale listesi `["tr", "en"] as const` kaynağından türetilir.
İngilizce katalog `TranslationKey` kaynağıdır; Türkçe katalog aynı anahtarları
derleme zamanında taşımak zorundadır.

Mesajlar domain’e göre ayrılır:

- `messages/core.ts`;
- `messages/requests.ts`;
- `messages/automationTools.ts`;
- `messages/diagnosticsProtocols.ts`.

Locale seçim sırası:

1. `validex.locale` localStorage değeri;
2. `navigator.languages`;
3. İngilizce varsayılan.

Yeni kullanıcı metni component içine sabit yazılmamalı; ilgili mesaj modülüne
TR ve EN değerleriyle eklenmelidir.

## 11. Request workspace uçtan uca akışı

```text
Zustand RequestTab
  → React Hook Form
  → requestFormResolver
  → bootstrap environment defaults + Zustand environment overrides
  → backend.sendRequest
  → Bridge.SendRequest
  → net/http + httptrace
  → SendResult
  → optional contract validation
  → Zustand response/error
  → ResponsePanel
```

### 11.1 Frontend doğrulama

Frontend şu kontrolleri bridge çağrısından önce yapar:

- method merkezi allowlist içinde mi;
- URL açık `http://` veya `https://` ile başlıyor mu;
- URL whitespace, user-info veya fragment içeriyor mu;
- header şekli geçerli mi;
- timeout izin verilen aralıkta mı;
- `{{variable}}` referanslarının değeri var mı.

HTTP metodları `lib/http.ts` içindeki tek `as const` tuple’dan türetilir. Type,
dropdown ve mock form seçenekleri aynı kaynağı kullanır. Yeni method ayrı
string listelerine eklenmemelidir.

### 11.2 Backend request davranışı

`Bridge.SendRequest`:

1. Timeout’u `1–300.000 ms` arasında doğrular.
2. ID boşsa üretir.
3. URL variable’larını çözer.
4. Mutlak HTTP/HTTPS URL, host, userinfo ve fragment kurallarını doğrular.
5. Aynı ID ile çalışan request’i reddeder.
6. Lifecycle context’ten request timeout context’i türetir.
7. Body variable’larını desteklenen methodlarda çözer.
8. Etkin header’ları ekler.
9. Kullanıcı eklemediyse Go varsayılan `User-Agent` değerini bastırır.
10. Otomatik compression’ı kapatır.
11. Redirect’i otomatik takip etmez.
12. `httptrace` ile DNS, connect, TLS ve TTFB zamanlarını toplar.
13. Body’yi en fazla 16 MiB okur.
14. Cookie, TLS özeti, remote address ve trace ID çıkarır.
15. Method/path coverage kaydını günceller.
16. JSON body’yi bütçe içinde pretty-print eder.

Mevcut desktop request motoru body’yi yalnız `POST`, `PUT`, `PATCH` ve `DELETE`
için gönderir. Runner ile davranış genişletilirken iki motor arasındaki bu fark
bilinçli biçimde ele alınmalıdır.

### 11.3 Cancellation

Request tab ID operasyon ID’si olarak kullanılır. `CancelRequest(id)` ilgili
context’i iptal eder. Request bittiğinde cancel kaydı identity check ile
temizlenir. Uygulama Shutdown’ı bütün request’leri iptal eder.

### 11.4 Contract ikinci aşaması

OpenAPI endpoint’inden açılmış request bir HTTP transport response’u aldıysa
frontend ikinci bir bridge çağrısıyla contract validation ister; HTTP `4xx` ve
`5xx` yanıtları da sözleşmede tanımlı olabilir. Gönderilen URL artık import
edilen template path ile eşleşmiyorsa frontend sonucu `operation_changed`
olarak işaretler. Normal MethodSelect değişiminde OpenAPI bağlantısı form
akışında önceden temizlenir. Bridge’e farklı method/path ile doğrudan contract
isteği ulaşırsa backend `operation_unavailable` döndürebilir. Contract sonucu
response panelindeki ayrı sekmede gösterilir.

Mevcut `running` boolean’ı hem request gönderimi hem contract kontrolü gibi
farklı aşamaları yeterince ayrıntılı ifade etmez. Gelecek düzenlemede önerilen
model:

```ts
type RequestExecution =
  | { kind: "idle" }
  | { kind: "sending"; requestId: string }
  | { kind: "validating_contract"; requestId: string }
  | { kind: "canceling"; requestId: string };
```

## 12. OpenAPI mimarisi

### 12.1 Import

```text
native file picker
  → core.LoadOpenAPI
  → bounded read
  → kin-openapi parse + validation
  → endpoint extraction
  → Bridge in-memory spec cache
  → lightweight ImportedEndpoint DTO
  → frontend store/sidebar
```

Kurallar:

- dosya en fazla 16 MiB;
- en fazla 10.000 operation;
- tag collection’ları non-null;
- cache en fazla 8 spec;
- en eski spec yeni importta düşürülür;
- cache yalnız process belleğinde tutulur.

Frontend, sidebar için yalnız hafif endpoint metadata’sını alır. Gerçek schema
graph’ı Go cache’inde kalır; contract kontrolünde `specId` ile bulunur.

### 12.2 Endpoint’ten request üretme

Sidebar endpoint’i açarken:

- kararlı tab ID üretir;
- server URL ve OpenAPI path parametrelerini `{{variable}}` biçimine çevirir;
- `specId` ve template path contract metadata’sını taba ekler; method
  `RequestTab.method` alanında tutulur.

Büyük endpoint listesi sabit satır yüksekliğiyle basit virtual rendering
kullanır.

### 12.3 Contract drift

`ValidateOpenAPIResponse`:

1. `specId` ile cache’i bulur.
2. Method ve template path’e exact eşleşme yapar.
3. Status response’unu, yoksa `default` response’u seçer.
4. Gerçek `Content-Type` için en uygun JSON media type’ı belirler.
5. JSON’u sayısal hassasiyeti koruyarak decode eder.
6. Schema graph’ında bounded traversal yapar.
7. Deterministik finding listesi döndürür.

Traversal required property, additional property, enum, type ve scalar
constraint’leri; ayrıca `allOf`, `oneOf`, `anyOf` kombinasyonlarını ele alır.
Circular graph active-visit set’iyle kesilir. Sayısal karşılaştırmalarda
`big.Rat` kullanılır.

Finding üst sınırı 1.000’dir. Depth, node ve toplam metin bütçesi aşıldığında
sonuç `Truncated=true` ve `OK=false` olur.

### 12.4 Lint

`internal/openapilint` parse/schema hataları yanında:

- eksik veya duplicate `operationId`;
- eksik summary;
- eksik tag;
- eksik response;
- eksik 2xx response;
- JSON response schema/example eksikleri

gibi deterministik kalite kuralları üretir.

Lint ağdan veya komşu dosyalardan `$ref` indirmez. Multi-file sözleşme önce tek
YAML/JSON belge halinde bundle edilmelidir.

## 13. Mock Server mimarisi

Uygulama oturumu tek `mockserver.Server` instance’ına sahiptir.

Bridge yüzeyi:

- state snapshot alma;
- route tablosunu değiştirme;
- server başlatma/durdurma;
- hit geçmişini temizleme;
- OpenAPI’den route import etme.

### 13.1 Route compile kuralları

- ID zorunlu ve benzersizdir.
- Method geçerli HTTP token’dır.
- Path `/` ile başlar; query ve fragment içermez.
- `{parameter}` tam segment olmak zorundadır.
- Parametre adı identifier olmalıdır.
- Aynı template içinde parametre adı tekrar etmez.
- Aynı method için eşdeğer template’ler çakışır:
  `/users/{id}` ile `/users/{name}` aynı pattern’dir.
- Status `200–599` arasındadır.
- Body boş değilse geçerli JSON’dur.
- Header adı token’dır; değer CR/LF içermez.

Route listesi tamamen compile edildikten sonra atomik olarak değiştirilir;
geçersiz yeni tablo çalışan eski tabloyu yarım güncellemez.

### 13.2 Eşleşme önceliği

Birden fazla template eşleşirse:

1. daha fazla literal segment;
2. daha fazla literal byte;
3. daha az parametre

öncelik kazanır. Böylece `/users/me`, `/users/{id}` değerinden önce seçilir.

### 13.3 Runtime

- Yalnız `127.0.0.1` bind edilir.
- `net/http` her request’i concurrent işler.
- Route snapshot read lock ile okunur.
- Hit geçmişi write lock altında bounded ring’e yazılır.
- Varsayılan son 500 hit tutulur.
- Delay en fazla 10 dakikadır.
- Client delay sırasında ayrılırsa hit status’u `499` olarak kaydedilir.
- `HEAD`, `204`, `205` ve `304` body yazmaz.
- CORS yalnız kullanıcı açıkça etkinleştirirse uygulanır.

Frontend server çalışırken yaklaşık 1,5 saniyede bir snapshot yeniler.
`routeRevision` ve request sequence sayaçları, geciken snapshot’ın daha yeni
yerel taslağı ezmesini önler.

### 13.4 OpenAPI’den mock üretme

- en fazla 2.000 route;
- toplam üretilen body bütçesi 32 MiB;
- sample graph en fazla 10.000 node;
- tahmini tek sample boyutu 1 MiB;
- schema depth en fazla 20;
- üretilen array en fazla 1.000 eleman.

Öncelik açık example, schema example/default ve son olarak deterministik
üretilen değerdir. 32 MiB belge bütçesi yalnız generated sample’ları değil,
explicit/named example dahil bütün route response body’lerinin toplamını
kapsar. 10.000 node ve 1 MiB tahmini boyut bütçesi ise her schema-derived
response sample’ı için yeniden başlar.

## 14. SSE akışı

SSE çağrısı bounded tool operation lifecycle’ını kullanır:

1. Frontend benzersiz `operationId` üretir.
2. Bridge boş, 128 karakterden uzun veya aktif duplicate ID’yi reddeder.
3. Lifecycle context’ten child context üretir.
4. Cancel fonksiyonunu `toolCancels` map’ine kaydeder.
5. Domain SSE fonksiyonunu çağırır.
6. Sonuçta kayıt identity check ile silinir.
7. `CancelToolOperation(id)` context’i iptal eder.

Request ve tool operation ID namespace’leri ayrıdır.

- yalnız HTTP/HTTPS URL;
- userinfo yok;
- varsayılan timeout 30 saniye, hard limit 10 dakika;
- varsayılan 100, hard limit 10.000 event;
- varsayılan toplam response 8 MiB, hard limit 64 MiB;
- varsayılan tek event 1 MiB;
- en fazla 5 redirect ve yalnız aynı scheme/host;
- non-2xx body’den en fazla 8 KiB diagnostic excerpt.

Cancellation veya limit hatasında daha önce parse edilmiş event’ler partial
result olarak korunabilir.

## 15. Diagnostics mimarisi

Diagnostics araçları iki gruptur:

1. Frontend içindeki saf analizler: Spring error özeti, JWT decode/claim
   analizi.
2. Go backend işlemleri: Actuator, environment comparison, thread dump, log
   arama ve endpoint coverage.

Frontend uzun async sonuçlarda input signature + operation sequence kullanır.
Kullanıcı formu değiştirirse eski sonuç UI state’ine uygulanmaz. Bu mekanizma
stale-result guard’dır; tek başına native işlemi iptal etmez.

### 15.1 Actuator

Akış:

1. `/health`;
2. seçilmiş `/metrics/{name}` çağrıları;
3. istenmişse `/mappings`;
4. önceki metric snapshot varsa delta hesabı.

Kurallar:

- varsayılan timeout 5 saniye, hard limit 30 saniye;
- varsayılan response 2 MiB, hard limit 16 MiB;
- varsayılan 32, hard limit 128 metric;
- tek metric hatası partial failure olarak tutulabilir;
- redirect en fazla 5 ve aynı origin;
- cross-origin redirect’e Authorization taşınmaz;
- JSON trailing değerleri reddedilir.

Timeout tek bir `InspectActuator` zinciri deadline’ı değildir; health, metric
batch ve mappings aşamaları ayrı bounded HTTP çağrıları olarak çalışır.

### 15.2 Environment comparison

- En az 2 target gerekir.
- Varsayılan en fazla 8, hard limit 20 target.
- Her target ayrı goroutine’de çalışır.
- Output input sırasını korur.
- İlk target baseline’dır.
- Status, header ve JSON/text body karşılaştırılır.
- GET/HEAD/OPTIONS safe method kabul edilir.
- POST/PUT/PATCH/DELETE için `AllowUnsafe=true` gerekir.
- En fazla 100 ignore JSON path’i.
- Her baseline/candidate karşılaştırmasında header fark listesi ayrı en fazla
  1.000, JSON fark listesi ayrı en fazla 1.000 kayıt tutar.
- `Set-Cookie` ve `Authorization` redakte edilir.
- Redirect aynı origin ile sınırlıdır.

### 15.3 Offline analizler

| Araç | Varsayılan | Hard limit |
| --- | ---: | ---: |
| Thread dump input | 8 MiB | 32 MiB |
| Thread sayısı | 20.000 | 100.000 |
| Log input | 4 MiB | 32 MiB |
| Log eşleşmesi | 100 | 1.000 |
| Coverage known endpoint | — | 10.000 |
| Coverage observed entry | — | 100.000 |
| Coverage match evaluation | — | 5.000.000 |

Bu fonksiyonlar synchronous ve bounded’dır. Şu anda ayrı user cancellation
operation ID’si taşımaz.

## 16. Automation ve CLI paylaşımı

### 16.1 Collection Runner

```text
DecodeCollection
  → strict JSON + limits
  → validate collection/assertions
  → merge variables
  → her request için
      → interpolate
      → per-request timeout
      → Sender.Send
      → bounded response retention
      → assertion evaluation
      → RequestResult
  → aggregate report
```

Variable önceliği:

```text
collection < runtime override < request-local
```

Sağdaki katman kazanır.

Request preparation, network veya assertion hatası collection’ın geri kalanını
durdurmaz; ilgili `RequestResult` içine yazılır. Parent context cancellation
partial report ile Go error döndürebilir.

HTTP transport `Sender` interface’i arkasındadır. Testler fake sender
kullanabilir; masaüstü ve CLI gerçek `HTTPSender` kullanır.

### 16.2 Assertion motoru

`internal/assertions` runner’dan bağımsızdır. Machine-readable alanlar named
string type ve constants olarak tanımlıdır.

`Target`:

- `status`;
- `header`;
- `body`;
- `json_path`;
- `duration_ms`.

`Operator`:

- `equals`;
- `not_equals`;
- `contains`;
- `exists`;
- `not_exists`;
- `less_than`;
- `greater_than`;
- `matches`.

Yeni target/operator ekleme; sabit, validation, evaluator, JSON contract,
frontend seçenekleri ve matris testlerini birlikte değiştirmelidir.

### 16.3 Network inspector

- Her benzersiz hostname bir kez resolve edilir.
- Redirect’ler HTTP client’a bırakılmaz; araç tarafından izlenir.
- Önce `HEAD`, desteklenmezse `GET` fallback yapılır.
- Redirect loop tespit edilir.
- Hata halinde o ana kadarki DNS ve hop sonuçları korunur.
- Varsayılan timeout 10 saniye, hard limit 5 dakika.
- Varsayılan redirect 10, hard limit 50.

### 16.4 OpenAPI lint

Desktop ve CLI aynı `internal/openapilint` raporunu kullanır. Desktop dosya
picker ve UserError mapping ekler; CLI strict flag ve exit code uygular. Domain
lint kuralı iki adaptörde kopyalanmamalıdır.

## 17. DTO ve JSON sözleşmesi

Go–TypeScript boundary kuralları:

- Süreler integer milisaniye olarak taşınır.
- Timestamp’ler UTC `RFC3339Nano` string’idir.
- Optional Go nesneleri pointer ve gerektiğinde `omitempty` kullanır.
- UI’nin zorunlu listeleri `[]`, map’leri `{}` olmalıdır.
- Go `nonNilSlice`/`nonNilMap`, frontend normalizer ikinci savunma katmanıdır.
- Field rename breaking contract’tır.
- Yeni optional field geriye uyumlu eklenmelidir.
- Enum değeri genişletilirken frontend unknown-value fallback’i düşünülmelidir.
- Map iterasyonundan üretilen kullanıcı raporları önce sıralanmalıdır.

### UserError

```ts
interface UserError {
  code: string;
  title: string;
  message: string;
  hint?: string;
  technical?: string;
}
```

Semantik:

| Alan | Amaç |
| --- | --- |
| `code` | Stabil, makine tarafından dallandırılabilir kimlik |
| `title` | Kısa kullanıcı başlığı |
| `message` | Güvenli, bağlamsal açıklama |
| `hint` | Kullanıcının uygulayabileceği çözüm |
| `technical` | Gerektiğinde açılan teknik ayrıntı |

`code` bugün TypeScript tarafında serbest `string` olarak modellenmiştir.
Yeni kodlarda aşağıdaki tek kaynak yaklaşımı tercih edilmelidir:

```ts
export const USER_ERROR_CODES = [
  "invalid_request",
  "missing_variables",
  "request_timeout",
  "request_canceled",
  "network_error",
] as const;

export type UserErrorCode = (typeof USER_ERROR_CODES)[number];
```

Go tarafında eşdeğeri:

```go
type UserErrorCode string

const (
	CodeInvalidRequest   UserErrorCode = "invalid_request"
	CodeMissingVariables UserErrorCode = "missing_variables"
	CodeRequestTimeout   UserErrorCode = "request_timeout"
)
```

Değerler iki tarafta manuel tutulduğu sürece contract testleri zorunludur.
Orta vadede shared schema/code generation değerlendirilebilir.

## 18. State sahipliği ve veri ömrü

| Veri | Sahip | Kalıcılık |
| --- | --- | --- |
| Request tab formu | Zustand | Sanitize edilerek localStorage |
| Saved request koleksiyonları | Collection Zustand + Go repository | Native app-data, versioned JSON |
| Collection expansion tercihi | Collection Zustand | `localStorage`, disposable |
| Collection persistence durumu | External store snapshot | Oturumluk |
| Response ve running state | Zustand | Oturumluk |
| Tool form/sonuçları | Feature component | Mounted kaldığı sürece |
| Tema/panel tercihleri | Zustand | localStorage |
| Locale | LocaleProvider | `validex.locale` |
| OpenAPI hafif metadata | Zustand | Oturumluk |
| OpenAPI schema graph | Go Bridge cache | Oturumluk, en fazla 8 |
| Mock routes/hits | Go mock server + feature state | Oturumluk |
| Coverage gözlemleri | Go Bridge | Oturumluk, bounded |
| Aktif cancellation kayıtları | Go Bridge | İşlem ömrü |
| CLI report | CLI process | Çıktı tamamlanana kadar |

Yeni state eklerken şu sorular yanıtlanmalıdır:

1. Gerçek source of truth hangi katman?
2. Restart sonrası geri gelmeli mi?
3. Secret içerebilir mi?
4. Migration gerekiyor mu?
5. Hangi limit altında tutulacak?
6. İki async yazma yarışırsa hangi sürüm kazanır?
7. Feature unmount olduğunda temizlenmeli mi?

## 19. Concurrency ve cancellation

| İşlem | Çalışma modeli | Kullanıcı iptali | Shutdown iptali |
| --- | --- | --- | --- |
| HTTP request | IPC goroutine + HTTP call | `CancelRequest` | Var |
| SSE | IPC goroutine + stream read | `CancelToolOperation` | Var |
| Collection | IPC goroutine, request’ler sıralı | `CancelToolOperation` | Var |
| Saved-request persistence | Bounded single-consumer IPC queue | UI retry | 3 saniye drain + context cancel |
| Network inspect | IPC goroutine, hop’lar sıralı | `CancelToolOperation` | Var |
| Actuator | Health/metric/mapping sıralı | Ayrı ID yok | Var |
| Environment compare | Target başına goroutine | Ayrı ID yok | Var |
| Mock HTTP | Request başına HTTP goroutine | Client context | Server stop |
| Thread/log/coverage | Synchronous CPU | Yok | Fonksiyon bitimine bağlı |
| OpenAPI parse/lint | Synchronous parse | Tekil ID yok | Sınırlı |

IPC runtime normal dispatch’ler için goroutine başlatır; collection persistence
metotları registry policy’siyle bounded serial queue’ya yönlenir. Genel
metotlarda global/per-method concurrency limiti veya toplam response payload
backpressure mekanizması halen yoktur. Yeni pahalı bridge metodunda
aşağıdakiler tasarlanmadan sınırsız fan-out oluşturulmamalıdır:

- global veya per-method semaphore;
- maksimum pending call sayısı;
- aggregate input/output byte bütçesi;
- queue timeout veya `busy` error code’u;
- shutdown için maksimum bekleme politikası.

## 20. Kaynak limitleri

Limitler yalnız performans optimizasyonu değil, mimari güvenlik sözleşmesidir.

| Alan | Varsayılan | Hard limit |
| --- | ---: | ---: |
| IPC argüman paketi | — | 32 MiB |
| Collection library belgesi | — | 15 MiB |
| Collection persistence kuyruğu | — | 128 bekleyen komut / 64 MiB |
| Collection persistence drain | — | 3 saniye bekleme bütçesi |
| Collection dışı IPC drain | — | 3 saniye bounded join |
| Desktop HTTP response body | — | 16 MiB |
| Desktop HTTP timeout | — | 300 saniye |
| OpenAPI dosyası | — | 16 MiB |
| OpenAPI operation | — | 10.000 |
| Cache’lenen OpenAPI spec | — | 8 |
| Drift finding | — | 1.000 |
| Drift traversal depth | — | 256 |
| Drift traversal node | — | 10.000 |
| Drift finding toplam metni | — | 4 MiB |
| OpenAPI mock route | — | 2.000 |
| OpenAPI mock body toplamı | — | 32 MiB |
| Generated sample | — | 10.000 node / 1 MiB |
| Mock hit geçmişi | Bridge’de 500 | Genel `Options.HitLimit` için hard cap yok |
| Mock delay | — | 10 dakika |
| Runner collection | 8 MiB | 32 MiB |
| Runner request sayısı | 100 | 10.000 |
| Runner request body | 4 MiB | 16 MiB |
| Runner response body | 16 MiB | 64 MiB |
| Runner response header | 1 MiB | 8 MiB |
| Runner report body | 32 MiB | 128 MiB |
| Runner report header | 4 MiB | 32 MiB |
| Runner timeout | 30 saniye | 300 saniye |
| Actuator/environment HTTP response | 2 MiB | 16 MiB |
| Actuator/environment HTTP çağrı timeout’u | 5 saniye | 30 saniye |
| Network timeout | 10 saniye | 5 dakika |
| Network redirect | 10 | 50 |
| OpenAPI lint document | — | 16 MiB |
| OpenAPI lint retained issue | 200 | 1.000 |

Yeni bir collection üreten özellikte yalnız tek kayıt limiti yeterli değildir.
Şunların tamamı ele alınmalıdır:

- input document boyutu;
- item sayısı;
- tek item boyutu;
- aggregate output boyutu;
- traversal depth/node;
- retained report boyutu;
- timeout;
- partial result davranışı.

## 21. Güvenlik ve güven sınırları

### 21.1 Trust boundary

```text
Trusted local user
       │
       ▼
Trusted packaged frontend
       │ capability + exact origin
       ▼
Native bridge
       │ validated/bounded input
       ▼
Local filesystem ve kullanıcının seçtiği network hedefleri
```

Validex bir API istemcisidir. Kullanıcının verdiği host’a request göndermek
temel işlev olduğundan genel bir SSRF denylist’i yoktur. Güvenlik modeli yerel,
güvenilen masaüstü kullanıcısına dayanır.

### 21.2 Ağ input kuralları

- URL userinfo genel olarak reddedilir.
- HTTP’de anlamsız olan fragment sessizce atılmaz; input reddedilir.
- Header adları token doğrulamasından geçer.
- Header değerlerinde CR/LF injection reddedilir.
- Credential taşıyan diagnostic çağrılarda cross-origin redirect reddedilir.
- TLS validation kapatma yalnız açık kullanıcı seçeneğidir.
- HTTPS kullanan SSE bağlantılarında minimum TLS 1.2’dir.
- Mock server genel ağa bind olmaz.

### 21.3 Secret yönetimi

- Secret isimli environment değerleri persistence öncesi temizlenir.
- Workspace tabında ve saved-request library’de secret header doğrudan değeri
  persist edilmez.
- Güvenli variable referansı korunabilir.
- Report URL redaction variable/query değerlerini maskeleyebilir.
- Teknik error veya log içine credential taşınmamalıdır.

Sınır: isim heuristic’i URL/body içeriğini anlayan secret scanner değildir.
Saved request URL ve body alanları native app-data dosyasında plaintext kalır.
Literal secret header temizlendiğinde açık form sessizce clean yapılmaz; raw
form dirty taslak olarak korunur ve kullanıcı variable referansına yönlendirilir.
Gelecek güvenli secret saklama özelliği işletim sistemi keychain/credential
store adapter’ı olarak tasarlanmalı; localStorage’a şifreli metin yazmak tek
başına yeterli kabul edilmemelidir.

## 22. Platform adaptasyonları

| Platform | Native UI/WebView | İkon | Dosya seçici |
| --- | --- | --- | --- |
| Linux | CGO, GTK3, WebKitGTK | GdkPixbuf üzerinden runtime icon | `zenity`, fallback `kdialog` |
| macOS | Cocoa, sistem WebKit | `NSApplication` | `osascript choose file` |
| Windows | WebView2 + MinGW/CGO | Build sırasında `.syso` resource | PowerShell WinForms dialog |

File picker çağrıları process seviyesinde mutex ile serialize edilir. Seçilen
dosyanın uzantısı dialog filter’ına güvenilmeden Go tarafında tekrar
doğrulanır.

Platform kodu:

- `native_application_linux.go`;
- `native_application_darwin.go`;
- `native_application_other.go`;
- `file_dialog_linux.go`;
- `file_dialog_darwin.go`;
- `file_dialog_windows.go`.

Yeni platform davranışı ortak dosyada runtime `if` zinciri yerine platform
dosyasında ve mümkünse build tag ile eklenmelidir.

## 23. Build ve paketleme mimarisi

Makefile tek orchestration kaynağıdır:

```text
make build
  ├── npm ci
  ├── make build-cli
  ├── npm run build
  │   ├── TypeScript check
  │   └── Vite dist
  └── host native desktop build
      ├── Linux executable
      ├── macOS .app
      └── Windows .exe
```

Frontend `dist` desktop Go binary’sine embed edilir. Production’da ayrı bir
frontend deployment yoktur.

Host build sınırları:

- Linux CGO ile GTK/WebKitGTK’ye dinamik bağlıdır.
- macOS `.app` bundle üretir; signing/notarization yapmaz.
- Windows `windres` ile icon resource üretir ve GUI subsystem’i kullanır.
- Cross-compilation/release artifact matrix’i yoktur.
- Version `0.2.0` birden fazla metadata noktasında sabittir; merkezi
  release-time injection henüz yoktur.

Çalıştırma ve paket oluşturma komutları için `README.md` tek kullanıcı
kaynağıdır. Bu belge build’in teknik ilişkisini açıklar, kullanıcı komutlarını
tekrar etmez.

## 24. Test mimarisi

### 24.1 Go unit testleri

- assertion target/operator matrisi;
- JSONPath parser;
- variable interpolation ve redaction;
- OpenAPI drift traversal;
- mock route compile, specificity ve hit ring;
- limit normalization;
- diagnostics saf analizleri;
- hata sınıflandırması.

### 24.2 Local integration testleri

- `httptest.Server` ile HTTP, SSE, Actuator ve environment;
- loopback mock lifecycle;
- fake resolver/HTTP client ile network inspector;
- fake file picker ile import/lint;
- fake WebView ile IPC dispatch/callback.

### 24.3 Concurrency ve lifecycle testleri

- duplicate request/tool operation ID;
- in-flight cancellation;
- shutdown’ın aktif işlemleri durdurması;
- collection dışı IPC’nin app-context cancel sonrası bounded join edilmesi;
- collection `Load`/`Save` kabul sırası ve FIFO drain;
- collection queue kayıt/byte kapasitesi ile typed busy sonucu;
- drain deadline’ında context dinlemeyen işin runtime kapanışını bloklamaması;
- atomic replace sonrası sync hatasında revision’ın ilerlemesi;
- geçerli load’dan sonra bozulan diskin `corrupt` sınıfında kalması;
- concurrent trace callback’leri;
- concurrent mock Stop;
- cache eviction ve bounded ring;
- stale frontend result/snapshot guard’ları.

### 24.4 Frontend testleri

Vitest + jsdom + React Testing Library kullanılır. Testler kaynak yanında
konumlanır. Minimum boundary kapsamı:

- App bootstrap loading/error/retry;
- backend facade ve non-null normalization;
- store migration/sanitize/partialize;
- request orchestration/cancellation;
- OpenAPI import;
- mock revision yarışı;
- SSE partial result ve cancellation;
- diagnostics stale-result guard;
- i18n anahtarları;
- keyboard/ARIA davranışları.

### 24.5 Komut ve CI ayrımı

Genel Go testleri native build tag’li bütün kodu kapsamaz:

```bash
go test ./...
go test -tags canbridge ./internal/canbridge ./cmd/validex
```

Concurrency değişikliklerinde uygun platformda:

```bash
go test -race ./...
```

Mevcut CI:

- Ubuntu: frontend typecheck/test/build, genel Go test ve vet;
- macOS: canbridge-tag test/vet ve native build.

Windows native job, Linux native tagged job, release artifact upload’u ve
düzenli race job henüz yoktur.

## 25. Yeni özellik ekleme rehberi

### 25.1 Yeni bağımsız domain aracı

1. `internal/<feature>` paketi oluşturun.
2. Input/output modellerini UI metinlerinden bağımsız tanımlayın.
3. Machine-readable durumlar için named types/constants ekleyin.
4. Ağ/uzun CPU işi `context.Context` kabul etsin.
5. Default ve hard limitleri package constants olarak tanımlayın.
6. Partial result ve fatal error ayrımını belirleyin.
7. Harici sistemi interface arkasına alın.
8. Saf unit ve local integration testlerini yazın.
9. Desktop için ince `canbridge` adapter ekleyin.
10. CLI’da anlamlıysa aynı domain paketini `internal/cli` üzerinden kullanın.

Domain package’ın `internal/canbridge` import etmesi mimari ihlaldir.

### 25.2 Yeni native bridge metodu

Birlikte güncellenecek noktalar:

1. Go input/output DTO;
2. domain adapter metodu;
3. `bridgeMethodRegistry` adı, execution policy’si ve serial ise typed
   `BusyResult` factory’si;
4. `Bridge.Invoke` switch ve typed decode;
5. Go invoke/bridge contract testleri;
6. TypeScript DTO;
7. `CanbridgeAPI`;
8. `backend` facade metodu;
9. gerekiyorsa `bridge-contract.ts` normalizer;
10. frontend backend success/error/rejection/null testleri;
11. feature orchestration ve i18n metinleri.

Metod uzun sürüyorsa `operationId`, duplicate ID, user cancel, shutdown cancel,
timeout ve concurrency bütçesi eklenmelidir.

Metod collection dosyasının revision’ını okuyacak veya değiştirecekse
`bridgeExecutionCollectionLibrarySerial` seçilmelidir. Sırf adı collection içeriyor
diye runner/automation metodunu bu kuyruğa koymayın; policy storage aggregate’ı
ve onun CAS revision sahipliğini korur.

### 25.3 Yeni workspace/tool ekranı

1. `WorkspaceView` union’ına değer ekleyin.
2. `workspaceDefinitions` registry kaydı ve çeviri anahtarlarını ekleyin.
3. AppShell lazy import ekleyin.
4. `renderTool` switch kolunu ekleyin.
5. Feature component/model/test dosyalarını oluşturun.
6. Responsive CSS ve dar ekran davranışını ekleyin.
7. Mounted kalmasının bellek maliyetini değerlendirin.
8. Keyboard navigation ve ARIA testlerini yazın.

Registry navigasyon metadata’sını merkezileştirir; component resolution halen
AppShell switch’indedir. İkinci bir paralel registry oluşturmayın.

### 25.4 Yeni HTTP method

1. `lib/http.ts` merkezi `as const` kaynağını değiştirin.
2. Method body policy’sini açıkça belirleyin.
3. Frontend schema ve form testlerini güncelleyin.
4. `Bridge.SendRequest` body davranışını güncelleyin.
5. Mock server method doğrulamasını kontrol edin.
6. Runner davranışıyla tutarlılığı test edin.
7. cURL/export davranışını test edin.

Method string’ini component içine hard-code etmeyin.

### 25.5 Persistence alanı veya şema değişikliği

1. Alanın gerçekten restart sonrası gerekli olduğuna karar verin.
2. Secret içerme ihtimalini inceleyin.
3. Store type ve action’ı ekleyin.
4. `partialize` allowlist’ini bilinçli güncelleyin.
5. Şema sürümünü yükseltin.
6. Eski sürümden migration yazın.
7. Sanitize fonksiyonunu güncelleyin.
8. Corrupt/unknown storage fallback testi ekleyin.
9. Transient alanların persist edilmediğini test edin.

Yeni alan ekleyip yalnız Zustand state’ine koymak, otomatik olarak persistence
kararı verilmiş olduğu anlamına gelmez.

### 25.6 Yeni error code

1. Stabil, dil bağımsız snake_case kod seçin.
2. Go named constant ekleyin.
3. TypeScript union/constant kaynağını güncelleyin.
4. Default unknown-code fallback’ini koruyun.
5. TR/EN kullanıcı metnini adaptör veya i18n katmanında ekleyin.
6. Teknik ayrıntıda secret bulunmadığını test edin.
7. Branching yapan UI testlerini ekleyin.

### 25.7 Yeni CLI komutu

1. İş mantığını bağımsız domain paketinde tutun.
2. `internal/cli` içinde argüman ve kullanım adaptörü ekleyin.
3. Human ve JSON output sözleşmesini tanımlayın.
4. Exit code `0/1/2` ayrımını koruyun.
5. stdin/file input için boyut ve cancellation politikası ekleyin.
6. Signal context’i aşağı taşıyın.
7. Golden yerine mümkünse structured result testleri kullanın.

## 26. Kodlama ve modelleme kuralları

### 26.1 Enum ve constant

Enum/constant kullanılmalı:

- HTTP method, workspace view, tool mode;
- error/failure code;
- assertion target/operator;
- severity, status, drift type;
- persistence version ve storage key;
- limit/default değerleri;
- IPC method isimleri;
- operation state.

TypeScript:

```ts
export const TOOL_MODES = ["runner", "network", "lint"] as const;
export type ToolMode = (typeof TOOL_MODES)[number];
```

Go:

```go
type ToolMode string

const (
	ToolModeRunner  ToolMode = "runner"
	ToolModeNetwork ToolMode = "network"
	ToolModeLint    ToolMode = "lint"
)
```

Kaçınılması gerekenler:

- aynı string listesini birden fazla componentte tekrarlamak;
- error code üzerinde dağınık literal karşılaştırmalar;
- boolean’larla mümkün olmayan state kombinasyonları;
- magic timeout/byte limitleri;
- map iteration sırasına bağlı rapor.

### 26.2 Async state

Basit olmayan işlem state’i için:

```ts
type AsyncState<T> =
  | { kind: "idle" }
  | { kind: "loading"; operationId: string }
  | { kind: "success"; data: T }
  | { kind: "failure"; error: UserError; partial?: T };
```

Bu model `loading + error + data` boolean/optional üçlüsündeki çelişkili
durumları engeller.

### 26.3 Determinizm

- Map çıktıları sıralanmalıdır.
- Lint/finding/result sırası input ve açık sort kurallarıyla belirlenmelidir.
- UUID yalnız kimlik gereken yerde kullanılmalı; rapor sırasını
  belirlememelidir.
- Testler wall-clock timestamp’in exact değerine bağlanmamalıdır.

### 26.4 Hata katmanları

- Domain error: tipli, makine kodlu, UI dilinden bağımsız.
- Adapter error: güvenli `UserError` dönüşümü.
- Transport error: IPC rejection veya CLI usage/system error.
- UI error: i18n mesajı, retry/cancel eylemi ve gerektiğinde technical detail.

### 26.5 Resource ownership

Listener, response body, socket, ticker, timer ve cancel fonksiyonu hangi
katmanda oluşturulduysa normal ve hata yolunda aynı katmanda kapatılmalıdır.
Goroutine başlatan kodun bitiş koşulu ve shutdown davranışı test edilmelidir.

## 27. Mevcut teknik borç ve gelecek yönü

Bu bölüm bilinçli geliştirme backlog’udur; mevcut davranışın gizlenmemesi için
belgelenmiştir.

### Öncelikli

1. Actuator ve environment comparison input’larına `operationId` eklenmeli;
   kullanıcı cancellation’ı ortak tool modeliyle birleştirilmeli.
2. IPC’ye global/per-method concurrency ve aggregate output backpressure
   eklenmeli.
3. Saved-request URL/body alanları için açık credential tarama/redaction
   politikası ve işletim sistemi keychain adapter’ı tasarlanmalı.
4. Multi-instance collection conflict’i bugün veri ezmek yerine read-only +
   restart ister; ileride kullanıcı kontrollü üç-yollu merge/recovery akışı
   eklenmeli.
5. Request execution `running: boolean` yerine discriminated union olmalı.
6. `UserError.code` ve runner failure code named enum/constant kümelerine
   taşınmalı.

### Orta vadeli

1. `useOpenAPIImport` AppShell ve TopBar’da yinelenen controller instance’ları
   tek sahiplik modeline alınmalı.
2. Normal HTTP `SendResult/ResponseEnvelope` da açık boundary normalization
   ve malformed/version-skew contract testleri kapsamına alınmalı.
3. Go/TypeScript IPC sözleşmesi schema veya code generation ile
   senkronize edilmeli.
4. Collection CAS revision’ı ileride `LoadResult.revision` ve
   `Save(expectedRevision)` ile payload’a açıkça bağlanmalı; bu değişiklik
   frontend write sequencing ile birlikte yapılmalı.
5. Mock sample generator `writeOnly`, `uniqueItems`, `multipleOf` ve `pattern`
   gibi constraint’lerde genişletilmeli.
6. Desktop request body policy’si runner ile karşılaştırılıp tek açık
   semantiğe bağlanmalı.
7. Büyük tool’ların mounted tutulması için bellek ölçümü ve eviction politikası
   değerlendirilmeli.
8. Tek büyük `styles.css` feature/token katmanlarına ayrılırken cascade ve tema
   sözleşmesi korunmalı.

### Build ve kalite

1. Windows native CI job eklenmeli.
2. Linux canbridge-tag build/test job eklenmeli.
3. Düzenli race testi çalıştırılmalı.
4. Release version tek kaynaktan binary, frontend ve platform metadata’sına
   enjekte edilmeli.
5. Signing, notarization ve artifact checksum release pipeline’ı ayrı bir
   çalışma olarak tasarlanmalı.

## 28. Mimari karar özeti

| Karar | Gerekçe | Sonuç |
| --- | --- | --- |
| Sistem WebView + Go backend | Native dağıtım ve küçük frontend runtime | Platform WebView build bağımlılığı |
| Embedded asset + loopback server | Standart origin ve asset davranışı | Process içinde sınırlı HTTP listener |
| Explicit IPC allowlist | Saldırı yüzeyini ve contract’ı görünür tutmak | Yeni metod çoklu dosya değişikliği gerektirir |
| Domain paketleri adaptörden bağımsız | Desktop ve CLI paylaşımı/test edilebilirlik | DTO mapping adapter’da kalır |
| Zustand + feature-local state | Workspace kalıcılığı ile tool izolasyonu | State sahipliği dikkatle seçilmeli |
| Native saved-request repository | Port/origin değişiminden bağımsız kalıcı koleksiyonlar | Version/CAS/hydration protokolü gerekir |
| File lock + revision CAS | İki desktop instance’ın sessiz veri ezmesini engellemek | Conflict kullanıcı müdahalesi ister |
| Repository + Application Service + Facade | Storage, use-case ve transport sahipliğini ayırmak | Yeni adapter repository portunu uygulamalı |
| Bounded serial collection queue | Load/Save kabul sırası ve backpressure | Queue-full typed retry sonucu üretir |
| Bounded parser/network/report | Bellek ve süreyi öngörülebilir tutmak | Her yeni feature limit tasarlamalı |
| Host-native build | CGO/WebView platform gerçekliği | Cross-platform artifact için ayrı runner gerekir |
| URL router olmadan registry navigasyonu | Desktop workspace modeli | Deep link ve SPA fallback yok |

## 29. Dosya yönlendirme rehberi

| Değişiklik | İlk bakılacak dosyalar |
| --- | --- |
| Desktop bootstrap | `cmd/validex/main.go`, `internal/canbridge/app.go` |
| IPC metodu/policy | `internal/canbridge/invoke.go`, `frontend/src/lib/backend.ts` |
| Request davranışı | `internal/canbridge/bridge.go`, `RequestWorkbench.tsx` |
| DTO contract | `internal/canbridge/models.go`, `tools_models.go`, `lib/types.ts` |
| Non-null normalization | `internal/canbridge/contract.go`, `lib/bridge-contract.ts` |
| OpenAPI | `internal/core`, `features/openapi`, `Sidebar.tsx` |
| Mock | `internal/mockserver`, `features/mock-server` |
| SSE | `internal/protocols`, `features/protocols` |
| Diagnostics | `internal/diagnostics`, `features/diagnostics` |
| Automation collection runner | `internal/runner`, `internal/assertions`, `features/automation` |
| Saved request library | `features/collections`, `stores/collectionLibrary.ts` |
| Collection contract/facade | `internal/canbridge/collection_library.go`, `lib/types.ts`, `lib/backend.ts` |
| Collection use-case/lifecycle | `internal/canbridge/collection_library_service.go` |
| Collection file repository | `internal/canbridge/collection_library_repository.go`, `collection_filesystem_*.go` |
| Collection IPC ordering | `internal/canbridge/ipc_serial_queue.go`, `invoke.go` |
| Collection frontend persistence | `stores/collectionLibraryStorage.ts` |
| CLI | `cmd/validex-cli`, `internal/cli` |
| Workspace state | `stores/workspace.ts`, `stores/workspace.test.ts` |
| Navigasyon | `app/workspaceRegistry.ts`, `components/AppShell.tsx` |
| i18n | `src/i18n/messages/*`, `LocaleProvider.tsx` |
| Build/paket | `Makefile`, `cmd/validex/build/*` |

## 30. Değişiklik kontrol listesi

Her orta/büyük geliştirmede:

- [ ] Source of truth ve katman sahipliği belirlendi.
- [ ] Domain davranışı UI/adaptör içine kopyalanmadı.
- [ ] Stringly-typed değerler enum/named constant olarak modellendi.
- [ ] Input, item, aggregate output, timeout ve traversal limitleri belirlendi.
- [ ] Cancellation ve Shutdown davranışı tanımlandı.
- [ ] Partial result ile fatal error ayrımı tanımlandı.
- [ ] Secret/log/persistence etkisi incelendi.
- [ ] Go ve TypeScript DTO’ları birlikte güncellendi.
- [ ] Array/map alanlarının error path’lerinde non-null olduğu test edildi.
- [ ] Stale async result ve duplicate operation yarışları ele alındı.
- [ ] TR/EN metinleri eklendi.
- [ ] Keyboard, ARIA ve responsive davranış kontrol edildi.
- [ ] Unit, integration ve boundary contract testleri eklendi.
- [ ] Platform build etkisi değerlendirildi.
- [ ] Bu belgeyi etkileyen karar güncellendi.

Bu kontrol listesi özellikle yeni tool, yeni bridge metodu, persistence şema
değişikliği ve uzun süren network işlemlerinde tamamlanmalıdır.
