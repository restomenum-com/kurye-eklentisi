// Restomenum platform istemcisi — OAuth Connect code exchange + Callback API okuma (Workers fetch).
import { type Env } from './kv';

/**
 * Paket detayını ID ile çek (Callback API — `GET /plugin-api/packets/get`, install apiKey, orders:read).
 * Standart: action/iframe yalnız `packetId` taşır → dolu order'ı buradan çekeriz. Bulunamaz/hata → null.
 */
export async function fetchPacket(env: Env, apiKey: string, packetId: string): Promise<any | null> {
  try {
    const r = await fetch(`${env.RESTOMENUM_BASE}/plugin-api/packets/get?packetId=${encodeURIComponent(packetId)}`, {
      headers: { authorization: 'Bearer ' + apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.success) return null;
    return j.data;
  } catch {
    return null;
  }
}

/**
 * TEST — ürün kataloğundan ilk ürünü çek (Callback API — `GET /plugin-api/products/list`, products:read).
 * Test paketi için bir ürün id'si gerekir. Yoksa null.
 */
export async function fetchFirstProductId(env: Env, apiKey: string): Promise<string | null> {
  try {
    const r = await fetch(`${env.RESTOMENUM_BASE}/plugin-api/products/list`, {
      headers: { authorization: 'Bearer ' + apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.success || !Array.isArray(j.data)) return null;
    const pick = j.data.find((p: any) => p && p.id);
    return pick ? String(pick.id) : null;
  } catch { return null; }
}

/**
 * TEST — kurye-SAHİPLİ paket oluştur (Callback API — `POST /plugin-api/packets/create`, orders:write).
 * `callbackUrl` (kurye domaini) → `pluginStatusCallback.pluginId`=kurye damgalanır → packet.status.update gate'i
 * bu pakette KURYEYE sorulur (pending testi için şart). @returns {ok, packetId?, message?}
 */
export async function createTestPacket(env: Env, apiKey: string, productId: string, callbackUrl: string): Promise<{ ok: boolean; packetId?: string; message?: string }> {
  try {
    const r = await fetch(`${env.RESTOMENUM_BASE}/plugin-api/packets/create`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        customer: { id: 'gatetest-' + Date.now(), name: 'Gate Test Müşteri', address: 'Test Adres 1' },
        paymentNote: 'test',
        cart: [{ product: productId, quantity: 1 }],
        note: 'pending gate testi',
        callbackUrl,
        idempotencyKey: 'gatetest-' + Date.now(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.success) return { ok: false, message: (j && j.message) || ('HTTP ' + r.status) };
    return { ok: true, packetId: j.data?.packetId };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'network' };
  }
}

/**
 * Pending gate'i çöz (Callback API — `POST /plugin-api/packets/gate-resolve`, install apiKey, hooks:packet.status).
 * packet.status.update'te 'pending' döndükten sonra held geçişi uygular (allow) / iptal eder (deny). `to` opsiyonel
 * (backend pendingGate.to'yu kullanır). @returns {ok, message?}
 */
export async function gateResolve(env: Env, apiKey: string, packetId: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; message?: string }> {
  try {
    const r = await fetch(`${env.RESTOMENUM_BASE}/plugin-api/packets/gate-resolve`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ packetId, decision }),
      signal: AbortSignal.timeout(8000),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.success) return { ok: false, message: (j && j.message) || ('HTTP ' + r.status) };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'network' };
  }
}

/**
 * Mağazanın açık paketlerini çek (Callback API — `GET /plugin-api/packets/open`, install apiKey, orders:read).
 * Özet liste döner (satır/müşteri yok); hata/yetki yoksa boş dizi.
 */
export async function fetchOpenPackets(env: Env, apiKey: string): Promise<any[]> {
  try {
    const r = await fetch(`${env.RESTOMENUM_BASE}/plugin-api/packets/open`, {
      headers: { authorization: 'Bearer ' + apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.success) return [];
    return Array.isArray(j.data) ? j.data : [];
  } catch {
    return [];
  }
}

export type ExchangeResult = {
  apiKey: string;
  webhookSecret: string;
  tenantId: string;
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
