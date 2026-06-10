// Kurye eklentisi — UI action-hook ucu (Pages Function). Webhook'tan AYRI (sektör standardı):
//   - Restomenum, buton tıklamasında manifest `actionUrl`'ine imzalı SENKRON POST eder:
//       { type:'action', hook, serverId, packetId }
//   - Biz işi yapıp **JSON `{success,message}`** döneriz (kullanıcıya toast). Retry yok, idempotency yok.
// İmza şeması webhook ile aynı (install webhookSecret) → verifySignature ortak.
import { verifySignature } from '../../lib/sig';
import { getInstall, getConfig, type Env } from '../../lib/kv';
import { fetchPacket } from '../../lib/restomenum';
import { mapEventPayload } from '../../lib/mapPayload';
import { mirrorIncoming } from '../../lib/mirror';

const FORWARD_TIMEOUT_MS = 8000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const raw = await request.text(); // HAM gövde (imza için şart)
  let envlp: any;
  try {
    envlp = JSON.parse(raw);
  } catch {
    return Response.json({ success: false, message: 'bad json' }, { status: 400 });
  }

  const inst = await getInstall(env, envlp.tenantId);
  const sigValid = inst ? await verifySignature(inst.webhookSecret, raw, request.headers.get('x-restomenum-signature')) : false;

  // TEST/DEBUG aynası: senkron istek (action veya before-hook gate) ham haliyle webhook.site'a yansıtılır.
  const mirrorKind = envlp.type === 'hook' ? 'hook' : 'action';
  const mirrorEvent = envlp.type === 'hook' ? String(envlp.event || 'hook') : String(envlp.hook || envlp.type || 'action');
  waitUntil(mirrorIncoming(env, envlp.tenantId, { kind: mirrorKind, event: mirrorEvent, rawBody: raw, signatureValid: sigValid }));

  if (!inst) return Response.json({ success: false, message: 'unknown tenant' }, { status: 404 });
  if (!sigValid) return Response.json({ success: false, message: 'bad signature' }, { status: 401 });

  // type:'hook' → before-action blocking gate (§3). {decision:'allow'|'deny', message?, attach?} döneriz.
  if (envlp.type === 'hook') {
    const cfg = await getConfig(env, envlp.tenantId);
    // packet.* gate'leri SUNUCU-İÇİ (packetGate; panel iframe yok) → VARSAYILAN ALLOW. Kullanıcı eklenti AYAR
    // sayfasından 'deny' seçerse engeller. (Restoran akışı varsayılan olarak bloklanmaz.)
    if (envlp.event === 'packet.close') {
      // formData.decision (panel iframe varsa) öncelikli; yoksa closeGate config; o da yoksa allow.
      const mode = envlp.formData?.decision || cfg?.closeGate?.mode;
      return mode === 'deny'
        ? Response.json({ decision: 'deny', message: cfg?.closeGate?.message || 'Paket kapatma reddedildi (kurye gate).' })
        : Response.json({ decision: 'allow', message: 'İzin verildi (kurye gate).' });
    }
    if (envlp.event === 'packet.status.update') {
      return cfg?.statusGate?.mode === 'deny'
        ? Response.json({ decision: 'deny', message: cfg?.statusGate?.message || 'Statü değişimi reddedildi (kurye gate).' })
        : Response.json({ decision: 'allow', message: 'İzin verildi (kurye gate).' });
    }
    // table.close: config toggle (varsayılan DENY — gate'in amacı engelleme; istenirse ayardan allow).
    const gate = envlp.event === 'table.close' ? cfg?.tableCloseGate : undefined;
    if (gate?.mode === 'allow') {
      return Response.json({ decision: 'allow', message: 'Test: izin verildi (kurye gate).' });
    }
    return Response.json({ decision: 'deny', message: gate?.message || 'Test: reddedildi (kurye gate — deny).' });
  }

  // hook → iş. Şimdilik tek hook: paketi manuel kuryeye gönder.
  // `level` → renk (info|success|warning|error); `display` → sunum (toast | popup). İkisini de eklenti seçer.
  if (envlp.hook === 'packet.sendToCourier') {
    // Per-user yetki (actor): yalnız 'manager' rolü kurye gönderebilir. `actor` Restomenum'un imzaladığı
    // gövdede gelir (imza yukarıda doğrulandı → güvenilir, tarayıcı forge edemez). actor.userId ile
    // istenirse daha ince izin de kurulabilir; burada kaba rol yeterli.
    if (envlp.actor?.role !== 'manager') {
      return Response.json({ success: false, level: 'warning', display: 'popup', message: 'Bu işlem için yönetici (manager) yetkisi gerekir' });
    }
    const cfg = await getConfig(env, envlp.tenantId);
    if (!cfg?.courierUrl) return Response.json({ success: false, level: 'warning', display: 'popup', message: 'Kurye adresi ayarlı değil' });
    const packetId = envlp.target?.id;
    if (!packetId) return Response.json({ success: false, level: 'error', display: 'popup', message: 'Paket bilgisi yok' });
    // Action yalnız packetId taşır → dolu order'ı okuma ucundan çek (orders:read), kuryeye onu ilet.
    const data = await fetchPacket(env, inst.apiKey, String(packetId));
    if (!data) return Response.json({ success: false, level: 'error', display: 'popup', message: 'Paket detayı okunamadı' });
    const order = mapEventPayload({ type: 'packet.created', id: '', serverId: envlp.tenantId, occurredAt: Date.now(), data } as any, inst);
    // Declarative form çıktısı (type:'form' butonu) → tüm form alanlarını kurye order'ına ekle.
    if (envlp.formData && typeof envlp.formData === 'object') order.formData = envlp.formData;
    try {
      const r = await fetch(cfg.courierUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-restomenum-plugin': 'kurye',
          'x-restomenum-event': 'manual.sendToCourier',
          'x-restomenum-server-id': String(envlp.tenantId || ''),
        },
        body: JSON.stringify(order), // ← dolu kanonik order (products/customer/address/total…)
        signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
      });
      if (!r.ok) return Response.json({ success: false, level: 'error', display: 'popup', message: 'Kurye yanıt vermedi' });
      return Response.json({ success: true, level: 'success', display: 'toast', message: 'Kuryeye gönderildi' });
    } catch {
      return Response.json({ success: false, level: 'error', display: 'popup', message: 'Kuryeye ulaşılamadı' });
    }
  }

  return Response.json({ success: false, level: 'error', display: 'popup', message: 'Bilinmeyen aksiyon' });
};
