/* =====================================================================
   WHERE PLAYERS ARE FROM — the only places the game knows.

   Region first, then the city or town inside it, so a picker never has to
   show one long flat list. Nothing outside this table can be chosen or
   saved: the server checks every value against it.

   Names are [English, Arabic, Kurdish]. Shared by the client (the pickers,
   the profile) and the server (validation).
   ===================================================================== */

export const REGIONS = [
  { id: 'hawler', name: ['Hawler / Erbil', 'أربيل', 'هەولێر'], towns: [
    ['hawler', 'Hawler (Erbil)', 'أربيل', 'هەولێر'],
    ['soran', 'Soran', 'سوران', 'سۆران'],
    ['shaqlawa', 'Shaqlawa', 'شقلاوة', 'شەقڵاوە'],
    ['rawanduz', 'Rawanduz', 'راوندوز', 'ڕەواندز'],
    ['koya', 'Koya', 'كويه', 'کۆیە'],
    ['ankawa', 'Ankawa', 'عنكاوا', 'عەنکاوە'],
    ['choman', 'Choman', 'جومان', 'چۆمان'],
    ['mergasur', 'Mergasur', 'ميركه سور', 'مێرگەسۆر'],
    ['khabat', 'Khabat', 'خبات', 'خەبات'],
    ['hajiomeran', 'Haji Omeran', 'حاج عمران', 'حاجی ئۆمەران'],
  ] },
  { id: 'slemani', name: ['Slemani', 'السليمانية', 'سلێمانی'], towns: [
    ['slemani', 'Slemani', 'السليمانية', 'سلێمانی'],
    ['ranya', 'Ranya', 'رانية', 'ڕانیە'],
    ['qaladiza', 'Qaladiza', 'قلعة دزة', 'قەڵادزێ'],
    ['chamchamal', 'Chamchamal', 'جمجمال', 'چەمچەماڵ'],
    ['kalar', 'Kalar', 'كلار', 'کەلار'],
    ['darbandikhan', 'Darbandikhan', 'دربندخان', 'دەربەندیخان'],
    ['penjwen', 'Penjwen', 'بنجوين', 'پێنجوێن'],
    ['dukan', 'Dukan', 'دوكان', 'دووکان'],
    ['saidsadiq', 'Said Sadiq', 'سيد صادق', 'سەیدسادق'],
    ['qaradagh', 'Qaradagh', 'قرداغ', 'قەرەداغ'],
    ['mawat', 'Mawat', 'ماوت', 'ماوەت'],
  ] },
  { id: 'duhok', name: ['Duhok', 'دهوك', 'دهۆک'], towns: [
    ['duhok', 'Duhok', 'دهوك', 'دهۆک'],
    ['zakho', 'Zakho', 'زاخو', 'زاخۆ'],
    ['akre', 'Akre', 'عقرة', 'ئاکرێ'],
    ['amedi', 'Amedi', 'العمادية', 'ئامێدی'],
    ['simele', 'Simele', 'سميل', 'سێمێل'],
    ['batifa', 'Batifa', 'باطوفة', 'باتیفا'],
    ['bamarni', 'Bamarni', 'بامرني', 'بامەڕنێ'],
    ['bardarash', 'Bardarash', 'بردرش', 'بەردەڕەش'],
  ] },
  { id: 'halabja', name: ['Halabja', 'حلبجة', 'هەڵەبجە'], towns: [
    ['halabja', 'Halabja', 'حلبجة', 'هەڵەبجە'],
  ] },
  { id: 'kirkuk', name: ['Kirkuk / Kerkûk', 'كركوك', 'کەرکووک'], towns: [
    ['kirkuk', 'Kirkuk (Kerkûk)', 'كركوك', 'کەرکووک'],
    ['dibis', 'Dibis', 'دبس', 'دبس'],
    ['altunkupri', 'Altun Kupri (Pirdê)', 'آلتون كوبري', 'پردێ'],
    ['daquq', 'Daquq', 'داقوق', 'داقووق'],
    ['qarahanjir', 'Qara Hanjir', 'قره هنجير', 'قەرەهەنجیر'],
    ['shwan', 'Shwan', 'شوان', 'شوان'],
    ['laylan', 'Laylan', 'ليلان', 'لەیلان'],
    ['yaychi', 'Yaychi', 'يايجي', 'یایچی'],
  ] },
];

const LI = { en: 0, ar: 1, ku: 2 };
const TOWN = new Map();          // id → { region, names:[en, ar, ku] }
for (const r of REGIONS) for (const [id, en, ar, ku] of r.towns) TOWN.set(id, { region: r.id, names: [en, ar, ku] });

/** Every town id that may be saved. */
export const TOWN_IDS = [...TOWN.keys()];
export const isTown = (id) => TOWN.has(id);
/** The region a town belongs to, or null. */
export const regionOf = (id) => (TOWN.has(id) ? TOWN.get(id).region : null);
/** A town's name in a language ('en' | 'ar' | 'ku'). Falls back to English. */
export function townName(id, lang = 'en') {
  const t = TOWN.get(id); if (!t) return '';
  return t.names[LI[lang] ?? 0] || t.names[0];
}
export function regionName(id, lang = 'en') {
  const r = REGIONS.find((x) => x.id === id); if (!r) return '';
  return r.name[LI[lang] ?? 0] || r.name[0];
}

/*
 * Values saved before this list existed were free text or the old button names ("Hawler",
 * "Silemani", "Baghdad", "Other"…). Those that are one of our places map onto it; anything else
 * — including cities that are not on the list — becomes "not set", never an unknown place.
 */
const LEGACY = { hawler: 'hawler', erbil: 'hawler', arbil: 'hawler', silemani: 'slemani', sulaymaniyah: 'slemani',
  sulaimani: 'slemani', slemani: 'slemani', duhok: 'duhok', dohuk: 'duhok', kirkuk: 'kirkuk', kerkuk: 'kirkuk',
  halabja: 'halabja', zakho: 'zakho', ranya: 'ranya', rania: 'ranya', soran: 'soran' };
export function normTown(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (TOWN.has(s)) return s;
  const k = s.toLowerCase().replace(/[^a-z]/g, '');
  if (TOWN.has(k)) return k;
  return LEGACY[k] || '';
}
