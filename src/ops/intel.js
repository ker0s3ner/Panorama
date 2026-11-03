// Incident engine: news/video items → classified, geolocated incidents →
// risk for a given person → ranked personal options.
// Heuristic and transparent on purpose: every number can be traced to a rule
// below. It is decision support, not official guidance.

/** name patterns → [lat, lon, country]. Diacritics are stripped before match. */
export const PLACES = {
  // Baltics & neighbours
  riga: [56.95, 24.11, 'LV'], daugavpils: [55.87, 26.54, 'LV'], liepaja: [56.51, 21.01, 'LV'], latvia: [56.9, 24.6, 'LV'],
  vilnius: [54.69, 25.28, 'LT'], kaunas: [54.9, 23.9, 'LT'], klaipeda: [55.7, 21.14, 'LT'], lithuania: [55.2, 23.9, 'LT'],
  suwalki: [54.1, 22.93, 'PL'], tallinn: [59.44, 24.75, 'EE'], tartu: [58.38, 26.72, 'EE'], narva: [59.38, 28.2, 'EE'],
  estonia: [58.7, 25.5, 'EE'], 'gulf of finland': [59.8, 25.5, 'FI'], helsinki: [60.17, 24.94, 'FI'], finland: [62.5, 26.0, 'FI'],
  kaliningrad: [54.71, 20.51, 'RU'], baltiysk: [54.65, 19.91, 'RU'], 'baltic sea': [57.5, 19.5, 'SEA'], gotland: [57.5, 18.5, 'SE'],
  sweden: [59.0, 16.0, 'SE'], stockholm: [59.33, 18.07, 'SE'], norway: [61.0, 9.0, 'NO'], oslo: [59.91, 10.75, 'NO'], denmark: [56.0, 10.0, 'DK'], copenhagen: [55.68, 12.57, 'DK'],
  // Europe
  poland: [52.0, 19.4, 'PL'], warsaw: [52.23, 21.01, 'PL'], rzeszow: [50.04, 22.0, 'PL'], gdansk: [54.35, 18.65, 'PL'], lublin: [51.25, 22.57, 'PL'],
  belarus: [53.7, 27.9, 'BY'], minsk: [53.9, 27.56, 'BY'], germany: [51.0, 10.4, 'DE'], berlin: [52.52, 13.4, 'DE'], munich: [48.14, 11.58, 'DE'], frankfurt: [50.11, 8.68, 'DE'],
  france: [46.6, 2.5, 'FR'], paris: [48.86, 2.35, 'FR'], 'united kingdom': [54.0, -2.0, 'GB'], britain: [54.0, -2.0, 'GB'], london: [51.51, -0.13, 'GB'], ireland: [53.4, -8.0, 'IE'], dublin: [53.35, -6.26, 'IE'],
  spain: [40.4, -3.7, 'ES'], madrid: [40.42, -3.7, 'ES'], barcelona: [41.39, 2.17, 'ES'], portugal: [39.6, -8.0, 'PT'], lisbon: [38.72, -9.14, 'PT'],
  italy: [42.8, 12.5, 'IT'], rome: [41.9, 12.5, 'IT'], milan: [45.46, 9.19, 'IT'], netherlands: [52.2, 5.3, 'NL'], amsterdam: [52.37, 4.9, 'NL'], belgium: [50.6, 4.6, 'BE'], brussels: [50.85, 4.35, 'BE'],
  switzerland: [46.8, 8.2, 'CH'], austria: [47.5, 14.5, 'AT'], vienna: [48.21, 16.37, 'AT'], czech: [49.8, 15.5, 'CZ'], prague: [50.08, 14.43, 'CZ'], slovakia: [48.7, 19.7, 'SK'],
  hungary: [47.2, 19.5, 'HU'], budapest: [47.5, 19.04, 'HU'], romania: [45.9, 25.0, 'RO'], bucharest: [44.43, 26.1, 'RO'], bulgaria: [42.7, 25.5, 'BG'], sofia: [42.7, 23.32, 'BG'],
  greece: [39.0, 22.0, 'GR'], athens: [37.98, 23.73, 'GR'], serbia: [44.0, 21.0, 'RS'], belgrade: [44.8, 20.46, 'RS'], kosovo: [42.6, 20.9, 'XK'], croatia: [45.1, 15.2, 'HR'], bosnia: [44.0, 17.8, 'BA'],
  cyprus: [35.1, 33.4, 'CY'], moldova: [47.0, 28.8, 'MD'], georgia: [42.3, 43.4, 'GE'], tbilisi: [41.72, 44.79, 'GE'], armenia: [40.2, 45.0, 'AM'], azerbaijan: [40.4, 47.8, 'AZ'], baku: [40.41, 49.87, 'AZ'],
  // Russia / Ukraine
  russia: [58.0, 40.0, 'RU'], moscow: [55.75, 37.62, 'RU'], 'st petersburg': [59.93, 30.34, 'RU'], 'saint petersburg': [59.93, 30.34, 'RU'], 'st. petersburg': [59.93, 30.34, 'RU'], pskov: [57.82, 28.33, 'RU'], crimea: [45.0, 34.0, 'UA'], donetsk: [48.0, 37.8, 'UA'],
  ukraine: [49.0, 32.0, 'UA'], kyiv: [50.45, 30.52, 'UA'], kharkiv: [49.99, 36.23, 'UA'], odesa: [46.48, 30.72, 'UA'], lviv: [49.84, 24.03, 'UA'], zaporizhzhia: [47.84, 35.14, 'UA'], dnipro: [48.46, 35.05, 'UA'],
  'black sea': [43.5, 34.0, 'SEA'], mediterranean: [35.0, 18.0, 'SEA'], 'north sea': [56.0, 3.0, 'SEA'], arctic: [75.0, 20.0, 'SEA'],
  // Middle East
  turkey: [39.0, 35.0, 'TR'], ankara: [39.93, 32.86, 'TR'], istanbul: [41.01, 28.98, 'TR'], syria: [35.0, 38.5, 'SY'], damascus: [33.51, 36.28, 'SY'], aleppo: [36.2, 37.16, 'SY'],
  lebanon: [33.9, 35.9, 'LB'], beirut: [33.89, 35.5, 'LB'], israel: [31.0, 35.0, 'IL'], 'tel aviv': [32.08, 34.78, 'IL'], jerusalem: [31.77, 35.21, 'IL'], gaza: [31.4, 34.4, 'PS'], 'west bank': [32.0, 35.3, 'PS'],
  jordan: [31.0, 36.5, 'JO'], iraq: [33.0, 44.0, 'IQ'], baghdad: [33.31, 44.37, 'IQ'], iran: [32.4, 53.7, 'IR'], tehran: [35.69, 51.39, 'IR'], yemen: [15.5, 47.5, 'YE'], sanaa: [15.37, 44.19, 'YE'],
  'saudi arabia': [24.0, 45.0, 'SA'], riyadh: [24.71, 46.68, 'SA'], dubai: [25.2, 55.27, 'AE'], 'abu dhabi': [24.45, 54.38, 'AE'], qatar: [25.3, 51.2, 'QA'], doha: [25.29, 51.53, 'QA'], kuwait: [29.3, 47.5, 'KW'],
  'red sea': [20.0, 38.5, 'SEA'], 'strait of hormuz': [26.6, 56.3, 'SEA'], 'persian gulf': [27.0, 51.5, 'SEA'], 'gulf of aden': [12.0, 47.0, 'SEA'],
  // Africa
  egypt: [26.8, 30.8, 'EG'], cairo: [30.04, 31.24, 'EG'], libya: [27.0, 17.0, 'LY'], tripoli: [32.89, 13.19, 'LY'], tunisia: [34.0, 9.0, 'TN'], algeria: [28.0, 2.6, 'DZ'], morocco: [31.8, -7.1, 'MA'],
  sudan: [15.5, 32.5, 'SD'], khartoum: [15.5, 32.56, 'SD'], ethiopia: [9.1, 40.5, 'ET'], somalia: [5.2, 46.2, 'SO'], mogadishu: [2.05, 45.32, 'SO'], kenya: [0.0, 37.9, 'KE'], nairobi: [-1.29, 36.82, 'KE'],
  nigeria: [9.1, 8.7, 'NG'], lagos: [6.52, 3.38, 'NG'], mali: [17.6, -4.0, 'ML'], niger: [17.6, 8.1, 'NE'], 'burkina faso': [12.2, -1.6, 'BF'], sahel: [14.0, 0.0, 'ML'],
  congo: [-2.9, 23.7, 'CD'], kinshasa: [-4.44, 15.27, 'CD'], 'south africa': [-29.0, 24.0, 'ZA'], johannesburg: [-26.2, 28.05, 'ZA'], 'cape town': [-33.92, 18.42, 'ZA'], mozambique: [-18.7, 35.5, 'MZ'],
  // Asia
  china: [35.0, 103.0, 'CN'], beijing: [39.9, 116.4, 'CN'], shanghai: [31.23, 121.47, 'CN'], 'hong kong': [22.32, 114.17, 'HK'], taiwan: [23.7, 121.0, 'TW'], taipei: [25.03, 121.57, 'TW'],
  'taiwan strait': [24.5, 119.5, 'SEA'], 'south china sea': [14.5, 114.0, 'SEA'], japan: [36.2, 138.3, 'JP'], tokyo: [35.68, 139.69, 'JP'], 'north korea': [40.0, 127.0, 'KP'], pyongyang: [39.03, 125.75, 'KP'],
  'south korea': [36.5, 127.8, 'KR'], seoul: [37.57, 126.98, 'KR'], india: [21.0, 78.0, 'IN'], 'new delhi': [28.61, 77.21, 'IN'], delhi: [28.61, 77.21, 'IN'], mumbai: [19.08, 72.88, 'IN'], kashmir: [34.0, 76.0, 'IN'],
  pakistan: [30.0, 70.0, 'PK'], islamabad: [33.69, 73.05, 'PK'], karachi: [24.86, 67.0, 'PK'], afghanistan: [33.9, 67.7, 'AF'], kabul: [34.53, 69.17, 'AF'], bangladesh: [23.7, 90.4, 'BD'], 'sri lanka': [7.9, 80.8, 'LK'],
  myanmar: [21.0, 96.0, 'MM'], thailand: [15.0, 101.0, 'TH'], bangkok: [13.75, 100.5, 'TH'], vietnam: [16.0, 107.8, 'VN'], hanoi: [21.03, 105.85, 'VN'], philippines: [12.9, 122.0, 'PH'], manila: [14.6, 120.98, 'PH'],
  indonesia: [-2.5, 118.0, 'ID'], jakarta: [-6.2, 106.85, 'ID'], singapore: [1.35, 103.82, 'SG'], malaysia: [4.2, 102.0, 'MY'], kazakhstan: [48.0, 67.0, 'KZ'], uzbekistan: [41.4, 64.6, 'UZ'], mongolia: [46.9, 103.8, 'MN'],
  // Oceania
  australia: [-25.0, 134.0, 'AU'], sydney: [-33.87, 151.21, 'AU'], melbourne: [-37.81, 144.96, 'AU'], 'new zealand': [-41.0, 174.0, 'NZ'], 'papua new guinea': [-6.3, 143.9, 'PG'],
  // Americas
  'united states': [39.0, -98.0, 'US'], 'new york': [40.71, -74.0, 'US'], washington: [38.9, -77.04, 'US'], 'los angeles': [34.05, -118.24, 'US'], chicago: [41.88, -87.63, 'US'], 'san francisco': [37.77, -122.42, 'US'],
  miami: [25.76, -80.19, 'US'], texas: [31.0, -99.0, 'US'], california: [37.0, -120.0, 'US'], florida: [28.0, -82.0, 'US'], alaska: [64.0, -150.0, 'US'], hawaii: [20.8, -156.3, 'US'],
  canada: [56.0, -106.0, 'CA'], toronto: [43.65, -79.38, 'CA'], ottawa: [45.42, -75.7, 'CA'], vancouver: [49.28, -123.12, 'CA'], mexico: [23.6, -102.5, 'MX'], 'mexico city': [19.43, -99.13, 'MX'],
  cuba: [21.5, -80.0, 'CU'], havana: [23.11, -82.37, 'CU'], haiti: [19.0, -72.4, 'HT'], venezuela: [7.0, -66.0, 'VE'], caracas: [10.48, -66.9, 'VE'], colombia: [4.6, -74.1, 'CO'], bogota: [4.71, -74.07, 'CO'],
  brazil: [-10.0, -52.0, 'BR'], 'sao paulo': [-23.55, -46.63, 'BR'], 'rio de janeiro': [-22.9, -43.2, 'BR'], argentina: [-34.0, -64.0, 'AR'], 'buenos aires': [-34.6, -58.38, 'AR'], peru: [-9.2, -75.0, 'PE'], lima: [-12.05, -77.04, 'PE'],
  chile: [-30.0, -71.0, 'CL'], santiago: [-33.45, -70.67, 'CL'], ecuador: [-1.8, -78.2, 'EC'], panama: [8.5, -80.8, 'PA'],
};

const title = (k) => k.replace(/\b\w/g, (c) => c.toUpperCase());
/** Cities a person can say they are in (also used as drive-to havens). */
export const HOME_CITIES = [
  'riga', 'vilnius', 'tallinn', 'helsinki', 'stockholm', 'oslo', 'copenhagen', 'warsaw', 'berlin', 'paris', 'london', 'dublin', 'madrid', 'lisbon', 'rome',
  'amsterdam', 'brussels', 'vienna', 'prague', 'budapest', 'bucharest', 'sofia', 'athens', 'istanbul', 'kyiv', 'lviv', 'moscow', 'tbilisi', 'baku',
  'tel aviv', 'beirut', 'cairo', 'riyadh', 'dubai', 'doha', 'tehran', 'baghdad', 'nairobi', 'lagos', 'johannesburg', 'cape town', 'karachi', 'new delhi', 'mumbai',
  'bangkok', 'singapore', 'jakarta', 'manila', 'hong kong', 'beijing', 'shanghai', 'taipei', 'seoul', 'tokyo', 'sydney', 'melbourne',
  'new york', 'washington', 'chicago', 'los angeles', 'san francisco', 'miami', 'toronto', 'vancouver', 'mexico city', 'bogota', 'lima', 'santiago', 'buenos aires', 'sao paulo',
].map((k) => ({ key: k, name: title(k), lat: PLACES[k][0], lon: PLACES[k][1] })).sort((a, b) => a.name.localeCompare(b.name));

/** Safe havens for road trips: the same cities. */
const HAVENS = HOME_CITIES.map((c) => [c.name, c.lat, c.lon]);
const AIRPORTS = [
  ['RIX Riga', 56.92, 23.97], ['VNO Vilnius', 54.63, 25.29], ['TLL Tallinn', 59.41, 24.83], ['HEL Helsinki', 60.32, 24.96], ['ARN Stockholm', 59.65, 17.92],
  ['OSL Oslo', 60.19, 11.1], ['CPH Copenhagen', 55.62, 12.65], ['WAW Warsaw', 52.17, 20.97], ['BER Berlin', 52.37, 13.5], ['CDG Paris', 49.01, 2.55], ['LHR London', 51.47, -0.45],
  ['DUB Dublin', 53.42, -6.27], ['MAD Madrid', 40.47, -3.56], ['FCO Rome', 41.8, 12.24], ['AMS Amsterdam', 52.31, 4.76], ['VIE Vienna', 48.11, 16.57], ['BUD Budapest', 47.44, 19.26],
  ['OTP Bucharest', 44.57, 26.1], ['ATH Athens', 37.94, 23.94], ['IST Istanbul', 41.26, 28.74], ['KBP Kyiv', 50.34, 30.89], ['SVO Moscow', 55.97, 37.41], ['TLV Tel Aviv', 32.01, 34.89],
  ['BEY Beirut', 33.82, 35.49], ['CAI Cairo', 30.12, 31.41], ['RUH Riyadh', 24.96, 46.7], ['DXB Dubai', 25.25, 55.36], ['DOH Doha', 25.27, 51.61], ['IKA Tehran', 35.42, 51.15],
  ['NBO Nairobi', -1.32, 36.93], ['LOS Lagos', 6.58, 3.32], ['JNB Johannesburg', -26.14, 28.24], ['CPT Cape Town', -33.97, 18.6], ['KHI Karachi', 24.91, 67.16], ['DEL New Delhi', 28.56, 77.1],
  ['BOM Mumbai', 19.09, 72.87], ['BKK Bangkok', 13.69, 100.75], ['SIN Singapore', 1.36, 103.99], ['CGK Jakarta', -6.13, 106.66], ['MNL Manila', 14.51, 121.02], ['HKG Hong Kong', 22.31, 113.91],
  ['PEK Beijing', 40.08, 116.58], ['PVG Shanghai', 31.14, 121.81], ['TPE Taipei', 25.08, 121.23], ['ICN Seoul', 37.46, 126.44], ['HND Tokyo', 35.55, 139.78], ['SYD Sydney', -33.94, 151.18],
  ['MEL Melbourne', -37.67, 144.84], ['JFK New York', 40.64, -73.78], ['IAD Washington', 38.95, -77.46], ['ORD Chicago', 41.98, -87.9], ['LAX Los Angeles', 33.94, -118.41],
  ['SFO San Francisco', 37.62, -122.38], ['MIA Miami', 25.79, -80.29], ['YYZ Toronto', 43.68, -79.63], ['YVR Vancouver', 49.2, -123.18], ['MEX Mexico City', 19.44, -99.07],
  ['BOG Bogotá', 4.7, -74.15], ['LIM Lima', -12.02, -77.11], ['SCL Santiago', -33.39, -70.79], ['EZE Buenos Aires', -34.82, -58.54], ['GRU São Paulo', -23.43, -46.47],
];

/** event type → { label, radiusKm, base 0-100, patterns } */
export const TYPES = {
  drone: { label: 'Drone', radiusKm: 60, base: 62, re: /\b(drone|drones|uav|shahed|unmanned)\b/i },
  missile: { label: 'Missile', radiusKm: 120, base: 74, re: /\b(missile|missiles|rocket|ballistic|cruise missile)\b/i },
  airspace: { label: 'Airspace', radiusKm: 90, base: 52, re: /\b(airspace|jets? scrambled|scrambled|fighter jets?|violat\w+ .*airspace|aircraft|helicopter|air raid|air alert)\b/i },
  maritime: { label: 'Maritime', radiusKm: 70, base: 48, re: /\b(vessel|ship|tanker|navy|naval|warship|fleet|submarine|coast guard|shadow fleet|anchor|port)\b/i },
  network: { label: 'Network / cyber', radiusKm: 100, base: 50, re: /\b(cable|outage|blackout|cyber\w*|internet|telecom|undersea|subsea|sabotage|power cut|power grid|gps jamming|jamming|interference)\b/i },
  ground: { label: 'Border / ground', radiusKm: 50, base: 44, re: /\b(border|troops|military exercise|exercises|invasion|shelling|artillery|mobiliz\w+|evacuat\w+)\b/i },
};
const STRIKE_RE = /\b(strike|struck|attack\w*|shot down|explosion|exploded|crashed|killed|injured|hit|intercept\w*|downed|alarm|siren|evacuat\w+|emergency|warning)\b/i;
const NOISE_RE = /\b(football|basketball|concert|festival|recipe|weather forecast|stock market|elections? results|box office|transfer window|funding|wind farm|conference|grocery|national guards? drill\w*|drilling this weekend|recipe|tourism)\b/i;

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PLACE_KEYS = Object.keys(PLACES).sort((a, b) => b.length - a.length);

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Classify one feed item. Returns null when it is not an incident. */
export function classify(item) {
  const text = fold(`${item.title}. ${item.summary || ''}`);
  if (NOISE_RE.test(text)) return null;
  let type = null;
  let best = 0;
  for (const [key, t] of Object.entries(TYPES)) {
    const hits = (text.match(new RegExp(t.re.source, 'gi')) || []).length;
    const titleHit = t.re.test(fold(item.title)) ? 2 : 0;
    const score = hits + titleHit;
    if (score > best) {
      best = score;
      type = key;
    }
  }
  if (!type) return null;
  // Title mention of a place beats a body mention; first (longest) key wins.
  let place = null;
  const title = fold(item.title);
  for (const key of PLACE_KEYS) {
    if (new RegExp(`\\b${key}\\b`).test(title)) {
      place = key;
      break;
    }
  }
  if (!place) {
    for (const key of PLACE_KEYS) {
      if (new RegExp(`\\b${key}\\b`).test(text)) {
        place = key;
        break;
      }
    }
  }
  if (!place) return null;
  const strike = STRIKE_RE.test(text);
  // Pure "port"/"aircraft" mentions without any incident language are not incidents.
  if (!strike && (type === 'maritime' || type === 'airspace') && best < 3) return null;
  const [lat, lon, country] = PLACES[place];
  return { type, place, lat, lon, country, strike };
}

/** Group classified items into incidents by (type, place), newest first. */
export function buildIncidents(items, { now = Date.now(), maxAgeH = 72 } = {}) {
  const map = new Map();
  for (const item of items) {
    if (now - item.ts > maxAgeH * 3600_000) continue;
    const c = classify(item);
    if (!c) continue;
    const key = `${c.type}:${c.place}`;
    let inc = map.get(key);
    if (!inc) {
      inc = { id: `inc-${key.replace(/\W+/g, '-')}`, ...c, items: [], strikeCount: 0 };
      map.set(key, inc);
    }
    inc.items.push(item);
    if (c.strike) inc.strikeCount += 1;
  }
  const incidents = [...map.values()];
  for (const inc of incidents) {
    inc.items.sort((a, b) => b.ts - a.ts);
    inc.lastTs = inc.items[0].ts;
    inc.firstTs = inc.items[inc.items.length - 1].ts;
    inc.sources = [...new Set(inc.items.map((i) => i.source))];
    inc.title = inc.items[0].title;
    // Confidence rises with independent outlets, falls with age.
    const independent = Math.min(4, inc.sources.length);
    const ageH = (now - inc.lastTs) / 3600_000;
    inc.confidence = Math.max(0.2, Math.min(0.95, 0.35 + independent * 0.13 + (inc.strikeCount ? 0.08 : 0) - Math.min(0.25, ageH / 100)));
  }
  return incidents;
}

/** Risk 0-100 for a person at `home` from this incident. */
export function incidentRisk(inc, home, now = Date.now(), bonus = 0) {
  const t = TYPES[inc.type];
  const d = haversineKm(inc, home);
  const ageH = Math.max(0, (now - inc.lastTs) / 3600_000);
  const severity = t.base + (inc.strikeCount ? 14 : 0) + Math.min(8, (inc.sources.length - 1) * 3) + bonus;
  const proximity = Math.exp(-Math.max(0, d - t.radiusKm * 0.3) / (t.radiusKm * 3.2));
  const recency = Math.exp(-ageH / 30);
  return Math.max(1, Math.min(99, Math.round(severity * proximity * (0.35 + 0.65 * recency))));
}

export function riskLevel(value) {
  return value >= 60 ? 'HIGH' : value >= 30 ? 'MED' : 'LOW';
}

const nearest = (list, p, filter = () => true) =>
  list
    .map(([name, lat, lon]) => ({ name, lat, lon, d: haversineKm({ lat, lon }, p) }))
    .filter(filter)
    .sort((a, b) => a.d - b.d)[0];

/**
 * Personal options for a person at `home`, given an incident.
 * time = minutes to complete; after = residual risk 0-100 once done;
 * exposure = risk taken on while carrying it out.
 */
export function personalOptions(inc, home, profile = { car: true, passport: true }, ctx = null) {
  const t = TYPES[inc.type];
  const risk = incidentRisk(inc, home, Date.now(), ctx?.bonus || 0);
  const dEvent = haversineKm(inc, home);
  const out = [];
  const residualAt = (p) => {
    const d = haversineKm(inc, p);
    return Math.round(risk * Math.exp(-Math.max(0, d - dEvent) / (t.radiusKm * 1.6)) * (d < dEvent ? 1.4 : 0.8));
  };

  out.push({
    id: 'shelter',
    title: 'Shelter in place',
    detail: 'Stay indoors, away from windows, ground floor or basement if possible. Charge phones, keep radio on.',
    minutes: 5,
    after: Math.round(risk * (inc.type === 'drone' || inc.type === 'missile' ? 0.55 : 0.8)),
    exposure: 2,
    confidence: 0.8,
    reversible: true,
    why: 'Fastest action. Strongest when a warning window is short or roads may be targeted.',
  });

  if (profile.car) {
    const hv = nearest(HAVENS, home, (h) => h.d > 90 && h.d < 800 && haversineKm(h, inc) > dEvent + 40);
    if (hv) {
      const minutes = Math.round(hv.d / 75 * 60 + 20);
      out.push({
        id: 'drive',
        title: `Drive to ${hv.name}`,
        detail: `${Math.round(hv.d)} km by road. Leave with fuel above half, ID, medication, cash, water.`,
        minutes,
        after: Math.max(2, residualAt(hv)),
        exposure: Math.round(8 + Math.min(20, risk * 0.18)),
        confidence: 0.7,
        reversible: true,
        dest: hv,
        why: `Moves you ${Math.round(haversineKm(hv, inc) - dEvent)} km further from the incident. Traffic and fuel queues can add time.`,
      });
    }
  }

  const ap = nearest(AIRPORTS, home, (a) => haversineKm(a, inc) > 45);
  if (ap && profile.passport) {
    const closureRisk = inc.type === 'drone' || inc.type === 'airspace' || inc.type === 'missile';
    const dest = nearest(AIRPORTS, home, (a) => a.d > 300 && haversineKm(a, inc) > dEvent + 150) || ap;
    out.push({
      id: 'fly',
      title: `Fly out via ${ap.name}`,
      detail: `${Math.round(ap.d)} km to the airport, then check-in. Flights may be cancelled at short notice near this incident type.`,
      minutes: Math.round(ap.d / 60 * 60 + 110),
      after: Math.max(2, residualAt(dest)),
      exposure: closureRisk ? 24 : 10,
      confidence: Math.max(0.15, (closureRisk ? 0.45 : 0.65) + (ctx?.airspaceOpen === true ? 0.15 : ctx?.airspaceOpen === false ? -0.3 : 0)),
      reversible: false,
      dest: ap,
      why: ctx?.airspaceOpen === true
        ? 'Live tracking shows civil flights still operating near the incident; cancellations can still come at short notice.'
        : ctx?.airspaceOpen === false
          ? 'Live tracking shows almost no civil traffic in this region: airspace may be closed. Do not rely on flying.'
          : closureRisk
        ? 'Airspace closures are likely for this incident type; expect delays, have a ground fallback.'
        : 'Reliable if the airport is outside the affected area and flights are operating.',
    });
  }

  out.push({
    id: 'rail',
    title: 'Leave by train or coach',
    detail: 'Book the next departure away from the incident. Carry documents and a charged phone.',
    minutes: 150,
    after: Math.max(2, Math.round(risk * 0.45)),
    exposure: 8,
    confidence: 0.6,
    reversible: true,
    why: 'Works without a car; slower and capacity-limited.',
  });

  out.push({
    id: 'prepare',
    title: 'Prepare and monitor',
    detail: 'Pack a go-bag, fill the car, withdraw some cash, follow official alerts (112) and re-check in 30 minutes.',
    minutes: 30,
    after: Math.round(risk * 0.85),
    exposure: 1,
    confidence: 0.9,
    reversible: true,
    why: 'Keeps every other option open; best when the incident is far or old.',
  });

  for (const o of out) o.score = scoreOption(o, risk);
  return out.sort((a, b) => b.score - a.score);
}

/** Risk removed per unit time, penalised by exposure and unreliability. */
export function scoreOption(o, base) {
  const reduction = Math.max(0, base - o.after);
  const speed = 1 / (1 + o.minutes / 90);
  const raw = reduction * (0.45 + 0.55 * speed) * o.confidence - o.exposure * 0.3;
  return Math.max(0, Math.min(100, Math.round(raw * (100 / Math.max(25, base)))));
}

/** Reports per hour for the activity chart. */
export function activitySeries(inc, hours = 24, now = Date.now()) {
  const bins = new Array(hours).fill(0);
  for (const it of inc.items) {
    const h = Math.floor((now - it.ts) / 3600_000);
    if (h >= 0 && h < hours) bins[hours - 1 - h] += 1;
  }
  return bins;
}
