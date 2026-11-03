// Operations workspace: a Gotham-style analyst shell over the globe, built for
// ordinary people rather than analysts. Live news/video feeds become
// geolocated incidents; each incident gets a dossier, a satellite-imagery date
// stepper, and ranked personal options scored by risk and time to complete.
// Advisory only: a person chooses, and the choice is logged in this browser.
import * as Cesium from 'cesium';
import {
  HOME_CITIES,
  TYPES,
  activitySeries,
  buildIncidents,
  haversineKm,
  incidentRisk,
  personalOptions,
  riskLevel,
} from './intel.js';
import { contextFor, fetchLive } from './live.js';
import { analyseRoute, fetchRoutes, rankRoutes } from './route.js';
import { askAi, loadSettings, openSettings } from './settings.js';

const LS = { home: 'gev.ops.home', profile: 'gev.ops.profile', log: 'gev.ops.decisions.v2' };
const LIVE_MS = 60_000;
const WINDOW_H = 48;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* best effort */
  }
};
const ago = (ts) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m ago` : `${Math.floor(m / 1440)}d ago`;
};
const fmtKm = (km) => (state_units() === 'mi' ? `${Math.round(km * 0.621)} mi` : `${Math.round(km)} km`);
let _units = 'km';
function state_units() {
  return _units;
}
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');

const svg = (d) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square">${d}</svg>`;
const ICON = {
  incidents: svg('<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>'),
  sources: svg('<rect x="3" y="5" width="18" height="14"/><path d="M10 9.5v5l4.5-2.5z"/>'),
  you: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
};

/** Stored home is a city key, or {key:'gps', name, lat, lon} from the device. */
function loadHome() {
  const v = read(LS.home, 'london');
  if (v && typeof v === 'object' && Number.isFinite(v.lat) && Number.isFinite(v.lon)) return v;
  return HOME_CITIES.find((c) => c.key === v) || HOME_CITIES.find((c) => c.key === 'london');
}

/** @param {{viewer: Cesium.Viewer}} options */
export function initOpsCenter({ viewer }) {
  const state = {
    app: 'incidents',
    items: [],
    sources: [],
    incidents: [],
    selected: null,
    tabs: [],
    filter: 'all',
    srcFilter: 'all',
    home: loadHome(),
    profile: read(LS.profile, { car: true, passport: true }),
    log: read(LS.log, []),
    pick: null,
    viewing: null,
    cursor: null,
    playing: false,
    sat: { on: false, date: null },
    status: 'loading',
    settings: loadSettings(),
    raw: [],
    route: null,
    brief: null,
    live: null,
    open: { brief: true, details: true, live: true, activity: true, obs: true },
  };
  let mapEntities = [];
  let satLayer = null;
  let playTimer = null;
  let disposed = false;

  const root = document.createElement('div');
  root.id = 'ops-root';
  root.innerHTML = `
    <div id="ops-tabs" role="tablist" aria-label="Open incidents"></div>
    <nav id="ops-rail" aria-label="Applications"></nav>
    <aside id="ops-drawer" aria-live="polite"></aside>
    <aside id="ops-dossier" hidden aria-label="Incident dossier"></aside>
    <section id="ops-assess" hidden aria-label="Your options"></section>
    <section id="ops-timeline" aria-label="Timeline"></section>
    <div id="ops-viewer" hidden role="dialog" aria-label="Source viewer"></div>
    <button id="ops-gear" type="button" aria-label="Settings" title="Settings">${ICON.gear}</button>
    <div id="ops-tip" role="tooltip" hidden></div>`;
  document.body.append(root);
  const $ = (id) => root.querySelector(id);
  const [tabs, rail, drawer, dossier, assess, timeline, viewerEl] = [
    '#ops-tabs', '#ops-rail', '#ops-drawer', '#ops-dossier', '#ops-assess', '#ops-timeline', '#ops-viewer',
  ].map($);
  document.body.classList.add('ops-open');

  // ── Data ──────────────────────────────────────────────────────────────
  async function refresh() {
    try {
      const res = await fetch('/api/intel/feed');
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      if (disposed) return;
      state.raw = body.items;
      state.sources = body.sources;
      applyFeeds();
      state.status = 'live';
    } catch {
      if (disposed) return;
      state.status = state.items.length ? 'stale' : 'offline';
    }
    rebuild();
  }

  async function refreshLive() {
    try {
      const live = await fetchLive(state.home);
      if (disposed) return;
      state.live = live;
      rebuild();
    } catch {
      /* live context is optional; incidents still work from headlines */
    }
  }

  function applyFeeds() {
    const off = new Set(state.settings.disabledFeeds);
    state.items = state.raw.filter((i) => !off.has(i.sourceId));
  }

  function rebuild() {
    const now = Date.now();
    state.incidents = buildIncidents(state.items, { now, maxAgeH: 96 })
      .map((i) => {
        const ctx = contextFor(i, Math.max(150, TYPES[i.type].radiusKm * 1.5), state.live);
        return { ...i, ctx, risk: incidentRisk(i, state.home, now, ctx?.bonus || 0), dist: haversineKm(i, state.home) };
      })
      .sort((a, b) => b.risk - a.risk || b.lastTs - a.lastTs)
      .slice(0, 80);
    if (state.selected && !state.incidents.find((i) => i.id === state.selected)) state.selected = null;
    renderAll();
  }

  const incident = (id) => state.incidents.find((i) => i.id === id);
  const current = () => incident(state.selected);
  const visibleIncidents = () =>
    state.cursor ? state.incidents.filter((i) => i.firstTs <= state.cursor) : state.incidents;

  // ── Map ───────────────────────────────────────────────────────────────
  const css = (c, a = 1) => Cesium.Color.fromCssColorString(c).withAlpha(a);
  const riskColor = (r) => (r >= 60 ? '#e76a6e' : r >= 30 ? '#ec9a3c' : '#4c90f0');

  function drawMap() {
    for (const e of mapEntities) viewer.entities.remove(e);
    mapEntities = [];
    const add = (o, info) => {
      const ent = viewer.entities.add(o);
      if (info) ent.opsInfo = info;
      mapEntities.push(ent);
      return ent;
    };
    const sel = state.selected;
    for (const inc of visibleIncidents()) {
      const on = inc.id === sel;
      const t = TYPES[inc.type];
      add({
        position: Cesium.Cartesian3.fromDegrees(inc.lon, inc.lat),
        ellipse: {
          semiMajorAxis: t.radiusKm * 1000,
          semiMinorAxis: t.radiusKm * 1000,
          material: css(riskColor(inc.risk), on ? 0.16 : 0.06),
          outline: true,
          outlineColor: css(riskColor(inc.risk), on ? 0.9 : 0.4),
          height: 0,
        },
      });
      add(
        {
          position: Cesium.Cartesian3.fromDegrees(inc.lon, inc.lat, 100),
          point: {
            pixelSize: on ? 15 : 10,
            color: css(riskColor(inc.risk)),
            outlineColor: css('#0e1114'),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        },
        {
          kind: 'incident',
          incidentId: inc.id,
          title: inc.title,
          lines: [
            `${TYPES[inc.type].label} · ${inc.place} (${inc.country})`,
            `Risk to you: ${inc.risk} (${riskLevel(inc.risk)}) · ${fmtKm(inc.dist)} away`,
            `${inc.items.length} report${inc.items.length > 1 ? 's' : ''} from ${inc.sources.slice(0, 3).join(', ')} · ${ago(inc.lastTs)}`,
            'Click to open the dossier',
          ],
          color: riskColor(inc.risk),
        },
      );
    }
    const selInc = current();
    if (selInc?.ctx && state.settings.nearbyTraffic) {
      const dot = (p, color, size, info) =>
        add(
          {
            position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 200),
            point: { pixelSize: size, color: css(color), outlineColor: css('#0e1114'), outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          },
          info,
        );
      const alt = (p) => (p.alt ? `${Math.round(p.alt).toLocaleString()} m` : 'altitude n/a');
      const spd = (p) => (p.speed != null ? `${Math.round(p.speed * 3.6)} km/h` : 'speed n/a');
      selInc.ctx.civil.slice(0, 60).forEach((p) => dot(p, '#abb3bf', 5, { kind: 'civil', title: `Civil aircraft ${p.label}`, lines: [`${alt(p)} · ${spd(p)}`, `${fmtKm(p.d)} from incident`, p.squawk ? `Squawk ${p.squawk}` : 'Source: OpenSky'] , color: '#abb3bf' }));
      selInc.ctx.vessels.slice(0, 80).forEach((p) => dot(p, '#7fb4ff', 6, { kind: 'vessel', title: `Vessel ${p.label}`, lines: [`Type code ${p.type || '?'} · ${p.speed != null ? `${p.speed} kn` : 'speed n/a'}`, p.destination ? `Destination: ${p.destination}` : 'No destination broadcast', `${fmtKm(p.d)} from incident`, 'Source: AIS'], color: '#7fb4ff' }));
      selInc.ctx.military.forEach((p) => dot(p, '#e76a6e', 9, { kind: 'military', title: `Military aircraft ${p.label}`, lines: [`${p.type || 'type n/a'} · ${alt(p)} · ${spd(p)}`, `${fmtKm(p.d)} from incident`, p.emergency ? 'EMERGENCY squawk' : 'Source: ADS-B (adsb.lol)'], color: '#e76a6e' }));
      selInc.ctx.milVessels.forEach((p) => dot(p, '#e76a6e', 9, { kind: 'naval', title: `Naval vessel ${p.label}`, lines: [`${p.speed != null ? `${p.speed} kn` : 'speed n/a'} · ${fmtKm(p.d)} from incident`, 'Source: AIS (type 35)'], color: '#e76a6e' }));
    }
    add(
      {
        position: Cesium.Cartesian3.fromDegrees(state.home.lon, state.home.lat, 100),
        point: { pixelSize: 12, color: css('#ffffff'), outlineColor: css('#4c90f0'), outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      },
      { kind: 'home', title: `You: ${state.home.name}`, lines: ['Your position for risk and route calculations'], color: '#4c90f0' },
    );

    // Route layers for the chosen option.
    const rt = state.route;
    if (rt?.status === 'ok') {
      const lonlat = (c) => Cesium.Cartesian3.fromDegreesArray(c.flat());
      for (const r of rt.routes) {
        const on = r.id === rt.selected;
        add(
          {
            polyline: {
              positions: lonlat(r.coords),
              width: on ? 6 : 3,
              material: on ? css('#4c90f0') : css('#abb3bf', 0.55),
              clampToGround: true,
              classificationType: Cesium.ClassificationType.BOTH,
            },
          },
          {
            kind: 'route',
            title: `${r.tags.join(' · ') || 'Alternative route'}${r.recommended ? ' · RECOMMENDED' : ''}`,
            lines: [`${r.minutes} min · ${fmtKm(r.km)} · exposure ${r.exposure}`, `Closest to incident: ${fmtKm(r.closestKm)}`, 'Click to select this route'],
            routeId: r.id,
            color: '#4c90f0',
          },
        );
      }
      const sel2 = rt.routes.find((r) => r.id === rt.selected);
      if (sel2) {
        for (const c of sel2.congestion) {
          const seg = sel2.coords.slice(c.from, c.to + 1);
          if (seg.length < 2) continue;
          add(
            {
              polyline: {
                positions: lonlat(seg),
                width: 6,
                material: css(c.level > 0.55 ? '#e76a6e' : '#ec9a3c'),
                clampToGround: true,
                classificationType: Cesium.ClassificationType.BOTH,
              },
            },
            { kind: 'congestion', title: `${c.label} congestion (estimated)`, lines: [`About +${Math.max(1, Math.round(c.delayMin))} min on this stretch`, 'Estimated from time of day and city size; no live traffic feed'], color: c.level > 0.55 ? '#e76a6e' : '#ec9a3c' },
          );
        }
        for (const k of sel2.chokepoints) {
          add(
            {
              position: Cesium.Cartesian3.fromDegrees(k.lon, k.lat, 150),
              point: { pixelSize: 11, color: css(k.inZone ? '#e76a6e' : '#ec9a3c'), outlineColor: css('#0e1114'), outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            },
            {
              kind: 'choke',
              title: `${k.kind}${k.name ? ` — ${k.name}` : ''}`,
              lines: [
                k.inZone ? 'Inside the incident’s threat radius' : `${fmtKm(k.distKm)} from the incident`,
                `Bunching score ${k.score}/100. Don’t stop or queue here if the threat is active.`,
              ],
              color: k.inZone ? '#e76a6e' : '#ec9a3c',
            },
          );
        }
      }
      if (rt.dest) {
        add(
          {
            position: Cesium.Cartesian3.fromDegrees(rt.dest.lon, rt.dest.lat, 150),
            point: { pixelSize: 13, color: css('#32a467'), outlineColor: css('#0e1114'), outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          },
          { kind: 'dest', title: `Destination: ${rt.dest.name}`, lines: [rt.label], color: '#32a467' },
        );
      }
    }
  }

  // Hover tooltips + click-through on map markers.
  const tip = $('#ops-tip');
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((m) => {
    const hit = viewer.scene.pick(m.endPosition);
    const info = hit?.id?.opsInfo;
    if (!info) {
      tip.hidden = true;
      viewer.scene.canvas.style.cursor = '';
      return;
    }
    tip.innerHTML = `<b style="--c:${info.color || '#4c90f0'}">${esc(info.title)}</b>${info.lines.map((l) => `<span>${esc(l)}</span>`).join('')}`;
    tip.hidden = false;
    const r = viewer.scene.canvas.getBoundingClientRect();
    const x = Math.min(r.left + m.endPosition.x + 14, window.innerWidth - 280);
    const y = Math.min(r.top + m.endPosition.y + 14, window.innerHeight - 120);
    tip.style.transform = `translate(${x}px, ${y}px)`;
    viewer.scene.canvas.style.cursor = info.incidentId || info.routeId ? 'pointer' : '';
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction((c) => {
    const info = viewer.scene.pick(c.position)?.id?.opsInfo;
    if (info?.incidentId) select(info.incidentId);
    else if (info?.routeId && state.route) {
      state.route.selected = info.routeId;
      renderAssess();
      drawMap();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Country borders (Natural Earth, public domain).
  let borders = null;
  async function syncBorders() {
    if (!state.settings.borders) {
      if (borders) borders.show = false;
      return;
    }
    if (borders) {
      borders.show = true;
      return;
    }
    try {
      borders = await Cesium.GeoJsonDataSource.load(
        'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_0_boundary_lines_land.geojson',
        { stroke: Cesium.Color.WHITE.withAlpha(0.7), strokeWidth: 1.6, clampToGround: true },
      );
      if (disposed) return;
      await viewer.dataSources.add(borders);
      borders.show = state.settings.borders;
    } catch {
      borders = null;
    }
  }

  // Route loading for options that travel by road.
  async function loadRoute() {
    const inc = current();
    const opt = state.pick && inc ? personalOptions(inc, state.home, state.profile, inc.ctx).find((o) => o.id === state.pick) : null;
    if (!opt?.dest) {
      state.route = null;
      return;
    }
    const token = (state.routeToken = (state.routeToken || 0) + 1);
    state.route = { status: 'loading', optId: opt.id };
    renderAssess();
    try {
      const raw = await fetchRoutes(state.home, opt.dest);
      if (token !== state.routeToken || disposed) return;
      const analysed = raw.map((r) => analyseRoute(r, inc));
      const { recommended } = rankRoutes(analysed);
      state.route = {
        status: 'ok', optId: opt.id, routes: analysed, selected: recommended.id, dest: opt.dest,
        label: opt.id === 'fly' ? 'Road route to the airport' : 'Drive destination',
      };
      const lons = analysed.flatMap((r) => r.coords.map((c) => c[0]));
      const lats = analysed.flatMap((r) => r.coords.map((c) => c[1]));
      const padLon = (Math.max(...lons) - Math.min(...lons)) * 0.25 + 0.05;
      const padLat = (Math.max(...lats) - Math.min(...lats)) * 0.25 + 0.05;
      viewer.camera.flyTo({
        destination: Cesium.Rectangle.fromDegrees(Math.min(...lons) - padLon, Math.min(...lats) - padLat, Math.max(...lons) + padLon, Math.max(...lats) + padLat),
        duration: 1.6,
      });
    } catch (err) {
      if (token !== state.routeToken) return;
      state.route = { status: 'error', message: err.message };
    }
    renderAssess();
    drawMap();
  }

  function fly(lat, lon, alt, pitch = -70) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat - (alt > 150000 ? 0 : alt / 111000 * 0.45), alt),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(pitch), roll: 0 },
      duration: 1.5,
    });
  }

  // Satellite pass: NASA GIBS daily true-colour for the incident's area and date.
  function syncSatellite() {
    if (satLayer) {
      viewer.imageryLayers.remove(satLayer, true);
      satLayer = null;
    }
    const inc = current();
    if (!state.sat.on || !inc) return;
    const d = state.sat.date;
    const r = 4;
    try {
      const provider = new Cesium.WebMapTileServiceImageryProvider({
        url: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${d}/250m/{TileMatrix}/{TileRow}/{TileCol}.jpeg`,
        layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
        style: 'default',
        format: 'image/jpeg',
        tileMatrixSetID: '250m',
        maximumLevel: 8,
        tileWidth: 256,
        tileHeight: 256,
        tilingScheme: new Cesium.GeographicTilingScheme(),
        rectangle: Cesium.Rectangle.fromDegrees(inc.lon - r * 1.6, inc.lat - r, inc.lon + r * 1.6, inc.lat + r),
        credit: 'NASA GIBS / VIIRS SNPP',
      });
      satLayer = viewer.imageryLayers.addImageryProvider(provider);
      satLayer.alpha = 0.95;
    } catch {
      state.sat.on = false;
    }
  }

  const isoDay = (ts) => new Date(ts).toISOString().slice(0, 10);
  const clampDay = (ts) => Math.min(ts, Date.now() - 36 * 3600_000);

  // ── Selection ─────────────────────────────────────────────────────────
  function select(id, { fly: doFly = true } = {}) {
    const inc = incident(id);
    if (!inc) return;
    state.selected = id;
    state.pick = null;
    state.route = null;
    state.brief = null;
    if (!state.tabs.includes(id)) state.tabs = [...state.tabs.slice(-2), id];
    state.sat = { on: false, date: isoDay(clampDay(inc.lastTs)) };
    syncSatellite();
    if (doFly) fly(inc.lat, inc.lon, Math.max(60000, TYPES[inc.type].radiusKm * 3200));
    renderAll();
  }

  function closeTab(id) {
    state.tabs = state.tabs.filter((t) => t !== id);
    state.route = null;
    state.pick = null;
    if (state.selected === id) {
      state.selected = state.tabs.at(-1) || null;
      state.sat.on = false;
      syncSatellite();
    }
    renderAll();
  }

  // ── Renderers ─────────────────────────────────────────────────────────
  function renderAll() {
    if (disposed) return;
    renderTabs();
    renderRail();
    renderDrawer();
    renderDossier();
    renderAssess();
    renderTimeline();
    drawMap();
    document.body.classList.toggle('ops-dossier-open', !dossier.hidden);
    document.body.classList.toggle('ops-incident', Boolean(current()));
  }

  function renderTabs() {
    tabs.innerHTML = state.tabs
      .map((id) => {
        const inc = incident(id);
        if (!inc) return '';
        return `<div class="ops-tab${id === state.selected ? ' active' : ''}" role="tab">
          <button type="button" data-tab="${id}"><i class="dot r-${riskLevel(inc.risk)}"></i>${esc(TYPES[inc.type].label)} · ${esc(inc.place)}</button>
          <button type="button" class="x" data-close-tab="${id}" aria-label="Close tab">×</button></div>`;
      })
      .join('');
  }
  tabs.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close-tab]');
    if (c) return closeTab(c.dataset.closeTab);
    const t = e.target.closest('[data-tab]');
    if (t) select(t.dataset.tab);
  });

  const APPS = [
    ['incidents', 'Incidents'],
    ['sources', 'Sources'],
    ['you', 'You'],
  ];
  function renderRail() {
    rail.innerHTML = APPS.map(
      ([id, label]) =>
        `<button type="button" data-app="${id}" class="${state.app === id ? 'active' : ''}" aria-label="${label}" title="${label}"><span aria-hidden="true">${ICON[id]}</span><span class="ops-rail-label">${label}</span></button>`,
    ).join('');
  }
  rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-app]');
    if (!b) return;
    state.app = b.dataset.app;
    renderAll();
  });

  const statusLine = () =>
    state.status === 'live'
      ? `LIVE · ${state.items.length} reports · ${state.sources.filter((s) => s.count).length}/${state.sources.length} sources`
      : state.status === 'loading'
        ? 'LOADING FEEDS…'
        : state.status === 'stale'
          ? 'FEEDS STALE'
          : 'FEEDS OFFLINE';

  function renderDrawer() {
    const head = (t, sub) =>
      `<header class="ops-head"><div><div class="ops-kicker">${esc(statusLine())}</div><h2>${t}</h2></div><span class="ops-sub">${sub}</span></header>`;
    if (state.app === 'incidents') {
      const list = state.incidents.filter((i) => state.filter === 'all' || i.type === state.filter);
      drawer.innerHTML =
        head('Incidents worldwide', `${list.length}`) +
        `<div class="ops-chips">${['all', ...Object.keys(TYPES)]
          .map((k) => `<button type="button" data-filter="${k}" class="${state.filter === k ? 'on' : ''}">${k === 'all' ? 'All' : TYPES[k].label}</button>`)
          .join('')}</div>
        <ul class="ops-list">${
          list.length
            ? list
                .map(
                  (i) => `<li><button type="button" class="ops-card${i.id === state.selected ? ' selected' : ''}" data-incident="${i.id}" style="--sevc:${riskColor(i.risk)}">
                    <span class="ops-rowtop"><span class="ops-type">${esc(TYPES[i.type].label)} · ${esc(i.place)}</span><span class="risk r-${riskLevel(i.risk)}">${i.risk}</span></span>
                    <span class="ops-title">${esc(i.title)}</span>
                    <span class="ops-meta">${ago(i.lastTs)} · ${i.items.length} report${i.items.length > 1 ? 's' : ''} · ${esc(i.sources.slice(0, 3).join(', '))} · ${fmtKm(i.dist)} from you</span>
                  </button></li>`,
                )
                .join('')
            : `<li class="ops-empty">${state.status === 'loading' ? 'Reading feeds…' : 'No incidents match right now.'}</li>`
        }</ul>`;
    } else if (state.app === 'sources') {
      const list = state.items.filter((i) => state.srcFilter === 'all' || i.kind === state.srcFilter).slice(0, 80);
      drawer.innerHTML =
        head('Sources', `${list.length}`) +
        `<div class="ops-chips">${['all', 'news', 'video']
          .map((k) => `<button type="button" data-srcfilter="${k}" class="${state.srcFilter === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`)
          .join('')}</div>
        <ul class="ops-list">${list
          .map(
            (i) => `<li><button type="button" class="ops-card src" data-item="${esc(i.id)}">
              ${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : '<span class="ph"></span>'}
              <span class="ops-rowtop"><span class="ops-type">${esc(i.source)}${i.kind === 'video' ? ' · ▶ VIDEO' : ''}</span><span class="ops-meta">${ago(i.ts)}</span></span>
              <span class="ops-title">${esc(i.title)}</span></button></li>`,
          )
          .join('')}</ul>`;
    } else {
      drawer.innerHTML =
        head('You', 'profile') +
        `<div class="ops-form">
          <label>Where are you?<select id="ops-home">${state.home.key === 'gps' ? '<option value="gps" selected>Your location (device)</option>' : ''}${HOME_CITIES.map((c) => `<option value="${c.key}"${c.key === state.home.key ? ' selected' : ''}>${c.name}</option>`).join('')}</select></label>
          <button type="button" class="ops-wide" data-locate style="margin:0;width:100%">Use my device location</button>
          <label class="chk"><input type="checkbox" id="ops-car"${state.profile.car ? ' checked' : ''}/> I have a car</label>
          <label class="chk"><input type="checkbox" id="ops-pass"${state.profile.passport ? ' checked' : ''}/> I can travel abroad (passport)</label>
          <button type="button" class="ops-cta" data-refresh>Refresh sources now</button>
          <h3>Source health</h3>
          <ul class="ops-health">${state.sources.map((s) => `<li><i class="${s.error ? 'bad' : 'ok'}"></i>${esc(s.name)}<span>${s.error ? esc(s.error) : s.count + ' items'}</span></li>`).join('')}</ul>
          <p class="ops-note">Incidents are inferred from headlines by keyword and place, scored for your location. Treat them as leads, not facts. In an emergency call 112 and follow your civil-defence alerts.</p>
        </div>`;
    }
  }
  drawer.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    const sf = e.target.closest('[data-srcfilter]');
    const i = e.target.closest('[data-incident]');
    const it = e.target.closest('[data-item]');
    if (f) {
      state.filter = f.dataset.filter;
      renderDrawer();
    } else if (sf) {
      state.srcFilter = sf.dataset.srcfilter;
      renderDrawer();
    } else if (i) select(i.dataset.incident);
    else if (it) openViewer(state.items.find((x) => x.id === it.dataset.item));
    else if (e.target.closest('[data-refresh]')) refresh();
    else if (e.target.closest('[data-locate]')) {
      navigator.geolocation?.getCurrentPosition(
        (pos) => setHome({ key: 'gps', name: 'Your location', lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => {
          const b = e.target.closest('[data-locate]');
          if (b) b.textContent = 'Location blocked — pick a city';
        },
        { maximumAge: 600000, timeout: 8000 },
      );
    }
  });
  drawer.addEventListener('change', (e) => {
    if (e.target.id === 'ops-home') {
      const c = HOME_CITIES.find((x) => x.key === e.target.value);
      if (c) setHome(c);
    } else if (e.target.id === 'ops-car' || e.target.id === 'ops-pass') {
      state.profile = { car: $('#ops-car').checked, passport: $('#ops-pass').checked };
      write(LS.profile, state.profile);
      renderAll();
    }
  });

  function setHome(h) {
    state.home = h;
    write(LS.home, h.key === 'gps' ? h : h.key);
    fly(h.lat, h.lon, 250000, -80);
    rebuild();
    refreshLive();
  }

  // Dossier
  function section(key, title, body) {
    return `<section class="dos-sec"><button type="button" class="dos-h" data-sec="${key}" aria-expanded="${state.open[key]}"><span>${state.open[key] ? '▾' : '▸'}</span>${title}</button>${state.open[key] ? `<div class="dos-b">${body}</div>` : ''}</section>`;
  }
  function briefBody(inc) {
    const b = state.brief && state.brief.id === inc.id ? state.brief : null;
    const ai = state.settings.ai;
    return `${b?.status === 'ok' ? `<p class="ai-text">${esc(b.text)}</p>` : b?.status === 'error' ? `<p class="ops-note" style="color:var(--signal-warn)">${esc(b.text)}</p>` : '<p class="ops-note">Plain-language summary of this incident, what is uncertain, and what to do.</p>'}
      <button type="button" class="ops-wide" style="margin:0;width:100%" data-brief ${b?.status === 'loading' ? 'disabled' : ''}>${b?.status === 'loading' ? 'Thinking…' : b?.status === 'ok' ? 'Regenerate' : 'Generate brief'}</button>
      <p class="ops-note">${esc(ai.model)} · <a href="#" data-open-settings>change in Settings</a></p>`;
  }

  async function makeBrief(inc) {
    state.brief = { id: inc.id, status: 'loading' };
    renderDossier();
    const opts = personalOptions(inc, state.home, state.profile, inc.ctx).slice(0, 3);
    const c = inc.ctx;
    const prompt = [
      `Person is in ${state.home.name}. Incident type: ${TYPES[inc.type].label} near ${inc.place} (${inc.country}), ${Math.round(inc.dist)} km away.`,
      `Risk to this person: ${inc.risk}/100. Reports: ${inc.items.length} from ${inc.sources.join(', ')}, latest ${ago(inc.lastTs)}.`,
      'Headlines:',
      ...inc.items.slice(0, 6).map((i) => `- ${i.source}: ${i.title}${i.summary ? ` — ${i.summary.slice(0, 160)}` : ''}`),
      c ? `Live tracking within range: ${c.civil.length} civil aircraft, ${c.military.length} military aircraft, ${c.vessels.length} vessels, airspace ${c.airspaceOpen === true ? 'operating' : c.airspaceOpen === false ? 'possibly closed' : 'unclear'}.` : '',
      'Top options computed:',
      ...opts.map((o) => `- ${o.title}: ${o.minutes} min, risk after ${o.after}, risk while doing ${o.exposure}`),
      state.route?.status === 'ok' ? `Chosen route: ${state.route.routes.find((r) => r.id === state.route.selected).minutes} min.` : '',
    ].filter(Boolean).join('\n');
    try {
      const text = await askAi(state.settings, {
        system: 'You help ordinary people decide how to stay safe near security incidents. Be calm, concrete and honest about uncertainty: separate what is reported from what is inferred. Never invent facts beyond the input. 5 short sentences max, plain language, no markup. Always remind them official civil-defence guidance and emergency services (112/911) override you.',
        prompt,
      });
      state.brief = { id: inc.id, status: 'ok', text };
    } catch (err) {
      state.brief = { id: inc.id, status: 'error', text: err.message };
    }
    renderDossier();
  }

  function liveBody(inc) {
    const c = inc.ctx;
    if (!c) return '<p class="ops-note">Loading live aircraft and ship tracks…</p>';
    const row = (p, extra) =>
      `<button type="button" class="lv-row" data-fly="${p.lat},${p.lon}"><i class="lv ${p.kind}"></i><span><b>${esc(p.label)}</b>${p.type ? ` · ${esc(p.type)}` : ''}<em>${fmtKm(p.d)}${extra ? ` · ${extra}` : ''}</em></span></button>`;
    const lines = [
      ...c.emergencies.slice(0, 3).map((p) => row(p, 'EMERGENCY squawk')),
      ...c.military.slice(0, 5).map((p) => row(p, p.alt ? `${Math.round(p.alt)} m` : 'military')),
      ...c.milVessels.slice(0, 3).map((p) => row(p, 'naval AIS')),
      ...c.stopped.slice(0, 3).map((p) => row(p, 'stopped / drifting')),
    ];
    const airspace = c.airspaceOpen === true ? 'civil flights operating' : c.airspaceOpen === false ? 'little or no civil traffic' : 'unclear';
    return `<div class="lv-grid">
        <div><b>${c.civil.length}</b><span>Civil aircraft</span></div>
        <div class="${c.military.length ? 'warn' : ''}"><b>${c.military.length}</b><span>Military aircraft</span></div>
        <div><b>${c.vessels.length}</b><span>Vessels (AIS)</span></div>
      </div>
      <p class="ops-note">Within ~${Math.round(Math.max(150, TYPES[inc.type].radiusKm * 1.5))} km. Airspace: ${airspace}.${c.errors.length ? ` Unavailable: ${esc(c.errors.join(', '))}.` : ''} Military aircraft that broadcast ADS-B only; many do not.</p>
      ${lines.join('') || '<p class="ops-note">Nothing unusual tracked nearby.</p>'}`;
  }

  function renderDossier() {
    const inc = current();
    dossier.hidden = !inc;
    if (!inc) return;
    const t = TYPES[inc.type];
    const bins = activitySeries(inc, 24);
    const max = Math.max(1, ...bins);
    const sat = state.sat;
    dossier.innerHTML = `
      <header class="dos-top">
        <span class="dos-badge" style="--c:${riskColor(inc.risk)}">${esc(t.label.slice(0, 2).toUpperCase())}</span>
        <div><h2>${esc(inc.title)}</h2><span class="ops-sub">${esc(t.label)} · ${esc(inc.place)} (${esc(inc.country)})</span></div>
        <button type="button" class="ops-x" data-dclose aria-label="Close dossier">×</button>
      </header>
      <button type="button" class="ops-wide" data-flyto>Project incident location</button>
      ${section('brief', 'AI BRIEF', briefBody(inc))}
      ${section('details', 'DETAILS', `
        <dl class="dos-dl">
          <dt>Risk to you</dt><dd><b class="r-${riskLevel(inc.risk)}">${inc.risk} · ${riskLevel(inc.risk)}</b></dd>
          <dt>Distance</dt><dd>${fmtKm(inc.dist)} from ${esc(state.home.name)}</dd>
          <dt>Confidence</dt><dd>${Math.round(inc.confidence * 100)}% (${inc.sources.length} outlet${inc.sources.length > 1 ? 's' : ''})</dd>
          <dt>First report</dt><dd>${ago(inc.firstTs)}</dd>
          <dt>Latest</dt><dd>${ago(inc.lastTs)}</dd>
          <dt>Threat radius</dt><dd>~${t.radiusKm} km (assumed)</dd>
          ${inc.ctx ? `<dt>Live traffic</dt><dd>${inc.ctx.bonus ? `+${inc.ctx.bonus} risk` : 'no change'}</dd>` : ''}
        </dl>`)}
      ${section('live', 'LIVE CONTEXT', liveBody(inc))}
      ${section('activity', 'ACTIVITY', `
        <div class="dos-cap">Reports per hour, last 24 h</div>
        <div class="dos-chart" role="img" aria-label="Reports per hour">${bins.map((n) => `<i style="height:${Math.max(2, (n / max) * 100)}%" title="${n}"></i>`).join('')}</div>
        <div class="dos-axis"><span>−24h</span><span>−12h</span><span>now</span></div>`)}
      ${section('obs', 'OBSERVATIONS', `
        <div class="obs-card">
          <div class="obs-h"><b>Satellite pass</b><span>NASA VIIRS · daily</span></div>
          <div class="obs-ctl">
            <button type="button" data-satday="-1" aria-label="Previous day">‹</button>
            <span class="obs-date">${esc(sat.date)}</span>
            <button type="button" data-satday="1" aria-label="Next day">›</button>
            <button type="button" class="obs-toggle${sat.on ? ' on' : ''}" data-sat>${sat.on ? 'Imagery on' : 'Show imagery'}</button>
          </div>
          <p class="ops-note">Replaces the map imagery around the incident with the chosen day. Coarse (250 m): good for smoke, cloud and burn scars, not for vehicles.</p>
        </div>
        ${inc.items
          .slice(0, 8)
          .map(
            (i) => `<button type="button" class="obs-item" data-item="${esc(i.id)}">
              ${i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"/>` : '<span class="ph"></span>'}
              <span><em>${esc(i.source)}${i.kind === 'video' ? ' · ▶' : ''} · ${ago(i.ts)}</em>${esc(i.title)}</span></button>`,
          )
          .join('')}`)}`;
  }
  dossier.addEventListener('click', (e) => {
    const inc = current();
    if (!inc) return;
    if (e.target.closest('[data-dclose]')) return closeTab(inc.id);
    if (e.target.closest('[data-flyto]')) return fly(inc.lat, inc.lon, 90000);
    if (e.target.closest('[data-brief]')) return makeBrief(inc);
    if (e.target.closest('[data-open-settings]')) {
      e.preventDefault();
      return openSettingsDialog();
    }
    const fl = e.target.closest('[data-fly]');
    if (fl) {
      const [la, lo] = fl.dataset.fly.split(',').map(Number);
      return fly(la, lo, 40000);
    }
    const sec = e.target.closest('[data-sec]');
    if (sec) {
      state.open[sec.dataset.sec] = !state.open[sec.dataset.sec];
      return renderDossier();
    }
    const day = e.target.closest('[data-satday]');
    if (day) {
      const d = Date.parse(`${state.sat.date}T00:00:00Z`) + Number(day.dataset.satday) * 86400000;
      state.sat.date = isoDay(Math.min(d, clampDay(Date.now())));
      syncSatellite();
      return renderDossier();
    }
    if (e.target.closest('[data-sat]')) {
      state.sat.on = !state.sat.on;
      syncSatellite();
      return renderDossier();
    }
    const it = e.target.closest('[data-item]');
    if (it) openViewer(state.items.find((x) => x.id === it.dataset.item));
  });

  // Source viewer
  function openViewer(item) {
    if (!item) return;
    state.viewing = item;
    viewerEl.hidden = false;
    viewerEl.innerHTML = `
      <div class="vw-box">
        <header><div><div class="ops-kicker">${esc(item.source)} · ${ago(item.ts)}</div><h2>${esc(item.title)}</h2></div><button type="button" class="ops-x" data-vclose aria-label="Close">×</button></header>
        ${
          item.videoId
            ? `<div class="vw-frame"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}?autoplay=1&rel=0" title="${esc(item.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
            : `${item.image ? `<img class="vw-img" src="${esc(item.image)}" alt="" referrerpolicy="no-referrer"/>` : ''}<p>${esc(item.summary || 'No summary supplied by the publisher.')}</p>`
        }
        <footer><a href="${esc(safeUrl(item.link))}" target="_blank" rel="noopener noreferrer">Open at ${esc(item.source)} ↗</a><span class="ops-note">Headlines are summarised by the publisher’s feed; read the full story at the source.</span></footer>
      </div>`;
  }
  viewerEl.addEventListener('click', (e) => {
    if (e.target === viewerEl || e.target.closest('[data-vclose]')) {
      viewerEl.hidden = true;
      viewerEl.innerHTML = '';
    }
  });

  function routePanel() {
    const rt = state.route;
    if (!rt) return '';
    if (rt.status === 'loading') return '<div class="rt-panel"><p class="ops-note">Finding routes…</p></div>';
    if (rt.status === 'error') return `<div class="rt-panel"><p class="ops-note">Couldn’t get a road route (${esc(rt.message)}). The straight-line distance is still shown in the option.</p></div>`;
    const sel = rt.routes.find((r) => r.id === rt.selected);
    const dur = (m) => (m >= 90 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
    return `<div class="rt-panel">
      <div class="rt-head"><b>${esc(rt.label)} · ${esc(rt.dest.name)}</b><span class="ops-note">Congestion is estimated from time of day and city size (no live traffic feed). Choke points are where traffic bunches.</span></div>
      <div class="rt-cards">${rt.routes
        .map(
          (r) => `<button type="button" class="rt-card${r.id === rt.selected ? ' on' : ''}" data-route="${r.id}">
            <span class="rt-tags">${r.recommended ? '<i class="rec">RECOMMENDED</i>' : ''}${r.tags.map((t) => `<i>${t}</i>`).join('')}</span>
            <span class="rt-eta">${dur(r.minutes)}<small>${fmtKm(r.km)}${r.extraMinutes ? ` · +${r.extraMinutes} min congestion` : ''}</small></span>
            <span class="coa-row"><em>Exposure</em><b class="r-${riskLevel(r.exposure)}">${r.exposure} · ${riskLevel(r.exposure)}</b></span>
            <span class="coa-row"><em>Closest to incident</em><b>${fmtKm(r.closestKm)}</b></span>
          </button>`,
        )
        .join('')}</div>
      <div class="rt-list">
        ${sel.congestion.length ? `<h4>Congestion (estimated)</h4>${sel.congestion.slice(0, 4).map((c) => `<span><i class="sw ${c.level > 0.55 ? 'hot' : 'warm'}"></i>${c.label}: about +${Math.max(1, Math.round(c.delayMin))} min</span>`).join('')}` : '<h4>Congestion</h4><span>No significant congestion expected.</span>'}
        <h4>Choke points on this route</h4>
        ${sel.chokepoints.length ? sel.chokepoints.slice(0, 5).map((k) => `<span><i class="sw ${k.inZone ? 'hot' : 'warm'}"></i>${esc(k.kind)}${k.name ? ` · ${esc(k.name)}` : ''} — ${k.inZone ? 'inside threat radius' : `${fmtKm(k.distKm)} from incident`} (${k.score})</span>`).join('') : '<span>None flagged.</span>'}
        <span class="ops-note">Avoid stopping, parking or queueing at red points while the threat is active.</span>
      </div>
    </div>`;
  }

  // Assessment: the decision surface
  function renderAssess() {
    const inc = current();
    assess.hidden = !inc;
    if (!inc) return;
    const opts = personalOptions(inc, state.home, state.profile, inc.ctx);
    const base = inc.risk;
    assess.innerHTML = `
      <header class="ops-a-head">
        <div><div class="ops-kicker">YOUR OPTIONS · ${esc(state.home.name.toUpperCase())}</div><h2>${esc(TYPES[inc.type].label)} near ${esc(inc.place)} — what to do</h2></div>
        <div class="ops-gauges">
          <div class="gauge"><span>Risk now</span><b class="r-${riskLevel(base)}">${base}</b><i>${riskLevel(base)}</i></div>
          <div class="gauge"><span>Confidence</span><b>${Math.round(inc.confidence * 100)}%</b><i>${inc.sources.length} outlets</i></div>
        </div>
      </header>
      <div class="ops-coas">${opts
        .map(
          (o, i) => `<button type="button" class="coa${state.pick === o.id ? ' picked' : ''}" data-coa="${o.id}">
            <span class="coa-rank">${i === 0 ? 'RECOMMENDED' : `OPTION ${i + 1}`}</span>
            <span class="coa-title">${esc(o.title)}</span>
            <span class="coa-row"><em>Time to complete</em><b>${o.minutes >= 90 ? `${Math.floor(o.minutes / 60)}h ${o.minutes % 60}m` : `${o.minutes} min`}</b></span>
            <span class="coa-row"><em>Risk after</em><b class="r-${riskLevel(o.after)}">${o.after} · ${riskLevel(o.after)}</b></span>
            <span class="coa-row"><em>Risk while doing</em><b class="r-${riskLevel(o.exposure * 2.5)}">${riskLevel(o.exposure * 2.5)}</b></span>
            <span class="coa-row"><em>Reversible</em><b>${o.reversible ? 'yes' : 'no'}</b></span>
            <span class="coa-bar"><i style="width:${o.score}%"></i></span>
            <span class="coa-effect">${esc(o.detail)}</span>
            <span class="coa-trade">${esc(o.why)}</span>
          </button>`,
        )
        .join('')}</div>
      ${routePanel()}
      <footer class="ops-a-foot">
        <span class="ops-human">Advisory only. You decide. Not official guidance — follow civil-defence alerts, call 112.</span>
        <button type="button" class="ops-cta" data-record ${state.pick ? '' : 'disabled'}>${state.pick ? 'Record my choice' : 'Choose an option'}</button>
      </footer>
      ${state.log.length ? `<div class="ops-log"><b>My choices</b>${state.log.slice(-3).reverse().map((l) => `<span>${new Date(l.t).toLocaleTimeString()} · ${esc(l.title)}</span>`).join('')}</div>` : ''}`;
  }
  assess.addEventListener('click', (e) => {
    const inc = current();
    const coa = e.target.closest('[data-coa]');
    if (coa) {
      state.pick = coa.dataset.coa;
      state.route = null;
      renderAssess();
      drawMap();
      return loadRoute();
    }
    const rc = e.target.closest('[data-route]');
    if (rc && state.route?.status === 'ok') {
      state.route.selected = rc.dataset.route;
      renderAssess();
      return drawMap();
    }
    if (e.target.closest('[data-record]') && state.pick && inc) {
      const o = personalOptions(inc, state.home, state.profile, inc.ctx).find((x) => x.id === state.pick);
      state.log.push({ t: Date.now(), id: o.id, title: `${o.title} (${inc.place})` });
      write(LS.log, state.log.slice(-50));
      state.pick = null;
      renderAll();
    }
  });

  // Timeline: lanes by source type; play sweeps a cursor through the window.
  function renderTimeline() {
    const now = Date.now();
    const start = now - WINDOW_H * 3600_000;
    const sel = current();
    const selIds = new Set(sel ? sel.items.map((i) => i.id) : []);
    const pos = (ts) => ((ts - start) / (now - start)) * 100;
    const lane = (kind) =>
      state.items
        .filter((i) => i.kind === kind && i.ts >= start && classifiedIds().has(i.id))
        .map((i) => {
          const off = state.cursor && i.ts > state.cursor;
          return `<button type="button" class="tl-sq ${kind}${selIds.has(i.id) ? ' hot' : ''}${off ? ' off' : ''}" style="left:${pos(i.ts)}%" data-item="${esc(i.id)}" title="${esc(i.source)} · ${esc(i.title)}"></button>`;
        })
        .join('');
    const ticks = [48, 36, 24, 12, 0]
      .map((h) => `<span style="left:${100 - (h / WINDOW_H) * 100}%">${h ? `−${h}h` : 'now'}</span>`)
      .join('');
    const cur = state.cursor ? pos(state.cursor) : 100;
    const nNews = state.items.filter((i) => i.kind === 'news' && classifiedIds().has(i.id) && i.ts >= start).length;
    const nVid = state.items.filter((i) => i.kind === 'video' && classifiedIds().has(i.id) && i.ts >= start).length;
    timeline.innerHTML = `
      <div class="tl-ctl">
        <b>Timeline</b>
        <button type="button" data-tl="rew" aria-label="Rewind">⏮</button>
        <button type="button" data-tl="play" class="${state.playing ? 'on' : ''}">${state.playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button type="button" data-tl="live" aria-label="Back to now">Live</button>
      </div>
      <div class="tl-main">
        <div class="tl-ticks">${ticks}</div>
        <div class="tl-lanes"><div class="tl-lane">${lane('news')}</div><div class="tl-lane">${lane('video')}</div></div>
        <div class="tl-cursor" style="left:${cur}%"></div>
      </div>
      <div class="tl-legend"><span><i class="news"></i>News <b>${nNews}</b></span><span><i class="video"></i>Video <b>${nVid}</b></span></div>`;
  }
  let _ids = { at: 0, set: new Set() };
  function classifiedIds() {
    if (_ids.at !== state.incidents.length + state.items.length) {
      _ids = { at: state.incidents.length + state.items.length, set: new Set(state.incidents.flatMap((i) => i.items.map((x) => x.id))) };
    }
    return _ids.set;
  }
  timeline.addEventListener('click', (e) => {
    const it = e.target.closest('[data-item]');
    if (it) return openViewer(state.items.find((x) => x.id === it.dataset.item));
    const b = e.target.closest('[data-tl]');
    if (!b) return;
    const now = Date.now();
    const start = now - WINDOW_H * 3600_000;
    if (b.dataset.tl === 'live') {
      stopPlay();
      state.cursor = null;
    } else if (b.dataset.tl === 'rew') {
      stopPlay();
      state.cursor = start;
    } else if (state.playing) stopPlay();
    else {
      state.playing = true;
      if (!state.cursor || state.cursor >= now - 60000) state.cursor = start;
      playTimer = setInterval(() => {
        state.cursor += (WINDOW_H * 3600_000) / 120;
        if (state.cursor >= Date.now()) {
          state.cursor = null;
          stopPlay();
        }
        renderTimeline();
        drawMap();
        renderDrawer();
      }, 100);
    }
    renderAll();
  });
  function stopPlay() {
    clearInterval(playTimer);
    state.playing = false;
  }

  function openSettingsDialog() {
    openSettings({ settings: state.settings, sources: state.sources, onChange: applySettings });
  }
  function applySettings(next) {
    const prev = state.settings;
    state.settings = next;
    _units = next.units;
    if (next.refreshMin !== prev.refreshMin) {
      clearInterval(poll);
      handler.destroy();
      if (borders) viewer.dataSources.remove(borders, true);
      poll = setInterval(refresh, next.refreshMin * 60_000);
    }
    syncBorders();
    applyFeeds();
    rebuild();
  }
  $('#ops-gear').addEventListener('click', openSettingsDialog);
  _units = state.settings.units;
  let poll = setInterval(refresh, state.settings.refreshMin * 60_000);
  const livePoll = setInterval(refreshLive, LIVE_MS);
  const tick = setInterval(() => {
    if (!state.playing) renderAll();
  }, 60_000);

  renderAll();
  refresh();
  refreshLive();
  syncBorders();

  return {
    destroy() {
      disposed = true;
      clearInterval(poll);
      clearInterval(livePoll);
      clearInterval(tick);
      stopPlay();
      for (const e of mapEntities) viewer.entities.remove(e);
      if (satLayer) viewer.imageryLayers.remove(satLayer, true);
      document.body.classList.remove('ops-open', 'ops-dossier-open');
      root.remove();
    },
  };
}

