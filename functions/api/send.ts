// iframe action backend'i (Pages Function) — "Kuryeye Gönder" iframe butonu buraya POST eder.
// Auth: iframe'in session token'ı (Bearer JWT) → verifySessionToken → güvenilir serverId.
// (Hook action'dan farkı: bu çağrı IFRAME'den gelir, HMAC değil session-token ile kimliklenir.)
import { verifySessionToken } from '../../lib/jwt';
import { getConfig, type Env } from '../../lib/kv';

const FORWARD_TIMEOUT_MS = 8000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ ok: false, message: 'Oturum doğrulanamadı' }, { status: 401 });

  const body: any = await request.json().catch(() => ({}));
  const packetId = body?.packetId ? String(body.packetId) : null;

  const cfg = await getConfig(env, ctx.serverId);
  if (!cfg?.courierUrl) return Response.json({ ok: false, message: 'Kurye adresi ayarlı değil' });
  try {
    const r = await fetch(cfg.courierUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-restomenum-plugin': 'kurye',
        'x-restomenum-event': 'manual.sendToCourier',
        'x-restomenum-server-id': ctx.serverId,
      },
      body: JSON.stringify({ event: 'manual.sendToCourier', serverId: ctx.serverId, packetId, occurredAt: Date.now() }),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    if (!r.ok) return Response.json({ ok: false, message: 'Kurye yanıt vermedi' });
    return Response.json({ ok: true, message: 'Kuryeye gönderildi' });
  } catch {
    return Response.json({ ok: false, message: 'Kuryeye ulaşılamadı' });
  }
};
