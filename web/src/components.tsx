import { useState } from 'react';
import { post, ApiError } from './api.ts';
import { copyText, dateInputToIso, followUpIso, toast, waLink, cx } from './lib.ts';
import { Field, Sheet } from './ui.tsx';
import { useApp } from './App.tsx';

// اختيار موعد متابعة سريع
export function FollowUpPicker({ value, onChange }: { value: string | null | undefined; onChange: (iso: string | null) => void }) {
  const chips: [string, number][] = [['غدًا', 1], ['بعد 3 أيام', 3], ['بعد أسبوع', 7], ['بعد أسبوعين', 14]];
  const [custom, setCustom] = useState('');
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.map(([l, d]) => <button key={d} type="button" className="btn-soft btn-sm" onClick={() => onChange(followUpIso(d))}>{l}</button>)}
        <button type="button" className={cx('btn-sm', value === null ? 'btn-primary' : 'btn-soft')} onClick={() => onChange(null)}>بدون</button>
      </div>
      <input className="input mt-2" type="date" value={custom} onChange={(e: any) => { setCustom(e.target.value); if (e.target.value) onChange(dateInputToIso(e.target.value)); }} aria-label="تاريخ مخصص" />
    </div>
  );
}

// بطاقة رسالة جاهزة: نسخ + واتساب + "أرسلتها" (تفتح تسجيل التواصل)
export function MessageCard({ label, text, lead, onSent }: { label: string; text: string; lead: any; onSent: (text: string) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="mb-1 text-sm font-bold text-brand-700 dark:text-brand-500">{label}</div>
      <p className="whitespace-pre-wrap leading-7">{text}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn-primary btn-sm" onClick={() => copyText(text)}>📋 نسخ</button>
        {lead.whatsapp ? <a className="btn-wa btn-sm" href={waLink(lead.whatsapp, text)} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => toast('عند الإرسال اضغط «أرسلتها» لتسجيل التواصل'), 400)}>واتساب</a> : <span className="btn-soft btn-sm opacity-60">لا رقم واتساب</span>}
        <button className="btn-soft btn-sm col-span-2" onClick={() => onSent(text)}>✅ أرسلتها — سجّل التواصل</button>
      </div>
    </div>
  );
}

// تسجيل تواصل: قناة + نتيجة + موعد متابعة (+ قيمة الصفقة عند البيع)
export function ContactSheet({ lead, initialMessage = '', onClose, onDone }: { lead: any; initialMessage?: string; onClose: () => void; onDone: (r: any) => void }) {
  const { meta } = useApp();
  const [channel, setChannel] = useState(lead.whatsapp ? 'WHATSAPP' : lead.phone ? 'PHONE' : 'OTHER');
  const [outcome, setOutcome] = useState('NO_RESPONSE');
  const [message, setMessage] = useState(initialMessage);
  const [notes, setNotes] = useState('');
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [deal, setDeal] = useState(lead.dealValue ? String(lead.dealValue) : lead.estimatedValue ? String(lead.estimatedValue) : '');
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const terminal = outcome === 'WON' || outcome === 'LOST' || outcome === 'NOT_INTERESTED';
  const save = async () => {
    setBusy(true); setErr({}); setMsg('');
    try {
      const body: any = { channel, outcome, message, notes };
      if (!terminal && next !== undefined) body.nextFollowUpAt = next;
      if (outcome === 'WON') body.dealValue = Number(deal);
      const r = await post(`/api/leads/${lead.id}/contacts`, body);
      toast('تم تسجيل التواصل ✓');
      onDone(r);
    } catch (e) { const a = e as ApiError; setMsg(a.message); setErr(a.details ?? {}); } finally { setBusy(false); }
  };
  return (
    <Sheet title={`تسجيل تواصل — ${lead.businessName}`} onClose={onClose}>
      <Field label="القناة"><div className="flex flex-wrap gap-2">{meta.channels.map((c: string) => <button key={c} className={cx('btn-sm', channel === c ? 'btn-primary' : 'btn-soft')} onClick={() => setChannel(c)}>{meta.labels.channel[c]}</button>)}</div></Field>
      <Field label="النتيجة"><div className="flex flex-wrap gap-2">{meta.outcomes.map((o: string) => <button key={o} className={cx('btn-sm', outcome === o ? 'btn-primary' : 'btn-soft')} onClick={() => setOutcome(o)}>{meta.labels.outcome[o]}</button>)}</div></Field>
      {outcome === 'WON' && <Field label="قيمة الصفقة (ريال) *" error={err.dealValue}><input className="input" dir="ltr" inputMode="decimal" value={deal} onChange={(e: any) => setDeal(e.target.value)} /></Field>}
      {!terminal && <Field label="موعد المتابعة القادم" hint={next === undefined ? 'إن لم تحدد: يُحدد تلقائيًا حسب النتيجة (لم يرد = بعد 3 أيام)' : undefined}><FollowUpPicker value={next} onChange={setNext} /></Field>}
      <Field label="الرسالة المرسلة" error={err.message}><textarea className="input" rows={3} value={message} onChange={(e: any) => setMessage(e.target.value)} /></Field>
      <Field label="ملاحظات" error={err.notes}><input className="input" value={notes} onChange={(e: any) => setNotes(e.target.value)} /></Field>
      {err.contactedAt && <p className="mb-2 text-sm text-red-600">{err.contactedAt}</p>}
      {msg && <p className="mb-3 text-sm font-medium text-red-600">{msg}</p>}
      <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? '…' : 'حفظ'}</button>
    </Sheet>
  );
}

// "جهّز متابعة": رسالة مختلفة عن السابقة + نسخ/واتساب/تسجيل
export function FollowUpDraftSheet({ lead, draft, onClose, onSent }: { lead: any; draft: { text: string; previousCount: number; noResponseStreak: number }; onClose: () => void; onSent: (text: string) => void }) {
  return (
    <Sheet title={`متابعة — ${lead.businessName}`} onClose={onClose}>
      <p className="muted mb-2">المحاولة رقم {draft.noResponseStreak + 1} • الصياغة تختلف عن رسائلك السابقة. راجعها ثم أرسلها بنفسك — لا يُرسل شيء تلقائيًا.</p>
      <MessageCard label="رسالة المتابعة" text={draft.text} lead={lead} onSent={onSent} />
    </Sheet>
  );
}

export function WonSheet({ lead, onClose, onDone }: { lead: any; onClose: () => void; onDone: (l: any) => void }) {
  const [v, setV] = useState(lead.dealValue ? String(lead.dealValue) : lead.estimatedValue ? String(lead.estimatedValue) : '');
  const [err, setErr] = useState('');
  const save = async () => {
    try { const r = await post(`/api/leads/${lead.id}/move`, { status: 'WON', dealValue: Number(v) }); toast('🎉 تم تسجيل الصفقة'); onDone(r.lead); }
    catch (e) { setErr((e as ApiError).details?.dealValue ?? (e as ApiError).message); }
  };
  return (
    <Sheet title={`تسجيل صفقة — ${lead.businessName}`} onClose={onClose}>
      <Field label="قيمة الصفقة الفعلية (ريال)" error={err}><input className="input" dir="ltr" inputMode="decimal" value={v} onChange={(e: any) => setV(e.target.value)} autoFocus /></Field>
      <button className="btn-primary w-full" onClick={save}>تسجيل البيع</button>
    </Sheet>
  );
}
