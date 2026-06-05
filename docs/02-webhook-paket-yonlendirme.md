# 02 — Webhook: paket → kurye URL'ine yönlendirme (`/api/webhook`)

## Amaç
Yeni paket (`packet.created`) event'ini güvenle alıp, o restoranın ayarladığı **kurye hedef URL'ine**
paket içeriğini POST etmek.

## Akış
```
Restomenum → POST /api/webhook
   Header: X-Restomenum-Signature: t=<sec>,v1=<HMAC_SHA256(webhookSecret,"<t>.<rawBody>")>
   Body:   { id, type:"packet.created", version, serverId, occurredAt, data }
/api/webhook (POST):
   1. req.text() ile HAM gövde oku            (imza için ŞART — parse'tan önce)
   2. body'den serverId → KV install:{serverId}.webhookSecret
   3. imza doğrula (recompute + timing-safe + ±5dk replay)   → geçersiz: 401
   4. idempotency: id daha önce işlendiyse → 200 'dup'
   5. config:{serverId}.courierUrl yoksa → 200 (ack, markProcessed) — yapılacak iş yok
   6. mapEventPayload(envelope, install) → TUTARLI + temiz payload (ham/iç veri yok; customer yalnız customers:read ile)
   7. POST courierUrl <map'lenmiş payload>
        başarı (2xx) → markProcessed → 200
        başarısız     → 502/504 (markProcessed YOK → Restomenum retry eder)
```

## Mantık / neden
- **Ham gövde ile imza:** HMAC, body'nin byte'ı üzerinden hesaplanır; `JSON.parse` + tekrar
  `stringify` imzayı bozar → `req.text()` ile ham gövdeyi kullan.
- **Doğru secret seçimi:** her tenant'ın ayrı `webhookSecret`'ı var → `serverId` ile install'ı bul,
  onun secret'ı ile doğrula.
- **Idempotency (başarıdan SONRA işaretle):** Restomenum başarısız teslimleri **retry** eder. Eğer
  forward'dan ÖNCE "işlendi" işaretlersek, forward 502 olunca retry deduplike olur ve paket **kaybolur**.
  Bu yüzden `markProcessed` yalnız **başarılı forward** (veya "URL yok" terminal durumu) sonrası.
- **2xx = ack, 5xx = retry:** kurye sistemi geçici hata verirse 502 dön → Restomenum tekrar dener.
- **courierUrl yoksa:** restoran henüz ayar yapmamış → event'i düşür (ack), retry'a gerek yok.

## Kurye firmasının yazılımcısına — gelen webhook
Restoranın ayar ekranına girdiği adrese (`courierUrl`) yeni paket oluştuğunda **HTTPS `POST`** gelir.

Gövde, sabit bir **`order`** formatındadır.

**Başlıklar:**
```
Content-Type: application/json
x-restomenum-plugin: kurye
x-restomenum-event: packet.created
x-restomenum-server-id: <serverId>      ← tenant ayrımı (body serverId taşımaz)
```

**Gövde (`order` — tam örnek):**
```json
{
  "id": "1780621202512",
  "products": [
    { "id": "1780621201567-3ab9", "name": "SAN SEBASTIAN", "price": 36, "quantity": 1, "options": [{ "name": "Acılı" }] }
  ],
  "source": "pos",
  "note": "kapıda nakit",
  "totalAmount": 36,
  "totalDiscount": 0,
  "paymentMethod": "Online",
  "platformCode": "1780621202512",
  "dailyOrderNo": "2",
  "createdAt": "2026-06-05 01:00:06",
  "scheduledAt": null,
  "courierPhone": null,
  "customer": { "fullName": "Ahmet Y.", "phoneNumber": "05xxxxxxxxx", "phoneCode": "" },
  "address": { "text": "Suadiye … apt no 32 d:6", "description": null, "lat": null, "lon": null },
  "callbackUrls": {
    "pickup":    "https://…/packets/…/pickup?token=…",
    "delivered": "https://…/packets/…/delivered?token=…",
    "cancel":    "https://…/packets/…/cancel?token=…"
  }
}
```

**Alanlar:**
| Alan | Açıklama |
|------|----------|
| `id` / `platformCode` / `dailyOrderNo` | Paket kimliği / platform kodu / günlük sıra no — **idempotency** için `id` kullanın |
| `products[]` | `id`, `name` (ürün adı), `price` (satır fiyatı — opsiyon/indirim dahil hesaplanır), `quantity`, `options[].name` |
| `source` | Kanal (`pos`, `yemeksepeti`…) |
| `note` | Sipariş notu |
| `totalAmount` / `totalDiscount` | Sipariş toplamı / indirim |
| `paymentMethod` | `Online` (ödendi) veya ödeme notu / `Belirtilmemiş` (kapıda) |
| `createdAt` | Oluşma anı — UTC `YYYY-MM-DD HH:mm:ss` |
| `scheduledAt` | İleri-tarihli teslim (yoksa `null`) |
| `customer` / `address` | **Yalnız eklentiye `customers:read` izni verildiyse gelir** (`fullName`/`phoneNumber` + `address.text/lat/lon`). İzin yoksa **hiç bulunmaz** → kurye teslimat yapamaz. |
| `callbackUrls` | **Yalnız eklentiye `packets:status` izni verildiyse gelir.** Paket durumu değişince ilgili URL'i çağırarak bize bildirin (aşağıda). İzin yoksa **hiç bulunmaz.** |

> **İç/iş alanları** (maliyet, reçete, log, iç id'ler) **hiçbir zaman** forward edilmez. Tenant kimliği body'de değil `x-restomenum-server-id` başlığındadır.

## Statü bildirimi (kurye → bize)
Order'da `callbackUrls` geldiyse, paketin durumu değiştikçe ilgili URL'i **POST veya GET** ile çağırın:

| Aksiyon | Anlamı |
|---------|--------|
| `pickup` | Paket kuryede — teslim alındı (yola çıktı) |
| `delivered` | Teslim edildi |
| `cancel` | İptal edildi |

- URL'ler **token'lı**; ekstra auth gerekmez — size verilen URL'i aynen çağırın.
- **Idempotent:** teslim edildi/iptal sonrası tekrar çağırmak durumu değiştirmez (güvenle yeniden deneyebilirsiniz).
- Yanıt `{ "success": true, "status": "..." }`.

**Yanıt sözleşmesi:** İsteği aldığınızda **`2xx`** dönün (ack). `2xx` dışında / 8sn'de yanıt vermezseniz Restomenum **yeniden dener** (retry) — yani işleme alındıysa hızlıca 2xx dönün, ağır işi arka plana atın.

**Güvenlik notu:** Bu forward **şu an imzasız** gelir (yalnız HTTPS). Doğrulamak isterseniz: (a) URL'e tahmin edilemez bir gizli yol/segment koyun (`…/paket/<gizli-token>`) ve gelen istekte kontrol edin, ya da (b) eklenti tarafına kurye-secret'ı ile HMAC imzalama eklenebilir (geliştirici talebiyle).

## Kod
- [functions/api/webhook.ts](../functions/api/webhook.ts) · [lib/mapPayload.ts](../lib/mapPayload.ts) · [lib/sig.ts](../lib/sig.ts) · [lib/kv.ts](../lib/kv.ts)

## Payload map'leme (lib/mapPayload.ts)
- **Ham veri forward edilmez.** Gelen event, sabit/temiz bir **`order`** formatına çevrilir.
- **Müşteri (PII):** `customer` + `address` blokları **yalnız** eklentiye `customers:read` izni verildiyse gönderilir; yoksa hiç eklenmez.
- **Asla forward edilmez:** ürün maliyeti, reçete, görsel ve sipariş satırının iç alanları.
- **Satır fiyatı:** `products[].price` opsiyon + ek ücret + indirim dahil hesaplanır.
- **`source`:** kanal kodu okunabilir kaynak adına eşlenir.
- Bilinmeyen event tipleri → yalnız minimal zarf (içerik forward edilmez).

## Dikkat (prod)
- Kurye URL'ine forward **timeout'lu** (`AbortSignal.timeout(8000)`, `FORWARD_TIMEOUT_MS`) — handler asılmaz; timeout → 504, diğer hata → 502 (ikisi de retry).
- Kurye sistemine giden isteği imzalamak istersen kendi secret'ınla HMAC ekle (kurye tarafı doğrulasın).
- **Kurye gerçek teslim adresi/ad/telefonunu ancak eklentiye `customers:read` + PII consent verilirse alır** (yoksa `customer` bloğu gelmez → kurye teslimat yapamaz). Manifest'te `customers:read` istemek + kurulumda consent gerekir.
