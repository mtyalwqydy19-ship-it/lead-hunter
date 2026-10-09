import { useEffect, useState } from 'react';
import { get, patch, post, ApiError } from '../api.ts';
import { dateInputToIso, go, isoToDateInput, toast, useLoad } from '../lib.ts';
import { Field, Spinner, ErrorBox } from '../ui.tsx';
import { useApp } from '../App.tsx';

const EMPTY = {
  businessName: '', businessType: '', country: 'السعودية', city: '', website: '', phone: '', whatsapp: '', instagram: '', email: '', source: 'MANUAL', sourceUrl: '',
  description: '', notes: '', painSignal: '', painEvidence: '', painEvidenceSource: '', painLevel: 'NONE', painConfidence: 'UNKNOWN', urgency: 'UNKNOWN',
  recommendedServiceId: '', estimatedValue: '' as string | number, nextFollowUpAt: '',
};

export function LeadForm({ id, prefill }: { id?: string; prefill?: Record<string, any> }) {
  const { meta } = useApp();
  const existing = useLoad(async () => (id ? get(`/api/leads/${id}`) : null), [id]);
  const services = useLoad(() => get('/api/services'));
  const [f, setF] = useState<any>({ ...EMPTY, ...(prefill ?? {}) });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const l = existing.data?.lead;
    if (l) setF({ ...EMPTY, ...l, estimatedValue: l.estimatedValue || '', recommendedServiceId: l.recommendedServiceId ?? '', nextFollowUpAt: isoToDateInput(l.nextFollowUpAt) });
  }, [existing.data]);
  if (id && existing.loading && !existing.data) return <Spinner />;
  if (existing.error) return <ErrorBox msg={existing.error} />;
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const hasEv = f.painEvidence.trim().length > 0;
  const levels = hasEv ? meta.painLevels : meta.painLevels.slice(0, 2);

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true); setErr({}); setMsg('');
    const body: any = { ...f, estimatedValue: f.estimatedValue === '' ? 0 : Number(f.estimatedValue), nextFollowUpAt: f.nextFollowUpAt ? dateInputToIso(f.nextFollowUpAt) : null };
    for (const k of ['id', 'score', 'scoreBreakdown', 'status', 'priority', 'lastContactAt', 'dealValue', 'currency', 'wonAt', 'aiAnalysis', 'createdAt', 'updatedAt']) delete body[k];
    if (!hasEv && !['NONE', 'POSSIBLE'].includes(body.painLevel)) body.painLevel = 'POSSIBLE';
    try {
      const r = id ? await patch(`/api/leads/${id}`, body) : await post('/api/leads', body);
      toast('تم الحفظ ✓');
      go(`/leads/${r.lead.id}`);
    } catch (x) {
      const a = x as ApiError; setMsg(a.message); setErr(a.details ?? {});
      window.scrollTo(0, 0);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 pb-4">
      <h1 className="text-xl font-extrabold">{id ? 'تعديل العميل' : 'إضافة عميل محتمل'}</h1>
      {msg && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{msg}</p>}

      <div className="card">
        <h2 className="h2">النشاط</h2>
        <Field label="اسم النشاط *" error={err.businessName}><input className="input" value={f.businessName} onChange={set('businessName')} required autoFocus={!id} /></Field>
        <Field label="نوع النشاط" error={err.businessType}>
          <input className="input" list="sectors" value={f.businessType} onChange={set('businessType')} placeholder="مثل: عيادات" />
          <datalist id="sectors">{meta.sectors.map((s: string) => <option key={s} value={s} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الدولة" error={err.country}><input className="input" value={f.country} onChange={set('country')} /></Field>
          <Field label="المدينة" error={err.city}><input className="input" value={f.city} onChange={set('city')} /></Field>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">وسائل التواصل</h2>
        <Field label="واتساب" error={err.whatsapp} hint="بصيغة دولية مثل 9665XXXXXXXX أو 05XXXXXXXX"><input className="input" dir="ltr" inputMode="tel" value={f.whatsapp} onChange={set('whatsapp')} /></Field>
        <Field label="هاتف" error={err.phone}><input className="input" dir="ltr" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="إنستغرام (المعرّف)" error={err.instagram}><input className="input" dir="ltr" value={f.instagram} onChange={set('instagram')} placeholder="username" /></Field>
        <Field label="الموقع" error={err.website}><input className="input" dir="ltr" inputMode="url" value={f.website} onChange={set('website')} placeholder="example.com" /></Field>
        <Field label="البريد" error={err.email}><input className="input" dir="ltr" inputMode="email" value={f.email} onChange={set('email')} /></Field>
      </div>

      <div className="card">
        <h2 className="h2">من أين عرفته؟ (المصدر)</h2>
        <Field label="المصدر" error={err.source}>
          <select className="input" value={f.source} onChange={set('source')}>{meta.sources.filter((s: string) => s !== 'DEMO').map((s: string) => <option key={s} value={s}>{meta.labels.source[s]}</option>)}</select>
        </Field>
        <Field label="رابط المصدر (اختياري)" error={err.sourceUrl}><input className="input" dir="ltr" inputMode="url" value={f.sourceUrl} onChange={set('sourceUrl')} /></Field>
      </div>

      <div className="card">
        <h2 className="h2">إشارة المشكلة</h2>
        <p className="muted mb-3">سجّل فقط ما رأيته فعلًا. بدون دليل لا يُقبل مستوى أعلى من «محتملة».</p>
        <Field label="ما الذي لاحظته؟ (الإشارة)" error={err.painSignal}><textarea className="input" rows={2} value={f.painSignal} onChange={set('painSignal')} placeholder="مثال: الحجز يتم يدويًا عبر واتساب" /></Field>
        <Field label="الدليل (ما رأيته بالضبط)" error={err.painEvidence}><textarea className="input" rows={2} value={f.painEvidence} onChange={set('painEvidence')} placeholder="مثال: الموقع يطلب الحجز بمراسلة واتساب فقط" /></Field>
        <Field label="مصدر الدليل" error={err.painEvidenceSource} hint={hasEv ? 'مطلوب لأنك كتبت دليلًا' : undefined}><input className="input" value={f.painEvidenceSource} onChange={set('painEvidenceSource')} placeholder="موقع النشاط / إنستغرام / مكالمة…" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="مستوى المشكلة" error={err.painLevel}><select className="input" value={f.painLevel} onChange={set('painLevel')}>{levels.map((s: string) => <option key={s} value={s}>{meta.labels.painLevel[s]}</option>)}</select></Field>
          <Field label="درجة الثقة" error={err.painConfidence}><select className="input" value={f.painConfidence} onChange={set('painConfidence')}>{meta.confidences.map((s: string) => <option key={s} value={s}>{meta.labels.confidence[s]}</option>)}</select></Field>
        </div>
        <Field label="الاستعجال" error={err.urgency}><select className="input" value={f.urgency} onChange={set('urgency')}>{meta.urgencies.map((s: string) => <option key={s} value={s}>{meta.labels.urgency[s]}</option>)}</select></Field>
        <Field label="الفرصة (اختياري)" error={err.opportunity}><textarea className="input" rows={2} value={f.opportunity ?? ''} onChange={set('opportunity')} /></Field>
      </div>

      <div className="card">
        <h2 className="h2">الخدمة والقيمة</h2>
        <Field label="الخدمة الأنسب" error={err.recommendedServiceId} hint={services.data && services.data.services.length === 0 ? 'لا توجد خدمات بعد — أضفها من «الخدمات والعروض»' : undefined}>
          <select className="input" value={f.recommendedServiceId} onChange={set('recommendedServiceId')}><option value="">— اختر —</option>{(services.data?.services ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Field>
        <Field label="القيمة المتوقعة (ريال)" error={err.estimatedValue}><input className="input" dir="ltr" inputMode="decimal" value={f.estimatedValue} onChange={set('estimatedValue')} /></Field>
        <Field label="موعد المتابعة" error={err.nextFollowUpAt}><input className="input" type="date" value={f.nextFollowUpAt} onChange={set('nextFollowUpAt')} /></Field>
        <Field label="ملاحظات" error={err.notes}><textarea className="input" rows={3} value={f.notes} onChange={set('notes')} /></Field>
      </div>

      <div className="sticky bottom-20 z-20 grid grid-cols-3 gap-2">
        <button type="button" className="btn-soft" onClick={() => history.back()}>إلغاء</button>
        <button className="btn-primary col-span-2" disabled={busy}>{busy ? '…' : 'حفظ'}</button>
      </div>
    </form>
  );
}
