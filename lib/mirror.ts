// TEST/DEBUG aynası — Restomenum'dan gelen HER ham isteği (event/action/hook) tenant'ın setup'ta girdiği
// `mirrorUrl`'ine (webhook.site) yansıtır. Amaç: webhook'ların düşüp düşmediğini canlıda görmek.
//
// AYIRT EDİCİ FLAG (normalden ayrılsın):
//   - Header: `X-Kurye-Mirror: 1` (+ kind/event)
//   - Gövde: `{ _mirror:true, _kind, _event, _signatureValid, _receivedAt, payload:<orijinal> }`
//
// Best-effort: imzadan/idempotency'den BAĞIMSIZ, ham istek geldiği gibi yansıtılır (geçersiz imza da görünür);
// hata yutulur, ASLA kurye/ana akışı etkilemez. `ctx.waitUntil` ile arka planda çalışır (yanıtı bloklamaz).
import { getConfig, type Env } from './kv';

const MIRROR_TIMEOUT_MS = 5000;

export async function mirrorIncoming(
  env: Env,
  tenantId: string | undefined,
  opts: { kind: 'webhook' | 'action' | 'hook'; event: string; rawBody: string; signatureValid: boolean },
): Promise<void> {
  try {
    if (!tenantId) return;
    const cfg = await getConfig(env, tenantId);
    const url = cfg?.mirrorUrl;
    if (!url) return; // ayna kapalı

    let payload: unknown;
    try { payload = JSON.parse(opts.rawBody); } catch { payload = opts.rawBody; }

    const body = JSON.stringify({
      _mirror: true,                       // ← bu istek bir DEBUG aynasıdır (normal kurye forward'u DEĞİL)
      _kind: opts.kind,                    // webhook | action | hook
      _event: opts.event,                  // table.closed / packet.created / app.installed / packet.sendToCourier …
      _tenantId: tenantId,
      _signatureValid: opts.signatureValid, // imza doğrulandı mı (webhook gerçekten Restomenum'dan mı)
      _receivedAt: Date.now(),
      payload,                             // Restomenum'un gönderdiği orijinal gövde
    });

    await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-kurye-mirror': '1',
        'x-kurye-mirror-kind': opts.kind,
        'x-kurye-mirror-event': opts.event,
      },
      body,
      signal: AbortSignal.timeout(MIRROR_TIMEOUT_MS),
    });
  } catch {
    /* ayna best-effort — sessizce yut */
  }
}
