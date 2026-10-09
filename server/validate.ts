// مدقّق مدخلات صغير بدون مكتبات. يجمع كل الأخطاء ثم يرمي HttpError(400).
import { HttpError } from './util.ts';

type StrOpts = { required?: boolean; max?: number; min?: number; oneOf?: readonly string[]; default?: string };
type NumOpts = { required?: boolean; min?: number; max?: number; int?: boolean; default?: number | null };

export class Validator {
  src: Record<string, unknown>;
  out: Record<string, unknown> = {};
  errors: Record<string, string> = {};
  constructor(body: unknown) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'جسم الطلب غير صالح');
    this.src = body as Record<string, unknown>;
  }
  has(key: string) {
    return Object.prototype.hasOwnProperty.call(this.src, key) && this.src[key] !== undefined;
  }
  str(key: string, o: StrOpts = {}) {
    if (!this.has(key)) {
      if (o.required) this.errors[key] = 'حقل مطلوب';
      return this;
    }
    const raw = this.src[key];
    if (raw === null && !o.required) {
      this.out[key] = o.default ?? '';
      return this;
    }
    if (typeof raw !== 'string') {
      this.errors[key] = 'يجب أن يكون نصًا';
      return this;
    }
    const v = raw.trim();
    if (o.required && !v) this.errors[key] = 'حقل مطلوب';
    else if (o.min && v.length < o.min) this.errors[key] = `الحد الأدنى ${o.min} أحرف`;
    else if (v.length > (o.max ?? 2000)) this.errors[key] = `الحد الأقصى ${o.max ?? 2000} حرفًا`;
    else if (o.oneOf && v && !o.oneOf.includes(v)) this.errors[key] = 'قيمة غير مسموحة';
    else this.out[key] = v;
    return this;
  }
  num(key: string, o: NumOpts = {}) {
    if (!this.has(key) || this.src[key] === null || this.src[key] === '') {
      if (o.required) this.errors[key] = 'حقل مطلوب';
      else if (this.has(key)) this.out[key] = o.default ?? null;
      return this;
    }
    const n = typeof this.src[key] === 'number' ? (this.src[key] as number) : Number(this.src[key]);
    if (!Number.isFinite(n)) this.errors[key] = 'يجب أن يكون رقمًا';
    else if (o.int && !Number.isInteger(n)) this.errors[key] = 'يجب أن يكون عددًا صحيحًا';
    else if (o.min !== undefined && n < o.min) this.errors[key] = `الحد الأدنى ${o.min}`;
    else if (o.max !== undefined && n > o.max) this.errors[key] = `الحد الأقصى ${o.max}`;
    else this.out[key] = n;
    return this;
  }
  date(key: string, o: { required?: boolean; nullable?: boolean } = {}) {
    if (!this.has(key)) {
      if (o.required) this.errors[key] = 'حقل مطلوب';
      return this;
    }
    const raw = this.src[key];
    if (raw === null || raw === '') {
      if (o.nullable) this.out[key] = null;
      else if (o.required) this.errors[key] = 'حقل مطلوب';
      return this;
    }
    const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
    if (Number.isNaN(t)) this.errors[key] = 'تاريخ غير صالح';
    else this.out[key] = new Date(t).toISOString();
    return this;
  }
  strArray(key: string, o: { maxItems?: number; maxLen?: number } = {}) {
    if (!this.has(key)) return this;
    const raw = this.src[key];
    if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) {
      this.errors[key] = 'يجب أن تكون قائمة نصوص';
      return this;
    }
    const items = raw.map((x: string) => x.trim()).filter(Boolean);
    if (items.length > (o.maxItems ?? 30) || items.some((x) => x.length > (o.maxLen ?? 200))) this.errors[key] = 'قائمة طويلة جدًا';
    else this.out[key] = items;
    return this;
  }
  done<T = Record<string, unknown>>(): T {
    if (Object.keys(this.errors).length) throw new HttpError(400, 'بيانات غير صالحة', this.errors);
    return this.out as T;
  }
}

export function normalizeUrl(v: string): string {
  if (!v) return '';
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return '';
    return u.toString();
  } catch {
    return '';
  }
}

const DIAL: Record<string, string> = { 'السعودية': '966', 'اليمن': '967', 'الإمارات': '971', 'مصر': '20', 'الكويت': '965', 'قطر': '974', 'عمان': '968', 'البحرين': '973', 'الأردن': '962' };
// يحوّل رقم واتساب إلى صيغة دولية أرقام فقط إن أمكن؛ يُرجع '' إن كان غير صالح
export function normalizePhone(raw: string, country = ''): string {
  let d = raw.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0') && DIAL[country.trim()]) d = DIAL[country.trim()] + d.slice(1);
  return /^\d{8,15}$/.test(d) ? d : '';
}
