// OAuth Connect redirect hedefi (Pages Function). Restomenum kurulum sonrası tarayıcıyı buraya ?code= ile yönlendirir.
// code → exchange → credential'ları KV'ye kaydet → "bağlandı" sayfası.
import { exchangeCode } from '../../lib/restomenum';
import { saveInstall, type Env } from '../../lib/kv';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  // const state = url.searchParams.get('state'); // PROD: kendi ürettiğin state ile CSRF doğrula
  if (!code) return new Response('missing code', { status: 400 });

  try {
    const d = await exchangeCode(env, code);
    await saveInstall(env, d.serverId, {
      apiKey: d.apiKey,
      webhookSecret: d.webhookSecret,
      scopes: d.scopes,
      pluginId: d.pluginId,
      version: d.version,
      connectedAt: Date.now(),
    });
    return Response.redirect(new URL('/connected/', request.url).toString(), 302);
  } catch (e: any) {
    return new Response('connect_failed: ' + e.message, { status: 502 });
  }
};
