import { useState } from 'react';
import { get, post, ApiError } from '../api.ts';
import { go, toast, useLoad } from '../lib.ts';
import { Badge, Field } from '../ui.tsx';
import { useApp } from '../App.tsx';
import { LeadForm } from './LeadForm.tsx';

export function Discover() {
  const { meta } = useApp();
  const providers = useLoad(() => get('/api/discovery/providers'));
  const services = useLoad(() => get('/api/services'));
  const [f, setF] = useState({ country: 'السعودية', city: '', sector: 'عيادات', pain: '', serviceId: '', limit: '10' });
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<any>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const live = (providers.data?.providers ?? []).find((p: any) => p.available);

  const search = async (e: any) => {
    e.preventDefault(); setBusy(true);
    try { setRes(await post('/api/discovery/search', { provider: live?.id ?? 'manual', country: f.country, city: f.city, sector: f.sector, pain: f.pain, limit: Number(f.limit) })); }
    catch (x) { toast((x as ApiError).message, 'err'); } finally { setBusy(false); }
  };
  if (adding) return <LeadForm prefill={adding} />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">اكتشاف العملاء</h1>
      <div className="card text-sm leading-7">
        <b>كيف يعمل؟</b> التطبيق لا يخترع شركات. {live ? `المصدر المتصل: ${live.label}. النتائج مرشّحون فقط (اسم/عنوان/هاتف) بلا أي ادعاء عن مشكلتهم.` : 'لا يوجد مصدر بحث آلي متصل الآن، لذلك أعطيك روابط بحث جاهزة تفتحها بنفسك، ثم تضيف النشاط يدويًا مع ما رأيته فعلًا.'}
      </div>
      <form onSubmit={search} className="card">
        <div className="grid grid-cols-2 gap-3">
          <Field label="الدولة"><input className="input" value={f.country} onChange={set('country')} /></Field>
          <Field label="المدينة"><input className="input" value={f.city} onChange={set('city')} /></Field>
        </div>
        <Field label="القطاع"><input className="input" list="sec" value={f.sector} onChange={set('sector')} required /><datalist id="sec">{meta.sectors.map((s: string) => <option key={s} value={s} />)}</datalist></Field>
        <Field label="نوع المشكلة التي تبحث عنها"><select className="input" value={f.pain} onChange={set('pain')}><option value="">— أي نوع —</option>{meta.painTypes.map((p: string) => <option key={p}>{p}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الخدمة التي أبيعها"><select className="input" value={f.serviceId} onChange={set('serviceId')}><option value="">— اختر —</option>{(services.data?.services ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="عدد النتائج"><input className="input" dir="ltr" inputMode="numeric" value={f.limit} onChange={set('limit')} /></Field>
        </div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : live ? 'ابحث' : 'جهّز روابط البحث'}</button>
      </form>

      {res && <div className="space-y-3">
        {res.reason && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{res.reason}</p>}
        <div className="card"><h2 className="h2">ابحث بنفسك ثم أضف</h2>
          <div className="grid gap-2"><a className="btn-soft" href={res.links.maps} target="_blank" rel="noopener noreferrer">🗺️ خرائط جوجل ↗</a><a className="btn-soft" href={res.links.web} target="_blank" rel="noopener noreferrer">🔎 بحث جوجل ↗</a><a className="btn-soft" href={res.links.instagram} target="_blank" rel="noopener noreferrer">📷 إنستغرام (عبر جوجل) ↗</a></div>
          <p className="muted mt-3">ما الذي تبحث عنه في النشاط؟ طريقة حجز يدوية، رقم واتساب وحيد للاستفسارات، أسئلة متكررة في التعليقات، لا رد خارج الدوام… سجّل فقط ما تراه فعلًا.</p>
        </div>
        {res.candidates.map((c: any) => (
          <div key={c.sourceId} className="card"><b>{c.businessName}</b><p className="muted">{c.address}</p>{c.phone && <p dir="ltr" className="text-start text-sm">{c.phone}</p>}<div className="mt-2"><Badge tone="blue">مرشّح من {res.provider ?? 'Google'} — لم يُحلَّل</Badge></div>
            <button className="btn-primary btn-sm mt-3" onClick={() => setAdding({ businessName: c.businessName, businessType: c.businessType, country: c.country, city: c.city, phone: c.phone, website: c.website, source: 'GOOGLE_MAPS', sourceUrl: c.sourceUrl, description: c.address })}>＋ أضف كعميل محتمل</button></div>))}
      </div>}
      <button className="btn-primary w-full" onClick={() => go('/leads/new')}>＋ إضافة عميل محتمل يدويًا</button>
    </div>
  );
}
