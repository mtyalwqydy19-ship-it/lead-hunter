import { get, post, tz } from '../api.ts';
import { go, money, num, toast, useLoad } from '../lib.ts';
import { Empty, ErrorBox, Spinner } from '../ui.tsx';
import { useApp } from '../App.tsx';

const LEVEL: Record<string, string> = {
  red: 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40', orange: 'border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40',
  green: 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40', star: 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40', blue: 'border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40',
};
const DOT: Record<string, string> = { red: '🔴', orange: '🟠', green: '🟢', star: '⭐', blue: '🔵' };

const Stat = ({ label, value, onClick }: { label: string; value: string | number; onClick?: () => void }) => (
  <button onClick={onClick} className="card flex flex-col items-start gap-1 text-start active:scale-[0.98]"><span className="text-2xl font-extrabold">{value}</span><span className="muted">{label}</span></button>
);

export function Home() {
  const { user, meta } = useApp();
  const { data, error, loading, reload } = useLoad(() => get(`/api/dashboard?tz=${tz()}`));
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  const c = data.counts, m = data.money;
  if (data.empty) {
    return (
      <div className="space-y-4">
        <Empty title="ابدأ بأول عميل محتمل" hint="التطبيق فارغ عمدًا: لا بيانات وهمية. ابحث عن نشاط حقيقي، أضفه مع مصدره، وسجّل ما لاحظته فعلًا.">
          <button className="btn-primary" onClick={() => go('/leads/new')}>＋ أضف أول عميل محتمل</button>
          <button className="btn-soft" onClick={() => go('/discover')}>🔎 كيف أجد عملاء؟</button>
          <button className="btn-soft btn-sm" onClick={async () => { await post('/api/demo/seed'); toast('أُضيف عميلان تجريبيان (DEMO)'); reload(); }}>تجربة ببيانات DEMO موسومة</button>
        </Empty>
        <div className="card"><h2 className="h2">مبادئ التطبيق</h2><ul className="muted list-disc space-y-1 ps-5">{meta.principles.map((p: string) => <li key={p}>{p}</li>)}</ul></div>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <p className="text-lg font-bold">أهلًا {user.name || ''} 👋</p>
      <section>
        <h2 className="h2">مهمتك الآن</h2>
        {data.tasks.length === 0 ? <div className="card muted">لا مهام عاجلة الآن. أضف عملاء جدد أو حلّل الحاليين.</div> : (
          <div className="space-y-2">
            {data.tasks.map((t: any, i: number) => (
              <button key={t.key} onClick={() => go(t.href)} className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border p-3 text-start font-semibold active:scale-[0.99] ${LEVEL[t.level]}`}>
                <span className="text-xl" aria-hidden>{DOT[t.level]}</span><span className="flex-1">{i + 1}. {t.text}</span><span aria-hidden>‹</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="h2">الأرقام</h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="العملاء المحتملون" value={num(c.total)} onClick={() => go('/leads')} />
          <Stat label="عملاء جدد" value={num(c.newLeads)} onClick={() => go('/leads?status=NEW')} />
          <Stat label="فرص قوية (61+)" value={num(c.strong)} onClick={() => go('/leads')} />
          <Stat label="متابعة اليوم" value={num(c.dueToday)} onClick={() => go('/followups')} />
          <Stat label="تم التواصل" value={num(c.contacted)} />
          <Stat label="ردّوا" value={num(c.replied)} />
          <Stat label="مهتمون" value={num(c.interested)} onClick={() => go('/leads?status=INTERESTED')} />
          <Stat label="عروض مرسلة" value={num(c.offersSent)} />
          <Stat label="عملاء تم إغلاقهم" value={num(c.won)} onClick={() => go('/leads?status=WON')} />
        </div>
      </section>
      <section>
        <h2 className="h2">المال</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="card"><div className="muted">قيمة الصفقات المتوقعة</div><div className="mt-1 text-xl font-extrabold">{money(m.pipelineValue)}</div></div>
          <div className="card border-emerald-300 dark:border-emerald-800"><div className="muted">الإيرادات الفعلية</div><div className="mt-1 text-xl font-extrabold text-emerald-700 dark:text-emerald-400">{money(m.revenue)}</div></div>
        </div>
        {m.mixedCurrencies && <p className="muted mt-2">تنبيه: لديك صفقات بعملات مختلفة؛ المجاميع أعلاه تجمع الأرقام كما سُجّلت.</p>}
      </section>
    </div>
  );
}
