import { useState } from 'react';
import { post, ApiError } from '../api.ts';
import { Field } from '../ui.tsx';

export function Login({ needsSetup, blocked, codeRequired, onDone }: { needsSetup: boolean; blocked?: boolean; codeRequired: boolean; onDone: (u: any) => void }) {
  const [f, setF] = useState({ name: '', businessName: '', email: '', password: '', setupCode: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true); setErr({}); setMsg('');
    try {
      const r = await post(needsSetup ? '/api/auth/register' : '/api/auth/login', needsSetup ? f : { email: f.email, password: f.password });
      onDone(r.user);
    } catch (x) {
      const a = x as ApiError;
      setMsg(a.message); setErr(a.details ?? {});
    } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center"><div className="text-5xl" aria-hidden>🎯</div><h1 className="mt-2 text-2xl font-extrabold text-brand-700 dark:text-brand-500">صائد العملاء</h1><p className="muted mt-1">{needsSetup ? 'أنشئ حسابك الخاص للبدء — أول من يسجّل هو المالك' : 'سجّل الدخول لمتابعة عملائك'}</p></div>
      {needsSetup && blocked && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">لم يُضبط SETUP_CODE على الخادم بعد، لذلك إنشاء الحساب الأول معطّل حمايةً لك. ضعه في متغيرات البيئة ثم أعد المحاولة.</p>}
      <form onSubmit={submit} className="card">
        {needsSetup && <>
          <Field label="اسمك" error={err.name}><input className="input" value={f.name} onChange={set('name')} autoComplete="name" /></Field>
          <Field label="اسم نشاطك (يظهر في توقيع الرسائل)" error={err.businessName}><input className="input" value={f.businessName} onChange={set('businessName')} /></Field>
        </>}
        <Field label="البريد الإلكتروني" error={err.email}><input className="input" dir="ltr" type="email" inputMode="email" autoComplete="username" value={f.email} onChange={set('email')} required /></Field>
        <Field label="كلمة المرور" error={err.password} hint={needsSetup ? '8 أحرف على الأقل' : undefined}><input className="input" dir="ltr" type="password" autoComplete={needsSetup ? 'new-password' : 'current-password'} value={f.password} onChange={set('password')} required /></Field>
        {needsSetup && codeRequired && <Field label="رمز الإعداد (من إعدادات الخادم)" error={err.setupCode}><input className="input" dir="ltr" value={f.setupCode} onChange={set('setupCode')} /></Field>}
        {msg && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? '…' : needsSetup ? 'إنشاء الحساب' : 'دخول'}</button>
      </form>
    </div>
  );
}
