import { useEffect, useState, type ReactNode } from 'react';
import { cx, useToasts } from './lib.ts';

export function Toaster() {
  const t = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4">
      {t.map((x) => (
        <div key={x.id} className={cx('rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg', x.kind === 'ok' ? 'bg-slate-900 dark:bg-slate-700' : 'bg-red-600')}>{x.msg}</div>
      ))}
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-8 shadow-2xl sm:max-w-lg sm:rounded-3xl dark:bg-slate-900" onClick={(e: any) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button className="btn-soft btn-sm" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {children}
      {hint && !error && <p className="muted mt-1">{hint}</p>}
      {error && <p className="mt-1 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}

export const TONES: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
};
export const Badge = ({ tone = 'gray', children }: { tone?: string; children: ReactNode }) => <span className={cx('chip', TONES[tone])}>{children}</span>;

export const STATUS_TONE: Record<string, string> = { NEW: 'gray', QUALIFIED: 'blue', CONTACTED: 'violet', REPLIED: 'violet', INTERESTED: 'amber', OFFER_SENT: 'amber', NEGOTIATING: 'amber', WON: 'green', LOST: 'red', NOT_A_FIT: 'gray' };

export function ScoreBadge({ score, band }: { score: number; band?: string }) {
  const b = band ?? (score >= 81 ? 'top' : score >= 61 ? 'good' : score >= 31 ? 'medium' : 'weak');
  const tone = b === 'top' ? 'green' : b === 'good' ? 'blue' : b === 'medium' ? 'amber' : 'gray';
  return <Badge tone={tone}>{score}/100</Badge>;
}

export const Spinner = () => <div className="py-10 text-center text-slate-500">جارٍ التحميل…</div>;
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => (
  <div className="card text-center"><p className="mb-3 font-medium text-red-600">{msg}</p>{retry && <button className="btn-soft" onClick={retry}>إعادة المحاولة</button>}</div>
);
export const Empty = ({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) => (
  <div className="card py-8 text-center"><p className="text-lg font-bold">{title}</p>{hint && <p className="muted mx-auto mt-1 max-w-sm">{hint}</p>}{children && <div className="mt-4 flex flex-col items-stretch gap-2 sm:items-center">{children}</div>}</div>
);

export function Confirm({ title, text, confirmLabel = 'تأكيد', onYes, onClose }: { title: string; text: string; confirmLabel?: string; onYes: () => void; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="mb-4">{text}</p>
      <div className="grid grid-cols-2 gap-2"><button className="btn-soft" onClick={onClose}>إلغاء</button><button className="btn-danger" onClick={() => { onYes(); onClose(); }}>{confirmLabel}</button></div>
    </Sheet>
  );
}

export function useBool(init = false): [boolean, () => void, () => void] {
  const [v, set] = useState(init);
  return [v, () => set(true), () => set(false)];
}
