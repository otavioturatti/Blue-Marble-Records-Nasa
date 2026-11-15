// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Data access for the player: records, places, per-record meta and frame sampling.
// Implements the data part of the team's interface contract. Pure helpers are exported for tests.

const DATA_ROOT = "data/";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return res.json();
}

/** Accept a bare array (contract) or an object wrapping it ({ records: [...] } / { places: [...] }). */
function asList(json, key) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json[key])) return json[key];
  return [];
}

/** records.json entries with an id and a meta path (contract 2.1). */
export function normalizeRecords(json) {
  return asList(json, "records")
    .filter((r) => r && r.id)
    .map((r) => ({ ...r, meta: r.meta || `${r.id}/meta.json` }));
}

/** places.json entries with numeric lat/lon and a lowercase surface (contract 2.2). Bad entries are dropped. */
export function normalizePlaces(json) {
  const out = [];
  for (const p of asList(json, "places")) {
    const lat = Number(p?.lat ?? p?.latitude);
    const lon = Number(p?.lon ?? p?.lng ?? p?.longitude);
    if (!p?.id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const surface = String(p.surface || "").toLowerCase();
    out.push({ ...p, name: p.name || p.id, lat, lon, surface: surface === "ocean" || surface === "land" ? surface : "" });
  }
  return out;
}

/**
 * meta.json made safe for the UI (contract 2.3), without changing its meaning:
 * dates as sorted ISO strings (also from { date } objects), compare always a list,
 * scale numbers as numbers, and the contract's 1-degree grid when grid is missing.
 */
export function normalizeMeta(meta) {
  const m = { ...meta };
  const dates = (Array.isArray(m.dates) ? m.dates : [])
    .map((d) => (typeof d === "string" ? d : d?.date))
    .filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d))
    .map((d) => d.slice(0, 10));
  m.dates = [...new Set(dates)].sort();
  m.compare = Array.isArray(m.compare) ? m.compare : m.compare ? [m.compare] : [];
  m.compare = m.compare.filter((c) => c && c.place && c.a && c.b);
  const s = m.scale || {};
  m.scale = { ...s, min: Number(s.min ?? 0), max: Number(s.max ?? 1), kind: s.kind || "sequential" };
  m.grid = m.grid || { width: 360, height: 180, lat0: 89.5, lon0: -179.5, step: 1 };
  m.frames = m.frames || "frames/{date}.png";
  m.display = m.display || "display/{date}.jpg";
  m.display_hd = m.display_hd || null; // optional 2048 x 1024 version of the display image
  m.display_uhd = m.display_uhd || null; // optional 4096 x 2048 version (native resolution)
  // Optional colorbar images (an image path only: a text field of the same name is ignored).
  const image = (x) => (typeof x === "string" && /\.(png|jpe?g|webp|svg)$/i.test(x) ? x : null);
  m.colorbar = image(m.colorbar); // the published colorbar, with labels
  m.colorbar_strip = image(m.colorbar_strip); // 1024 x 16 gradient, scale min to max
  m.disc = m.disc || "disc/{date}.jpg";
  // Optional 256 px copy of the disc, for the small pictures of it (the readout, the record list).
  m.disc_thumb = typeof m.disc_thumb === "string" && m.disc_thumb.includes("{date}") ? m.disc_thumb : null;
  m.synthetic = m.synthetic === true;
  return m;
}

export async function loadRecords(root = DATA_ROOT) {
  return normalizeRecords(await fetchJson(`${root}records.json`));
}

export async function loadPlaces(root = DATA_ROOT) {
  return normalizePlaces(await fetchJson(`${root}places.json`));
}

export async function loadMeta(record, root = DATA_ROOT) {
  const url = `${root}${record.meta}`;
  const meta = normalizeMeta(await fetchJson(url));
  meta.__base = url.slice(0, url.lastIndexOf("/") + 1);
  return meta;
}

/** URL of a file that sits next to meta.json (e.g. validation.csv), or null. */
export function siblingUrl(meta, file) {
  return file ? meta.__base + file : null;
}

/** The Compare pair a record suggests for a place (meta.compare), or null. */
export function compareFor(meta, placeId) {
  return (meta?.compare || []).find((c) => c.place === placeId && meta.dates.includes(c.a) && meta.dates.includes(c.b)) || null;
}

/**
 * The date a record opens on for a place (no date in the address): the record's FIRST date, like
 * every place chosen afterwards, so the first Play is the whole music from its start and the disc
 * fills from its first groove. The published Compare pair keeps its own dates (Compare moves to them).
 */
export function openingDate(meta, placeId) {
  return meta.dates[0];
}

/**
 * The date after a place is chosen: the record's FIRST date, so the whole record can be heard from
 * the start. A dot (on the globe or the NASA frame) always goes back to it, even on the place
 * already selected; the place list goes back to it for a different place and keeps the date shown
 * when the same place is chosen again (and the record has that date).
 */
export function dateForChoice(meta, { placeId, prevPlaceId, prevDate, dot = false }) {
  if (!dot && placeId === prevPlaceId && prevDate && meta.dates.includes(prevDate)) return prevDate;
  return meta.dates[0];
}

/**
 * The second date Compare offers by default when the place has no published pair: about a year
 * before the date shown, or a year after when the record does not reach that far back (so from the
 * first date the default is a year later); never the date shown itself.
 */
export function yearApart(dates, date) {
  const ms = (d) => Date.parse(`${d}T00:00:00Z`);
  const near = (target) => dates.reduce((best, d) => (Math.abs(ms(d) - target) < Math.abs(ms(best) - target) ? d : best), dates[0]);
  const day = 86400000;
  const before = near(ms(date) - 365 * day);
  if (before !== date && Math.abs(ms(before) - (ms(date) - 365 * day)) <= 45 * day) return before;
  const after = near(ms(date) + 365 * day);
  if (after !== date) return after;
  return dates.find((d) => d !== date) || date;
}

/**
 * Which record suits a place, decided by the data, in this order:
 * an explicit hint on the place (place.record or place.records[0]), a record whose
 * default_place or Compare pair is this place, a record whose meta.surface matches
 * the place's surface, then the first record.
 */
export function recordForPlace(records, metas, place) {
  const ids = records.map((r) => r.id);
  const metaOf = (id) => (metas instanceof Map ? metas.get(id) : metas?.[id]);
  const hint = place?.record || (Array.isArray(place?.records) ? place.records[0] : null);
  if (hint && ids.includes(hint)) return hint;
  const byDefault = ids.find((id) => metaOf(id)?.default_place === place?.id);
  if (byDefault) return byDefault;
  const byCompare = ids.find((id) => (metaOf(id)?.compare || []).some((c) => c.place === place?.id));
  if (byCompare) return byCompare;
  const bySurface = ids.find((id) => place?.surface && metaOf(id)?.surface === place.surface);
  return bySurface || ids[0];
}

/** True when a record covers a place: same surface, or the record names no surface. */
export function covers(meta, place) {
  return !meta?.surface || place?.surface === meta.surface;
}

/** The places a record covers, in list order (contract 2.2: ocean places for an ocean record). */
export function placesFor(places, meta) {
  return places.filter((p) => covers(meta, p));
}

const RAD = Math.PI / 180;

/** Great-circle distance in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The closest place to a latitude and longitude (within maxKm), or null. Old links with lat and lon use it. */
export function nearestPlace(places, lat, lon, maxKm = Infinity) {
  let best = null;
  let bestKm = Infinity;
  for (const p of places) {
    const km = distanceKm(lat, lon, p.lat, p.lon);
    if (km < bestKm) { best = p; bestKm = km; }
  }
  return bestKm <= maxKm ? best : null;
}

/** Path of a frame, display or disc image for a date, relative to the page. */
export function assetUrl(meta, key, date) {
  return meta.__base + meta[key].replace("{date}", date);
}

/**
 * The record's south polar disc for a date. thumb: the 256 px copy when the record publishes one
 * (meta.disc_thumb), for pictures drawn at under 100 px; otherwise the 1024 px disc.
 */
export function discUrl(meta, date, { thumb = false } = {}) {
  return assetUrl(meta, thumb && meta.disc_thumb ? "disc_thumb" : "disc", date);
}

/**
 * The NASA frame image for a date. size: false or "sd" (1024 px), true or "hd" (2048 px),
 * "uhd" (4096 px). A size the record does not publish falls back to the next smaller one.
 */
export function displayUrl(meta, date, size = false) {
  const want = size === true ? "hd" : size || "sd";
  if (want === "uhd" && meta.display_uhd) return assetUrl(meta, "display_uhd", date);
  if ((want === "uhd" || want === "hd") && meta.display_hd) return assetUrl(meta, "display_hd", date);
  return assetUrl(meta, "display", date);
}

/** Longitude wrapped into [-180, 180). */
export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Grid cell for a lat/lon, using the contract formula, clamped to the grid. */
export function cellFor(grid, lat, lon) {
  const row = Math.floor((grid.lat0 - lat) / grid.step + 0.5);
  const col = Math.floor((wrapLon(lon) - grid.lon0) / grid.step + 0.5);
  return { row: clamp(row, 0, grid.height - 1), col: clamp(col, 0, grid.width - 1) };
}

/** Pixel value p (0..255) to a sample. p = 0 is no data. */
export function decodePixel(p) {
  if (p === 0) return { v01: null, nodata: true };
  return { v01: (p - 1) / 254, nodata: false };
}

/** Read the sample under the needle from an ImageData-like object (red channel). */
export function readSample(meta, imageData, lat, lon) {
  const { row, col } = cellFor(meta.grid, lat, lon);
  const p = imageData.data[(row * imageData.width + col) * 4];
  return { ...decodePixel(p), p };
}

/**
 * Which ends of a scale saturate. scale.saturates may be true, "both", "max"/"high" or "min"/"low".
 * A sequential scale that starts at 0 (a density) has no low saturation: p = 1 is a true zero.
 */
export function saturationEnds(scale) {
  const s = scale?.saturates;
  const max = s === true || s === "both" || s === "max" || s === "high";
  let min = s === true || s === "both" || s === "min" || s === "low";
  if (scale?.kind !== "diverging" && Number(scale?.min) === 0) min = false;
  return { max, min };
}

/**
 * Physical value for display. Returns null for no data.
 * saturated is "max" or "min" when that end of the scale saturates and the pixel sits on it.
 */
export function physicalValue(meta, sample) {
  if (!sample || sample.nodata || sample.v01 == null) return null;
  const { min, max } = meta.scale;
  const ends = saturationEnds(meta.scale);
  let saturated = null;
  if (ends.max && sample.p === 255) saturated = "max";
  if (ends.min && sample.p === 1) saturated = "min";
  return { value: min + sample.v01 * (max - min), saturated };
}

function loadImageData(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

const frameCache = new Map();

/** Retry a load after each delay (ms) before giving up: a network hiccup must not stop a Play. */
export async function withRetry(load, delays = [400, 1200], wait = (ms) => new Promise((r) => setTimeout(r, ms))) {
  for (let i = 0; ; i++) {
    try {
      return await load();
    } catch (err) {
      if (i >= delays.length) throw err;
      await wait(delays[i]);
    }
  }
}

/** Load a frame PNG into ImageData (cached per record and date), tried three times. Browser only. */
export function loadFrame(meta, date) {
  const key = `${meta.id}|${date}`;
  if (!frameCache.has(key)) {
    const p = withRetry(() => loadImageData(assetUrl(meta, "frames", date)));
    p.catch(() => frameCache.delete(key));
    frameCache.set(key, p);
  }
  return frameCache.get(key);
}
