# Kurye Eklentisi — Restomenum Plugin (Cloudflare Pages)

Restomenum için **dinamik kurye entegrasyonu** eklentisi. Yeni bir paket siparişi oluşturulduğunda, paket
içeriğini restoranın belirlediği bir **hedef URL**'e iletir. Her restoran kendi kurye/entegrasyon adresini
girer → "dinamik".

> **Canlı:** https://restomenum-kurye-eklentisi.pages.dev · **Çalışan referans eklenti** (connect + ayar +
> webhook teslimi uçtan uca doğrulandı). Adım adım mantık: [`docs/`](docs/README.md).

## Ne yapar
1. **Kurulum (OAuth Connect):** restoran eklentiyi kurar → tek-kullanımlık `code` → eklenti backend'i bunu
   `apiKey` + `webhookSecret` ile takas eder (manuel anahtar yapıştırma yok).
2. **Ayar (iframe):** restoran panelde "yeni paket içeriği hangi adrese POST edilsin?" URL'ini girer.
3. **Teslim:** Restomenum'da paket oluşunca `packet.created` → eklenti **webhook** ile alır (HMAC doğrular) →
   o tenant'ın kayıtlı **hedef URL**'ine paketi **POST** eder.

## Mimari — Cloudflare Pages (build YOK)
```
functions/api/connect.ts   OAuth Connect: code → exchange → KV install kaydı
functions/api/webhook.ts   packet.created → HMAC doğrula → tenant kurye URL'ine forward
functions/api/config.ts    ayar ekranı backend (session token auth) — kurye URL oku/yaz
public/index.html          landing
public/embed/index.html    iframe ayar UI (App Bridge → /api/config)
public/connected/          connect sonrası bilgi sayfası
lib/kv.ts                  Workers KV (install / config / processed)
lib/sig.ts                 webhook HMAC doğrulama (Web Crypto)
lib/jwt.ts                 session token doğrulama (Web Crypto — HS256)
lib/restomenum.ts          OAuth token exchange (fetch)
wrangler.toml              Pages + KV binding + vars
```
- **Sıfır npm runtime bağımlılığı** — imza/JWT/crypto tamamen **Web Crypto** (Workers-native). Bundle temiz.

## Veri (Workers KV)
| Anahtar | İçerik | TTL |
|--------|--------|-----|
| `install:{serverId}` | `apiKey`, `webhookSecret`, scopes | yok (kalıcı) |
| `config:{serverId}` | `courierUrl` (kurye hedef URL'i) | yok (kalıcı) |
| `processed:{eventId}` | idempotency işareti | 7 gün |

## Uçlar
| Uç | Metot | Auth | İş |
|----|-------|------|-----|
| `/api/connect` | GET | code (redirect) | exchange → KV install |
| `/api/webhook` | POST | HMAC imzası | packet.created → forward |
| `/api/config` | GET/POST | session token (JWT) | kurye URL oku/yaz |
| `/embed/` | GET | — (iframe) | ayar ekranı |

## Güvenlik
- **Webhook:** `X-Restomenum-Signature: t=<unixSec>,v1=<HMAC_SHA256(webhookSecret,"<t>.<rawBody>")>` —
  ham gövde üzerinden, **±5dk** replay toleransı, sabit-zamanlı karşılaştırma.
- **Session token:** iframe'in tenant kimliği — install `webhookSecret`'ı ile imzalı HS256 JWT;
  `alg`/`iss`/`aud`/`exp` doğrulanır (alg-confusion'a kapalı). `serverId` token'dan gelir → tenant izolasyonu.
- **Same-apex:** webhook/connect/ui aynı kayıtlı domain (`pages.dev`).
- **Secret'lar repo dışı:** `CLIENT_SECRET` → Cloudflare secret; `.dev.vars` gitignore'lu.

### ⚠️ App Bridge postMessage origin — wildcard `'*'` KULLANMA
Custom UI iframe'i, host panel ile `postMessage` üzerinden konuşur. Bu çağrılarda `targetOrigin` olarak
**wildcard `'*'` kullanmak güvenlik riskidir ve eklenti kabul edilmez.**

`'*'` ile: iframe'iniz kötü niyetli bir sayfa tarafından çerçevelenirse (clickjacking), gönderdiğiniz bridge
mesajları o sayfaya sızabilir ve size sahte yanıt enjekte edilebilir.

**Zorunlu:** mesajları yalnız host panel origin'ine **pinli** gönderin + gelen mesajda `event.origin`'i doğrulayın:
```js
var HOST_ORIGIN = 'https://<host-panel-origin>';
window.parent.postMessage({ ... }, HOST_ORIGIN);                 // '*' DEĞİL
window.addEventListener('message', (e) => { if (e.origin !== HOST_ORIGIN) return; /* ... */ });
```

> Bu repodaki `public/embed/index.html` şu an geliştirme kolaylığı için `'*'` kullanıyor — **yayın öncesi**
> yukarıdaki gibi pinlenmeli; aksi halde eklenti review'dan geçmez.

## Kurulum & Deploy
```bash
npm install
npx wrangler login
npx wrangler kv namespace create KURYE_KV          # id → wrangler.toml [[kv_namespaces]]
npx wrangler pages secret put CLIENT_SECRET        # GİZLİ
npm run deploy                                     # = wrangler pages deploy public
```
Veya **GitHub entegrasyonu**: Cloudflare → Pages → Connect to Git → bu repo (Build output: `public`,
build command yok). KV binding (`KV`) + vars (`RESTOMENUM_BASE`, `PLUGIN_ID`) + secret (`CLIENT_SECRET`) ekle.

### Ortam değişkenleri
| Değişken | Yer | Tür |
|----------|-----|-----|
| `RESTOMENUM_BASE` | wrangler.toml `[vars]` | public |
| `PLUGIN_ID` | wrangler.toml `[vars]` | public |
| `CLIENT_SECRET` | Cloudflare secret | **gizli** |
| `KV` | KV namespace binding | — |

#### Restomenum plugin API base (`RESTOMENUM_BASE`)
OAuth token exchange + Callback API bu base üzerinden çağrılır. Ortamına göre birini kullan:

| Ortam | `RESTOMENUM_BASE` |
|-------|-------------------|
| **Sandbox / test** | `https://sandbox.plugins.restomenum.app` |
| **Production** | `https://plugins.restomenum.app` |

> Statü `callbackUrls` ve webhook imzaları Restomenum tarafından **mutlak** üretilir; bu base'i yalnız
> OAuth exchange + Callback API çağrıların için kullanırsın. Test için sandbox, canlı için prod değerini ver.

### Yerel geliştirme
```bash
cp .dev.vars.example .dev.vars     # değerleri doldur
npm run dev                        # wrangler pages dev public → http://localhost:8788
```

## Portal manifest (örnek)
```jsonc
{
  "webhookUrl": "https://<proje>.pages.dev/api/webhook",
  "connectUrl": "https://<proje>.pages.dev/api/connect",
  "manifest": {
    "events": ["packet.created"],
    "requestedScopes": ["events:subscribe", "orders:read", "ui:page"],
    "pages": [{ "id": "settings", "customUiOrigin": "https://<proje>.pages.dev", "path": "/embed/", "title": { "tr": "Kurye Ayarları" } }],
    "settingsPageId": "settings"
  }
}
```

## Dokümantasyon
Her adımın mantığı/akışı: [`docs/`](docs/README.md) — kurulum-connect, webhook-paket-yönlendirme, ayar ekranı,
manifest-deploy. Başka eklenti geliştiriciler için referans.

## Doğrulanan davranış (özet)
| Senaryo | Yanıt |
|---------|-------|
| geçerli imza + packet.created | 200 + kurye URL'ine forward |
| imzasız / yanlış / bozuk imza | 401 |
| bilinmeyen tenant | 404 |
| replay / gelecek timestamp (±5dk dışı) | 401 |
| gövde değiştirilmiş | 401 |
| aynı eventId tekrar (idempotency) | 200 (forward yok) |
| packet dışı event | 200 (forward yok) |
| kurye 5xx | 502 (markProcessed yok → retry) |
| kurye 8s'de yanıt vermez (timeout) | 504 (abort → retry) |
| session token yok / çöp / alg:none | 401 |
