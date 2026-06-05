# 01 — Kurulum & OAuth Connect (`/api/connect`)

## Amaç
Restoran eklentiyi kurunca, eklentinin Restomenum ile konuşacağı **credential'ları** (per-install
`apiKey` + `webhookSecret`) **manuel yapıştırma olmadan** almak ve saklamak.

## Akış
```
Restoran panelde "Kur" → scope onayı → Restomenum install (pending)
   → tarayıcı: https://<app>.pages.dev/api/connect?code=<tek-kullanım>&state=<csrf>
/api/connect (GET):
   1. code'u al  (PROD: state'i CSRF için doğrula)
   2. POST {RESTOMENUM_BASE}/plugin-api/oauth/token
        { grant_type:"authorization_code", code, client_id:PLUGIN_ID, client_secret:CLIENT_SECRET }
   3. ← { apiKey, webhookSecret, serverId, scopes, pluginId, version }
   4. KV'ye yaz:  install:{serverId} = { apiKey, webhookSecret, scopes, ... }
   5. /connected sayfasına yönlendir
```

## Mantık / neden
- **code tek-kullanımlık + kısa ömürlü** (Restomenum üretir, redirect ile gelir). Exchange sunucudan
  sunucuya (`client_secret` ile) → tarayıcıya secret düşmez.
- **`serverId` = tenant anahtarı.** Tüm sonraki işlemler (webhook doğrulama, config, forward) bu
  `serverId` ile yapılır. Her restoran ayrı kayıt.
- **`webhookSecret` saklanır** → webhook imzasını + session token'ı doğrulamak için (sonraki dokümanlar).
- **`apiKey` saklanır** → (gerekirse) Restomenum Callback API'sini çağırmak için (`Authorization: Bearer apiKey`).

## Kod
- [functions/api/connect.ts](../functions/api/connect.ts) · [lib/restomenum.ts](../lib/restomenum.ts) · [lib/kv.ts](../lib/kv.ts)

## Dikkat (prod)
- `CLIENT_SECRET` yalnız env (asla repo/tarayıcı).
- `state` doğrulaması (CSRF) prod'da eklenmeli.
- Exchange hatası → 502 + log; restoran "bağlanamadı" görür, tekrar dener (panelde "Bağlan").
