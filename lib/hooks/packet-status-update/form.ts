// packet.status.update — DECLARATIVE FORM modu. Panel formun çıktısını `formData` olarak iletirse decision
// okunur. (Statü geçişi sunucu-içi de tetiklenebilir → formData gelmeyebilir; o durumda null → diğer mod.)
import { fromForm, type Decision } from '../shared';

export const decide = (envlp: any): Decision | null => fromForm(envlp);
