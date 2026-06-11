// TEST harness backend'i (iframe) — hook gate'lerinin allow/deny modunu ayarlar.
//   GET  /api/status-test?gate=<g>          → ilgili gate modu (allow/deny + mesaj)
//   POST /api/status-test {gate,mode,message} → gate modunu kaydet (action.ts okuyup allow/deny döner)
// gate: 'tableClose' → table.close · 'close' → packet.close · aksi (status) → packet.status.update.
// Auth: iframe session token (Bearer JWT) → verifySessionToken → güvenilir serverId.
import { verifySessionToken } from '../../lib/jwt';
import { getConfig, saveConfig, getInstall, type Env } from '../../lib/kv';
import { fetchFirstProductId, createTestPacket } from '../../lib/restomenum';

const gateField = (g: string | null | undefined) =>
  (g === 'close' ? 'closeGate' : g === 'tableClose' ? 'tableCloseGate' : 'statusGate') as 'closeGate' | 'tableCloseGate' | 'statusGate';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const field = gateField(new URL(request.url).searchParams.get('gate'));
  const cfg = await getConfig(env, ctx.serverId);
  // packet.* varsayılanı ALLOW (action.ts ile tutarlı); tableCloseGate varsayılanı deny.
  const def = field === 'tableCloseGate' ? 'deny' : 'allow';
  return Response.json({ ok: true, mode: cfg?.[field]?.mode || def, message: cfg?.[field]?.message || '' });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body: any = await request.json().catch(() => ({}));

  // TEST: kurye-SAHİPLİ paket oluştur (callbackUrl=kurye → pluginStatusCallback.pluginId=kurye → status.update
  // gate'i bu pakette kuryeye sorulur). Pending testi için bu paket şart.
  if (body?.createPacket) {
    const inst = await getInstall(env, ctx.serverId);
    if (!inst?.apiKey) return Response.json({ ok: false, message: 'Eklenti bağlı değil (apiKey yok)' }, { status: 400 });
    const productId = await fetchFirstProductId(env, inst.apiKey);
    if (!productId) return Response.json({ ok: false, message: 'Ürün bulunamadı (products:read + en az 1 ürün gerekir)' }, { status: 400 });
    const callbackUrl = new URL(request.url).origin + '/api/webhook'; // kurye ile aynı domain (sahiplik damgası)
    const r = await createTestPacket(env, inst.apiKey, productId, callbackUrl);
    if (!r.ok) return Response.json({ ok: false, message: 'Paket oluşturulamadı: ' + r.message }, { status: 400 });
    return Response.json({ ok: true, packetId: r.packetId });
  }

  // Gate modunu kaydet (allow/deny/pending + mesaj). gate paramı hangi field'a yazılacağını seçer. Config MERGE.
  // pending YALNIZ status gate'inde (packet.status.update) anlamlı; diğer gate'lerde backend yok sayar.
  const field = gateField(body?.gate);
  const mode = (body?.mode === 'deny' || body?.mode === 'pending') ? body.mode : 'allow';
  const message = String(body?.message || '').slice(0, 300);
  const cfg = (await getConfig(env, ctx.serverId)) || ({ courierUrl: '', updatedAt: 0 } as any);
  await saveConfig(env, ctx.serverId, { ...cfg, [field]: { mode, message: message || undefined }, updatedAt: Date.now() });
  return Response.json({ ok: true, mode, message });
};
