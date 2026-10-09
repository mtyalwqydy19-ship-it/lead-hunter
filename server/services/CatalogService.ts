// خدماتي: ما أبيعه (الاسم، السعر، المدة، القطاعات المستهدفة)
import type { Db } from '../db.ts';
import type { Service } from '../types.ts';
import { serviceFromRow } from '../mappers.ts';
import { HttpError, nowIso, uid } from '../util.ts';

export type ServiceInput = {
  name: string; description?: string; startingPrice?: number; currency?: string; deliveryTime?: string; features?: string[]; targetSectors?: string[];
};

export class CatalogService {
  db: Db;
  constructor(db: Db) {
    this.db = db;
  }

  async list(userId: string): Promise<Service[]> {
    const rows = await this.db.all('SELECT * FROM services WHERE user_id = ? ORDER BY created_at ASC', [userId]);
    return rows.map(serviceFromRow);
  }

  async get(userId: string, id: string): Promise<Service | null> {
    const r = await this.db.get('SELECT * FROM services WHERE id = ? AND user_id = ?', [id, userId]);
    return r ? serviceFromRow(r) : null;
  }

  async create(userId: string, i: ServiceInput): Promise<Service> {
    const id = uid();
    const now = nowIso();
    await this.db.run(
      'INSERT INTO services (id,user_id,name,description,starting_price,currency,delivery_time,features,target_sectors,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [id, userId, i.name, i.description ?? '', i.startingPrice ?? 0, i.currency ?? 'SAR', i.deliveryTime ?? '', JSON.stringify(i.features ?? []), JSON.stringify(i.targetSectors ?? []), now, now],
    );
    return (await this.get(userId, id))!;
  }

  async update(userId: string, id: string, p: Partial<ServiceInput>): Promise<Service> {
    const cur = await this.get(userId, id);
    if (!cur) throw new HttpError(404, 'الخدمة غير موجودة');
    const m = { ...cur, ...p };
    await this.db.run(
      'UPDATE services SET name=?, description=?, starting_price=?, currency=?, delivery_time=?, features=?, target_sectors=?, updated_at=? WHERE id=? AND user_id=?',
      [m.name, m.description, m.startingPrice, m.currency, m.deliveryTime, JSON.stringify(m.features), JSON.stringify(m.targetSectors), nowIso(), id, userId],
    );
    return (await this.get(userId, id))!;
  }

  async remove(userId: string, id: string) {
    const r = await this.db.run('DELETE FROM services WHERE id = ? AND user_id = ?', [id, userId]);
    if (!r.changes) throw new HttpError(404, 'الخدمة غير موجودة');
  }
}
