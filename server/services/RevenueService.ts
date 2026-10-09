// الإيرادات: كل الأرقام تُحسب من جدول العملاء/العروض — لا قيم ثابتة.
import type { Db } from '../db.ts';

export type RevenueSummary = {
  currency: string;
  pipelineValue: number; // قيمة الفرص المفتوحة (القيمة المتوقعة المسجّلة)
  offersValue: number; // قيمة العروض المرسلة لعملاء ما زالوا مفتوحين
  openOffers: number;
  wonCount: number;
  closedSales: number; // المبيعات المغلقة (عدد)
  revenue: number; // الإيراد الفعلي = مجموع قيم الصفقات المغلقة
  revenueThisMonth: number;
  lostCount: number;
  winRate: number | null; // نسبة الإغلاق من (مغلق+خاسر) — null إن لا بيانات
  mixedCurrencies: boolean;
  recentWins: { id: string; businessName: string; dealValue: number; currency: string; wonAt: string }[];
};

export class RevenueService {
  db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async summary(userId: string): Promise<RevenueSummary> {
    const q = async <T>(sql: string, p: (string | number)[] = []) => (await this.db.get<T>(sql, [userId, ...p]))!;
    const open = "status NOT IN ('WON','LOST','NOT_A_FIT')";
    const pipeline = await q<{ v: number }>(`SELECT COALESCE(SUM(estimated_value),0) AS v FROM leads WHERE user_id = ? AND ${open}`);
    // آخر عرض مرسل لكل عميل مفتوح
    const offers = await this.db.all<{ price: number; lead_id: string }>(
      `SELECT o.price, o.lead_id FROM offers o JOIN leads l ON l.id = o.lead_id
       WHERE o.user_id = ? AND o.sent_at IS NOT NULL AND l.status IN ('OFFER_SENT','NEGOTIATING','INTERESTED','REPLIED')
       ORDER BY o.sent_at DESC`, [userId]);
    const seen = new Set<string>();
    let offersValue = 0;
    for (const o of offers) if (!seen.has(o.lead_id)) { seen.add(o.lead_id); offersValue += Number(o.price); }
    const won = await q<{ c: number; v: number }>("SELECT COUNT(*) AS c, COALESCE(SUM(deal_value),0) AS v FROM leads WHERE user_id = ? AND status = 'WON'");
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const month = await q<{ v: number }>("SELECT COALESCE(SUM(deal_value),0) AS v FROM leads WHERE user_id = ? AND status = 'WON' AND won_at >= ?", [monthStart]);
    const lost = await q<{ c: number }>("SELECT COUNT(*) AS c FROM leads WHERE user_id = ? AND status = 'LOST'");
    const cur = await q<{ c: number }>("SELECT COUNT(DISTINCT currency) AS c FROM leads WHERE user_id = ? AND (status = 'WON' OR estimated_value > 0)");
    const wins = await this.db.all<{ id: string; business_name: string; deal_value: number; currency: string; won_at: string }>(
      "SELECT id, business_name, deal_value, currency, won_at FROM leads WHERE user_id = ? AND status = 'WON' ORDER BY won_at DESC LIMIT 5", [userId]);
    const decided = Number(won.c) + Number(lost.c);
    return {
      currency: 'SAR', pipelineValue: Number(pipeline.v), offersValue, openOffers: seen.size, wonCount: Number(won.c), closedSales: Number(won.c),
      revenue: Number(won.v), revenueThisMonth: Number(month.v), lostCount: Number(lost.c), winRate: decided ? Math.round((Number(won.c) / decided) * 100) : null,
      mixedCurrencies: Number(cur.c) > 1,
      recentWins: wins.map((w) => ({ id: w.id, businessName: w.business_name, dealValue: Number(w.deal_value), currency: w.currency, wonAt: w.won_at })),
    };
  }
}
