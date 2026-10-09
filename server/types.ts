import type { Channel, Confidence, Outcome, PainLevel, Status, Urgency } from './constants.ts';

export type ScorePart = { key: string; label: string; points: number; max: number; reason: string };
export type ScoreResult = {
  score: number;
  band: 'weak' | 'medium' | 'good' | 'top';
  bandLabel: string;
  parts: ScorePart[];
  reasons: string[]; // أسطر "+" سبب إيجابي
  warnings: string[]; // تنبيهات (نقص دليل، نقص بيانات…)
};

export type Service = {
  id: string; name: string; description: string; startingPrice: number; currency: string;
  deliveryTime: string; features: string[]; targetSectors: string[]; createdAt: string; updatedAt: string;
};

export type AiAnalysis = {
  painSignal: string; painLevel: PainLevel; confidence: Confidence; opportunity: string;
  recommendedService: string; reason: string; suggestedOffer: string; suggestedMessage: string;
  provider: string; analyzedAt: string;
};

export type Lead = {
  id: string; businessName: string; businessType: string; country: string; city: string;
  website: string; phone: string; whatsapp: string; instagram: string; email: string;
  source: string; sourceUrl: string; description: string; notes: string;
  painSignal: string; painEvidence: string; painEvidenceSource: string; painLevel: PainLevel; painConfidence: Confidence;
  opportunity: string; recommendedServiceId: string | null; estimatedValue: number; urgency: Urgency;
  score: number; scoreBreakdown: ScoreResult | null; status: Status; priority: string;
  lastContactAt: string | null; nextFollowUpAt: string | null;
  dealValue: number | null; currency: string; wonAt: string | null;
  aiAnalysis: AiAnalysis | null; createdAt: string; updatedAt: string;
};

export type Contact = {
  id: string; leadId: string; channel: Channel; message: string; outcome: Outcome; notes: string; contactedAt: string; createdAt: string;
  businessName?: string;
};

export type OfferContent = {
  title: string; problem: string; solution: string; benefit: string; deliverables: string[];
  deliveryTime: string; price: string; nextStep: string; text: string;
};
export type Offer = { id: string; leadId: string; serviceId: string | null; content: OfferContent; price: number; currency: string; sentAt: string | null; createdAt: string };
