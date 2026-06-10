// table.close gate — 3 yanıt modunu tek girişte birleştirir. Mod OTOMATİK seçilir:
//   1) iframe state varsa (Desen B) → onu kullan
//   2) yoksa declarative form çıktısı varsa → onu
//   3) ikisi de yoksa → UI'sız config/varsayılan
// (Manifest hangi UI'yı verdiyse o yol dolar; hiçbiri yoksa noui default allow.)
import * as iframe from './iframe';
import * as form from './form';
import * as noui from './noui';
import { type Decision } from '../shared';
import { type Env } from '../../kv';

export async function decide(env: Env, envlp: any): Promise<Decision> {
  return (await iframe.decide(env, envlp)) || form.decide(envlp) || (await noui.decide(env, envlp));
}
export { iframe, form, noui };
