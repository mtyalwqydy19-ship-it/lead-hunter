import { useEffect, useRef, useState } from 'react';
import { get, post } from '../api.ts';
import { cx, go, money, toast, useLoad } from '../lib.ts';
import { ErrorBox, ScoreBadge, Sheet, Spinner } from '../ui.tsx';
import { WonSheet } from '../components.tsx';
import { useApp } from '../App.tsx';

const COL_TONE: Record<string, string> = { WON: 'border-emerald-400', LOST: 'border-red-300' };

export function Pipeline() {
  const { meta } = useApp();
  const leads = useLoad(() => get('/api/leads?sort=score'));
  const rev = useLoad(() => get('/api/revenue'));
  const [moving, setMoving] = useState<any>(null);
  const [won, setWon] = useState<any>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const scroller = useRef<any>(null);
  const ptr = useRef<{ x: number; y: number } | null>(null);
  // تمرير تلقائي للحواف أثناء السحب حتى يمكن الوصول للأعمدة البعيدة على الهاتف
  const dragId = drag?.id;
  useEffect(() => {
    if (!dragId) return;
    const t = setInterval(() => {
      const el = scroller.current, p = ptr.current;
      if (!el || !p) return;
      const edge = 56;
      if (p.x < edge) el.scrollLeft -= 14; else if (p.x > window.innerWidth - edge) el.scrollLeft += 14;
      else return;
      const col = (document.elementFromPoint(p.x, p.y) as HTMLElement | null)?.closest('[data-col]')?.getAttribute('data-col') ?? null;
      setDrag((d: any) => (d ? { ...d, over: col } : d));
    }, 30);
    return () => clearInterval(t);
  }, [dragId]);

  if ((leads.loading && !leads.data) || (rev.loading && !rev.data)) return <Spinner />;
  if (leads.error || !leads.data) return <ErrorBox msg={leads.error} retry={leads.reload} />;
  const all: any[] = leads.data.leads;
  const r = rev.data;
  const reloadAll = () => { leads.reload(); rev.reload(); };

  const doMove = async (lead: any, status: string) => {
    if (lead.status === status) return;
    if (status === 'WON') { setWon(lead); return; }
    // تحديث متفائل ثم تأكيد من الخادم (يُحدّث قاعدة البيانات فعليًا)
    leads.set({ leads: all.map((x) => (x.id === lead.id ? { ...x, status } : x)) });
    try { await post(`/api/leads/${lead.id}/move`, { status }); toast(`نُقل إلى «${meta.labels.status[status]}»`); } catch (e: any) { toast(e.message, 'err'); }
    reloadAll();
  };

  // سحب بالمؤشر (يعمل باللمس والفأرة): نمسك المقبض ونسحب فوق عمود
  const onDown = (e: any, lead: any) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    ptr.current = { x: e.clientX, y: e.clientY };
    setDrag({ id: lead.id, over: null });
  };
  const colAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-col]')?.getAttribute('data-col') ?? null;
  const onMove = (e: any) => { ptr.current = { x: e.clientX, y: e.clientY }; if (drag) setDrag({ ...drag, over: colAt(e.clientX, e.clientY) }); };
  const onUp = (e: any, lead: any) => {
    const col = colAt(e.clientX, e.clientY);
    setDrag(null); start.current = null;
    if (col && col !== lead.status) void doMove(lead, col);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">الفرص</h1>
      {r && <div className="grid grid-cols-2 gap-3">
        <div className="card"><div className="muted">فرص محتملة</div><div className="text-lg font-extrabold">{money(r.pipelineValue)}</div></div>
        <div className="card"><div className="muted">عروض مرسلة ({r.openOffers})</div><div className="text-lg font-extrabold">{money(r.offersValue)}</div></div>
        <div className="card"><div className="muted">مبيعات مغلقة</div><div className="text-lg font-extrabold">{r.closedSales}{r.winRate !== null && <span className="muted"> • إغلاق {r.winRate}%</span>}</div></div>
        <div className="card border-emerald-400"><div className="muted">الإيرادات</div><div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">{money(r.revenue)}</div><div className="muted">هذا الشهر: {money(r.revenueThisMonth)}</div></div>
      </div>}
      <p className="muted">اسحب بالمقبض ⠿ إلى عمود آخر، أو اضغط «نقل». التغيير يُحفظ في قاعدة البيانات فورًا.</p>
      {all.length === 0 ? <div className="card text-center"><p className="mb-3 font-bold">لا عملاء في المسار بعد</p><button className="btn-primary" onClick={() => go('/leads/new')}>＋ أضف عميلًا</button></div> : (
        <div ref={scroller} className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4" style={{ touchAction: drag ? 'none' : 'pan-x pan-y' }}>
          {meta.pipelineColumns.map((col: string) => {
            const items = all.filter((l) => l.status === col);
            const sum = items.reduce((a, l) => a + (col === 'WON' ? l.dealValue ?? 0 : l.estimatedValue), 0);
            return (
              <div key={col} data-col={col} className={cx('w-72 shrink-0 rounded-2xl border-2 bg-slate-100 p-2 dark:bg-slate-900', COL_TONE[col] ?? 'border-transparent', drag?.over === col && 'ring-4 ring-brand-500/50')}>
                <div className="mb-2 flex items-center justify-between px-1"><b>{meta.labels.status[col]} <span className="muted">({items.length})</span></b>{sum > 0 && <span className="muted">{money(sum)}</span>}</div>
                <div className="space-y-2">
                  {items.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 dark:border-slate-700">فارغ</div>}
                  {items.map((l) => (
                    <div key={l.id} className={cx('rounded-xl bg-white p-3 shadow-sm dark:bg-slate-800', drag?.id === l.id && 'opacity-50 ring-2 ring-brand-500')}>
                      <div className="flex items-start gap-2">
                        <span role="button" aria-label="اسحب" className="select-none px-1 text-xl leading-none text-slate-400" style={{ touchAction: 'none', cursor: 'grab' }} onPointerDown={(e: any) => onDown(e, l)} onPointerMove={onMove} onPointerUp={(e: any) => onUp(e, l)} onPointerCancel={() => setDrag(null)}>⠿</span>
                        <button className="min-w-0 flex-1 text-start" onClick={() => go(`/leads/${l.id}`)}><div className="truncate font-bold">{l.businessName}</div><div className="muted truncate">{[l.businessType, l.city].filter(Boolean).join(' • ')}</div></button>
                        <ScoreBadge score={l.score} />
                      </div>
                      <button className="btn-soft btn-sm mt-2 w-full" onClick={() => setMoving(l)}>نقل ⇄</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {moving && <Sheet title={`نقل «${moving.businessName}»`} onClose={() => setMoving(null)}><div className="grid grid-cols-2 gap-2">{[...meta.pipelineColumns, 'NOT_A_FIT'].map((s: string) => <button key={s} className={s === moving.status ? 'btn-primary' : 'btn-soft'} onClick={() => { const m = moving; setMoving(null); void doMove(m, s); }}>{meta.labels.status[s]}</button>)}</div></Sheet>}
      {won && <WonSheet lead={won} onClose={() => setWon(null)} onDone={() => { setWon(null); reloadAll(); }} />}
    </div>
  );
}
