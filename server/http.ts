// مصغّر للتوجيه وقراءة الجسم والكوكيز — بدون Express.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './util.ts';

export type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  userId: string; // يُملأ فقط للمسارات المحمية، ومصدره الجلسة على الخادم — وليس الواجهة
  cookies: Record<string, string>;
};
export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
type Route = { method: string; re: RegExp; keys: string[]; handler: Handler; auth: boolean };

export class Router {
  routes: Route[] = [];
  add(method: string, path: string, handler: Handler, auth = true) {
    const keys: string[] = [];
    const re = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_m, k) => (keys.push(k), '([^/]+)')) + '$');
    this.routes.push({ method, re, keys, handler, auth });
  }
  get = (p: string, h: Handler, auth = true) => this.add('GET', p, h, auth);
  post = (p: string, h: Handler, auth = true) => this.add('POST', p, h, auth);
  patch = (p: string, h: Handler, auth = true) => this.add('PATCH', p, h, auth);
  del = (p: string, h: Handler, auth = true) => this.add('DELETE', p, h, auth);
  match(method: string, path: string) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params, pathMatched };
    }
    return { route: null, params: {}, pathMatched };
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function readJson(req: IncomingMessage, limit = 100_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new HttpError(413, 'حجم الطلب كبير جدًا');
    chunks.push(c as Buffer);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON غير صالح');
  }
}

export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string | string[]> = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
