// Live traffic context for incidents: civil aircraft (OpenSky), military
// aircraft (adsb.lol) and AIS vessels, all via the app's own proxies.
import { haversineKm } from './intel.js';

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

/** Normalise the three feeds into flat {kind, id, label, lat, lon, ...} points. */
export async function fetchLive(home) {
  const out = { civil: [], military: [], vessels: [], errors: [], at: Date.now() };
  const jobs = [
    get(`/api/flights?lat=${home.lat}&lon=${home.lon}`).then((d) => {
      for (const s of d.states || []) {
        if (s[8] || !Number.isFinite(s[5]) || !Number.isFinite(s[6])) continue;
        out.civil.push({
          kind: 'civil', id: s[0], label: (s[1] || s[0]).trim(), lat: s[6], lon: s[5],
          alt: s[7], speed: s[9], squawk: s[14] || '',
        });
      }
    }),
    get('/api/military').then((d) => {
      for (const a of d.ac || []) {
        if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
        out.military.push({
          kind: 'military', id: a.hex, label: (a.flight || a.r || a.hex).trim(), type: a.t || '',
          lat: a.lat, lon: a.lon, alt: typeof a.alt_baro === 'number' ? a.alt_baro * 0.3048 : null,
          speed: a.gs ? a.gs * 0.514 : null, squawk: a.squawk || '', emergency: a.emergency && a.emergency !== 'none',
        });
      }
    }),
    get('/api/vessels').then((d) => {
      for (const v of d.rows || []) {
        if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue;
        out.vessels.push({
          kind: 'vessel', id: v.mmsi, label: (v.name || v.mmsi || 'Unknown').trim(), type: String(v.type || ''),
          lat: v.lat, lon: v.lon, speed: v.speed, course: v.course, destination: v.destination || '',
        });
      }
    }),
  ];
  const names = ['civil aircraft', 'military aircraft', 'vessels'];
  (await Promise.allSettled(jobs)).forEach((r, i) => {
    if (r.status === 'rejected') out.errors.push(names[i]);
  });
  return out;
}

const EMERGENCY = new Set(['7500', '7600', '7700']);
/** AIS ship-type codes: 35 military, 80-89 tanker, 70-79 cargo. */
const isMilVessel = (t) => t === '35' || t === '55';
const isTanker = (t) => /^8\d$/.test(t);

/**
 * What is happening around an incident right now.
 * `bonus` is the extra risk (0-14) justified by what is observed; `airspaceOpen`
 * tells the flight option whether civil traffic is still flowing nearby.
 */
export function contextFor(inc, radiusKm, live) {
  if (!live) return null;
  const near = (list) =>
    list
      .map((p) => ({ ...p, d: haversineKm(p, inc) }))
      .filter((p) => p.d <= radiusKm)
      .sort((a, b) => a.d - b.d);
  const civil = near(live.civil);
  const military = near(live.military);
  const vessels = near(live.vessels);
  const emergencies = [...civil, ...military].filter((p) => EMERGENCY.has(p.squawk) || p.emergency);
  const milVessels = vessels.filter((v) => isMilVessel(v.type));
  const stopped = vessels.filter((v) => (v.speed ?? 9) < 0.8 && (isTanker(v.type) || /^7\d$/.test(v.type)));
  const bonus = Math.min(
    14,
    Math.min(6, military.length * 2) + (emergencies.length ? 6 : 0) + Math.min(4, milVessels.length * 2) + Math.min(3, stopped.length),
  );
  // "Open" if the wider region shows traffic and the incident area is not empty.
  const regional = live.civil.filter((p) => haversineKm(p, inc) <= radiusKm * 3).length;
  return {
    civil, military, vessels, emergencies, milVessels, stopped, bonus,
    airspaceOpen: civil.length >= 3 || regional >= 20 ? true : regional === 0 && live.civil.length > 50 ? false : null,
    errors: live.errors,
  };
}
