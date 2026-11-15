// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Otávio.
// Sound engine: the one module the interface calls for sound. Owner: Otávio.
//
// This file is the front door. It sends each call to the music of the record under the needle:
//   - the fire record and the sea surface temperature record have music of their own (engine-fire.js, engine-sea.js):
//     real recorded instruments, composed live from the data. On the sea record that is Play through time; a single
//     reading, the legend and Compare keep the label rules (the reference tone at normal, unison or beating);
//   - every other record uses the label rules (engine-label.js): synthesized, pitch from the position on the colorbar.
// No data always sounds as the dead groove (a soft vinyl crackle), on every record: never silence, never a low note.
//
// The engine never speaks and never changes the page. To know which record and which place are under the needle it
// reads the page address (?record=...&place=...), which the interface keeps up to date (contract 2.2). The address
// leaves out what is the default: no record means the first one of records.json, no place means the default_place
// of the record. The interface may also say it directly with setContext().

import * as label from "./engine-label.js";
import * as fire from "./engine-fire.js";
import * as sea from "./engine-sea.js";

const DATA = new URL("../data/", import.meta.url).href;
const FIRE = "fire";                  // the id of the fire record in web/data/records.json
const SEA = "sst-anomaly";            // the id of the sea surface temperature record
const MUSIC = { [FIRE]: fire, [SEA]: sea };      // the records with music of their own

let told = {};                        // what the interface said with setContext()
let places = null;                    // place id -> { lat, lon }, from web/data/places.json
let firstRecord = null;               // the id of the first record of web/data/records.json: the default one
const metas = new Map();              // record id -> its meta.json
let labelRecord = null;               // the record the label rules are set for
let token = 0;                        // bumps on every stop and every new play, so a late start can be dropped

const ok = (s) => !!s && !s.nodata && s.v01 != null;

/**
 * Optional: tell the engine what is under the needle, instead of letting it read the page address.
 * ctx = { record?: string (record id), lat?: number, lon?: number }. Pass null to go back to the page address.
 */
export function setContext(ctx) {
  told = ctx || {};
  prepare(context().record);
}

/** Optional, kept from the first engine: tell the engine which record is playing, by its meta.json. */
export function setRecord(meta) {
  if (!meta) return;
  told = { ...told, record: meta.id };
  labelRecord = meta.id;
  label.setRecord(meta);
  prepare(meta.id);
}

function context() {
  const q = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const record = told.record || q.get("record") || firstRecord;
  let lat = q.has("lat") ? Number(q.get("lat")) : null;
  let lon = q.has("lon") ? Number(q.get("lon")) : null;
  const named = places && places.get(q.get("place") || (metas.get(record) || {}).default_place);
  if (named) { lat = named.lat; lon = named.lon; }
  if (told.lat != null && told.lon != null) { lat = told.lat; lon = told.lon; }
  return { record, lat, lon };
}

// The label rules change with the record (a reference tone for anomalies, for example): keep them in step.
function syncLabel(record) {
  if (!record || record === labelRecord || !metas.has(record)) return;
  labelRecord = record;
  label.setRecord(metas.get(record));
}

// The recordings of a record are large (about 9.5 MB for the fire, 18 MB for the sea), so each set is only asked for
// when its record is under the needle. Asking again is free. Returns the music of that record, if it has one.
function prepare(record) {
  const music = MUSIC[record] || null;
  if (music && typeof window !== "undefined" && window.Tone) music.attach(window.Tone);      // Tone is there once start() ran
  return music;
}
// Let go of whatever the recorded instruments are sounding, except for the one that is about to play.
function releaseMusic(keep) {
  for (const music of Object.values(MUSIC)) if (music !== keep) music.release();
}

// The small index of the data: which record is the default one, the default place of each record, where each place is.
let index = null;
function loadIndex() {
  if (!index) index = (async () => {
    const json = async (path) => { const r = await fetch(DATA + path); if (!r.ok) throw new Error(path); return r.json(); };
    try {
      const [records, list] = await Promise.all([json("records.json"), json("places.json")]);
      places = new Map(list.map((p) => [p.id, { lat: p.lat, lon: p.lon }]));
      firstRecord = records.length ? records[0].id : null;
      await Promise.all(records.map(async (r) => { try { metas.set(r.id, await json(r.meta)); } catch (_) { /* that record keeps the plain scale */ } }));
    } catch (_) { index = null; /* without the index the record must be in the address; it is asked for again next time */ }
  })();
  return index;
}

export async function start() {
  await label.start();                // loads Tone.js and opens the audio (must come from a user gesture)
  prepare(context().record);          // the recordings of the record under the needle load in the background
  // the index is four small files; do not hold the start for it longer than a moment
  await Promise.race([loadIndex(), new Promise((r) => setTimeout(r, 700))]);
  loadIndex().then(() => prepare(context().record));      // the default record is only known with the index
}

export function isRunning() {
  return label.isRunning();
}

export async function legend() {
  const c = context();
  syncLabel(c.record);
  prepare(c.record);
  if (c.record === FIRE && fire.canRead()) { releaseMusic(fire); return fire.legend(); }
  releaseMusic();
  return label.legend();
}

export function needleDrop() {
  label.needleDrop();
}

export function play(sample) {
  const c = context();
  syncLabel(c.record);
  prepare(c.record);
  if (c.record === FIRE && ok(sample) && fire.canRead()) { releaseMusic(fire); fire.reading(sample.v01); return; }
  releaseMusic();
  label.play(sample);                 // also the dead groove of every record, and the fire record while its recordings load
}

// The interface gives the tempo as one date per beat (opts.bpm); the label rules count two steps per beat unless told.
const perBeat = (opts) => ({ ...opts, stepsPerBeat: opts.stepsPerBeat || 1 });

export async function playTurns(samples, opts = {}) {
  const c = context();
  syncLabel(c.record);
  const mine = ++token;
  const music = prepare(c.record);
  if (music && samples && samples.some(ok)) {
    label.stop();
    releaseMusic(music);
    try {
      await music.whenReady();
    } catch (err) {
      console.warn("[sound] The recordings of this record did not load; using the label rules.", err);
      return mine === token ? label.playTurns(samples, perBeat(opts)) : undefined;
    }
    if (mine !== token) return undefined;      // stopped while the recordings were loading
    music.setPlace(c.lat, c.lon);
    return music.playRecord(samples.map((s) => (ok(s) ? s.v01 : null)), {
      onMonth: opts.onStep,
      onGap: (time, seconds) => label.deadGroove(seconds, time),
    });
  }
  releaseMusic();
  return label.playTurns(samples, perBeat(opts));
}

export function compare(a, b) {
  const c = context();
  syncLabel(c.record);
  prepare(c.record);
  if (c.record === FIRE && ok(a) && ok(b) && fire.canRead()) { releaseMusic(fire); fire.compare(a.v01, b.v01); return; }
  releaseMusic();
  label.compare(a, b);
}

/**
 * Optional: how long one date lasts in playTurns for the record under the needle, in milliseconds
 * (for pictures that follow the sound). opts = { bpm?, stepsPerBeat? }, as given to playTurns.
 */
export function stepMs(opts = {}) {
  const c = context();
  if (MUSIC[c.record]) return Math.round(MUSIC[c.record].monthSeconds(c.lat, c.lon) * 1000);
  return Math.round(60000 / (opts.bpm || 84) / (opts.stepsPerBeat || 1));
}

export function duck(ms) {
  label.duck(ms);
  for (const music of Object.values(MUSIC)) music.duck(ms);
}

export function stop() {
  token += 1;
  label.stop();
  for (const music of Object.values(MUSIC)) music.stop();
}

/** Debug helpers for the dev test pages (not used by the app). */
export function _debugLevel() {
  return Math.max(label._debugLevel(), fire._debugLevel(), sea._debugLevel());
}
export function _debugNodes() {
  return label._debugNodes();
}
export const _debug = { label, fire, sea, context };
