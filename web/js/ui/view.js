// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Visual mirror of the player state: the stage picture (the 3D globe with the record's disc around
// it, or the flat record when WebGL is missing), the readout set in type over the stage with its
// small picture disc, the NASA frame plates and the "Data and method" notes. Nothing here is the
// only way to get information: every value is also in the native controls, in #readout-text and in
// the announcements.

import { discUrl, displayUrl, physicalValue, siblingUrl } from "../data.js";
import { fireRamp } from "./ramp.js";
import { crosshairPos, pickNearest, plateSizes } from "./geometry.js";
import { dateText } from "./valuetext.js";
import { t } from "./i18n.js";
import { readoutParts, scaleEnds, readingColor, cssColor, compactValue, scoreBar, usesFireRamp, scalePlace, valueAtPlace } from "./format.js";
import { scaleText, datesText, validationText, methodRows, compareText, provenanceText, perDateText } from "./liner.js";

const $ = (id) => document.getElementById(id);
// Media queries made once (matchMedia on every Play step was measurable).
const rmq = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarseQuery = window.matchMedia("(pointer: coarse)");
const reduceMotion = () => rmq.matches;

// Sizes read once and kept up to date by observers, never read back right after a style write on a
// Play step: the plates' drawn widths, and the stage's free box (the globe asks for it per frame).
const plateWidth = new Map(); // img element -> CSS width
let plateObserver = null;
function widthOf(img) {
  if (!plateWidth.has(img)) {
    plateWidth.set(img, img.getBoundingClientRect().width || 0);
    if (typeof ResizeObserver === "function") {
      plateObserver ||= new ResizeObserver((entries) => { for (const e of entries) plateWidth.set(e.target, e.contentRect.width); });
      plateObserver.observe(img);
    }
  }
  return plateWidth.get(img);
}
let safeRect = null;
function safeArea() {
  if (!safeRect) {
    const el = $("stage-safe");
    if (!el) return null;
    safeRect = el.getBoundingClientRect();
    // Measured again after the next resize or scroll (the box is in viewport coordinates).
    if (!safeArea.wired) {
      safeArea.wired = true;
      const drop = () => { safeRect = null; };
      if (typeof ResizeObserver === "function") new ResizeObserver(drop).observe(el);
      window.addEventListener("resize", drop, { passive: true });
      window.addEventListener("scroll", drop, { passive: true });
    }
  }
  return safeRect;
}

/* ---------- The stage: one picture behind the stage view interface (see the brief) ---------- */

// The 3D turntable (turntable3d.js) is retired: the globe is the only stage picture, and the flat
// record stands in for it on devices without WebGL.
const NAMES = ["globe"];
const views = { globe: null }; // created view objects
const pending = { globe: null }; // creation promises
const failed = { globe: false };
const shown = "globe";
let handlers = { onPick: () => {}, onHover: () => {} };
let flatOn = false;
let flatRotation = 0;
let turnMs = 1429; // one turn of the readout's picture disc per date of Play (set by initStage)
// The last state pushed, replayed to a view created later.
// selectOpts: the options of the last select, so a globe created after a deep link flies there too.
const last = { places: [], meta: null, placeId: null, selectOpts: { fly: false }, frame: null, power: false, playing: false };
let lastFrameKey = "";

/** Call a method on every created view; one view's error never stops the app or the other view. */
function each(method, ...args) {
  for (const name of NAMES) call(views[name], method, ...args);
}

function call(view, method, ...args) {
  if (!view || typeof view[method] !== "function") return;
  try {
    view[method](...args);
  } catch (err) {
    console.warn(`Stage view: ${method} failed.`, err);
  }
}

function viewOptions(name) {
  const common = {
    reducedMotion: reduceMotion,
    safeArea,
    onPick: (id) => handlers.onPick(id),
    onHover: (id, point) => handlers.onHover(id, point, name),
    // A nudge of the record while Play runs (the globe reports it): the scratch sound (ui/scratch.js).
    onScratch: (s) => handlers.onScratch?.(s),
  };
  return {
    ...common,
    texture: "css/img/earth-blue-marble-2048.jpg", // NASA Visible Earth, Blue Marble (public domain)
    clouds: "css/img/earth-clouds-2048.jpg", // NASA Blue Marble cloud layer (public domain)
    textureHd: "css/img/earth-blue-marble-4096.jpg",
    sky: { hd: "css/img/sky-starmap-2048.jpg", sd: "css/img/sky-starmap-2048.jpg" }, // NASA SVS Deep Star Maps 2020
    moon: "css/img/moon-1024.jpg",
  };
}

/** Create a view once (dynamic import), then hand it the whole current state. */
function ensureView(name) {
  if (views[name] || failed[name]) return Promise.resolve(views[name]);
  if (pending[name]) return pending[name];
  pending[name] = (async () => {
    try {
      const mod = await import("./globe3d.js");
      if (mod.supportsWebGL?.() === false) throw new Error("WebGL is not available");
      const view = await mod.createGlobe3d($("globe-host"), viewOptions(name));
      if (!view) throw new Error("no view returned");
      views[name] = view;
      replay(name);
    } catch (err) {
      failed[name] = true;
      console.warn("The 3D globe is unavailable.", err);
      showFlat(true); // the flat record takes the globe's place
    } finally {
      pending[name] = null;
    }
    renderStageDesc();
    return views[name];
  })();
  return pending[name];
}

function replay(name) {
  const v = views[name];
  if (last.places.length) call(v, "setPlaces", last.places);
  if (last.meta) call(v, "setRecord", last.meta);
  if (last.placeId) call(v, "select", last.placeId, last.selectOpts);
  if (last.frame) call(v, "setFrame", last.frame, {});
  call(v, "setPower", last.power);
  call(v, "setPlaying", last.playing);
  call(v, "setShown", name === shown);
  if (name === shown) call(v, "resize");
}

/**
 * Start the stage: the globe, or the flat record when the globe cannot be created.
 * onPick(id) and onHover(id, point) come from the picture. turnMs: one date of Play, in ms.
 */
export function initStage({ onPick, onHover, onScratch, turnMs: ms }) {
  handlers = { onPick, onHover: (id, point, name) => showTip(id, point, name, onHover), onScratch };
  if (ms > 0) turnMs = ms;
  // A pointer press on a picture must not move the keyboard focus (the browser would otherwise
  // focus main#player, the nearest focusable ancestor, and the user would lose their place).
  // The pictures use pointer events, which this does not stop.
  for (const id of ["globe-host", "deck-host"]) $(id).addEventListener("mousedown", (e) => e.preventDefault());
  // Reduced motion switched on while Play runs: the picture disc stops at once.
  rmq.addEventListener?.("change", () => spinDisc(last.playing));
  wireFrameDots();
  ensureView(shown);
}

/** No WebGL: the flat record (the disc image, turned once per date) in the globe's place. */
function showFlat(on) {
  flatOn = on;
  $("globe-host").hidden = on;
  $("deck-host").hidden = !on;
  $("flat").hidden = !on;
  $("ro-disc").hidden = on; // the same picture is already shown large
  if (on && last.frame) renderFlat(last.frame, {});
}

/** The flat record (no WebGL): the disc image, turned once per date like the 3D one. */
function renderFlat(frame, { stepMs = 0, linear = false } = {}) {
  const img = $("disc-img");
  if (img.getAttribute("src") !== frame.disc) img.src = frame.disc;
  const v = $("vinyl");
  const turn = stepMs > 0 && !reduceMotion();
  if (turn) flatRotation += 360;
  v.style.setProperty("--turn", `${turn ? stepMs : 0}ms`);
  v.style.transitionTimingFunction = linear ? "linear" : "";
  const lon = last.allPlaces?.find((p) => p.id === last.placeId)?.lon ?? 0;
  v.style.setProperty("--rot", `${flatRotation - lon}deg`);
}

/**
 * Push the state to every created view. Only what changed is sent.
 * state = { meta, places (all), placeId, frame }
 * opts  = { fly, stepMs, linear, force (language change: names and titles changed),
 *          refocus (an explicit choice of a place by the user: the globe flies in again even when
 *          the place is the same; refreshes such as a date step never pass it) }
 */
export function sync({ meta, places, placeId, frame }, { fly = true, stepMs = 0, linear = false, force = false, refocus = false, hold = false } = {}) {
  const recordChanged = force || meta !== last.meta;
  last.allPlaces = places;
  if (recordChanged) {
    last.places = places.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, surface: p.surface, active: !meta.surface || p.surface === meta.surface }));
    each("setPlaces", last.places);
    last.meta = meta;
    each("setRecord", meta);
  }
  const placeChanged = force || placeId !== last.placeId;
  if (placeChanged || refocus) {
    last.placeId = placeId;
    last.selectOpts = refocus ? { fly, refocus: true } : { fly };
    // hold: the globe hears of this place only when focusPlace() flies it there (a dot on the NASA
    // frame: the flight starts as the page scrolls up to the globe, which does not draw off screen).
    if (hold) heldSelect = true;
    else { heldSelect = false; each("select", placeId, last.selectOpts); }
  }
  if (recordChanged || placeChanged) renderFrameDots();
  const key = `${meta.id}|${frame.date}`;
  if (force || key !== lastFrameKey) {
    lastFrameKey = key;
    last.frame = frame;
    each("setFrame", frame, { stepMs, linear });
    renderDisc(meta, frame);
    if (flatOn) renderFlat(frame, { stepMs, linear });
  } else if (flatOn && placeChanged) {
    renderFlat(frame, {}); // the record turns the new place under the needle
  }
}

/**
 * Bring the stage back to the place under the needle, as an explicit choice does (Compare uses it:
 * after a drag away from the place the globe shows the plain Earth, and a Compare reads the data).
 */
let heldSelect = false;

export function focusPlace() {
  if (!last.placeId) return;
  heldSelect = false;
  last.selectOpts = { fly: true, refocus: true };
  each("select", last.placeId, last.selectOpts);
}

export function setPower(on) {
  last.power = !!on;
  each("setPower", last.power);
}

export function setPlaying(on) {
  last.playing = !!on;
  each("setPlaying", last.playing);
  spinDisc(last.playing);
}

/**
 * Back to the opening picture: the whole Earth, sunlit side (the logo's way home).
 * opts.entrance: play the first push in from far out again (the page's opening has just lifted).
 */
export function home(opts) {
  each("home", opts);
}

/* ---------- The picture disc in the readout ---------- */

let spin = null; // the disc's endless turn (Web Animations), paused in place when Play stops
let settle = 0; // rAF id of the slow-down after Play

/**
 * The record's south polar disc for this date. Two stacked images: the back one loads and decodes
 * the new date, then becomes the front one, so a swap never shows an empty disc. The next date's
 * image is fetched ahead during Play.
 */
// Records whose 256 px disc copy failed to load once: their 1024 px disc stands in from then on.
const thumbBroken = new Set();

function renderDisc(meta, frame) {
  const box = $("ro-disc");
  if (!box) return;
  // The disc is drawn at 56 to 84 px: the 256 px copy when the record has one.
  const thumb = !!frame.discThumb && !thumbBroken.has(meta.id);
  const url = thumb ? frame.discThumb : frame.disc;
  if (box.dataset.want === url) return;
  box.dataset.want = url;
  const [a, b] = box.querySelectorAll("img");
  const front = b.classList.contains("is-front") ? b : a.classList.contains("is-front") ? a : null;
  if (front?.getAttribute("src") === url) return;
  const back = front === a ? b : a;
  back.src = url;
  back.decode().then(() => {
    if (box.dataset.want !== url) return; // another date came first
    back.classList.add("is-front");
    if (front && front !== back) front.classList.remove("is-front");
  }, () => {
    // Replaced by a newer date: nothing to do. A missing thumb: fall back to the full disc, once.
    if (box.dataset.want !== url || !thumb) return;
    thumbBroken.add(meta.id);
    renderDisc(meta, frame);
  });
  const next = meta.dates[frame.index + 1];
  if (next) preload(discUrl(meta, next, { thumb }), { low: true });
}

/**
 * Turn the disc clockwise (the Earth seen from the south turns clockwise, like a record), one turn
 * per date of Play, linear. When Play stops it slows to rest where it is, never back to zero.
 * With reduced motion it never turns.
 */
function spinDisc(on) {
  const el = $("ro-disc")?.querySelector(".readout__spin");
  if (!el?.animate) return;
  cancelAnimationFrame(settle);
  if (!spin) {
    spin = el.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: turnMs, iterations: Infinity, easing: "linear" });
    spin.pause();
  }
  if (on && !reduceMotion()) {
    spin.playbackRate = 1;
    spin.play();
    return;
  }
  if (spin.playState !== "running" || reduceMotion()) { spin.pause(); return; }
  // Ease out over about half a turn's time: the rate falls from 1 to 0, then the turn pauses in place.
  const t0 = performance.now();
  const ease = 600;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ease);
    if (k >= 1) { spin.pause(); spin.playbackRate = 1; return; }
    spin.playbackRate = (1 - k) ** 2;
    settle = requestAnimationFrame(step);
  };
  settle = requestAnimationFrame(step);
}

/**
 * Light a place's dot on the pictures while its row in the place list is pointed at or focused
 * (null: none). The globe's hover() may not exist yet: call() skips a missing method.
 */
export function hover(id) {
  each("hover", id ?? null);
}

/* ---------- The score: one bar per date for the place being read ---------- */

// Behind the date slider (#score) and in the "now playing" strip (#np-score): decorative pictures
// of the series the place will play. Bars are built once per record (one per date) and only their
// length, direction and colour change per place; the date shown and the dates already played are
// marked by class (markScore), so a Play step changes classes only.
const SCORES = ["score", "np-score"];
let scoreCount = 0;
let scoreNow = -1;

function scoreBoxes() {
  return SCORES.map((id) => $(id)).filter(Boolean);
}

/**
 * Draw the series for the place being read. samples: one { v01, nodata } per date of the record,
 * or null while they load (the bars fold away to the baseline and come back when they arrive).
 */
export function renderScore(meta, samples) {
  const n = meta.dates.length;
  for (const box of scoreBoxes()) {
    if (box.childElementCount !== n) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i++) frag.append(document.createElement("i"));
      box.replaceChildren(frag);
      scoreNow = -1;
    }
    // Bar width from the spacing: thin bars on a long record, never under 2 px or over 5 px.
    const w = box.getBoundingClientRect().width || 280;
    box.style.setProperty("--bw", `${Math.max(2, Math.min(5, Math.floor(((w - 16) / Math.max(1, n - 1)) * 0.42)))}px`);
    box.classList.toggle("is-loading", !samples);
    box.classList.toggle("is-sequential", meta.scale.kind !== "diverging");
    if (!samples) continue;
    const bars = box.children;
    for (let i = 0; i < n; i++) {
      const bar = bars[i];
      const s = samples[i];
      const shape = scoreBar(meta, s);
      bar.classList.toggle("is-nodata", shape.nodata);
      bar.classList.toggle("is-down", shape.dir === "down");
      bar.style.setProperty("--k", shape.k.toFixed(3));
      const c = readingCss(meta, s);
      if (c) bar.style.setProperty("--c", c);
      else bar.style.removeProperty("--c");
    }
  }
  scoreCount = n;
  markScore(scoreNow < 0 ? 0 : scoreNow, true);
}

/** Mark the date shown (and, during Play, the dates already played) on the score. */
export function markScore(index, force = false) {
  if (!force && index === scoreNow) return;
  scoreNow = index;
  for (const box of scoreBoxes()) {
    const bars = box.children;
    for (let i = 0; i < bars.length && i < scoreCount; i++) {
      bars[i].classList.toggle("is-now", i === index);
      bars[i].classList.toggle("is-past", i < index);
    }
  }
}

/**
 * The length of one date of Play (ms): the engine's own when it has one (a fire date lasts 3.6 to
 * 4.1 s), so the readout's picture disc turns once per date with the sound.
 */
export function setTurnMs(ms) {
  if (!(ms > 0) || ms === turnMs) return;
  turnMs = ms;
  try { spin?.effect?.updateTiming({ duration: ms }); } catch { /* an old browser keeps the last length */ }
}

/** Zoom the globe in (factor above 1) or out (below 1). The globe's zoomBy may not exist yet. */
export function zoomBy(factor) {
  each("zoomBy", factor);
}

/** A tone just sounded: v01 in 0..1, or null for no data. */
export function pulse(v01) {
  each("pulse", v01 ?? null);
}

/* ---------- Hover tip (#stage-tip) ---------- */

function showTip(id, point, name, onHover) {
  onHover?.(id, point);
  const tip = $("stage-tip");
  const place = id ? last.allPlaces?.find((p) => p.id === id) : null;
  if (!place || !point || name !== shown) { hideTip(); return; }
  const host = $(name === "globe" ? "globe-host" : "deck-host");
  const hostRect = host.getBoundingClientRect();
  const stageRect = $("stage").getBoundingClientRect();
  tip.textContent = place.name;
  tip.style.left = `${Math.round(hostRect.left - stageRect.left + point.x)}px`;
  tip.style.top = `${Math.round(hostRect.top - stageRect.top + point.y)}px`;
  tip.hidden = false;
}

function hideTip() {
  const tip = $("stage-tip");
  if (tip) tip.hidden = true;
}

/* ---------- Place dots on the NASA frame (plate A) ---------- */

// Every saved place of both records as a dot on the flat frame, like the globe's dots: land a solid
// amber dot, ocean an amber ring with a dark center, the other record's places a little smaller.
// The selected place has no dot: the crosshair marks it. A pointer shortcut only, mirroring the
// place list and the record list (aria-hidden, never focusable). Positions are percentages, so the
// dots follow the plate when it resizes; the hit test measures the plate at each event.

let frameFlight = 0;

/**
 * After a dot on the NASA frame: let the crosshair glide (CSS, about 1 s, eased; a second click
 * retargets it from where it is and restarts the wait), then scroll the stage into view and fly the
 * globe to the place. Reduced motion: no glide, an instant scroll and a cut. Focus never moves.
 */
function frameToGlobe() {
  clearTimeout(frameFlight);
  const ch = $("crosshair");
  const go = () => {
    frameFlight = 0;
    ch?.classList.remove("is-gliding");
    $("stage")?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    focusPlace();
  };
  if (reduceMotion()) { go(); return; }
  ch?.classList.add("is-gliding");
  frameFlight = setTimeout(go, 1000);
}

function renderFrameDots() {
  const box = $("frame-dots");
  if (!box) return;
  const frag = document.createDocumentFragment();
  // The other record's places first, so the current record's dots sit on top where they overlap.
  const order = [...last.places].sort((a, b) => Number(a.active) - Number(b.active));
  for (const p of order) {
    if (p.id === last.placeId) continue;
    const dot = document.createElement("i");
    dot.className = `pdot${p.surface === "ocean" ? " pdot--ocean" : ""}${p.active ? "" : " pdot--off"}`;
    const { xPct, yPct } = crosshairPos(p.lat, p.lon);
    dot.style.left = `${xPct}%`;
    dot.style.top = `${yPct}%`;
    frag.append(dot);
  }
  box.replaceChildren(frag);
}

function wireFrameDots() {
  const plate = $("frame-a")?.querySelector(".plate__img");
  const tip = $("frame-tip");
  if (!plate) return;
  const hit = (e) => {
    const r = plate.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return { id: pickNearest(last.places, x, y, r.width, r.height) };
  };
  const hideFrameTip = () => { if (tip) tip.hidden = true; plate.style.cursor = ""; };
  // A press on a dot must not move the keyboard focus to main#player (see initStage).
  plate.addEventListener("mousedown", (e) => { if (hit(e).id) e.preventDefault(); });
  // The same path as a pick on the globe: select the place (switching record when it belongs to
  // the other one), sound it, and fly the globe there.
  plate.addEventListener("click", (e) => {
    const { id } = hit(e);
    if (!id) return;
    hideFrameTip();
    // The state, the sound and the announcement now; the crosshair glides to the place (about 1 s),
    // then the page scrolls up to the globe, which flies there as it comes into view.
    handlers.onPick(id, { from: "frame" });
    frameToGlobe();
  });
  plate.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const { id } = hit(e);
    const place = id ? last.allPlaces?.find((p) => p.id === id) : null;
    if (!place || !tip) { hideFrameTip(); return; }
    plate.style.cursor = "pointer";
    // The tip sits on the dot itself (not on the pointer), like the stage's tip.
    const { xPct, yPct } = crosshairPos(place.lat, place.lon);
    const r = plate.getBoundingClientRect();
    tip.textContent = place.name;
    tip.style.left = `${Math.round((xPct / 100) * r.width)}px`;
    tip.style.top = `${Math.round((yPct / 100) * r.height)}px`;
    tip.hidden = false;
  });
  plate.addEventListener("pointerleave", hideFrameTip);
}

/* ---------- The rail fitter: the intro and the readout never meet ---------- */

// The steps, in order (see the "rail fitter" block in app.css): the intro gives way first, then the
// readout's optional parts. The value and the Compare's A and B rows always stay.
const FIT_STEPS = 9;
const FIT_GAP = 14; // px kept between the intro and the readout
const deskQuery = window.matchMedia("(min-width: 1100px) and (min-width: 52em)");
let fitQueued = 0;
let fitObserver = null;

/** Fit the rail at the next frame (after the change that called it has been laid out). */
export function fitRail() {
  if (fitQueued) return;
  fitQueued = requestAnimationFrame(runFit);
}

function railOverlaps() {
  const bar = document.querySelector(".bar");
  let introBottom = bar ? bar.getBoundingClientRect().bottom : 0;
  for (const el of document.querySelectorAll(".intro h1, .intro__lede")) {
    const r = el.getBoundingClientRect();
    if (r.height > 2 && r.width > 2) introBottom = Math.max(introBottom, r.bottom);
  }
  let top = Infinity;
  for (const el of $("readout").querySelectorAll(":scope > *, .readout__disc")) {
    if (el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.width > 0) top = Math.min(top, r.top);
  }
  return top !== Infinity && top < introBottom + FIT_GAP;
}

function runFit() {
  fitQueued = 0;
  const main = document.querySelector("main");
  if (!main) return;
  if (!fitObserver && typeof ResizeObserver === "function") {
    // A new window size, the console shown or hidden, a text size change: fit again.
    fitObserver = new ResizeObserver(() => fitRail());
    fitObserver.observe($("stage"));
    fitObserver.observe(document.querySelector(".intro"));
    document.fonts?.ready?.then(() => fitRail());
  }
  for (let i = 1; i <= FIT_STEPS; i++) main.classList.remove(`fit-${i}`);
  if (!deskQuery.matches) return; // below 1100 px the readout follows the picture in the page flow
  for (let i = 1; i <= FIT_STEPS && railOverlaps(); i++) main.classList.add(`fit-${i}`);
}

/* ---------- Text about the stage ---------- */

let descCtx = null;

/** One sentence describing the visible picture, for #stage-desc. */
function renderStageDesc() {
  if (!descCtx) return;
  const { meta, place, date, lang } = descCtx;
  let key = "stageDescGlobe";
  if (failed.globe) key = flatOn ? "stageDescFlat" : "stageDescNone";
  // The picture's description left the page (the tour design's audit: it helped nobody who cannot
  // see the picture); kept only if an element for it exists.
  const el = $("stage-desc");
  if (el) el.textContent = t(key, { place: place.name, title: meta.title, date: dateText(date, lang) }, lang);
}

/** Record, place and date over the stage; the synthetic badge; the stage description. */
export function renderHead(meta, place, date, lang) {
  $("ro-record").textContent = meta.title;
  $("ro-place").textContent = place.name;
  $("ro-date").textContent = dateText(date, lang);
  $("synthetic").hidden = !meta.synthetic;
  const changed = !descCtx || descCtx.meta !== meta || descCtx.place !== place || descCtx.lang !== lang;
  descCtx = { meta, place, date, lang };
  renderStageDesc();
  if (changed) fitRail(); // not on Play steps: only the date changes there, on one line
}

/** The value under the needle, set in type, and its marker on the scale bar. */
/* The record's published colour strip as an array of [r, g, b] (scale.min to scale.max), read once. */
const strips = new Map(); // URL -> array, or a Promise while it loads, or null when it failed
let lastReading = null; // { meta, sample }: repainted when the strip arrives

function stripFor(meta) {
  if (!meta.colorbar_strip) return null;
  const url = meta.__base + meta.colorbar_strip;
  const have = strips.get(url);
  if (Array.isArray(have) || have === null) return have;
  if (!have) {
    const im = new Image();
    im.decoding = "async";
    im.src = url;
    const p = im.decode().then(() => {
      const c = document.createElement("canvas");
      c.width = im.naturalWidth;
      c.height = 1;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(im, 0, Math.floor(im.naturalHeight / 2), im.naturalWidth, 1, 0, 0, im.naturalWidth, 1);
      const d = ctx.getImageData(0, 0, c.width, 1).data;
      const out = [];
      for (let i = 0; i < c.width; i++) out.push([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
      strips.set(url, out);
      if (lastReading?.meta === meta) paintReading(meta, lastReading.sample);
      for (const fn of stripListeners) fn(meta);
    }, () => strips.set(url, null));
    strips.set(url, p);
  }
  return null;
}

const stripListeners = new Set();

/** Call fn(meta) when a record's colour strip has arrived (colours drawn before it were plain ink). */
export function onStripReady(fn) {
  stripListeners.add(fn);
}

/** The CSS colour of a value as the reading draws it ("" for plain ink): the place list, the score. */
export function readingCss(meta, sample) {
  return cssColor(readingColor(meta, sample, stripFor(meta)));
}

/**
 * The reading (sign and digits, not the unit) and the scale's needle take the record's colour at
 * the value; ice white near normal and with no data. The colour fades between dates in CSS.
 */
function paintReading(meta, sample) {
  lastReading = { meta, sample };
  const color = cssColor(readingColor(meta, sample, stripFor(meta)));
  const ro = $("readout");
  if (color) ro.style.setProperty("--reading", color);
  else ro.style.removeProperty("--reading");
}

export function renderValue(meta, sample, lang) {
  paintReading(meta, sample);
  const pv = physicalValue(meta, sample);
  const parts = readoutParts(meta, pv, lang);
  const ro = $("readout");
  if (ro.classList.contains("is-nodata") !== parts.nodata) { ro.classList.toggle("is-nodata", parts.nodata); fitRail(); }
  $("ro-prefix").textContent = parts.prefix;
  $("ro-num").textContent = parts.number;
  $("ro-unit").textContent = parts.unit;
  $("ro-note").textContent = parts.note;
  if (!parts.nodata) $("scale-marker").style.setProperty("--p", scalePlace(meta, sample.v01).toFixed(4));
}

/** The ends of the record's scale, and the bar style (diverging or sequential). */
export function renderScale(meta, lang) {
  const ends = scaleEnds(meta, lang);
  $("scale-min").textContent = ends.min;
  $("scale-max").textContent = ends.max;
  const track = $("scale-track");
  track.classList.toggle("is-sequential", meta.scale.kind !== "diverging");
  // The fire scale is laid out with square-root spacing: marks at their true places (0, 2, 8, 18,
  // 32, 50%, at a fifth, two fifths... of the bar), the ends labelled as before, and a legend.
  for (const el of track.querySelectorAll(".scale__tick")) el.remove();
  const fire = usesFireRamp(meta);
  $("scale").classList.toggle("has-ticks", fire);
  const legend = $("scale-legend");
  if (legend) { legend.textContent = fire ? t("scaleLegendFire", {}, lang) : ""; legend.hidden = !fire; }
  const score = document.querySelector(".fader__legend");
  if (score) { score.dataset.i18n = fire ? "scoreLegendFire" : "scoreLegend"; score.textContent = t(score.dataset.i18n, {}, lang); }
  if (!fire) return;
  for (const pos of [0.2, 0.4, 0.6, 0.8]) {
    const v = valueAtPlace(meta, pos);
    const tick = document.createElement("span");
    tick.className = "scale__tick";
    tick.style.left = `${pos * 100}%`;
    tick.textContent = lang === "pt-BR" ? String(+v.toFixed(1)).replace(".", ",") : String(+v.toFixed(1));
    track.append(tick);
  }
}

/* ---------- The NASA frame plates ---------- */

// Frame images: each one is decoded off screen before it is shown, so a plate never flashes empty.
const decoded = new Set(); // URLs decoded in this page
const broken = new Set(); // URLs that failed (an optional 2048 px image may be missing)
const loading = new Map(); // URL -> Promise<boolean>

/** Load and decode an image off screen. Resolves true when it is ready to show without a wait. */
function preload(url, { low = false } = {}) {
  if (decoded.has(url)) return Promise.resolve(true);
  if (broken.has(url)) return Promise.resolve(false);
  if (loading.has(url)) return loading.get(url);
  const im = new Image();
  im.decoding = "async";
  if (low) im.fetchPriority = "low";
  im.src = url;
  const p = im.decode()
    .then(() => { decoded.add(url); return true; }, () => { broken.add(url); return false; })
    .finally(() => loading.delete(url));
  loading.set(url, p);
  return p;
}

/** Show src in img once it is decoded. The old image stays until then; only the first one fades in. */
function showImg(img, src) {
  if (img.dataset.want === src) return;
  img.dataset.want = src;
  if (!img.getAttribute("src")) img.classList.remove("is-loaded");
  preload(src).then((ok) => {
    if (!ok || img.dataset.want !== src) return;
    img.onload = () => img.classList.add("is-loaded");
    img.src = src;
    if (img.complete) img.classList.add("is-loaded");
  });
}

/**
 * One plate: the frame as published, with the crosshair on the place. The plate shows the best
 * image already decoded and climbs to better ones as they arrive, if it still shows that date:
 * 1024 px, then 2048 px (also during Play through time), then 4096 px only when the date is still
 * (still: true) and the plate is drawn wider than 2048 device pixels.
 */
export function renderFrame(meta, date, place, lang, which = "a", { still = true } = {}) {
  const img = $(which === "a" ? "frame-img" : "frame-img-b");
  img.alt = ""; // a picture description (the audit): the value is in the readout sentence
  let coarse = false;
  let saveData = false;
  try {
    coarse = coarseQuery.matches;
    saveData = !!navigator.connection?.saveData;
  } catch { /* unknown device */ }
  // A phone or a narrow plate stays on the 1024 px frame (see plateSizes).
  const sizes = plateSizes({ cssWidth: widthOf(img), dpr: window.devicePixelRatio || 1, coarse, saveData, still, hasUhd: !!meta.display_uhd });
  const urls = [...new Set(sizes.map((size) => displayUrl(meta, date, size)))];
  const ready = urls.filter((u) => decoded.has(u));
  let shown = ready.length ? ready[ready.length - 1] : urls[0];
  showImg(img, shown);
  const better = urls.slice(urls.indexOf(shown) + 1).filter((u) => !broken.has(u));
  (async () => {
    for (const u of better) {
      const ok = await preload(u);
      if (img.dataset.want !== shown) return; // the plate moved on to another date or image
      if (ok) { showImg(img, u); shown = u; }
    }
  })();
  const { xPct, yPct } = crosshairPos(place.lat, place.lon);
  const ch = $(which === "a" ? "crosshair" : "crosshair-b");
  ch.style.left = `${xPct}%`;
  ch.style.top = `${yPct}%`;
  $(which === "a" ? "frame-a-date" : "frame-b-date").textContent = dateText(date, lang);
}

/**
 * The frame's source: "NASA SVS 5176" set small on the picture (decorative, aria-hidden) and, under
 * the plates, as a link in the reading order, with what the dots are (on the fire record: what a
 * yellow speck of the frame is, never MW or FRP).
 */
function renderCredit(meta, lang) {
  const id = meta.svs_id;
  const label = id ? t("svsCredit", { id }, lang) : "";
  const stage = $("stage-credit");
  if (stage) { stage.textContent = label; stage.hidden = !label; }
  const p = $("frame-credit");
  if (!p) return;
  p.replaceChildren();
  if (label) {
    const src = meta.svs_url ? link(meta.svs_url, label) : document.createTextNode(label);
    p.append(`${t("creditLead", {}, lang)} `, src, ". ");
  }
  if (meta.surface === "land" && !meta.colorbar) p.append(`${t("fireDotNote", {}, lang)} `);
  // What the dots mean is for the eye only (aria-hidden): the source link stays in the tree.
  const dots = Object.assign(document.createElement("span"), { textContent: t("placesDotNote", {}, lang) });
  dots.setAttribute("aria-hidden", "true");
  p.append(dots);
}

/**
 * The fire scale's colour strip: square-root spacing along the bar (position p shows the value at
 * p squared), each colour the fire ramp's colour of that value over the control line's grey.
 */
function fireStrip() {
  const base = [93, 109, 147]; // --line
  const stops = [];
  for (let i = 0; i <= 24; i++) {
    const p = i / 24;
    const { rgb, strength } = fireRamp(p * p);
    const c = base.map((x, j) => Math.round(x + (rgb[j] * 255 - x) * strength));
    stops.push(`rgb(${c[0]} ${c[1]} ${c[2]}) ${(p * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** The record's published colorbar under the plates (when it has one), with alt text and a caption. */
export function renderColorbar(meta, lang) {
  renderCredit(meta, lang);
  const fig = $("colorbar");
  const track = $("scale-track");
  // An absolute URL: a url() inside a custom property resolves against the stylesheet that uses it.
  if (meta.colorbar_strip) track.style.setProperty("--scale-image", `url("${new URL(meta.__base + meta.colorbar_strip, document.baseURI).href}")`);
  else if (usesFireRamp(meta)) track.style.setProperty("--scale-image", fireStrip());
  else track.style.removeProperty("--scale-image");
  if (!fig) return;
  if (!meta.colorbar) { fig.hidden = true; return; }
  const img = $("colorbar-img");
  const ends = scaleEnds(meta, lang);
  img.alt = t("colorbarAlt", { min: ends.min, max: ends.max }, lang);
  $("colorbar-cap").textContent = t(meta.svs_id ? "colorbarCap" : "colorbarCapNoId", { id: meta.svs_id ?? "" }, lang);
  const src = meta.__base + meta.colorbar;
  // Shown first (a lazy image inside a hidden figure would never load); a missing colorbar
  // image hides the figure again instead of showing a broken image.
  img.onerror = () => { if (img.getAttribute("src") === src) fig.hidden = true; };
  if (img.getAttribute("src") !== src) { fig.hidden = false; img.src = src; }
  else fig.hidden = img.complete && img.naturalWidth === 0;
}

/** The pictures re-measure their host (the console was hidden or shown). */
export function resizeViews() {
  each("resize");
}

/* ---------- Warming the 2048 px frames ---------- */

let warmToken = 0;

/** Small, low-memory or data-saving devices skip the warm-up (about 10 MB for the sea record). */
function canWarm() {
  try {
    if (navigator.connection?.saveData) return false;
    if (coarseQuery.matches) return false;
    if (navigator.deviceMemory && navigator.deviceMemory <= 4) return false;
  } catch { /* unknown device: warm */ }
  return true;
}

/**
 * Decode the record's 2048 px frames in the background, one at a time and at low priority, from
 * the date at fromIndex forward (then the earlier ones). Call it only after a user gesture.
 * A new call (another record) stops the previous warm-up.
 */
export function warmHd(meta, fromIndex = 0) {
  const token = ++warmToken;
  if (!meta?.display_hd || !canWarm()) return;
  const dates = [...meta.dates.slice(fromIndex), ...meta.dates.slice(0, fromIndex)];
  const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 1000 }) : setTimeout(r, 50)));
  (async () => {
    for (const d of dates) {
      if (token !== warmToken) return;
      await idle();
      if (token !== warmToken) return;
      await preload(displayUrl(meta, d, true), { low: true });
    }
  })();
}

/** Compare: two plates side by side and a beating wave between them. */
export function renderCompare(on, meta, dateB, place, lang, sampleA, sampleB, note = "", dateA = null) {
  $("frames-grid").classList.toggle("is-compare", on);
  $("frame-b").hidden = !on;
  $("beat").hidden = !on;
  $("beat-cap").hidden = !on;
  $("compare-caption").hidden = !on;
  // The record's own note for this pair (e.g. the NOAA CPC citation), shown only for that exact pair.
  $("compare-note").textContent = on ? note : "";
  $("compare-note").hidden = !(on && note);
  document.body.classList.toggle("is-comparing", on);
  $("ro-compare").hidden = !on;
  fitRail();
  if (!on) return;
  renderFrame(meta, dateB, place, lang, "b");
  const d = sampleA?.v01 != null && sampleB?.v01 != null ? Math.abs(sampleB.v01 - sampleA.v01) : 0;
  const beats = 2 + Math.round(Math.min(1, d * 5) * 10); // more beating when the dates differ more
  $("beat-path").setAttribute("d", beatPath(beats, 0.85));
  // The same on the stage: both dates and values (in the readout's short form, "≥+4.0 °C"), and a
  // calmer drawing of the beat for the narrow rail, so a sighted person sees what the sound says
  // (the readout is aria-hidden: the announcement carries the same facts).
  const val = (s) => compactValue(meta, physicalValue(meta, s), lang);
  $("ro-a-date").textContent = dateA ? dateText(dateA, lang) : "";
  $("ro-a-val").textContent = val(sampleA);
  $("ro-a-val").style.color = cssColor(readingColor(meta, sampleA, stripFor(meta)));
  $("ro-b-date").textContent = dateText(dateB, lang);
  $("ro-b-val").textContent = val(sampleB);
  $("ro-b-val").style.color = cssColor(readingColor(meta, sampleB, stripFor(meta)));
  $("ro-beat-path").setAttribute("d", beatPath(beats, 0.3));
}

/** The beat between two tones as an SVG path (400 x 40): a wave of this frequency, beats envelopes. */
function beatPath(beats, freq) {
  let path = "";
  for (let x = 0; x <= 400; x += 1) {
    const env = Math.abs(Math.cos((x / 200) * Math.PI * beats * 0.5));
    const y = 20 + Math.sin(x * freq) * 15 * env;
    path += `${x === 0 ? "M" : "L"}${x},${y.toFixed(2)}`;
  }
  return path;
}

/* ---------- Data and method (dialog#about) ---------- */

function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.rel = "noopener";
  return a;
}

/** Every fact the record's meta.json publishes, in reading order. Rows with no data are skipped. */
export function renderLiner(meta, lang, places = []) {
  $("liner-record").textContent = meta.title;
  const v = meta.validation;
  const rows = [
    ["dataset", meta.dataset],
    ["source", meta.svs_url ? link(meta.svs_url, `NASA SVS ${meta.svs_id ?? ""}`.trim()) : meta.svs_id ? `NASA SVS ${meta.svs_id}` : ""],
    ["quantity", meta.quantity],
    ["unit", meta.unit],
    ["scale", scaleText(meta, lang)],
    ["dates", datesText(meta, lang)],
    ["thisDate", ""], // filled per date by renderThisDate
    ["status", t(meta.synthetic ? "statusSynthetic" : "statusReal", {}, lang)],
    ["validation", validationText(meta, lang)],
    ["validationData", v?.file ? link(siblingUrl(meta, v.file), t("validationFile", { file: v.file }, lang)) : ""],
    ...methodRows(meta),
    ["compareNotes", compareText(meta, places, lang)],
    ["picture", t("skyScale", {}, lang)], // the Sun and the Moon are drawn larger than true
    ["built", provenanceText(meta, lang)],
  ];
  const dl = $("liner-list");
  dl.replaceChildren();
  for (const [key, value] of rows) {
    if (!value && key !== "thisDate") continue;
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = t(key, {}, lang);
    const dd = document.createElement("dd");
    if (value instanceof Node) dd.append(value);
    else dd.textContent = value ?? "";
    if (key === "thisDate") {
      div.id = "liner-thisdate";
      div.hidden = true;
    }
    div.append(dt, dd);
    dl.append(div);
  }
}

/** The per-date row of the notes (cells at the ends of the scale, cells with fire). */
export function renderThisDate(meta, date, lang) {
  const row = $("liner-thisdate");
  if (!row) return;
  const text = perDateText(meta, date, lang);
  row.hidden = !text;
  row.querySelector("dd").textContent = text;
}

/** Fill a range input's track up to its value (WebKit has no native progress fill). */
export function paintRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const pct = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
  input.style.setProperty("--fill", `${pct}%`);
}

/** URLs of the frame images for a date, as the stage views expect them. */
export function frameInfo(meta, index) {
  const date = meta.dates[index];
  return {
    date,
    index,
    count: meta.dates.length,
    display: displayUrl(meta, date, false),
    displayHd: meta.display_hd ? displayUrl(meta, date, "hd") : null,
    displayUhd: meta.display_uhd ? displayUrl(meta, date, "uhd") : null, // never warmed here (about 1.3 MB per date)
    disc: discUrl(meta, date),
    discThumb: meta.disc_thumb ? discUrl(meta, date, { thumb: true }) : null, // 256 px, for small pictures
  };
}
