# Kurye Eklentisi — Dokümanlar (indeks)



| Doküman | Konu |
|---------|------|
| [00-genel-bakis.md](00-genel-bakis.md) | Eklentinin amacı, mimari, uçtan uca akış |
| [01-kurulum-connect.md](01-kurulum-connect.md) | OAuth Connect (`/api/connect`) — credential alma mantığı |
| [02-webhook-paket-yonlendirme.md](02-webhook-paket-yonlendirme.md) | `packet.created` webhook → kurye URL'ine forward |
| [03-ayar-ekrani-config.md](03-ayar-ekrani-config.md) | iframe ayar ekranı (`/embed` + `/api/config`) — hedef URL kaydı |
| [04-manifest-deploy.md](04-manifest-deploy.md) | Portal manifest + Cloudflare deploy + test |

## Proje haritası
```
functions/api/connect   → OAuth Connect (code → exchange → KV)
functions/api/webhook   → packet.created → tenant kurye URL'ine POST
functions/api/config    → ayar ekranı backend (session token auth)
public/embed         → iframe ayar UI (kurye URL gir/kaydet)
lib/              → kv, sig (HMAC), jwt (session), restomenum (exchange)
```
