// اختبار بقاء البيانات: ملف SQLite حقيقي، إيقاف الخادم تمامًا ثم تشغيله من جديد.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSqlite, migrate } from '../server/db.ts';
import { createApp } from '../server/index.ts';

const dir = mkdtempSync(join(tmpdir(), 'lh-persist-'));
const file = join(dir, 'lead-hunter.sqlite');
async function boot() {
  const db = openSqlite(file); await migrate(db);
  const app = createApp({ db, aiProvider: null });
  const srv = app.server(); await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  return { base, stop: () => new Promise<void>((r) => srv.close(() => { db.close(); r(); })) };
}
const j = async (base: string, method: string, path: string, body?: unknown, cookie = '') => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { res, j: (await res.json()) as any };
};
let a = await boot();
const reg = await j(a.base, 'POST', '/api/auth/register', { email: 'p@test.com', password: 'password123', name: 'ن' });
const ck = reg.res.headers.get('set-cookie')!.split(';')[0];
const lead = (await j(a.base, 'POST', '/api/leads', { businessName: 'نشاط باقٍ', estimatedValue: 900 }, ck)).j.lead;
await j(a.base, 'POST', `/api/leads/${lead.id}/move`, { status: 'WON', dealValue: 1234 }, ck);
await a.stop();
// "إعادة تشغيل": عملية خادم جديدة على نفس الملف
a = await boot();
const login = await j(a.base, 'POST', '/api/auth/login', { email: 'p@test.com', password: 'password123' });
assert.equal(login.res.status, 200);
const ck2 = login.res.headers.get('set-cookie')!.split(';')[0];
const dash = (await j(a.base, 'GET', '/api/dashboard?tz=0', undefined, ck2)).j;
assert.equal(dash.counts.total, 1); assert.equal(dash.money.revenue, 1234);
assert.equal((await j(a.base, 'GET', '/api/auth/me', undefined, ck)).j.user.email, 'p@test.com', 'الجلسة القديمة تبقى صالحة بعد إعادة التشغيل');
console.log('✓ البيانات والحساب والجلسة والإيراد بقيت بعد إعادة تشغيل الخادم');
await a.stop(); rmSync(dir, { recursive: true, force: true });
