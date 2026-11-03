// Additional keyless open-data camera packs: Singapore (LTA via data.gov.sg)
// and New Zealand (NZTA). Same camera shape as the packs in sources.js.
import { fallbackHeadingFromId, prioritizeSources, toFiniteNumber } from './normalize.js';
import { CCTV_SOURCE_FETCH_TIMEOUT_MS } from './constants.js';

const SG_URL = 'https://api.data.gov.sg/v1/transport/traffic-images';
const NZ_URL = 'https://trafficnz.info/service/traffic/rest/4/cameras/all';
const NZ_ORIGIN = 'https://trafficnz.info';
const envMax = (name, dflt) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.max(8, Math.min(2000, Math.floor(n))) : dflt;
};

const baseCamera = (over) => ({
  headingConfidence: 'low',
  pitchDeg: -18,
  fovDeg: 44,
  rangeM: 145,
  mountHeightM: 8,
  groundElevationM: 10,
  feedType: 'image',
  ...over,
});

export async function loadSingaporeSources() {
  try {
    const resp = await fetch(SG_URL, { signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS) });
    if (!resp.ok) return [];
    const body = await resp.json();
    const cams = body?.items?.[0]?.cameras || [];
    const out = [];
    for (const c of cams) {
      const lat = toFiniteNumber(c?.location?.latitude);
      const lon = toFiniteNumber(c?.location?.longitude);
      const image = String(c?.image || '');
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !image.startsWith('https://images.data.gov.sg/')) continue;
      const id = `sg-${c.camera_id}`;
      out.push(
        baseCamera({
          id, name: `Singapore camera ${c.camera_id}`, city: 'Singapore', cityId: 'singapore',
          provider: 'LTA Singapore', lat, lon, headingDeg: fallbackHeadingFromId(id), url: image, snapshotUrl: image,
          sourceKind: 'singapore-lta', license: 'Singapore Open Data Licence — LTA traffic images',
        }),
      );
    }
    const max = envMax('CCTV_SINGAPORE_MAX_SOURCES', 100);
    const picked = prioritizeSources(out, max, [{ lat: 1.3521, lon: 103.8198 }]);
    console.log(`[CCTV] Loaded Singapore sources: ${out.length} (using ${picked.length})`);
    return picked;
  } catch (e) {
    console.warn('[CCTV] Singapore download error:', e?.message || e);
    return [];
  }
}

const xml = (b, tag) => (b.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || '';

export async function loadNewZealandSources() {
  try {
    const resp = await fetch(NZ_URL, { signal: AbortSignal.timeout(CCTV_SOURCE_FETCH_TIMEOUT_MS) });
    if (!resp.ok) return [];
    const text = await resp.text();
    const blocks = text.match(/<camera>[\s\S]*?<\/camera>(?=<camera>|<\/response>|$)/g) || [];
    const out = [];
    for (const b of blocks) {
      const lat = toFiniteNumber(xml(b, 'latitude'));
      const lon = toFiniteNumber(xml(b, 'longitude'));
      const path = xml(b, 'imageUrl');
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !path.startsWith('/camera/')) continue;
      if (xml(b, 'offline') === 'true') continue;
      const id = `nz-${xml(b, 'id')}`;
      const url = `${NZ_ORIGIN}${path}`;
      out.push(
        baseCamera({
          id, name: xml(b, 'name').trim() || id, city: (b.match(/<region><id>\d+<\/id><name>([^<]*)/) || [])[1] || 'New Zealand',
          cityId: 'new-zealand', provider: 'NZ Transport Agency', lat, lon, headingDeg: fallbackHeadingFromId(id),
          url, snapshotUrl: url, sourceKind: 'nzta-open-data', license: 'NZTA open data (CC BY 4.0)',
        }),
      );
    }
    const max = envMax('CCTV_NZ_MAX_SOURCES', 250);
    const picked = prioritizeSources(out, max, [
      { lat: -36.85, lon: 174.76 }, { lat: -41.29, lon: 174.78 }, { lat: -43.53, lon: 172.64 },
    ]);
    console.log(`[CCTV] Loaded NZTA sources: ${out.length} (using ${picked.length})`);
    return picked;
  } catch (e) {
    console.warn('[CCTV] NZTA download error:', e?.message || e);
    return [];
  }
}
