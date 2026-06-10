// packet.status.update — UI'SIZ mod. Karar eklenti AYAR sayfasındaki `statusGate` config toggle'ından
// (yoksa VARSAYILAN ALLOW). Statü gate'i sunucu-içi çalıştığı için pratikte en sık bu mod kullanılır.
import { fromConfig, type Decision } from '../shared';
import { type Env } from '../../kv';

export const decide = (env: Env, envlp: any): Promise<Decision> => fromConfig(env, envlp.tenantId, 'statusGate');
