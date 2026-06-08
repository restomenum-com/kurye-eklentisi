// iframe App Bridge session token doğrulama — **Web Crypto** (jose YOK → sıfır npm bağımlılığı).
// HS256 JWT: base64url(header).base64url(payload).base64url(HMAC_SHA256(secret,"header.payload"))
// Doğrulama: payload'tan serverId → o install'ın webhookSecret'ı ile imza + alg/iss/aud/exp kontrolü.
import { getInstall, type Env } from './kv';

export type SessionCtx = { serverId: string; pluginId: string; uid?: string; role?: string };

function b64urlToBytes(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4 ? '='.repeat(4 - (t.length % 4)) : '';
  const bin = atob(t + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToString(s: string): string {
  return new TextDecoder().decode(b64urlToBytes(s));
}

export async function verifySessionToken(bearer: string | null, env: Env): Promise<SessionCtx | null> {
  const token = bearer?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(b64urlToString(h));
    payload = JSON.parse(b64urlToString(p));
  } catch {
    return null;
  }
  // claim'ler (key seçimi öncesi ucuz kontroller)
  if (!header || header.alg !== 'HS256') return null;            // alg-confusion / "none" koruması
  if (!payload || payload.iss !== 'restomenum') return null;
  if (payload.aud !== env.PLUGIN_ID) return null;
  if (!payload.tenantId) return null;

  const inst = await getInstall(env, payload.tenantId);
  if (!inst) return null;

  // imza doğrula (HMAC-SHA256 over "header.payload" with webhookSecret)
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(inst.webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;

  // exp / iat — exp ZORUNLU (kısa-ömürlü token; exp'siz = kalıcı kredensiyel → red)
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || now > payload.exp) return null;          // exp yok/süresi dolmuş
  if (typeof payload.iat === 'number' && payload.iat - now > 60) return null;     // ileri-tarihli (60s skew)

  return { serverId: String(payload.tenantId), pluginId: String(payload.pluginId), uid: payload.sub, role: payload.role };
}
