# صائد العملاء — Lead Hunter

تطبيق ويب شخصي (عربي RTL، للهاتف أولًا) لإدارة العملاء المحتملين لخدمات الأتمتة والذكاء الاصطناعي: تسجيل، تقييم بأسباب، رسائل وعروض، تواصل، متابعات، مسار مبيعات، إيرادات.

## التشغيل
```
node -v            # يلزم 22.13 أو أحدث
npm start          # http://localhost:3000  (بلا تثبيت حزم: الخادم بدون اعتماديات، والواجهة مبنية في web/dist)
npm test           # 32 اختبارًا شاملًا للـ API والأمان وبنود الإنجاز
```
أول مستخدم يفتح التطبيق ينشئ حسابه (هو المالك) ثم يُغلق التسجيل. لا توجد كلمة مرور افتراضية.

## متغيرات البيئة
| المتغير | الغرض |
|---|---|
| `PORT` | المنفذ (3000) |
| `DATA_DIR` / `DB_FILE` | مكان ملف SQLite (يجب أن يكون على قرص دائم عند الاستضافة) |
| `SETUP_CODE` | إن وُضع، لا يُنشأ أول حساب إلا بهذا الرمز (مهم عند النشر العام) |
| `ALLOW_REGISTRATION=1` | فتح التسجيل لمستخدمين آخرين (الهيكل جاهز لـ SaaS) |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` (+`AI_PROVIDER`) | تفعيل تحليل AI (غير مُختبر بمفاتيح حقيقية) |
| `GOOGLE_PLACES_API_KEY` | تفعيل البحث الآلي عبر Google Places (غير مُختبر، خدمة مدفوعة) |

## البنية
`UI (web/src) → API (server/index.ts) → Services (server/services) → Database (server/db.ts)`
- الخدمات: LeadService, AIService, ScoringService, MessageService, FollowUpService, RevenueService (+ Dashboard, Catalog, Auth).
- قاعدة البيانات: واجهة `Db` غير متزامنة؛ التنفيذ الحالي SQLite. للانتقال إلى PostgreSQL اكتب محوّلًا يطابق الواجهة (المخطط بصيغة SQL قياسية، وكل جدول فيه `user_id`).
- `server/ai/providers.ts`: `AIProvider` (Gemini/OpenAI/Claude + mock للاختبار فقط).
- `server/sources/providers.ts`: `LeadSourceProvider` (Google Places جاهز للمفتاح، وإضافة مصادر أخرى بملف واحد).

## إعادة بناء الواجهة
`cd web && node build.mjs` (esbuild + Tailwind v4). مع npm عادي: `npm install` ثم `npm run build`. احذف `web/src/react-shim.d.ts` عند تثبيت `@types/react`.

## مبادئ مضمّنة في الكود
لا إرسال تلقائي أبدًا • لا مستوى مشكلة فوق "محتملة" بدون دليل ومصدر • الرسائل بلا دليل تُصاغ عامة بلا ادعاءات • اقتراحات AI تُقيَّد بالدليل • كل عميل له مصدر.
