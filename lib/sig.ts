// Webhook HMAC imza doğrulama — **Web Crypto** (Cloudflare Workers runtime; node:crypto YOK).
// Header: X-Restomenum-Signature: t=<unixSec>,v1=<HMAC_SHA256(webhookSecret, "<t>.<rawBody>")> (hex)

const TOLERANCE_SEC = 300; // ±5dk replay

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Sabit-zamanlı karşılaştırma (her iki taraf da 64-char sha256 hex → uzunluk hep eşit).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifySignature(secret: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!secret || !header) return false;
  let t: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (k === 't') t = val;
    else if (k === 'v1') v1 = val;
  }
  if (!t || !v1) return false;
  const tn = Number(t);
  if (!Number.isFinite(tn)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - tn) > TOLERANCE_SEC) return false; // eskimiş/replay

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${tn}.${rawBody}`));
  return timingSafeEqual(toHex(sig), v1);
}
