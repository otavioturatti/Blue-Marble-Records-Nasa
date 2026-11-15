// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
// Vibration feedback without a native app: the Vibration API (navigator.vibrate), which phones
// running Chrome, Samsung Internet or another Chromium browser on Android have. Safari on iPhone
// and current Firefox have no Vibration API: there every call here does nothing, silently.
//
// The API gives only durations (vibrate, pause, vibrate...), no strength and no pitch, so the
// mapping is built from two things a hand can tell apart at once: how many pulses, and whether the
// pulses are counted taps or a rough grain.
//
//   needle()      one short tick: the needle lands.
//   value(v01)    1 to 5 counted pulses: which fifth of the record's colour scale the value is in.
//                 1 = bottom fifth, 3 = the middle fifth (on the temperature anomaly record that
//                 is near normal, around 0 °C), 5 = top fifth. It is the position on the colour
//                 scale only, the same number the sound uses for its pitch, and it
//                 is coarser than the sound on purpose: the sound and the words carry the detail.
//                 A value at the end of a saturating scale (≥ +4 °C) gives the same 5 pulses as
//                 any value in the top fifth: a vibration never claims "more than the scale".
//   nodata()      the dead groove: a fast rough grain of very short ticks, about half a second.
//                 It is clearly not a low value (a low value is one clean pulse) and it is never
//                 nothing, so a missing value can not be mistaken for a quiet one.
//   compare(a, b) date A's pulses, a long pause, date B's pulses: the same count means the two
//                 dates sit in the same fifth of the scale.
//   legend()      1 pulse, 3 pulses, 5 pulses: low, middle, high, after the 3-note sound legend.
//   stop()        cancels any vibration at once (Stop, Esc).
//
// Learnable in a minute: "count the pulses, one is low, five is high, a rough buzz is no data".
// Durations: pulses of 60 ms with 110 ms gaps (short pulses under about 30 ms are not felt on many
// phone motors), so 5 pulses last 740 ms and fit inside one Play step (about 1430 ms per date).
//
// Browsers only vibrate after the person has tapped the page once (Chrome: sticky activation,
// since Chrome 60) and only while the page is visible. No dependencies; safe to import in Node.

const STORE_KEY = "bmr-haptics";
const DEFAULT_ON = true; // on wherever the phone can vibrate; the checkbox turns it off and is remembered

export const BANDS = 5;
export const PULSE_MS = 60;
export const GAP_MS = 110;
export const NEEDLE_MS = 30;
export const COMPARE_GAP_MS = 500;
export const LEGEND_GAP_MS = 600;
const GRAIN_ON = 14;
const GRAIN_OFF = 36;
const GRAIN_COUNT = 10;

/* ---------- Pure helpers ---------- */

/** Fifth of the colour scale a position 0..1 falls in: 1..BANDS, or null for no value. */
export function band(v01) {
  if (v01 == null || typeof v01 !== "number" || !Number.isFinite(v01)) return null;
  const v = Math.min(1, Math.max(0, v01));
  return Math.min(BANDS, Math.floor(v * BANDS) + 1);
}

/** The dead groove: a rough grain of very short ticks, never an empty pattern. */
export function nodataPattern() {
  const out = [];
  for (let i = 0; i < GRAIN_COUNT; i++) {
    if (i) out.push(GRAIN_OFF);
    out.push(GRAIN_ON);
  }
  return out;
}

/** Pattern for one value: band(v01) pulses; the dead groove when there is no value. */
export function valuePattern(v01) {
  const n = band(v01);
  if (n == null) return nodataPattern();
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i) out.push(GAP_MS);
    out.push(PULSE_MS);
  }
  return out;
}

/** The needle lands: one short tick. */
export function needlePattern() {
  return [NEEDLE_MS];
}

/** Compare: date A's pattern, a long pause, date B's pattern (each may be the dead groove). */
export function comparePattern(a01, b01) {
  return [...valuePattern(a01), COMPARE_GAP_MS, ...valuePattern(b01)];
}

/** The vibration legend, like the 3-note sound legend: low (1 pulse), middle (3), high (5). */
export function legendPattern() {
  return [...valuePattern(0), LEGEND_GAP_MS, ...valuePattern(0.5), LEGEND_GAP_MS, ...valuePattern(1)];
}

/** Total length of a pattern in ms (vibrations and pauses). */
export function patternMs(pattern) {
  return pattern.reduce((s, x) => s + x, 0);
}

/* ---------- The device ---------- */

/**
 * True where a vibration can be felt: the Vibration API exists and the device has a touch screen.
 * (Desktop Chrome has the API but no motor, so a mouse-only device counts as unsupported.)
 */
export function supported() {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    return coarse || (navigator.maxTouchPoints || 0) > 0;
  } catch {
    return false;
  }
}

let on = DEFAULT_ON;
try {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
  if (saved === "on") on = true;
  else if (saved === "off") on = false;
} catch { /* storage blocked: keep the default */ }

/** True when vibration is supported and switched on. */
export function enabled() {
  return on && supported();
}

/** Switch vibration on or off (remembered on this device). Switching off stops a vibration at once. */
export function setEnabled(value) {
  on = !!value;
  try { localStorage.setItem(STORE_KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
  if (!on) cancel();
}

function cancel() {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    // Nothing can be vibrating before the first tap, and Chrome logs an error for the call.
    if (navigator.userActivation && navigator.userActivation.hasBeenActive === false) return;
    navigator.vibrate(0);
  } catch { /* not supported */ }
}

function run(pattern) {
  if (!enabled()) return false;
  try {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
    // Before the first tap Chrome refuses and logs an error: skip the call instead.
    if (navigator.userActivation && navigator.userActivation.hasBeenActive === false) return false;
    return navigator.vibrate(pattern) === true;
  } catch {
    return false;
  }
}

/** The needle lands. */
export function needle() { return run(needlePattern()); }

/** One value, v01 = position on the record's colour scale (0..1); null plays the dead groove. */
export function value(v01) { return run(valuePattern(v01)); }

/** No data under the needle: the dead groove. */
export function nodata() { return run(nodataPattern()); }

/** Compare two dates at the same place (positions 0..1, null for no data). */
export function compare(a01, b01) { return run(comparePattern(a01, b01)); }

/** The vibration legend (low, middle, high), played after the sound legend. */
export function legend() { return run(legendPattern()); }

/** Stop any vibration now (Stop button, Esc, a dialog opening). Works even when switched off. */
export function stop() { cancel(); }

/** A sample as the engine gets it ({ v01, nodata }): the value, or the dead groove. */
export function sample(s) {
  return !s || s.nodata || s.v01 == null ? nodata() : value(s.v01);
}
