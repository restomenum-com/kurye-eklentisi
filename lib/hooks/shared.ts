// Gate hook yanıt modlarının ORTAK çekirdeği. Her hook (table-close / packet-close / packet-status-update)
// kendi klasöründe 3 modu kullanır:
//   iframe  → Desen B: iframe /api/gate-approval'a per-refId karar yazar; burada o state okunur.
//   form    → Declarative form: panel formun çıktısını `formData` olarak getirir; decision alanı okunur.
//   noui    → UI yok: karar eklenti AYAR config toggle'ından (default allow).
import { getGateApproval, getConfig, type Env, type Config } from '../kv';

export type Decision = { decision: 'allow' | 'deny'; message?: string; attach?: Record<string, unknown> };
export const ALLOW = (message?: string): Decision => ({ decision: 'allow', message });
export const DENY = (message?: string): Decision => ({ decision: 'deny', message });

/** iframe modu (Desen B) — per-refId onay state'i. Yazılmamışsa null (başka mod denenir). */
export async function fromState(env: Env, envlp: any): Promise<Decision | null> {
  const refId = envlp?.target?.id;
  if (!refId) return null;
  let st = null;
  try { st = await getGateApproval(env, envlp.tenantId, String(refId)); } catch { /* yoksa null */ }
  if (!st) return null;
  return st.decision === 'deny' ? DENY(st.message || 'Reddedildi (kurye gate — iframe).') : ALLOW('İzin verildi (iframe).');
}

/** Declarative form modu — panel formun çıktısını `formData` olarak iletir. `decision` yoksa null. */
export function fromForm(envlp: any): Decision | null {
  const d = envlp?.formData?.decision;
  if (d !== 'allow' && d !== 'deny') return null;
  return d === 'deny' ? DENY(envlp.formData?.message || 'Reddedildi (form).') : ALLOW('İzin verildi (form).');
}

/** UI'sız mod — karar eklenti AYAR sayfasındaki config toggle'ından (yoksa VARSAYILAN ALLOW). */
export async function fromConfig(env: Env, serverId: string, field: keyof Config): Promise<Decision> {
  const cfg = await getConfig(env, serverId);
  const g = cfg ? (cfg[field] as { mode?: string; message?: string } | undefined) : undefined;
  return g?.mode === 'deny' ? DENY(g.message || 'Reddedildi (ayar).') : ALLOW('İzin verildi (UI yok — varsayılan/ayar).');
}
