// Restomenum webhook alıcısı (Pages Function). İki tür istek (imza doğrulaması ortak):
//   - `type:'action'` → UI buton action-hook (senkron, JSON {success,message} döner). Ör: packet.sendToCourier.
//   - event (packet.created…) → idempotency → mapEventPayload → courierUrl'e forward (200/5xx retry).
import { verifySignature } from '../../lib/sig';
import { getInstall, getConfig, wasProcessed, markProcessed, type Env } from '../../lib/kv';
import { mapEventPayload } from '../../lib/mapPayload';

// Kurye URL'ine forward üst sınırı — yavaş/asılı kurye webhook handler'ını bloklamasın.
const FORWARD_TIMEOUT_MS = 8000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const raw = await request.text(); // HAM gövde (imza için şart — parse'tan önce)
  let envlp: any;
  try {
    envlp = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const inst = await getInstall(env, envlp.serverId);
  if (!inst) return new Response('unknown tenant', { status: 404 });

  if (!(await verifySignature(inst.webhookSecret, raw, request.headers.get('x-restomenum-signature')))) {
    return new Response('bad signature', { status: 401 }); // imza geçersiz → reddet
  }

  // ── UI action-hook (paket detay buton tıklaması) — SENKRON, JSON {success,message} döner ──
  // (Event akışından ayrı: autoForward/idempotency uygulanmaz; kullanıcı manuel tetikler.)
  if (envlp.type === 'action') {
    if (envlp.hook === 'packet.sendToCourier') {
      const acfg = await getConfig(env, envlp.serverId);
      if (!acfg?.courierUrl) return Response.json({ success: false, message: 'Kurye adresi ayarlı değil' });
      try {
        const r = await fetch(acfg.courierUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-restomenum-plugin': 'kurye',
            'x-restomenum-event': 'manual.sendToCourier',
            'x-restomenum-server-id': String(envlp.serverId || ''),
          },
          body: JSON.stringify({ event: 'manual.sendToCourier', serverId: envlp.serverId, packetId: envlp.packetId ?? null, occurredAt: envlp.occurredAt }),
          signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
        });
        if (!r.ok) return Response.json({ success: false, message: 'Kurye yanıt vermedi' });
        return Response.json({ success: true, message: 'Kuryeye gönderildi' });
      } catch {
        return Response.json({ success: false, message: 'Kuryeye ulaşılamadı' });
      }
    }
    return Response.json({ success: false, message: 'Bilinmeyen aksiyon' });
  }

  if (await wasProcessed(env, envlp.id)) return new Response('dup', { status: 200 }); // idempotency

  const cfg = await getConfig(env, envlp.serverId);
  if (!cfg?.courierUrl) {
    await markProcessed(env, envlp.id); // ayar yok → yapılacak iş yok, ack
    return new Response('no courier url', { status: 200 });
  }
  if (cfg.autoForward === false) {
    await markProcessed(env, envlp.id); // otomatik iletim KAPALI → forward etme, ack
    return new Response('auto-forward off', { status: 200 });
  }

  // Ham/iç veriyi forward ETME → tutarlı, scope-gated map'lenmiş payload (customers:read yoksa müşteri yok).
  // callbackUrls backend tarafından (packets:status varsa) data'ya konur → mapper pass-through eder.
  const payload: any = mapEventPayload(envlp, inst);

  try {
    const r = await fetch(cfg.courierUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-restomenum-plugin': 'kurye',
        'x-restomenum-event': String(envlp.type || ''),
        'x-restomenum-server-id': String(envlp.serverId || ''), // tenant ayrımı (body order — serverId taşımaz)
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS), // 8s sonra abort → handler asılmaz
    });
    if (!r.ok) return new Response('courier non-2xx', { status: 502 }); // → Restomenum retry
  } catch (e: any) {
    // timeout → 504, diğer ağ hatası → 502 (ikisi de 5xx → markProcessed YOK → retry)
    const timedOut = e?.name === 'TimeoutError';
    return new Response(timedOut ? 'courier timeout' : 'courier failed', { status: timedOut ? 504 : 502 });
  }

  await markProcessed(env, envlp.id); // başarıyla işlendi
  return new Response('ok', { status: 200 });
};
