// Kurye hedef URL doğrulama — SSRF sertleştirme.
// Tenant'ın girdiği courierUrl'e paket POST'lanacağı için, dahili/özel hedefleri reddet:
// https zorunlu, kimlik bilgisi yok, yalnız 443, dahili hostname/özel-IP literal engelli.
//
// NOT (Workers runtime): public hostname → özel IP'ye çözülürse (DNS rebinding) bu kontrol
// yakalamaz; ancak Cloudflare Workers fetch'i origin'in özel ağına/metadata'sına erişemez,
// bu yüzden config-anı doğrulaması pratikte yeterli sertleştirme sağlar.

const BLOCKED_HOSTS = new Set(['localhost', 'metadata.google.internal']);

function isIPv4Literal(h: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
}

/** Özel / ayrılmış (RFC1918, loopback, link-local, CGNAT, multicast, 0/8) IPv4 mi? */
function isPrivateOrReservedIPv4(h: string): boolean {
  const o = h.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // geçersiz → reddet
  const [a, b] = o;
  if (a === 0 || a === 127) return true;                 // 0.0.0.0/8, loopback
  if (a === 10) return true;                             // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true;      // RFC1918
  if (a === 192 && b === 168) return true;               // RFC1918
  if (a === 169 && b === 254) return true;               // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true;     // CGNAT 100.64/10
  if (a >= 224) return true;                             // multicast / reserved
  return false;
}

export function validateCourierUrl(raw: string): { ok: boolean; reason?: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'Geçerli bir URL girin' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'https:// zorunlu' };
  if (u.username || u.password) return { ok: false, reason: 'URL kimlik bilgisi içeremez' };
  if (u.port && u.port !== '443') return { ok: false, reason: 'Yalnız 443 portuna izin var' };
  if (raw.includes('[')) return { ok: false, reason: 'IPv6 literal adres engelli' };

  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return { ok: false, reason: 'Geçersiz host' };
  if (BLOCKED_HOSTS.has(host)) return { ok: false, reason: 'Dahili host engelli' };
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return { ok: false, reason: 'Dahili host engelli' };
  }
  if (isIPv4Literal(host)) {
    if (isPrivateOrReservedIPv4(host)) return { ok: false, reason: 'Özel/dahili IP adresi engelli' };
    return { ok: true }; // public IPv4 literal — izinli
  }
  if (!host.includes('.')) return { ok: false, reason: 'Geçerli bir alan adı gerekli' }; // tek-label dahili isim
  return { ok: true };
}
