// Shared domain model: service categories, guided question trees, urgency engine.
// Used by both the booking flow (frontend) and request creation (backend).

import { arabicDigits, WORKMANSHIP_GUARANTEE_DAYS as GUARANTEE_DAYS } from "./legal";

export type Lang = "en" | "ar";

export type UrgencyLevel = "normal" | "priority" | "urgent" | "critical";

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
  /** urgency points added when picked */
  weight?: number;
  /** immediately flags a critical safety case */
  critical?: boolean;
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
    name: { en: "Plumbing", ar: "سنكري" },
    blurb: {
      en: "Leaks, blocked drains, faucets, toilets, pumps and heaters.",
      ar: "تسريب، انسداد مجاري، حنفيات، تواليت، مضخات وسخانات.",
    },
    questions: [
      {
        id: "problem",
        kind: "choice",
        label: { en: "What is happening?", ar: "شو المشكلة؟" },
        options: [
          { value: "leak", label: { en: "Water leak", ar: "تسريب مي" } },
          { value: "blocked", label: { en: "Blocked drain", ar: "مجاري مسكرة" }, weight: 1 },
          { value: "fixture", label: { en: "Faucet / toilet problem", ar: "مشكلة حنفية / تواليت" } },
          { value: "pump", label: { en: "Water pump", ar: "مضخة مي" } },
          { value: "heater", label: { en: "Water heater", ar: "سخان مي" } },
          { value: "other", label: { en: "Something else", ar: "شي تاني" } },
        ],
      },
      {
        id: "location",
        kind: "choice",
        when: { id: "problem", equals: "leak" },
        label: { en: "Where is the leak?", ar: "وين التسريب؟" },
        options: [
          { value: "kitchen", label: { en: "Kitchen", ar: "مطبخ" } },
          { value: "bathroom", label: { en: "Bathroom", ar: "حمام" } },
          { value: "tank", label: { en: "Water tank", ar: "خزان" } },
          { value: "wall", label: { en: "Inside a wall", ar: "جوّا الحيط" }, weight: 1 },
          { value: "outside", label: { en: "Outside", ar: "برّا" } },
        ],
      },
      {
        id: "flow",
        kind: "choice",
        when: { id: "problem", equals: "leak" },
        label: { en: "How much water?", ar: "قديه في مي؟" },
        options: [
          { value: "drops", label: { en: "Drops", ar: "نقاط" } },
          { value: "continuous", label: { en: "Continuous trickle", ar: "تسريب متواصل" }, weight: 2 },
          { value: "large", label: { en: "Large flow", ar: "المي عم تنزل بقوة" }, weight: 3 },
        ],
      },
      {
        id: "canStop",
        kind: "choice",
        when: { id: "problem", equals: "leak" },
        label: { en: "Can you stop the water?", ar: "فيك تسكّر المي؟" },
        options: [
          { value: "yes", label: { en: "Yes", ar: "إيه" } },
          { value: "no", label: { en: "No", ar: "لا" }, weight: 3 },
          { value: "unknown", label: { en: "I don't know", ar: "ما بعرف" }, weight: 1 },
        ],
      },
      {
        id: "sourceVisible",
        kind: "choice",
        when: { id: "problem", equals: "leak" },
        label: { en: "Can you see the source?", ar: "شايف مصدر التسريب؟" },
        options: [
          { value: "yes", label: { en: "Yes", ar: "إيه" } },
          { value: "no", label: { en: "No", ar: "لا" }, weight: 1 },
        ],
      },
    ],
  },
  {
    id: "electrical",
    name: { en: "Electrical", ar: "كهرباء" },
    blurb: {
      en: "Power faults, lights, sockets, switches and generators.",
      ar: "أعطال كهربا، إنارة، فيشات، مفاتيح ومولدات.",
    },
    questions: [
      {
        id: "problem",
        kind: "choice",
        label: { en: "What is happening?", ar: "شو المشكلة؟" },
        options: [
          { value: "no_power", label: { en: "No power at all", ar: "ما في كهربا أبداً" }, weight: 1 },
          { value: "partial", label: { en: "Power in some rooms", ar: "كهربا ببعض الغرف" } },
          { value: "lights", label: { en: "Lights issue", ar: "مشكلة إنارة" } },
          { value: "socket", label: { en: "Socket / switch", ar: "فيش / مفتاح" } },
          { value: "generator", label: { en: "Generator issue", ar: "مشكلة مولد" }, weight: 1 },
          {
            value: "burning",
            label: { en: "Burning smell or sparks", ar: "ريحة حريق أو شرر" },
            critical: true,
          },
        ],
      },
      {
        id: "scope",
        kind: "choice",
        label: { en: "How much of the home is affected?", ar: "قديه من البيت متأثر؟" },
        options: [
          { value: "single", label: { en: "One spot / room", ar: "نقطة / غرفة وحدة" } },
          { value: "whole", label: { en: "Whole home", ar: "كل البيت" }, weight: 1 },
        ],
      },
      {
        id: "exposed",
        kind: "choice",
        label: { en: "Any exposed or damaged wiring?", ar: "في أسلاك مكشوفة أو متضررة؟" },
        hint: {
          en: "Do not touch or open anything. Just tell us what you see.",
          ar: "لا تلمس أو تفتح شي. بس خبرنا شو شايف.",
        },
        options: [
          { value: "yes", label: { en: "Yes", ar: "إيه" }, critical: true },
          { value: "no", label: { en: "No", ar: "لا" } },
          { value: "unknown", label: { en: "Not sure", ar: "مش متأكد" }, weight: 1 },
        ],
      },
    ],
  },
  {
    id: "ac",
    name: { en: "Air conditioning", ar: "مكيّف" },
    blurb: {
      en: "Cleaning, servicing, installation and repairs.",
      ar: "تنظيف، صيانة، تركيب وتصليح.",
    },
    questions: [
      {
        id: "service",
        kind: "choice",
        label: { en: "What do you need?", ar: "شو بدك؟" },
        options: [
          { value: "cleaning", label: { en: "Cleaning / servicing", ar: "تنظيف / صيانة" } },
          { value: "not_cooling", label: { en: "Not cooling well", ar: "ما عم يبرّد منيح" }, weight: 1 },
          { value: "leaking", label: { en: "Water leaking from unit", ar: "عم يقطّر مي" }, weight: 1 },
          { value: "noise", label: { en: "Strange noise", ar: "صوت غريب" } },
          { value: "install", label: { en: "New installation", ar: "تركيب جديد" } },
          { value: "other", label: { en: "Something else", ar: "شي تاني" } },
        ],
      },
      {
        id: "unitType",
        kind: "choice",
        label: { en: "Which type of unit?", ar: "شو نوع المكيف؟" },
        options: [
          { value: "split", label: { en: "Split", ar: "سبليت" } },
          { value: "window", label: { en: "Window unit", ar: "شباك" } },
          { value: "central", label: { en: "Central", ar: "مركزي" } },
          { value: "portable", label: { en: "Portable", ar: "متنقل" } },
        ],
      },
      {
        id: "units",
        kind: "choice",
        label: { en: "How many units?", ar: "قديه مكيف؟" },
        options: [
          { value: "1", label: { en: "1", ar: "١" } },
          { value: "2", label: { en: "2", ar: "٢" } },
          { value: "3+", label: { en: "3 or more", ar: "٣ أو أكتر" } },
        ],
      },
    ],
  },
  {
    id: "carpentry",
    name: { en: "Carpentry", ar: "نجارة" },
    blurb: {
      en: "Doors, cabinets, shelves and furniture repair.",
      ar: "أبواب، خزائن، رفوف وتصليح أثاث.",
    },
    questions: [
      {
        id: "item",
        kind: "choice",
        label: { en: "What needs work?", ar: "شو بدك تصلّح؟" },
        options: [
          { value: "door", label: { en: "Door / lock", ar: "باب / قفل" } },
          { value: "cabinet", label: { en: "Cabinet / wardrobe", ar: "خزانة" } },
          { value: "shelves", label: { en: "Shelves", ar: "رفوف" } },
          { value: "furniture", label: { en: "Furniture repair", ar: "تصليح أثاث" } },
          { value: "other", label: { en: "Something else", ar: "شي تاني" } },
        ],
      },
      {
        id: "workType",
        kind: "choice",
        label: { en: "Repair or new work?", ar: "تصليح ولا شغل جديد؟" },
        options: [
          { value: "repair", label: { en: "Repair", ar: "تصليح" } },
          { value: "new", label: { en: "New / custom work", ar: "شغل جديد / تفصال" } },
        ],
      },
    ],
  },
  {
    id: "painting",
    name: { en: "Painting & repairs", ar: "دهان وتصليحات" },
    blurb: {
      en: "Interior painting, wall repair and minor tiling.",
      ar: "دهان داخلي، تصليح حيطان وتبليط بسيط.",
    },
    questions: [
      {
        id: "scope",
        kind: "choice",
        label: { en: "How big is the job?", ar: "قديه كبير الشغل؟" },
        options: [
          { value: "wall", label: { en: "One wall / small repair", ar: "حيط واحد / تصليح صغير" } },
          { value: "room", label: { en: "One room", ar: "غرفة وحدة" } },
          { value: "home", label: { en: "Whole home", ar: "كل البيت" } },
        ],
      },
      {
        id: "state",
        kind: "choice",
        label: { en: "What condition are the walls in?", ar: "شو حالة الحيطان؟" },
        options: [
          { value: "good", label: { en: "Good, just repaint", ar: "منيحة، بس دهان" } },
          { value: "cracks", label: { en: "Cracks / peeling", ar: "تشققات / قشور" } },
          { value: "stains", label: { en: "Stains / humidity", ar: "بقع / رطوبة" }, weight: 1 },
        ],
      },
    ],
  },
  {
    id: "cleaning",
    name: { en: "Cleaning", ar: "تنظيف" },
    blurb: {
      en: "Home, office, deep and post-construction cleaning.",
      ar: "تنظيف بيوت، مكاتب، تنظيف عميق وبعد ورشة.",
    },
    questions: [
      {
        id: "type",
        kind: "choice",
        label: { en: "What kind of cleaning?", ar: "شو نوع التنظيف؟" },
        options: [
          { value: "home", label: { en: "Home cleaning", ar: "تنظيف بيت" } },
          { value: "office", label: { en: "Office cleaning", ar: "تنظيف مكتب" } },
          { value: "deep", label: { en: "Deep cleaning", ar: "تنظيف عميق" } },
          { value: "post_construction", label: { en: "Post-construction", ar: "بعد ورشة" }, weight: 1 },
        ],
      },
      {
        id: "size",
        kind: "choice",
        label: { en: "How big is the place?", ar: "قديه كبير المكان؟" },
        options: [
          { value: "studio", label: { en: "Studio / 1 bedroom", ar: "ستوديو / غرفة وصالة" } },
          { value: "2br", label: { en: "2 bedrooms", ar: "غرفتين" } },
          { value: "3br", label: { en: "3 bedrooms", ar: "٣ غرف" } },
          { value: "large", label: { en: "Larger / office", ar: "أكبر / مكتب" } },
        ],
      },
      {
        id: "frequency",
        kind: "choice",
        label: { en: "One-time or recurring?", ar: "مرة وحدة ولا بشكل دوري؟" },
        options: [
          { value: "once", label: { en: "One-time", ar: "مرة وحدة" } },
          { value: "weekly", label: { en: "Weekly", ar: "أسبوعي" } },
          { value: "monthly", label: { en: "Monthly", ar: "شهري" } },
        ],
      },
    ],
  },
  {
    id: "porter",
    name: { en: "Porter", ar: "حمالة ونقل" },
    blurb: {
      en: "Carrying, moving assistance and building support.",
      ar: "حمل، مساعدة نقل ودعم مباني.",
    },
    questions: [
      {
        id: "help",
        kind: "choice",
        label: { en: "What do you need?", ar: "شو بدك؟" },
        options: [
          { value: "carrying", label: { en: "Carrying heavy items", ar: "حمل غراض تقيلة" } },
          { value: "moving", label: { en: "Moving assistance", ar: "مساعدة نقل" } },
          { value: "building", label: { en: "Building support shift", ar: "مناوبة دعم مبنى" } },
        ],
      },
      {
        id: "duration",
        kind: "choice",
        label: { en: "For how long?", ar: "لقديه وقت؟" },
        options: [
          { value: "hours", label: { en: "A few hours", ar: "كام ساعة" } },
          { value: "day", label: { en: "Full day", ar: "يوم كامل" } },
          { value: "days", label: { en: "Several days", ar: "كام يوم" } },
        ],
      },
      {
        id: "floors",
        kind: "choice",
        label: { en: "Stairs or elevator?", ar: "درج ولا أسانسير؟" },
        options: [
          { value: "elevator", label: { en: "Elevator available", ar: "في أسانسير" } },
          { value: "stairs_low", label: { en: "Stairs, up to 2 floors", ar: "درج، لحد طابقين" }, weight: 1 },
          { value: "stairs_high", label: { en: "Stairs, 3+ floors", ar: "درج، ٣ طوابق أو أكتر" }, weight: 1 },
        ],
      },
    ],
  },
  {
    id: "valet",
    name: { en: "Valet & event staff", ar: "طاقم ضيافة وفاليه" },
    blurb: {
      en: "Staff for restaurants, venues and events.",
      ar: "طاقم للمطاعم، القاعات والمناسبات.",
    },
    questions: [
      {
        id: "venue",
        kind: "choice",
        label: { en: "Where is the job?", ar: "وين الشغل؟" },
        options: [
          { value: "restaurant", label: { en: "Restaurant", ar: "مطعم" } },
          { value: "event", label: { en: "Private event", ar: "مناسبة خاصة" } },
          { value: "venue", label: { en: "Venue / hotel", ar: "قاعة / فندق" } },
        ],
      },
      {
        id: "teamSize",
        kind: "choice",
        label: { en: "How many staff?", ar: "قديه شخص بدك؟" },
        options: [
          { value: "1-2", label: { en: "1–2", ar: "١–٢" } },
          { value: "3-5", label: { en: "3–5", ar: "٣–٥" } },
          { value: "6+", label: { en: "6 or more", ar: "٦ أو أكتر" } },
        ],
      },
      {
        id: "shift",
        kind: "choice",
        label: { en: "Which shift?", ar: "أي دوام؟" },
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
    name: { en: "Security", ar: "أمن وحراسة" },
    blurb: {
      en: "Guards for buildings, sites and events.",
      ar: "حراس للمباني، الورش والمناسبات.",
    },
    questions: [
      {
        id: "site",
        kind: "choice",
        label: { en: "What needs guarding?", ar: "شو بدك حراسة؟" },
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
          { value: "day", label: { en: "Day shift", ar: "دوام نهاري" } },
          { value: "night", label: { en: "Night shift", ar: "دوام ليلي" } },
          { value: "24h", label: { en: "24 hours", ar: "٢٤ ساعة" } },
        ],
      },
      {
        id: "guards",
        kind: "choice",
        label: { en: "How many guards?", ar: "قديه حارس؟" },
        options: [
          { value: "1", label: { en: "1", ar: "١" } },
          { value: "2", label: { en: "2", ar: "٢" } },
          { value: "3+", label: { en: "3 or more", ar: "٣ أو أكتر" } },
        ],
      },
    ],
  },
  {
    id: "landscaping",
    name: { en: "Landscaping", ar: "تنسيق حدائق" },
    blurb: {
      en: "Gardens, irrigation, tree trimming, fences and outdoor care.",
      ar: "حدائق، ري، تقليم أشجار، أسيجة وعناية خارجية.",
    },
    questions: [
      {
        id: "work",
        kind: "choice",
        label: { en: "What do you need?", ar: "شو بدك؟" },
        options: [
          { value: "design", label: { en: "New garden / redesign", ar: "حديقة جديدة / إعادة تصميم" } },
          { value: "maintenance", label: { en: "Regular maintenance", ar: "صيانة دورية" } },
          { value: "trimming", label: { en: "Tree / hedge trimming", ar: "تقليم أشجار / أسيجة خضرا" }, weight: 1 },
          { value: "irrigation", label: { en: "Irrigation system", ar: "نظام ري" } },
          { value: "fence", label: { en: "Fence / pergola / stonework", ar: "سيجة / برجولا / حجر" } },
          { value: "cleanup", label: { en: "Cleanup / overgrowth removal", ar: "تنظيف / إزالة أعشاب" } },
          { value: "other", label: { en: "Something else", ar: "شي تاني" } },
        ],
      },
      {
        id: "space",
        kind: "choice",
        label: { en: "How big is the space?", ar: "قديه كبيرة المساحة؟" },
        options: [
          { value: "balcony", label: { en: "Balcony / rooftop", ar: "بلكون / سطح" } },
          { value: "small", label: { en: "Small garden (up to 100 m²)", ar: "حديقة صغيرة (لحد ١٠٠ م²)" } },
          { value: "medium", label: { en: "Medium (100–300 m²)", ar: "وسط (١٠٠–٣٠٠ م²)" } },
          { value: "large", label: { en: "Large / villa / commercial", ar: "كبيرة / فيلا / تجاري" }, weight: 1 },
        ],
      },
      {
        id: "heightRisk",
        kind: "choice",
        when: { id: "work", equals: "trimming" },
        label: {
          en: "Any tall trees near power lines or buildings?",
          ar: "في أشجار عالية قرب خطوط كهربا أو مباني؟",
        },
        hint: {
          en: "Stay clear of the area. Just tell us what you see.",
          ar: "ابعد عن المنطقة. بس خبرنا شو شايف.",
        },
        options: [
          { value: "no", label: { en: "No", ar: "لا" } },
          { value: "tall", label: { en: "Tall trees, clear area", ar: "أشجار عالية، المنطقة فاضية" }, weight: 1 },
          { value: "near_lines", label: { en: "Yes, near power lines / buildings", ar: "إيه، قرب كهربا / مباني" }, critical: true },
        ],
      },
      {
        id: "water",
        kind: "choice",
        when: { id: "work", equals: "irrigation" },
        label: { en: "Is there a water source on site?", ar: "في مصدر مي بالموقع؟" },
        options: [
          { value: "tap", label: { en: "Yes, outdoor tap", ar: "إيه، حنفية برّا" } },
          { value: "tank", label: { en: "Tank / pump only", ar: "خزان / مضخة بس" } },
          { value: "none", label: { en: "No source yet", ar: "لسا ما في" } },
        ],
      },
      {
        id: "frequency",
        kind: "choice",
        when: { id: "work", equals: "maintenance" },
        label: { en: "How often?", ar: "قديه مرة بالشهر؟" },
        options: [
          { value: "once", label: { en: "One-time visit", ar: "زيارة وحدة" } },
          { value: "monthly", label: { en: "Monthly", ar: "شهري" } },
          { value: "weekly", label: { en: "Weekly", ar: "أسبوعي" } },
        ],
      },
    ],
  },
  {
    id: "appliance",
    name: { en: "Appliance repair", ar: "تصليحات" },
    blurb: {
      en: "Washers, fridges, ovens and household appliances.",
      ar: "غسالات، برادات، أفران وأجهزة منزلية.",
    },
    questions: [
      {
        id: "appliance",
        kind: "choice",
        label: { en: "Which appliance?", ar: "أي جهاز؟" },
        options: [
          { value: "washer", label: { en: "Washing machine", ar: "غسالة" } },
          { value: "fridge", label: { en: "Fridge / freezer", ar: "براد / فريزر" } },
          { value: "oven", label: { en: "Oven / cooker", ar: "فرن / غاز" } },
          { value: "dishwasher", label: { en: "Dishwasher", ar: "جلاية" } },
          { value: "other", label: { en: "Other", ar: "غيره" } },
        ],
      },
      {
        id: "symptom",
        kind: "choice",
        label: { en: "What is it doing?", ar: "شو عم يعمل؟" },
        options: [
          { value: "dead", label: { en: "No power at all", ar: "ما عم يشتغل أبداً" } },
          { value: "not_working", label: { en: "Runs but not working right", ar: "بيشتغل بس مش منيح" } },
          { value: "leak", label: { en: "Leaking water", ar: "عم يسرّب مي" }, weight: 2 },
          { value: "noise", label: { en: "Loud / strange noise", ar: "صوت عالي / غريب" } },
          { value: "smell", label: { en: "Burning smell", ar: "ريحة حريق" }, critical: true },
        ],
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
};

// ---------- the Be Right Guarantee ----------

export const GUARANTEE_POINTS: LocalText[] = [
  {
    en: "Every job is documented with photos before and after, and a specialist reviews the result.",
    ar: "كل شغلة موثّقة بصور قبل وبعد، ومختص بيراجع النتيجة.",
  },
  {
    en: `If something isn't right within ${GUARANTEE_DAYS} days, report it from your requests page and the revisit is free.`,
    ar: `إذا في شي مش مظبوط خلال ${arabicDigits(GUARANTEE_DAYS)} أيام، بلّغ عنه من صفحة طلباتك والزيارة مجانية.`,
  },
  {
    en: "The price you approved is the price you pay. Extra work only happens after your approval.",
    ar: "السعر يلي وافقت عليه هو يلي بتدفعه. أي شغل زيادة بصير بس بعد موافقتك.",
  },
  {
    en: "Verified technicians only, with identity and trade checked before their first job.",
    ar: "معلّمين موثّقين بس، الهوية والمهنة بينفحصوا قبل أول شغلة.",
  },
];

// ---------- coverage areas ----------

// Nationwide — all of Lebanon.
export const COVERAGE_NOTE: LocalText = {
  en: "From Beirut to Tripoli, Saida to the Bekaa, any town or village. We confirm appointment availability for your address before approval.",
  ar: "من بيروت لطرابلس، من صيدا للبقاع، أي مدينة أو ضيعة. منأكد توفر الموعد لعنوانك قبل الموافقة.",
};
export const COVERAGE_AREAS: { group: LocalText; areas: LocalText[] }[] = [
  {
    group: { en: "Everywhere in Lebanon", ar: "كل المناطق اللبنانية" },
    areas: [
      { en: "Beirut", ar: "بيروت" },
      { en: "Mount Lebanon", ar: "جبل لبنان" },
      { en: "Tripoli & the North", ar: "طرابلس والشمال" },
      { en: "Saida & the South", ar: "صيدا والجنوب" },
      { en: "Bekaa", ar: "البقاع" },
      { en: "Nabatieh", ar: "النبطية" },
      { en: "Baalbek & Hermel", ar: "بعلبك والهرمل" },
      { en: "Akkar", ar: "عكار" },
    ],
  },
];

// ---------- main vs other services (homepage grouping) ----------

/** Every service, in the order shown everywhere (one group: no separate "other services"). */
export const SERVICES_IN_ORDER = [
  "plumbing",
  "electrical",
  "ac",
  "appliance",
  "carpentry",
  "painting",
  "cleaning",
  "landscaping",
  "porter",
  "valet",
  "security",
];

// ---------- verified client list (owner-supplied) ----------
// Owner-supplied clients; logos collected from official brand sources.
export const CLIENTS: { name: string; logo: string; note: LocalText }[] = [
  { name: "Spinneys", logo: "/assets/clients/spinneys.png", note: { en: "Gray Mackenzie Retail SAL", ar: "غراي ماكنزي ريتيل ش.م.ل" } },
  { name: "Happy Supermarkets", logo: "/assets/clients/happy.png", note: { en: "Supermarkets", ar: "سوبرماركت" } },
  { name: "Sky Gate", logo: "/assets/clients/sky-gate.png", note: { en: "Sky Gate Beirut", ar: "سكاي غيت بيروت" } },
  { name: "Noknok", logo: "/assets/clients/noknok.png", note: { en: "Grocery delivery", ar: "توصيل بقالة" } },
  { name: "GrabnGO", logo: "/assets/clients/grabngo.png", note: { en: "Convenience stores", ar: "متاجر سريعة" } },
  { name: "Malik's", logo: "/assets/clients/maliks.png", note: { en: "Bookshops & stationery", ar: "مكتبات وقرطاسية" } },
  { name: "Tawfeer", logo: "/assets/clients/tawfeer.png", note: { en: "Supermarkets", ar: "سوبرماركت" } },
  { name: "Beirut Duty Free", logo: "/assets/clients/beirut-duty-free.png", note: { en: "PAC SAL", ar: "باك ش.م.ل" } },
  { name: "Karout Mall", logo: "/assets/clients/teska.png", note: { en: "Teska", ar: "تيسكا" } },
];

// ---------- urgency engine ----------

export interface UrgencyResult {
  level: UrgencyLevel;
  score: number;
  criticalFlags: string[];
}

export function computeUrgency(
  categoryId: string,
  answers: Record<string, string>,
): UrgencyResult {
  const cat = CATEGORY_MAP[categoryId];
  let score = 0;
  const criticalFlags: string[] = [];
  if (cat) {
    for (const q of cat.questions) {
      const val = answers[q.id];
      if (!val || !q.options) continue;
      const opt = q.options.find((o) => o.value === val);
      if (!opt) continue;
      score += opt.weight ?? 0;
      if (opt.critical) criticalFlags.push(`${q.id}=${val}`);
    }
  }
  let level: UrgencyLevel = "normal";
  if (score >= 4) level = "urgent";
  else if (score >= 2) level = "priority";
  if (criticalFlags.length > 0) level = "critical";
  return { level, score, criticalFlags };
}

export const URGENCY_META: Record<
  UrgencyLevel,
  { label: LocalText; note: LocalText }
> = {
  normal: {
    label: { en: "Normal", ar: "عادي" },
    note: { en: "Can wait for a scheduled visit.", ar: "بيستنى موعد عادي." },
  },
  priority: {
    label: { en: "Priority", ar: "أولوية" },
    note: {
      en: "Needs attention soon. A small priority fee may apply.",
      ar: "بدو انتباه قريب. ممكن رسوم أولوية صغيرة.",
    },
  },
  urgent: {
    label: { en: "Urgent", ar: "مستعجل" },
    note: {
      en: "Damage may increase quickly. A dispatch surcharge applies.",
      ar: "الضرر ممكن يكبّر بسرعة. في رسوم إرسال إضافية.",
    },
  },
  critical: {
    label: { en: "Critical", ar: "حرج" },
    note: {
      en: "Possible safety risk. A specialist will call you directly.",
      ar: "ممكن خطر سلامة. المختص رح يتصل فيك مباشرة.",
    },
  },
};
