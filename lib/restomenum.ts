// Restomenum platform istemcisi — OAuth Connect code exchange (Workers fetch).
import { type Env } from './kv';

export type ExchangeResult = {
  apiKey: string;
  webhookSecret: string;
  serverId: string;
  scopes: string[];
  pluginId: string;
  version: string;
};

/** OAuth Connect: authorization code'u per-install credential ile takas et (sunucu-sunucu). */
export async function exchangeCode(env: Env, code: string): Promise<ExchangeResult> {
  const r = await fetch(`${env.RESTOMENUM_BASE}/plugin-api/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: env.PLUGIN_ID,
      client_secret: env.CLIENT_SECRET,
    }),
  });
  const j: any = await r.json();
  if (!j?.success) throw new Error('exchange_failed: ' + (j?.message || r.status));
  return j.data as ExchangeResult;
}
