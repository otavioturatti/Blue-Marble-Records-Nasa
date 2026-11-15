// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Blue Marble Records player. Native controls drive one state object; sound, text and the stage
// picture (the globe with the record's disc around it) follow it. It follows the team's interface contract.

import { loadRecords, loadPlaces, loadMeta, loadFrame, readSample, recordForPlace, compareFor, physicalValue, placesFor, covers, nearestPlace, discUrl, openingDate, dateForChoice, yearApart } from "./data.js";
import { renderGuide } from "./ui/guide.js";
import { loadEngine, loadDj } from "./ui/deps.js";
import { createAnnouncer, duckMs } from "./ui/announcer.js";
import { setLang, getLang, t } from "./ui/i18n.js";
import { dateText, monthText, monthYearText, pairText, latText, lonText } from "./ui/valuetext.js";
import { formatValue, normalWord, compactValue } from "./ui/format.js";
import { localizeData } from "./ui/names.js";
import { createPlaceList, linkQuery, selectionCode } from "./ui/places.js";
import * as view from "./ui/view.js";
import * as haptics from "./ui/haptics.js";
import { createVoice, linesFor, lineText, placeLine, FULL_POLICY } from "./ui/voice.js";
import { splitLine, GUARD_MS, FOCUS_MS } from "./ui/pace.js";
import { TOUR, stopRange, inputKind, remoteKey, gateKey, choiceSaysScreenReader, guidedKey, touchGesture, gateDecision, isDoubleTap, GATE_OPTIONS } from "./ui/tour.js";

const $ = (id) => document.getElementById(id);
// Play through time: one date every two beats of the label's 84 BPM. Change PLAY_BPM alone:
// the engine gets it as bpm and the pictures get the same step length in milliseconds.
const PLAY_BPM = 42;
const STEP_MS = Math.round(60000 / PLAY_BPM); // about 1429 ms per date (the fallback, see stepLength)
const COMPARE_SOUND_MS = 1600; // the Compare beat lasts 1.6 s; its sentence waits for it
const HINTS = 2; // the "press Enter to play" hint follows the first selections of a session
const BRAND = "Blue Marble Records";
// Letters the player uses as shortcuts; in the place list, every other letter jumps to a place.
const SHORTCUTS = new Set(["p", "c", "l", "w", "v", "d", "n", "s", "h", "g"]);
const ZOOM_STEP = 1.15; // + and - zoom the globe in and out by about 15% per press

const state = {
  records: [],
  places: [],
  metas: new Map(),
  meta: null,
  placeId: null, // always one of the saved places
  dateIndex: 0,
  compareDate: null,
  started: false,
  playing: false,
  compareOn: false,
  introduced: new Set(), // records whose introduction the voice guide has said this session
  sample: null,
};

let engine = null;
let dj = null;
// The voice guide (ui/voice.js): optional, off by default on touch screens, remembered here.
let voice = null;
let comparedOnce = false; // the voice's first Compare line
let comparedBefore = false; // the page's first Compare sentence
const VOICE_KEY = "bmr-voice";
// A screen reader is likely on a touch screen when a trusted click comes with no touchstart just
// before it (a screen reader's double tap). It only ever moves the voice to its safe policy.
let srLikely = false;
let fingerProven = false; // a raw touch woke the gate: the finger wording for the whole session
let pendingPlay = 0; // the token of a Play that is waiting to start (0: none)
// The gate speaks: a raw touch or key that reached the page (no screen reader swallowed it) wakes the
// app's voice, which says the gate's prompt (G01t, G01). The voice tour on a touch layout then takes
// taps and swipes anywhere (voiceTouch).
let gateWoken = false;
let voiceTouch = false;
let lastRawPointerAt = -Infinity;
let gateSelected = "b"; // the gate's option chosen and not yet confirmed (after the wake)
let lastGateTap = null; // { t, x, y } of the last raw tap on the gate, for the double tap
let lastTouchAt = -Infinity;
/**
 * The voice's policy: the visitor chooses the voice explicitly at the entrance (off by default), so
 * with the voice on the whole script plays; with it off nothing speaks and the page's own sentences
 * go to the live region (the tour design: no screen reader detection).
 */
const voicePolicy = () => FULL_POLICY;
// The engine module itself, for its optional calls (setRecord, setContext, stepMs) that the guarded
// engine from deps.js does not pass through; null with the simulator. Every call is guarded.
let engineExtra = null;
let stepNow = STEP_MS; // the length of one date of the Play under way, in ms
let announcer = null;
let placeList = null;
let updateToken = 0;
let playToken = 0;
let lastTone = 0;
let hintsGiven = 0;
let consoleCollapsed = false;
// The console steps aside while Play runs on the desktop layout (stepAside): autoCollapsed says it
// was closed by that rule (so it reopens by itself), lastInput the kind of the last real gesture.
let autoCollapsed = false;
let lastInput = "pointer";
let waitTimer = 0; // "Loading the instruments" if a Play has not sounded its first date in time
// Choosing a place plays it: after the lead-in (the place's single reading, about 3 s) Play starts
// by itself from the first date. A newer choice, Stop, a date change or a Compare cancels it.
const AUTO_PLAY_MS = 3000;
let autoTimer = 0;
let autoToken = 0;
let freshPlace = true; // the place was just chosen: its Play starts from the first date
let pausedHere = false; // a Pause at this place: Enter continues from where it stopped
const INSTRUMENTS_WAIT_MS = 3000;
let speechTimer = 0; // a sentence waiting for its sound to finish (Compare), cancelled by Stop
let legendToken = 0;
let wakeLock = null;
let dialogReturn = null; // where the focus was when a dialog opened
// Single-key shortcuts everywhere in the player, or on the place list only (an option in the
// keyboard guide, remembered on this device; WCAG 2.1.4 asks for a way to turn them off).
let lettersOn = true;
try { lettersOn = localStorage.getItem("bmr-letters") !== "off"; } catch { /* storage blocked */ }

// A touch screen with no hover (a phone or a tablet): the words say "tap" and name the buttons
// instead of keys (there is no Enter or Esc key there).
const touchQuery = window.matchMedia("(hover: none) and (pointer: coarse)");
const touchUi = () => touchQuery.matches;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Short month and year, with the day only when a month holds more than one date: decided once per record.
const withDayCache = new WeakMap();
function withDayFor(meta) {
  if (!withDayCache.has(meta)) withDayCache.set(meta, new Set(meta.dates.map((d) => d.slice(0, 7))).size !== meta.dates.length);
  return withDayCache.get(meta);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** True when this Compare plays the place's published pair (its voice line cites it). */
function isPublishedPair(pair, dateB, meta) {
  return !!pair && ((currentDate() === pair.a && dateB === pair.b) || (currentDate() === pair.b && dateB === pair.a)) && !!meta;
}

/** Speak after a sound has finished (Compare's beat), unless Stop or another action comes first. */
function sayAfter(ms, text) {
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => { speechTimer = 0; announcer.say(text); }, ms);
}

const currentDate = () => state.meta.dates[state.dateIndex];
const currentPlace = () => state.places.find((p) => p.id === state.placeId) || state.places[0];
const coveredPlaces = () => placesFor(state.places, state.meta);

function djCtx(extra = {}) {
  return { lang: getLang(), record: state.meta, place: currentPlace(), date: currentDate(), sample: state.sample, ...extra };
}

/** The record's note for the Compare now set up (same place, same two dates), or "". */
function compareNote() {
  const pair = compareFor(state.meta, state.placeId);
  if (!pair) return "";
  const both = new Set([currentDate(), state.compareDate]);
  return both.has(pair.a) && both.has(pair.b) ? pair.note || "" : "";
}

/* ---------- Defaults and the URL ---------- */

/** Date a record opens on for a place: the first date of its Compare pair, else the last date. */
function defaultDate(meta, placeId) {
  return openingDate(meta, placeId);
}

/**
 * The URL keeps only what differs from the defaults: ?record=&place=&date=&lang=pt-BR. An old
 * link's view=deck (the retired turntable tab) is ignored on reading and dropped here.
 */
function writeUrl() {
  if (!state.meta) return;
  const s = linkQuery(
    { record: state.meta.id, place: state.placeId, date: currentDate(), lang: getLang() },
    { record: state.records[0].id, place: state.meta.default_place, date: defaultDate(state.meta, state.placeId), lang: "en" },
  );
  history.replaceState(null, "", s ? `?${s}` : location.pathname);
}

/**
 * Record, place and date asked for by a link. A place wins over a record that does not cover it;
 * an old link with lat and lon goes to the nearest saved place.
 */
function fromUrl(params) {
  let recordId = state.metas.has(params.get("record")) ? params.get("record") : null;
  let place = state.places.find((p) => p.id === params.get("place")) || null;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!place && params.has("lat") && params.has("lon") && Number.isFinite(lat) && Number.isFinite(lon)) {
    const pool = recordId ? placesFor(state.places, state.metas.get(recordId)) : state.places;
    place = nearestPlace(pool.length ? pool : state.places, lat, lon);
  }
  if (place && (!recordId || !covers(state.metas.get(recordId), place))) recordId = recordForPlace(state.records, state.metas, place);
  return { recordId: recordId || state.records[0].id, placeId: place?.id, date: params.get("date") || undefined, named: !!place };
}

/** Call an optional engine function (contract 3) when the real engine has it; never throws. */
function engineCall(name, ...args) {
  try { return typeof engineExtra?.[name] === "function" ? engineExtra[name](...args) : undefined; } catch { return undefined; }
}

/**
 * The length of one date of Play for the record and place under the needle: the engine's own
 * stepMs when it has one (a fire date lasts two bars at the place's tempo, 3.6 to 4.1 s), else one
 * date every PLAY_BPM beat. Every picture that steps with the dates uses it.
 */
function stepLength() {
  const ms = Number(engineCall("stepMs", { bpm: PLAY_BPM }));
  return Number.isFinite(ms) && ms >= 200 && ms <= 20000 ? ms : STEP_MS;
}

/** Tell the engine what is under the needle (it also reads the page address; this is direct). */
function tellEngine() {
  if (!state.meta) return;
  const p = currentPlace();
  engineCall("setContext", { record: state.meta.id, lat: p?.lat, lon: p?.lon });
}

/** Every picture that turns or steps once per date takes this length (ms). */
function setStepPictures(ms) {
  stepNow = ms;
  document.documentElement.style.setProperty("--turn", `${ms}ms`);
  view.setTurnMs(ms);
}

/* ---------- Building the controls ---------- */

function buildRecords() {
  const list = $("records-list");
  const tpl = $("tpl-record");
  list.replaceChildren();
  for (const rec of state.records) {
    const meta = state.metas.get(rec.id);
    const row = tpl.content.firstElementChild.cloneNode(true);
    const input = row.querySelector("input");
    input.value = rec.id;
    input.addEventListener("change", () => changeRecord(rec.id));
    const img = row.querySelector('[data-slot="img"]');
    if (img) {
      // The 256 px copy of the disc when the record has one (the picture is 56 px); a missing copy
      // falls back to the full disc once.
      const lastDate = meta.dates[meta.dates.length - 1];
      const full = discUrl(meta, lastDate);
      img.onerror = () => { if (img.getAttribute("src") !== full) img.src = full; };
      img.src = discUrl(meta, lastDate, { thumb: true });
    }
    const title = row.querySelector('[data-slot="title"]');
    const short = row.querySelector('[data-slot="short"]');
    title.textContent = rec.title;
    short.textContent = meta.short || "";
    // One short name per record ("Sea: ocean temperature"); the visible texts are hidden from the tree.
    input.setAttribute("aria-label", t(rec.id === "fire" ? "recordAriaFire" : "recordAriaSea"));
    // The record's letter, the first letter of its places' selection codes (A01, B01).
    const side = row.querySelector('[data-slot="side"]');
    if (side) side.textContent = selectionCode(state.records.indexOf(rec), 0).slice(0, 1);
    list.append(row);
  }
  $("records").disabled = false;
}

function relabelRecords() {
  for (const input of document.querySelectorAll('input[name="record"]')) {
    const row = input.closest("label") || input.parentElement;
    const rec = state.records.find((r) => r.id === input.value);
    const meta = state.metas.get(input.value);
    if (rec) row.querySelector('[data-slot="title"]').textContent = rec.title;
    if (meta) row.querySelector('[data-slot="short"]').textContent = meta.short || "";
    input.setAttribute("aria-label", t(input.value === "fire" ? "recordAriaFire" : "recordAriaSea"));
  }
}

// The value of the Compare option that plays the place's published pair (both dates at once).
const PAIR = "pair";

/**
 * The Compare options: the place's published pair first when it has one ("Published pair: Nov 2025
 * and Nov 2026", which sets both dates: the honest one-action way to the record's hero comparison
 * from any date), then every date of the record as the second date.
 */
function buildCompareOptions({ keep = false } = {}) {
  const sel = $("compare-with");
  const before = sel.value; // keep: a language change keeps the option the user chose
  sel.replaceChildren();
  const pair = compareFor(state.meta, state.placeId);
  if (pair) {
    const o = document.createElement("option");
    o.value = PAIR;
    o.textContent = t("comparePair", { dates: pairText(pair.a, pair.b, getLang()) });
    sel.append(o);
  }
  // Short month and year, so the options fit the narrow console in both languages; the day too
  // when a month holds more than one date. The announcement still says the full date.
  const withDay = withDayFor(state.meta);
  for (const d of state.meta.dates) {
    const o = document.createElement("option");
    o.value = d;
    o.textContent = monthText(d, getLang(), { withDay });
    sel.append(o);
  }
  sel.value = pair ? PAIR : state.compareDate;
  if (keep && before && [...sel.options].some((o) => o.value === before)) sel.value = before;
  sel.disabled = false;
  syncComparePair();
}

/**
 * The Compare pair under the select, decorative: A, the date Compare will start from (the date
 * shown, or the published pair's first date); B, the date chosen in the select; and, while a
 * Compare sounds, both values in their colours (the live region says the same).
 */
function syncComparePair(sampleA = null, sampleB = null) {
  if (!state.meta) return;
  const meta = state.meta;
  const lang = getLang();
  const pair = compareFor(meta, state.placeId);
  const chosen = $("compare-with").value || state.compareDate;
  let a = currentDate();
  let b = chosen;
  if (chosen === PAIR && pair) { a = pair.a; b = pair.b; }
  else if (!b || b === PAIR || b === a) b = defaultCompareDate();
  if (state.compareOn) { a = currentDate(); b = state.compareDate; }
  const withDay = withDayFor(meta);
  $("cp-a-date").textContent = monthText(a, lang, { withDay });
  $("cp-b-date").textContent = b ? monthText(b, lang, { withDay }) : "";
  for (const [id, s] of [["cp-a-val", sampleA], ["cp-b-val", sampleB]]) {
    const el = $(id);
    el.textContent = s ? compactValue(meta, physicalValue(meta, s), lang) : "";
    el.style.color = s ? view.readingCss(meta, s) : "";
  }
}

/**
 * Default second date for Compare: the other date of the place's published pair, else about a year
 * apart (yearApart). A place without a pair never borrows another place's pair: its dates were
 * chosen for that place.
 */
function defaultCompareDate() {
  const pair = compareFor(state.meta, state.placeId);
  if (pair) return pair.b === currentDate() ? pair.a : pair.b;
  return yearApart(state.meta.dates, currentDate());
}

/**
 * A new place or date: the Compare default. The options themselves depend only on the record and
 * the place (the pair is per place), so a new date only moves the selection (rebuild: false).
 */
function resetCompareDate({ rebuild = true } = {}) {
  state.compareDate = defaultCompareDate();
  if (rebuild) { buildCompareOptions(); return; }
  const sel = $("compare-with");
  sel.value = compareFor(state.meta, state.placeId) ? PAIR : state.compareDate;
  if (!state.compareOn) syncComparePair();
}

/** The "now playing" strip on the stage (desktop, while Play runs): the date and a time line. */
function syncStrip() {
  const n = state.meta.dates.length;
  $("np-date").textContent = dateText(currentDate(), getLang());
  $("np-first").textContent = monthText(state.meta.dates[0], getLang());
  $("np-last").textContent = monthText(state.meta.dates[n - 1], getLang());
  $("np-marker").style.setProperty("--p", String(n > 1 ? state.dateIndex / (n - 1) : 0));
}

/**
 * The console steps aside while Play runs, on the desktop layout where it is the side panel. It
 * closes only when Play was started by a pointer, or by a key with the focus outside the console:
 * a keyboard or screen reader user working inside the console keeps it (and the focus). It reopens
 * by itself when Play ends, if this rule closed it and the user has not taken it over meanwhile.
 */
function stepAside(on) {
  if (on) {
    if (narrow.matches || consoleCollapsed) return;
    const inConsole = $("console").contains(document.activeElement);
    if (lastInput === "key" && inConsole) return;
    setConsoleCollapsed(true);
    autoCollapsed = true;
    // A focus that was in the console goes to the strip's Pause button (in the stage, before the
    // console in the tab order), so the next Tab reopens the console and lands in it.
    if (inConsole) $("np-pause").focus({ preventScroll: true });
    return;
  }
  if (!autoCollapsed) return;
  autoCollapsed = false;
  if (consoleCollapsed) setConsoleCollapsed(false);
}

function syncDate() {
  const date = $("date");
  date.value = String(state.dateIndex);
  date.setAttribute("aria-valuetext", dateText(currentDate(), getLang()));
  $("date-out").textContent = dateText(currentDate(), getLang());
  syncStrip();
  view.paintRange(date);
  view.markScore(state.dateIndex);
  // The thin line along Play's lower edge: how far through the record the needle is.
  const n = state.meta.dates.length;
  $("play").style.setProperty("--progress", String(n > 1 ? state.dateIndex / (n - 1) : 0));
}

/* ---------- The place list as a live table of the record ---------- */

let valuesFor = null; // { meta, date, frame } of the values shown, repainted when a colour strip arrives
let seriesKey = "";
let seriesToken = 0;

/**
 * Every visible place's value on the date shown: one cell lookup per place in the frame already
 * loaded, then text and colour only.
 */
function refreshValues(meta, date, frame) {
  valuesFor = { meta, date, frame };
  const lang = getLang();
  const out = new Map();
  for (const p of coveredPlaces()) {
    const s = readSample(meta, frame, p.lat, p.lon);
    const pv = physicalValue(meta, s);
    out.set(p.id, { text: compactValue(meta, pv, lang), color: pv ? view.readingCss(meta, s) : "", nodata: !pv });
  }
  placeList.setValues(out);
}

/**
 * The score for the place being read: its value on every date of the record (the frames Play
 * would load, already warming), drawn when they arrive. Quiet: nothing is said or played.
 */
async function loadSeries(meta, place) {
  const token = ++seriesToken;
  view.renderScore(meta, null);
  let frames;
  try {
    frames = await Promise.all(meta.dates.map((d) => loadFrame(meta, d)));
  } catch {
    return; // the score stays folded; the slider works as before
  }
  if (token !== seriesToken) return;
  view.renderScore(meta, frames.map((f) => readSample(meta, f, place.lat, place.lon)));
}

/** The checked row's "sounding" mark while a single tone of its place plays. */
function markSounding() {
  placeList?.sounding(1300);
}

/* ---------- The core update ---------- */

/**
 * reason: "init" | "record" | "select" | "date" | "step" | "settle" | "lang"
 * - "record" and "select" drop the needle; "date" plays a tone; "step" (Play) is played by the engine.
 * - "settle" redraws after Play stopped (the large frame image), quietly.
 * opts: via "control" (the date slider spoke its own value) or "key"; quiet: no announcement;
 *       hint: a place was chosen (the first times, say how to play it through time);
 *       fly: false only at boot when the link names no place.
 */
async function update(reason, { via = "control", quiet = false, fly = true, hint = false, hold = false } = {}) {
  const token = ++updateToken;
  const meta = state.meta;
  const date = currentDate();
  const place = currentPlace();
  const lang = getLang();
  const stepping = reason === "step";
  // An explicit choice of a place (list, visit, N, a dot, a record change, a deep link at boot)
  // brings the globe camera back in; refreshes (date, Play steps, language) never do.
  const refocus = reason === "select" || reason === "record" || (reason === "init" && fly);
  syncDate();
  view.sync(
    { meta, places: state.places, placeId: place.id, frame: view.frameInfo(meta, state.dateIndex) },
    { fly, refocus, hold, stepMs: stepping ? stepNow : 0, linear: stepping, force: reason === "lang" },
  );
  view.renderHead(meta, place, date, lang);
  view.renderFrame(meta, date, place, lang, "a", { still: !stepping }); // the best image already decoded
  // The "Data and method" dialog's line for this date: only while it is open (it renders on opening).
  if ($("about").open) view.renderThisDate(meta, date, lang);
  const key = `${meta.id}|${place.id}`;
  if (key !== seriesKey) { seriesKey = key; loadSeries(meta, place); tellEngine(); }
  const silent = ["step", "settle", "lang", "init"].includes(reason);
  if (!silent && state.compareOn) setCompare(false);
  if (!stepping) writeUrl(); // a Play step does not rewrite the address; its settle does

  let frame;
  try {
    frame = await loadFrame(meta, date);
  } catch {
    if (token === updateToken) announcer.now(t("loadError"));
    return;
  }
  if (token !== updateToken) return;
  state.sample = readSample(meta, frame, place.lat, place.lon);
  view.renderValue(meta, state.sample, lang);
  refreshValues(meta, date, frame);
  if (!state.compareOn) syncComparePair();
  $("readout-text").textContent = dj.describe(djCtx());
  if (silent) return;

  if (state.started) {
    const sample = state.sample;
    if (reason === "select" || reason === "record") {
      // A place chosen: the needle drop and the picture's pulse only. No value tone: the place's
      // music follows by itself after the lead-in (a tone, a chord on the fire record, read as a
      // stray chord before it). The sentence still says the value.
      engine.needleDrop();
      haptics.needle();
      view.pulse(sample.nodata ? null : sample.v01);
    } else if (performance.now() - lastTone > 90) {
      lastTone = performance.now();
      markSounding();
      engine.play(sample);
      haptics.sample(sample);
      view.pulse(sample.nodata ? null : sample.v01);
    }
  }
  if (quiet) return;
  if (reason === "date") {
    // The date slider already spoke its date, so only the value follows; the comma and period
    // keys speak nothing of their own, so the date comes first.
    announcer.say(`${via === "key" ? `${dateText(date, lang)}: ` : ""}${valueShort()}`);
  } else {
    // A place chosen on the focused list: its name was just said by the screen reader, so the
    // sentence starts at the date (month and year). From a dot or a record switch, the name stays.
    const brief = reason === "select" || reason === "record";
    // With the voice on, the voice says the place ("Entering ..."): the page stays silent (one speaker).
    if (brief && voice?.isOn()) return;
    let text = dj.describe(djCtx({ brief, omitPlace: brief && reason === "select" && placeList.hasFocus() }));
    if (hint && hintsGiven < HINTS) {
      hintsGiven += 1;
      text += ` ${t(touchUi() ? "playHintTouch" : "playHint")}`;
    }
    announcer.say(text);
  }
}

/** The value under the needle alone, e.g. "+1.2 °C" or "No data here". The V key gives the full sentence. */
function valueShort() {
  const pv = physicalValue(state.meta, state.sample);
  const near = normalWord(state.meta, pv, getLang());
  const text = pv ? `${formatValue(state.meta, pv, getLang())}${near ? `, ${near}` : ""}` : t("noData");
  return state.meta.synthetic ? `${t("synthetic")}: ${text}` : text;
}

/* ---------- Records, places and dates ---------- */

/**
 * Switch record. keep: the place stays when the new record covers it (else the record's default
 * place, or the place asked for); the date stays only when the place stays and the new record has
 * that date, else it is the record's first date (dateForChoice; dot: a dot was clicked). Without
 * keep (the opening, home, a link) the place's opening date or the link's date.
 */
async function selectRecord(id, { placeId, date, keep = false, reason = "record", quiet = false, fly = true, hint = false, dot = false, hold = false } = {}) {
  const prev = state.meta ? { date: currentDate(), placeId: state.placeId } : null;
  state.meta = state.metas.get(id) || state.metas.get(state.records[0].id);
  const meta = state.meta;
  if (keep && prev) {
    const prevPlace = state.places.find((p) => p.id === prev.placeId);
    if (!placeId && prevPlace && covers(meta, prevPlace)) placeId = prev.placeId;
  }
  for (const r of document.querySelectorAll('input[name="record"]')) r.checked = r.value === meta.id;
  const pool = coveredPlaces();
  const place = pool.find((p) => p.id === placeId) || pool.find((p) => p.id === meta.default_place) || pool[0] || state.places[0];
  state.placeId = place.id;
  if (!date && keep && prev) date = dateForChoice(meta, { placeId: place.id, prevPlaceId: prev.placeId, prevDate: prev.date, dot });
  const idx = meta.dates.indexOf(date || defaultDate(meta, state.placeId));
  state.dateIndex = idx >= 0 ? idx : meta.dates.indexOf(defaultDate(meta, state.placeId));
  if (state.dateIndex < 0) state.dateIndex = meta.dates.length - 1;

  $("date").max = String(meta.dates.length - 1);
  $("date-first").textContent = meta.dates[0].slice(0, 7);
  $("date-last").textContent = meta.dates[meta.dates.length - 1].slice(0, 7);
  placeList.render(pool, state.placeId, { recordIndex: Math.max(0, state.records.findIndex((r) => r.id === meta.id)) });
  $("places").disabled = false;
  view.renderScale(meta, getLang());
  view.renderLiner(meta, getLang(), state.places);
  state.compareDate = defaultCompareDate();
  buildCompareOptions();
  for (const el of ["date", "play", "compare", "legend"]) $(el).disabled = false;
  engineCall("setRecord", meta); // the engine's sound mode follows the record (optional, contract 3)
  // Warm the frame cache so Play through time starts without a gap.
  for (const d of meta.dates) loadFrame(meta, d).catch(() => {});
  view.renderColorbar(meta, getLang());
  if (state.started) view.warmHd(meta, state.dateIndex); // stops the previous record's warm-up
  await update(reason, { quiet, fly, hint, hold });
}

/** The record list: a record change is a gesture that asks for sound. */
async function changeRecord(id) {
  stopAll({ quiet: true });
  const started = ensureStarted();
  freshPlace = true;
  await selectRecord(id, { keep: true });
  if (state.meta?.id === id && (await started)) scheduleAutoPlay();
}

/**
 * Select a place (arrow keys in the list, a click on a row or on a dot, N and Shift+N): stop Play,
 * move both pictures there, go back to the record's first date (a dot always; the list for a
 * different place), drop the needle, play the value and say the DJ sentence (which names the
 * date). It never starts Play through time: that takes Enter, a double click, P or the Play button.
 * A dot of the other record switches record first. deferFly: the globe only marks the place; the
 * caller flies it later (a dot on the NASA frame, once the page has scrolled up to the globe).
 */
async function selectPlace(id, { quiet = false, dot = false, deferFly = false } = {}) {
  const p = state.places.find((x) => x.id === id);
  if (!p) return;
  cancelAutoPlay();
  // A Play under way (or one still starting: its frames, the voice's record line) stops at once.
  if (state.playing) { stopEngine(); endPlay(); }
  playToken += 1;
  legendToken += 1;
  const started = ensureStarted();
  freshPlace = true;
  pausedHere = false;
  if (!covers(state.meta, p)) {
    await selectRecord(recordForPlace(state.records, state.metas, p), { placeId: p.id, keep: true, quiet, hint: true, dot, hold: deferFly });
  } else {
    const date = dateForChoice(state.meta, { placeId: p.id, prevPlaceId: state.placeId, prevDate: currentDate(), dot });
    state.placeId = p.id;
    state.dateIndex = state.meta.dates.indexOf(date);
    placeList.check(p.id);
    resetCompareDate();
    await update("select", { quiet, hint: true, hold: deferFly });
  }
  if (state.placeId === p.id && (await started)) scheduleAutoPlay();
}

/**
 * After a choice: the lead-in (the single reading of the place: needle drop, tone, sentence), then
 * Play through time from the first date. Only the place the visitor stops on plays.
 */
function scheduleAutoPlay() {
  cancelAutoPlay();
  const my = autoToken;
  const go = () => {
    if (my !== autoToken || state.playing) return;
    clearTimeout(autoTimer);
    autoTimer = 0;
    togglePlay({ fromStart: true });
  };
  const line = placeLine(state.placeId);
  const via = lastInput === "key" ? "key" : "pointer";
  if (line && voice?.willSay("place", via)) {
    // With the voice: "Next stop: ..." (at most about 3 s, after 0.6 s of quiet), then the music.
    autoTimer = setTimeout(go, 600 + 5000); // never longer than this
    voice.say(line, { delay: 600, kind: "place", via }).then(() => go());
    return;
  }
  autoTimer = setTimeout(go, Math.max(AUTO_PLAY_MS, 500 + announcer.quietIn()));
}

/** Say voice lines of a kind (nothing when the voice is off or its policy keeps that kind silent). */
function voiceSay(event, kind, ctx = {}, opts = {}) {
  if (!voice) return Promise.resolve(false);
  const touch = touchUi();
  return voice.say(linesFor(event, { touch, safe: voice.safe(), ...ctx }), { kind, via: lastInput === "key" ? "key" : "pointer", ...opts });
}

/** The voice guide on or off (the checkbox, or G): it says so itself; nothing goes to the live region. */
function setVoice(on, { say = true, store = say } = {}) {
  if (!voice) return;
  // Remembered only when the visitor chooses it.
  if (store) { try { localStorage.setItem(VOICE_KEY, on ? "on" : "off"); } catch { /* storage blocked */ } }
  $("voice-on").checked = on;
  if (on) {
    voice.enabled(true);
    if (say) voice.say("S15", { kind: "status" });
  } else {
    voice.enabled(false);
    if (say) voice.say("S14", { force: true });
  }
}

// The real engine finishes a stop over about 50 ms: a Play started inside that window was
// silenced with it and stayed stuck (the page said "playing", the transport was stopped). A Play
// therefore starts at least STOP_SETTLE_MS after the last stop.
const STOP_SETTLE_MS = 150;
let lastStopAt = -Infinity;
function stopEngine() {
  lastStopAt = performance.now();
  engine.stop();
}

function cancelAutoPlay() {
  autoToken += 1;
  clearTimeout(autoTimer);
  autoTimer = 0;
}

/**
 * Enter on the place list, the Play key, P, a tap on the place that is playing: pause, and continue
 * from where it stopped (never a restart); a choice still in its lead-in starts at once; at the end
 * of the record (or on a place just chosen) it plays from the first date.
 */
async function playPause() {
  if (state.playing) { pause(); return; }
  const pending = !!autoTimer;
  cancelAutoPlay();
  const fromStart = freshPlace || pending;
  await togglePlay({ fromStart, resume: pausedHere && !fromStart });
}

/** Enter, or a tap, on a place: the place being read pauses or continues; another is chosen. */
function activatePlace(id) {
  if (!state.places.some((p) => p.id === id)) return;
  if (id !== state.placeId) { selectPlace(id); return; }
  remotePlay(); // the same pause and continue as Space and the remote (the tour's own, during the tour)
}

/** Previous or next date of the record (comma and period keys). */
function stepDate(delta) {
  const next = Math.min(state.meta.dates.length - 1, Math.max(0, state.dateIndex + delta));
  if (next === state.dateIndex) {
    announcer.say(t(delta < 0 ? "firstDate" : "lastDate"));
    return;
  }
  if (state.playing) { stopEngine(); endPlay(); }
  cancelAutoPlay();
  freshPlace = false;
  pausedHere = false;
  ensureStarted();
  state.dateIndex = next;
  resetCompareDate({ rebuild: false });
  update("date", { via: "key" });
}

/** Next or previous place the record covers, in list order (N and Shift+N). */
function stepPlace(delta) {
  const pool = coveredPlaces();
  if (!pool.length) return;
  const i = pool.findIndex((p) => p.id === state.placeId);
  const target = pool[(i + delta + pool.length) % pool.length];
  placeList.check(target.id, { focus: placeList.hasFocus() });
  selectPlace(target.id);
}

/**
 * "Describe this date": the places with the highest values on the current date (and the lowest,
 * on a record that goes both ways). Every number is read from the decoded frame.
 */
async function describeFrame() {
  const meta = state.meta;
  const date = currentDate();
  const lang = getLang();
  let frame;
  try {
    frame = await loadFrame(meta, date);
  } catch {
    announcer.now(t("loadError"));
    return;
  }
  const rows = coveredPlaces()
    .map((p) => ({ p, s: readSample(meta, frame, p.lat, p.lon) }))
    .filter((x) => !x.s.nodata)
    .sort((a, b) => b.s.v01 - a.s.v01);
  const item = (x) => `${x.p.name} ${formatValue(meta, physicalValue(meta, x.s), lang)}`;
  let text = t("frameNone", { date: dateText(date, lang) });
  if (rows.length) {
    text = t("frameHigh", { date: dateText(date, lang), list: rows.slice(0, 3).map(item).join("; ") });
    const low = Math.min(3, rows.length - 3);
    if (meta.scale.kind === "diverging" && low > 0) text += ` ${t("frameLow", { list: rows.slice(-low).reverse().map(item).join("; ") })}`;
  }
  announcer.now(`${meta.synthetic ? `${t("synthetic")}: ` : ""}${text}`);
}

/* ---------- Sound ---------- */

let starting = null;

/** Start audio once, from a user gesture. Resolves true when sound is on. */
// A start that does not settle (the first activation did not count as a user gesture, so the
// browser keeps the audio suspended) gives up after this long: the failure is said and shown, and
// the next gesture starts again from scratch. Meanwhile every trusted gesture retries engine.start().
// A slow link can take 13 s for Tone.js alone: "Starting sound…" stays meanwhile. A start that has
// not settled by then is tried once more (from scratch), then said and shown as failed.
const START_TIMEOUT_MS = 20000;
const START_RETRY_MS = 8000;
// The real engine takes about 2 s to start the first time: after this long the Start button says so.
const STARTING_NOTICE_MS = 250;

function ensureStarted({ notice = null, keepStart = false, button = null } = {}) {
  if (state.started) {
    // The browser may have suspended the audio (the tab was hidden, the phone locked): resume it.
    if (!engine.isRunning()) engine.start().catch(() => {});
    return Promise.resolve(true);
  }
  if (starting) return starting;
  // While the engine starts, the Start button shows "Starting sound…" (and the caller may say it).
  const startBtn = button || $("start");
  const label = startBtn.querySelector("[data-i18n]");
  const startingTimer = setTimeout(() => {
    startBtn.classList.add("is-starting");
    if (label) label.textContent = t("soundStarting");
    notice?.();
  }, STARTING_NOTICE_MS);
  const settle = () => {
    clearTimeout(startingTimer);
    startBtn.classList.remove("is-starting");
    if (label) label.textContent = t(label.dataset.i18n);
  };
  starting = (async () => {
    try {
      if (navigator.audioSession) navigator.audioSession.type = "playback"; // iOS: play in silent mode
      const attempt = async (ms) => {
        let timer = 0;
        const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve(false), ms); });
        const ok = await Promise.race([Promise.resolve(engine.start()).then(() => true), timedOut]);
        clearTimeout(timer);
        return ok;
      };
      if (!(await attempt(START_TIMEOUT_MS)) && !(await attempt(START_RETRY_MS))) throw new Error("the audio did not start in time");
    } catch {
      settle();
      starting = null;
      // Said and shown: the Start button stays, with the reason next to it.
      $("sound-failed").hidden = false;
      hideStart(); // the remote's Play retries (the gate has already left)
      announcer.now(t("soundFailed"));
      voiceSay("failed", "status");
      return false;
    }
    settle();
    state.started = true;
    $("sound-failed").hidden = true;
    document.body.classList.add("sound-started");
    if (!keepStart) hideStart();
    $("sound-on").hidden = false;
    view.setPower(true);
    // After the first gesture and the Earth's entrance: decode the record's 2048 px frames in the background.
    setTimeout(() => { if (state.meta) view.warmHd(state.meta, state.dateIndex); }, 4000);
    return true;
  })();
  return starting;
}

/** The entrance steps aside once the sound is on: the remote's five buttons take its place. */
function hideStart() {
  $("remote-keys").hidden = false;
  document.body.classList.add("remote-on");
  syncRemote();
}

/**
 * Start the sound (the Start button, or Space from anywhere that is not a control), then move the
 * focus to the place list, the first thing to do next. toPlaces: also when the focus was elsewhere.
 */
async function startSound({ toPlaces = false } = {}) {
  // The focus goes to the checked place after the sound starts, also when the Start button was
  // activated without taking the focus (a screen reader's double tap): Start is hidden then, and a
  // focus left on the page's body would lose the reader's place. A control the visitor has already
  // moved to keeps it.
  const active = document.activeElement;
  const hadFocus = !active || active === document.body || active === $("start") || active === $("tour-start") || active === $("tour-voice");
  const wasOn = state.started && !gateLeaving; // a wake on the gate may have started the sound already
  const before = `${state.placeId}|${state.dateIndex}|${state.meta?.id}`;
  // With the voice guide on and its safe policy (a keyboard, a likely screen reader), one speaker
  // at a time: Start stays in view (and keeps the focus) and the page holds its own sentences while
  // the welcome speaks; any key cuts the welcome short.
  const holdForVoice = false; // the voice is an explicit choice now: no hold (see voicePolicy)
  const toList = () => {
    if (!(hadFocus || toPlaces) || !state.placeId) return;
    const now = document.activeElement;
    // A control the visitor moved to meanwhile keeps the focus.
    if (now && now !== document.body && now !== $("start") && now !== $("tour-start") && !$("places-list").contains(now)) return;
    if (consoleCollapsed) setConsoleCollapsed(false);
    landFocus(() => placeList.check(state.placeId, { focus: true }));
  };
  // Otherwise the focus goes to the place list at once, so the arrow keys work while the engine
  // starts (about 2 s the first time; choosing a place meanwhile waits for the same start).
  if (!holdForVoice) toList();
  if (holdForVoice) announcer.hold();
  // Said once while the engine starts; the ready sentence below follows when it is on.
  if (!(await ensureStarted({ notice: () => announcer.now(t("soundStarting")), keepStart: holdForVoice }))) { announcer.release(); return; }
  if (wasOn) return;
  hideStart();
  // The first place: the needle drop only (no value tone); its music waits for a confirmation.
  engine.needleDrop();
  haptics.needle();
  const moved = before !== `${state.placeId}|${state.dateIndex}|${state.meta?.id}`;
  // With the voice on, the voice welcomes (one speaker); without it, the page's short sentence.
  if (!voice?.isOn()) announcer.say(t(moved ? "soundOnMoved" : touchUi() ? "soundOnTouch" : "soundOnKeys"));
  if (holdForVoice) {
    await voice.say(linesFor("welcome", { safe: true }), { kind: "welcome", delay: 300 });
    hideStart();
    toList();
    announcer.release();
    return;
  }
  // Explore on my own with the voice on: the welcome and how to move about.
  if (voice?.willSay("welcome") && !moved) {
    voice.say(linesFor("welcome", { kind: kindNow(), haptics: haptics.supported() && haptics.enabled() }), { kind: "welcome", delay: 400 });
  }
}

/* ---------- The gate: the entrance, before the app ---------- */

// Everything behind the gate is inert until the visitor chooses (set at startup, removed at once at
// the choice, before any focus move or announcement).
const behindGate = () => document.querySelectorAll("body > header, body > main, body > footer, body > .skip, body > .synthetic");
let deepLinked = false;

function holdGate() {
  if (!document.documentElement.classList.contains("gate-on")) return;
  for (const el of behindGate()) el.inert = true;
}

/** The gate while it leaves: set at the choice, cleared when the gate is gone. */
let gateLeaving = null;
const GATE_WAIT_MS = 4000; // the longest the gate waits for the chosen start before it goes anyway

/**
 * The visitor chose. The gate stays (the chosen row says "Starting sound...") until the focus has
 * somewhere to go: then the gate goes and the focus moves, in the same tick, so it never rests on
 * the page's body (a screen reader left there may read the page from the top). After the opening
 * the look plays meanwhile: the other rows fade, the wordmark flies to the header, the black lifts
 * while the Earth makes its entrance. Without the opening (a second visit, reduced motion) the gate
 * holds still and the app comes in as a cut. explore: Explore on my own (a deep link keeps its
 * place; no entrance then). Returns false when the gate is not up or is already leaving.
 */
function leaveGate(chosen = null, { explore = false } = {}) {
  const rootEl = document.documentElement;
  if (!rootEl.classList.contains("gate-on") || gateLeaving) return false;
  for (const el of behindGate()) el.inert = false;
  // Chosen during the opening (a screen reader presses a button under it): the opening ends at once.
  if (rootEl.classList.contains("intro-on")) window.dispatchEvent(new Event("bmr:skip-intro"));
  const gate = $("gate");
  const leaving = { chosen, ready: true, landed: false, timer: 0, entrance: !(explore && deepLinked) };
  gateLeaving = leaving;
  announcer?.cancel(); // the gate's intro, if it is still waiting to be said, is not said now
  announcer?.interrupted(); // the reader stopped the intro at her press (the focus move is added when it happens)
  // The chosen button holds the focus while the gate waits (a screen reader's press or Space on the
  // page leaves it on the body otherwise): it says "Starting sound..." there.
  if (chosen && document.activeElement !== chosen) chosen.focus({ preventScroll: true });
  // The rail is fitted again as the app appears (the intro and the readout never meet), whatever
  // was laid out while the gate covered it.
  view.fitRail();
  // If the start takes long, the gate goes anyway and the focus moves to the remote's first button.
  leaving.timer = setTimeout(() => landFocus(null), GATE_WAIT_MS);
  // A still gate (a second visit, reduced motion) covers the page until it goes: the Earth's entrance
  // then plays when it goes (finishGate). After the opening the black lifts now: the entrance now.
  if (reducedMotion.matches || !gate.animate || !rootEl.classList.contains("gate-enter")) return true;
  if (leaving.entrance) { leaving.entrance = false; view.home({ entrance: true }); }
  leaving.ready = false;
  rootEl.classList.remove("gate-enter"); // the rows' entrance is over: their fades take over
  void gate.offsetWidth; // a style flush first, so the fades start from the rows as they are
  chosen?.classList.add("is-chosen");
  gate.classList.add("is-leaving");
  rootEl.classList.add("gate-leaving");
  // The gate's wordmark flies home to the header, as the opening's used to.
  const from = $("gate-mark").getBoundingClientRect();
  const to = $("home").getBoundingClientRect();
  if (from.width > 0 && to.width > 0) {
    $("gate-mark").animate([
      { transform: "none" },
      { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})` },
    ], { duration: 650, delay: 220, easing: "cubic-bezier(0.65, 0, 0.2, 1)", fill: "forwards" });
  }
  setTimeout(() => { leaving.ready = true; if (leaving.landed) finishGate(); }, 900);
  return true;
}

/** The gate is gone (its look reset for a later load of the same page). */
function finishGate() {
  const leaving = gateLeaving;
  if (!leaving) return;
  gateLeaving = null;
  clearTimeout(leaving.timer);
  document.documentElement.classList.remove("gate-on", "gate-leaving", "gate-enter");
  // The Earth arrives from space into the overview, completely, before anything flies to a place.
  if (leaving.entrance) view.home({ entrance: true });
  $("gate").classList.remove("is-leaving");
  $("gate-mark").getAnimations().forEach((a) => a.cancel());
  leaving.chosen?.classList.remove("is-chosen");
}

/**
 * Move the focus to where the chosen start leaves it (an element, or a function that focuses it),
 * taking the gate away in the same tick. null: the start is late, so the remote's first button
 * (it retries the sound if that failed). Outside the gate: just the focus.
 */
function landFocus(target) {
  const leaving = gateLeaving;
  if (leaving && !leaving.landed) {
    leaving.landed = true;
    clearTimeout(leaving.timer);
    if (!target) { hideStart(); target = $("r-play"); }
    if (leaving.ready) finishGate(); // otherwise when the look's last 900 ms are over
  }
  if (!target) return;
  const before = document.activeElement;
  if (typeof target === "function") target();
  else target.focus({ preventScroll: true });
  // The move follows the visitor's own choice: the reader drops what it was saying ("Starting
  // sound...") and announces the new focus ("Pause, button") before the page's next line.
  if (document.activeElement !== before) announcer?.interrupted({ focus: FOCUS_MS });
}

/* ---------- The guided tour and the remote ---------- */

// The tour: four stops, each an excerpt of a place's record, played by itself one after the other.
// It never moves the focus after the single move to Pause when it starts; it never speaks over the
// music; with the voice off its lines go to the live region, with gaps.
const tour = { active: false, index: -1, token: 0, range: null, paused: false };
let liveToken = 0;

/** How the visitor is using the page: "key", "sr" (a likely screen reader on a touch screen) or "touch". */
function kindNow() {
  // A raw touch on the gate reached the page: a finger with no screen reader. The click heuristic
  // below can misfire on a slow phone (a click that arrives late after its touch), so this wins.
  if (fingerProven && touchUi()) return "touch";
  return inputKind({ lastInput, srLikely, touch: touchUi() });
}

/**
 * Say a group of script lines: the voice when it is on; otherwise the live region, one line at a
 * time, each after the screen reader's estimated end plus a gap (TalkBack treats every live region
 * as polite). Never while the music plays. Resolves true when every line was said.
 */
async function speak(ids) {
  const list = ids.filter(Boolean);
  if (!list.length) return true;
  if (voice?.isOn()) return voice.say(list, { kind: "tour" });
  // The visitor's screen reader: each part is posted when the reader is estimated to have said
  // everything before it (pace.js, a safe rate); a long line goes sentence by sentence, so a fast
  // reader hears short pauses and a slow one just queues.
  const my = ++liveToken;
  for (const id of list) {
    for (const part of splitLine(lineText(id, getLang()))) {
      await wait(announcer.readerFreeIn());
      if (my !== liveToken || state.playing) return false;
      announcer.now(part);
    }
  }
  await wait(announcer.readerFreeIn());
  return my === liveToken;
}

/**
 * Before any music or needle drop on the screen reader path (the app's voice off): wait until the
 * reader is estimated to have said everything (pace.js) and GUARD_MS more. Lines posted meanwhile
 * extend the wait. stillMine: false when the visitor did something else meanwhile.
 */
async function readerGuard(stillMine = () => true) {
  if (voice?.isOn()) return stillMine();
  for (let ms = announcer.guardIn(GUARD_MS); ms > 0; ms = announcer.guardIn(GUARD_MS)) {
    await wait(ms);
    if (!stillMine()) return false;
  }
  return stillMine();
}

/** Stop the tour's speech at once (the voice and the queue of live lines). */
function cutSpeech() {
  liveToken += 1;
  voice?.cancel();
}

/** One short status line (paused, stopped, the end of a place): the voice, or the live region. */
function status(id, { now = false } = {}) {
  if (voice?.isOn()) { voice.say(id, { kind: "status", force: true }); return; }
  const text = lineText(id, getLang());
  if (now) announcer.now(text); else announcer.say(text);
}

/** The remote's names and the status line follow the state (names only; no aria-pressed). */
function syncRemote() {
  const play = $("r-play");
  if (!play) return;
  const going = state.playing || (!!pendingPlay && pendingPlay === playToken) || (tour.active && !tour.paused);
  const label = $("r-play-label");
  label.dataset.i18n = going ? "rPause" : "rPlay";
  label.textContent = t(label.dataset.i18n);
  play.classList.toggle("is-going", going);
  const other = state.meta?.id === "fire" ? "rToSea" : "rToFire";
  const rec = $("r-record-label");
  rec.dataset.i18n = other;
  rec.textContent = t(other);
  const tl = $("r-tour-label");
  tl.dataset.i18n = tour.active ? "rTourStop" : "rTourStart";
  tl.textContent = t(tl.dataset.i18n);
  const place = currentPlace();
  $("r-status").textContent = tour.active && tour.index >= 0 ? t("rStatus", { n: tour.index + 1, place: place?.name || "" }) : "";
}

/** Load a stop's frames ahead (while the previous stop plays). */
function preloadStop(i) {
  const stop = TOUR[i];
  const meta = stop && state.metas.get(stop.record);
  if (!meta) return;
  const { from, to } = stopRange(meta.dates, stop);
  for (const d of meta.dates.slice(from, to + 1)) loadFrame(meta, d).catch(() => {});
}

/**
 * Start the guided tour (the first button, or Space): the sound starts, the focus moves once to
 * Pause, the opening is said, then the stops play one after the other.
 */
async function startTour({ voice: withVoice = null, button = null } = {}) {
  // The entrance's choice: the tour with the visitor's screen reader (the app's voice off: every
  // line goes to the live region) or with the app's voice (the live region stays silent for its lines).
  if (withVoice !== null) setVoice(withVoice, { say: false, store: true });
  cancelAutoPlay();
  cutSpeech();
  const first = !state.started || !!gateLeaving; // from the gate (a wake may have started the sound)
  if (state.playing) { stopEngine(); endPlay(); }
  playToken += 1;
  tour.active = true;
  tour.paused = false;
  tour.index = -1;
  const my = ++tour.token;
  syncRemote();
  // The picture stays the overview (the Earth's entrance) until stop 1 begins; stop 1's record is told
  // to the engine as soon as the sound is on (below), so its instruments start loading then.
  // The engine and the first stop's record start loading now, at the first gesture.
  const ok = await ensureStarted({ notice: () => { if (!voice?.isOn()) announcer.now(t("soundStarting")); }, button: button || $("tour-start") });
  if (!ok) { tour.active = false; syncRemote(); landFocus($("r-play")); return; }
  hideStart();
  if (first) {
    // A guided entrance needs no panel: the console starts closed and never opens by itself (on a
    // touch layout the console and the flat frame are not shown at all: the picture and the remote).
    if (touchUi()) document.body.classList.add("guided-touch");
    else { autoCollapsed = false; setConsoleCollapsed(true); }
    // The voice tour on a touch screen: taps and swipes anywhere (she cannot find buttons).
    if (withVoice && touchUi()) { voiceTouch = true; document.documentElement.classList.add("voice-touch"); }
    // The single focus move of the tour: to Pause, the visitor's own action just started it (from
    // the gate's button straight to Pause, the gate going in the same tick).
    landFocus($("r-play"));
  }
  engineCall("setContext", { record: TOUR[0].record, lat: state.places.find((p) => p.id === TOUR[0].place)?.lat, lon: state.places.find((p) => p.id === TOUR[0].place)?.lon });
  preloadStop(0);
  if (my !== tour.token) return;
  await speak(linesFor("tourOpen", { kind: kindNow() }));
  if (my !== tour.token) return;
  runStop(0);
}

/**
 * One stop: the place (record switched quietly, the focus left where it is), its lines, a beat,
 * the needle drop, the excerpt; one second after its last note, the next stop.
 */
async function runStop(i) {
  const my = ++tour.token;
  cutSpeech();
  cancelAutoPlay();
  if (state.playing) { stopEngine(); endPlay(); }
  playToken += 1;
  if (i >= TOUR.length) { endTour(); return; }
  i = Math.max(0, i);
  const stop = TOUR[i];
  tour.active = true;
  tour.paused = false;
  tour.index = i;
  const { from, to } = await goToStop(i);
  if (my !== tour.token) return;
  tour.range = { from, to };
  syncRemote();
  tellEngine();
  preloadStop(i + 1);
  await speak(linesFor("tourStop", { stop }));
  if (my !== tour.token) return;
  if (!(await readerGuard(() => my === tour.token))) return;
  engine.needleDrop();
  haptics.needle();
  await wait(300);
  if (my !== tour.token) return;
  await playStop(my);
}

/**
 * A stop's record, place and first date, chosen quietly (the record switched without its line, the
 * focus left where it is, no tone). Returns the stop's range of dates.
 */
async function goToStop(i) {
  const stop = TOUR[i];
  const meta = state.metas.get(stop.record);
  const range = stopRange(meta.dates, stop);
  if (state.meta.id !== stop.record) {
    await selectRecord(stop.record, { placeId: stop.place, date: meta.dates[range.from], reason: "init", fly: true, quiet: true });
  } else if (state.placeId !== stop.place || state.dateIndex !== range.from) {
    state.placeId = stop.place;
    state.dateIndex = range.from;
    placeList.check(stop.place);
    resetCompareDate();
    await update("init", { fly: true });
  }
  return range;
}

/** Play (or continue) the current stop's excerpt; at its end, the next stop. */
async function playStop(my, { resume = false } = {}) {
  const range = { from: resume ? state.dateIndex : tour.range.from, to: tour.range.to };
  const done = await togglePlay({ range, inTour: true, resume });
  if (my !== tour.token || done !== "ended") return;
  await wait(1000);
  if (my === tour.token) runStop(tour.index + 1);
}

/** The end of the tour: the focus stays; one sentence says how to go on. */
function endTour() {
  tour.active = false;
  tour.index = -1;
  tour.paused = false;
  tour.token += 1;
  syncRemote();
  speak(linesFor("tourEnd", { kind: kindNow() }));
}

/** Stop the tour (its button, Esc or S, a record switch): T05 unless quiet. */
function stopTour({ quiet = false } = {}) {
  if (!tour.active) return;
  tour.token += 1;
  tour.active = false;
  tour.index = -1;
  tour.paused = false;
  cutSpeech();
  syncRemote();
  if (!quiet) status("T05");
}

/** Pause or Play on the remote (Enter on it): the tour's excerpt, or the place outside the tour. */
/** The visitor acted (a remote button, a key of the map, a place): the reader's queue counts as cut. */
function userActed() { announcer?.interrupted(); }

function remotePlay() {
  userActed();
  if (!tour.active) { playPause(); return; }
  if (state.playing) { tour.paused = true; pause(); syncRemote(); return; }
  if (!tour.paused) {
    // During the tour's words: they stop; Play says the stop again.
    tour.paused = true;
    tour.token += 1;
    playToken += 1; // and a Play still waiting to start
    pendingPlay = 0;
    cutSpeech();
    syncRemote();
    status("S07");
    return;
  }
  tour.paused = false;
  syncRemote();
  if (tour.index < 0) { runStop(0); return; }
  if (tour.range && state.dateIndex >= tour.range.from && pausedHere) { const my = ++tour.token; playStop(my, { resume: true }); return; }
  runStop(tour.index);
}

/** Next or previous: the next stop in the tour (Next skips the opening), else the next place. */
function remoteStep(delta) {
  userActed();
  if (tour.active) { runStop(tour.index < 0 ? 0 : tour.index + delta); return; }
  stepPlace(delta);
}

/** Switch to the sea or the fire record ("sea", "fire", or null for the other one). */
function remoteRecord(which = null) {
  userActed();
  const target = which === "sea" ? "sst-anomaly" : which === "fire" ? "fire" : state.meta?.id === "fire" ? "sst-anomaly" : "fire";
  if (!state.metas.has(target) || state.meta?.id === target) return;
  stopTour({ quiet: true });
  changeRecord(target);
}

/**
 * The sound legend (the Sound legend button and the L key only; it never plays by itself before a
 * Play), each word next to its sound so speech never covers a note: "Low, -4 °C", then the low note
 * (and 1 pulse); "Middle", the middle note (3 pulses); "High", the high note (5 pulses); "Crackle:
 * no data", the dead groove. With the voice guide on, the voice says each word before its sound too.
 * Stop (or Esc) cancels it between steps.
 */
async function playLegend() {
  if (!(await ensureStarted())) return;
  const token = ++legendToken;
  const meta = state.meta;
  const { min, max } = meta.scale;
  const v = (x) => formatValue(meta, { value: x, saturated: null }, getLang());
  const voiced = !!voice?.willSay("legend");
  if (voiced) await voice.say("S06", { kind: "legend" });
  const words = ["L1", "L2", "L3", "L4"];
  const steps = [
    [t("legendLow", { v: v(min) }), { v01: 0, nodata: false }],
    [t("legendMid", { v: v((min + max) / 2) }), { v01: 0.5, nodata: false }],
    [t("legendHigh", { v: v(max) }), { v01: 1, nodata: false }],
    [t("legendNone"), { v01: null, nodata: true }],
  ];
  for (const [i, [text, sample]] of steps.entries()) {
    if (token !== legendToken) return;
    announcer.now(text);
    // The words first, while the music is ducked (and the voice's word, when it is on).
    await Promise.all([wait(duckMs(text) + 150), voiced ? voice.say(words[i], { kind: "legend" }) : null]);
    if (token !== legendToken) return;
    engine.play(sample);
    haptics.sample(sample);
    await wait(1100);
  }
}

/**
 * Play through time: one turn of the record per date. fromStart: from the first date; resume: a
 * continue after a Pause (one word is said instead of the "Playing ..." sentence).
 */
async function togglePlay({ fromStart = false, resume = false, range = null, inTour = false } = {}) {
  if (state.playing) { pause(); return "paused"; }
  // A Play still waiting (for the screen reader to finish, for the frames): the same key cancels it.
  if (pendingPlay && pendingPlay === playToken) { playToken += 1; pendingPlay = 0; syncRemote(); return "paused"; }
  cancelAutoPlay();
  freshPlace = false;
  pausedHere = false;
  const token = ++playToken;
  pendingPlay = token;
  syncRemote();
  if (!(await ensureStarted())) { pendingPlay = 0; return; }
  const meta = state.meta;
  // With the voice guide on, the first Play of a record this session starts with the record's line
  // (R01 or R02 with its dates), then the music. No sound legend plays before a Play.
  if (!inTour && voice?.willSay("record") && !state.introduced.has(meta.id)) {
    state.introduced.add(meta.id);
    const safe = voice.safe();
    if (safe) await wait(announcer.quietIn()); // after the screen reader's estimated end
    if (token !== playToken || state.meta !== meta) return;
    await voice.say(linesFor("record", { safe, recordIndex: state.records.findIndex((r) => r.id === meta.id) }), { kind: "record" });
    if (token !== playToken || state.meta !== meta) return; // stopped, or another action, meanwhile
  }
  // On a slow link the frames, and on the fire record the recorded instruments, can take a while:
  // if no date has sounded about 3 s from here, say so once (and show it) instead of a silence
  // that looks broken.
  let stepped = false;
  clearTimeout(waitTimer);
  // On a weak phone or a slow link the recorded instruments can take long (more than a minute at
  // 1.6 Mbps): the notice is said at 3 s, then a shorter one every 6 s for as long as nothing sounds,
  // so there is never a long silence with no word.
  let notices = 0;
  // The screen reader first: nothing starts (not even the loading notices' clock) before it is
  // estimated to have finished, with a margin.
  if (!(await readerGuard(() => token === playToken && state.meta === meta))) return;
  const notice = () => {
    if (stepped || token !== playToken) return;
    $("sound-wait").hidden = false;
    notices += 1;
    if (voice?.isOn()) voiceSay("loading", "status", {}, { interrupt: false, overMusic: true }); // nothing sounds yet
    else announcer.say(notices === 1 ? lineText("S11", getLang()) : t("stillLoading"));
    waitTimer = setTimeout(notice, 6000);
  };
  clearTimeout(waitTimer);
  waitTimer = setTimeout(notice, INSTRUMENTS_WAIT_MS);
  if (range) state.dateIndex = range.from;
  else if (fromStart || state.dateIndex >= meta.dates.length - 1) state.dateIndex = 0;
  const from = state.dateIndex;
  const dates = meta.dates.slice(from, range ? range.to + 1 : undefined);
  const place = currentPlace();
  let frames;
  try {
    frames = await Promise.all(dates.map((d) => loadFrame(meta, d)));
  } catch {
    clearTimeout(waitTimer);
    $("sound-wait").hidden = true;
    pendingPlay = 0;
    announcer.now(t("loadError"));
    return;
  }
  if (token !== playToken || state.meta !== meta) return;
  const settle = STOP_SETTLE_MS - (performance.now() - lastStopAt);
  if (settle > 0) {
    await wait(settle);
    if (token !== playToken || state.meta !== meta) return;
  }
  const samples = frames.map((f) => readSample(meta, f, place.lat, place.lon));
  // A continue: the voice's "Continuing." is said before the music comes back, never over it.
  if (resume && voice?.willSay("status")) {
    await voiceSay("continue", "status");
    if (token !== playToken || state.meta !== meta) return;
  }
  if (!(await readerGuard(() => token === playToken && state.meta === meta))) return;
  if (state.compareOn) setCompare(false);
  tellEngine();
  setStepPictures(stepLength()); // a fire date lasts 3.6 to 4.1 s: the pictures step with the sound
  pendingPlay = 0;
  state.playing = true;
  document.body.classList.add("is-playing");
  $("play").setAttribute("aria-pressed", "true");
  $("play-label").textContent = t("pause");
  view.setPlaying(true);
  holdScreen(true);
  stepAside(true);
  // Nothing is said as the music starts (no sentence over the music); a screen reader hears the
  // remote's button turn into "Pause".
  syncRemote();
  await engine.playTurns(samples, {
    bpm: PLAY_BPM,
    onStep: (i) => {
      if (!state.playing || token !== playToken) return;
      // The first date sounds: a voice line still speaking (the instruments notice) stops.
      if (!stepped) { stepped = true; clearTimeout(waitTimer); $("sound-wait").hidden = true; voice?.cancel(); }
      state.dateIndex = from + i;
      update("step");
      haptics.sample(samples[i]);
      view.pulse(samples[i].nodata ? null : samples[i].v01);
    },
  });
  if (state.playing && token === playToken) {
    endPlay();
    await update("settle");
    if (inTour) return "ended";
    // The end of a place: one short sentence that says how to go on (no number); focus stays.
    status(`S10${{ key: "", sr: "t", touch: "v" }[kindNow()]}`);
    return "ended";
  }
  return "stopped";
}

/** Keep the screen awake while Play runs (a phone would lock and suspend the sound). */
async function holdScreen(on) {
  try {
    if (!on) { const lock = wakeLock; wakeLock = null; await lock?.release(); return; }
    if (!wakeLock && navigator.wakeLock && document.visibilityState === "visible") wakeLock = await navigator.wakeLock.request("screen");
  } catch { wakeLock = null; /* refused or unsupported: the screen may lock */ }
}

function endPlay() {
  state.playing = false;
  queueMicrotask(() => syncRemote());
  clearTimeout(waitTimer);
  $("sound-wait").hidden = true;
  playToken += 1;
  haptics.stop();
  holdScreen(false);
  // The strip goes with Play: its Pause button never keeps a focus that is about to vanish.
  const onStrip = $("nowplaying").contains(document.activeElement);
  stepAside(false);
  document.body.classList.remove("is-playing");
  if (onStrip) $("play").focus();
  $("play").setAttribute("aria-pressed", "false");
  $("play-label").textContent = t("play");
  view.setPlaying(false);
}

async function pause() {
  stopEngine();
  endPlay();
  pausedHere = true;
  status("S07");
  await update("settle");
}

function stopAll({ quiet = false } = {}) {
  const wasTour = tour.active;
  stopTour({ quiet: true });
  cutSpeech(); // Stop, Esc or a hidden page end any line being said, in or out of the tour
  cancelAutoPlay(); // and a Play waiting for its lead-in
  pausedHere = false;
  playToken += 1; // also cancels a Play still starting
  legendToken += 1; // and the Sound legend's next step
  clearTimeout(speechTimer);
  clearTimeout(waitTimer);
  $("sound-wait").hidden = true;
  speechTimer = 0;
  if (engine) stopEngine();
  haptics.stop();
  if (state.playing) {
    endPlay();
    if (state.meta) update("settle");
  }
  if (!quiet && announcer) status(wasTour ? "T05" : "S09", { now: true });
}

function setCompare(on, sampleB) {
  state.compareOn = on;
  if (!on) clearTimeout(speechTimer);
  view.renderCompare(on, state.meta, state.compareDate, currentPlace(), getLang(), state.sample, sampleB, on ? compareNote() : "", currentDate());
  syncComparePair(on ? state.sample : null, on ? sampleB : null);
}

async function runCompare() {
  cancelAutoPlay();
  pausedHere = false;
  if (!(await ensureStarted())) return;
  if (state.playing) { stopEngine(); endPlay(); }
  const meta = state.meta;
  const place = currentPlace();
  let dateB = $("compare-with").value || state.compareDate;
  const pair = compareFor(meta, place.id);
  if (dateB === PAIR && pair) {
    // The published pair: date A becomes the pair's first date (the pictures, the readout and the
    // link follow, quietly), date B its second; only this exact pair carries the record's note.
    if (currentDate() !== pair.a) {
      state.dateIndex = meta.dates.indexOf(pair.a);
      await update("settle");
    }
    dateB = pair.b;
  } else if (dateB === PAIR || dateB === currentDate()) {
    dateB = defaultCompareDate();
  }
  state.compareDate = dateB;
  let fa;
  let fb;
  try {
    [fa, fb] = await Promise.all([loadFrame(meta, currentDate()), loadFrame(meta, dateB)]);
  } catch {
    announcer.now(t("loadError"));
    return;
  }
  const a = readSample(meta, fa, place.lat, place.lon);
  const b = readSample(meta, fb, place.lat, place.lon);
  state.sample = a;
  setCompare(true, b);
  scrollToPlates();
  // A Compare reads the data: the globe comes back to the place and its data picture, also after
  // a drag had turned it away (an explicit choice, like picking the place again).
  view.focusPlace();
  engine.compare(a, b);
  haptics.compare(a.nodata ? null : a.v01, b.nodata ? null : b.v01);
  view.pulse(a.nodata ? null : a.v01);
  // The record's citation for this pair (e.g. NOAA CPC advisories) follows the values, spoken once
  // the 1.6 s beat has sounded (the announcer's own 0.5 s debounce comes on top of this wait).
  voiceSay("compare", "compare", { first: !comparedOnce, pairPlace: isPublishedPair(pair, dateB, meta) ? place.id : null }, { delay: COMPARE_SOUND_MS });
  comparedOnce = true;
  const note = compareNote();
  const first = !comparedBefore;
  comparedBefore = true;
  const said = `${dj.describeCompare(djCtx({ dateB, sample: a, sampleB: b, brief: true, omitPlace: true }))}${first ? ` ${t("compareFirst")}` : ""}`;
  sayAfter(COMPARE_SOUND_MS - 500, note && !said.includes(note) ? `${said} ${note}.` : said);
}

/**
 * After a Compare is switched on: a short beat (the readout's change is seen first), then a smooth
 * scroll down to the two NASA frames, A and B with the wave between them (on a phone, where they
 * stack, plate A's top). Reduced motion: an instant scroll. The focus stays on what the visitor
 * used and nothing is announced; a scroll of their own during the beat cancels it.
 */
const PLATES_BEAT_MS = 600;
let platesTimer = 0;
function scrollToPlates() {
  clearTimeout(platesTimer);
  const y0 = window.scrollY;
  let cancelled = false;
  const cancel = () => { cancelled = true; };
  const opts = { passive: true, once: true };
  // Any key or scroll of the visitor's own during the beat (Esc, Tab, a scroll key) cancels it.
  const events = ["wheel", "touchmove", "keydown"];
  setTimeout(() => { if (!cancelled) for (const ev of events) window.addEventListener(ev, cancel, opts); }, 0);
  const done = () => { for (const ev of events) window.removeEventListener(ev, cancel); };
  platesTimer = setTimeout(() => {
    done();
    if (cancelled || Math.abs(window.scrollY - y0) > 4 || !state.compareOn) return;
    const grid = $("frames-grid");
    const plateA = $("frame-a");
    if (!grid || !plateA) return;
    const behavior = reducedMotion.matches ? "auto" : "smooth";
    const r = grid.getBoundingClientRect();
    // Both plates fit the window: centre them; else plate A's top, under the page's top edge.
    if (r.height <= window.innerHeight - 24) grid.scrollIntoView({ behavior, block: "center" });
    else plateA.scrollIntoView({ behavior, block: "start" });
  }, PLATES_BEAT_MS);
}

/**
 * The wordmark is the way home: stop the sound, go back to the first record with its default place
 * and date, and show the whole Earth again as the page opens (the globe swings back). The language
 * and the focus stay where they are; nothing sounds.
 */
async function goHome() {
  if (!state.meta) return;
  stopAll({ quiet: true });
  if (state.compareOn) setCompare(false);
  const calm = reducedMotion.matches;
  window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
  view.home();
  await selectRecord(state.records[0].id, { reason: "init", fly: false, quiet: true });
  announcer.say(`${t("homeSaid")} ${dj.describe(djCtx())}`);
  voiceSay("home", "status");
}

function sayWhere() {
  const p = currentPlace();
  announcer.now(t("whereAmI", { name: p.name, lat: latText(p.lat, getLang()), lon: lonText(p.lon, getLang()) }));
}

function sayValue() {
  announcer.now(dj.describe(djCtx()));
}

/**
 * The place list's hint as key caps (decorative: the list's description, #places-help, says the
 * same sentence to assistive technology): the arrow keys choose and sound a place, Enter plays it
 * through time. Not shown on touch screens, where the help sentence names taps instead.
 */
function renderHint() {
  const hint = $("places-hint");
  if (!hint) return;
  const svg = (d) => {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.setAttribute("viewBox", "0 0 10 10");
    el.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    el.append(path);
    return el;
  };
  const kbd = (...kids) => { const k = document.createElement("kbd"); k.append(...kids); return k; };
  const item = (cap, key) => {
    const span = document.createElement("span");
    span.className = "hint__item";
    span.append(cap, Object.assign(document.createElement("span"), { textContent: t(key) }));
    return span;
  };
  const arrows = kbd(svg("M5 8.6V1.8M2.3 4.3 5 1.6l2.7 2.7"), svg("M5 1.4v6.8M2.3 5.7 5 8.4l2.7-2.7"));
  arrows.className = "kbd-arrows";
  const sides = kbd(svg("M8.6 5H1.8M4.3 2.3 1.6 5l2.7 2.7"), svg("M1.4 5h6.8M5.7 2.3 8.4 5 5.7 7.7"));
  sides.className = "kbd-arrows";
  hint.replaceChildren(item(arrows, "hintChoose"), item(sides, "hintSwitch"), item(kbd(t("keySpace")), "hintPlay"));
}

/* ---------- Language and dialogs ---------- */

/** Place and record names in the current language (Portuguese for the blind-test flow). */
function localizeNames() {
  localizeData({ places: state.places, records: state.records, metas: [...state.metas.values()] }, getLang());
}

function syncTitle() {
  document.title = `${BRAND}: ${t("tagline").replace(/\.$/, "")}`;
}

/** The pressed language button follows the current language. */
function syncLang() {
  for (const b of document.querySelectorAll(".lang__btn")) b.setAttribute("aria-pressed", String(b.dataset.lang === getLang()));
}

function changeLang(lang) {
  // The switch's choice is remembered in this browser: it beats the device's language next time.
  try { localStorage.setItem("bmr-lang", lang); } catch { /* storage blocked */ }
  if (lang === getLang()) return;
  setLang(lang);
  localizeNames();
  relabelRecords();
  placeList?.relabel();
  syncLang();
  syncTitle();
  syncConsoleToggle();
  renderHint();
  syncRemote();
  $("play-label").textContent = t(state.playing ? "pause" : "play");
  if ($("guide").open) renderGuide($("guide-body"), getLang());
  if (!state.meta) return;
  view.renderScale(state.meta, getLang());
  view.renderLiner(state.meta, getLang(), state.places);
  view.renderColorbar(state.meta, getLang());
  buildCompareOptions({ keep: true });
  if (state.compareOn) setCompare(false);
  update("lang", { fly: false });
  if (!document.documentElement.classList.contains("gate-on")) announcer.say(dj.describe(djCtx()));
}

function openDialog(id, focusId, before) {
  const dialog = $(id);
  if (dialog.open) return;
  dialogReturn = document.activeElement;
  stopAll({ quiet: true }); // nothing plays over the reading
  before?.();
  dialog.showModal();
  $(focusId).focus();
}

function wireDialog(id) {
  $(id).addEventListener("close", () => {
    // Back to where the user was (a place in the list, a button).
    if (dialogReturn && dialogReturn.isConnected) dialogReturn.focus();
    dialogReturn = null;
  });
}

/**
 * The keyboard guide: a dialog with every shortcut as headings and lists, so a screen reader user
 * reads it at their own pace and can read it again.
 */
function openGuide() {
  openDialog("guide", "guide-title", () => renderGuide($("guide-body"), getLang()));
}

function openAbout() {
  openDialog("about", "about-title", () => state.meta && view.renderThisDate(state.meta, currentDate(), getLang()));
}

/* ---------- Collapsible console (wide screens) ---------- */

// Below 1100 px the console is in the page flow: the toggle is hidden there by CSS and the
// console must never stay hidden.
const narrow = window.matchMedia("(max-width: 1099.98px), (max-width: 51.99em)");

function syncConsoleToggle() {
  const btn = $("console-toggle");
  if (!btn) return;
  btn.setAttribute("aria-expanded", String(!consoleCollapsed));
  const label = btn.querySelector("[data-i18n]");
  if (label) {
    label.dataset.i18n = consoleCollapsed ? "consoleShow" : "consoleHide";
    label.textContent = t(label.dataset.i18n);
  }
}

/** Hide or show the console. Not remembered: every visit starts with the controls shown. */
function setConsoleCollapsed(on) {
  const consoleEl = $("console");
  if (!consoleEl) return;
  if (on && narrow.matches) on = false;
  if (on === consoleCollapsed) return;
  const hadFocus = consoleEl.contains(document.activeElement);
  consoleCollapsed = on;
  document.body.classList.toggle("console-collapsed", on);
  consoleEl.hidden = on;
  syncConsoleToggle();
  // The focus never stays in a hidden console (the console closed by itself during a Play): to Pause
  // or Play. Closed with its toggle, the focus is on the toggle and stays there.
  if (on && hadFocus) $("r-play").focus({ preventScroll: true });
  if (!on) placeList?.reveal();
  // The stage grows or shrinks: the pictures re-measure once the layout has settled.
  requestAnimationFrame(() => requestAnimationFrame(() => view.resizeViews()));
  setTimeout(() => view.resizeViews(), 450);
}

/* ---------- Wiring ---------- */

function wire() {
  // The entrance: the guided tour (the primary action, what Space does) or Explore on my own (the
  // sound starts as before, no tour).
  // The gate's three buttons: the gate leaves (inert removed at once), then the chosen start.
  $("tour-start").addEventListener("click", () => enterGate("a"));
  $("tour-voice").addEventListener("click", () => enterGate("b"));
  $("start").addEventListener("click", () => enterGate("c"));
  // The remote.
  $("r-play").addEventListener("click", () => remotePlay());
  $("r-next").addEventListener("click", () => remoteStep(1));
  $("r-prev").addEventListener("click", () => remoteStep(-1));
  $("r-record").addEventListener("click", () => remoteRecord());
  $("r-tour").addEventListener("click", () => (tour.active ? stopTour() : startTour()));
  // The toggle by hand: the user takes the console over from the Play rule.
  $("console-toggle")?.addEventListener("click", () => { autoCollapsed = false; setConsoleCollapsed(!consoleCollapsed); });
  $("np-pause").addEventListener("click", () => { if (state.playing) pause(); });
  // The kind of the last real gesture, and a console closed by the Play rule reopens at once when
  // a key that moves the focus is pressed (the focus must never end up hidden).
  document.addEventListener("pointerdown", (e) => { if (e.isTrusted) lastInput = "pointer"; }, true);
  document.addEventListener("keydown", (e) => {
    if (!e.isTrusted) return;
    lastInput = "key";
    if (autoCollapsed && consoleCollapsed && /^(Tab|Arrow)/.test(e.key)) { autoCollapsed = false; setConsoleCollapsed(false); }
  }, true);
  narrow.addEventListener("change", () => {
    if (!narrow.matches) return;
    // The toggle is hidden on narrow screens: if it had the focus, the focus goes to the place.
    const onToggle = document.activeElement === $("console-toggle");
    autoCollapsed = false;
    setConsoleCollapsed(false);
    if (onToggle && state.placeId) placeList.check(state.placeId, { focus: true });
  });
  $("play").addEventListener("click", () => playPause());
  $("compare").addEventListener("click", runCompare);
  $("legend").addEventListener("click", () => playLegend());
  $("stop").addEventListener("click", () => { userActed(); stopAll(); });
  // Language buttons, not a select: a select would switch the whole page while its options are browsed.
  for (const b of document.querySelectorAll(".lang__btn")) b.addEventListener("click", () => changeLang(b.dataset.lang));

  // A plain click goes home in place; a modified click keeps the link's own behaviour (a new tab).
  $("home").addEventListener("click", (e) => {
    if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    goHome();
  });
  $("guide-open").addEventListener("click", openGuide);
  $("guide-close").addEventListener("click", () => $("guide").close());
  $("about-open").addEventListener("click", openAbout);
  $("about-close").addEventListener("click", () => $("about").close());
  wireDialog("guide");
  wireDialog("about");
  $("letters-on").checked = lettersOn;
  $("letters-on").addEventListener("change", (e) => {
    lettersOn = e.target.checked;
    try { localStorage.setItem("bmr-letters", lettersOn ? "on" : "off"); } catch { /* storage blocked */ }
  });
  $("compare-with").addEventListener("change", (e) => {
    if (e.target.value !== PAIR) state.compareDate = e.target.value;
    if (!state.compareOn) syncComparePair();
  });

  // The gate's taps: a plain touch or click on its background (not on a button or link) that came
  // with a real pointer (no screen reader in between) wakes the app's voice (G01t; G01 for a mouse);
  // the next one starts the tour with the app's voice.
  window.addEventListener("pointerdown", (e) => { if (e.isTrusted) lastRawPointerAt = performance.now(); }, true);
  // The gate's rule: the first raw press only speaks; an option is chosen, then confirmed. A click
  // with no raw pointer (a screen reader, or Enter or Space on a focused button) enters at once.
  window.addEventListener("click", (e) => {
    if (!e.isTrusted || !document.documentElement.classList.contains("gate-on") || gateLeaving) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest(".gate__lang") || !t?.closest("#gate")) return; // the language switch stays direct
    const raw = e.detail > 0 && performance.now() - lastRawPointerAt <= 1500;
    if (!raw) return; // assistive activation: the button's own handler enters it
    e.preventDefault();
    e.stopPropagation();
    const btn = t.closest("#tour-start, #tour-voice, #start");
    const target = btn ? GATE_OPTIONS[[$("tour-start"), $("tour-voice"), $("start")].indexOf(btn)] : "bg";
    const mouse = e.pointerType === "mouse";
    if (!mouse && touchUi()) fingerProven = true;
    const tap = { t: performance.now(), x: e.clientX, y: e.clientY };
    const double = gateWoken && (e.detail >= 2 || isDoubleTap(lastGateTap, tap));
    lastGateTap = tap;
    gateAct(gateDecision({ input: double ? "double" : mouse ? "mouse" : "touch", woken: gateWoken, target, selected: gateSelected }), mouse ? "mouse" : "touch");
  }, true);
  // A finger's swipe up or down on the gate: the previous or next option (while the gate fits).
  let gateTouch = null;
  window.addEventListener("touchstart", (e) => {
    if (!document.documentElement.classList.contains("gate-on") || gateLeaving || e.touches.length > 1) { gateTouch = null; return; }
    const p = e.changedTouches[0];
    gateTouch = { x: p.clientX, y: p.clientY, t: performance.now() };
  }, { capture: true, passive: true });
  window.addEventListener("touchend", (e) => {
    if (!gateTouch || !document.documentElement.classList.contains("gate-on") || gateLeaving) return;
    const p = e.changedTouches[0];
    const dy = p.clientY - gateTouch.y;
    const g = touchGesture({ dx: p.clientX - gateTouch.x, dy, ms: performance.now() - gateTouch.t });
    gateTouch = null;
    if (g !== "switch" || !document.documentElement.classList.contains("gate-fits")) return;
    fingerProven = touchUi() || fingerProven;
    gateAct(gateDecision({ input: dy > 0 ? "swipeDown" : "swipeUp", woken: gateWoken, target: "bg", selected: gateSelected }), "touch");
  }, { capture: true, passive: true });
  // The voice tour on a touch screen: a tap anywhere that is not a control pauses and continues, a
  // swipe left or right goes to the next or previous place, up or down switches sea and fire. Kept
  // from the globe and the page (no rotating, zooming or scrolling under the finger).
  const isControl = (t) => t instanceof Element && !!t.closest("button, a, input, select, textarea, label, dialog");
  let touchFrom = null;
  window.addEventListener("touchstart", (e) => {
    if (!voiceTouch || isControl(e.target) || e.touches.length > 1) { touchFrom = null; return; }
    e.stopPropagation();
    const p = e.changedTouches[0];
    touchFrom = { x: p.clientX, y: p.clientY, t: performance.now() };
  }, { capture: true, passive: false });
  window.addEventListener("touchmove", (e) => { if (voiceTouch && touchFrom) { e.preventDefault(); e.stopPropagation(); } }, { capture: true, passive: false });
  window.addEventListener("touchend", (e) => {
    if (!voiceTouch || !touchFrom) return;
    e.preventDefault(); // no click after it: nothing under the finger is pressed
    e.stopPropagation();
    const p = e.changedTouches[0];
    const g = touchGesture({ dx: p.clientX - touchFrom.x, dy: p.clientY - touchFrom.y, ms: performance.now() - touchFrom.t });
    touchFrom = null;
    ({ tap: () => remotePlay(), next: () => remoteStep(1), prev: () => remoteStep(-1), switch: () => remoteRecord() })[g]?.();
  }, { capture: true, passive: false });
  for (const type of ["pointerdown", "pointermove", "pointerup", "click", "wheel", "dblclick"]) {
    window.addEventListener(type, (e) => { if (voiceTouch && !isControl(e.target)) { e.stopPropagation(); if (type === "click" || type === "dblclick") e.preventDefault(); } }, { capture: true, passive: false });
  }
  // A screen reader's double tap on a touch screen: a trusted click with no touchstart before it.
  document.addEventListener("touchstart", (e) => { if (e.isTrusted) lastTouchAt = performance.now(); }, { capture: true, passive: true });
  document.addEventListener("click", (e) => {
    if (e.isTrusted && touchUi() && performance.now() - lastTouchAt > 700) srLikely = true;
  }, true);
  // The focus never falls to the body. A control that held it and was hidden or removed (a place
  // list rebuilt, a strip that went): the focus goes to Pause or Play at once. After any key, a
  // focus left on the body goes there too (nothing extra is said).
  document.addEventListener("focusout", (e) => {
    const was = e.target;
    if (e.relatedTarget || !(was instanceof Element)) return;
    setTimeout(() => {
      if (!lostFocus()) return;
      const gone = !was.isConnected || was.getClientRects().length === 0 || !!was.closest("[hidden], [inert]");
      if (gone || lastInput === "key") rescueFocus();
    }, 0);
  });
  document.addEventListener("keydown", () => { setTimeout(() => { if (lostFocus()) rescueFocus(); }, 0); }, true);
  // "Skip to the player": the remote's first button.
  $("skip-start")?.addEventListener("click", (e) => {
    e.preventDefault();
    $("r-play")?.focus();
  });

  // The voice guide: a native checkbox (and G). Off by default; chosen at the start or later.
  $("voice-on").addEventListener("change", (e) => setVoice(e.target.checked));

  // Vibration with the sound (Android): a native checkbox, shown only where a phone can vibrate.
  const hap = $("haptics-on");
  if (hap) {
    const off = !haptics.supported();
    $("haptics-row").hidden = off;
    $("haptics-help").hidden = off;
    hap.checked = haptics.enabled();
    hap.addEventListener("change", (e) => {
      haptics.setEnabled(e.target.checked);
      if (e.target.checked) haptics.value(1);
      announcer.say(t(e.target.checked ? "hapticsOn" : "hapticsOff"));
    });
  }

  // A hidden page (another tab, a locked phone) stops all sound and vibration, quietly; the next
  // touch or key wakes the audio the browser suspended meanwhile.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopAll({ quiet: true });
  });
  // A real gesture (never a script's click) resumes suspended audio, and also unblocks a start still
  // pending from a first activation that did not count as one (engine.start() is safe to repeat).
  const wake = (e) => {
    if (!e.isTrusted) return;
    // The gesture arms the voice and never cuts it: only an action that starts something else
    // (another place, the other record, pause, stop) ends a line, so a visitor who turns the Earth,
    // closes the panel or presses a stray key keeps hearing the narration.
    voice?.arm();
    if (!engine) return;
    // Only a started engine that the browser suspended; a start under way is never started again
    // (each start builds the audio graph, and a second Tone.js could load).
    if (state.started && !engine.isRunning()) Promise.resolve(engine.start()).catch(() => {});
  };
  document.addEventListener("pointerdown", wake, true);
  document.addEventListener("keydown", wake, true);

  $("date").addEventListener("input", (e) => {
    if (state.playing) { stopEngine(); endPlay(); }
    cancelAutoPlay();
    freshPlace = false;
    pausedHere = false;
    ensureStarted();
    state.dateIndex = Number(e.target.value);
    resetCompareDate({ rebuild: false });
    update("date");
  });

  document.addEventListener("keydown", (e) => {
    // While a dialog is open, every key belongs to it (Esc closes it).
    if ($("guide").open || $("about").open) return;
    const target = e.target instanceof Element ? e.target : null;
    // On the gate. A key that reaches the page (no screen reader took it) wakes the app's voice
    // (G01; it also skips the opening). Then the arrows move among the three buttons and the voice
    // names each (G02a to G02c), and Space off a button starts the tour with the app's voice. Tab,
    // and Enter or Space on a button, stay native (a button's activation works as always).
    if (document.documentElement.classList.contains("gate-on")) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (gateLeaving) { if (e.key === " " && !target?.closest("button")) e.preventDefault(); return; }
      if (e.key === "Tab" || ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key)) return;
      if (target?.closest(".gate__lang")) return; // the language switch keeps its own keys
      const rows = [$("tour-start"), $("tour-voice"), $("start")];
      const at = rows.indexOf(target?.closest("button"));
      const onControl = !!target?.closest("button, a, input, select, textarea");
      if (onControl && (e.key === " " || e.key === "Enter")) return; // the button's own activation
      const next = at >= 0 || !onControl ? gateKey(e.key, at, rows.length) : null;
      if (!gateWoken) {
        if (!e.isTrusted) return;
        e.preventDefault();
        wakeGate("key");
        if (next != null) selectGate(GATE_OPTIONS[next], { say: false });
        return;
      }
      if (next != null) { e.preventDefault(); selectGate(GATE_OPTIONS[next]); return; }
      if (e.key === " " && !onControl) { e.preventDefault(); startVoiceTour(); }
      return;
    }
    // One key map in all three entrances, wherever the focus is (tour.js guidedKey): the arrows and
    // Space never scroll the page (Page Up, Page Down, Home, End, Tab and the mouse still do).
    if (!document.documentElement.classList.contains("gate-on") && !e.defaultPrevented && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // (defaultPrevented: the place list has already acted, Enter on a place or a letter.)
      const act = guidedKey(e.key, focusKindOf(target));
      const run = { stop: () => { userActed(); stopAll(); }, next: () => remoteStep(1), prev: () => remoteStep(-1), fire: () => remoteRecord("fire"), sea: () => remoteRecord("sea"), pause: () => remotePlay() }[act];
      if (run) { e.preventDefault(); run(); return; }
    }
    if (e.key === "Escape") { userActed(); stopAll(); return; }
    // Space starts the guided tour from anywhere that is not a control of its own (and once the
    // sound is on, starts or stops it); arrows on the remote or the place list: next or previous
    // place (on the list, only during the tour), left the sea, right the fire.
    const where = target?.closest("#remote") ? "remote" : target?.closest("#places-list") ? "list" : "page";
    const onControl = !!target?.closest("button, select, input, textarea, summary, a, [contenteditable]");
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      const act = remoteKey(e.key, { where, onButton: onControl, tour: tour.active });
      // Space on the gate is button a, but only once the gate is fully shown: a Space pressed to
      // skip the opening only skips it.
      if (act === "tour" && document.documentElement.classList.contains("intro-on")) return;
      const run = { tour: () => (!state.started ? (leaveGate($("tour-start")), startTour({ voice: false })) : !tour.active ? startTour() : stopTour()), next: () => remoteStep(1), prev: () => remoteStep(-1), sea: () => remoteRecord("sea"), fire: () => remoteRecord("fire") }[act];
      if (run && (act !== "tour" || where !== "list")) { e.preventDefault(); run(); return; }
    }
    if (target?.matches("select, input[type=text], input[type=search], textarea") || e.ctrlKey || e.altKey || e.metaKey) return;
    const inPlayer = !!target?.closest("#player");
    const inPlaces = !!target?.closest("#places-list");
    // Single-key shortcuts can be limited to the place list (an option in the keyboard guide).
    // While the console is hidden, its toggle stands in for the place list.
    const onToggle = consoleCollapsed && target?.id === "console-toggle";
    if (!lettersOn && !inPlaces && !onToggle) return;
    if (e.key === "?") { e.preventDefault(); openGuide(); return; }
    if (!inPlayer || !state.meta) return;
    const k = e.key.toLowerCase();
    const actions = {
      p: () => playPause(), c: runCompare, l: playLegend, w: sayWhere, v: sayValue, d: describeFrame,
      n: () => stepPlace(e.shiftKey ? -1 : 1), ",": () => stepDate(-1), ".": () => stepDate(1),
      // S is a second stop key: some screen readers keep Esc for themselves.
      s: () => stopAll(), h: openGuide,
      // G: the voice guide on or off (it says which itself).
      g: () => setVoice(!voice?.isOn()),
      // The globe's zoom, about 15% per press (the mouse wheel does the same over the planet).
      "+": () => view.zoomBy(ZOOM_STEP), "=": () => view.zoomBy(ZOOM_STEP), "-": () => view.zoomBy(1 / ZOOM_STEP),
    };
    if (actions[k]) { e.preventDefault(); actions[k](); }
  });
}

/**
 * The gate's wake: a raw touch or key reached the page, so most likely no screen reader. Inside the
 * same gesture the sound starts (the audio unlocks, the recordings start loading) and the app's
 * voice says the gate's prompt: G01t after a touch, G01 after a key. The gate stays up.
 */
function wakeGate(kind, lines = null) {
  gateWoken = true;
  voice?.arm();
  voice?.unlock(); // inside the gesture: the audio element and speech synthesis
  ensureStarted({ button: document.createElement("span") }).catch?.(() => {});
  voice?.say(lines || [kind === "touch" ? "G01t" : "G01"], { force: true, kind: "status" });
}

/** Enter one of the gate's options (a: the tour with the reader; b: with the app's voice; c: explore). */
function enterGate(option) {
  const btn = { a: $("tour-start"), b: $("tour-voice"), c: $("start") }[option];
  if (option === "a" && choiceSaysScreenReader(btn.id, touchUi())) srLikely = true; // she told us
  if (option === "c") { if (leaveGate(btn, { explore: true })) startSound(); return; }
  if (leaveGate(btn)) startTour({ voice: option === "b", button: btn });
}

/** Select a gate option (focus and the selected look); the voice says its name unless told not to. */
function selectGate(option, { say = true } = {}) {
  gateSelected = option;
  const rows = { a: $("tour-start"), b: $("tour-voice"), c: $("start") };
  for (const [o, el] of Object.entries(rows)) el.classList.toggle("is-selected", o === option);
  rows[option].focus({ preventScroll: true });
  if (say) voice?.say(`G02${option}`, { force: true, kind: "status" });
}

/** Carry out the gate's decision (tour.js gateDecision). */
function gateAct(d, kind) {
  if (d.action === "enter") { enterGate(d.option); return; }
  if (d.action === "wake") { selectGate(d.option, { say: false }); wakeGate(kind, d.lines); return; }
  if (d.action === "select") { selectGate(d.option); return; }
  if (d.action === "say") voice?.say(d.lines, { force: true, kind: "status" });
}

/** While the gate fits the screen a finger's swipes and double taps are its own (css: gate-fits). */
function fitGate() {
  const g = $("gate");
  if (!g) return;
  document.documentElement.classList.toggle("gate-fits", g.scrollHeight <= g.clientHeight + 1);
}

/** The tour with the app's voice, from the gate (the second tap, or Space on the page). */
function startVoiceTour() {
  if (leaveGate($("tour-voice"))) startTour({ voice: true, button: $("tour-voice") });
}

/** What the focus is on, for the page's key map (tour.js guidedKey). */
function focusKindOf(t) {
  if (!t || t === document.body || t === document.documentElement) return "other";
  if (t.closest("select, textarea, input[type=range], input[type=text], input[type=search], [contenteditable]")) return "keep";
  if (t.closest("#places-list")) return "list";
  if (t.closest("button, a[href], summary, input[type=checkbox]")) return "button";
  return "other";
}

/** The focus is on nothing (the body), with no dialog open and the app started. */
function lostFocus() {
  const a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement) return false;
  if ($("guide").open || $("about").open) return false;
  return !document.documentElement.classList.contains("gate-on") && !$("remote-keys").hidden;
}

/** The focus back on a real control: Pause or Play on the remote. */
function rescueFocus() {
  $("r-play")?.focus({ preventScroll: true });
}

/* ---------- Boot ---------- */

/**
 * Put Tone.js (the engine loads vendor/Tone.js with a plain script element) in the cache before the
 * first gesture, so Space does not wait for the download on a slow link. Download only: nothing is
 * evaluated and no audio is created before a gesture. A low-priority prefetch, added once the place
 * list is ready and the page is idle: the script element then takes it from the HTTP cache (a
 * preload would be flagged as unused while the visitor has not pressed Space yet).
 */
function preloadTone() {
  const add = () => {
    if (state.started || document.querySelector('link[data-preload="tone"]')) return;
    const link = Object.assign(document.createElement("link"), { rel: "prefetch", as: "script", href: "vendor/Tone.js" });
    link.dataset.preload = "tone";
    document.head.append(link);
  };
  if (window.requestIdleCallback) requestIdleCallback(add, { timeout: 2000 });
  else setTimeout(add, 300);
}

async function boot() {
  const params = new URLSearchParams(location.search);
  // Touch screens: the visible words say "tap" and name the buttons (set before the first setLang).
  if (touchUi()) $("places-help").dataset.i18n = "placesHelpTouch";
  holdGate();
  fitGate();
  addEventListener("resize", fitGate);
  // Touch screens show the help sentence and no key caps; keyboards get the key-cap hint instead.
  document.body.classList.toggle("touch-ui", touchUi());
  // The remote's height: the console starts under it on the desktop; on a phone the page keeps room
  // for its pinned bar at the bottom.
  if (typeof ResizeObserver === "function") {
    const measure = () => {
      const desk = !narrow.matches;
      const remote = $("remote");
      const bar = $("remote-keys").hidden ? null : $("remote-keys");
      document.documentElement.style.setProperty("--remote-h", `${desk ? Math.ceil(remote.getBoundingClientRect().height) : 0}px`);
      document.documentElement.style.setProperty("--remote-bar", `${!desk && bar ? Math.ceil(bar.getBoundingClientRect().height) : 0}px`);
    };
    const ro = new ResizeObserver(measure);
    for (const el of [$("remote"), $("remote-keys")]) ro.observe(el);
    narrow.addEventListener("change", measure);
  }
  // One date of Play: the record thumbnail in the console turns once per date, like the readout's disc.
  document.documentElement.style.setProperty("--turn", `${STEP_MS}ms`);
  // The starting language was decided in the head before the first paint (startLang in index.html).
  setLang(document.documentElement.lang === "pt-BR" ? "pt-BR" : "en");
  renderHint();
  syncLang();
  syncTitle();
  [engine, dj] = await Promise.all([loadEngine(), loadDj()]);
  // The same module instance deps.js loaded (or nothing, with the simulator): its optional calls.
  try { engineExtra = await import("./engine.js"); } catch { engineExtra = null; }
  announcer = createAnnouncer({ region: $("live"), duck: (ms) => engine.duck(ms) });
  // quiet: no voice line ever starts while the music of a Play is sounding.
  voice = createVoice({ lang: getLang, duck: (ms) => engine.duck(ms), policy: voicePolicy, quiet: () => state.playing });
  let voiceOn = false; // off by default on every device: chosen at the start, or later with G
  try { const kept = localStorage.getItem(VOICE_KEY); if (kept) voiceOn = kept === "on"; } catch { /* storage blocked */ }
  setVoice(voiceOn, { say: false });
  placeList = createPlaceList({
    list: $("places-list"),
    template: $("tpl-place"),
    onSelect: (id) => { userActed(); selectPlace(id); },
    onActivate: (id) => { userActed(); activatePlace(id); },
    onHover: (id) => view.hover(id),
    reserved: (key) => SHORTCUTS.has(key.toLowerCase()),
    lang: getLang,
  });
  wire();

  try {
    [state.records, state.places] = await Promise.all([loadRecords(), loadPlaces()]);
    const metas = await Promise.all(state.records.map((r) => loadMeta(r)));
    state.records.forEach((r, i) => state.metas.set(r.id, metas[i]));
  } catch {
    $("records-list").replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: t("loadError") }));
    announcer.now(t("loadError"));
    return;
  }
  localizeNames();
  buildRecords();

  // The picture: the globe (the flat record without WebGL).
  // A click on a dot selects its place (and switches record when the dot belongs to the other one);
  // it never starts Play and never moves the keyboard focus.
  // A dot (globe or NASA frame) always goes back to the record's first date; a dot on the NASA
  // frame defers the globe's flight until the page has scrolled up to it (view.js).
  view.initStage({ onPick: (id, o = {}) => selectPlace(id, { dot: true, deferFly: o.from === "frame" }), onHover: (id) => placeList.light(id), turnMs: STEP_MS });
  // A colour strip that arrives after the values and the score were drawn: draw them again in colour.
  view.onStripReady((meta) => {
    if (meta !== state.meta) return;
    if (valuesFor?.meta === meta) refreshValues(meta, valuesFor.date, valuesFor.frame);
    seriesKey = `${meta.id}|${state.placeId}`;
    loadSeries(meta, currentPlace());
  });

  const link = fromUrl(params);
  await selectRecord(link.recordId, { placeId: link.placeId, date: link.date, reason: "init", fly: link.named });
  preloadTone();
  // When the opening lifts, the Earth makes its entrance again in plain sight (unless a link went
  // straight to a place).
  // The Earth makes its entrance when the gate leaves (leaveGate), in every case.
  deepLinked = link.named;
  // If js/ui/splash.js never ran, the opening's CSS fallback has shown the gate by 9.4 s: the opening
  // is over then for the keys too (Space on the gate waits for it).
  setTimeout(() => {
    if (!document.documentElement.classList.contains("intro-on")) return;
    document.documentElement.classList.remove("intro-on");
    $("splash")?.remove();
  }, 9600);
  // No focus is moved: a screen reader user starts where they are. One short spoken intro, only
  // while the gate still waits for a choice (a visitor who already chose does not hear it late).
  if (document.documentElement.classList.contains("gate-on") && !gateLeaving) announcer.say(t(touchUi() ? "introTouch" : "intro"));
}

boot();
