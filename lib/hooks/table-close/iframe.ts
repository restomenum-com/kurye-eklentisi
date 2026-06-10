// table.close — IFRAME modu (Desen B). Gate iframe'i (/embed/hooks/table-close) resolve'dan önce
// /api/gate-approval'a per-refId kararı yazar; burada o state okunur. State yoksa null → başka mod denenir.
import { fromState, type Decision } from '../shared';
import { type Env } from '../../kv';

export const decide = (env: Env, envlp: any): Promise<Decision | null> => fromState(env, envlp);
