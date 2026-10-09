import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { Db } from '../db.ts';
import { HttpError, nowIso, uid } from '../util.ts';

const SESSION_DAYS = 30;
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

const scryptAsync = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => scrypt(pw, salt, 64, (e, k) => (e ? reject(e) : resolve(k))));

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await scryptAsync(pw, salt)).toString('hex')}`;
}
async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(pw, Buffer.from(saltHex, 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export type PublicUser = { id: string; email: string; name: string; businessName: string };
type UserRow = { id: string; email: string; name: string; business_name: string; password_hash: string };
const pub = (u: UserRow): PublicUser => ({ id: u.id, email: u.email, name: u.name, businessName: u.business_name });

export class AuthService {
  db: Db;
  allowRegistration: boolean;
  attempts = new Map<string, { n: number; reset: number }>();
  constructor(db: Db, allowRegistration: boolean) {
    this.db = db;
    this.allowRegistration = allowRegistration;
  }

  async needsSetup(): Promise<boolean> {
    const r = await this.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM users');
    return (r?.c ?? 0) === 0;
  }

  private throttle(key: string) {
    const now = Date.now();
    const a = this.attempts.get(key);
    if (!a || a.reset < now) this.attempts.set(key, { n: 1, reset: now + 15 * 60000 });
    else if (++a.n > 10) throw new HttpError(429, 'محاولات كثيرة. حاول بعد 15 دقيقة');
  }

  async register(input: { email: string; password: string; name: string; businessName: string }): Promise<PublicUser> {
    if (!(await this.needsSetup()) && !this.allowRegistration) throw new HttpError(403, 'التسجيل مغلق. هذا التطبيق لمستخدم واحد حاليًا');
    const email = input.email.toLowerCase();
    if (await this.db.get('SELECT id FROM users WHERE email = ?', [email])) throw new HttpError(409, 'هذا البريد مسجّل مسبقًا');
    const id = uid();
    await this.db.run('INSERT INTO users (id,email,name,business_name,password_hash,created_at) VALUES (?,?,?,?,?,?)', [id, email, input.name, input.businessName, await hashPassword(input.password), nowIso()]);
    return { id, email, name: input.name, businessName: input.businessName };
  }

  async login(email: string, password: string, ip: string): Promise<{ user: PublicUser; token: string }> {
    this.throttle(`${ip}|${email.toLowerCase()}`);
    const u = await this.db.get<UserRow>('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    // نفس زمن العمل تقريبًا سواء وُجد المستخدم أم لا
    const ok = u ? await verifyPassword(password, u.password_hash) : (await hashPassword(password), false);
    if (!u || !ok) throw new HttpError(401, 'بريد أو كلمة مرور غير صحيحة');
    this.attempts.delete(`${ip}|${email.toLowerCase()}`);
    return { user: pub(u), token: await this.createSession(u.id) };
  }

  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await this.db.run('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)', [hashToken(token), userId, expires, nowIso()]);
    await this.db.run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]);
    return token;
  }

  async userFromToken(token: string | undefined): Promise<PublicUser | null> {
    if (!token) return null;
    const row = await this.db.get<UserRow>(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
      [hashToken(token), nowIso()],
    );
    return row ? pub(row) : null;
  }

  async logout(token: string | undefined) {
    if (token) await this.db.run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
  }

  async updateProfile(userId: string, p: { name?: string; businessName?: string }) {
    if (p.name !== undefined) await this.db.run('UPDATE users SET name = ? WHERE id = ?', [p.name, userId]);
    if (p.businessName !== undefined) await this.db.run('UPDATE users SET business_name = ? WHERE id = ?', [p.businessName, userId]);
    const u = await this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
    return pub(u!);
  }

  async changePassword(userId: string, current: string, next: string, keepToken?: string) {
    const u = await this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]);
    if (!u || !(await verifyPassword(current, u.password_hash))) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
    await this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(next), userId]);
    // إنهاء كل الجلسات الأخرى
    await this.db.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [userId, keepToken ? hashToken(keepToken) : '']);
  }
}
