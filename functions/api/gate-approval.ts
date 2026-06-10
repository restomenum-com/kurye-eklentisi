// Desen B — gate iframe'in kendi backend'ine onay yazdığı uç. iframe getSessionToken alıp Bearer ile çağırır;
// burada token DOĞRULANIR (webhookSecret/HS256, aud=pluginId, exp) → güvenilir serverId/uid → state yazılır.
// Webhook (action.ts) sonra bu state'i okuyup allow/deny verir (panel veya sunucu-içi gate fark etmez).
import { verifySessionToken } from '../../lib/jwt';
import { setGateApproval, type Env } from '../../lib/kv';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body: any = await request.json().catch(() => ({}));
  const refId = String(body?.refId || '').slice(0, 200);
  if (!refId) return Response.json({ ok: false, message: 'refId gerekli' }, { status: 400 });

  const decision = body?.decision === 'deny' ? 'deny' : 'allow';
  const message = String(body?.message || '').slice(0, 300) || undefined;
  // Anahtar tenant'ı TOKEN'dan (ctx.serverId) — client başka tenant'a yazamaz. refId client'tan ama tenant-scoped.
  await setGateApproval(env, ctx.serverId, refId, { decision, message, by: ctx.uid, at: Date.now() });
  return Response.json({ ok: true, decision });
};
