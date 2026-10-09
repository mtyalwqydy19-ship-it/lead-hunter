// سجل التواصل + محرك المتابعة. لا يرسل أي رسالة: يسجّل ما فعله المستخدم فقط ويحسب المستحق.
import type { Db } from '../db.ts';
import type { Channel, Outcome, Status } from '../constants.ts';
import type { Contact, Lead } from '../types.ts';
import { contactFromRow, leadFromRow } from '../mappers.ts';
import { HttpError, daysBetween, endOfLocalDayIso, nowIso, uid } from '../util.ts';
import type { LeadService } from './LeadService.ts';
import { isTerminal } from './LeadService.ts';

const ORDER: Status[] = ['NEW', 'QUALIFIED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'OFFER_SENT', 'NEGOTIATING'];
const OUTCOME_TARGET: Partial<Record<Outcome, Status>> = { NO_RESPONSE: 'CONTACTED', FOLLOW_UP: 'CONTACTED', REPLIED: 'REPLIED', INTERESTED: 'INTERESTED', NOT_INTERESTED: 'LOST', LOST: 'LOST', WON: 'WON' };
// موعد المتابعة الافتراضي (بالأيام) إن لم يحدده المستخدم
const DEFAULT_DAYS: Partial<Record<Outcome, number>> = { NO_RESPONSE: 3, FOLLOW_UP: 2, REPLIED: 2, INTERESTED: 1 };

export type LogContactInput = {
  channel: Channel; outcome: Outcome; message?: string; notes?: string; contactedAt?: string;
  nextFollowUpAt?: string | null; dealValue?: number; currency?: string;
};

export type FollowUpItem = {
  lead: Lead; dueKind: 'overdue' | 'today'; daysSinceContact: number | null; lastOutcome: Outcome | null; lastChannel: Channel | null;
  noResponseStreak: number;
};

export class FollowUpService {
  db: Db;
  leads: LeadService;
  constructor(db: Db, leads: LeadService) {
    this.db = db;
    this.leads = leads;
  }

  async contactsFor(userId: string, leadId: string): Promise<Contact[]> {
    const rows = await this.db.all('SELECT * FROM contacts WHERE user_id = ? AND lead_id = ? ORDER BY contacted_at DESC, created_at DESC', [userId, leadId]);
    return rows.map(contactFromRow);
  }

  async recent(userId: string, limit = 50): Promise<Contact[]> {
    const rows = await this.db.all(
      'SELECT c.*, l.business_name AS business_name FROM contacts c JOIN leads l ON l.id = c.lead_id WHERE c.user_id = ? ORDER BY c.contacted_at DESC LIMIT ?',
      [userId, limit],
    );
    return rows.map(contactFromRow);
  }

  async logContact(userId: string, leadId: string, i: LogContactInput): Promise<{ contact: Contact; lead: Lead }> {
    const lead = await this.leads.mustGet(userId, leadId);
    const when = i.contactedAt ?? nowIso();
    if (new Date(when).getTime() > Date.now() + 5 * 60000) throw new HttpError(400, 'بيانات غير صالحة', { contactedAt: 'لا يمكن تسجيل تواصل في المستقبل' });
    if (i.outcome === 'WON' && !(((i.dealValue ?? lead.dealValue) ?? 0) > 0)) throw new HttpError(400, 'سجّل قيمة الصفقة لإغلاق البيع', { dealValue: 'قيمة الصفقة مطلوبة' });
    const id = uid();
    await this.db.run(
      'INSERT INTO contacts (id,user_id,lead_id,channel,message,outcome,notes,contacted_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, userId, leadId, i.channel, i.message ?? '', i.outcome, i.notes ?? '', when, nowIso()],
    );
    // آخر تواصل = أحدث تاريخ بين السجلات
    const lastContact = !lead.lastContactAt || when > lead.lastContactAt ? when : lead.lastContactAt;
    await this.db.run('UPDATE leads SET last_contact_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', [lastContact, nowIso(), leadId, userId]);

    const target = OUTCOME_TARGET[i.outcome]!;
    let updated: Lead;
    if (target === 'WON' || target === 'LOST') {
      updated = await this.leads.move(userId, leadId, target, { dealValue: i.dealValue, currency: i.currency });
    } else {
      // لا نُرجع العميل للخلف: التقدّم فقط. أما العميل المغلق/الخاسر الذي ردّ فيُعاد فتحه.
      const cur = lead.status;
      const advance = isTerminal(cur) || ORDER.indexOf(cur) < ORDER.indexOf(target);
      updated = advance ? await this.leads.move(userId, leadId, target) : lead;
      let next: string | null | undefined = i.nextFollowUpAt;
      if (next === undefined) {
        const days = DEFAULT_DAYS[i.outcome];
        next = days ? new Date(new Date(when).getTime() + days * 86400000).toISOString() : lead.nextFollowUpAt;
      }
      await this.db.run('UPDATE leads SET next_follow_up_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', [next ?? null, nowIso(), leadId, userId]);
      updated = await this.leads.mustGet(userId, leadId);
    }
    const contact = (await this.contactsFor(userId, leadId)).find((c) => c.id === id)!;
    return { contact, lead: updated };
  }

  async setFollowUp(userId: string, leadId: string, at: string | null): Promise<Lead> {
    await this.leads.mustGet(userId, leadId);
    await this.db.run('UPDATE leads SET next_follow_up_at = ?, updated_at = ? WHERE id = ? AND user_id = ?', [at, nowIso(), leadId, userId]);
    return this.leads.mustGet(userId, leadId);
  }

  // المتابعات المستحقة: عميل مفتوح وموعده قبل نهاية اليوم المحلي
  async due(userId: string, tzOffsetMin: number): Promise<{ items: FollowUpItem[]; upcoming: Lead[]; endOfDay: string }> {
    const endOfDay = endOfLocalDayIso(tzOffsetMin);
    const startOfDay = new Date(new Date(endOfDay).getTime() - 86400000 + 1).toISOString();
    const rows = await this.db.all(
      "SELECT * FROM leads WHERE user_id = ? AND next_follow_up_at IS NOT NULL AND status NOT IN ('WON','LOST','NOT_A_FIT') ORDER BY next_follow_up_at ASC",
      [userId],
    );
    const items: FollowUpItem[] = [];
    const upcoming: Lead[] = [];
    for (const r of rows) {
      const lead = leadFromRow(r);
      if (lead.nextFollowUpAt! > endOfDay) { upcoming.push(lead); continue; }
      const cs = await this.contactsFor(userId, lead.id);
      let streak = 0;
      for (const c of cs) { if (c.outcome === 'NO_RESPONSE') streak++; else break; }
      items.push({
        lead, dueKind: lead.nextFollowUpAt! < startOfDay ? 'overdue' : 'today',
        daysSinceContact: lead.lastContactAt ? daysBetween(lead.lastContactAt) : null,
        lastOutcome: cs[0]?.outcome ?? null, lastChannel: cs[0]?.channel ?? null, noResponseStreak: streak,
      });
    }
    return { items, upcoming: upcoming.slice(0, 50), endOfDay };
  }
}
