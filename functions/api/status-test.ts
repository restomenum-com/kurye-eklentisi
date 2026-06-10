// TEST harness backend'i (iframe) — packet.status.update gate'ini denemek için.
//   GET  /api/status-test            → mevcut gate modu (allow/deny + mesaj)
//   POST /api/status-test {mode,message}        → gate modunu kaydet (action.ts bunu okuyup allow/deny döner)
//   POST /api/status-test {createPacket:true}   → orders:write ile test paketi oluştur (gate'i açar: callbackUrl damgası)
// Auth: iframe session token (Bearer JWT) → verifySessionToken → güvenilir serverId.
import { verifySessionToken } from '../../lib/jwt';
import { getInstall, getConfig, saveConfig, type Env } from '../../lib/kv';
import { fetchFirstProductId, createTestPacket } from '../../lib/restomenum';

// gate paramı: 'close' → closeGate (packet.close); aksi → statusGate (packet.status.update).
const gateField = (g: string | null | undefined) => (g === 'close' ? 'closeGate' : 'statusGate') as 'closeGate' | 'statusGate';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const field = gateField(new URL(request.url).searchParams.get('gate'));
  const cfg = await getConfig(env, ctx.serverId);
  return Response.json({ ok: true, mode: cfg?.[field]?.mode || 'deny', message: cfg?.[field]?.message || '' }); // TEST: varsayılan deny (action.ts ile tutarlı)
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body: any = await request.json().catch(() => ({}));

  // (a) Test paketi oluştur → gate'in üzerinde çalışacağı, eklenti-sahipli bir paket.
  if (body?.createPacket) {
    const inst = await getInstall(env, ctx.serverId);
    if (!inst?.apiKey) return Response.json({ ok: false, message: 'Eklenti bağlı değil (apiKey yok)' }, { status: 400 });
    const productId = await fetchFirstProductId(env, inst.apiKey);
    if (!productId) return Response.json({ ok: false, message: 'Ürün bulunamadı (products:read scope + en az 1 ürün gerekir)' }, { status: 400 });
    // callbackUrl = sahiplik damgası; webhookUrl ile AYNI domain olmalı → kendi origin'imizdeki webhook ucu.
    const callbackUrl = new URL(request.url).origin + '/api/webhook';
    const r = await createTestPacket(env, inst.apiKey, productId, callbackUrl);
    if (!r.ok) return Response.json({ ok: false, message: 'Paket oluşturulamadı: ' + r.message }, { status: 400 });
    return Response.json({ ok: true, packetId: r.packetId });
  }

  // (b) Gate modunu kaydet (allow/deny + mesaj). gate paramı hangi field'a yazılacağını seçer. MERGE.
  const field = gateField(body?.gate);
  const mode = body?.mode === 'deny' ? 'deny' : 'allow';
  const message = String(body?.message || '').slice(0, 300);
  const cfg = (await getConfig(env, ctx.serverId)) || ({ courierUrl: '', updatedAt: 0 } as any);
  await saveConfig(env, ctx.serverId, { ...cfg, [field]: { mode, message: message || undefined }, updatedAt: Date.now() });
  return Response.json({ ok: true, mode, message });
};
