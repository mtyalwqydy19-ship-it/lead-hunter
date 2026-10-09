import { useState } from 'react';
import { del, get, patch, post, ApiError } from '../api.ts';
import { toast, useLoad } from '../lib.ts';
import { Badge, Confirm, Field } from '../ui.tsx';
import { useApp } from '../App.tsx';

export function Settings() {
  const { user, setUser, logout, meta } = useApp();
  const ai = useLoad(() => get('/api/ai/status'));
  const providers = useLoad(() => get('/api/discovery/providers'));
  const [p, setP] = useState({ name: user.name, businessName: user.businessName });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwErr, setPwErr] = useState('');
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const [confirm, setConfirm] = useState<null | 'demo'>(null);

  const saveProfile = async () => { try { const r = await patch('/api/auth/profile', p); setUser(r.user); toast('تم الحفظ ✓'); } catch (e) { toast((e as ApiError).message, 'err'); } };
  const changePw = async () => { setPwErr(''); try { await post('/api/auth/password', pw); setPw({ current: '', next: '' }); toast('تم تغيير كلمة المرور'); } catch (e) { setPwErr((e as ApiError).details?.next ?? (e as ApiError).message); } };
  const toggleDark = () => { const v = !dark; setDark(v); document.documentElement.classList.toggle('dark', v); try { localStorage.setItem('lh-theme', v ? 'dark' : 'light'); } catch { /* ignore */ } };
  const exportAll = async () => {
    const d = await get('/api/export');
    const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `lead-hunter-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('تم تنزيل النسخة الاحتياطية');
  };
  const importFile = async (e: any) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { const r = await post('/api/import', JSON.parse(await file.text())); const a = r.added; toast(`استُورد: ${a.leads} عميل، ${a.services} خدمة، ${a.contacts} تواصل`); } catch (x) { toast((x as ApiError).message || 'ملف غير صالح', 'err'); }
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">الإعدادات</h1>
      <div className="card"><h2 className="h2">ملفك</h2>
        <Field label="الاسم (يظهر في توقيع الرسائل)"><input className="input" value={p.name} onChange={(e: any) => setP({ ...p, name: e.target.value })} /></Field>
        <Field label="اسم نشاطك"><input className="input" value={p.businessName} onChange={(e: any) => setP({ ...p, businessName: e.target.value })} /></Field>
        <p className="muted mb-3" dir="ltr">{user.email}</p>
        <button className="btn-primary w-full" onClick={saveProfile}>حفظ</button></div>

      <div className="card"><h2 className="h2">كلمة المرور</h2>
        <Field label="الحالية"><input className="input" dir="ltr" type="password" autoComplete="current-password" value={pw.current} onChange={(e: any) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="الجديدة (8 أحرف+)" error={pwErr}><input className="input" dir="ltr" type="password" autoComplete="new-password" value={pw.next} onChange={(e: any) => setPw({ ...pw, next: e.target.value })} /></Field>
        <button className="btn-soft w-full" onClick={changePw}>تغيير</button></div>

      <div className="card"><h2 className="h2">حالة الاتصالات الخارجية</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between"><span>تحليل AI</span>{ai.data?.enabled ? <Badge tone="green">{ai.data.label}</Badge> : <Badge>غير مفعّل</Badge>}</div>
          {!ai.data?.enabled && <p className="muted">أضف على الخادم أحد المفاتيح: GEMINI_API_KEY أو OPENAI_API_KEY أو ANTHROPIC_API_KEY. المفاتيح لا تدخل الواجهة أبدًا. (المحوّلات مكتوبة لكن لم تُختبر بمفاتيح حقيقية بعد.)</p>}
          {(providers.data?.providers ?? []).map((s: any) => <div key={s.id} className="flex items-center justify-between"><span>{s.label}</span>{s.available ? <Badge tone="green">متصل</Badge> : <Badge>غير متصل</Badge>}</div>)}
        </div></div>

      {!meta.storage?.persistent && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">⚠️ التخزين غير مؤكد كدائم على هذا الخادم. إن كانت استضافتك مجانية فقد تُحذف بياناتك عند إعادة التشغيل — نزّل نسخة احتياطية بانتظام.</div>}
      {meta.storage?.persistent && <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">✅ التخزين على قرص دائم ({meta.storage.kind}). البيانات تبقى بعد إعادة التشغيل.</div>}
      <div className="card"><h2 className="h2">نسخة احتياطية</h2>
        <p className="muted mb-3">إن كانت استضافتك تحذف الملفات عند إعادة التشغيل فاحتفظ بنسخة دورية من بياناتك.</p>
        <div className="grid grid-cols-2 gap-2"><button className="btn-soft" onClick={exportAll}>⬇️ تنزيل</button><label className="btn-soft cursor-pointer">⬆️ استيراد<input type="file" accept="application/json,.json" className="hidden" onChange={importFile} /></label></div></div>

      <div className="card"><h2 className="h2">المظهر والتجربة</h2>
        <button className="btn-soft w-full" onClick={toggleDark}>{dark ? '☀️ الوضع الفاتح' : '🌙 الوضع الداكن'}</button>
        <div className="mt-2 grid grid-cols-2 gap-2"><button className="btn-soft btn-sm" onClick={async () => { const r = await post('/api/demo/seed'); toast(r.created.length ? 'أُضيفت بيانات DEMO' : 'موجودة مسبقًا'); }}>إضافة بيانات DEMO</button><button className="btn-soft btn-sm" onClick={() => setConfirm('demo')}>حذف بيانات DEMO</button></div></div>

      <div className="card"><h2 className="h2">مبادئ التطبيق</h2><ul className="muted list-disc space-y-1 ps-5">{meta.principles.map((x: string) => <li key={x}>{x}</li>)}</ul></div>
      <button className="btn-danger w-full" onClick={logout}>تسجيل الخروج</button>
      {confirm && <Confirm title="حذف بيانات DEMO" text="سيُحذف كل عميل مصدره DEMO فقط." confirmLabel="حذف" onClose={() => setConfirm(null)} onYes={async () => { const r = await del('/api/demo'); toast(`حُذف ${r.removed}`); }} />}
    </div>
  );
}
