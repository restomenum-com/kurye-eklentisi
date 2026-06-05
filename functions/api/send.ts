// iframe action backend'i (Pages Function) — "Kuryeye Gönder" iframe butonu buraya POST eder.
// Auth: iframe'in session token'ı (Bearer JWT) → verifySessionToken → güvenilir serverId.
// (Hook action'dan farkı: bu çağrı IFRAME'den gelir, HMAC değil session-token ile kimliklenir.)
import { verifySessionToken } from '../../lib/jwt';
import { getInstall, getConfig, type Env } from '../../lib/kv';
import { fetchPacket } from '../../lib/restomenum';
import { mapEventPayload } from '../../lib/mapPayload';

const FORWARD_TIMEOUT_MS = 8000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ ok: false, message: 'Oturum doğrulanamadı' }, { status: 401 });

  const body: any = await request.json().catch(() => ({}));
  const packetId = body?.packetId ? String(body.packetId) : null;
  if (!packetId) return Response.json({ ok: false, message: 'Paket bilgisi yok' });

  const inst = await getInstall(env, ctx.serverId);
  if (!inst) return Response.json({ ok: false, message: 'Kurulum bulunamadı' });
  const cfg = await getConfig(env, ctx.serverId);
  if (!cfg?.courierUrl) return Response.json({ ok: false, message: 'Kurye adresi ayarlı değil' });

  // Dolu order'ı okuma ucundan çek (orders:read) → kuryeye onu ilet (hook action ile aynı).
  const data = await fetchPacket(env, inst.apiKey, packetId);
  if (!data) return Response.json({ ok: false, message: 'Paket detayı okunamadı' });
  const order = mapEventPayload({ type: 'packet.created', id: '', serverId: ctx.serverId, occurredAt: Date.now(), data } as any, inst);
  try {
    const r = await fetch(cfg.courierUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-restomenum-plugin': 'kurye',
        'x-restomenum-event': 'manual.sendToCourier',
        'x-restomenum-server-id': ctx.serverId,
      },
      body: JSON.stringify(order), // ← dolu kanonik order
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
    if (!r.ok) return Response.json({ ok: false, message: 'Kurye yanıt vermedi' });
    return Response.json({ ok: true, message: 'Kuryeye gönderildi' });
  } catch {
    return Response.json({ ok: false, message: 'Kuryeye ulaşılamadı' });
  }
};
