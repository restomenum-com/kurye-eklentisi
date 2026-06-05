// Gelen Restomenum event'ini → kurye `order` formatına map'le.
// Kurye firmalarının beklediği sabit order formatı.
//
// İlkeler:
//  - `customer` + `address` YALNIZ install'da `customers:read` varsa eklenir; yoksa hiç gönderilmez.
//  - İç/iş alanları (product.cost, recete, image, log, storages…) forward edilmez.
//  - Satır fiyatı (`price`) ve toplamlar BACKEND tarafından hesaplanır (`lineTotal`/`total`/`totalDiscount`) →
//    burada fiyat mantığı YOK, yalnız okunur.
//  - callbackUrls (kurye statü bildirimi) backend tarafından (packets:status varsa) eklenir → pass-through.
import type { Install } from './kv';

type Envelope = { type: string; id: string; serverId: string; occurredAt?: number; data?: any };

// kanal kodu → kurye'ye giden okunabilir kaynak adı.
const SOURCES: Record<string, string> = { deliveryhero: 'yemeksepeti', packet: 'pos' };

function hasScope(install: Install, scope: string): boolean {
  return Array.isArray(install.scopes) && install.scopes.includes(scope);
}

// ── Map'leyiciler ──
function mapCustomerAndAddress(c: any, install: Install): { customer?: any; address?: any } {
  if (!hasScope(install, 'customers:read') || !c || typeof c !== 'object') return {};
  const parts = String(c.call ?? '').split(';');
  return {
    customer: {
      fullName: c.name ?? null,
      phoneNumber: String(parts[0] ?? '').replace(/\D/g, ''),
      phoneCode: parts[1] ?? '',
    },
    address: {
      text: c.address ?? null,
      description: c.addressDescription ?? null,
      lat: c.latitude ?? null,
      lon: c.longitude ?? null,
    },
  };
}

// Seçenek adları → string array. Yeni payload `options`'ı zaten string array; eski iç yapı için fallback.
function mapOptions(opts: any): string[] {
  if (!Array.isArray(opts)) return [];
  if (opts.every((x: any) => typeof x === 'string')) return opts; // yeni format: ["Acılı", …]
  return opts // eski format: [{ data: [{ checked, title }] }]
    .flatMap((g: any) => (g && Array.isArray(g.data)) ? g.data : [])
    .filter((x: any) => x && x.checked)
    .map((x: any) => x.title);
}

function mapProducts(orders: any): any[] {
  return (Array.isArray(orders) ? orders : []).map((v) => ({
    id: String(v?.id ?? ''),
    name: v?.title ?? v?.product?.title ?? null, // ürün adı satır kökünde (eski payload uyumu için product.title fallback)
    price: Number(v?.lineTotal ?? 0), // satır fiyatı backend'de hesaplandı
    quantity: v?.quantity ?? null,
    options: mapOptions(v?.options), // string array
  }));
}

/** Unix ms → UTC "YYYY-MM-DD HH:mm:ss". */
function formatCreatedAt(occurredAt?: number): string | null {
  if (!occurredAt) return null;
  return new Date(occurredAt).toISOString().replace('T', ' ').slice(0, 19);
}

function mapPacketOrder(data: any, occurredAt: number | undefined, install: Install) {
  const { customer, address } = mapCustomerAndAddress(data?.customer, install);
  const order: any = {
    id: String(data?.packetId ?? ''),
    products: mapProducts(data?.orders),
    source: SOURCES[data?.entegrasyon] ?? data?.entegrasyon ?? null,
    note: data?.note || '',
    totalAmount: Number(data?.total ?? 0),
    totalDiscount: Number(data?.totalDiscount ?? 0),
    paymentMethod: data?.total == data?.paid ? 'Online' : data?.paymentNote || 'Belirtilmemiş',
    platformCode: String(data?.orderCode || data?.packetId || ''),
    dailyOrderNo: data?.docNo ? String(data.docNo) : null,
    createdAt: formatCreatedAt(occurredAt),
    scheduledAt: data?.isScheduled ? data.scheduledDate + ':00' : null,
    courierPhone: null,
  };
  if (customer) order.customer = customer; // customers:read yoksa eklenmez
  if (address) order.address = address;
  // Statü callback URL'leri — backend (packets:status varsa) data'ya koyar; yalnız pass-through.
  if (data?.callbackUrls && typeof data.callbackUrls === 'object') order.callbackUrls = data.callbackUrls;
  return order;
}

/** packet.created → kurye `order`. Diğer event'ler → minimal zarf. */
export function mapEventPayload(env: Envelope, install: Install) {
  switch (env.type) {
    case 'packet.created':
      return mapPacketOrder(env.data || {}, env.occurredAt, install);
    default:
      return { event: env.type, eventId: env.id, serverId: env.serverId, occurredAt: env.occurredAt ?? null };
  }
}
