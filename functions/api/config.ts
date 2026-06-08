// Ayar ekranı (iframe) backend'i (Pages Function) — tenant'ın kurye hedef URL'ini oku/yaz.
// Auth: iframe'den gelen session token (Bearer JWT) → verifySessionToken → güvenilir serverId.
import { verifySessionToken } from '../../lib/jwt';
import { getConfig, saveConfig, type Env } from '../../lib/kv';
import { validateCourierUrl } from '../../lib/urlGuard';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const cfg = await getConfig(env, ctx.serverId);
  return Response.json({ ok: true, courierUrl: cfg?.courierUrl ?? '', autoForward: cfg?.autoForward !== false, mirrorUrl: cfg?.mirrorUrl ?? '' });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ctx = await verifySessionToken(request.headers.get('authorization'), env);
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body: any = await request.json().catch(() => ({}));
  const courierUrl = String(body?.courierUrl || '').trim();
  const v = validateCourierUrl(courierUrl);
  if (!v.ok) {
    return Response.json({ error: 'invalid_url', message: v.reason }, { status: 400 });
  }
  const autoForward = body?.autoForward !== false; // default açık; yalnız açıkça false ise kapalı

  // mirrorUrl (TEST/DEBUG, opsiyonel): boş → kapalı. Doluysa courierUrl ile aynı SSRF guard'dan geçer.
  const mirrorUrl = String(body?.mirrorUrl || '').trim();
  if (mirrorUrl) {
    const mv = validateCourierUrl(mirrorUrl);
    if (!mv.ok) return Response.json({ error: 'invalid_mirror_url', message: mv.reason }, { status: 400 });
  }

  await saveConfig(env, ctx.serverId, { courierUrl, autoForward, mirrorUrl: mirrorUrl || undefined, updatedAt: Date.now() });
  return Response.json({ ok: true, courierUrl, autoForward, mirrorUrl });
};
