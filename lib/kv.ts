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
export type Config = { courierUrl: string; autoForward?: boolean; updatedAt: number };

export const getInstall = (env: Env, serverId: string) => env.KV.get<Install>(`install:${serverId}`, 'json');
export const saveInstall = (env: Env, serverId: string, i: Install) => env.KV.put(`install:${serverId}`, JSON.stringify(i));

export const getConfig = (env: Env, serverId: string) => env.KV.get<Config>(`config:${serverId}`, 'json');
export const saveConfig = (env: Env, serverId: string, c: Config) => env.KV.put(`config:${serverId}`, JSON.stringify(c));

// Idempotency: BAŞARIYLA işlenince işaretle (forward başarısız olursa retry tekrar denesin).
export const wasProcessed = async (env: Env, eventId: string) => (await env.KV.get(`processed:${eventId}`)) != null;
export const markProcessed = (env: Env, eventId: string) => env.KV.put(`processed:${eventId}`, '1', { expirationTtl: 7 * 24 * 3600 });
