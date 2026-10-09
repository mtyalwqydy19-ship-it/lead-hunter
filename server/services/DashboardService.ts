// الرئيسية: الأرقام والمهام تُحسب من قاعدة البيانات في كل طلب.
import type { Db } from '../db.ts';
import { STRONG_SCORE_MIN } from '../constants.ts';
import type { FollowUpService } from './FollowUpService.ts';
import type { RevenueService, RevenueSummary } from './RevenueService.ts';

export type Task = { key: string; level: 'red' | 'orange' | 'green' | 'star' | 'blue'; count: number; text: string; href: string };
export type DashboardData = {
  counts: {
    total: number; newLeads: number; strong: number; dueToday: number; contacted: number; replied: number; interested: number;
    offersSent: number; won: number; byStatus: Record<string, number>;
  };
  money: RevenueSummary;
  tasks: Task[];
  empty: boolean;
};

const plural = (n: number, one: string, two: string, many: string) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${many}` : `${n} ${one}`);

export class DashboardService {
  db: Db;
  followUps: FollowUpService;
  revenue: RevenueService;
  constructor(db: Db, followUps: FollowUpService, revenue: RevenueService) {
    this.db = db;
    this.followUps = followUps;
    this.revenue = revenue;
  }

  async build(userId: string, tz: number): Promise<DashboardData> {
    const one = async (sql: string, p: (string | number)[] = []) => Number((await this.db.get<{ c: number }>(sql, [userId, ...p]))?.c ?? 0);
    const total = await one('SELECT COUNT(*) AS c FROM leads WHERE user_id = ?');
    const byRows = await this.db.all<{ status: string; c: number }>('SELECT status, COUNT(*) AS c FROM leads WHERE user_id = ? GROUP BY status', [userId]);
    const byStatus: Record<string, number> = {};
    for (const r of byRows) byStatus[r.status] = Number(r.c);
    const strong = await one(`SELECT COUNT(*) AS c FROM leads WHERE user_id = ? AND score >= ? AND status NOT IN ('WON','LOST','NOT_A_FIT')`, [STRONG_SCORE_MIN]);
    const contacted = await one('SELECT COUNT(*) AS c FROM leads WHERE user_id = ? AND last_contact_at IS NOT NULL');
    const replied = await one("SELECT COUNT(DISTINCT lead_id) AS c FROM contacts WHERE user_id = ? AND outcome IN ('REPLIED','INTERESTED','WON')");
    const offersSent = await one('SELECT COUNT(DISTINCT lead_id) AS c FROM offers WHERE user_id = ? AND sent_at IS NOT NULL');
    const due = await this.followUps.due(userId, tz);
    const money = await this.revenue.summary(userId);

    const tasks: Task[] = [];
    const noReply = due.items.filter((i) => i.lastOutcome === 'NO_RESPONSE');
    if (noReply.length) tasks.push({ key: 'noreply', level: 'red', count: noReply.length, text: `تابع ${plural(noReply.length, 'عميلًا', 'عميلين', 'عملاء')} لم يردّوا`, href: '/followups' });
    const hot = due.items.filter((i) => ['REPLIED', 'INTERESTED', 'OFFER_SENT', 'NEGOTIATING'].includes(i.lead.status));
    if (hot.length) tasks.push({ key: 'hot', level: 'green', count: hot.length, text: hot.length === 1 ? 'لديك عميل أبدى تفاعلًا — تابع معه اليوم' : `لديك ${hot.length} عملاء متفاعلين — تابع معهم اليوم`, href: '/followups' });
    const other = due.items.length - noReply.length - hot.filter((h) => h.lastOutcome !== 'NO_RESPONSE').length;
    if (other > 0) tasks.push({ key: 'other', level: 'blue', count: other, text: `${other} متابعة أخرى مستحقة`, href: '/followups' });
    const needOffer = await one("SELECT COUNT(*) AS c FROM leads l WHERE l.user_id = ? AND l.status = 'INTERESTED' AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.lead_id = l.id AND o.sent_at IS NOT NULL)");
    if (needOffer) tasks.push({ key: 'offer', level: 'orange', count: needOffer, text: `أرسل العرض إلى ${plural(needOffer, 'عميل مهتم', 'عميلين مهتمين', 'عملاء مهتمين')}`, href: '/leads?status=INTERESTED' });
    const qualified = await one("SELECT COUNT(*) AS c FROM leads WHERE user_id = ? AND status = 'QUALIFIED' AND last_contact_at IS NULL");
    if (qualified) tasks.push({ key: 'qualified', level: 'orange', count: qualified, text: `تواصل مع ${plural(qualified, 'عميل مؤهل', 'عميلين مؤهلين', 'عملاء مؤهلين')} لم تتواصل معهم بعد`, href: '/leads?status=QUALIFIED' });
    const toAnalyze = await one("SELECT COUNT(*) AS c FROM leads WHERE user_id = ? AND status = 'NEW' AND (pain_signal = '' OR recommended_service_id IS NULL)");
    if (toAnalyze) tasks.push({ key: 'analyze', level: 'star', count: toAnalyze, text: `حلّل ${plural(toAnalyze, 'عميلًا جديدًا', 'عميلين جديدين', 'عملاء جدد')} (سجّل الإشارة واختر الخدمة)`, href: '/leads?status=NEW' });

    return {
      counts: { total, newLeads: byStatus.NEW ?? 0, strong, dueToday: due.items.length, contacted, replied, interested: byStatus.INTERESTED ?? 0, offersSent, won: byStatus.WON ?? 0, byStatus },
      money, tasks, empty: total === 0,
    };
  }
}
