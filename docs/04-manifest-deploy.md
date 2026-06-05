# 04 — Portal Manifest + Cloudflare Deploy + Test

## Portal'da girilecek manifest
```jsonc
{ "version":"1.0.0",
  "webhookUrl":"https://<proje>.pages.dev/api/webhook",
  "connectUrl":"https://<proje>.pages.dev/api/connect",
  "manifest": {
    "events":["packet.created"],
    "requestedScopes":["events:subscribe","orders:read","customers:read","packets:status","ui:page"],
    "pages":[{ "id":"settings", "customUiOrigin":"https://<proje>.pages.dev", "path":"/embed", "title":{"tr":"Kurye Ayarları"} }],
    "settingsPageId":"settings"
  }
}
```
- **Same-apex:** `webhookUrl` + `connectUrl` + `pages[].customUiOrigin` hepsi `<proje>.pages.dev` (tek domain) ✓.
- Portal'da **client_secret üret** (bir kez) → Cloudflare secret `CLIENT_SECRET`.
- **`customers:read`** — kurye teslim adresi/ad/telefon için (yoksa `customer`/`address` gelmez); kurulumda PII consent ister.
- **`packets:status`** — paket durumu callback'i için (statü URL'leri yalnız bu izinle order'a eklenir).

## Cloudflare Pages deploy (wrangler — GitHub'sız)
```bash
npm install
npx wrangler login                                  # bir kez (tarayıcı onayı)

# 1) KV namespace oluştur → çıkan id'yi wrangler.toml'a yaz ([[kv_namespaces]] id=...)
npx wrangler kv namespace create KURYE_KV

# 2) gizli olmayan değişken (RESTOMENUM_BASE, PLUGIN_ID) → wrangler.toml [vars]
# 3) gizli (CLIENT_SECRET) → secret:
npx wrangler pages secret put CLIENT_SECRET

# 4) deploy
npm run deploy        # = wrangler pages deploy public  → https://<proje>.pages.dev
```
- KV/secret'ı **Cloudflare dashboard**'tan da bağlayabilirsin (Pages projesi → Settings → Functions/Variables + KV bindings).
- Deploy sonrası portal manifest URL'lerini (`/api/webhook`, `/api/connect`, `/embed`) gir + publish.
> GitHub gerekmiyor — `wrangler` dosyaları doğrudan yükler. (Git entegrasyonu istersen ayrıca bağlanabilir.)

## Test
1. **Connect:** panelden kur → `/api/connect`'e düşer → KV `install:{serverId}` oluşur → `/connected`.
2. **Ayar:** panelde "Kurye Ayarları" (iframe) → hedef URL (örn. `https://webhook.site/...`) gir → kaydet.
3. **Paket:** dev'de bir paket oluştur → `packet.created` → `/api/webhook` → `webhook.site`'a paketin düştüğünü gör.
4. Curl ile exchange taklidi (geliştirici): `POST {RESTOMENUM_BASE}/plugin-api/oauth/token {grant_type,code,client_id,client_secret}`.

## Yerel geliştirme
```
cp .dev.vars.example .dev.vars   # değerleri doldur (RESTOMENUM_BASE, PLUGIN_ID, CLIENT_SECRET)
npm install
npm run dev                       # wrangler pages dev public → http://localhost:8788 (yerel KV simülasyonu)
```
> Webhook/connect'i dışarıdan test için preview deploy daha pratik (Restomenum localhost'a erişemez).
