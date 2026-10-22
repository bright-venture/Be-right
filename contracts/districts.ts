// Lebanon's 26 districts (qadas). Technicians pick the ones they work in; a request's district
// comes from the customer's map pin (server/lib/districts.ts), and a technician is only
// suggested and assigned inside their districts. Boundaries: HDX COD-AB Lebanon (CDR), CC BY-IGO.
import type { LocalText } from "./services";

export const DISTRICTS = [
  "beirut",
  "metn",
  "baabda",
  "keserwan",
  "jbeil",
  "aley",
  "chouf",
  "tripoli",
  "zgharta",
  "koura",
  "batroun",
  "bsharri",
  "minieh_dennieh",
  "akkar",
  "zahle",
  "west_bekaa",
  "rachaya",
  "baalbek",
  "hermel",
  "saida",
  "jezzine",
  "tyre",
  "nabatieh",
  "marjayoun",
  "hasbaya",
  "bint_jbeil",
] as const;
export type District = (typeof DISTRICTS)[number];

/** Each district's name, and a few of its towns so people find theirs (Sin el Fil → Metn). */
export const DISTRICT_INFO: Record<District, { name: LocalText; towns: LocalText }> = {
  beirut: { name: { en: "Beirut", ar: "بيروت" }, towns: { en: "Achrafieh, Hamra, Ras Beirut", ar: "الأشرفية، الحمرا، رأس بيروت" } },
  metn: { name: { en: "Metn", ar: "المتن" }, towns: { en: "Sin el Fil, Dekwaneh, Jdeideh, Antelias, Broummana", ar: "سن الفيل، الدكوانة، الجديدة، أنطلياس، برمانا" } },
  baabda: { name: { en: "Baabda", ar: "بعبدا" }, towns: { en: "Hazmieh, Hadath, Chiyah, Baabda", ar: "الحازمية، الحدث، الشياح، بعبدا" } },
  keserwan: { name: { en: "Keserwan", ar: "كسروان" }, towns: { en: "Jounieh, Zouk, Kaslik, Harissa", ar: "جونية، الذوق، الكسليك، حريصا" } },
  jbeil: { name: { en: "Jbeil", ar: "جبيل" }, towns: { en: "Byblos, Amchit", ar: "جبيل، عمشيت" } },
  aley: { name: { en: "Aley", ar: "عاليه" }, towns: { en: "Aley, Bhamdoun, Choueifat", ar: "عاليه، بحمدون، الشويفات" } },
  chouf: { name: { en: "Chouf", ar: "الشوف" }, towns: { en: "Deir el Qamar, Beiteddine, Damour", ar: "دير القمر، بيت الدين، الدامور" } },
  tripoli: { name: { en: "Tripoli", ar: "طرابلس" }, towns: { en: "Tripoli, Mina", ar: "طرابلس، الميناء" } },
  zgharta: { name: { en: "Zgharta", ar: "زغرتا" }, towns: { en: "Zgharta, Ehden", ar: "زغرتا، إهدن" } },
  koura: { name: { en: "Koura", ar: "الكورة" }, towns: { en: "Amioun, Kousba, Chekka", ar: "أميون، كوسبا، شكا" } },
  batroun: { name: { en: "Batroun", ar: "البترون" }, towns: { en: "Batroun, Tannourine", ar: "البترون، تنورين" } },
  bsharri: { name: { en: "Bsharri", ar: "بشري" }, towns: { en: "Bsharri, The Cedars", ar: "بشري، الأرز" } },
  minieh_dennieh: { name: { en: "Minieh-Dennieh", ar: "المنية الضنية" }, towns: { en: "Minieh, Sir ed-Dennieh", ar: "المنية، سير الضنية" } },
  akkar: { name: { en: "Akkar", ar: "عكار" }, towns: { en: "Halba, Qoubaiyat", ar: "حلبا، القبيات" } },
  zahle: { name: { en: "Zahle", ar: "زحلة" }, towns: { en: "Zahle, Chtaura", ar: "زحلة، شتورة" } },
  west_bekaa: { name: { en: "West Bekaa", ar: "البقاع الغربي" }, towns: { en: "Joub Jannine, Saghbine", ar: "جب جنين، صغبين" } },
  rachaya: { name: { en: "Rachaya", ar: "راشيا" }, towns: { en: "Rachaya", ar: "راشيا" } },
  baalbek: { name: { en: "Baalbek", ar: "بعلبك" }, towns: { en: "Baalbek", ar: "بعلبك" } },
  hermel: { name: { en: "Hermel", ar: "الهرمل" }, towns: { en: "Hermel", ar: "الهرمل" } },
  saida: { name: { en: "Saida", ar: "صيدا" }, towns: { en: "Saida, Ghazieh", ar: "صيدا، الغازية" } },
  jezzine: { name: { en: "Jezzine", ar: "جزين" }, towns: { en: "Jezzine", ar: "جزين" } },
  tyre: { name: { en: "Tyre", ar: "صور" }, towns: { en: "Tyre, Naqoura", ar: "صور، الناقورة" } },
  nabatieh: { name: { en: "Nabatieh", ar: "النبطية" }, towns: { en: "Nabatieh, Kfar Remen", ar: "النبطية، كفررمان" } },
  marjayoun: { name: { en: "Marjayoun", ar: "مرجعيون" }, towns: { en: "Marjayoun, Khiam", ar: "مرجعيون، الخيام" } },
  hasbaya: { name: { en: "Hasbaya", ar: "حاصبيا" }, towns: { en: "Hasbaya", ar: "حاصبيا" } },
  bint_jbeil: { name: { en: "Bint Jbeil", ar: "بنت جبيل" }, towns: { en: "Bint Jbeil", ar: "بنت جبيل" } },
};

export function isDistrict(value: unknown): value is District {
  return typeof value === "string" && (DISTRICTS as readonly string[]).includes(value);
}

/**
 * Can this technician take a job here? Unknown district (no pin, or outside Lebanon) or a
 * technician with no districts yet: nothing to check.
 */
export function worksIn(districts: readonly string[] | null | undefined, district: string | null | undefined) {
  return !district || !districts?.length || districts.includes(district);
}
