// table.close — DECLARATIVE FORM modu. Manifest hook.ui bir declarative form ise panel formun çıktısını
// `formData` olarak webhook'a iletir; burada formData.decision'a bakılır. decision yoksa null → başka mod.
import { fromForm, type Decision } from '../shared';

export const decide = (envlp: any): Decision | null => fromForm(envlp);
