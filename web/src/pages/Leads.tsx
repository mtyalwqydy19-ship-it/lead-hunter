import { useState } from 'react';
import { get } from '../api.ts';
import { go, relTime, useLoad, waLink, cx } from '../lib.ts';
import { Badge, Empty, ErrorBox, ScoreBadge, Spinner, STATUS_TONE } from '../ui.tsx';
import { useApp } from '../App.tsx';

export function LeadCard({ l, labels }: { l: any; labels: any }) {
  const overdue = l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() <= Date.now() + 86400000 && !['WON', 'LOST', 'NOT_A_FIT'].includes(l.status);
  return (
    <div className="card flex flex-col gap-2 active:scale-[0.995]" role="link" tabIndex={0} onClick={() => go(`/leads/${l.id}`)} onKeyDown={(e: any) => e.key === 'Enter' && go(`/leads/${l.id}`)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="truncate text-base font-bold">{l.businessName}</div><div className="muted truncate">{[l.businessType, l.city].filter(Boolean).join(' • ') || 'بدون تصنيف'}</div></div>
        <ScoreBadge score={l.score} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONE[l.status]}>{labels.status[l.status]}</Badge>
        {l.source === 'DEMO' && <Badge tone="amber">DEMO</Badge>}
        {l.nextFollowUpAt && <Badge tone={overdue ? 'red' : 'gray'}>متابعة: {relTime(l.nextFollowUpAt)}</Badge>}
        {l.painEvidence ? <Badge tone="green">بدليل</Badge> : <Badge>بلا دليل</Badge>}
      </div>
      {l.whatsapp && <a className="btn-wa btn-sm self-start" href={waLink(l.whatsapp)} target="_blank" rel="noopener noreferrer" onClick={(e: any) => e.stopPropagation()}>واتساب</a>}
    </div>
  );
}

export function Leads({ initialStatus }: { initialStatus: string }) {
  const { meta } = useApp();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');
  const { data, error, loading, reload } = useLoad(() => get(`/api/leads?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), sort })}`), [status, q, sort]);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-extrabold">العملاء المحتملون</h1>
      <input className="input" placeholder="بحث بالاسم أو النوع أو المدينة" value={q} onChange={(e: any) => setQ(e.target.value)} />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {['', ...meta.statuses].map((s: string) => (
          <button key={s || 'all'} onClick={() => setStatus(s)} className={cx('chip min-h-9 shrink-0 px-3 text-sm', status === s ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200')}>{s ? meta.labels.status[s] : 'الكل'}</button>
        ))}
      </div>
      <select className="input" value={sort} onChange={(e: any) => setSort(e.target.value)} aria-label="الترتيب">
        <option value="new">الأحدث</option><option value="score">الأعلى تقييمًا</option><option value="followup">أقرب متابعة</option>
      </select>
      {loading && !data ? <Spinner /> : error ? <ErrorBox msg={error} retry={reload} /> : data.leads.length === 0 ? (
        <Empty title={q || status ? 'لا نتائج مطابقة' : 'لا يوجد عملاء بعد'} hint={q || status ? 'جرّب تغيير البحث أو الفلتر' : 'أضف عميلًا حقيقيًا مع مصدره'}>
          <button className="btn-primary" onClick={() => go('/leads/new')}>＋ إضافة عميل محتمل يدويًا</button>
        </Empty>
      ) : <div className="space-y-3">{data.leads.map((l: any) => <LeadCard key={l.id} l={l} labels={meta.labels} />)}</div>}
    </div>
  );
}
