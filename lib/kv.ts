// DB katmanı — Cloudflare Workers KV (Pages Functions binding `env.KV`).
//   install:{serverId}   → OAuth Connect credential'ları (apiKey, webhookSecret)
//   config:{serverId}    → tenant'ın kurye hedef URL'i (ayar ekranından)
//   processed:{eventId}  → webhook idempotency (başarıyla işlenince, 7g TTL)
//
// Workers'da global process.env YOK → her şey `env` (Pages Function context) üzerinden gelir.

export interface Env {
  KV: KVNamespace;
  RESTOMENUM_BASE: string;
  PLUGIN_ID: string;
  CLIENT_SECRET: string;
}

export type Install = {
  apiKey: string;
  webhookSecret: string;
  scopes: string[];
  pluginId: string;
  version: string;
  connectedAt: number;
};
// mirrorUrl: TEST/DEBUG — Restomenum'dan gelen TÜM ham istekler (event/action/hook) ayrıca buraya
// (webhook.site) yansıtılır; ayırt edici flag ile (lib/mirror.ts). Boş → kapalı. Kurye akışını etkilemez.
// statusGate: TEST — packet.status.update gate'inin allow/deny davranışını iframe'den kontrol etmek için.
// mode 'deny' → her statü geçişini reddet (panelde mesaj görünür); 'allow'/yok → izin ver. message: deny metni.
// Her hook'un kendi allow/deny toggle'ı (iframe'den ayarlanır): statusGate→packet.status.update,
// closeGate→packet.close, tableCloseGate→table.close. Hepsi bağımsız.
export type GateConfig = { mode: 'allow' | 'deny'; message?: string };
export type Config = { courierUrl: string; autoForward?: boolean; mirrorUrl?: string; statusGate?: GateConfig; closeGate?: GateConfig; tableCloseGate?: GateConfig; updatedAt: number };

export const getInstall = (env: Env, serverId: string) => env.KV.get<Install>(`install:${serverId}`, 'json');
export const saveInstall = (env: Env, serverId: string, i: Install) => env.KV.put(`install:${serverId}`, JSON.stringify(i));

export const getConfig = (env: Env, serverId: string) => env.KV.get<Config>(`config:${serverId}`, 'json');

// Desen B — gate onay state'i (iframe yazar, webhook okur). Anahtar tenant+refId; KISA TTL (alakasız geç kapanış
// allow almasın). decision: iframe'de seçilen karar; webhook bunu okuyup allow/deny verir.
export type GateApproval = { decision: 'allow' | 'deny'; message?: string; by?: string; at: number };
export const setGateApproval = (env: Env, serverId: string, refId: string, a: GateApproval, ttlSec = 600) =>
  env.KV.put(`gate:${serverId}:${refId}`, JSON.stringify(a), { expirationTtl: ttlSec });
export const getGateApproval = (env: Env, serverId: string, refId: string) =>
  env.KV.get<GateApproval>(`gate:${serverId}:${refId}`, 'json');
export const saveConfig = (env: Env, serverId: string, c: Config) => env.KV.put(`config:${serverId}`, JSON.stringify(c));

// Idempotency: BAŞARIYLA işlenince işaretle (forward başarısız olursa retry tekrar denesin).
export const wasProcessed = async (env: Env, eventId: string) => (await env.KV.get(`processed:${eventId}`)) != null;
export const markProcessed = (env: Env, eventId: string) => env.KV.put(`processed:${eventId}`, '1', { expirationTtl: 7 * 24 * 3600 });
