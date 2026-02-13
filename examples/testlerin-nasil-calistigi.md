# Testler Nasıl Çalışıyor? (Adım Adım)

Bu doküman `lazytest` içindeki testleri **teker teker**, neyi doğruladıklarını ve hangi komutla çalıştırabileceğini açıklar.

> Kapsam: Şu an repoda gerçek unit testler `internal/tcp/tcp_test.go` içinde bulunuyor.

---

## 1) Tüm testleri tek seferde çalıştırma

```bash
go test ./...
```

Bu komut tüm paketleri gezer; test dosyası olan paketlerde testleri çalıştırır. Bu projede aktif test paketi `internal/tcp` olduğu için asıl doğrulama burada yapılır.

---

## 2) Testleri tek tek çalıştırma

### 2.1 `TestRunSuccess`

```bash
go test ./internal/tcp -run TestRunSuccess -v
```

**Ne yapar?**
1. Geçici bir dummy TCP server açar (`startDummy`).
2. Server bağlantı kurulduğunda `BANNER\n` döner.
3. Test senaryosu şu adımları koşar:
   - `connect`
   - `read` (banner bekler ve `contains: BANNER` assert eder)
   - `write` (`PING\n` gönderir)
   - `read` (echo’da `regex: PING` doğrular)
   - `close`
4. `Run(...)` sonucunun `OK=true` olduğunu doğrular.

**Neyi garanti eder?**
- TCP runner’ın temel connect/read/write/close akışını başarıyla çalıştırdığını.
- Basit `contains` ve `regex` assertion’larının doğru davrandığını.

---

### 2.2 `TestEvaluateAssertJSON`

```bash
go test ./internal/tcp -run TestEvaluateAssertJSON -v
```

**Ne yapar?**
- JSON gövdesi üzerinde assertion motorunu test eder:
  - `JSONPath`: `$.a.b[0].name`
  - `JMESPath`: `a.b[0].name`
  - `LenRange`: gövde boyunun aralıkta olması
  - `Not`: negatif assertion (`contains: zzz` olmamalı)

**Neyi garanti eder?**
- TCP assertion katmanındaki JSON odaklı kontrollerin doğru çalıştığını.

---

### 2.3 `TestDialTimeout`

```bash
go test ./internal/tcp -run TestDialTimeout -v
```

**Ne yapar?**
1. Ulaşılamaz bir IP/port’a kısa timeout ile `connect` denemesi yapar.
2. `Run(...)` çağrısının **hata döndürmesini** bekler.

**Neyi garanti eder?**
- Ağ erişimi yoksa timeout/retry davranışının hata ürettiğini.
- “Bağlanamama” durumunun sessizce başarılı sayılmadığını.

---

### 2.4 `TestBreaker`

```bash
go test ./internal/tcp -run TestBreaker -v
```

**Ne yapar?**
1. Failure eşiği düşük bir breaker oluşturur.
2. Bir hata kaydı (`context.DeadlineExceeded`) düşer.
3. Breaker state’inin `closed` olmaktan çıkmasını bekler.

**Neyi garanti eder?**
- Circuit breaker mekanizmasının hata sonrası devreyi açabildiğini.

---

## 3) Pratik debug komutları

```bash
# Sadece tcp paketi
go test ./internal/tcp -v

# Belirli bir test + race detector
go test ./internal/tcp -run TestRunSuccess -race -v

# Tekrar sayısı (flaky kontrol)
go test ./internal/tcp -run TestRunSuccess -count=20
```

---

## 4) CI/CD önerisi

Pipeline’da minimum şu akış önerilir:

```bash
go test ./internal/tcp -v
go test ./... 
```

- İlk komut kritik paketi hızlı geri bildirim için ayrı çalıştırır.
- İkinci komut tüm repo taramasını tamamlar.
