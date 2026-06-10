// packet.status.update — IFRAME modu (Desen B). Gate iframe'i (/embed/hooks/packet-status-update)
// /api/gate-approval'a per-refId kararı yazar; burada state okunur. Yoksa null → başka mod.
import { fromState, type Decision } from '../shared';
import { type Env } from '../../kv';

export const decide = (env: Env, envlp: any): Promise<Decision | null> => fromState(env, envlp);
