import { useState } from 'react';
import { get, post, tz } from '../api.ts';
import { go, relTime, toast, useLoad, waLink } from '../lib.ts';
import { Badge, Empty, ErrorBox, Spinner } from '../ui.tsx';
import { ContactSheet, FollowUpDraftSheet } from '../components.tsx';
import { useApp } from '../App.tsx';

export function FollowUps() {
  const { meta } = useApp();
  const { data, error, loading, reload } = useLoad(() => get(`/api/followups?tz=${tz()}`));
  const [draft, setDraft] = useState<{ lead: any; d: any } | null>(null);
  const [log, setLog] = useState<{ lead: any; msg: string } | null>(null);
  const [showUp, setShowUp] = useState(false);
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  const items = data.items;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-extrabold">متابعات اليوم</h1>
      {items.length > 0 && <p className="font-semibold text-red-700 dark:text-red-400">{items.length} {items.length === 1 ? 'متابعة مستحقة' : 'متابعات مستحقة'} اليوم</p>}
      {items.length === 0 ? <Empty title="لا متابعات مستحقة اليوم 🎉" hint="عند تسجيل تواصل بلا رد يُحدَّد موعد المتابعة تلقائيًا ويظهر العميل هنا." /> : items.map((it: any) => {
        const l = it.lead;
        return (
          <div key={l.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <button className="min-w-0 text-start" onClick={() => go(`/leads/${l.id}`)}><div className="truncate text-base font-bold">{l.businessName}</div><div className="muted">{[l.businessType, l.city].filter(Boolean).join(' • ')}</div></button>
              <Badge tone={it.dueKind === 'overdue' ? 'red' : 'amber'}>{it.dueKind === 'overdue' ? `متأخرة (${relTime(l.nextFollowUpAt)})` : 'اليوم'}</Badge>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5 text-sm dark:bg-slate-800/60">
              <div><span className="muted">آخر تواصل: </span><b>{l.lastContactAt ? relTime(l.lastContactAt) : 'لم يُسجَّل'}</b>{it.lastChannel && <span className="muted"> عبر {meta.labels.channel[it.lastChannel]}</span>}</div>
              <div><span className="muted">الحالة: </span><b>{it.lastOutcome ? meta.labels.outcome[it.lastOutcome] : meta.labels.status[l.status]}</b>{it.noResponseStreak > 1 && <span className="text-red-600"> ({it.noResponseStreak} محاولات بلا رد)</span>}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-primary" onClick={async () => setDraft({ lead: l, d: await post(`/api/leads/${l.id}/followup-draft`) })}>✉️ جهّز متابعة</button>
              <button className="btn-soft" onClick={() => setLog({ lead: l, msg: '' })}>📝 سجّل تواصل</button>
              {l.whatsapp && <a className="btn-wa btn-sm col-span-2" href={waLink(l.whatsapp)} target="_blank" rel="noopener noreferrer">فتح واتساب</a>}
            </div>
          </div>
        );
      })}
      {data.upcoming.length > 0 && <div className="card"><button className="flex w-full items-center justify-between font-bold" onClick={() => setShowUp(!showUp)}><span>قادمة ({data.upcoming.length})</span><span>{showUp ? '▲' : '▼'}</span></button>
        {showUp && <ul className="mt-2 space-y-1">{data.upcoming.map((l: any) => <li key={l.id}><button className="flex w-full justify-between py-1.5 text-start text-sm" onClick={() => go(`/leads/${l.id}`)}><span>{l.businessName}</span><span className="muted">{relTime(l.nextFollowUpAt)}</span></button></li>)}</ul>}</div>}
      {draft && <FollowUpDraftSheet lead={draft.lead} draft={draft.d} onClose={() => setDraft(null)} onSent={(t) => { setLog({ lead: draft.lead, msg: t }); setDraft(null); }} />}
      {log && <ContactSheet lead={log.lead} initialMessage={log.msg} onClose={() => setLog(null)} onDone={() => { setLog(null); reload(); toast('تم — المتابعة التالية محدّدة'); }} />}
    </div>
  );
}
