// packet.close — IFRAME modu (Desen B). Gate iframe'i (/embed/hooks/packet-close) /api/gate-approval'a
// per-refId kararı yazar; burada state okunur. State yoksa null → başka mod. (packet.close sunucu-içi de
// çağrılabilir; o çağrıda formData olmaz ama state'ten tutarlı cevap verilir — Desen B'nin amacı bu.)
import { fromState, type Decision } from '../shared';
import { type Env } from '../../kv';

export const decide = (env: Env, envlp: any): Promise<Decision | null> => fromState(env, envlp);
