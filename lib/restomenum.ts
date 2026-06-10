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

/**
 * TEST — ürün kataloğundan ilk aktif ürünü çek (Callback API — `GET /plugin-api/products/list`, products:read).
 * packets/create test paketi için bir ürün id'si gerekir. Yoksa null.
 */
export async function fetchFirstProductId(env: Env, apiKey: string): Promise<string | null> {
  try {
    const r = await fetch(`${env.RESTOMENUM_BASE}/plugin-api/products/list`, {
      headers: { authorization: 'Bearer ' + apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.success || !Array.isArray(j.data)) return null;
    const pick = j.data.find((p: any) => p && p.active && p.id) || j.data.find((p: any) => p && p.id);
    return pick ? String(pick.id) : null;
  } catch {
    return null;
  }
}

/**
 * TEST — yeni paket sipariş oluştur (Callback API — `POST /plugin-api/packets/create`, orders:write).
 * `callbackUrl` SAHİPLİK damgasıdır → paketi bu eklenti oluşturmuş sayılır → packet.status.update gate'i açılır.
 * @returns {Promise<{ok:boolean, packetId?:string, message?:string}>}
 */
export async function createTestPacket(env: Env, apiKey: string, productId: string, callbackUrl: string): Promise<{ ok: boolean; packetId?: string; message?: string }> {
  try {
    const r = await fetch(`${env.RESTOMENUM_BASE}/plugin-api/packets/create`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        customer: { id: 'test-' + Date.now(), name: 'Gate Test Müşteri', address: 'Test Adres 1' },
        cart: [{ product: productId, quantity: 1 }],
        paymentNote: 'test',
        note: 'packet.status.update gate testi',
        callbackUrl, // sahiplik damgası — gate'i açar
        idempotencyKey: 'gatetest-' + Date.now(),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.success) return { ok: false, message: j?.message || ('HTTP ' + r.status) };
    return { ok: true, packetId: j.data?.packetId };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'network' };
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
