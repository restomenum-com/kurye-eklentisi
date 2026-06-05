# 03 — Ayar Ekranı: kurye hedef URL'i (`/embed` + `/api/config`)

## Amaç
Restoranın, "yeni paket geldiğinde içeriğin POST edileceği **hedef URL**"i girip kaydetmesi. Bu, eklentinin
iframe ayar sayfasında (panelden "Aç"/"Ayarlar") yapılır; değer eklentinin DB'sine (KV) tenant başına yazılır.

## Akış
```
Panel → eklenti ayar sayfası (iframe): https://<app>.pages.dev/embed   (sandboxed, token YOK)
/embed (statik HTML):
   1. bridge.getSessionToken() → JWT  (App Bridge, parent panel imzalatır)
   2. GET /api/config  (Authorization: Bearer <JWT>)  → mevcut courierUrl + autoForward
   3. kullanıcı URL girer + "Otomatik kuryeye ilet" toggle'ını seçer → POST /api/config { courierUrl, autoForward }
/api/config (GET/POST):
   - verifySessionToken(Bearer) → güvenilir serverId   (yoksa 401)
   - GET  → config:{serverId} { courierUrl, autoForward } döner (autoForward varsayılan açık)
   - POST → https doğrula → KV config:{serverId} = { courierUrl, autoForward } yaz
```

## "Otomatik kuryeye ilet" toggle (`autoForward`)
- **Açık (varsayılan):** yeni paket geldiğinde webhook kuryeye **otomatik** forward edilir.
- **Kapalı:** webhook gelir, doğrulanır ve **ack** edilir ama kuryeye **gönderilmez** (`/api/webhook` → `200 auto-forward off`).
- Eski kayıtlarda alan yoksa **açık** sayılır (geriye dönük uyumlu; `autoForward !== false`).

## Mantık / neden
- **iframe'in Restomenum token'ı yoktur** (sandboxed, ayrı origin). Tenant kimliğini **session token** ile
  alır: `getSessionToken` → JWT (Restomenum'un install `webhookSecret`'ı ile imzalı).
- **Backend doğrular:** `/api/config`, JWT'yi `verifySessionToken` ile doğrular → `serverId` **güvenilir**.
  Böylece bir restoran başka restoranın ayarını değiştiremez (serverId token'dan gelir, client'tan değil).
- **https zorunlu:** kurye URL'ine forward edeceğiz; en azından https iste (SSRF/temizlik).
- Ayar **eklentinin kendi DB'sinde** (config:{serverId}) tutulur — Restomenum'da değil (eklenti verisi).

## Kod
- [public/embed/index.html](../public/embed/index.html) · [functions/api/config.ts](../functions/api/config.ts) · [lib/jwt.ts](../lib/jwt.ts)

## Dikkat (prod)
- App Bridge `postMessage` targetOrigin'i prod'da `'*'` yerine panel origin'i olmalı.
- URL doğrulamasını güçlendir (host whitelist / private-IP engelle) istersen.
- iframe host (Cloudflare Pages) **framing'e izin vermeli** (X-Frame-Options yok — Pages default ✓).
