import { useState } from 'react';
import { del, get, patch, post, ApiError } from '../api.ts';
import { money, toast, useLoad } from '../lib.ts';
import { Badge, Confirm, Empty, ErrorBox, Field, Sheet, Spinner } from '../ui.tsx';
import { useApp } from '../App.tsx';

const blank = { name: '', description: '', startingPrice: '', currency: 'SAR', deliveryTime: '', features: '', targetSectors: [] as string[] };

export function Services() {
  const { meta } = useApp();
  const { data, error, loading, reload } = useLoad(() => get('/api/services'));
  const [edit, setEdit] = useState<any>(null);
  const [f, setF] = useState<any>(blank);
  const [err, setErr] = useState<Record<string, string>>({});
  const [rm, setRm] = useState<any>(null);
  const [tpl, setTpl] = useState(false);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  const open = (s?: any) => { setErr({}); setEdit(s ?? {}); setF(s ? { ...s, startingPrice: s.startingPrice || '', features: s.features.join('\n') } : blank); };
  const fromTemplate = (t: any) => { setTpl(false); setErr({}); setEdit({}); setF({ ...blank, name: t.name, description: t.description, features: t.features.join('\n'), targetSectors: [...t.targetSectors] }); };
  const save = async () => {
    const body = { name: f.name, description: f.description, startingPrice: f.startingPrice === '' ? 0 : Number(f.startingPrice), currency: f.currency, deliveryTime: f.deliveryTime, features: f.features.split('\n').map((x: string) => x.trim()).filter(Boolean), targetSectors: f.targetSectors };
    try { edit.id ? await patch(`/api/services/${edit.id}`, body) : await post('/api/services', body); toast('تم الحفظ ✓'); setEdit(null); reload(); }
    catch (e) { setErr((e as ApiError).details ?? { name: (e as ApiError).message }); }
  };
  const toggle = (s: string) => setF({ ...f, targetSectors: f.targetSectors.includes(s) ? f.targetSectors.filter((x: string) => x !== s) : [...f.targetSectors, s] });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-extrabold">الخدمات والعروض</h1>
      <p className="muted">خدماتك وأسعارك أنت من يحددها. تُستخدم في التقييم ومولّد الرسائل والعروض.</p>
      <div className="grid grid-cols-2 gap-2"><button className="btn-primary" onClick={() => open()}>＋ خدمة جديدة</button><button className="btn-soft" onClick={() => setTpl(true)}>من قالب</button></div>
      {data.services.length === 0 ? <Empty title="لا خدمات بعد" hint="أضف ما تبيعه (مثل: موظف واتساب ذكي) مع سعر البداية ومدة التنفيذ." /> : data.services.map((s: any) => (
        <div key={s.id} className="card space-y-2">
          <div className="flex items-start justify-between gap-2"><b className="text-base">{s.name}</b><Badge tone="green">{s.startingPrice > 0 ? `من ${money(s.startingPrice, s.currency)}` : 'السعر غير محدد'}</Badge></div>
          {s.description && <p className="text-sm">{s.description}</p>}
          <div className="muted">⏱ {s.deliveryTime || 'المدة غير محددة'}</div>
          {s.features.length > 0 && <ul className="list-disc ps-5 text-sm">{s.features.map((x: string) => <li key={x}>{x}</li>)}</ul>}
          {s.targetSectors.length > 0 && <div className="flex flex-wrap gap-1">{s.targetSectors.map((x: string) => <Badge key={x}>{x}</Badge>)}</div>}
          <div className="grid grid-cols-2 gap-2"><button className="btn-soft btn-sm" onClick={() => open(s)}>تعديل</button><button className="btn-danger btn-sm" onClick={() => setRm(s)}>حذف</button></div>
        </div>))}
      {tpl && <Sheet title="قوالب خدمات" onClose={() => setTpl(false)}><p className="muted mb-3">القالب يملأ الوصف والمزايا فقط. السعر تحدده أنت.</p><div className="grid gap-2">{meta.serviceTemplates.map((t: any) => <button key={t.name} className="btn-soft justify-start" onClick={() => fromTemplate(t)}>{t.name}</button>)}</div></Sheet>}
      {edit && (
        <Sheet title={edit.id ? 'تعديل الخدمة' : 'خدمة جديدة'} onClose={() => setEdit(null)}>
          <Field label="الاسم *" error={err.name}><input className="input" value={f.name} onChange={(e: any) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="الوصف" error={err.description}><textarea className="input" rows={2} value={f.description} onChange={(e: any) => setF({ ...f, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="سعر البداية" error={err.startingPrice}><input className="input" dir="ltr" inputMode="decimal" value={f.startingPrice} onChange={(e: any) => setF({ ...f, startingPrice: e.target.value })} /></Field>
            <Field label="العملة"><select className="input" value={f.currency} onChange={(e: any) => setF({ ...f, currency: e.target.value })}><option>SAR</option><option>USD</option><option>YER</option><option>AED</option></select></Field>
          </div>
          <Field label="مدة التنفيذ"><input className="input" value={f.deliveryTime} onChange={(e: any) => setF({ ...f, deliveryTime: e.target.value })} placeholder="مثال: 3 إلى 5 أيام" /></Field>
          <Field label="المزايا (سطر لكل ميزة)" error={err.features}><textarea className="input" rows={4} value={f.features} onChange={(e: any) => setF({ ...f, features: e.target.value })} /></Field>
          <Field label="القطاعات المستهدفة"><div className="flex flex-wrap gap-2">{meta.sectors.map((s: string) => <button key={s} type="button" className={f.targetSectors.includes(s) ? 'btn-primary btn-sm' : 'btn-soft btn-sm'} onClick={() => toggle(s)}>{s}</button>)}</div></Field>
          <button className="btn-primary w-full" onClick={save}>حفظ</button>
        </Sheet>)}
      {rm && <Confirm title="حذف الخدمة" text={`حذف «${rm.name}»؟ العملاء المرتبطون بها يبقون بدون خدمة.`} confirmLabel="حذف" onClose={() => setRm(null)} onYes={async () => { await del(`/api/services/${rm.id}`); toast('تم الحذف'); reload(); }} />}
    </div>
  );
}
