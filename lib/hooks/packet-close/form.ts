// packet.close — DECLARATIVE FORM modu. Panel formun çıktısını `formData` olarak iletirse decision okunur.
// (Not: packet.close çoğunlukla sunucu-içi tetiklenir → formData gelmeyebilir; o durumda null → diğer mod.)
import { fromForm, type Decision } from '../shared';

export const decide = (envlp: any): Decision | null => fromForm(envlp);
