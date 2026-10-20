// Shared domain model: service categories and their guided question trees.
// Used by both the booking flow (frontend) and request creation (backend).

import { arabicDigits, WORKMANSHIP_GUARANTEE_DAYS as GUARANTEE_DAYS } from "./legal";

export type Lang = "en" | "ar";


export type RequestStatus =
  | "submitted"
  | "in_review"
  | "quote_ready"
  | "approved"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export const STATUS_ORDER: RequestStatus[] = [
  "submitted",
  "in_review",
  "quote_ready",
  "approved",
  "scheduled",
  "in_progress",
  "completed",
];

export interface LocalText {
  en: string;
  ar: string;
}

export interface QuestionOption {
  value: string;
  label: LocalText;
}

export interface Question {
  id: string;
  kind: "choice" | "text";
  label: LocalText;
  hint?: LocalText;
  options?: QuestionOption[];
  /** show this question only when answers[when.id] === when.equals */
  when?: { id: string; equals: string };
}

export interface ServiceCategory {
  id: string;
  name: LocalText;
  blurb: LocalText;
  questions: Question[];
}

export const CATEGORIES: ServiceCategory[] = [
  {
    id: "plumbing",
    name: { en: "Plumbing", ar: "سباكة" },
    blurb: {
      en: "Leaks, blocked drains, faucets, toilets, pumps, heaters, water tanks and filters.",
      ar: "التسرّبات، وانسداد الصرف، والصنابير، والمراحيض، والمضخات، والسخانات، وخزانات وفلاتر المياه.",
    },
    questions: [
      {
        id: "problem",
        kind: "choice",
        label: { en: "What is happening?", ar: "ما المشكلة؟" },
        options: [
          { value: "leak", label: { en: "Water leak", ar: "تسرّب مياه" } },
          { value: "blocked", label: { en: "Blocked drain", ar: "انسداد الصرف" } },
          { value: "fixture", label: { en: "Faucet / toilet problem", ar: "مشكلة في الصنبور / المرحاض" } },
          { value: "pump", label: { en: "Water pump", ar: "مضخة مياه" } },
          { value: "heater", label: { en: "Water heater", ar: "سخّان مياه" } },
          { value: "tank_filter", label: { en: "Water tank & filter maintenance", ar: "صيانة خزان وفلتر المياه" } },
          { value: "other", label: { en: "Something else", ar: "شيء آخر" } },
        ],
      },
      {
        id: "location",
        kind: "choice",
        when: { id: "problem", equals: "leak" },
        label: { en: "Where is the leak?", ar: "أين التسرّب؟" },
        options: [
          { value: "kitchen", label: { en: "Kitchen", ar: "المطبخ" } },
          { value: "bathroom", label: { en: "Bathroom", ar: "الحمّام" } },
          { value: "tank", label: { en: "Water tank", ar: "خزان المياه" } },
          { value: "wall", label: { en: "Inside a wall", ar: "داخل الجدار" } },
          { value: "outside", label: { en: "Outside", ar: "في الخارج" } },
        ],
      },
      {
        id: "flow",
        kind: "choice",
        when: { id: "problem", equals: "leak" },
        label: { en: "How much water?", ar: "ما كمية المياه؟" },
        options: [
          { value: "drops", label: { en: "Drops", ar: "قطرات" } },
          { value: "continuous", label: { en: "Continuous trickle", ar: "تسرّب متواصل" } },
          { value: "large", label: { en: "Large flow", ar: "تدفّق قوي" } },
        ],
      },
      {
        id: "canStop",
        kind: "choice",
        when: { id: "problem", equals: "leak" },
        label: { en: "Can you stop the water?", ar: "هل يمكنك إيقاف المياه؟" },
        options: [
          { value: "yes", label: { en: "Yes", ar: "نعم" } },
          { value: "no", label: { en: "No", ar: "لا" } },
          { value: "unknown", label: { en: "I don't know", ar: "لا أعرف" } },
        ],
      },
      {
        id: "sourceVisible",
        kind: "choice",
        when: { id: "problem", equals: "leak" },
        label: { en: "Can you see the source?", ar: "هل ترى مصدر التسرّب؟" },
        options: [
          { value: "yes", label: { en: "Yes", ar: "نعم" } },
          { value: "no", label: { en: "No", ar: "لا" } },
        ],
      },
    ],
  },
  {
    id: "electrical",
    name: { en: "Electrical", ar: "كهرباء" },
    blurb: {
      en: "Power faults, lights, sockets, switches and generators.",
      ar: "أعطال الكهرباء، والإنارة، والمقابس، والمفاتيح، والمولّدات.",
    },
    questions: [
      {
        id: "problem",
        kind: "choice",
        label: { en: "What is happening?", ar: "ما المشكلة؟" },
        options: [
          { value: "no_power", label: { en: "No power at all", ar: "لا توجد كهرباء إطلاقاً" } },
          { value: "partial", label: { en: "Power in some rooms", ar: "كهرباء في بعض الغرف فقط" } },
          { value: "lights", label: { en: "Lights issue", ar: "مشكلة في الإنارة" } },
          { value: "socket", label: { en: "Socket / switch", ar: "مقبس / مفتاح كهربائي" } },
          { value: "generator", label: { en: "Generator issue", ar: "مشكلة في المولّد" } },
          { value: "burning", label: { en: "Burning smell or sparks", ar: "رائحة احتراق أو شرر" } },
        ],
      },
      {
        id: "scope",
        kind: "choice",
        label: { en: "How much of the home is affected?", ar: "ما الجزء المتأثر من المنزل؟" },
        options: [
          { value: "single", label: { en: "One spot / room", ar: "نقطة واحدة / غرفة واحدة" } },
          { value: "whole", label: { en: "Whole home", ar: "المنزل بالكامل" } },
        ],
      },
      {
        id: "exposed",
        kind: "choice",
        label: { en: "Any exposed or damaged wiring?", ar: "هل توجد أسلاك مكشوفة أو تالفة؟" },
        hint: {
          en: "Do not touch or open anything. Just tell us what you see.",
          ar: "لا تلمس أو تفتح أي شيء. فقط أخبرنا بما تراه.",
        },
        options: [
          { value: "yes", label: { en: "Yes", ar: "نعم" } },
          { value: "no", label: { en: "No", ar: "لا" } },
          { value: "unknown", label: { en: "Not sure", ar: "غير متأكد" } },
        ],
      },
    ],
  },
  {
    id: "ac",
    name: { en: "Air conditioning", ar: "تكييف" },
    blurb: {
      en: "Cleaning, servicing, installation and repairs.",
      ar: "التنظيف والصيانة والتركيب والإصلاح.",
    },
    questions: [
      {
        id: "service",
        kind: "choice",
        label: { en: "What do you need?", ar: "ماذا تحتاج؟" },
        options: [
          { value: "cleaning", label: { en: "Cleaning / servicing", ar: "تنظيف / صيانة" } },
          { value: "not_cooling", label: { en: "Not cooling well", ar: "لا يبرّد جيداً" } },
          { value: "leaking", label: { en: "Water leaking from unit", ar: "يسرّب الماء" } },
          { value: "noise", label: { en: "Strange noise", ar: "صوت غريب" } },
          { value: "install", label: { en: "New installation", ar: "تركيب جديد" } },
          { value: "other", label: { en: "Something else", ar: "شيء آخر" } },
        ],
      },
      {
        id: "unitType",
        kind: "choice",
        label: { en: "Which type of unit?", ar: "ما نوع جهاز التكييف؟" },
        options: [
          { value: "split", label: { en: "Split", ar: "سبليت (منفصل)" } },
          { value: "window", label: { en: "Window unit", ar: "نافذة" } },
          { value: "central", label: { en: "Central", ar: "مركزي" } },
          { value: "portable", label: { en: "Portable", ar: "متنقل" } },
        ],
      },
      {
        id: "units",
        kind: "choice",
        label: { en: "How many units?", ar: "كم عدد الأجهزة؟" },
        options: [
          { value: "1", label: { en: "1", ar: "١" } },
          { value: "2", label: { en: "2", ar: "٢" } },
          { value: "3+", label: { en: "3 or more", ar: "٣ أو أكثر" } },
        ],
      },
    ],
  },
  {
    id: "carpentry",
    name: { en: "Carpentry", ar: "نجارة" },
    blurb: {
      en: "Doors, cabinets, shelves and furniture repair.",
      ar: "الأبواب والخزائن والرفوف وإصلاح الأثاث.",
    },
    questions: [
      {
        id: "item",
        kind: "choice",
        label: { en: "What needs work?", ar: "ما الذي يحتاج إلى عمل؟" },
        options: [
          { value: "door", label: { en: "Door", ar: "باب" } },
          { value: "cabinet", label: { en: "Cabinet / wardrobe", ar: "خزانة" } },
          { value: "shelves", label: { en: "Shelves", ar: "رفوف" } },
          { value: "furniture", label: { en: "Furniture repair", ar: "إصلاح أثاث" } },
          { value: "other", label: { en: "Something else", ar: "شيء آخر" } },
        ],
      },
      {
        id: "workType",
        kind: "choice",
        label: { en: "Repair or new work?", ar: "إصلاح أم عمل جديد؟" },
        options: [
          { value: "repair", label: { en: "Repair", ar: "إصلاح" } },
          { value: "new", label: { en: "New / custom work", ar: "عمل جديد / حسب الطلب" } },
        ],
      },
    ],
  },
  {
    id: "painting",
    name: { en: "Painting & repairs", ar: "دهان وإصلاحات" },
    blurb: {
      en: "Interior painting, wall repair and minor tiling.",
      ar: "الدهان الداخلي، وإصلاح الجدران، وأعمال البلاط البسيطة.",
    },
    questions: [
      {
        id: "scope",
        kind: "choice",
        label: { en: "How big is the job?", ar: "ما حجم العمل؟" },
        options: [
          { value: "wall", label: { en: "One wall / small repair", ar: "جدار واحد / إصلاح صغير" } },
          { value: "room", label: { en: "One room", ar: "غرفة واحدة" } },
          { value: "home", label: { en: "Whole home", ar: "المنزل بالكامل" } },
        ],
      },
      {
        id: "state",
        kind: "choice",
        label: { en: "What condition are the walls in?", ar: "ما حالة الجدران؟" },
        options: [
          { value: "good", label: { en: "Good, just repaint", ar: "جيدة، إعادة دهان فقط" } },
          { value: "cracks", label: { en: "Cracks / peeling", ar: "تشققات / تقشّر" } },
          { value: "stains", label: { en: "Stains / humidity", ar: "بقع / رطوبة" } },
        ],
      },
    ],
  },
  {
    id: "cleaning",
    name: { en: "Cleaning", ar: "تنظيف" },
    blurb: {
      en: "Home, office, deep and post-construction cleaning.",
      ar: "تنظيف المنازل والمكاتب، والتنظيف العميق، والتنظيف بعد البناء.",
    },
    questions: [
      {
        id: "type",
        kind: "choice",
        label: { en: "What kind of cleaning?", ar: "ما نوع التنظيف؟" },
        options: [
          { value: "home", label: { en: "Home cleaning", ar: "تنظيف منزل" } },
          { value: "office", label: { en: "Office cleaning", ar: "تنظيف مكتب" } },
          { value: "deep", label: { en: "Deep cleaning", ar: "تنظيف عميق" } },
          { value: "post_construction", label: { en: "Post-construction", ar: "بعد البناء" } },
        ],
      },
      {
        id: "size",
        kind: "choice",
        label: { en: "How big is the place?", ar: "ما مساحة المكان؟" },
        options: [
          { value: "studio", label: { en: "Studio / 1 bedroom", ar: "استوديو / غرفة نوم واحدة" } },
          { value: "2br", label: { en: "2 bedrooms", ar: "غرفتا نوم" } },
          { value: "3br", label: { en: "3 bedrooms", ar: "٣ غرف نوم" } },
          { value: "large", label: { en: "Larger / office", ar: "أكبر / مكتب" } },
        ],
      },
      {
        id: "frequency",
        kind: "choice",
        label: { en: "One-time or recurring?", ar: "مرة واحدة أم بشكل دوري؟" },
        options: [
          { value: "once", label: { en: "One-time", ar: "مرة واحدة" } },
          { value: "weekly", label: { en: "Weekly", ar: "أسبوعي" } },
          { value: "monthly", label: { en: "Monthly", ar: "شهري" } },
        ],
      },
    ],
  },
  {
    id: "porter",
    name: { en: "Porter", ar: "حمل ونقل" },
    blurb: {
      en: "Carrying, moving assistance and building support.",
      ar: "الحمل، والمساعدة في النقل، ودعم المباني.",
    },
    questions: [
      {
        id: "help",
        kind: "choice",
        label: { en: "What do you need?", ar: "ماذا تحتاج؟" },
        options: [
          { value: "carrying", label: { en: "Carrying heavy items", ar: "حمل أغراض ثقيلة" } },
          { value: "moving", label: { en: "Moving assistance", ar: "المساعدة في النقل" } },
          { value: "building", label: { en: "Building support shift", ar: "مناوبة دعم للمبنى" } },
        ],
      },
      {
        id: "duration",
        kind: "choice",
        label: { en: "For how long?", ar: "لأي مدة؟" },
        options: [
          { value: "hours", label: { en: "A few hours", ar: "بضع ساعات" } },
          { value: "day", label: { en: "Full day", ar: "يوم كامل" } },
          { value: "days", label: { en: "Several days", ar: "عدة أيام" } },
        ],
      },
      {
        id: "floors",
        kind: "choice",
        label: { en: "Stairs or elevator?", ar: "درج أم مصعد؟" },
        options: [
          { value: "elevator", label: { en: "Elevator available", ar: "يوجد مصعد" } },
          { value: "stairs_low", label: { en: "Stairs, up to 2 floors", ar: "درج، حتى طابقين" } },
          { value: "stairs_high", label: { en: "Stairs, 3+ floors", ar: "درج، ٣ طوابق أو أكثر" } },
        ],
      },
    ],
  },
  {
    id: "valet",
    name: { en: "Valet & event staff", ar: "طاقم مناسبات وصفّ سيارات" },
    blurb: {
      en: "Staff for restaurants, venues and events.",
      ar: "طاقم للمطاعم والقاعات والمناسبات.",
    },
    questions: [
      {
        id: "venue",
        kind: "choice",
        label: { en: "Where is the job?", ar: "أين العمل؟" },
        options: [
          { value: "restaurant", label: { en: "Restaurant", ar: "مطعم" } },
          { value: "event", label: { en: "Private event", ar: "مناسبة خاصة" } },
          { value: "venue", label: { en: "Venue / hotel", ar: "قاعة / فندق" } },
        ],
      },
      {
        id: "teamSize",
        kind: "choice",
        label: { en: "How many staff?", ar: "كم عدد الموظفين؟" },
        options: [
          { value: "1-2", label: { en: "1–2", ar: "١–٢" } },
          { value: "3-5", label: { en: "3–5", ar: "٣–٥" } },
          { value: "6+", label: { en: "6 or more", ar: "٦ أو أكتر" } },
        ],
      },
      {
        id: "shift",
        kind: "choice",
        label: { en: "Which shift?", ar: "أي مناوبة؟" },
        options: [
          { value: "day", label: { en: "Daytime", ar: "نهاري" } },
          { value: "evening", label: { en: "Evening", ar: "مسائي" } },
          { value: "fullday", label: { en: "Full day", ar: "يوم كامل" } },
        ],
      },
    ],
  },
  {
    id: "security",
    name: { en: "Guard", ar: "حراسة" },
    blurb: {
      en: "Guards for buildings, sites and events.",
      ar: "حراسة المباني ومواقع البناء والمناسبات.",
    },
    questions: [
      {
        id: "site",
        kind: "choice",
        label: { en: "What needs guarding?", ar: "ما الذي يحتاج إلى حراسة؟" },
        options: [
          { value: "building", label: { en: "Residential building", ar: "مبنى سكني" } },
          { value: "site", label: { en: "Construction site", ar: "ورشة بناء" } },
          { value: "event", label: { en: "Event", ar: "مناسبة" } },
        ],
      },
      {
        id: "shift",
        kind: "choice",
        label: { en: "Which hours?", ar: "أي ساعات؟" },
        options: [
          { value: "day", label: { en: "Day shift", ar: "مناوبة نهارية" } },
          { value: "night", label: { en: "Night shift", ar: "مناوبة ليلية" } },
          { value: "24h", label: { en: "24 hours", ar: "٢٤ ساعة" } },
        ],
      },
      {
        id: "guards",
        kind: "choice",
        label: { en: "How many guards?", ar: "كم عدد الحراس؟" },
        options: [
          { value: "1", label: { en: "1", ar: "١" } },
          { value: "2", label: { en: "2", ar: "٢" } },
          { value: "3+", label: { en: "3 or more", ar: "٣ أو أكثر" } },
        ],
      },
    ],
  },
  {
    id: "landscaping",
    name: { en: "Landscaping", ar: "تنسيق حدائق" },
    blurb: {
      en: "Gardens, irrigation, tree trimming, fences and outdoor care.",
      ar: "الحدائق، والري، وتقليم الأشجار، والأسوار، والعناية بالمساحات الخارجية.",
    },
    questions: [
      {
        id: "work",
        kind: "choice",
        label: { en: "What do you need?", ar: "ماذا تحتاج؟" },
        options: [
          { value: "design", label: { en: "New garden / redesign", ar: "حديقة جديدة / إعادة تصميم" } },
          { value: "maintenance", label: { en: "Regular maintenance", ar: "صيانة دورية" } },
          { value: "trimming", label: { en: "Tree / hedge trimming", ar: "تقليم الأشجار / السياجات النباتية" } },
          { value: "irrigation", label: { en: "Irrigation system", ar: "نظام ري" } },
          { value: "fence", label: { en: "Fence / pergola / stonework", ar: "سور / عريشة / أعمال حجرية" } },
          { value: "cleanup", label: { en: "Cleanup / overgrowth removal", ar: "تنظيف / إزالة النباتات المتكاثفة" } },
          { value: "other", label: { en: "Something else", ar: "شيء آخر" } },
        ],
      },
      {
        id: "space",
        kind: "choice",
        label: { en: "How big is the space?", ar: "ما حجم المساحة؟" },
        options: [
          { value: "balcony", label: { en: "Balcony / rooftop", ar: "شرفة / سطح" } },
          { value: "small", label: { en: "Small garden (up to 100 m²)", ar: "حديقة صغيرة (حتى ١٠٠ م²)" } },
          { value: "medium", label: { en: "Medium (100–300 m²)", ar: "متوسطة (١٠٠–٣٠٠ م²)" } },
          { value: "large", label: { en: "Large / villa / commercial", ar: "كبيرة / فيلا / تجاري" } },
        ],
      },
      {
        id: "heightRisk",
        kind: "choice",
        when: { id: "work", equals: "trimming" },
        label: {
          en: "Any tall trees near power lines or buildings?",
          ar: "هل توجد أشجار عالية قرب خطوط الكهرباء أو المباني؟",
        },
        hint: {
          en: "Stay clear of the area. Just tell us what you see.",
          ar: "ابتعد عن المنطقة. فقط أخبرنا بما تراه.",
        },
        options: [
          { value: "no", label: { en: "No", ar: "لا" } },
          { value: "tall", label: { en: "Tall trees, clear area", ar: "أشجار عالية، والمنطقة خالية" } },
          { value: "near_lines", label: { en: "Yes, near power lines / buildings", ar: "نعم، قرب خطوط الكهرباء / المباني" } },
        ],
      },
      {
        id: "water",
        kind: "choice",
        when: { id: "work", equals: "irrigation" },
        label: { en: "Is there a water source on site?", ar: "هل يوجد مصدر مياه في الموقع؟" },
        options: [
          { value: "tap", label: { en: "Yes, outdoor tap", ar: "نعم، صنبور خارجي" } },
          { value: "tank", label: { en: "Tank / pump only", ar: "خزان / مضخة فقط" } },
          { value: "none", label: { en: "No source yet", ar: "لا يوجد بعد" } },
        ],
      },
      {
        id: "frequency",
        kind: "choice",
        when: { id: "work", equals: "maintenance" },
        label: { en: "How often?", ar: "كم مرة؟" },
        options: [
          { value: "once", label: { en: "One-time visit", ar: "زيارة واحدة" } },
          { value: "monthly", label: { en: "Monthly", ar: "شهري" } },
          { value: "weekly", label: { en: "Weekly", ar: "أسبوعي" } },
        ],
      },
    ],
  },
  {
    id: "appliance",
    name: { en: "Appliance repair", ar: "إصلاح أجهزة" },
    blurb: {
      en: "Washers, fridges, ovens and household appliances.",
      ar: "الغسالات والثلاجات والأفران والأجهزة المنزلية.",
    },
    questions: [
      {
        id: "appliance",
        kind: "choice",
        label: { en: "Which appliance?", ar: "أي جهاز؟" },
        options: [
          { value: "washer", label: { en: "Washing machine", ar: "غسالة" } },
          { value: "fridge", label: { en: "Fridge / freezer", ar: "ثلاجة / مجمّد" } },
          { value: "oven", label: { en: "Oven / cooker", ar: "فرن / موقد" } },
          { value: "dishwasher", label: { en: "Dishwasher", ar: "غسالة صحون" } },
          { value: "other", label: { en: "Other", ar: "غير ذلك" } },
        ],
      },
      {
        id: "symptom",
        kind: "choice",
        label: { en: "What is it doing?", ar: "ما الذي يحدث؟" },
        options: [
          { value: "dead", label: { en: "No power at all", ar: "لا يعمل إطلاقاً" } },
          { value: "not_working", label: { en: "Runs but not working right", ar: "يعمل لكن ليس بشكل صحيح" } },
          { value: "leak", label: { en: "Leaking water", ar: "يسرّب الماء" } },
          { value: "noise", label: { en: "Loud / strange noise", ar: "صوت عالٍ / غريب" } },
          { value: "smell", label: { en: "Burning smell", ar: "رائحة احتراق" } },
        ],
      },
    ],
  },
  {
    id: "waterproofing",
    name: { en: "Waterproofing", ar: "عزل مائي" },
    blurb: {
      en: "Roofs, bathrooms, damp walls, basements and water tanks.",
      ar: "الأسطح، والحمّامات، ورطوبة الجدران، والأقبية، وخزانات المياه.",
    },
    questions: [
      {
        id: "area",
        kind: "choice",
        label: { en: "Where is the problem?", ar: "أين المشكلة؟" },
        options: [
          { value: "roof", label: { en: "Roof", ar: "سطح" } },
          { value: "bathroom", label: { en: "Bathroom", ar: "الحمّام" } },
          { value: "walls", label: { en: "Damp walls", ar: "رطوبة في الجدران" } },
          { value: "basement", label: { en: "Basement", ar: "قبو" } },
          { value: "balcony", label: { en: "Balcony", ar: "شرفة" } },
          { value: "tank", label: { en: "Water tank", ar: "خزان مياه" } },
        ],
      },
      {
        id: "state",
        kind: "choice",
        label: { en: "What do you see now?", ar: "ماذا ترى الآن؟" },
        options: [
          { value: "leaking", label: { en: "Water coming in now", ar: "تتسرّب المياه الآن" } },
          { value: "damp", label: { en: "Damp or stains", ar: "رطوبة أو بقع" } },
          { value: "prevent", label: { en: "Prevention before winter", ar: "وقاية قبل الشتاء" } },
        ],
      },
      {
        id: "size",
        kind: "choice",
        label: { en: "How big is the area?", ar: "ما حجم المساحة؟" },
        options: [
          { value: "small", label: { en: "Under 20 m²", ar: "أقل من ٢٠ م²" } },
          { value: "medium", label: { en: "20 to 100 m²", ar: "من ٢٠ إلى ١٠٠ م²" } },
          { value: "large", label: { en: "Over 100 m²", ar: "أكثر من ١٠٠ م²" } },
        ],
      },
    ],
  },
  {
    id: "installation",
    name: { en: "Installation & assembly", ar: "تركيب وتجميع" },
    blurb: {
      en: "Furniture assembly, TV mounting, curtains and blinds, shelves and mirrors.",
      ar: "تجميع الأثاث، وتثبيت التلفزيون، والستائر والمظلات، والرفوف والمرايا.",
    },
    questions: [
      {
        id: "item",
        kind: "choice",
        label: { en: "What needs installing?", ar: "ما الذي يحتاج إلى تركيب؟" },
        options: [
          { value: "furniture", label: { en: "Furniture assembly", ar: "تجميع أثاث" } },
          { value: "tv", label: { en: "TV mounting", ar: "تثبيت التلفزيون" } },
          { value: "curtains", label: { en: "Curtains and blinds", ar: "ستائر ومظلات" } },
          { value: "shelves", label: { en: "Shelves and mirrors", ar: "رفوف ومرايا" } },
          { value: "other", label: { en: "Something else", ar: "شيء آخر" } },
        ],
      },
      {
        id: "count",
        kind: "choice",
        label: { en: "How many items?", ar: "كم عدد القطع؟" },
        options: [
          { value: "1", label: { en: "1", ar: "١" } },
          { value: "2-3", label: { en: "2 or 3", ar: "٢ أو ٣" } },
          { value: "4+", label: { en: "4 or more", ar: "٤ أو أكثر" } },
        ],
      },
      {
        id: "parts",
        kind: "choice",
        label: { en: "Do you have the parts and fixings?", ar: "هل لديك القطع ومواد التثبيت؟" },
        options: [
          { value: "yes", label: { en: "Yes, everything", ar: "نعم، كل شيء" } },
          { value: "no", label: { en: "No, bring them", ar: "لا، أحضروها معكم" } },
          { value: "unknown", label: { en: "Not sure", ar: "غير متأكد" } },
        ],
      },
    ],
  },
  {
    id: "locksmith",
    name: { en: "Locksmith", ar: "أقفال ومفاتيح" },
    blurb: {
      en: "Lockouts, locks and keys for homes, businesses and cars.",
      ar: "الأبواب المقفلة، والأقفال والمفاتيح للمنازل والمحلات والسيارات.",
    },
    questions: [
      {
        id: "need",
        kind: "choice",
        label: { en: "What do you need?", ar: "ماذا تحتاج؟" },
        options: [
          { value: "home_lockout", label: { en: "Locked out of home or office", ar: "الباب مقفل وأنا خارج المنزل أو المكتب" } },
          { value: "car_lockout", label: { en: "Locked out of my car", ar: "سيارتي مقفلة والمفتاح بداخلها" } },
          { value: "lock_change", label: { en: "Change or repair a lock", ar: "تغيير أو إصلاح قفل" } },
          { value: "key_copy", label: { en: "New key or copy", ar: "مفتاح جديد أو نسخة" } },
          { value: "car_key", label: { en: "Car key or remote programming", ar: "برمجة مفتاح أو جهاز تحكم السيارة" } },
          { value: "safe", label: { en: "Safe", ar: "خزنة" } },
        ],
      },
      {
        id: "inside",
        kind: "choice",
        label: { en: "Is anyone stuck inside?", ar: "هل هناك أحد عالق في الداخل؟" },
        hint: {
          en: "A child or someone vulnerable stuck inside a car or a home is an emergency: call your local emergency number first.",
          ar: "إذا كان طفل أو شخص بحاجة إلى مساعدة عالقاً داخل سيارة أو منزل، فهذه حالة طوارئ: اتصل برقم الطوارئ المحلي أولاً.",
        },
        options: [
          { value: "no", label: { en: "No", ar: "لا" } },
          { value: "yes", label: { en: "Yes", ar: "نعم" } },
        ],
      },
    ],
  },
  {
    id: "cameras",
    name: { en: "Cameras & alarms", ar: "كاميرات وأنظمة إنذار" },
    blurb: {
      en: "Security cameras, alarm systems and intercoms: installation and repair.",
      ar: "كاميرات المراقبة وأنظمة الإنذار وأجهزة الاتصال الداخلي: تركيب وإصلاح.",
    },
    questions: [
      {
        id: "system",
        kind: "choice",
        label: { en: "Which system?", ar: "أي نظام؟" },
        options: [
          { value: "cameras", label: { en: "Security cameras", ar: "كاميرات مراقبة" } },
          { value: "alarm", label: { en: "Alarm system", ar: "نظام إنذار" } },
          { value: "intercom", label: { en: "Intercom or video doorbell", ar: "اتصال داخلي أو جرس باب بكاميرا" } },
          { value: "other", label: { en: "Something else", ar: "شيء آخر" } },
        ],
      },
      {
        id: "need",
        kind: "choice",
        label: { en: "What do you need?", ar: "ماذا تحتاج؟" },
        options: [
          { value: "install", label: { en: "New installation", ar: "تركيب جديد" } },
          { value: "repair", label: { en: "Not working, repair", ar: "لا يعمل، إصلاح" } },
          { value: "extend", label: { en: "Add to my system", ar: "إضافة إلى نظامي" } },
          { value: "phone", label: { en: "View it on my phone", ar: "عرضه على هاتفي" } },
        ],
      },
      {
        id: "points",
        kind: "choice",
        label: { en: "How many cameras or sensors?", ar: "كم عدد الكاميرات أو أجهزة الاستشعار؟" },
        options: [
          { value: "1-4", label: { en: "1 to 4", ar: "من ١ إلى ٤" } },
          { value: "5-8", label: { en: "5 to 8", ar: "من ٥ إلى ٨" } },
          { value: "9+", label: { en: "9 or more", ar: "٩ أو أكثر" } },
        ],
      },
    ],
  },
  {
    id: "pest",
    name: { en: "Pest control", ar: "مكافحة آفات" },
    blurb: {
      en: "Cockroaches, ants, mice and rats, bed bugs and termites.",
      ar: "الصراصير، والنمل، والفئران والجرذان، وبق الفراش، والنمل الأبيض.",
    },
    questions: [
      {
        id: "pest",
        kind: "choice",
        label: { en: "What is the problem?", ar: "ما المشكلة؟" },
        options: [
          { value: "cockroaches", label: { en: "Cockroaches", ar: "صراصير" } },
          { value: "ants", label: { en: "Ants", ar: "نمل" } },
          { value: "rodents", label: { en: "Mice or rats", ar: "فئران أو جرذان" } },
          { value: "bedbugs", label: { en: "Bed bugs", ar: "بق الفراش" } },
          { value: "termites", label: { en: "Termites", ar: "نمل أبيض" } },
          { value: "other", label: { en: "Something else", ar: "شيء آخر" } },
        ],
      },
      {
        id: "place",
        kind: "choice",
        label: { en: "Where?", ar: "أين؟" },
        options: [
          { value: "home", label: { en: "Home", ar: "منزل" } },
          { value: "restaurant", label: { en: "Restaurant or kitchen", ar: "مطعم أو مطبخ" } },
          { value: "business", label: { en: "Office or shop", ar: "مكتب أو محل" } },
          { value: "building", label: { en: "Whole building", ar: "المبنى بالكامل" } },
        ],
      },
      {
        id: "level",
        kind: "choice",
        label: { en: "How often do you see them?", ar: "كم مرة تراها؟" },
        options: [
          { value: "sometimes", label: { en: "Now and then", ar: "من حين لآخر" } },
          { value: "daily", label: { en: "Every day", ar: "كل يوم" } },
        ],
      },
    ],
  },
  {
    id: "other",
    name: { en: "Other", ar: "أخرى" },
    blurb: { en: "Not on the list? Describe it and we find the right technician.", ar: "غير موجود في القائمة؟ صِفه ونجد الفنّي المناسب." },
    questions: [
      {
        id: "describe",
        kind: "text",
        label: { en: "What do you need?", ar: "ماذا تحتاج؟" },
        hint: {
          en: "Describe the problem or the service in a few words. A specialist finds the right technician.",
          ar: "صِف المشكلة أو الخدمة ببضع كلمات. يجد المختص الفنّي المناسب.",
        },
      },
    ],
  },
  {
    id: "other-facility",
    name: { en: "Other facility service", ar: "خدمة مرافق أخرى" },
    blurb: { en: "Another service for your place? Describe it and we arrange it.", ar: "خدمة أخرى لمكانك؟ صِفها ونتولّى تنظيمها." },
    questions: [
      {
        id: "describe",
        kind: "text",
        label: { en: "What do you need?", ar: "ماذا تحتاج؟" },
        hint: {
          en: "Describe the problem or the service in a few words. A specialist finds the right technician.",
          ar: "صِف المشكلة أو الخدمة ببضع كلمات. يجد المختص الفنّي المناسب.",
        },
      },
    ],
  },
];

export const CATEGORY_MAP: Record<string, ServiceCategory> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
);

// ---------- soft pastel tints per category (Urban-Company-style tiles) ----------

export const CATEGORY_TINT: Record<string, { bg: string; ink: string }> = {
  plumbing: { bg: "#E7F0FC", ink: "#0B63CE" },
  electrical: { bg: "#FBF1DC", ink: "#A8740F" },
  ac: { bg: "#E3F4F8", ink: "#0E7C9C" },
  carpentry: { bg: "#F4EBDF", ink: "#8A6234" },
  painting: { bg: "#F0EBFA", ink: "#6C4FC4" },
  cleaning: { bg: "#E5F4ED", ink: "#1F7A55" },
  porter: { bg: "#ECEFF4", ink: "#4A5A75" },
  valet: { bg: "#EAEDFB", ink: "#3F55C0" },
  security: { bg: "#E6ECF6", ink: "#0C2B5C" },
  landscaping: { bg: "#E9F4E4", ink: "#3F7A2E" },
  appliance: { bg: "#F9EBEF", ink: "#B0405F" },
  waterproofing: { bg: "#E2EFF6", ink: "#1C6E93" },
  installation: { bg: "#FCEEE3", ink: "#B4521A" },
  locksmith: { bg: "#F6F0D9", ink: "#86680F" },
  cameras: { bg: "#E9EAF3", ink: "#3A4270" },
  pest: { bg: "#EDF3E0", ink: "#55701F" },
  other: { bg: "#ECEFF4", ink: "#0C2B5C" },
  "other-facility": { bg: "#ECEFF4", ink: "#0C2B5C" },
};

// ---------- the Be Right Guarantee ----------

export const GUARANTEE_POINTS: LocalText[] = [
  {
    en: "Every job is documented with photos before and after, and a specialist reviews the result.",
    ar: "يُوثَّق كل عمل بصور قبل وبعد، ويراجع مختص النتيجة.",
  },
  {
    en: `If something isn't right within ${GUARANTEE_DAYS} days, report it from your requests page and the revisit is free.`,
    ar: `إذا لم يكن شيء ما على ما يرام خلال ${arabicDigits(GUARANTEE_DAYS)} أيام، أبلغ عنه من صفحة طلباتك وتكون زيارة المتابعة مجانية.`,
  },
  {
    en: "The price you approved is the price you pay. Extra work only happens after your approval.",
    ar: "السعر الذي وافقت عليه هو ما تدفعه. لا يُنفَّذ أي عمل إضافي إلا بعد موافقتك.",
  },
  {
    en: "Only technicians we've met in person and approved before their first job.",
    ar: "فقط فنيون قابلناهم شخصياً واعتمدناهم قبل أول مهمة لهم.",
  },
];

// ---------- coverage areas ----------

// Where we work: anywhere, confirmed per request.
export const COVERAGE_NOTE: LocalText = {
  en: "We're growing city by city. Book with your address and a specialist confirms, before you approve anything, that an approved technician near you can come.",
  ar: "نتوسّع مدينة بعد مدينة. احجز بعنوانك، ويؤكّد مختص قبل أن توافق على أي شيء أن فنّياً معتمداً قريباً منك يستطيع الحضور.",
};

// ---------- trades and facility services ----------

/** Repair and installation trades, in the order shown everywhere. */
export const TRADE_SERVICES = [
  "plumbing",
  "electrical",
  "ac",
  "appliance",
  "carpentry",
  "painting",
  "waterproofing",
  "installation",
  "locksmith",
  "cameras",
];

/** Services for running a place, shown together under "Facility Services". */
export const FACILITY_SERVICES = ["cleaning", "security", "valet", "porter", "pest", "landscaping"];

export const FACILITY_GROUP: { name: LocalText; blurb: LocalText } = {
  name: { en: "Facility Services", ar: "خدمات المرافق" },
  blurb: {
    en: "Cleaning, guards, event staff, porters, pest control and landscaping for homes, buildings and businesses.",
    ar: "التنظيف والحراسة وطاقم المناسبات والحمّالون ومكافحة الآفات وتنسيق الحدائق للمنازل والمباني والشركات.",
  },
};

/** Every service: the trades first, then the facility services (the trades technicians apply for). */
export const SERVICES_IN_ORDER = [...TRADE_SERVICES, ...FACILITY_SERVICES];

/** "Other", at the end of each group: the customer describes what they need. */
export const OTHER_TRADE = "other";
export const OTHER_FACILITY = "other-facility";

/** What customers pick from: each group ends with its "Other". */
export const CUSTOMER_SERVICES = [...TRADE_SERVICES, OTHER_TRADE, ...FACILITY_SERVICES, OTHER_FACILITY];

// ---------- verified client list (owner-supplied) ----------
// Owner-supplied clients; logos collected from official brand sources.
export const CLIENTS: { name: string; logo: string; note: LocalText }[] = [
  { name: "Spinneys", logo: "/assets/clients/spinneys.png", note: { en: "Gray Mackenzie Retail SAL", ar: "غراي ماكنزي ريتيل ش.م.ل" } },
  { name: "Happy Supermarkets", logo: "/assets/clients/happy.png", note: { en: "Supermarkets", ar: "متاجر كبرى" } },
  { name: "Sky Gate", logo: "/assets/clients/sky-gate.png", note: { en: "Sky Gate Beirut", ar: "سكاي غيت بيروت" } },
  { name: "Noknok", logo: "/assets/clients/noknok.png", note: { en: "Grocery delivery", ar: "توصيل بقالة" } },
  { name: "GrabnGO", logo: "/assets/clients/grabngo.png", note: { en: "Convenience stores", ar: "متاجر صغيرة" } },
  { name: "Malik's", logo: "/assets/clients/maliks.png", note: { en: "Bookshops & stationery", ar: "مكتبات وقرطاسية" } },
  { name: "Tawfeer", logo: "/assets/clients/tawfeer.png", note: { en: "Supermarkets", ar: "متاجر كبرى" } },
  { name: "Beirut Duty Free", logo: "/assets/clients/beirut-duty-free.png", note: { en: "PAC SAL", ar: "باك ش.م.ل" } },
  { name: "Karout Mall", logo: "/assets/clients/teska.png", note: { en: "Teska", ar: "تيسكا" } },
];

