// packet.status.update gate — 3 yanıt modu tek girişte (otomatik: iframe state → form → noui config/varsayılan).
import * as iframe from './iframe';
import * as form from './form';
import * as noui from './noui';
import { type Decision } from '../shared';
import { type Env } from '../../kv';

export async function decide(env: Env, envlp: any): Promise<Decision> {
  return (await iframe.decide(env, envlp)) || form.decide(envlp) || (await noui.decide(env, envlp));
}
export { iframe, form, noui };
