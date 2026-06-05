// Kurye eklentisi — UI action-hook ucu (Pages Function). Webhook'tan AYRI (sektör standardı):
//   - Restomenum, buton tıklamasında manifest `actionUrl`'ine imzalı SENKRON POST eder:
//       { type:'action', hook, serverId, packetId }
//   - Biz işi yapıp **JSON `{success,message}`** döneriz (kullanıcıya toast). Retry yok, idempotency yok.
// İmza şeması webhook ile aynı (install webhookSecret) → verifySignature ortak.
import { verifySignature } from '../../lib/sig';
import { getInstall, getConfig, type Env } from '../../lib/kv';

const FORWARD_TIMEOUT_MS = 8000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const raw = await request.text(); // HAM gövde (imza için şart)
  let envlp: any;
  try {
    envlp = JSON.parse(raw);
  } catch {
    return Response.json({ success: false, message: 'bad json' }, { status: 400 });
  }

  const inst = await getInstall(env, envlp.serverId);
  if (!inst) return Response.json({ success: false, message: 'unknown tenant' }, { status: 404 });
  if (!(await verifySignature(inst.webhookSecret, raw, request.headers.get('x-restomenum-signature')))) {
    return Response.json({ success: false, message: 'bad signature' }, { status: 401 });
  }

  // hook → iş. Şimdilik tek hook: paketi manuel kuryeye gönder.
  // `level` (info|success|warning|error) → restoyeni toast stilini seçer.
  if (envlp.hook === 'packet.sendToCourier') {
    const cfg = await getConfig(env, envlp.serverId);
    if (!cfg?.courierUrl) return Response.json({ success: false, level: 'warning', message: 'Kurye adresi ayarlı değil' });
    try {
      const r = await fetch(cfg.courierUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-restomenum-plugin': 'kurye',
          'x-restomenum-event': 'manual.sendToCourier',
          'x-restomenum-server-id': String(envlp.serverId || ''),
        },
        body: JSON.stringify({
          event: 'manual.sendToCourier',
          serverId: envlp.serverId,
          packetId: envlp.packetId ?? null,
          occurredAt: envlp.occurredAt,
        }),
        signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
      });
      if (!r.ok) return Response.json({ success: false, level: 'error', message: 'Kurye yanıt vermedi' });
      return Response.json({ success: true, level: 'success', message: 'Kuryeye gönderildi' });
    } catch {
      return Response.json({ success: false, level: 'error', message: 'Kuryeye ulaşılamadı' });
    }
  }

  return Response.json({ success: false, level: 'error', message: 'Bilinmeyen aksiyon' });
};
