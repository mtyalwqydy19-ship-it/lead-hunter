import { useEffect, useRef, useState } from 'react';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const money = (n: number, cur = 'SAR') => `${nf.format(n || 0)} ${cur === 'SAR' ? 'ريال' : cur}`;
export const num = (n: number) => nf.format(n || 0);

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(Math.abs(diff) / 86400000);
  if (diff >= 0) {
    if (days === 0) return Math.abs(diff) < 3600000 ? 'قبل لحظات' : 'اليوم';
    return days === 1 ? 'أمس' : days === 2 ? 'منذ يومين' : days <= 10 ? `منذ ${days} أيام` : `منذ ${days} يومًا`;
  }
  return days === 0 ? 'اليوم' : days === 1 ? 'غدًا' : days === 2 ? 'بعد يومين' : days <= 10 ? `بعد ${days} أيام` : `بعد ${days} يومًا`;
}
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// موعد متابعة بتوقيت المستخدم المحلي الساعة 9 صباحًا
export function followUpIso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
export const dateInputToIso = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d, 9, 0, 0, 0).toISOString(); };
export const isoToDateInput = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const waLink = (num: string, text?: string) => `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

// ===== تنبيهات =====
type Toast = { id: number; msg: string; kind: 'ok' | 'err' };
let toasts: Toast[] = [];
const subs = new Set<() => void>();
export function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const t = { id: Date.now() + Math.random(), msg, kind };
  toasts = [...toasts, t];
  subs.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); subs.forEach((f) => f()); }, 2800);
}
export function useToasts(): Toast[] {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return toasts;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast('تم النسخ ✓');
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      toast(ok ? 'تم النسخ ✓' : 'تعذّر النسخ، انسخ يدويًا', ok ? 'ok' : 'err');
      return ok;
    } catch { toast('تعذّر النسخ، انسخ يدويًا', 'err'); return false; }
  }
}

// تحميل بيانات مع إعادة التحميل
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string; loading: boolean; reload: () => void; set: (v: T) => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fn().then((d) => { if (!cancelled) { setData(d); setError(''); } }).catch((e) => { if (!cancelled) setError(e?.message || 'خطأ'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), set: setData };
}

// ===== توجيه بسيط بالـ hash =====
export function useHash(): string {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => { const f = () => { setH(location.hash.slice(1) || '/'); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}
export const go = (path: string) => { location.hash = path; };
