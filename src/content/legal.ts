// Terms of Service and Privacy Policy text (English + Arabic).
// Drafted for how Be Right works; have a lawyer review it for each country before launch.
// The country-specific parts (law, courts, data protection) are placeholders in COMPANY.
import {
  COMPANY,
  REJECTED_APPLICATION_RETENTION_DAYS as REJECT_DAYS,
  VISIT_FEE_USD as FEE,
  WORKMANSHIP_GUARANTEE_DAYS as GUARANTEE_DAYS,
  arabicDays,
} from "@contracts/legal";
import { EMERGENCY_RETENTION_DAYS as EMERGENCY_DAYS } from "@contracts/emergency";
import type { LocalText } from "@contracts/services";

export type LegalSection = { title: LocalText; paragraphs: LocalText[] };
export type LegalDocument = { title: LocalText; intro: LocalText; sections: LegalSection[] };

const t = (en: string, ar: string): LocalText => ({ en, ar });

export const TERMS: LegalDocument = {
  title: t("Terms of Service", "شروط الخدمة"),
  intro: t(
    `These terms are an agreement between you and ${COMPANY.legalName} ("Be Right", "we"), operator of ${COMPANY.website}. By creating an account or booking a service you accept them. If you don't agree, please don't use the service.`,
    `هذه الشروط اتفاق بينك وبين ${COMPANY.legalName} ("بي رايت"، "نحن")، مشغّل الموقع ${COMPANY.website}. بإنشاء حساب أو حجز خدمة فإنك توافق عليها. إذا لم توافق، يُرجى عدم استخدام الخدمة.`,
  ),
  sections: [
    {
      title: t("1. What Be Right does", "١. ما تقدّمه بي رايت"),
      paragraphs: [
        t(
          "Be Right is a managed home-maintenance service. You describe the problem through guided questions and photos; a Be Right specialist reviews it, prepares a quote and assigns a qualified, contracted technician who carries out the work.",
          "بي رايت خدمة صيانة منزلية مُدارة. تصف المشكلة عبر أسئلة موجّهة وصور؛ يراجعها مختص من بي رايت، ويعدّ عرض سعر، ويعيّن فنياً مؤهلاً متعاقداً يتولّى تنفيذ العمل.",
        ),
        t(
          "For urgent repairs, the Emergency button puts you in touch with our team by phone; we send help as fast as we can but can't promise an arrival time. Be Right is not an emergency service: if there is fire, a gas smell, sparks or any immediate danger, leave the area and call your local emergency number before contacting us.",
          "للإصلاحات العاجلة، يتيح لك زر «طوارئ» التواصل مع فريقنا عبر الهاتف؛ نرسل المساعدة بأسرع ما يمكن لكن لا يمكننا ضمان موعد الوصول. بي رايت ليست خدمة طوارئ: في حال وجود حريق أو رائحة غاز أو شرر أو أي خطر فوري، ابتعد عن المكان واتصل برقم الطوارئ المحلي قبل التواصل معنا.",
        ),
      ],
    },
    {
      title: t("2. Your account", "٢. حسابك"),
      paragraphs: [
        t(
          "You must be at least 18 and give accurate details (name, email, phone and address). Keep your password private; you are responsible for activity on your account. Tell us at once if you think it has been misused.",
          "يجب أن يكون عمرك ١٨ سنة على الأقل وأن تقدّم معلومات صحيحة (الاسم والبريد الإلكتروني والهاتف والعنوان). حافظ على سرية كلمة المرور؛ فأنت مسؤول عن أي نشاط يتم عبر حسابك. أبلغنا فوراً إذا اشتبهت بإساءة استخدامه.",
        ),
      ],
    },
    {
      title: t("3. Bookings, quotes and your approval", "٣. الحجوزات وعروض الأسعار وموافقتك"),
      paragraphs: [
        t(
          "Submitting a request is free. A specialist reviews it, and before any technician is sent, we show you the price or estimate and the appointment. Nothing is dispatched or charged until you approve.",
          "تقديم الطلب مجاني. يراجعه مختص، وقبل إرسال أي فني نعرض عليك السعر أو التقدير والموعد. لا يتم إرسال أحد ولا تُستوفى أي كلفة قبل موافقتك.",
        ),
        t(
          "If the technician finds that the job differs from what was described, extra work or parts need your approval first. The approved quote is the price you pay unless you approve a change.",
          "إذا تبيّن للفني أن العمل يختلف عمّا وُصف، فأي عمل أو قطع إضافية تتطلب موافقتك المسبقة. العرض الذي وافقت عليه هو السعر الذي تدفعه ما لم توافق على تعديل.",
        ),
        t(
          "Prices are in US dollars unless the quote says otherwise. You pay as shown in the approved quote, at the time and by the method it states.",
          "الأسعار بالدولار الأميركي ما لم يذكر العرض خلاف ذلك. تدفع وفق ما ورد في العرض الموافق عليه، في الوقت وبالطريقة المحددين فيه.",
        ),
      ],
    },
    {
      title: t("4. Cancelling", "٤. الإلغاء"),
      paragraphs: [
        t(
          "You can cancel free of charge in the app until the visit is scheduled. After that, ask your specialist from the request page.",
          "يمكنك الإلغاء مجاناً عبر التطبيق إلى أن يُحدَّد موعد الزيارة. بعد ذلك اطلب الإلغاء من المختص عبر صفحة الطلب.",
        ),
        t(
          `A fixed visit fee of US$${FEE}, shown before you book, applies only if the technician comes and no repair goes ahead (no work is needed or you decide not to repair), if nobody is there to give access at the agreed time, or if you cancel after the technician has set off. Only a Be Right specialist can apply it, and you are told why. If the repair goes ahead, the visit fee is included in the approved price. Visits under the workmanship guarantee are always free.`,
          `يُطبَّق رسم زيارة ثابت قدره ${FEE} دولار أميركي، يظهر لك قبل الحجز، فقط إذا حضر الفني ولم يتمّ أي تصليح (لا حاجة لعمل أو قرّرت عدم التصليح)، أو إذا لم يكن أحد موجوداً لتأمين الدخول في الموعد المتفق عليه، أو إذا ألغيت بعد انطلاق الفني. لا يطبّقه إلا مختص من بي رايت، ويُبلَّغ لك السبب. وإذا تمّ التصليح، يكون رسم الزيارة مشمولاً في السعر الموافق عليه. زيارات ضمانة جودة العمل مجانية دائماً.`,
        ),
      ],
    },
    {
      title: t("5. Your part", "٥. ما يقع على عاتقك"),
      paragraphs: [
        t(
          "Give safe access at the agreed time and describe the problem honestly. Never take risks to provide photos: don't open electrical panels, climb, touch leaking electrical equipment or approach gas leaks. Treat technicians with respect; we may refuse service if their safety is at risk.",
          "أمّن وصولاً آمناً في الموعد المتفق عليه وصف المشكلة بصدق. لا تعرّض نفسك للخطر لالتقاط الصور: لا تفتح لوحات الكهرباء ولا تتسلّق ولا تلمس معدات كهربائية يتسرّب منها الماء ولا تقترب من تسرّب الغاز. عامل الفنيين باحترام؛ ويحق لنا رفض الخدمة إذا تعرّضت سلامتهم للخطر.",
        ),
      ],
    },
    {
      title: t("6. Our workmanship promise", "٦. ضمان جودة العمل"),
      paragraphs: [
        t(
          `If completed work isn't right, report it in the app within ${GUARANTEE_DAYS} days and we will come back to fix the same problem at no extra labour cost. This doesn't cover new faults, misuse, work done by others afterwards, or manufacturer defects in parts (which follow the supplier's warranty).`,
          `إذا لم يكن العمل المنجز على ما يرام، أبلغنا عبر التطبيق خلال ${arabicDays(GUARANTEE_DAYS)} وسنعود لإصلاح المشكلة نفسها دون كلفة يد عاملة إضافية. لا يشمل ذلك الأعطال الجديدة أو سوء الاستخدام أو أعمالاً قام بها غيرنا لاحقاً أو عيوب تصنيع القطع (التي تخضع لكفالة المورّد).`,
        ),
      ],
    },
    {
      title: t("7. Technicians", "٧. الفنيون"),
      paragraphs: [
        t(
          "Technicians are vetted and contracted by Be Right. Their own engagement is governed by a separate agreement with us. Technicians must use the app honestly, record arrival and progress, and only share their location while a job is active.",
          "يخضع الفنيون للتدقيق ويتعاقدون مع بي رايت، ويحكم عملهم اتفاق منفصل معنا. على الفنيين استخدام التطبيق بأمانة وتسجيل الوصول وسير العمل، ومشاركة موقعهم فقط أثناء تنفيذ المهمة.",
        ),
      ],
    },
    {
      title: t("8. Acceptable use", "٨. الاستخدام المقبول"),
      paragraphs: [
        t(
          "Don't misuse the service: no false bookings, no uploading content that isn't yours or is unlawful, no attempts to access other people's data or to disrupt the platform.",
          "لا تسئ استخدام الخدمة: لا حجوزات وهمية، ولا رفع محتوى لا يخصّك أو مخالف للقانون، ولا محاولات للوصول إلى بيانات الآخرين أو تعطيل المنصة.",
        ),
      ],
    },
    {
      title: t("9. Liability", "٩. المسؤولية"),
      paragraphs: [
        t(
          `We are responsible for doing the work with reasonable care and skill. To the extent ${COMPANY.governingLaw.en} allows, we are not liable for indirect losses, and our liability for a job is limited to the amount paid for it. Nothing here limits rights you have as a consumer under the law that applies to you.`,
          `نحن مسؤولون عن تنفيذ العمل بعناية ومهارة معقولتين. وبالقدر الذي يسمح به ${COMPANY.governingLaw.ar}، لا نتحمّل مسؤولية الخسائر غير المباشرة، وتقتصر مسؤوليتنا عن أي مهمة على المبلغ المدفوع لها. ولا يحدّ أي من ذلك من حقوقك كمستهلك بموجب القانون الذي يسري عليك.`,
        ),
      ],
    },
    {
      title: t("10. Changes, law and contact", "١٠. التعديلات والقانون والتواصل"),
      paragraphs: [
        t(
          `We may update these terms; we'll show the new date here and ask you to accept material changes. These terms are governed by ${COMPANY.governingLaw.en}, and ${COMPANY.courts.en} have jurisdiction.`,
          `قد نحدّث هذه الشروط؛ وسنعرض التاريخ الجديد هنا ونطلب موافقتك على التعديلات الجوهرية. تخضع هذه الشروط لـ${COMPANY.governingLaw.ar}، وتختص ${COMPANY.courts.ar} بالنظر في أي نزاع.`,
        ),
        t(
          `${COMPANY.legalName}, ${COMPANY.address}. Email: ${COMPANY.email}`,
          `${COMPANY.legalName}، ${COMPANY.address}. البريد الإلكتروني: ${COMPANY.email}`,
        ),
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: t("Privacy Policy", "سياسة الخصوصية"),
  intro: t(
    `This policy explains what personal data ${COMPANY.legalName} ("Be Right", "we") collects through ${COMPANY.website}, why, who sees it and your rights. We process personal data in line with ${COMPANY.dataProtectionLaw.en}.`,
    `توضح هذه السياسة البيانات الشخصية التي تجمعها ${COMPANY.legalName} ("بي رايت"، "نحن") عبر ${COMPANY.website}، وسبب جمعها، ومن يطّلع عليها، وحقوقك. نعالج البيانات الشخصية وفقاً لـ${COMPANY.dataProtectionLaw.ar}.`,
  ),
  sections: [
    {
      title: t("1. What we collect", "١. البيانات التي نجمعها"),
      paragraphs: [
        t(
          "Account: name, email, phone/WhatsApp number, and your password (stored only in hashed form by our authentication provider; we never see it).",
          "الحساب: الاسم والبريد الإلكتروني ورقم الهاتف/واتساب وكلمة المرور (تُخزَّن بشكل مشفّر لدى مزوّد المصادقة فقط؛ ولا نطّلع عليها أبداً).",
        ),
        t(
          "Bookings: the service, your answers to the guided questions, photos and videos you upload, photos the technician takes of the work area before and after the job, the visit address, map pin, preferred date and notes, the status history of each request, and any rating or comment you leave after a job.",
          "الحجوزات: الخدمة المطلوبة وأجوبتك على الأسئلة الموجّهة والصور والفيديوهات التي ترفعها، وصور مكان العمل التي يلتقطها الفني قبل المهمة وبعدها، وعنوان الزيارة وموقعه على الخريطة والتاريخ المفضل والملاحظات، وسجل حالة كل طلب، وأي تقييم أو تعليق تتركه بعد إنجاز المهمة.",
        ),
        t(
          "Emergency button: the service and what's wrong that you pick, whether you called or asked to be called back, and the name and phone number you give (optional when you call).",
          "زر الطوارئ: الخدمة وما حدث كما تختاره، وما إذا اتصلت أو طلبت معاودة الاتصال، والاسم ورقم الهاتف اللذان تقدّمهما (اختياريان عند الاتصال).",
        ),
        t(
          "Technician location: only while a job is active and only after the technician turns on location sharing; we keep the latest position for that job.",
          "موقع الفني: فقط أثناء تنفيذ المهمة وبعد أن يفعّل الفني مشاركة الموقع؛ ونحتفظ بآخر موقع لتلك المهمة فقط.",
        ),
        t(
          "Technician applicants: contact details, trade, experience, availability and transport, and the documents required for vetting: ID card or passport, criminal record, proof of address, a profile photo and, for those who work with a vehicle, its registration papers.",
          "المتقدّمون للعمل كفنيين: بيانات التواصل والمهنة والخبرة وأوقات العمل ووسيلة النقل، والمستندات المطلوبة للتدقيق: الهوية أو جواز السفر، والسجل الجنائي، وإثبات العنوان، وصورة شخصية، وأوراق تسجيل المركبة لمن يعمل بمركبة.",
        ),
        t(
          "On your device we store only what the site needs to work: your sign-in session, language choice and an unfinished booking draft. We don't use advertising or tracking cookies.",
          "نخزّن على جهازك فقط ما يلزم لعمل الموقع: جلسة تسجيل الدخول، واللغة المختارة، ومسودة الحجز غير المكتملة. لا نستخدم ملفات تعريف ارتباط إعلانية أو للتتبّع.",
        ),
      ],
    },
    {
      title: t("2. Why we use it", "٢. لماذا نستخدمها"),
      paragraphs: [
        t(
          "To provide the service you ask for (review, quote, dispatch, follow-up and support); to keep customers and technicians safe (vetting technicians, verifying identities); to communicate with you about your requests and account; and to meet legal and accounting obligations.",
          "لتقديم الخدمة التي تطلبها (المراجعة والتسعير والإرسال والمتابعة والدعم)؛ وللحفاظ على سلامة العملاء والفنيين (تدقيق الفنيين والتحقق من الهويات)؛ وللتواصل معك بشأن طلباتك وحسابك؛ وللوفاء بالالتزامات القانونية والمحاسبية.",
        ),
      ],
    },
    {
      title: t("3. Who sees it", "٣. من يطّلع عليها"),
      paragraphs: [
        t(
          "Be Right specialists see requests and applications to do their job. The technician assigned to your job sees your name, phone, address, map pin, answers and photos. You see your technician's name, photo and, while the job is active, their live location, and their average rating. Your rating counts towards that average without your name; your comment is read only by our team. Applicants' documents (ID, criminal record and proof of address) are seen only by our hiring team and are never shown to customers.",
          "يطّلع مختصو بي رايت على الطلبات وطلبات التوظيف لأداء عملهم. يرى الفني المعيّن لمهمتك اسمك وهاتفك وعنوانك وموقعك على الخريطة وأجوبتك وصورك. وترى أنت اسم الفني وصورته، وموقعه المباشر أثناء تنفيذ المهمة، ومتوسط تقييمه. يُحتسب تقييمك في هذا المتوسط دون اسمك، ولا يقرأ تعليقك إلا فريقنا. أما مستندات المتقدّمين (الهوية والسجل العدلي وإثبات السكن) فلا يطّلع عليها إلا فريق التوظيف ولا تُعرض على العملاء إطلاقاً.",
        ),
        t(
          "We use trusted providers to run the service: Supabase (database, sign-in and file storage, hosted in the EU – Frankfurt), Netlify (website hosting), Resend (account and request-update emails, EU), Cloudflare (our domain, and visit statistics without cookies or personal profiles) and a map provider, OpenStreetMap or MapTiler (map images, which receive your IP address when a map loads). They process data only on our instructions. We never sell your data.",
          "نستعين بمزوّدين موثوقين لتشغيل الخدمة: Supabase (قاعدة البيانات وتسجيل الدخول وتخزين الملفات، مستضافة في الاتحاد الأوروبي – فرانكفورت)، وNetlify (استضافة الموقع)، وResend (رسائل الحساب وتحديثات الطلبات، الاتحاد الأوروبي)، وCloudflare (نطاق الموقع، وإحصاءات الزيارات بدون ملفات تعريف ارتباط أو ملفات شخصية)، ومزوّد خرائط هو OpenStreetMap أو MapTiler (صور الخرائط، ويتلقى عنوان IP الخاص بك عند تحميل الخريطة). يعالج هؤلاء البيانات بناءً على تعليماتنا فقط. ولا نبيع بياناتك أبداً.",
        ),
        t(
          "Because some providers are in other countries, your data may be transferred abroad; we choose providers with appropriate security and contractual safeguards.",
          "بما أن بعض المزوّدين في بلدان أخرى، قد تُنقل بياناتك إلى الخارج؛ ونختار مزوّدين يوفّرون ضمانات أمنية وتعاقدية مناسبة.",
        ),
      ],
    },
    {
      title: t("4. How long we keep it", "٤. مدة الاحتفاظ بها"),
      paragraphs: [
        t(
          `Account and booking records: while your account is open and afterwards as long as needed for warranty, accounting and legal purposes. Emergency button entries: deleted after ${EMERGENCY_DAYS} days. Documents of rejected applicants: deleted within ${REJECT_DAYS} days. Documents of technicians who work with us: kept while they work with us and as required by law afterwards.`,
          `سجلات الحساب والحجوزات: طوال فترة فتح حسابك، وبعدها للمدة اللازمة لأغراض الضمان والمحاسبة والقانون. بيانات زر الطوارئ: تُحذف بعد ${EMERGENCY_DAYS} يوماً. مستندات المتقدّمين المرفوضين: تُحذف خلال ${REJECT_DAYS} يوماً. مستندات الفنيين العاملين معنا: يُحتفظ بها طوال فترة عملهم معنا وبعدها وفق ما يفرضه القانون.`,
        ),
      ],
    },
    {
      title: t("5. Security", "٥. الأمان"),
      paragraphs: [
        t(
          "Data is encrypted in transit; photos and documents are stored privately and opened only through short-lived links; access is limited by role. No system is perfectly secure, but we act promptly on any incident.",
          "تُشفَّر البيانات أثناء نقلها؛ وتُخزَّن الصور والمستندات بشكل خاص ولا تُفتح إلا عبر روابط قصيرة الصلاحية؛ والوصول محصور بحسب الدور. لا يوجد نظام آمن تماماً، لكننا نتعامل فوراً مع أي حادث.",
        ),
      ],
    },
    {
      title: t("6. Your rights", "٦. حقوقك"),
      paragraphs: [
        t(
          `You can correct your name, phone, email and password, or delete your account, yourself under "My account". Deleting it erases your contact details, addresses, notes and photos; we keep a record of past jobs (service, date and price) without your details, for warranty and accounting. For anything else, such as a copy of your data or objecting to its use, email ${COMPANY.privacyEmail}. Some data must be kept for legal reasons; if so, we'll tell you. You may also turn off location access on your device at any time.`,
          `يمكنك تصحيح اسمك وهاتفك وبريدك الإلكتروني وكلمة المرور، أو حذف حسابك، بنفسك من صفحة «حسابي». يؤدي حذف الحساب إلى محو بيانات التواصل والعناوين والملاحظات والصور؛ ونحتفظ بسجل المهام السابقة (الخدمة والتاريخ والسعر) دون بياناتك، لأغراض الضمان والمحاسبة. ولأي طلب آخر، مثل الحصول على نسخة من بياناتك أو الاعتراض على استخدامها، راسلنا على ${COMPANY.privacyEmail}. قد يتعيّن الاحتفاظ ببعض البيانات لأسباب قانونية؛ وفي هذه الحالة سنعلمك بذلك. ويمكنك أيضاً إيقاف الوصول إلى الموقع على جهازك في أي وقت.`,
        ),
      ],
    },
    {
      title: t("7. Changes and contact", "٧. التعديلات والتواصل"),
      paragraphs: [
        t(
          "The service is for people aged 18 and over. We may update this policy and will show the new date here.",
          "الخدمة مخصّصة لمن بلغوا ١٨ سنة وما فوق. قد نحدّث هذه السياسة وسنعرض التاريخ الجديد هنا.",
        ),
        t(
          `${COMPANY.legalName}, ${COMPANY.address}. Privacy questions: ${COMPANY.privacyEmail}`,
          `${COMPANY.legalName}، ${COMPANY.address}. أسئلة الخصوصية: ${COMPANY.privacyEmail}`,
        ),
      ],
    },
  ],
};
