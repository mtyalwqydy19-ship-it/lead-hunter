import { get } from '../api.ts';
import { fmtDateTime, go, useLoad } from '../lib.ts';
import { Badge, Empty, ErrorBox, Spinner } from '../ui.tsx';
import { useApp } from '../App.tsx';

const TONE: Record<string, string> = { NO_RESPONSE: 'gray', REPLIED: 'blue', INTERESTED: 'amber', NOT_INTERESTED: 'red', FOLLOW_UP: 'violet', WON: 'green', LOST: 'red' };

export function Contacts() {
  const { meta } = useApp();
  const { data, error, loading, reload } = useLoad(() => get('/api/contacts'));
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-extrabold">سجل التواصل</h1>
      <p className="muted">كل ما سجّلته بنفسك. التطبيق لا يرسل رسائل — أنت من يرسل ثم يسجّل.</p>
      {data.contacts.length === 0 ? <Empty title="لا تواصل مسجّل" hint="افتح عميلًا، ولّد رسالة، أرسلها بنفسك، ثم اضغط «أرسلتها»." /> :
        data.contacts.map((c: any) => (
          <button key={c.id} className="card w-full text-start" onClick={() => go(`/leads/${c.leadId}`)}>
            <div className="flex items-center justify-between gap-2"><b className="truncate">{c.businessName}</b><Badge tone={TONE[c.outcome]}>{meta.labels.outcome[c.outcome]}</Badge></div>
            <div className="muted">{meta.labels.channel[c.channel]} • {fmtDateTime(c.contactedAt)}</div>
            {c.message && <p className="mt-1 line-clamp-2 text-sm">{c.message}</p>}
          </button>))}
    </div>
  );
}
