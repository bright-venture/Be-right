// Priority dispatch: the customer picks the emergency, follows its safety steps, answers a few
// quick questions, shares where they are, sends it, then calls the emergency line. The
// specialist who answers sees it all in the dashboard, takes the rest (name, phone, price) on
// the phone and sends a technician.
import type { LocalText } from "./services";

/** Sent emergencies are deleted after this many days (the job they became stays). */
export const EMERGENCY_RETENTION_DAYS = 90;

/** Something the customer does now, while waiting; `critical` ones protect people, not things. */
export interface SafetyStep {
  text: LocalText;
  critical?: boolean;
}

/** A quick question about the emergency; the answers in `alert` make it more urgent. */
export interface EmergencyQuestion {
  id: string;
  label: LocalText;
  options: { value: string; label: LocalText }[];
  alert?: string[];
}

export interface EmergencyProblem {
  id: string;
  label: LocalText;
  /** The service it usually needs (the specialist can change it). */
  category: string | null;
  /** What to do now, in order. */
  safety: SafetyStep[];
  /** Two or three questions; each has 2, 3, 4 or 6 answers, so they sit in full rows. */
  questions: EmergencyQuestion[];
}

const YES = { value: "yes", label: { en: "Yes", ar: "نعم" } };
const NO = { value: "no", label: { en: "No", ar: "لا" } };
const UNSURE = { value: "unsure", label: { en: "Not sure", ar: "لست متأكداً" } };

/** Shown on every emergency, before its own steps. */
export const LEAVE_FIRST: LocalText = {
  en: "Fire, smoke, a gas smell or someone hurt? Leave and call the emergency services first.",
  ar: "حريق أو دخان أو رائحة غاز أو شخص مصاب؟ غادر المكان واتصل بخدمات الطوارئ أولاً.",
};

/** The emergencies offered, in order (an even number, so they sit in full rows). */
export const EMERGENCY_PROBLEMS: EmergencyProblem[] = [
  {
    id: "leak",
    label: { en: "Water leak", ar: "تسرّب مياه" },
    category: "plumbing",
    safety: [
      {
        critical: true,
        text: {
          en: "If water is near sockets, appliances or the electrical panel, switch off the electricity at the main breaker, but only if you can reach it without standing in water.",
          ar: "إذا كانت المياه قرب المقابس أو الأجهزة أو لوحة الكهرباء، اقطع الكهرباء من القاطع الرئيسي، فقط إذا استطعت الوصول إليه دون الوقوف في المياه.",
        },
      },
      {
        text: {
          en: "Turn off the main water valve: usually by the water meter, on the pipe from the roof tank, or under the sink. Turn it clockwise.",
          ar: "أغلق محبس المياه الرئيسي: عادةً قرب عدّاد المياه، أو على الأنبوب الآتي من خزان السطح، أو تحت المغسلة. أدره باتجاه عقارب الساعة.",
        },
      },
      {
        text: {
          en: "Move electrical devices and valuables away from the water, and put a bucket or towels under the leak.",
          ar: "أبعد الأجهزة الكهربائية والأغراض الثمينة عن المياه، وضع دلواً أو مناشف تحت التسرّب.",
        },
      },
    ],
    questions: [
      {
        id: "nearPower",
        label: { en: "Is the water near sockets, appliances or the electrical panel?", ar: "هل المياه قرب المقابس أو الأجهزة أو لوحة الكهرباء؟" },
        options: [YES, NO, UNSURE],
        alert: ["yes"],
      },
      {
        id: "valve",
        label: { en: "Could you turn off the water?", ar: "هل استطعت إغلاق المياه؟" },
        options: [YES, NO, { value: "not_found", label: { en: "Can't find the valve", ar: "لم أجد المحبس" } }],
        alert: ["no", "not_found"],
      },
      {
        id: "where",
        label: { en: "Where is the leak?", ar: "أين التسرّب؟" },
        options: [
          { value: "kitchen", label: { en: "Kitchen", ar: "المطبخ" } },
          { value: "bathroom", label: { en: "Bathroom", ar: "الحمّام" } },
          { value: "ceiling", label: { en: "Ceiling", ar: "السقف" } },
          { value: "wall", label: { en: "Wall or pipe", ar: "حائط أو أنبوب" } },
          { value: "tank", label: { en: "Water tank", ar: "خزان المياه" } },
          { value: "other", label: { en: "Somewhere else", ar: "مكان آخر" } },
        ],
      },
    ],
  },
  {
    id: "blocked-toilet",
    label: { en: "Blocked toilet", ar: "انسداد المرحاض" },
    category: "plumbing",
    safety: [
      { text: { en: "Stop flushing: it can overflow.", ar: "توقّف عن شطف المرحاض: قد يفيض." } },
      {
        text: {
          en: "If it's overflowing, close the small valve on the wall behind the toilet (turn it clockwise).",
          ar: "إذا كان يفيض، أغلق المحبس الصغير على الحائط خلف المرحاض (أدره باتجاه عقارب الساعة).",
        },
      },
      {
        critical: true,
        text: {
          en: "Don't pour drain chemicals in: they can splash back and burn you or the plumber.",
          ar: "لا تسكب مواد كيميائية لفتح المجاري: قد تتطاير وتحرقك أو تحرق السبّاك.",
        },
      },
    ],
    questions: [
      { id: "overflowing", label: { en: "Is it overflowing?", ar: "هل يفيض؟" }, options: [YES, NO], alert: ["yes"] },
      {
        id: "otherDrains",
        label: { en: "Are other drains blocked too (shower, sink)?", ar: "هل هناك مجارٍ أخرى مسدودة أيضاً (الدوش، المغسلة)؟" },
        options: [YES, NO, UNSURE],
      },
    ],
  },
  {
    id: "locked-out",
    label: { en: "Locked out", ar: "الباب مقفل وأنت في الخارج" },
    category: "locksmith",
    safety: [
      {
        critical: true,
        text: {
          en: "If a child, an elderly person or a pet is alone inside, or something is left on (cooker, heater, iron), call the emergency services first.",
          ar: "إذا كان طفل أو مسنّ أو حيوان أليف وحده في الداخل، أو ترك شيء مشتعلاً (موقد، مدفأة، مكواة)، اتصل بخدمات الطوارئ أولاً.",
        },
      },
      { text: { en: "Don't force the door or climb in through a window.", ar: "لا تحاول كسر الباب أو الدخول من النافذة." } },
      {
        text: {
          en: "Have your ID ready: the locksmith may ask you to show that you live there.",
          ar: "جهّز هويتك: قد يطلب فنّي الأقفال أن تُثبت أنك تسكن هنا.",
        },
      },
    ],
    questions: [
      {
        id: "someoneInside",
        label: { en: "Is a child, an elderly person or a pet alone inside?", ar: "هل يوجد طفل أو مسنّ أو حيوان أليف وحده في الداخل؟" },
        options: [YES, NO],
        alert: ["yes"],
      },
      {
        id: "leftOn",
        label: { en: "Is anything left on inside (cooker, heater, iron)?", ar: "هل ترك شيء مشتعلاً في الداخل (موقد، مدفأة، مكواة)؟" },
        options: [YES, NO, UNSURE],
        alert: ["yes"],
      },
      {
        id: "door",
        label: { en: "Which door?", ar: "أي باب؟" },
        options: [
          { value: "home", label: { en: "Home door", ar: "باب المنزل" } },
          { value: "building", label: { en: "Building entrance", ar: "مدخل المبنى" } },
          { value: "car", label: { en: "Car", ar: "سيارة" } },
          { value: "other", label: { en: "Other", ar: "غير ذلك" } },
        ],
      },
    ],
  },
  {
    id: "broken-door-window",
    label: { en: "Broken door or window", ar: "باب أو نافذة مكسورة" },
    category: "carpentry",
    safety: [
      {
        critical: true,
        text: { en: "Keep children and pets away from broken glass, and wear shoes.", ar: "أبعد الأطفال والحيوانات الأليفة عن الزجاج المكسور، وارتدِ حذاءً." },
      },
      { text: { en: "Don't pick up large pieces of glass with bare hands.", ar: "لا تلتقط قطع الزجاج الكبيرة بيديك العاريتين." } },
      {
        text: {
          en: "If you can, cover the opening with cardboard, tape or a plastic sheet to keep rain and wind out.",
          ar: "إن أمكن، غطِّ الفتحة بالكرتون أو الشريط اللاصق أو غطاء بلاستيكي لمنع دخول المطر والرياح.",
        },
      },
    ],
    questions: [
      { id: "glass", label: { en: "Is there broken glass?", ar: "هل يوجد زجاج مكسور؟" }, options: [YES, NO], alert: ["yes"] },
      { id: "secure", label: { en: "Can the home still be locked?", ar: "هل ما زال بالإمكان إقفال المنزل؟" }, options: [YES, NO], alert: ["no"] },
      {
        id: "what",
        label: { en: "What is broken?", ar: "ما المكسور؟" },
        options: [
          { value: "door", label: { en: "Entrance door", ar: "باب المدخل" } },
          { value: "window", label: { en: "Window", ar: "نافذة" } },
          { value: "balcony", label: { en: "Balcony or sliding door", ar: "باب الشرفة أو منزلق" } },
          { value: "shutter", label: { en: "Shutter", ar: "درفة / غالق" } },
        ],
      },
    ],
  },
  {
    id: "no-power",
    label: { en: "Electrics not working", ar: "عطل في الكهرباء" },
    category: "electrical",
    safety: [
      {
        critical: true,
        text: {
          en: "Burning smell, smoke or sparks? Switch off the main breaker if it's safe to reach, leave the room and call the emergency services.",
          ar: "رائحة احتراق أو دخان أو شرر؟ اقطع الكهرباء من القاطع الرئيسي إذا كان الوصول إليه آمناً، وغادر الغرفة واتصل بخدمات الطوارئ.",
        },
      },
      {
        critical: true,
        text: {
          en: "Don't touch wires, sockets or the panel, especially with wet hands or near water.",
          ar: "لا تلمس الأسلاك أو المقابس أو اللوحة، خاصةً بيدين مبلّلتين أو قرب المياه.",
        },
      },
      {
        text: {
          en: "Unplug the appliances that were on, so nothing starts up suddenly when power comes back.",
          ar: "افصل الأجهزة التي كانت تعمل، كي لا يعمل شيء فجأة عند عودة الكهرباء.",
        },
      },
      {
        text: {
          en: "Check whether your neighbours have power: if not, it's probably the grid or your generator subscription.",
          ar: "تحقّق مما إذا كانت الكهرباء عند جيرانك: إن لم تكن، فالأرجح أن العطل من الشبكة أو من اشتراك المولّد.",
        },
      },
    ],
    questions: [
      {
        id: "burning",
        label: { en: "Is there a burning smell, smoke or sparks?", ar: "هل توجد رائحة احتراق أو دخان أو شرر؟" },
        options: [YES, NO],
        alert: ["yes"],
      },
      {
        id: "scope",
        label: { en: "What has no power?", ar: "ما الذي انقطعت عنه الكهرباء؟" },
        options: [
          { value: "whole", label: { en: "The whole home", ar: "المنزل كله" } },
          { value: "rooms", label: { en: "Some rooms", ar: "بعض الغرف" } },
          { value: "one", label: { en: "One socket or light", ar: "مقبس أو ضوء واحد" } },
        ],
      },
      { id: "neighbours", label: { en: "Do your neighbours have power?", ar: "هل الكهرباء موجودة عند جيرانك؟" }, options: [YES, NO, UNSURE] },
    ],
  },
  {
    id: "damaged-roof",
    label: { en: "Damaged roof", ar: "سقف متضرّر" },
    category: "waterproofing",
    safety: [
      {
        critical: true,
        text: {
          en: "If the ceiling is sagging, bulging with water or cracking, leave that room and keep everyone out.",
          ar: "إذا كان السقف متدلّياً أو منتفخاً بالمياه أو متشقّقاً، غادر تلك الغرفة وأبقِ الجميع خارجها.",
        },
      },
      {
        critical: true,
        text: {
          en: "If water is near lights or sockets, switch off the electricity for that area.",
          ar: "إذا كانت المياه قرب الأضواء أو المقابس، اقطع الكهرباء عن تلك المنطقة.",
        },
      },
      { text: { en: "Don't go up on the roof, especially in rain or wind.", ar: "لا تصعد إلى السطح، خاصةً في المطر أو الرياح." } },
      { text: { en: "Move your belongings away and put buckets under the drips.", ar: "أبعد أغراضك وضع دلاء تحت التقطير." } },
    ],
    questions: [
      { id: "waterInside", label: { en: "Is water coming inside?", ar: "هل تدخل المياه إلى الداخل؟" }, options: [YES, NO], alert: ["yes"] },
      { id: "ceiling", label: { en: "Is the ceiling sagging or cracked?", ar: "هل السقف متدلٍّ أو متشقّق؟" }, options: [YES, NO], alert: ["yes"] },
      {
        id: "nearPower",
        label: { en: "Is water near lights or sockets?", ar: "هل المياه قرب الأضواء أو المقابس؟" },
        options: [YES, NO, UNSURE],
        alert: ["yes"],
      },
    ],
  },
  {
    id: "no-hot-water",
    label: { en: "No hot water", ar: "لا توجد مياه ساخنة" },
    category: "plumbing",
    safety: [
      {
        critical: true,
        text: {
          en: "Smell gas? Don't switch anything on or off, open the windows, close the gas valve, leave and call the emergency services.",
          ar: "تشمّ رائحة غاز؟ لا تشغّل أو تطفئ أي شيء، افتح النوافذ، أغلق صمام الغاز، غادر المكان واتصل بخدمات الطوارئ.",
        },
      },
      {
        text: {
          en: "Electric water heater: switch it off at its breaker before looking at it, and don't open its cover.",
          ar: "سخّان كهربائي: اقطع الكهرباء عنه من قاطعه قبل أن تتفقّده، ولا تفتح غطاءه.",
        },
      },
      {
        text: {
          en: "If the water heater is leaking, close the cold-water valve on the pipe going into it.",
          ar: "إذا كان السخّان يسرّب، أغلق محبس المياه الباردة على الأنبوب الداخل إليه.",
        },
      },
    ],
    questions: [
      {
        id: "heater",
        label: { en: "What kind of water heater?", ar: "ما نوع السخّان؟" },
        options: [
          { value: "electric", label: { en: "Electric", ar: "كهربائي" } },
          { value: "gas", label: { en: "Gas", ar: "غاز" } },
          { value: "solar", label: { en: "Solar", ar: "شمسي" } },
          { value: "unknown", label: { en: "Don't know", ar: "لا أعرف" } },
        ],
      },
      { id: "leaking", label: { en: "Is it leaking?", ar: "هل يسرّب؟" }, options: [YES, NO], alert: ["yes"] },
      { id: "gas", label: { en: "Do you smell gas?", ar: "هل تشمّ رائحة غاز؟" }, options: [YES, NO], alert: ["yes"] },
    ],
  },
  {
    id: "other",
    label: { en: "Other emergency", ar: "حالة طارئة أخرى" },
    category: null,
    safety: [
      {
        text: {
          en: "Keep everyone away from the problem until the professional arrives.",
          ar: "أبقِ الجميع بعيداً عن المشكلة حتى يصل المهني.",
        },
      },
    ],
    questions: [
      { id: "danger", label: { en: "Is anyone in danger right now?", ar: "هل يوجد أحد في خطر الآن؟" }, options: [YES, NO], alert: ["yes"] },
      {
        id: "kind",
        label: { en: "What is it about?", ar: "بماذا يتعلّق الأمر؟" },
        options: [
          { value: "water", label: { en: "Water", ar: "المياه" } },
          { value: "electricity", label: { en: "Electricity", ar: "الكهرباء" } },
          { value: "door", label: { en: "Door or lock", ar: "باب أو قفل" } },
          { value: "other", label: { en: "Something else", ar: "شيء آخر" } },
        ],
      },
    ],
  },
];

export const EMERGENCY_PROBLEM_MAP: Record<string, EmergencyProblem> = Object.fromEntries(
  EMERGENCY_PROBLEMS.map((x) => [x.id, x]),
);

/** Only real answers to this emergency's own questions are kept. */
export function cleanAnswers(problem: string, answers: Record<string, string> | null | undefined) {
  const questions = EMERGENCY_PROBLEM_MAP[problem]?.questions ?? [];
  const kept: Record<string, string> = {};
  for (const q of questions) {
    const value = answers?.[q.id];
    if (value && q.options.some((o) => o.value === value)) kept[q.id] = value;
  }
  return kept;
}

/** The answers as question and answer, in order, for the specialist; `alert`: more urgent. */
export function answerLines(problem: string, answers: Record<string, string> | null | undefined) {
  const questions = EMERGENCY_PROBLEM_MAP[problem]?.questions ?? [];
  return questions.flatMap((q) => {
    const option = q.options.find((o) => o.value === answers?.[q.id]);
    return option ? [{ id: q.id, question: q.label, answer: option.label, alert: !!q.alert?.includes(option.value) }] : [];
  });
}

export const EMERGENCY_STATUSES = ["open", "dispatched", "dismissed"] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];
