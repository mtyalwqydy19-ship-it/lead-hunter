// تقييم الفرصة 0–100 — حتمي وقابل للتفسير (لا عشوائية). كل جزء يعرض سبب نقاطه.
import { SCORE_BANDS, LABELS, type Confidence, type PainLevel } from '../constants.ts';
import type { Lead, ScorePart, ScoreResult, Service } from '../types.ts';

const MAX = { pain: 35, fit: 20, pay: 15, reach: 15, urgency: 15 } as const;
const LEVEL_W: Record<PainLevel, number> = { NONE: 0, POSSIBLE: 0.3, PROBABLE: 0.55, STRONG: 0.8, VERIFIED: 1 };
const CONF_W: Record<Confidence, number> = { UNKNOWN: 0.4, WEAK: 0.6, POSSIBLE: 0.75, PROBABLE: 0.9, VERIFIED: 1 };
const URG_PTS = { UNKNOWN: 0, LOW: 3, MEDIUM: 8, HIGH: 15 } as const;

type Input = Pick<Lead, 'businessType' | 'painLevel' | 'painConfidence' | 'painEvidence' | 'painSignal' | 'website' | 'whatsapp' | 'phone' | 'email' | 'instagram' | 'estimatedValue' | 'urgency' | 'recommendedServiceId'>;

export class ScoringService {
  compute(lead: Input, service: Service | null): ScoreResult {
    const parts: ScorePart[] = [];
    const warnings: string[] = [];

    // 1) المشكلة — لا نرفع المستوى فوق "محتملة" بدون دليل مسجّل
    const hasEvidence = lead.painEvidence.trim().length > 0;
    let level = lead.painLevel;
    if (!hasEvidence && LEVEL_W[level] > LEVEL_W.POSSIBLE) {
      level = 'POSSIBLE';
      warnings.push('مستوى المشكلة مرتفع لكن لا يوجد دليل مسجّل، لذلك حُسب كـ"محتملة" فقط. أضف الدليل ومصدره.');
    }
    const conf = hasEvidence ? lead.painConfidence : lead.painConfidence === 'UNKNOWN' ? 'UNKNOWN' : 'WEAK';
    const pain = Math.round(MAX.pain * LEVEL_W[level] * CONF_W[conf]);
    parts.push({
      key: 'pain', label: 'المشكلة', max: MAX.pain, points: pain,
      reason: level === 'NONE' ? 'لم تُسجَّل إشارة مشكلة بعد' : `${LABELS.painLevel[level]} بثقة ${LABELS.confidence[conf]}${hasEvidence ? ' ومعها دليل' : ' بدون دليل'}`,
    });
    if (level === 'NONE') warnings.push('لا توجد إشارة مشكلة. سجّل ما لاحظته وأين رأيته.');

    // 2) الملاءمة — هل نوع النشاط ضمن القطاعات المستهدفة للخدمة المختارة؟
    let fit = 0;
    let fitReason = 'لم تُختر خدمة بعد';
    if (service) {
      const match = service.targetSectors.some((s) => s && lead.businessType && (s === lead.businessType || lead.businessType.includes(s) || s.includes(lead.businessType)));
      fit = match ? MAX.fit : service.targetSectors.length === 0 ? 12 : 8;
      fitReason = match ? `نشاط مناسب لخدمة «${service.name}»` : service.targetSectors.length === 0 ? `الخدمة «${service.name}» بلا قطاعات مستهدفة محددة` : `النشاط خارج القطاعات المستهدفة لخدمة «${service.name}»`;
    } else warnings.push('اختر الخدمة الأنسب ليُحسب جزء الملاءمة.');
    parts.push({ key: 'fit', label: 'الملاءمة', max: MAX.fit, points: fit, reason: fitReason });

    // 3) القدرة على الدفع — مؤشرات معلنة فقط (لا تخمين)
    let pay = 0;
    const payNotes: string[] = [];
    if (lead.website) { pay += 5; payNotes.push('لديه موقع'); }
    if (lead.instagram) { pay += 2; payNotes.push('حضور على إنستغرام'); }
    if (lead.estimatedValue > 0) { pay += 5; payNotes.push('قيمة متوقعة مسجّلة'); }
    if (service && service.startingPrice > 0 && lead.estimatedValue >= service.startingPrice) { pay += 3; payNotes.push('القيمة تغطي سعر الخدمة'); }
    pay = Math.min(pay, MAX.pay);
    parts.push({ key: 'pay', label: 'القدرة على الدفع', max: MAX.pay, points: pay, reason: payNotes.length ? payNotes.join('، ') : 'لا مؤشرات مسجّلة' });

    // 4) سهولة الوصول
    let reach = 0;
    const rNotes: string[] = [];
    if (lead.whatsapp) { reach += 8; rNotes.push('واتساب'); }
    if (lead.phone) { reach += 4; rNotes.push('هاتف'); }
    if (lead.email) { reach += 3; rNotes.push('بريد'); }
    if (lead.instagram) { reach += 3; rNotes.push('إنستغرام'); }
    reach = Math.min(reach, MAX.reach);
    parts.push({ key: 'reach', label: 'سهولة الوصول', max: MAX.reach, points: reach, reason: rNotes.length ? `وسائل متاحة: ${rNotes.join('، ')}` : 'لا توجد وسيلة تواصل' });
    if (!reach) warnings.push('لا توجد وسيلة تواصل مسجّلة.');

    // 5) الاستعجال — يحدده المستخدم من معطيات حقيقية
    const urg = URG_PTS[lead.urgency];
    parts.push({ key: 'urgency', label: 'الاستعجال', max: MAX.urgency, points: urg, reason: lead.urgency === 'UNKNOWN' ? 'غير محدد' : `استعجال ${LABELS.urgency[lead.urgency]}` });

    const score = Math.max(0, Math.min(100, parts.reduce((a, p) => a + p.points, 0)));
    const band = SCORE_BANDS.find((b) => score >= b.min && score <= b.max)!;
    const reasons = parts.filter((p) => p.points > 0).map((p) => `${p.label}: +${p.points} — ${p.reason}`);
    return { score, band: band.key, bandLabel: band.label, parts, reasons, warnings };
  }

  priorityFor(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    return score >= 81 ? 'HIGH' : score >= 61 ? 'HIGH' : score >= 31 ? 'MEDIUM' : 'LOW';
  }
}
