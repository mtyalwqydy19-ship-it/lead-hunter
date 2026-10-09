// نقطة الدخول: خادم HTTP + API + تقديم الواجهة المبنية. الطبقات: UI → API (هنا) → Services → Database.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqlite, migrate, type Db } from './db.ts';
import { Router, parseCookies, readJson, sendJson, type Ctx } from './http.ts';
import { HttpError, nowIso } from './util.ts';
import { Validator, normalizeUrl } from './validate.ts';
import { CHANNELS, CONFIDENCES, LABELS, OUTCOMES, PAIN_LEVELS, PAIN_TYPES, PIPELINE_COLUMNS, PRIORITIES, SCORE_BANDS, SECTORS, SERVICE_TEMPLATES, SOURCES, STATUSES, URGENCIES, type Status } from './constants.ts';
import { AuthService } from './services/AuthService.ts';
import { CatalogService } from './services/CatalogService.ts';
import { ScoringService } from './services/ScoringService.ts';
import { LeadService, type LeadInput } from './services/LeadService.ts';
import { FollowUpService } from './services/FollowUpService.ts';
import { MessageService } from './services/MessageService.ts';
import { RevenueService } from './services/RevenueService.ts';
import { DashboardService } from './services/DashboardService.ts';
import { AIService } from './services/AIService.ts';
import { providerFromEnv, type AIProvider } from './ai/providers.ts';
import { instagramSearchUrl, mapsSearchUrl, sourceProviders, webSearchUrl, type LeadSourceProvider } from './sources/providers.ts';

const COOKIE = 'lh_session';
const HERE = fileURLToPath(new URL('.', import.meta.url));
const PRINCIPLES = [
  'لا إرسال جماعي تلقائي: أنت من يضغط إرسال دائمًا.',
  'لا نختلق مشاكل ولا أرقامًا ولا مصادر.',
  'لا ندّعي أن العميل يحتاج الخدمة بدون دليل مسجّل.',
  'كل عميل له مصدر أو أُضيف يدويًا.',
  'كل استنتاج AI يُعرض معه درجة الثقة.',
];

export type AppOptions = { db: Db; aiProvider?: AIProvider | null; sources?: LeadSourceProvider[]; allowRegistration?: boolean; setupCode?: string; webRoot?: string; secureCookie?: boolean; requireSetupCode?: boolean; trustProxy?: boolean; persistentStorage?: boolean; dbLabel?: string };

export function createApp(o: AppOptions) {
  const db = o.db;
  const auth = new AuthService(db, o.allowRegistration ?? false);
  const catalog = new CatalogService(db);
  const scoring = new ScoringService();
  const leads = new LeadService(db, scoring, catalog);
  const followUps = new FollowUpService(db, leads);
  const messages = new MessageService(db, leads);
  const revenue = new RevenueService(db);
  const dashboard = new DashboardService(db, followUps, revenue);
  const ai = new AIService(db, o.aiProvider === undefined ? providerFromEnv() : o.aiProvider);
  const sources = o.sources ?? sourceProviders();
  const r = new Router();
  const tzOf = (c: Ctx) => Math.max(-840, Math.min(840, Number(c.query.get('tz') ?? 0) || 0));
  const ipOf = (c: Ctx) => (o.trustProxy ? String(c.req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || c.req.socket.remoteAddress || '';
  const sender = (c: Ctx) => auth.userFromToken(c.cookies[COOKIE]).then((u) => ({ name: u?.name ?? '', businessName: u?.businessName ?? '' }));

  // ---------- عام ----------
  r.get('/api/health', () => ({ ok: true }), false);
  r.get('/api/meta', () => ({
    statuses: STATUSES, painLevels: PAIN_LEVELS, confidences: CONFIDENCES, channels: CHANNELS, outcomes: OUTCOMES, urgencies: URGENCIES, priorities: PRIORITIES,
    sources: SOURCES, labels: LABELS, sectors: SECTORS, painTypes: PAIN_TYPES, pipelineColumns: PIPELINE_COLUMNS, scoreBands: SCORE_BANDS, principles: PRINCIPLES,
    serviceTemplates: SERVICE_TEMPLATES,
    storage: { kind: 'sqlite', persistent: !!o.persistentStorage, label: o.dbLabel ?? '' },
  }), false);

  // ---------- المصادقة ----------
  const cookieHeader = (token: string, maxAge: number, c: Ctx) => {
    const secure = o.secureCookie ?? (c.req.headers['x-forwarded-proto'] === 'https');
    return `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  };
  r.get('/api/auth/me', async (c) => ({ user: await auth.userFromToken(c.cookies[COOKIE]), needsSetup: await auth.needsSetup(), setupCodeRequired: !!o.setupCode, setupBlocked: !!o.requireSetupCode && !o.setupCode }), false);
  r.post('/api/auth/register', async (c) => {
    const v = new Validator(c.body).str('email', { required: true, max: 200 }).str('password', { required: true, min: 8, max: 200 }).str('name', { max: 100 }).str('businessName', { max: 150 }).str('setupCode', { max: 200 }).done<{ email: string; password: string; name?: string; businessName?: string; setupCode?: string }>();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw new HttpError(400, 'بيانات غير صالحة', { email: 'بريد غير صالح' });
    if (o.requireSetupCode && !o.setupCode) throw new HttpError(403, 'التسجيل معطّل: لم يُضبط SETUP_CODE على الخادم');
    if (o.setupCode && v.setupCode !== o.setupCode) throw new HttpError(403, 'رمز الإعداد غير صحيح');
    const user = await auth.register({ email: v.email, password: v.password, name: v.name ?? '', businessName: v.businessName ?? '' });
    const { token } = await auth.login(v.email, v.password, ipOf(c));
    c.res.setHeader('Set-Cookie', cookieHeader(token, 30 * 86400, c));
    return { user };
  }, false);
  r.post('/api/auth/login', async (c) => {
    const v = new Validator(c.body).str('email', { required: true, max: 200 }).str('password', { required: true, max: 200 }).done<{ email: string; password: string }>();
    const { user, token } = await auth.login(v.email, v.password, ipOf(c));
    c.res.setHeader('Set-Cookie', cookieHeader(token, 30 * 86400, c));
    return { user };
  }, false);
  r.post('/api/auth/logout', async (c) => {
    await auth.logout(c.cookies[COOKIE]);
    c.res.setHeader('Set-Cookie', cookieHeader('', 0, c));
    return { ok: true };
  }, false);
  r.patch('/api/auth/profile', async (c) => {
    const v = new Validator(c.body).str('name', { max: 100 }).str('businessName', { max: 150 }).done<{ name?: string; businessName?: string }>();
    return { user: await auth.updateProfile(c.userId, v) };
  });
  r.post('/api/auth/password', async (c) => {
    const v = new Validator(c.body).str('current', { required: true, max: 200 }).str('next', { required: true, min: 8, max: 200 }).done<{ current: string; next: string }>();
    await auth.changePassword(c.userId, v.current, v.next, c.cookies[COOKIE]);
    return { ok: true };
  });

  // ---------- الرئيسية ----------
  r.get('/api/dashboard', (c) => dashboard.build(c.userId, tzOf(c)));

  // ---------- العملاء ----------
  const leadInput = (body: unknown, create: boolean): LeadInput => {
    const v = new Validator(body)
      .str('businessName', { required: create, max: 150 }).str('businessType', { max: 100 }).str('country', { max: 80 }).str('city', { max: 80 })
      .str('website', { max: 300 }).str('phone', { max: 40 }).str('whatsapp', { max: 40 }).str('instagram', { max: 120 }).str('email', { max: 200 })
      .str('source', { oneOf: SOURCES, default: 'MANUAL' }).str('sourceUrl', { max: 500 }).str('description', { max: 2000 }).str('notes', { max: 4000 })
      .str('painSignal', { max: 1000 }).str('painEvidence', { max: 1500 }).str('painEvidenceSource', { max: 200 })
      .str('painLevel', { oneOf: PAIN_LEVELS }).str('painConfidence', { oneOf: CONFIDENCES }).str('opportunity', { max: 1000 })
      .str('recommendedServiceId', { max: 64 }).num('estimatedValue', { min: 0, max: 1e9, default: 0 }).str('urgency', { oneOf: URGENCIES })
      .date('nextFollowUpAt', { nullable: true }).done<Record<string, unknown>>();
    if (v.recommendedServiceId === '') v.recommendedServiceId = null;
    if (v.estimatedValue === null) v.estimatedValue = 0;
    return v as LeadInput;
  };
  r.get('/api/leads', async (c) => ({ leads: await leads.list(c.userId, { status: c.query.get('status') || undefined, q: c.query.get('q') || undefined, sort: c.query.get('sort') || undefined }) }));
  r.post('/api/leads', async (c) => ({ lead: await leads.create(c.userId, leadInput(c.body, true)) }));
  r.get('/api/leads/:id', async (c) => {
    const lead = await leads.mustGet(c.userId, c.params.id);
    return {
      lead, contacts: await followUps.contactsFor(c.userId, lead.id), offers: await messages.offersFor(c.userId, lead.id),
      service: lead.recommendedServiceId ? await catalog.get(c.userId, lead.recommendedServiceId) : null,
    };
  });
  r.patch('/api/leads/:id', async (c) => ({ lead: await leads.update(c.userId, c.params.id, leadInput(c.body, false)) }));
  r.del('/api/leads/:id', async (c) => (await leads.remove(c.userId, c.params.id), { ok: true }));
  r.post('/api/leads/:id/move', async (c) => {
    const v = new Validator(c.body).str('status', { required: true, oneOf: STATUSES }).num('dealValue', { min: 0, max: 1e9 }).str('currency', { max: 8 }).done<{ status: Status; dealValue?: number; currency?: string }>();
    return { lead: await leads.move(c.userId, c.params.id, v.status, { dealValue: v.dealValue ?? undefined, currency: v.currency }) };
  });
  r.post('/api/leads/:id/followup', async (c) => {
    const v = new Validator(c.body).date('at', { nullable: true, required: true }).done<{ at: string | null }>();
    return { lead: await followUps.setFollowUp(c.userId, c.params.id, v.at ?? null) };
  });
  r.post('/api/leads/:id/contacts', async (c) => {
    const v = new Validator(c.body).str('channel', { required: true, oneOf: CHANNELS }).str('outcome', { required: true, oneOf: OUTCOMES }).str('message', { max: 3000 })
      .str('notes', { max: 2000 }).date('contactedAt', {}).date('nextFollowUpAt', { nullable: true }).num('dealValue', { min: 0, max: 1e9 }).str('currency', { max: 8 }).done<Record<string, never>>();
    return followUps.logContact(c.userId, c.params.id, v as never);
  });
  // مسودات الرسائل — لا تُرسل شيئًا
  r.post('/api/leads/:id/messages', async (c) => {
    const lead = await leads.mustGet(c.userId, c.params.id);
    const svc = lead.recommendedServiceId ? await catalog.get(c.userId, lead.recommendedServiceId) : null;
    return { ...messages.initial(lead, svc, await sender(c)), service: svc?.name ?? null };
  });
  r.post('/api/leads/:id/followup-draft', async (c) => {
    const lead = await leads.mustGet(c.userId, c.params.id);
    const svc = lead.recommendedServiceId ? await catalog.get(c.userId, lead.recommendedServiceId) : null;
    const cs = await followUps.contactsFor(c.userId, lead.id);
    let streak = 0;
    for (const x of cs) { if (x.outcome === 'NO_RESPONSE') streak++; else break; }
    const prev = cs.map((x) => x.message).filter(Boolean);
    const d = messages.followUp(lead, prev, { noResponseStreak: streak, service: svc, sender: await sender(c) });
    return { text: d.text, variant: d.variant, previousCount: prev.length, noResponseStreak: streak };
  });
  // العروض
  r.post('/api/leads/:id/offers', async (c) => {
    const lead = await leads.mustGet(c.userId, c.params.id);
    if (!lead.recommendedServiceId) throw new HttpError(400, 'اختر الخدمة أولًا من صفحة العميل ثم أنشئ العرض');
    const svc = (await catalog.get(c.userId, lead.recommendedServiceId))!;
    return { offer: await messages.createOffer(c.userId, lead, svc, await sender(c)) };
  });
  r.post('/api/offers/:id/sent', async (c) => messages.markOfferSent(c.userId, c.params.id));
  // AI
  r.get('/api/ai/status', () => ai.status());
  r.post('/api/leads/:id/analyze', async (c) => {
    const lead = await leads.mustGet(c.userId, c.params.id);
    const svc = lead.recommendedServiceId ? await catalog.get(c.userId, lead.recommendedServiceId) : null;
    const res = await ai.analyze(c.userId, lead, await catalog.list(c.userId), svc);
    return { ...res, lead: await leads.mustGet(c.userId, lead.id) };
  });
  r.post('/api/leads/:id/analysis/apply', async (c) => {
    const lead = await leads.mustGet(c.userId, c.params.id);
    const a = ai.assertAnalysis(lead);
    const hasEv = lead.painEvidence.trim().length > 0;
    const patch: LeadInput = { painSignal: a.painSignal, painLevel: a.painLevel, painConfidence: a.confidence, opportunity: a.opportunity };
    if (!hasEv) { patch.painLevel = PAIN_LEVELS.indexOf(a.painLevel) > 1 ? 'POSSIBLE' : a.painLevel; patch.painConfidence = CONFIDENCES.indexOf(a.confidence) > 1 ? 'WEAK' : a.confidence; }
    const match = (await catalog.list(c.userId)).find((s) => s.name === a.recommendedService);
    if (match && !lead.recommendedServiceId) patch.recommendedServiceId = match.id;
    return { lead: await leads.update(c.userId, lead.id, patch) };
  });

  // ---------- المتابعات / التواصل / الإيراد ----------
  r.get('/api/followups', async (c) => followUps.due(c.userId, tzOf(c)));
  r.get('/api/contacts', async (c) => ({ contacts: await followUps.recent(c.userId) }));
  r.get('/api/revenue', async (c) => revenue.summary(c.userId));

  // ---------- الخدمات ----------
  const svcInput = (b: unknown, create: boolean) =>
    new Validator(b).str('name', { required: create, max: 120 }).str('description', { max: 1000 }).num('startingPrice', { min: 0, max: 1e9, default: 0 }).str('currency', { max: 8 })
      .str('deliveryTime', { max: 100 }).strArray('features', { maxItems: 20, maxLen: 200 }).strArray('targetSectors', { maxItems: 30, maxLen: 80 }).done<Record<string, never>>();
  r.get('/api/services', async (c) => ({ services: await catalog.list(c.userId) }));
  r.post('/api/services', async (c) => ({ service: await catalog.create(c.userId, svcInput(c.body, true) as never) }));
  r.patch('/api/services/:id', async (c) => ({ service: await catalog.update(c.userId, c.params.id, svcInput(c.body, false) as never) }));
  r.del('/api/services/:id', async (c) => (await catalog.remove(c.userId, c.params.id), { ok: true }));

  // ---------- الاكتشاف ----------
  r.get('/api/discovery/providers', () => ({ providers: sources.map((s) => ({ id: s.id, label: s.label, available: s.available(), reason: s.available() ? '' : s.unavailableReason() })) }));
  r.post('/api/discovery/search', async (c) => {
    const v = new Validator(c.body).str('provider', { required: true, max: 40 }).str('country', { max: 80 }).str('city', { max: 80 }).str('sector', { required: true, max: 100 })
      .str('pain', { max: 100 }).num('limit', { min: 1, max: 20, int: true, default: 10 }).done<{ provider: string; country?: string; city?: string; sector: string; pain?: string; limit?: number }>();
    const q = { country: v.country ?? '', city: v.city ?? '', sector: v.sector, limit: v.limit ?? 10 };
    const links = { maps: mapsSearchUrl(q), web: webSearchUrl({ ...q, pain: v.pain ?? '' }), instagram: instagramSearchUrl(q) };
    const p = sources.find((s) => s.id === v.provider);
    if (!p) throw new HttpError(404, 'مصدر غير معروف');
    if (!p.available()) return { available: false, reason: p.unavailableReason(), candidates: [], links };
    try { return { available: true, reason: '', candidates: await p.search(q), links }; } catch (e) { return { available: true, reason: `فشل المصدر: ${e instanceof Error ? e.message.slice(0, 160) : 'خطأ'}`, candidates: [], links }; }
  });

  // ---------- نسخ احتياطي ----------
  r.get('/api/export', async (c) => {
    const rows = (t: string) => db.all(`SELECT * FROM ${t} WHERE user_id = ?`, [c.userId]);
    return { app: 'lead-hunter', version: 1, exportedAt: nowIso(), services: await rows('services'), leads: await rows('leads'), contacts: await rows('contacts'), offers: await rows('offers') };
  });
  r.post('/api/import', async (c) => {
    const b = c.body as { app?: string; services?: Record<string, unknown>[]; leads?: Record<string, unknown>[]; contacts?: Record<string, unknown>[]; offers?: Record<string, unknown>[] };
    if (b?.app !== 'lead-hunter') throw new HttpError(400, 'ملف غير صالح');
    const added = { services: 0, leads: 0, contacts: 0, offers: 0 };
    for (const t of ['services', 'leads', 'contacts', 'offers'] as const) {
      for (const row of b[t] ?? []) {
        const cols = Object.keys(row).filter((k) => /^[a-z_]+$/.test(k) && k !== 'user_id');
        if (!cols.includes('id')) continue;
        // الصف يُربط دائمًا بالمستخدم الحالي — لا نثق بأي user_id في الملف
        const res = await db.run(`INSERT OR IGNORE INTO ${t} (user_id, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`, [c.userId, ...cols.map((k) => row[k] as string | number | null)]).catch(() => ({ changes: 0 }));
        added[t] += res.changes;
      }
    }
    return { added };
  });

  // ---------- بيانات تجريبية (اختياري، موسومة بوضوح) ----------
  r.post('/api/demo/seed', async (c) => {
    const made: string[] = [];
    for (let i = 1; i <= 2; i++) {
      const name = `DEMO_LEAD_0${i}`;
      if ((await leads.list(c.userId, { q: name })).length) continue;
      await leads.create(c.userId, { businessName: name, businessType: i === 1 ? 'عيادات' : 'مطاعم', source: 'DEMO' as never, notes: 'بيانات تجريبية للتجربة فقط — احذفها قبل العمل الحقيقي.' });
      made.push(name);
    }
    return { created: made };
  });
  r.del('/api/demo', async (c) => ({ removed: (await db.run("DELETE FROM leads WHERE user_id = ? AND source = 'DEMO'", [c.userId])).changes }));

  // ---------- الخادم ----------
  const webRoot = resolve(o.webRoot ?? join(HERE, '..', 'web', 'dist'));
  const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
  const secHeaders = {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  };

  const handler = async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    for (const [k, v] of Object.entries(secHeaders)) res.setHeader(k, v);
    try {
      if (url.pathname.startsWith('/api/')) {
        const m = r.match(req.method ?? 'GET', url.pathname);
        if (!m.route) throw new HttpError(m.pathMatched ? 405 : 404, m.pathMatched ? 'طريقة غير مسموحة' : 'غير موجود');
        const mutating = !['GET', 'HEAD'].includes(req.method ?? 'GET');
        // حماية CSRF: الطلبات المغيِّرة يجب أن تأتي من نفس الأصل
        const origin = req.headers.origin;
        if (mutating && origin) {
          let ok = false;
          try { ok = new URL(origin).host === req.headers.host; } catch { /* ignore */ }
          if (!ok) throw new HttpError(403, 'أصل غير مسموح');
        }
        const cookies = parseCookies(req.headers.cookie);
        const ctx: Ctx = { req, res, params: m.params, query: url.searchParams, body: mutating ? await readJson(req) : {}, userId: '', cookies };
        if (m.route.auth) {
          const u = await auth.userFromToken(cookies[COOKIE]);
          if (!u) throw new HttpError(401, 'يلزم تسجيل الدخول');
          ctx.userId = u.id; // مصدر الهوية الوحيد: الجلسة على الخادم
        }
        const out = await m.route.handler(ctx);
        return sendJson(res, 200, out ?? { ok: true });
      }
      // ملفات الواجهة + SPA fallback
      let file = normalize(join(webRoot, decodeURIComponent(url.pathname)));
      if (!file.startsWith(webRoot)) throw new HttpError(403, 'ممنوع');
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(webRoot, 'index.html');
      if (!existsSync(file)) throw new HttpError(404, 'الواجهة غير مبنية بعد (شغّل: npm run build:web)');
      const body = readFileSync(file);
      const immutable = file.includes(`${webRoot}/assets/`);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
      res.end(body);
    } catch (e) {
      const err = e instanceof HttpError ? e : new HttpError(500, 'خطأ داخلي');
      if (!(e instanceof HttpError)) console.error(e);
      if (!res.headersSent) sendJson(res, err.status, { error: err.message, details: err.details });
    }
  };
  return { handler, services: { auth, leads, followUps, messages, revenue, dashboard, ai, catalog }, server: () => createServer(handler) };
}

// ---------- التشغيل ----------
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.DATA_DIR || join(HERE, '..', 'data');
  const db = openSqlite(process.env.DB_FILE || join(dataDir, 'lead-hunter.sqlite'));
  await migrate(db);
  const prod = process.env.NODE_ENV === 'production';
  const app = createApp({
    db, allowRegistration: process.env.ALLOW_REGISTRATION === '1', setupCode: process.env.SETUP_CODE || undefined,
    requireSetupCode: prod, trustProxy: process.env.TRUST_PROXY === '1', persistentStorage: process.env.PERSISTENT_STORAGE === '1',
    dbLabel: process.env.DB_FILE || join(dataDir, 'lead-hunter.sqlite'),
  });
  if (prod && !process.env.SETUP_CODE) console.warn('تحذير: NODE_ENV=production بدون SETUP_CODE — إنشاء الحساب الأول معطّل حتى تضبطه.');
  if (prod && process.env.PERSISTENT_STORAGE !== '1') console.warn('تحذير: التخزين غير مؤكد كدائم — قد تُفقد البيانات عند إعادة التشغيل. استخدم قرصًا دائمًا وضع PERSISTENT_STORAGE=1.');
  const port = Number(process.env.PORT || 3000);
  app.server().listen(port, '0.0.0.0', () => {
    console.log(`صائد العملاء يعمل على http://localhost:${port}`);
    console.log(`قاعدة البيانات: ${process.env.DB_FILE || join(dataDir, 'lead-hunter.sqlite')}`);
    console.log(`AI: ${JSON.stringify(app.services.ai.status())}`);
  });
}
void normalizeUrl;
