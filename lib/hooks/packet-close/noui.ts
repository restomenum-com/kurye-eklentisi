// packet.close — UI'SIZ mod. Karar eklenti AYAR sayfasındaki `closeGate` config toggle'ından (yoksa
// VARSAYILAN ALLOW). packet.close sunucu-içi gate olduğu için pratikte en sık kullanılan mod budur.
import { fromConfig, type Decision } from '../shared';
import { type Env } from '../../kv';

export const decide = (env: Env, envlp: any): Promise<Decision> => fromConfig(env, envlp.tenantId, 'closeGate');
