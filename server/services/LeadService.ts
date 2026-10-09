// العملاء المحتملون: CRUD + التقييم + نقل المراحل. كل استعلام مقيّد بـ user_id القادم من الجلسة.
import type { Db } from '../db.ts';
import { PAIN_LEVELS, TERMINAL_STATUSES, type Status } from '../constants.ts';
import type { Lead } from '../types.ts';
import { leadFromRow } from '../mappers.ts';
import { HttpError, nowIso, uid } from '../util.ts';
import { normalizePhone, normalizeUrl } from '../validate.ts';
import type { ScoringService } from './ScoringService.ts';
import type { CatalogService } from './CatalogService.ts';

// الحقول التي يحرّرها المستخدم (الباقي يحسبه الخادم)
export type LeadInput = Partial<Pick<Lead,
  'businessName' | 'businessType' | 'country' | 'city' | 'website' | 'phone' | 'whatsapp' | 'instagram' | 'email' | 'source' | 'sourceUrl' |
  'description' | 'notes' | 'painSignal' | 'painEvidence' | 'painEvidenceSource' | 'painLevel' | 'painConfidence' | 'opportunity' |
  'recommendedServiceId' | 'estimatedValue' | 'urgency' | 'nextFollowUpAt'>>;

const COLS: Record<keyof LeadInput, string> = {
  businessName: 'business_name', businessType: 'business_type', country: 'country', city: 'city', website: 'website', phone: 'phone',
  whatsapp: 'whatsapp', instagram: 'instagram', email: 'email', source: 'source', sourceUrl: 'source_url', description: 'description',
  notes: 'notes', painSignal: 'pain_signal', painEvidence: 'pain_evidence', painEvidenceSource: 'pain_evidence_source', painLevel: 'pain_level',
  painConfidence: 'pain_confidence', opportunity: 'opportunity', recommendedServiceId: 'recommended_service_id', estimatedValue: 'estimated_value',
  urgency: 'urgency', nextFollowUpAt: 'next_follow_up_at',
};

export const isTerminal = (s: Status) => TERMINAL_STATUSES.includes(s);

export class LeadService {
  db: Db;
  scoring: ScoringService;
  catalog: CatalogService;
  constructor(db: Db, scoring: ScoringService, catalog: CatalogService) {
    this.db = db;
    this.scoring = scoring;
    this.catalog = catalog;
  }

  async get(userId: string, id: string): Promise<Lead | null> {
    const r = await this.db.get('SELECT * FROM leads WHERE id = ? AND user_id = ?', [id, userId]);
    return r ? leadFromRow(r) : null;
  }

  async mustGet(userId: string, id: string): Promise<Lead> {
    const l = await this.get(userId, id);
    if (!l) throw new HttpError(404, 'العميل غير موجود');
    return l;
  }

  async list(userId: string, f: { status?: string; q?: string; sort?: string } = {}): Promise<Lead[]> {
    const where = ['user_id = ?'];
    const params: (string | number)[] = [userId];
    if (f.status) { where.push('status = ?'); params.push(f.status); }
    if (f.q) {
      where.push('(business_name LIKE ? OR business_type LIKE ? OR city LIKE ? OR notes LIKE ?)');
      const like = `%${f.q.replace(/[%_]/g, '')}%`;
      params.push(like, like, like, like);
    }
    const order = f.sort === 'score' ? 'score DESC, created_at DESC' : f.sort === 'followup' ? "(next_follow_up_at IS NULL), next_follow_up_at ASC" : 'created_at DESC';
    const rows = await this.db.all(`SELECT * FROM leads WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 1000`, params);
    return rows.map(leadFromRow);
  }

  // قواعد "لا اختلاق": مستوى مشكلة أعلى من "محتملة" يحتاج دليلًا ومصدرًا
  private async normalize(userId: string, input: LeadInput, base?: Lead): Promise<Required<Pick<Lead, never>> & LeadInput> {
    const m: LeadInput = { ...input };
    const errors: Record<string, string> = {};
    const merged = { ...(base ?? {}), ...m } as Lead;
    if (m.website !== undefined) {
      if (m.website && !normalizeUrl(m.website)) errors.website = 'رابط غير صالح';
      else m.website = normalizeUrl(m.website);
    }
    if (m.sourceUrl !== undefined) {
      if (m.sourceUrl && !normalizeUrl(m.sourceUrl)) errors.sourceUrl = 'رابط غير صالح';
      else m.sourceUrl = normalizeUrl(m.sourceUrl);
    }
    if (m.whatsapp !== undefined) {
      if (m.whatsapp) {
        const n = normalizePhone(m.whatsapp, merged.country ?? '');
        if (!n) errors.whatsapp = 'رقم واتساب غير صالح. اكتبه بالصيغة الدولية مثل 9665XXXXXXXX';
        else m.whatsapp = n;
      }
    }
    if (m.instagram !== undefined && m.instagram) m.instagram = m.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');
    if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email)) errors.email = 'بريد غير صالح';
    const level = merged.painLevel ?? 'NONE';
    const evidence = (merged.painEvidence ?? '').trim();
    if (PAIN_LEVELS.indexOf(level) > PAIN_LEVELS.indexOf('POSSIBLE') && !evidence) {
      errors.painEvidence = 'لا يمكن تسجيل مشكلة "مرجّحة" أو أقوى بدون دليل. اكتب ما رأيته ومن أين.';
    }
    if (evidence && !(merged.painEvidenceSource ?? '').trim()) errors.painEvidenceSource = 'اكتب مصدر الدليل (مثل: موقع النشاط، إنستغرام، مكالمة)';
    if (merged.recommendedServiceId) {
      if (!(await this.catalog.get(userId, merged.recommendedServiceId))) errors.recommendedServiceId = 'خدمة غير موجودة';
    }
    if (Object.keys(errors).length) throw new HttpError(400, 'بيانات غير صالحة', errors);
    return m;
  }

  private async rescoreFields(userId: string, l: Lead) {
    const svc = l.recommendedServiceId ? await this.catalog.get(userId, l.recommendedServiceId) : null;
    const r = this.scoring.compute(l, svc);
    return { score: r.score, breakdown: r, priority: this.scoring.priorityFor(r.score) };
  }

  async create(userId: string, input: LeadInput): Promise<Lead> {
    if (!input.businessName) throw new HttpError(400, 'بيانات غير صالحة', { businessName: 'اسم النشاط مطلوب' });
    const m = await this.normalize(userId, input);
    const id = uid();
    const now = nowIso();
    const draft = leadFromRow({
      id, business_name: '', business_type: '', country: '', city: '', website: '', phone: '', whatsapp: '', instagram: '', email: '',
      source: 'MANUAL', source_url: '', description: '', notes: '', pain_signal: '', pain_evidence: '', pain_evidence_source: '', pain_level: 'NONE',
      pain_confidence: 'UNKNOWN', opportunity: '', recommended_service_id: null, estimated_value: 0, urgency: 'UNKNOWN', score: 0, score_breakdown: '{}',
      status: 'NEW', priority: 'LOW', last_contact_at: null, next_follow_up_at: null, deal_value: null, currency: 'SAR', won_at: null, ai_analysis: null,
      created_at: now, updated_at: now,
    });
    const merged: Lead = { ...draft, ...m } as Lead;
    const sc = await this.rescoreFields(userId, merged);
    const cols = Object.keys(m) as (keyof LeadInput)[];
    const names = ['id', 'user_id', 'score', 'score_breakdown', 'priority', 'created_at', 'updated_at', ...cols.map((c) => COLS[c])];
    const vals = [id, userId, sc.score, JSON.stringify(sc.breakdown), sc.priority, now, now, ...cols.map((c) => m[c] as string | number | null)];
    await this.db.run(`INSERT INTO leads (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`, vals);
    return this.mustGet(userId, id);
  }

  async update(userId: string, id: string, input: LeadInput): Promise<Lead> {
    const cur = await this.mustGet(userId, id);
    const m = await this.normalize(userId, input, cur);
    const merged: Lead = { ...cur, ...m } as Lead;
    const sc = await this.rescoreFields(userId, merged);
    const cols = Object.keys(m) as (keyof LeadInput)[];
    const sets = [...cols.map((c) => `${COLS[c]} = ?`), 'score = ?', 'score_breakdown = ?', 'priority = ?', 'updated_at = ?'];
    const vals = [...cols.map((c) => m[c] as string | number | null), sc.score, JSON.stringify(sc.breakdown), sc.priority, nowIso(), id, userId];
    await this.db.run(`UPDATE leads SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, vals);
    return this.mustGet(userId, id);
  }

  async remove(userId: string, id: string) {
    const r = await this.db.run('DELETE FROM leads WHERE id = ? AND user_id = ?', [id, userId]);
    if (!r.changes) throw new HttpError(404, 'العميل غير موجود');
  }

  // نقل المرحلة (Kanban أو أزرار). WON تحتاج قيمة صفقة. المراحل النهائية تلغي موعد المتابعة.
  async move(userId: string, id: string, status: Status, deal?: { dealValue?: number; currency?: string }): Promise<Lead> {
    const cur = await this.mustGet(userId, id);
    const now = nowIso();
    if (status === 'WON') {
      const value = deal?.dealValue ?? cur.dealValue;
      if (value === null || value === undefined || !(value > 0)) throw new HttpError(400, 'سجّل قيمة الصفقة لإغلاق البيع', { dealValue: 'قيمة الصفقة مطلوبة' });
      await this.db.run(
        'UPDATE leads SET status = ?, deal_value = ?, currency = ?, won_at = ?, next_follow_up_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?',
        ['WON', value, deal?.currency ?? cur.currency, cur.wonAt ?? now, now, id, userId],
      );
    } else {
      // الخروج من WON يلغي الإيراد (لا يبقى إيراد لصفقة لم تعد مُغلقة)
      const clearDeal = cur.status === 'WON';
      await this.db.run(
        `UPDATE leads SET status = ?, ${clearDeal ? 'won_at = NULL, deal_value = NULL,' : ''} ${isTerminal(status) ? 'next_follow_up_at = NULL,' : ''} updated_at = ? WHERE id = ? AND user_id = ?`,
        [status, now, id, userId],
      );
    }
    return this.mustGet(userId, id);
  }

  async rescore(userId: string, id: string): Promise<Lead> {
    return this.update(userId, id, {});
  }
}
