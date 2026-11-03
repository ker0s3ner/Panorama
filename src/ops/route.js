// Route planning for personal options: real road routes (OSRM, keyless),
// plus an honest, labelled analysis of congestion and exposure.
//
// Congestion is ESTIMATED from time of day and distance to large cities; the
// public routing service carries no live traffic. Choke points are places where
// traffic bunches (merges, ramps, forks, roundabouts, city cores). They are
// reported so a traveller can avoid queueing or stopping near a threat, not as
// anything else.
import { HOME_CITIES, TYPES, haversineKm } from './intel.js';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

/** Big-city centres used for the congestion model (population-weighted guess). */
const CITY_WEIGHT = {
  london: 1, paris: 1, 'new york': 1, tokyo: 1, 'mexico city': 1, 'sao paulo': 1, cairo: 1, mumbai: 1, 'new delhi': 1, beijing: 1, shanghai: 1,
  moscow: 1, istanbul: 1, karachi: 1, lagos: 0.9, jakarta: 0.9, manila: 0.9, bangkok: 0.9, seoul: 0.9, 'los angeles': 0.9, 'buenos aires': 0.8,
  tehran: 0.8, baghdad: 0.7, kyiv: 0.7, madrid: 0.7, berlin: 0.6, rome: 0.6, chicago: 0.6, toronto: 0.6, sydney: 0.6,
};

/** Local solar hour from longitude (good enough for rush-hour shape). */
function localHour(lon, now = Date.now()) {
  const d = new Date(now);
  return (d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15 + 24) % 24;
}
const rush = (h) =>
  Math.max(Math.exp(-((h - 8.2) ** 2) / 2.2), Math.exp(-((h - 17.3) ** 2) / 3.2)) * 0.9 + 0.1;

function congestionAt(lat, lon, now) {
  let c = 0;
  for (const city of HOME_CITIES) {
    const w = CITY_WEIGHT[city.key] ?? 0.45;
    const d = haversineKm({ lat, lon }, city);
    const radius = 10 + 26 * w;
    if (d < radius) c = Math.max(c, w * (1 - d / radius));
  }
  return c * rush(localHour(lon, now));
}

/** Fetch up to 3 driving routes. Throws on failure. */
export async function fetchRoutes(from, to) {
  const url = `${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=true&overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`routing ${res.status}`);
  const body = await res.json();
  if (body.code !== 'Ok' || !body.routes?.length) throw new Error('no route');
  return body.routes;
}

const KIND = {
  merge: 'Merge point',
  'on ramp': 'Highway on-ramp',
  'off ramp': 'Highway off-ramp',
  fork: 'Fork',
  roundabout: 'Roundabout',
  rotary: 'Roundabout',
};

/**
 * Analyse one OSRM route against an incident.
 * @returns {{coords:number[][], minutes:number, km:number, congestion:Array, chokepoints:Array,
 *   closestKm:number, exposure:number, extraMinutes:number}}
 */
export function analyseRoute(route, incident, now = Date.now()) {
  const coords = route.geometry.coordinates;
  const radius = TYPES[incident.type].radiusKm;
  const km = route.distance / 1000;
  // Sample every ~3 km.
  const stepEvery = Math.max(1, Math.floor(coords.length / Math.max(8, km / 3)));
  const samples = [];
  for (let i = 0; i < coords.length; i += stepEvery) samples.push({ i, lon: coords[i][0], lat: coords[i][1] });
  samples.push({ i: coords.length - 1, lon: coords.at(-1)[0], lat: coords.at(-1)[1] });

  // Congestion bands.
  const congestion = [];
  let extra = 0;
  for (let s = 0; s < samples.length - 1; s++) {
    const a = samples[s];
    const b = samples[s + 1];
    const level = congestionAt((a.lat + b.lat) / 2, (a.lon + b.lon) / 2, now);
    if (level < 0.18) continue;
    const segKm = haversineKm(a, b);
    const delay = segKm * (level * 1.4); // minutes
    extra += delay;
    congestion.push({ from: a.i, to: b.i, level, label: level > 0.55 ? 'Heavy' : 'Moderate', delayMin: delay });
  }

  // Choke points from manoeuvres.
  const chokepoints = [];
  const steps = route.legs.flatMap((l) => l.steps);
  let lastRound = -9;
  steps.forEach((st, idx) => {
    const type = st.maneuver?.type;
    const label = KIND[type];
    if (!label) return;
    if (type === 'roundabout' || type === 'rotary') {
      if (idx - lastRound < 3) return;
      lastRound = idx;
    }
    const [lon, lat] = st.maneuver.location;
    const urban = congestionAt(lat, lon, now);
    const d = haversineKm({ lat, lon }, incident);
    // Where traffic concentrates AND the threat reaches, queueing is the danger.
    const inZone = d <= radius * 1.15;
    const score = Math.round(100 * Math.min(1, (type === 'merge' || type === 'on ramp' ? 0.45 : 0.3) + urban * 0.9) * (inZone ? 1 : 0.35));
    if (score < 20) return;
    chokepoints.push({ lat, lon, kind: label, name: st.name || '', score, inZone, distKm: d });
  });
  // City cores on the route are choke areas in their own right.
  for (const city of HOME_CITIES) {
    const w = CITY_WEIGHT[city.key] ?? 0.45;
    const near = samples.find((p) => haversineKm(p, city) < 6 + 6 * w);
    if (near) {
      const d = haversineKm(city, incident);
      const inZone = d <= radius * 1.15;
      chokepoints.push({
        lat: city.lat, lon: city.lon, kind: 'City centre crossing', name: city.name,
        score: Math.round(100 * Math.min(1, 0.4 + w * 0.5) * (inZone ? 1 : 0.35)), inZone, distKm: d,
      });
    }
  }
  chokepoints.sort((a, b) => b.score - a.score);

  // Closest approach to the incident and time spent inside its radius.
  let closest = Infinity;
  let inside = 0;
  for (const p of samples) {
    const d = haversineKm(p, incident);
    closest = Math.min(closest, d);
    if (d < radius) inside += 1;
  }
  const insideShare = inside / samples.length;
  const closeness = Math.max(0, 1 - closest / (radius * 1.6));
  const choke = chokepoints.filter((c) => c.inZone).reduce((a, c) => a + c.score, 0) / 400;
  const exposure = Math.max(0, Math.min(99, Math.round(100 * (0.55 * closeness + 0.3 * insideShare + 0.15 * Math.min(1, choke)))));

  return {
    coords, minutes: Math.round(route.duration / 60 + extra), baseMinutes: Math.round(route.duration / 60), km: Math.round(km),
    congestion, chokepoints: chokepoints.slice(0, 8), closestKm: Math.round(closest), exposure, extraMinutes: Math.round(extra),
  };
}

/** Label routes: fastest, safest (lowest exposure) and the recommendation. */
export function rankRoutes(analysed) {
  const fastest = analysed.reduce((a, b) => (b.minutes < a.minutes ? b : a));
  const safest = analysed.reduce((a, b) => (b.exposure < a.exposure ? b : a));
  analysed.forEach((r, i) => {
    r.id = `r${i}`;
    r.tags = [];
    if (r === fastest) r.tags.push('FASTEST');
    if (r === safest) r.tags.push('LOWEST EXPOSURE');
  });
  // Prefer safer route unless it costs more than ~35% extra time.
  const rec = analysed.filter((r) => r.minutes <= fastest.minutes * 1.35).reduce((a, b) => (b.exposure < a.exposure ? b : a));
  rec.recommended = true;
  return { fastest, safest, recommended: rec };
}
