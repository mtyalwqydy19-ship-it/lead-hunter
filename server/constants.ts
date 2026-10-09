// الثوابت المشتركة — مصدر الحقيقة الوحيد للحالات والتسميات (تُرسل للواجهة عبر /api/meta)

export const STATUSES = ['NEW', 'QUALIFIED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'OFFER_SENT', 'NEGOTIATING', 'WON', 'LOST', 'NOT_A_FIT'] as const;
export const PAIN_LEVELS = ['NONE', 'POSSIBLE', 'PROBABLE', 'STRONG', 'VERIFIED'] as const;
export const CONFIDENCES = ['UNKNOWN', 'WEAK', 'POSSIBLE', 'PROBABLE', 'VERIFIED'] as const;
export const CHANNELS = ['WHATSAPP', 'PHONE', 'INSTAGRAM', 'EMAIL', 'OTHER'] as const;
export const OUTCOMES = ['NO_RESPONSE', 'REPLIED', 'INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP', 'WON', 'LOST'] as const;
export const URGENCIES = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH'] as const;
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const SOURCES = ['MANUAL', 'WEBSITE', 'INSTAGRAM', 'GOOGLE_MAPS', 'DIRECTORY', 'REFERRAL', 'OTHER', 'DEMO'] as const;

export type Status = (typeof STATUSES)[number];
export type PainLevel = (typeof PAIN_LEVELS)[number];
export type Confidence = (typeof CONFIDENCES)[number];
export type Channel = (typeof CHANNELS)[number];
export type Outcome = (typeof OUTCOMES)[number];
export type Urgency = (typeof URGENCIES)[number];

export const TERMINAL_STATUSES: readonly Status[] = ['WON', 'LOST', 'NOT_A_FIT'];
export const OPEN_STATUSES: readonly Status[] = STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s));
// أعمدة المسار (Kanban) بالترتيب المطلوب — NOT_A_FIT لا يظهر كعمود
export const PIPELINE_COLUMNS: readonly Status[] = ['NEW', 'QUALIFIED', 'CONTACTED', 'REPLIED', 'INTERESTED', 'OFFER_SENT', 'NEGOTIATING', 'WON', 'LOST'];

export const LABELS = {
  status: { NEW: 'جديد', QUALIFIED: 'مؤهل', CONTACTED: 'تم التواصل', REPLIED: 'رد', INTERESTED: 'مهتم', OFFER_SENT: 'عرض مرسل', NEGOTIATING: 'تفاوض', WON: 'تم البيع', LOST: 'خسرنا', NOT_A_FIT: 'غير مناسب' },
  painLevel: { NONE: 'لا توجد مشكلة', POSSIBLE: 'مشكلة محتملة', PROBABLE: 'مشكلة مرجّحة', STRONG: 'مشكلة قوية', VERIFIED: 'مشكلة مؤكدة' },
  confidence: { UNKNOWN: 'غير معروفة', WEAK: 'ضعيفة', POSSIBLE: 'ممكنة', PROBABLE: 'محتملة', VERIFIED: 'مؤكدة' },
  channel: { WHATSAPP: 'واتساب', PHONE: 'اتصال', INSTAGRAM: 'إنستغرام', EMAIL: 'بريد', OTHER: 'أخرى' },
  outcome: { NO_RESPONSE: 'لم يرد', REPLIED: 'رد', INTERESTED: 'مهتم', NOT_INTERESTED: 'غير مهتم', FOLLOW_UP: 'يحتاج متابعة', WON: 'تم البيع', LOST: 'خسرنا' },
  urgency: { UNKNOWN: 'غير محدد', LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية' },
  priority: { LOW: 'عادية', MEDIUM: 'متوسطة', HIGH: 'عالية' },
  source: { MANUAL: 'إدخال يدوي', WEBSITE: 'موقع النشاط', INSTAGRAM: 'إنستغرام', GOOGLE_MAPS: 'خرائط جوجل', DIRECTORY: 'دليل أعمال', REFERRAL: 'ترشيح/معرفة', OTHER: 'أخرى', DEMO: 'بيانات تجريبية' },
} as const;

export const SECTORS = ['عيادات', 'صالونات', 'مطاعم', 'مقاهي', 'متاجر إلكترونية', 'عقارات', 'شركات خدمات', 'مراكز تدريب', 'فنادق', 'شحن وتوصيل', 'سفر وسياحة', 'معارض سيارات'];
export const PAIN_TYPES = ['تأخر الرد', 'طلبات كثيرة', 'حجوزات يدوية', 'أسئلة متكررة', 'متابعة العملاء', 'عملاء يسألون ولا يشترون', 'فواتير وتحصيل', 'تنظيم العملاء', 'الرد خارج أوقات العمل'];

export const SCORE_BANDS = [
  { min: 0, max: 30, key: 'weak', label: 'ضعيف' },
  { min: 31, max: 60, key: 'medium', label: 'متوسط' },
  { min: 61, max: 80, key: 'good', label: 'جيد' },
  { min: 81, max: 100, key: 'top', label: 'أولوية عالية' },
] as const;
export const STRONG_SCORE_MIN = 61;

// قوالب خدمات مقترحة — بدون أسعار (السعر تحدده أنت). لا تُضاف إلا بضغطة منك.
export const SERVICE_TEMPLATES = [
  { name: 'موظف واتساب ذكي', description: 'رد آلي منظم على أسئلة العملاء الأساسية عبر واتساب مع تحويل الحالات المعقدة إليك.', features: ['ردود على الأسئلة المتكررة', 'ساعات عمل وردود خارج الدوام', 'تحويل الحالات الخاصة لموظف'], targetSectors: ['عيادات', 'مطاعم', 'متاجر إلكترونية', 'صالونات'] },
  { name: 'متابعة العملاء', description: 'نظام تذكير ومتابعة للعملاء المحتملين حتى لا يضيع أي استفسار.', features: ['تذكيرات متابعة', 'سجل تواصل لكل عميل', 'قوالب رسائل متابعة'], targetSectors: ['عقارات', 'شركات خدمات', 'مراكز تدريب', 'معارض سيارات'] },
  { name: 'استرجاع العملاء الضائعين', description: 'إعادة التواصل المنظم مع عملاء سألوا سابقًا ولم يكملوا الشراء أو الحجز.', features: ['قائمة العملاء المنقطعين', 'رسائل استرجاع مخصصة', 'تتبع النتائج'], targetSectors: ['متاجر إلكترونية', 'عقارات', 'سفر وسياحة', 'فنادق'] },
  { name: 'الرد الآلي على الأسئلة', description: 'قاعدة أسئلة وأجوبة جاهزة تُجيب تلقائيًا على الاستفسارات الشائعة.', features: ['أسئلة وأجوبة قابلة للتعديل', 'ردود فورية', 'تقرير بالأسئلة الأكثر تكرارًا'], targetSectors: ['مطاعم', 'مقاهي', 'فنادق', 'مراكز تدريب'] },
  { name: 'تنظيم العملاء', description: 'جدول/CRM بسيط لجمع بيانات العملاء وحالاتهم في مكان واحد.', features: ['قاعدة عملاء موحدة', 'حالات ومراحل', 'تقارير مبسطة'], targetSectors: ['شركات خدمات', 'عيادات', 'صالونات'] },
  { name: 'أتمتة الطلبات', description: 'استقبال الطلبات وتنظيمها وتأكيدها تلقائيًا بدل التسجيل اليدوي.', features: ['استقبال الطلبات', 'تأكيد تلقائي', 'ملخص يومي'], targetSectors: ['مطاعم', 'مقاهي', 'متاجر إلكترونية', 'شحن وتوصيل'] },
  { name: 'أتمتة الحجوزات', description: 'حجز المواعيد وتأكيدها والتذكير بها دون تدخل يدوي.', features: ['حجز المواعيد', 'تأكيد وتذكير', 'تقليل الغياب'], targetSectors: ['عيادات', 'صالونات', 'فنادق', 'مراكز تدريب'] },
] as const;
