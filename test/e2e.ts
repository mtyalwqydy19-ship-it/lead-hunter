// اختبار شامل عبر HTTP حقيقي: يغطي بنود "Definition of Done" الخمسة عشر + الأمان + قواعد "لا اختلاق".
import assert from 'node:assert/strict';
import { openSqlite, migrate } from '../server/db.ts';
import { createApp } from '../server/index.ts';
import { MockProvider } from '../server/ai/providers.ts';

const db = openSqlite(':memory:');
await migrate(db);
const app = createApp({ db, aiProvider: null, allowRegistration: false });
const srv = app.server();
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;

let cookie = '';
async function api(method: string, path: string, body?: unknown, ck = cookie) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get('set-cookie');
  if (sc && ck === cookie && path.startsWith('/api/auth/')) cookie = sc.split(';')[0];
  const j = await res.json().catch(() => ({}));
  return { status: res.status, j: j as any };
}
let n = 0;
const ok = (name: string) => console.log(`✓ ${++n}. ${name}`);
const TZ = -180;

// --- مصادقة وأمان ---
assert.equal((await api('GET', '/api/leads')).status, 401); ok('الوصول بدون جلسة مرفوض');
let r = await api('GET', '/api/auth/me');
assert.equal(r.j.needsSetup, true);
r = await api('POST', '/api/auth/register', { email: 'a@test.com', password: 'short' });
assert.equal(r.status, 400); ok('كلمة مرور قصيرة مرفوضة');
r = await api('POST', '/api/auth/register', { email: 'a@test.com', password: 'password123', name: 'أحمد', businessName: 'استوديو' });
assert.equal(r.status, 200); assert.ok(cookie.startsWith('lh_session=')); ok('إنشاء الحساب الأول وتسجيل الدخول');
const cookieA = cookie;
assert.equal((await api('POST', '/api/auth/register', { email: 'b@test.com', password: 'password123' }, '')).status, 403); ok('التسجيل مغلق بعد المستخدم الأول');
assert.equal((await api('POST', '/api/auth/login', { email: 'a@test.com', password: 'wrongpass' }, '')).status, 401); ok('كلمة مرور خاطئة مرفوضة');

// الدفعة 0: التطبيق فارغ
r = await api('GET', `/api/dashboard?tz=${TZ}`);
assert.equal(r.j.empty, true); assert.equal(r.j.counts.total, 0); assert.equal(r.j.money.revenue, 0); ok('الرئيسية فارغة عند أول تشغيل (لا أرقام ثابتة)');

// 7: الخدمة
r = await api('POST', '/api/services', { name: 'موظف واتساب ذكي', description: 'رد آلي', startingPrice: 1500, deliveryTime: '5 أيام', features: ['ردود', 'تحويل'], targetSectors: ['عيادات'] });
assert.equal(r.status, 200); const svc = r.j.service; ok('DoD-7 إضافة خدمة');

// 2+3: إضافة شركة حقيقية يدويًا مع مصدرها
r = await api('POST', '/api/leads', { businessName: 'عيادة اختبار', businessType: 'عيادات', country: 'السعودية', city: 'الرياض', whatsapp: '0500000000', source: 'WEBSITE', sourceUrl: 'example.com/clinic', estimatedValue: 2000 });
assert.equal(r.status, 200); let lead = r.j.lead;
assert.equal(lead.whatsapp, '966500000000'); assert.equal(lead.sourceUrl, 'https://example.com/clinic'); assert.equal(lead.status, 'NEW'); ok('DoD-2/3 إضافة عميل بمصدره وتطبيع واتساب');

// لا اختلاق: مشكلة قوية بلا دليل مرفوضة
r = await api('PATCH', `/api/leads/${lead.id}`, { painLevel: 'STRONG', painConfidence: 'PROBABLE' });
assert.equal(r.status, 400); assert.ok(r.j.details.painEvidence); ok('منع تسجيل مشكلة قوية بلا دليل');
r = await api('PATCH', `/api/leads/${lead.id}`, { painEvidence: 'الموقع يطلب الحجز عبر مراسلة واتساب فقط', painLevel: 'PROBABLE' });
assert.equal(r.status, 400); assert.ok(r.j.details.painEvidenceSource); ok('الدليل يحتاج مصدرًا');

// 4+5+6+7: إشارة المشكلة + Score + السبب + الخدمة
const before = lead.score;
r = await api('PATCH', `/api/leads/${lead.id}`, { painSignal: 'الحجز يتم يدويًا عبر الواتساب', painEvidence: 'الموقع يطلب الحجز عبر مراسلة واتساب فقط', painEvidenceSource: 'موقع النشاط', painLevel: 'PROBABLE', painConfidence: 'PROBABLE', urgency: 'MEDIUM', recommendedServiceId: svc.id });
assert.equal(r.status, 200); lead = r.j.lead;
assert.ok(lead.score > before); assert.ok(lead.scoreBreakdown.parts.length === 5); assert.ok(lead.scoreBreakdown.reasons.length >= 3);
assert.equal(lead.scoreBreakdown.parts.reduce((a: number, p: any) => a + p.points, 0), lead.score);
console.log('   score =', lead.score, lead.scoreBreakdown.bandLabel, '|', lead.scoreBreakdown.reasons.join(' ; '));
ok('DoD-4/5/6/7 إشارة + دليل + Score + أسبابه + خدمة'); 

// 8+9: توليد رسالة (3 أنواع) مبنية على الدليل
r = await api('POST', `/api/leads/${lead.id}/messages`);
assert.equal(r.j.drafts.length, 3); assert.equal(r.j.basis, 'EVIDENCE'); assert.ok(r.j.drafts[0].text.includes('الحجز عبر مراسلة واتساب'));
const msg = r.j.drafts[0].text; ok('DoD-8/9 3 رسائل مبنية على الدليل (النسخ في الواجهة)');
// بدون دليل: رسالة عامة صادقة
const g = (await api('POST', '/api/leads', { businessName: 'نشاط بلا دليل', businessType: 'مقاهي' })).j.lead;
r = await api('POST', `/api/leads/${g.id}/messages`);
assert.equal(r.j.basis, 'GENERIC'); assert.ok(!r.j.drafts.some((d: any) => /لاحظت أن/.test(d.text))); ok('رسالة عامة بلا ادعاءات عند غياب الدليل');

// 10: تسجيل تواصل (لم يرد) → CONTACTED + موعد متابعة تلقائي
r = await api('POST', `/api/leads/${lead.id}/contacts`, { channel: 'WHATSAPP', outcome: 'NO_RESPONSE', message: msg });
assert.equal(r.status, 200); assert.equal(r.j.lead.status, 'CONTACTED'); assert.ok(r.j.lead.lastContactAt); assert.ok(r.j.lead.nextFollowUpAt);
const diffDays = (new Date(r.j.lead.nextFollowUpAt).getTime() - Date.now()) / 86400000; assert.ok(diffDays > 2.9 && diffDays < 3.1);
ok('DoD-10/11/12 تسجيل تواصل + تغيير الحالة + موعد متابعة');

// 13: ضبط موعد متابعة لليوم وظهوره في المتابعات + المهام
r = await api('POST', `/api/leads/${lead.id}/followup`, { at: new Date(Date.now() - 3600000).toISOString() });
assert.equal(r.status, 200);
r = await api('GET', `/api/followups?tz=${TZ}`);
assert.equal(r.j.items.length, 1); assert.equal(r.j.items[0].lead.id, lead.id); assert.equal(r.j.items[0].lastOutcome, 'NO_RESPONSE'); assert.equal(r.j.items[0].noResponseStreak, 1);
r = await api('GET', `/api/dashboard?tz=${TZ}`);
assert.equal(r.j.counts.dueToday, 1); assert.ok(r.j.tasks.some((t: any) => t.key === 'noreply')); ok('DoD-13 العميل يظهر في متابعات اليوم والمهام');

// متابعة مختلفة عن السابقة
r = await api('POST', `/api/leads/${lead.id}/followup-draft`);
assert.ok(r.j.text && r.j.text !== msg && !r.j.text.includes('لاحظت')); const fu1 = r.j.text;
await api('POST', `/api/leads/${lead.id}/contacts`, { channel: 'WHATSAPP', outcome: 'NO_RESPONSE', message: fu1 });
r = await api('POST', `/api/leads/${lead.id}/followup-draft`);
assert.notEqual(r.j.text, fu1); ok('رسالة المتابعة تختلف عن السابقة');

// رد + اهتمام → حالات تتقدم فقط
r = await api('POST', `/api/leads/${lead.id}/contacts`, { channel: 'WHATSAPP', outcome: 'INTERESTED', notes: 'طلب تفاصيل' });
assert.equal(r.j.lead.status, 'INTERESTED');
r = await api('POST', `/api/leads/${lead.id}/contacts`, { channel: 'WHATSAPP', outcome: 'NO_RESPONSE' });
assert.equal(r.j.lead.status, 'INTERESTED'); ok('الحالة لا ترجع للخلف');

// عرض
r = await api('POST', `/api/leads/${lead.id}/offers`);
assert.equal(r.status, 200); const offer = r.j.offer;
for (const k of ['problem', 'solution', 'benefit', 'deliverables', 'deliveryTime', 'price', 'nextStep']) assert.ok(offer.content[k]);
assert.ok(offer.content.price.includes('1,500')); assert.ok(offer.content.problem.includes('موقع النشاط'));
r = await api('POST', `/api/offers/${offer.id}/sent`); assert.equal(r.j.lead.status, 'OFFER_SENT'); ok('مولّد العرض + تعليمه كمُرسل');
r = await api('GET', '/api/revenue'); assert.equal(r.j.offersValue, 1500); assert.equal(r.j.revenue, 0);

// 14: تسجيل صفقة — يحتاج قيمة
r = await api('POST', `/api/leads/${lead.id}/move`, { status: 'WON' });
assert.equal(r.status, 400); ok('إغلاق الصفقة بدون قيمة مرفوض');
r = await api('POST', `/api/leads/${lead.id}/move`, { status: 'WON', dealValue: 1800, currency: 'SAR' });
assert.equal(r.status, 200); assert.equal(r.j.lead.status, 'WON'); assert.equal(r.j.lead.dealValue, 1800); assert.ok(r.j.lead.wonAt); assert.equal(r.j.lead.nextFollowUpAt, null);
ok('DoD-14 تسجيل صفقة');

// 15: الإيراد في الرئيسية
r = await api('GET', `/api/dashboard?tz=${TZ}`);
assert.equal(r.j.money.revenue, 1800); assert.equal(r.j.counts.won, 1); assert.equal(r.j.counts.offersSent, 1); assert.equal(r.j.counts.total, 2); assert.equal(r.j.counts.dueToday, 0);
assert.equal(r.j.money.pipelineValue, 0); ok('DoD-15 الإيراد الفعلي 1800 يظهر في الرئيسية وكل الأرقام من القاعدة');

// خروج من WON يلغي الإيراد
r = await api('POST', `/api/leads/${lead.id}/move`, { status: 'NEGOTIATING' });
assert.equal((await api('GET', '/api/revenue')).j.revenue, 0);
await api('POST', `/api/leads/${lead.id}/move`, { status: 'WON', dealValue: 2000 });
assert.equal((await api('GET', '/api/revenue')).j.revenue, 2000); ok('إعادة فتح الصفقة تلغي الإيراد وإغلاقها يعيده');

// Kanban: نقل مرحلة فعلي في القاعدة
const k = (await api('POST', '/api/leads', { businessName: 'عميل كانبان' })).j.lead;
for (const s of ['QUALIFIED', 'CONTACTED', 'LOST']) { r = await api('POST', `/api/leads/${k.id}/move`, { status: s }); assert.equal(r.j.lead.status, s); }
assert.equal((await db.get<{ status: string }>('SELECT status FROM leads WHERE id = ?', [k.id]))!.status, 'LOST'); ok('Pipeline: النقل بين المراحل يُحدّث القاعدة');
assert.equal((await api('POST', `/api/leads/${k.id}/move`, { status: 'BOGUS' })).status, 400);

// عزل المستخدمين (SaaS-ready): مستخدم ثانٍ يُنشأ مباشرة في القاعدة
const authSvc = app.services.auth;
authSvc.allowRegistration = true;
const ub = await authSvc.register({ email: 'b@test.com', password: 'password456', name: 'ب', businessName: '' });
const tokB = (await authSvc.login('b@test.com', 'password456', 'x')).token; const cookieB = `lh_session=${tokB}`;
assert.equal((await api('GET', `/api/leads/${lead.id}`, undefined, cookieB)).status, 404);
assert.equal((await api('PATCH', `/api/leads/${lead.id}`, { notes: 'x' }, cookieB)).status, 404);
assert.equal((await api('POST', `/api/leads/${lead.id}/move`, { status: 'LOST' }, cookieB)).status, 404);
assert.equal((await api('DELETE', `/api/leads/${lead.id}`, undefined, cookieB)).status, 404);
assert.equal((await api('GET', '/api/leads', undefined, cookieB)).j.leads.length, 0);
assert.equal((await api('GET', '/api/dashboard?tz=0', undefined, cookieB)).j.money.revenue, 0);
assert.equal((await api('POST', '/api/leads', { businessName: 'x', recommendedServiceId: svc.id }, cookieB)).status, 400);
assert.equal((await api('GET', `/api/leads/${lead.id}`, undefined, cookieA)).status, 200);
// user_id من الواجهة يُتجاهل
r = await api('POST', '/api/leads', { businessName: 'حقن', user_id: ub.id, userId: ub.id }, cookieA);
assert.equal((await api('GET', '/api/leads', undefined, cookieB)).j.leads.length, 0); ok('عزل البيانات بين المستخدمين وتجاهل user_id القادم من الواجهة');

// تحقق مدخلات
assert.equal((await api('POST', '/api/leads', { businessName: '' })).status, 400);
assert.equal((await api('POST', '/api/leads', { businessName: 'x', whatsapp: 'abc' })).status, 400);
assert.equal((await api('POST', '/api/leads', { businessName: 'x', source: 'HACK' })).status, 400);
assert.equal((await api('POST', '/api/leads', { businessName: 'x', estimatedValue: -5 })).status, 400);
assert.equal((await api('POST', `/api/leads/${lead.id}/contacts`, { channel: 'WHATSAPP', outcome: 'REPLIED', contactedAt: new Date(Date.now() + 86400000 * 3).toISOString() })).status, 400);
const sqli = await api('GET', `/api/leads?q=${encodeURIComponent("' OR 1=1 --")}`); assert.equal(sqli.status, 200); assert.equal(sqli.j.leads.length, 0); ok('التحقق من المدخلات وحقن SQL');
// CSRF
const csrf = await fetch(base + '/api/leads', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieA, origin: 'https://evil.example' }, body: JSON.stringify({ businessName: 'csrf' }) });
assert.equal(csrf.status, 403); ok('رفض الطلبات من أصل غريب (CSRF)');

// الاكتشاف: لا نتائج مخترعة
r = await api('GET', '/api/discovery/providers'); assert.ok(r.j.providers.every((p: any) => !p.available));
r = await api('POST', '/api/discovery/search', { provider: 'google_places', sector: 'عيادات', city: 'الرياض', country: 'السعودية' });
assert.equal(r.j.available, false); assert.equal(r.j.candidates.length, 0); assert.ok(r.j.links.maps.includes('google.com/maps')); ok('الاكتشاف بدون مصدر: لا نتائج مخترعة، فقط روابط بحث');

// AI معطّل لا يكسر التطبيق
r = await api('POST', `/api/leads/${g.id}/analyze`); assert.equal(r.status, 200); assert.equal(r.j.ok, false); assert.ok(r.j.lead.id); ok('AI غير مفعّل: التطبيق يكمل بدون تحليل');

// AI بمزوّد تجريبي: تقييد حسب الدليل + فشل آمن + JSON سيئ
app.services.ai.provider = new MockProvider();
r = await api('POST', `/api/leads/${g.id}/analyze`);
assert.equal(r.j.ok, true); assert.equal(r.j.analysis.painLevel, 'POSSIBLE'); assert.equal(r.j.analysis.confidence, 'WEAK'); assert.ok(r.j.adjustments.length === 2); ok('AI بلا دليل: خُفّض المستوى والثقة تلقائيًا');
r = await api('POST', `/api/leads/${g.id}/analysis/apply`); assert.equal(r.j.lead.painLevel, 'POSSIBLE');
await api('PATCH', `/api/leads/${g.id}`, { notes: '__FAIL__' }); r = await api('POST', `/api/leads/${g.id}/analyze`); assert.equal(r.j.ok, false);
await api('PATCH', `/api/leads/${g.id}`, { notes: '__BADJSON__' }); r = await api('POST', `/api/leads/${g.id}/analyze`); assert.equal(r.j.ok, false); ok('فشل AI أو JSON غير صالح لا يكسر ولا يُحفظ');

// تصدير/استيراد/Demo
const exp = (await api('GET', '/api/export')).j; assert.ok(exp.leads.length >= 3);
assert.equal((await api('POST', '/api/demo/seed')).j.created.length, 2);
assert.equal((await api('DELETE', '/api/demo')).j.removed, 2);
r = await api('POST', '/api/import', exp, cookieB); assert.equal(r.status, 200);
assert.equal((await api('GET', '/api/leads', undefined, cookieB)).j.leads.length, 0, 'IDs موجودة عند مستخدم آخر لا تُستورد'); ok('تصدير/استيراد وبيانات Demo موسومة وقابلة للحذف');

// واجهة
const index = await fetch(base + '/'); assert.ok([200, 404].includes(index.status));
assert.equal((await fetch(base + '/..%2f..%2fetc/passwd')).status < 500, true);
const hdr = index.headers.get('content-security-policy'); assert.ok(hdr?.includes("default-src 'self'")); ok('ترويسات الأمان');

// وضع الإنتاج: لا حساب أول بلا SETUP_CODE، ومع الرمز الصحيح فقط
{
  const db2 = openSqlite(':memory:'); await migrate(db2);
  const mk = (setupCode?: string) => createApp({ db: db2, aiProvider: null, requireSetupCode: true, setupCode, persistentStorage: true });
  const call = async (app2: ReturnType<typeof createApp>, body: unknown) => {
    const s2 = app2.server(); await new Promise<void>((r) => s2.listen(0, '127.0.0.1', r));
    const res = await fetch(`http://127.0.0.1:${(s2.address() as { port: number }).port}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    s2.close(); return res.status;
  };
  assert.equal(await call(mk(undefined), { email: 'x@test.com', password: 'password123' }), 403);
  assert.equal(await call(mk('s3cret-code'), { email: 'x@test.com', password: 'password123' }), 403);
  assert.equal(await call(mk('s3cret-code'), { email: 'x@test.com', password: 'password123', setupCode: 'wrong' }), 403);
  assert.equal(await call(mk('s3cret-code'), { email: 'x@test.com', password: 'password123', setupCode: 's3cret-code' }), 200);
  ok('الإنتاج: إنشاء الحساب الأول يتطلب SETUP_CODE صحيحًا');
}
console.log(`\nكل الاختبارات نجحت (${n})`);
srv.close();
