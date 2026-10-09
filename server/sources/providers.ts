// مصادر اكتشاف العملاء. لا نخترع نتائج أبدًا:
//  - "manual": لا بحث آلي — يعطيك روابط بحث تفتحها بنفسك ثم تضيف العميل يدويًا.
//  - "google_places": يعمل فقط إن وُضع GOOGLE_PLACES_API_KEY (غير مُختبر هنا). النتائج "مرشّحون" لا أكثر:
//    اسم وعنوان وهاتف وموقع كما تعيدها Google، بدون أي ادعاء عن مشكلتهم.

export type Query = { country: string; city: string; sector: string; limit: number };
export type Candidate = {
  businessName: string; businessType: string; country: string; city: string; address: string; phone: string; website: string; sourceUrl: string; source: string; sourceId: string;
};
export interface LeadSourceProvider {
  id: string;
  label: string;
  available(): boolean;
  unavailableReason(): string;
  search(q: Query): Promise<Candidate[]>;
}

export class ManualProvider implements LeadSourceProvider {
  id = 'manual';
  label = 'بحث يدوي (روابط جاهزة)';
  available() { return false; } // لا يرجع نتائج آلية
  unavailableReason() { return 'لا يوجد مصدر بحث آلي متصل. استخدم روابط البحث ثم أضف العميل يدويًا.'; }
  async search(): Promise<Candidate[]> { return []; }
}

export class GooglePlacesProvider implements LeadSourceProvider {
  id = 'google_places';
  label = 'Google Places';
  key: string | undefined;
  constructor(key = process.env.GOOGLE_PLACES_API_KEY) { this.key = key; }
  available() { return !!this.key; }
  unavailableReason() { return 'غير مفعّل: يحتاج مفتاح GOOGLE_PLACES_API_KEY على الخادم (خدمة مدفوعة من Google).'; }
  async search(q: Query): Promise<Candidate[]> {
    if (!this.key) throw new Error(this.unavailableReason());
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'X-Goog-Api-Key': this.key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery: `${q.sector} ${q.city} ${q.country}`.trim(), languageCode: 'ar', maxResultCount: Math.min(Math.max(q.limit, 1), 20) }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Google Places HTTP ${res.status}`);
    const j = JSON.parse(text) as { places?: { id: string; displayName?: { text?: string }; formattedAddress?: string; internationalPhoneNumber?: string; nationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string }[] };
    return (j.places ?? []).map((p) => ({
      businessName: p.displayName?.text ?? '', businessType: q.sector, country: q.country, city: q.city, address: p.formattedAddress ?? '',
      phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? '', website: p.websiteUri ?? '', sourceUrl: p.googleMapsUri ?? '', source: 'GOOGLE_MAPS', sourceId: p.id,
    })).filter((c) => c.businessName);
  }
}

export const mapsSearchUrl = (q: { sector: string; city: string; country: string }) =>
  `https://www.google.com/maps/search/${encodeURIComponent([q.sector, q.city, q.country].filter(Boolean).join(' '))}`;
export const webSearchUrl = (q: { sector: string; city: string; country: string; pain: string }) =>
  `https://www.google.com/search?q=${encodeURIComponent([q.sector, q.city, q.country, q.pain].filter(Boolean).join(' '))}`;
export const instagramSearchUrl = (q: { sector: string; city: string }) =>
  `https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com ${q.sector} ${q.city}`.trim())}`;

export function sourceProviders(): LeadSourceProvider[] {
  return [new GooglePlacesProvider(), new ManualProvider()];
}
