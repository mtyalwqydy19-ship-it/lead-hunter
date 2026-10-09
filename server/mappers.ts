// تحويل صفوف قاعدة البيانات (snake_case) إلى كائنات التطبيق (camelCase)
import type { Contact, Lead, Offer, OfferContent, Service, AiAnalysis, ScoreResult } from './types.ts';
import { parseJson } from './util.ts';
import type { Channel, Confidence, Outcome, PainLevel, Status, Urgency } from './constants.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

export const serviceFromRow = (r: R): Service => ({
  id: r.id, name: r.name, description: r.description, startingPrice: Number(r.starting_price), currency: r.currency,
  deliveryTime: r.delivery_time, features: parseJson<string[]>(r.features, []), targetSectors: parseJson<string[]>(r.target_sectors, []),
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export const leadFromRow = (r: R): Lead => ({
  id: r.id, businessName: r.business_name, businessType: r.business_type, country: r.country, city: r.city,
  website: r.website, phone: r.phone, whatsapp: r.whatsapp, instagram: r.instagram, email: r.email,
  source: r.source, sourceUrl: r.source_url, description: r.description, notes: r.notes,
  painSignal: r.pain_signal, painEvidence: r.pain_evidence, painEvidenceSource: r.pain_evidence_source,
  painLevel: r.pain_level as PainLevel, painConfidence: r.pain_confidence as Confidence,
  opportunity: r.opportunity, recommendedServiceId: r.recommended_service_id ?? null, estimatedValue: Number(r.estimated_value),
  urgency: r.urgency as Urgency, score: Number(r.score), scoreBreakdown: parseJson<ScoreResult | null>(r.score_breakdown, null),
  status: r.status as Status, priority: r.priority, lastContactAt: r.last_contact_at ?? null, nextFollowUpAt: r.next_follow_up_at ?? null,
  dealValue: r.deal_value === null || r.deal_value === undefined ? null : Number(r.deal_value), currency: r.currency, wonAt: r.won_at ?? null,
  aiAnalysis: parseJson<AiAnalysis | null>(r.ai_analysis, null), createdAt: r.created_at, updatedAt: r.updated_at,
});

export const contactFromRow = (r: R): Contact => ({
  id: r.id, leadId: r.lead_id, channel: r.channel as Channel, message: r.message, outcome: r.outcome as Outcome,
  notes: r.notes, contactedAt: r.contacted_at, createdAt: r.created_at, ...(r.business_name !== undefined ? { businessName: r.business_name } : {}),
});

export const offerFromRow = (r: R): Offer => ({
  id: r.id, leadId: r.lead_id, serviceId: r.service_id ?? null, content: parseJson<OfferContent>(r.content, {} as OfferContent),
  price: Number(r.price), currency: r.currency, sentAt: r.sent_at ?? null, createdAt: r.created_at,
});
