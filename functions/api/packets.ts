// Panel iframe veri ucu (Pages Function) — mağazanın AÇIK paketlerini listeler.
// Auth: iframe'in session token'ı (Bearer JWT) → verifySessionToken → güvenilir serverId + role.
// Veri: Restomenum Callback API `packets/open` (install apiKey, orders:read). `role`'ü UI'a döner →
// manager değilse "Gönder" pasif gösterilir (gerçek yetki /api/send'de de enforce edilir = defense-in-depth).
import { verifySessionToken } from '../../lib/jwt';
import { getInstall, type Env } from '../../lib/kv';
import { fetchOpenPackets } from '../../lib/restomenum';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ ok: false, message: 'Oturum doğrulanamadı' }, { status: 401 });

  const inst = await getInstall(env, ctx.serverId);
  if (!inst) return Response.json({ ok: false, message: 'Kurulum bulunamadı' });

  const packets = await fetchOpenPackets(env, inst.apiKey);
  return Response.json({ ok: true, role: ctx.role || 'staff', packets });
};
