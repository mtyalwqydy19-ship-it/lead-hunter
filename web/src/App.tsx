import { createContext, useContext, useEffect, useState } from 'react';
import { get, setUnauthorizedHandler, tz } from './api.ts';
import { go, useHash, useLoad } from './lib.ts';
import { Sheet, Spinner, Toaster, ErrorBox } from './ui.tsx';
import { Login } from './pages/Login.tsx';
import { Home } from './pages/Home.tsx';
import { Leads } from './pages/Leads.tsx';
import { LeadForm } from './pages/LeadForm.tsx';
import { LeadDetail } from './pages/LeadDetail.tsx';
import { Discover } from './pages/Discover.tsx';
import { Pipeline } from './pages/Pipeline.tsx';
import { Contacts } from './pages/Contacts.tsx';
import { FollowUps } from './pages/FollowUps.tsx';
import { Services } from './pages/Services.tsx';
import { Settings } from './pages/Settings.tsx';

export type User = { id: string; email: string; name: string; businessName: string };
const Ctx = createContext<{ meta: any; user: User; setUser: (u: User) => void; logout: () => void }>(null as any);
export const useApp = () => useContext(Ctx);

const NAV = [
  { path: '/', label: 'الرئيسية', icon: '🏠' },
  { path: '/leads', label: 'العملاء', icon: '👥' },
  { path: '/pipeline', label: 'الفرص', icon: '📊' },
  { path: '/followups', label: 'المتابعات', icon: '⏰' },
];
const MORE = [
  { path: '/discover', label: 'اكتشاف العملاء', icon: '🔎' },
  { path: '/contacts', label: 'سجل التواصل', icon: '💬' },
  { path: '/services', label: 'الخدمات والعروض', icon: '🧰' },
  { path: '/settings', label: 'الإعدادات', icon: '⚙️' },
];

function parse(h: string) {
  const [path, qs] = h.split('?');
  return { path: path || '/', q: new URLSearchParams(qs ?? '') };
}

function Router() {
  const h = useHash();
  const { path, q } = parse(h);
  const seg = path.split('/').filter(Boolean);
  if (path === '/') return <Home />;
  if (seg[0] === 'leads') {
    if (seg.length === 1) return <Leads initialStatus={q.get('status') ?? ''} />;
    if (seg[1] === 'new') return <LeadForm />;
    if (seg[2] === 'edit') return <LeadForm id={seg[1]} />;
    return <LeadDetail id={seg[1]} />;
  }
  if (seg[0] === 'discover') return <Discover />;
  if (seg[0] === 'pipeline') return <Pipeline />;
  if (seg[0] === 'contacts') return <Contacts />;
  if (seg[0] === 'followups') return <FollowUps />;
  if (seg[0] === 'services') return <Services />;
  if (seg[0] === 'settings') return <Settings />;
  return <ErrorBox msg="الصفحة غير موجودة" retry={() => go('/')} />;
}

function Shell() {
  const h = useHash();
  const { path } = parse(h);
  const [more, setMore] = useState(false);
  const due = useLoad(() => get(`/api/followups?tz=${tz()}`), [h]);
  const dueCount = due.data?.items?.length ?? 0;
  const active = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));
  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-28">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <a href="#/" className="flex items-center gap-2 text-lg font-extrabold text-brand-700 dark:text-brand-500"><span aria-hidden>🎯</span> صائد العملاء</a>
        <button className="btn-primary btn-sm" onClick={() => go('/leads/new')}>＋ عميل</button>
      </header>
      <main className="px-4 pt-4"><Router /></main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {NAV.map((n) => (
            <a key={n.path} href={`#${n.path}`} className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active(n.path) ? 'text-brand-700 dark:text-brand-500' : 'text-slate-500'}`}>
              <span className="text-xl" aria-hidden>{n.icon}</span>{n.label}
              {n.path === '/followups' && dueCount > 0 && <span className="absolute top-1.5 start-1/2 ms-2 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{dueCount}</span>}
            </a>
          ))}
          <button onClick={() => setMore(true)} className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${MORE.some((m) => active(m.path)) ? 'text-brand-700 dark:text-brand-500' : 'text-slate-500'}`}>
            <span className="text-xl" aria-hidden>☰</span>المزيد
          </button>
        </div>
      </nav>
      {more && (
        <Sheet title="المزيد" onClose={() => setMore(false)}>
          <div className="grid gap-2">
            {MORE.map((m) => (
              <button key={m.path} className="btn-soft justify-start" onClick={() => { setMore(false); go(m.path); }}><span aria-hidden>{m.icon}</span> {m.label}</button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

export function App() {
  const [meta, setMeta] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [boot, setBoot] = useState<{ needsSetup: boolean; setupCodeRequired: boolean; setupBlocked?: boolean } | null>(null);
  const [err, setErr] = useState('');

  const refresh = async () => {
    try {
      const [m, me] = await Promise.all([get('/api/meta'), get('/api/auth/me')]);
      setMeta(m); setUser(me.user); setBoot({ needsSetup: me.needsSetup, setupCodeRequired: me.setupCodeRequired, setupBlocked: me.setupBlocked }); setErr('');
    } catch (e: any) { setErr(e.message || 'تعذّر الاتصال'); }
  };
  useEffect(() => { void refresh(); setUnauthorizedHandler(() => setUser(null)); }, []);

  if (err) return <div className="p-4"><ErrorBox msg={err} retry={refresh} /></div>;
  if (!meta || !boot) return <Spinner />;
  return (
    <>
      {!user ? <Login needsSetup={boot.needsSetup} blocked={!!boot.setupBlocked} codeRequired={boot.setupCodeRequired} onDone={(u: User) => setUser(u)} /> : (
        <Ctx.Provider value={{ meta, user, setUser, logout: () => { void fetch('/api/auth/logout', { method: 'POST' }).finally(() => { setUser(null); location.hash = '/'; }); } }}>
          <Shell />
        </Ctx.Provider>
      )}
      <Toaster />
    </>
  );
}
