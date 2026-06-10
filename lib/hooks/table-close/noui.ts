// table.close — UI'SIZ mod. Hiç form/iframe yokken karar eklenti AYAR sayfasındaki `tableCloseGate`
// config toggle'ından verilir (yoksa VARSAYILAN ALLOW).
import { fromConfig, type Decision } from '../shared';
import { type Env } from '../../kv';

export const decide = (env: Env, envlp: any): Promise<Decision> => fromConfig(env, envlp.tenantId, 'tableCloseGate');
