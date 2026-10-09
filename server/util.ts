import { randomUUID } from 'node:crypto';

export const uid = () => randomUUID();
export const nowIso = () => new Date().toISOString();

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

// نهاية "اليوم" بتوقيت المستخدم. tzOffsetMin = (UTC - local) بالدقائق كما في Date.getTimezoneOffset()
export function endOfLocalDayIso(tzOffsetMin: number, now = new Date()): string {
  const localMs = now.getTime() - tzOffsetMin * 60000;
  const d = new Date(localMs);
  const endLocal = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
  return new Date(endLocal + tzOffsetMin * 60000).toISOString();
}

export const daysBetween = (fromIso: string, to = new Date()) => Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86400000);
