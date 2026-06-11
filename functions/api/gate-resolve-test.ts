// TEST harness — bekleyen (pending) packet.status.update gate'ini çözer. Ayar sayfası "Bekleyen gate'i çöz"
// butonu çağırır (session-token authed). Akış: KV'deki son pending paketi oku → install apiKey ile Restomenum
// `POST /plugin-api/packets/gate-resolve` çağır (allow=held geçişi uygula / deny=iptal).
import { verifySessionToken } from '../../lib/jwt';
import { getInstall, getPendingResolve, type Env } from '../../lib/kv';
import { gateResolve } from '../../lib/restomenum';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const p = await getPendingResolve(env, ctx.serverId);
  return Response.json({ ok: true, pending: p || null });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body: any = await request.json().catch(() => ({}));
  const decision = body?.decision === 'deny' ? 'deny' : 'allow';

  const p = await getPendingResolve(env, ctx.serverId);
  if (!p?.packetId) return Response.json({ ok: false, message: 'Bekleyen gate yok (önce statusGate=pending ile statü değiştir)' }, { status: 400 });
  const inst = await getInstall(env, ctx.serverId);
  if (!inst?.apiKey) return Response.json({ ok: false, message: 'Eklenti bağlı değil (apiKey yok)' }, { status: 400 });

  const r = await gateResolve(env, inst.apiKey, p.packetId, decision);
  if (!r.ok) return Response.json({ ok: false, message: 'gate-resolve başarısız: ' + (r.message || ''), packetId: p.packetId }, { status: 400 });
  return Response.json({ ok: true, decision, packetId: p.packetId });
};
