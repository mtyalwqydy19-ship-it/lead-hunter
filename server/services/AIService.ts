// طبقة تحليل AI: مفصولة عن المزوّد، تتحقق من JSON، ولا تسمح بادعاءات بلا دليل.
import { CONFIDENCES, PAIN_LEVELS, type Confidence, type PainLevel } from '../constants.ts';
import type { AiAnalysis, Lead, Service } from '../types.ts';
import type { AIProvider } from '../ai/providers.ts';
import type { Db } from '../db.ts';
import { HttpError, nowIso } from '../util.ts';

const SYSTEM = `أنت محلل مبيعات لخدمات الأتمتة والذكاء الاصطناعي. مهمتك تحليل بيانات نشاط تجاري محتمل كعميل.
قواعد صارمة:
- استخدم فقط المعلومات المعطاة. لا تخترع مشاكل أو أرقامًا أو مصادر.
- إن لم يكن هناك دليل مسجّل، اجعل painLevel إما NONE أو POSSIBLE وconfidence إما UNKNOWN أو WEAK، واكتب في painSignal أنها فرضية تحتاج تحققًا.
- ممنوع ادعاء أن العميل "يعاني" أو "يخسر" شيئًا بدون دليل.
- الرسالة المقترحة قصيرة، غير جماعية، ومرتبطة فقط بما هو معروف فعلًا.
- أجب بكائن JSON فقط، بالعربية، بهذه المفاتيح بالضبط:
painSignal, painLevel (NONE|POSSIBLE|PROBABLE|STRONG|VERIFIED), confidence (UNKNOWN|WEAK|POSSIBLE|PROBABLE|VERIFIED), opportunity, recommendedService, reason, suggestedOffer, suggestedMessage`;

const STR_KEYS = ['painSignal', 'opportunity', 'recommendedService', 'reason', 'suggestedOffer', 'suggestedMessage'] as const;

export type AnalysisResult = { ok: true; analysis: AiAnalysis; adjustments: string[] } | { ok: false; error: string };

export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* حاول استخراج أول كائن */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('no json');
}

// تحقق صارم + تقييد حسب الدليل (لا ثقة أعلى من الدليل الموجود)
export function validateAnalysis(raw: unknown, hasEvidence: boolean, providerId: string): { analysis: AiAnalysis; adjustments: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('الرد ليس كائنًا');
  const o = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of STR_KEYS) {
    if (typeof o[k] !== 'string') throw new Error(`المفتاح ${k} مفقود أو ليس نصًا`);
    out[k] = (o[k] as string).trim().slice(0, 1500);
  }
  if (!PAIN_LEVELS.includes(o.painLevel as PainLevel)) throw new Error('painLevel غير صالح');
  if (!CONFIDENCES.includes(o.confidence as Confidence)) throw new Error('confidence غير صالح');
  let level = o.painLevel as PainLevel;
  let conf = o.confidence as Confidence;
  const adjustments: string[] = [];
  if (!hasEvidence) {
    if (PAIN_LEVELS.indexOf(level) > PAIN_LEVELS.indexOf('POSSIBLE')) { adjustments.push(`خُفّض مستوى المشكلة من ${level} إلى POSSIBLE لعدم وجود دليل مسجّل`); level = 'POSSIBLE'; }
    if (CONFIDENCES.indexOf(conf) > CONFIDENCES.indexOf('WEAK')) { adjustments.push(`خُفّضت الثقة من ${conf} إلى WEAK لعدم وجود دليل مسجّل`); conf = 'WEAK'; }
  }
  return { analysis: { ...(out as Pick<AiAnalysis, (typeof STR_KEYS)[number]>), painLevel: level, confidence: conf, provider: providerId, analyzedAt: nowIso() }, adjustments };
}

export class AIService {
  db: Db;
  provider: AIProvider | null;
  constructor(db: Db, provider: AIProvider | null) {
    this.db = db;
    this.provider = provider;
  }

  status() {
    return this.provider
      ? { enabled: true, provider: this.provider.id, label: this.provider.label }
      : { enabled: false, provider: null, label: null, hint: 'لتفعيل التحليل ضع GEMINI_API_KEY أو OPENAI_API_KEY أو ANTHROPIC_API_KEY في إعدادات الخادم.' };
  }

  // لا يرمي أبدًا: عند الفشل يرجع ok:false والتطبيق يكمل بدون تحليل
  async analyze(userId: string, lead: Lead, services: Service[], sellerService: Service | null): Promise<AnalysisResult> {
    if (!this.provider) return { ok: false, error: 'تحليل AI غير مفعّل (لا يوجد مفتاح مزوّد على الخادم).' };
    const facts = {
      الاسم: lead.businessName, النوع: lead.businessType, الدولة: lead.country, المدينة: lead.city, الموقع: lead.website, إنستغرام: lead.instagram,
      المصدر: lead.source, رابط_المصدر: lead.sourceUrl, الوصف: lead.description, ملاحظاتي: lead.notes,
      إشارة_المشكلة_التي_سجلتها: lead.painSignal, الدليل: lead.painEvidence, مصدر_الدليل: lead.painEvidenceSource,
      الخدمة_المختارة: sellerService?.name ?? null, خدماتي: services.map((s) => s.name),
    };
    const user = `بيانات العميل المحتمل (هذا كل ما نعرفه):\n${JSON.stringify(facts, null, 2)}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25000);
    try {
      const text = await this.provider.complete({ system: SYSTEM, user, signal: ac.signal });
      const { analysis, adjustments } = validateAnalysis(extractJson(text), lead.painEvidence.trim().length > 0, this.provider.id);
      await this.db.run('UPDATE leads SET ai_analysis = ?, updated_at = ? WHERE id = ? AND user_id = ?', [JSON.stringify(analysis), nowIso(), lead.id, userId]);
      return { ok: true, analysis, adjustments };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `تعذّر التحليل: ${msg.includes('abort') ? 'انتهت المهلة' : msg.slice(0, 160)}` };
    } finally {
      clearTimeout(timer);
    }
  }

  assertAnalysis(lead: Lead): AiAnalysis {
    if (!lead.aiAnalysis) throw new HttpError(400, 'لا يوجد تحليل محفوظ لهذا العميل');
    return lead.aiAnalysis;
  }
}
