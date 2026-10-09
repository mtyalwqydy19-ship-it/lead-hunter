// طبقة قاعدة البيانات: واجهة Db غير متزامنة (async) حتى يمكن استبدال SQLite بـ PostgreSQL
// لاحقًا بكتابة محوّل جديد فقط (انظر README). التنفيذ الحالي: SQLite المدمجة في Node.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type Param = string | number | null | undefined;
export type Row = Record<string, string | number | null>;

export interface Db {
  all<T = Row>(sql: string, params?: Param[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: Param[]): Promise<T | undefined>;
  run(sql: string, params?: Param[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  close(): void;
}

const clean = (p: Param[] = []) => p.map((x) => (x === undefined ? null : x));

export function openSqlite(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return {
    async all<T>(sql: string, params?: Param[]) {
      return raw.prepare(sql).all(...clean(params)) as T[];
    },
    async get<T>(sql: string, params?: Param[]) {
      return raw.prepare(sql).get(...clean(params)) as T | undefined;
    },
    async run(sql: string, params?: Param[]) {
      const r = raw.prepare(sql).run(...clean(params));
      return { changes: Number(r.changes) };
    },
    async exec(sql: string) {
      raw.exec(sql);
    },
    close() {
      raw.close();
    },
  };
}

// المخطط — SQL قياسي قدر الإمكان (TEXT للتواريخ ISO وللـ JSON) ليسهل نقله إلى PostgreSQL.
// كل جدول يحمل user_id: كل البيانات مرتبطة بالمستخدم الحالي (جاهز لتحويله إلى SaaS).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  business_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starting_price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SAR',
  delivery_time TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '[]',
  target_sectors TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'MANUAL',
  source_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  pain_signal TEXT NOT NULL DEFAULT '',
  pain_evidence TEXT NOT NULL DEFAULT '',
  pain_evidence_source TEXT NOT NULL DEFAULT '',
  pain_level TEXT NOT NULL DEFAULT 'NONE',
  pain_confidence TEXT NOT NULL DEFAULT 'UNKNOWN',
  opportunity TEXT NOT NULL DEFAULT '',
  recommended_service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  estimated_value REAL NOT NULL DEFAULT 0,
  urgency TEXT NOT NULL DEFAULT 'UNKNOWN',
  score INTEGER NOT NULL DEFAULT 0,
  score_breakdown TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'NEW',
  priority TEXT NOT NULL DEFAULT 'LOW',
  last_contact_at TEXT,
  next_follow_up_at TEXT,
  deal_value REAL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  won_at TEXT,
  ai_analysis TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_user_status ON leads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_user_followup ON leads(user_id, next_follow_up_at);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  contacted_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_lead ON contacts(user_id, lead_id, contacted_at);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SAR',
  sent_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_offers_lead ON offers(user_id, lead_id);
`;

export async function migrate(db: Db): Promise<void> {
  await db.exec(SCHEMA);
}
