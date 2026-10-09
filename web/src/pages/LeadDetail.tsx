import { useState } from 'react';
import { del, get, post, ApiError } from '../api.ts';
import { copyText, fmtDateTime, go, money, relTime, toast, useLoad, waLink } from '../lib.ts';
import { Badge, Confirm, ErrorBox, ScoreBadge, Sheet, Spinner, STATUS_TONE } from '../ui.tsx';
import { ContactSheet, FollowUpDraftSheet, FollowUpPicker, MessageCard, WonSheet } from '../components.tsx';
import { useApp } from '../App.tsx';

const BAR: Record<string, string> = { top: 'bg-emerald-500', good: 'bg-sky-500', medium: 'bg-amber-500', weak: 'bg-slate-400' };

export function LeadDetail({ id }: { id: string }) {
  const { meta } = useApp();
  const { data, error, loading, reload } = useLoad(() => get(`/api/leads/${id}`), [id]);
  const ai = useLoad(() => get('/api/ai/status'));
  const [sheet, setSheet] = useState<null | 'contact' | 'won' | 'move' | 'followup' | 'delete'>(null);
  const [sentText, setSentText] = useState('');
  const [msgs, setMsgs] = useState<any>(null);
  const [fu, setFu] = useState<any>(null);
  const [aiRes, setAiRes] = useState<any>(null);
  const [busy, setBusy] = useState('');
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  const { lead: l, contacts, offers, service } = data;
  const sc = l.scoreBreakdown;
  const lb = meta.labels;
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { toast((e as ApiError).message, 'err'); } finally { setBusy(''); } };

  const move = (status: string) => run('move', async () => {
    if (status === 'WON') { setSheet('won'); return; }
    await post(`/api/leads/${l.id}/move`, { status }); toast('تم تغيير الحالة'); setSheet(null); reload();
  });

  return (
    <div className="space-y-4 pb-4">
      <div className="card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><h1 className="text-xl font-extrabold">{l.businessName}</h1><p className="muted">{[l.businessType, l.city, l.country].filter(Boolean).join(' • ')}</p></div>
          <ScoreBadge score={l.score} band={sc?.band} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[l.status]}>{lb.status[l.status]}</Badge>
          <Badge>المصدر: {lb.source[l.source] ?? l.source}</Badge>
          {l.source === 'DEMO' && <Badge tone="amber">بيانات تجريبية</Badge>}
          {l.estimatedValue > 0 && <Badge tone="blue">قيمة متوقعة {money(l.estimatedValue)}</Badge>}
          {l.status === 'WON' && l.dealValue != null && <Badge tone="green">صفقة {money(l.dealValue, l.currency)}</Badge>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {l.whatsapp ? <a className="btn-wa" href={waLink(l.whatsapp)} target="_blank" rel="noopener noreferrer">واتساب</a> : <span className="btn-soft opacity-60">لا واتساب</span>}
          {l.phone ? <a className="btn-soft" href={`tel:${l.phone}`}>اتصال</a> : <button className="btn-soft" onClick={() => go(`/leads/${l.id}/edit`)}>＋ أضف رقمًا</button>}
          {l.website && <a className="btn-soft btn-sm" href={l.website} target="_blank" rel="noopener noreferrer">الموقع ↗</a>}
          {l.instagram && <a className="btn-soft btn-sm" href={`https://instagram.com/${l.instagram}`} target="_blank" rel="noopener noreferrer">إنستغرام ↗</a>}
          {l.sourceUrl && <a className="btn-soft btn-sm" href={l.sourceUrl} target="_blank" rel="noopener noreferrer">المصدر ↗</a>}
        </div>
      </div>

      {/* تحرك سريع */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between"><h2 className="h2 !mb-0">الخطوة التالية</h2><span className="muted">المتابعة: {l.nextFollowUpAt ? `${relTime(l.nextFollowUpAt)}` : 'غير محددة'}</span></div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={() => { setSentText(''); setSheet('contact'); }}>📝 سجّل تواصل</button>
          <button className="btn-soft" onClick={() => setSheet('followup')}>⏰ موعد متابعة</button>
          <button className="btn-soft" onClick={() => setSheet('move')}>🔀 غيّر الحالة</button>
          <button className="btn-soft" disabled={busy === 'fu'} onClick={() => run('fu', async () => setFu(await post(`/api/leads/${l.id}/followup-draft`)))}>✉️ جهّز متابعة</button>
          {!['WON'].includes(l.status) && <button className="btn-soft col-span-2" onClick={() => setSheet('won')}>🎉 تسجيل صفقة (تم البيع)</button>}
        </div>
      </div>

      {/* Score */}
      <div className="card">
        <h2 className="h2">لماذا هذه الدرجة؟ — {l.score}/100 <span className="muted">({sc?.bandLabel})</span></h2>
        {sc ? <>
          <div className="space-y-2">{sc.parts.map((p: any) => (
            <div key={p.key}><div className="flex justify-between text-sm"><span className="font-semibold">{p.label}</span><span>{p.points}/{p.max}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className={`h-full ${BAR[sc.band]}`} style={{ width: `${(p.points / p.max) * 100}%` }} /></div>
              <p className="muted mt-0.5">{p.reason}</p></div>))}</div>
          {sc.warnings.length > 0 && <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">{sc.warnings.map((w: string) => <li key={w}>⚠️ {w}</li>)}</ul>}
        </> : <p className="muted">لم يُحسب بعد.</p>}
      </div>

      {/* الدليل */}
      <div className="card">
        <div className="mb-2 flex items-center justify-between"><h2 className="h2 !mb-0">إشارة المشكلة والدليل</h2><button className="btn-soft btn-sm" onClick={() => go(`/leads/${l.id}/edit`)}>تعديل</button></div>
        {l.painSignal || l.painEvidence ? <dl className="space-y-2 text-sm">
          {l.painSignal && <div><dt className="muted">الإشارة</dt><dd className="font-medium">{l.painSignal}</dd></div>}
          {l.painEvidence ? <><div><dt className="muted">الدليل</dt><dd className="font-medium">{l.painEvidence}</dd></div><div><dt className="muted">مصدر الدليل</dt><dd className="font-medium">{l.painEvidenceSource}</dd></div></> : <div className="rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">لا يوجد دليل مسجّل — الإشارة فرضية فقط.</div>}
          <div className="flex gap-1.5"><Badge tone="blue">{lb.painLevel[l.painLevel]}</Badge><Badge>الثقة: {lb.confidence[l.painConfidence]}</Badge></div>
        </dl> : <p className="muted">لم تُسجَّل إشارة بعد. افتح المصدر (الموقع/إنستغرام) وسجّل ما تراه فعلًا — لا تفترض.</p>}
        {l.opportunity && <p className="mt-2 text-sm"><span className="muted">الفرصة: </span>{l.opportunity}</p>}
        {service ? <p className="mt-2 text-sm"><span className="muted">الخدمة: </span><b>{service.name}</b></p> : <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">لم تُختر خدمة — <button className="underline" onClick={() => go(`/leads/${l.id}/edit`)}>اختر الآن</button></p>}
      </div>

      {/* AI */}
      <div className="card">
        <h2 className="h2">تحليل الذكاء الاصطناعي</h2>
        {!ai.data?.enabled ? <p className="muted">غير مفعّل — لا يوجد مفتاح مزوّد على الخادم (انظر الإعدادات). التطبيق يعمل كاملًا بدونه.</p> : <>
          <button className="btn-soft w-full" disabled={busy === 'ai'} onClick={() => run('ai', async () => { const r = await post(`/api/leads/${l.id}/analyze`); setAiRes(r); if (r.ok) reload(); else toast(r.error, 'err'); })}>{busy === 'ai' ? 'جارٍ التحليل…' : '🤖 حلّل بـ ' + ai.data.label}</button>
        </>}
        {aiRes && !aiRes.ok && <p className="mt-2 text-sm text-red-600">{aiRes.error}</p>}
        {(aiRes?.ok ? aiRes.analysis : l.aiAnalysis) && (() => { const a = aiRes?.ok ? aiRes.analysis : l.aiAnalysis; return (
          <div className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
            <div className="flex flex-wrap gap-1.5"><Badge tone="violet">اقتراح من {a.provider}</Badge><Badge>{lb.painLevel[a.painLevel]}</Badge><Badge tone="amber">الثقة: {lb.confidence[a.confidence]}</Badge></div>
            {aiRes?.adjustments?.map((x: string) => <p key={x} className="text-amber-700 dark:text-amber-300">⚠️ {x}</p>)}
            <p><b>الإشارة:</b> {a.painSignal}</p><p><b>الفرصة:</b> {a.opportunity}</p><p><b>الخدمة المقترحة:</b> {a.recommendedService}</p><p><b>السبب:</b> {a.reason}</p>
            <p className="muted">اقتراح فقط — راجعه قبل اعتماده.</p>
            <button className="btn-soft btn-sm" onClick={() => run('apply', async () => { await post(`/api/leads/${l.id}/analysis/apply`); toast('تم اعتماد الاقتراح'); reload(); })}>اعتماد الإشارة والفرصة</button>
          </div>); })()}
      </div>

      {/* الرسائل */}
      <div className="card">
        <h2 className="h2">رسالة التواصل</h2>
        <button className="btn-primary w-full" disabled={busy === 'msg'} onClick={() => run('msg', async () => setMsgs(await post(`/api/leads/${l.id}/messages`)))}>✍️ ولّد 3 رسائل</button>
        {msgs && <div className="mt-3 space-y-3">
          <p className={`rounded-lg p-2 text-sm ${msgs.basis === 'EVIDENCE' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'}`}>{msgs.basisNote}</p>
          {msgs.drafts.map((d: any) => <MessageCard key={d.kind} label={d.label} text={d.text} lead={l} onSent={(t) => { setSentText(t); setSheet('contact'); }} />)}
        </div>}
      </div>

      {/* العرض */}
      <div className="card">
        <h2 className="h2">العرض</h2>
        <button className="btn-soft w-full" disabled={busy === 'offer'} onClick={() => run('offer', async () => { await post(`/api/leads/${l.id}/offers`); toast('تم إنشاء العرض'); reload(); })}>📄 أنشئ لي عرضًا</button>
        {offers.map((o: any) => (
          <div key={o.id} className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="mb-1 flex items-center justify-between"><b>{o.content.title}</b>{o.sentAt ? <Badge tone="green">أُرسل {relTime(o.sentAt)}</Badge> : <Badge>مسودة</Badge>}</div>
            <p className="whitespace-pre-wrap text-sm leading-7">{o.content.text}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-primary btn-sm" onClick={() => copyText(o.content.text)}>📋 نسخ</button>
              {l.whatsapp && <a className="btn-wa btn-sm" href={waLink(l.whatsapp, o.content.text)} target="_blank" rel="noopener noreferrer">واتساب</a>}
              {!o.sentAt && <button className="btn-soft btn-sm col-span-2" onClick={() => run('sent', async () => { await post(`/api/offers/${o.id}/sent`); toast('عُلّم كمُرسل'); reload(); })}>✅ أرسلته</button>}
            </div>
          </div>))}
      </div>

      {/* سجل التواصل */}
      <div className="card">
        <h2 className="h2">سجل التواصل ({contacts.length})</h2>
        {contacts.length === 0 ? <p className="muted">لا يوجد تواصل مسجّل بعد.</p> : <ul className="space-y-2">{contacts.map((c: any) => (
          <li key={c.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60"><div className="flex items-center justify-between"><b>{lb.channel[c.channel]} • {lb.outcome[c.outcome]}</b><span className="muted">{fmtDateTime(c.contactedAt)}</span></div>
            {c.message && <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-slate-300">{c.message}</p>}{c.notes && <p className="muted mt-1">ملاحظة: {c.notes}</p>}</li>))}</ul>}
      </div>

      {l.notes && <div className="card"><h2 className="h2">ملاحظات</h2><p className="whitespace-pre-wrap text-sm">{l.notes}</p></div>}
      <button className="btn-danger w-full" onClick={() => setSheet('delete')}>🗑️ حذف العميل</button>

      {sheet === 'contact' && <ContactSheet lead={l} initialMessage={sentText} onClose={() => setSheet(null)} onDone={() => { setSheet(null); setFu(null); reload(); }} />}
      {sheet === 'won' && <WonSheet lead={l} onClose={() => setSheet(null)} onDone={() => { setSheet(null); reload(); }} />}
      {sheet === 'delete' && <Confirm title="حذف العميل" text={`سيُحذف «${l.businessName}» وكل سجل تواصله وعروضه نهائيًا.`} confirmLabel="حذف" onClose={() => setSheet(null)} onYes={async () => { await del(`/api/leads/${l.id}`); toast('تم الحذف'); go('/leads'); }} />}
      {sheet === 'followup' && (
        <Sheet title="موعد المتابعة" onClose={() => setSheet(null)}>
          <FollowUpPicker value={l.nextFollowUpAt ?? undefined} onChange={(iso) => run('f', async () => { await post(`/api/leads/${l.id}/followup`, { at: iso }); toast(iso ? 'تم تحديد الموعد ✓' : 'أُلغي الموعد'); setSheet(null); reload(); })} />
        </Sheet>)}
      {sheet === 'move' && (
        <Sheet title="تغيير الحالة" onClose={() => setSheet(null)}>
          <div className="grid grid-cols-2 gap-2">{meta.statuses.map((s: string) => <button key={s} className={s === l.status ? 'btn-primary' : 'btn-soft'} onClick={() => move(s)}>{lb.status[s]}</button>)}</div>
        </Sheet>)}
      {fu && <FollowUpDraftSheet lead={l} draft={fu} onClose={() => setFu(null)} onSent={(t) => { setFu(null); setSentText(t); setSheet('contact'); }} />}
    </div>
  );
}
