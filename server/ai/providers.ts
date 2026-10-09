// واجهة مزوّد الذكاء الاصطناعي + محوّلات Gemini / OpenAI / Claude.
// تنبيه صريح: محوّلات المزوّدين الخارجيين مكتوبة وفق وثائقهم لكنها لم تُختبر هنا بمفاتيح حقيقية.
// المزوّد "mock" للاختبار الآلي فقط ولا يُفعَّل إلا بـ AI_PROVIDER=mock.

export interface AIProvider {
  id: string;
  label: string;
  // يرجع نصًا (يُفترض أنه JSON). يرمي خطأ عند الفشل.
  complete(args: { system: string; user: string; signal: AbortSignal }): Promise<string>;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export class GeminiProvider implements AIProvider {
  id = 'gemini';
  label = 'Gemini';
  key: string;
  model: string;
  constructor(key: string, model = process.env.GEMINI_MODEL || 'gemini-2.0-flash') { this.key = key; this.model = model; }
  async complete({ system, user, signal }: { system: string; user: string; signal: AbortSignal }) {
    const j = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { 'x-goog-api-key': this.key },
      { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } },
      signal,
    );
    return String(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
  }
}

export class OpenAIProvider implements AIProvider {
  id = 'openai';
  label = 'OpenAI';
  key: string;
  model: string;
  constructor(key: string, model = process.env.OPENAI_MODEL || 'gpt-4o-mini') { this.key = key; this.model = model; }
  async complete({ system, user, signal }: { system: string; user: string; signal: AbortSignal }) {
    const j = await postJson(
      'https://api.openai.com/v1/chat/completions',
      { authorization: `Bearer ${this.key}` },
      { model: this.model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] },
      signal,
    );
    return String(j?.choices?.[0]?.message?.content ?? '');
  }
}

export class ClaudeProvider implements AIProvider {
  id = 'claude';
  label = 'Claude';
  key: string;
  model: string;
  constructor(key: string, model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001') { this.key = key; this.model = model; }
  async complete({ system, user, signal }: { system: string; user: string; signal: AbortSignal }) {
    const j = await postJson(
      'https://api.anthropic.com/v1/messages',
      { 'x-api-key': this.key, 'anthropic-version': '2023-06-01' },
      { model: this.model, max_tokens: 1500, temperature: 0.2, system, messages: [{ role: 'user', content: user }] },
      signal,
    );
    return String(j?.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '');
  }
}

// للاختبارات فقط: يرجع JSON ثابتًا أو يفشل حسب النص. لا علاقة له بأي خدمة حقيقية.
export class MockProvider implements AIProvider {
  id = 'mock';
  label = 'Mock (اختبار فقط)';
  async complete({ user }: { system: string; user: string; signal: AbortSignal }) {
    if (user.includes('__FAIL__')) throw new Error('mock failure');
    if (user.includes('__BADJSON__')) return 'ليس JSON';
    return JSON.stringify({
      painSignal: 'مبالغة: العميل يعاني بشدة', painLevel: 'VERIFIED', confidence: 'VERIFIED', opportunity: 'فرصة اختبارية',
      recommendedService: 'موظف واتساب ذكي', reason: 'اختبار', suggestedOffer: 'عرض اختباري', suggestedMessage: 'رسالة اختبارية',
    });
  }
}

export function providerFromEnv(env = process.env): AIProvider | null {
  const want = (env.AI_PROVIDER || '').toLowerCase();
  if (want === 'mock') return new MockProvider();
  if ((want === 'gemini' || !want) && env.GEMINI_API_KEY) return new GeminiProvider(env.GEMINI_API_KEY);
  if ((want === 'openai' || !want) && env.OPENAI_API_KEY) return new OpenAIProvider(env.OPENAI_API_KEY);
  if ((want === 'claude' || want === 'anthropic' || !want) && env.ANTHROPIC_API_KEY) return new ClaudeProvider(env.ANTHROPIC_API_KEY);
  return null;
}
