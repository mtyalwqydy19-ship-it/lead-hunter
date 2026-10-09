// مولّد الرسائل والعروض — قوالب حتمية مبنية فقط على ما سجّله المستخدم.
// إن لم يوجد دليل مسجّل لا تُكتب أي ادعاءات عن المشكلة؛ تُصاغ الرسالة كسؤال/عرض عام صادق.
import type { Db } from '../db.ts';
import type { Lead, Offer, OfferContent, Service } from '../types.ts';
import { offerFromRow } from '../mappers.ts';
import { HttpError, nowIso, uid } from '../util.ts';
import type { LeadService } from './LeadService.ts';
import { isTerminal } from './LeadService.ts';

export type Draft = { kind: 'short' | 'professional' | 'friendly'; label: string; text: string };
export type MessageSet = { basis: 'EVIDENCE' | 'GENERIC'; basisNote: string; drafts: Draft[] };
type Sender = { name: string; businessName: string };

const fmt = (n: number, cur: string) => `${Math.round(n).toLocaleString('en-US')} ${cur === 'SAR' ? 'ريال' : cur}`;

// ما الذي نستطيع قوله بصدق؟
function observation(lead: Lead): { text: string; evidence: boolean } {
  const ev = lead.painEvidence.trim();
  if (ev) return { text: ev.replace(/[.،\s]+$/, ''), evidence: true };
  return { text: '', evidence: false };
}
const typeWord = (l: Lead) => (l.businessType ? `نشاطكم في مجال ${l.businessType}` : 'نشاطكم');
const sign = (s: Sender) => (s.name ? `\n${s.name}${s.businessName ? ' — ' + s.businessName : ''}` : '');

export class MessageService {
  db: Db;
  leads: LeadService;
  constructor(db: Db, leads: LeadService) {
    this.db = db;
    this.leads = leads;
  }

  initial(lead: Lead, service: Service | null, s: Sender): MessageSet {
    const ob = observation(lead);
    const what = service ? service.name : 'أتمتة الرد والمتابعة';
    const short = ob.evidence
      ? `السلام عليكم، ${lead.businessName}؟ لاحظت أن ${ob.text}، وعندي فكرة بسيطة في «${what}» قد تخفف عليكم. أرسلها باختصار؟`
      : `السلام عليكم، أتواصل مع ${lead.businessName}. عندي فكرة بسيطة في «${what}» قد تفيد ${typeWord(lead)}. أرسلها باختصار؟`;
    const professional = ob.evidence
      ? `السلام عليكم ورحمة الله،\nأتواصل معكم بخصوص ${lead.businessName}. لاحظت أن ${ob.text}${lead.painEvidenceSource ? ` (المصدر: ${lead.painEvidenceSource})` : ''}. أعمل على تنفيذ «${what}»${service?.deliveryTime ? ` خلال ${service.deliveryTime}` : ''}، وأرى أنها قد تساعدكم في هذه النقطة. إن كان مناسبًا، أرسل لكم عرضًا مختصرًا.${sign(s)}`
      : `السلام عليكم ورحمة الله،\nأتواصل مع ${lead.businessName}. أعمل في «${what}» لمساعدة ${lead.businessType ? 'أنشطة مثل نشاطكم' : 'الأنشطة'} في تنظيم الرد على العملاء ومتابعتهم. لا أعرف تفاصيل وضعكم الحالي، لذلك يسعدني أن أسمع كيف تتعاملون مع الاستفسارات الآن، وإن رأيتم فائدة أرسل لكم فكرة مختصرة.${sign(s)}`;
    const friendly = ob.evidence
      ? `هلا والله 👋 معك ${s.name || 'من فريق صغير يشتغل بالأتمتة'}. لاحظت أن ${ob.text}، وعندي حل بسيط ممكن يريّحكم. تحبون أشرحه لكم بسطرين؟`
      : `هلا والله 👋 معك ${s.name || 'من فريق صغير يشتغل بالأتمتة'}. أساعد أنشطة مثل ${lead.businessName} في الرد على العملاء ومتابعتهم بشكل أسهل. تحبون أشرح لكم الفكرة بسطرين؟`;
    return {
      basis: ob.evidence ? 'EVIDENCE' : 'GENERIC',
      basisNote: ob.evidence
        ? `الرسالة مبنية على الدليل الذي سجّلته${lead.painEvidenceSource ? ` (المصدر: ${lead.painEvidenceSource})` : ''}.`
        : 'لا يوجد دليل مسجّل على مشكلة محددة، لذلك الرسالة عامة ولا تدّعي شيئًا عن نشاطهم. أضف دليلًا حقيقيًا ليصبح التخصيص أدق.',
      drafts: [
        { kind: 'short', label: 'قصيرة جدًا (واتساب)', text: short },
        { kind: 'professional', label: 'احترافية (للشركات)', text: professional },
        { kind: 'friendly', label: 'ودية (للأعمال الصغيرة)', text: friendly },
      ],
    };
  }

  // رسالة متابعة تختلف عن رسائلك السابقة لنفس العميل
  followUp(lead: Lead, previous: string[], ctx: { noResponseStreak: number; service: Service | null; sender: Sender }): { text: string; variant: number } {
    const what = ctx.service?.name ?? 'الفكرة التي ذكرتها';
    const name = lead.businessName;
    const interested = ['REPLIED', 'INTERESTED', 'OFFER_SENT', 'NEGOTIATING'].includes(lead.status);
    const pool = interested
      ? [
          `السلام عليكم، أرجع لحديثنا عن «${what}». هل تحبون نحدد خطوة قادمة أو أجاوب على أي سؤال عندكم؟`,
          `مرحبًا، أتابع معكم بخصوص ${lead.status === 'OFFER_SENT' ? 'العرض الذي أرسلته' : 'ما اتفقنا عليه'}. إذا في نقطة تحتاج توضيح أو تعديل أخبروني وأرتبها لكم.`,
          `السلام عليكم، لا أريد أن أزعجكم. إذا ما زال الموضوع مناسبًا نكمل، وإذا اختلفت الأولويات أخبروني بكل أريحية وأغلق الموضوع من عندي.`,
        ]
      : [
          `السلام عليكم، أرجع لرسالتي السابقة لـ${name} بخصوص «${what}». إذا مناسب أرسل لكم الفكرة باختصار.`,
          `مرحبًا، تذكير لطيف فقط 🙏 قد تكون رسالتي ضاعت وسط الرسائل. إذا الوقت غير مناسب أخبروني متى أتواصل معكم.`,
          `السلام عليكم، هذه آخر رسالة مني بهذا الخصوص حتى لا أكرر عليكم. إذا احتجتم لاحقًا لموضوع الرد والمتابعة مع العملاء فأنا حاضر.`,
        ];
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
    const used = new Set(previous.map(norm));
    let idx = Math.min(ctx.noResponseStreak, pool.length - 1);
    // إن تطابقت مع رسالة سابقة نبحث عن أول صياغة لم تُستخدم
    for (let k = 0; k < pool.length && used.has(norm(pool[idx])); k++) idx = (idx + 1) % pool.length;
    const text = pool[idx] + sign(ctx.sender);
    return { text, variant: idx };
  }

  // ===== العروض =====
  async offersFor(userId: string, leadId: string): Promise<Offer[]> {
    const rows = await this.db.all('SELECT * FROM offers WHERE user_id = ? AND lead_id = ? ORDER BY created_at DESC', [userId, leadId]);
    return rows.map(offerFromRow);
  }

  buildOffer(lead: Lead, service: Service, s: Sender): OfferContent {
    const ob = observation(lead);
    const problem = ob.evidence
      ? `لاحظنا أن ${ob.text}${lead.painEvidenceSource ? ` (المصدر: ${lead.painEvidenceSource})` : ''}.`
      : `لا نملك حتى الآن دليلًا محددًا على مشكلة في ${lead.businessName}. نقترح البدء بجلسة قصيرة لفهم كيف تُدار الاستفسارات والمتابعة لديكم اليوم قبل أي تنفيذ.`;
    const solution = `${service.name}: ${service.description || 'تنفيذ حل مخصص حسب احتياجكم.'}`;
    const benefit = ob.evidence
      ? 'الهدف تقليل الجهد اليدوي في هذه النقطة وتسريع الرد والمتابعة. (نتائج الأرقام نحددها معكم بعد التجربة، ولا نعد بنسب مسبقة.)'
      : 'الهدف تنظيم الرد والمتابعة وتقليل الجهد اليدوي بعد أن نتأكد من الاحتياج الفعلي.';
    const deliverables = service.features.length ? service.features : ['نطاق التنفيذ يُحدد بعد الاتفاق'];
    const delivery = service.deliveryTime || 'تُحدد بعد الاتفاق على النطاق';
    const price = service.startingPrice > 0 ? `يبدأ من ${fmt(service.startingPrice, service.currency)}` : 'يُحدد بعد الاتفاق على النطاق';
    const next = 'إذا مناسب، نحدد مكالمة قصيرة أو رسالة تفصيلية لتأكيد النطاق والبدء.';
    const text = [
      `عرض: ${service.name} — ${lead.businessName}`,
      `\nالمشكلة:\n${problem}`,
      `\nالحل:\n${solution}`,
      `\nالفائدة:\n${benefit}`,
      `\nما سيتم تنفيذه:\n${deliverables.map((d) => '• ' + d).join('\n')}`,
      `\nمدة التنفيذ: ${delivery}`,
      `السعر: ${price}`,
      `\nالخطوة التالية:\n${next}`,
      s.name ? `\n${s.name}${s.businessName ? ' — ' + s.businessName : ''}` : '',
    ].join('\n');
    return { title: `عرض ${service.name}`, problem, solution, benefit, deliverables: [...deliverables], deliveryTime: delivery, price, nextStep: next, text };
  }

  async createOffer(userId: string, lead: Lead, service: Service, s: Sender): Promise<Offer> {
    const content = this.buildOffer(lead, service, s);
    const id = uid();
    await this.db.run(
      'INSERT INTO offers (id,user_id,lead_id,service_id,content,price,currency,sent_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, userId, lead.id, service.id, JSON.stringify(content), service.startingPrice, service.currency, null, nowIso()],
    );
    return (await this.offersFor(userId, lead.id)).find((o) => o.id === id)!;
  }

  async markOfferSent(userId: string, offerId: string): Promise<{ offer: Offer; lead: Lead }> {
    const r = await this.db.get<{ lead_id: string; sent_at: string | null }>('SELECT lead_id, sent_at FROM offers WHERE id = ? AND user_id = ?', [offerId, userId]);
    if (!r) throw new HttpError(404, 'العرض غير موجود');
    const lead = await this.leads.mustGet(userId, r.lead_id);
    const now = nowIso();
    if (!r.sent_at) await this.db.run('UPDATE offers SET sent_at = ? WHERE id = ? AND user_id = ?', [now, offerId, userId]);
    const order = ['NEW', 'QUALIFIED', 'CONTACTED', 'REPLIED', 'INTERESTED'];
    let updated = lead;
    if (isTerminal(lead.status) || order.includes(lead.status)) updated = await this.leads.move(userId, lead.id, 'OFFER_SENT');
    if (!updated.nextFollowUpAt) {
      await this.db.run('UPDATE leads SET next_follow_up_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', [new Date(Date.now() + 3 * 86400000).toISOString(), now, lead.id, userId]);
      updated = await this.leads.mustGet(userId, lead.id);
    }
    const offer = (await this.offersFor(userId, lead.id)).find((o) => o.id === offerId)!;
    return { offer, lead: updated };
  }
}
