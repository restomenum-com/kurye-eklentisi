# 00 — Genel Bakış

## Amaç
**Dinamik kurye entegrasyonu.** Restomenum'da yeni paket siparişi oluşunca, paket içeriğini restoranın
belirlediği bir **hedef URL**'e (kurye/entegrasyon sistemi) iletmek. Hedef URL **her restorana özel**
(tenant başına) olduğu için "dinamik".

## Neden bu mimari
- **Webhook-only:** Restomenum 3. parti kodu kendi altyapısında çalıştırmaz → eklenti event'i webhook ile
  alır, kendi sunucusunda (Cloudflare Pages/Workers) işler.
- **Tenant başına credential + config:** her restoran ayrı kurulum → ayrı `webhookSecret` (imza) + ayrı
  `courierUrl` (hedef). `serverId` ile ayrıştırılır.
- **OAuth Connect:** restoran hiçbir secret yapıştırmaz; kurulum sonrası credential sunucudan sunucuya gelir.

## Uçtan uca akış
```
1) KUR + BAĞLAN (OAuth Connect)
   Restoran panelde "Kur" → Restomenum install → tarayıcı /api/connect?code=...
   /api/connect → code'u exchange → { apiKey, webhookSecret, serverId } → KV install:{serverId}

2) AYAR (hedef URL)
   Restoran eklenti ayar ekranını (iframe /embed) açar → kurye hedef URL'ini girer
   /embed → getSessionToken → /api/config (POST) → KV config:{serverId} = { courierUrl }

3) PAKET → KURYE (asıl iş)
   Yeni paket → Restomenum packet.created → POST /api/webhook (HMAC imzalı)
   /api/webhook → imza doğrula → config:{serverId}.courierUrl → paket içeriğini oraya POST
```

## Parçalar
| Uç | Sorumluluk | Doküman |
|----|-----------|---------|
| `/api/connect` | OAuth Connect credential alma | [01](01-kurulum-connect.md) |
| `/api/webhook` | packet.created → forward | [02](02-webhook-paket-yonlendirme.md) |
| `/embed` + `/api/config` | hedef URL ayarı | [03](03-ayar-ekrani-config.md) |

## Abone olunan event + scope'lar
- Event: **`packet.created`** (yeni paket).
- Scope: **`events:subscribe`** (webhook için zorunlu) + **`orders:read`** (paket içeriği) + **`ui:page`** (ayar ekranı).
- (PII — müşteri ad/telefon/adres — gerekiyorsa `customers:read` + consent; aksi halde paket payload'unda PII kırpık gelir.)
