// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Display formatting of a decoded value, including saturation at the ends of the scale.

import { t } from "./i18n.js";
import { fireRamp } from "./ramp.js";

/**
 * A record drawn with the fire colour scale (ui/ramp.js): a sequential record with no published
 * colour strip (the fire record). For the eye only: its sound and its number are untouched.
 */
export function usesFireRamp(meta) {
  return meta?.scale?.kind !== "diverging" && !meta?.colorbar_strip;
}

/**
 * Where a value sits along the drawn scale (0 to 1): its linear fraction, or its square root on the
 * fire scale, so the common low values have room. Drawing only (the marker, the ticks, the bars).
 */
export function scalePlace(meta, v01) {
  const v = Math.min(1, Math.max(0, Number(v01) || 0));
  return usesFireRamp(meta) ? Math.sqrt(v) : v;
}

/** The value at a place along the drawn scale (the inverse of scalePlace). */
export function valueAtPlace(meta, pos) {
  const { min, max } = meta.scale;
  return min + (usesFireRamp(meta) ? pos * pos : pos) * (max - min);
}

const local = (s, lang) => (lang === "pt-BR" ? s.replace(".", ",") : s);

/**
 * A number with its sign, at this many decimals. A value that rounds to zero carries no sign
 * ("0.0", never "+0.0" or "−0.0"): the readout, the place rows, Compare and the spoken sentence agree.
 */
export function signed(n, digits, lang) {
  const s = Math.abs(n).toFixed(digits);
  const local = lang === "pt-BR" ? s.replace(".", ",") : s;
  if (Number(s) === 0) return local;
  if (n > 0) return `+${local}`;
  if (n < 0) return `−${local}`;
  return local;
}

/** "+1.2 °C", "≥ +4.0 °C (top of scale)", or "11.4% of land pixels with fire dots". */
export function formatValue(meta, pv, lang = "en") {
  const { min, max, kind } = meta.scale;
  const digits = max - min > 2 ? 1 : 2;
  // "%" units sit on the number ("11.4% of land pixels with fire dots"); other units get a space ("+1.2 °C").
  const unit = meta.unit ? (meta.unit.startsWith("%") ? meta.unit : ` ${meta.unit}`) : "";
  // A sign only on a diverging scale: "≥ +4.0 °C" above normal, but "≥ 50.0%" of a density.
  const end = (n) => (kind === "diverging" ? signed(n, digits, lang) : local(n.toFixed(digits), lang));
  if (pv.saturated === "max") return `≥ ${end(max)}${unit} (${t("topOfScale", {}, lang)})`;
  if (pv.saturated === "min") return `≤ ${end(min)}${unit} (${t("bottomOfScale", {}, lang)})`;
  // Never a minus on a sequential value that rounds to zero either ("-0.0" from a tiny negative).
  const n = kind === "diverging" ? signed(pv.value, digits, lang) : Math.abs(pv.value) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : pv.value.toFixed(digits);
  return `${lang === "pt-BR" ? n.replace(".", ",") : n}${unit}`;
}

/**
 * Half-width of the "near normal" band of a diverging scale: a sixteenth of its span, 0.25 °C on
 * the -4 to +4 °C anomaly record (the decoded value is about that close to the published one).
 */
export function nearBand(meta) {
  const { min, max } = meta.scale;
  return (max - min) / 32;
}

/**
 * "near normal" for a diverging (anomaly) value within nearBand of zero, else "". The number is
 * still shown and said: these words only keep a small signed value from sounding precise.
 */
export function normalWord(meta, pv, lang = "en") {
  if (!pv || pv.saturated || meta.scale.kind !== "diverging") return "";
  return Math.abs(pv.value) <= nearBand(meta) + 1e-9 ? t("nearNormal", {}, lang) : "";
}

/** Unit set next to the big number: "°C" stays, "% of land pixels with fire dots" becomes "%". */
export function shortUnit(meta) {
  const u = meta.unit || "";
  return u.startsWith("%") ? "%" : u;
}

/** The words of a long unit, for the note line: "% of land pixels with fire dots" gives "of land pixels with fire dots"; "°C" gives "". */
export function unitWords(meta) {
  const u = meta.unit || "";
  return u.startsWith("%") ? u.slice(1).trim() : "";
}


/**
 * The big readout over the stage, split so each part can be styled apart:
 * prefix (the sign, or "≥+" at the top of the scale), number, unit and a note line
 * (unit words, "top of scale", or the no-data hint). pv null means no data.
 */
export function readoutParts(meta, pv, lang = "en") {
  if (!pv) return { prefix: "", number: t("noData", {}, lang), unit: "", note: t("noDataHint", {}, lang), nodata: true };
  const { min, max, kind } = meta.scale;
  const digits = max - min > 2 ? 1 : 2;
  const words = unitWords(meta);
  const signOf = (n) => (n > 0 ? "+" : n < 0 ? "−" : "");
  if (pv.saturated) {
    const end = pv.saturated === "max" ? max : min;
    const ends = t(pv.saturated === "max" ? "topOfScale" : "bottomOfScale", {}, lang);
    return {
      prefix: `${pv.saturated === "max" ? "≥" : "≤"}${kind === "diverging" ? signOf(end) : ""}`,
      number: local(Math.abs(end).toFixed(digits), lang),
      unit: shortUnit(meta),
      note: words ? `${words}, ${ends}` : ends,
      nodata: false,
    };
  }
  // Within half a display step of zero the sign is dropped, so "+0.0" never shows.
  const shown = Number(Math.abs(pv.value).toFixed(digits));
  const near = normalWord(meta, pv, lang);
  return {
    prefix: kind === "diverging" && shown !== 0 ? signOf(pv.value) : "",
    number: local(Math.abs(pv.value).toFixed(digits), lang),
    unit: shortUnit(meta),
    note: [words, near].filter(Boolean).join(", "),
    nodata: false,
  };
}

/**
 * The value in one short run of text, for narrow places (the place list, the Compare pair, the
 * readout's Compare rows): "+1.2 °C", "≥+4.0 °C", "11.4%", or the no-data words. pv null is no data.
 */
export function compactValue(meta, pv, lang = "en") {
  const parts = readoutParts(meta, pv, lang);
  if (parts.nodata) return parts.number;
  if (!parts.unit) return `${parts.prefix}${parts.number}`;
  return `${parts.prefix}${parts.number}${parts.unit === "%" ? "%" : ` ${parts.unit}`}`;
}

/**
 * One bar of the score (the date control's picture of the series) for a sample: k, its length from
 * 0 to 1, and dir, "up" or "down" from the baseline. A diverging scale grows both ways from its
 * middle (zero), so -4 °C and +4 °C are full bars down and up; a sequential scale grows up from its
 * minimum. A value on the baseline keeps a small nub (minK) so it never looks like no data, which
 * is { nodata: true } and is drawn apart.
 */
export function scoreBar(meta, sample, minK = 0.06) {
  if (!sample || sample.nodata || sample.v01 == null) return { k: 0, dir: "up", nodata: true };
  const v = scalePlace(meta, sample.v01); // the square root on the fire scale (drawing only)
  if (meta.scale.kind === "diverging") {
    const d = (v - 0.5) * 2;
    return { k: Math.max(minK, Math.abs(d)), dir: d < 0 ? "down" : "up", nodata: false };
  }
  return { k: Math.max(minK, v), dir: "up", nodata: false };
}

/** The two ends of a record's scale with its unit, for the scale bar: "−4 °C" and "+4 °C", "0%" and "50%". */
export function scaleEnds(meta, lang = "en") {
  const { min, max, kind } = meta.scale;
  const unit = shortUnit(meta);
  const end = (n) => {
    const sign = kind === "diverging" && n !== 0 ? (n > 0 ? "+" : "−") : "";
    const s = `${sign}${local(String(Math.abs(n)), lang)}`;
    if (!unit) return s;
    return unit === "%" ? `${s}%` : `${s} ${unit}`;
  };
  return { min: end(min), max: end(max) };
}

/* ---------- The reading's colour: the record's scale colour at the value ---------- */

const ICE = [232, 240, 255]; // --ink
// The darkest ground the reading can sit on: black under the 0.9 stage shade over white clouds.
export const READING_GROUND = [26, 26, 26];

/** WCAG relative luminance of an sRGB colour [r, g, b] (0..255). */
export function luminance([r, g, b]) {
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a, b, k) => a.map((x, i) => Math.round(x + (b[i] - x) * k));

const toHsl = ([r, g, b]) => {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
};
const toRgb = ([h, s, l]) => {
  if (!s) return [l, l, l].map((x) => Math.round(x * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255));
};

/**
 * The colour made just light enough to reach min:1 against the ground, keeping its hue and
 * saturation (its HSL lightness is raised), so a dark red stays a red and a navy stays a blue.
 */
export function liftTo(rgb, ground = READING_GROUND, min = 4.5) {
  if (contrast(rgb, ground) >= min) return rgb;
  const [h, s, l] = toHsl(rgb);
  for (let L = l; L <= 1.0001; L += 0.02) {
    const c = toRgb([h, s, Math.min(1, L)]);
    if (contrast(c, ground) >= min) return c;
  }
  return ICE;
}

/**
 * The colour of the reading for a value, or null for plain ice white (no data, near normal, or a
 * record whose colours are unknown). An anomaly record takes its published colour strip at the
 * value (strip: [[r, g, b], ...] from scale.min to scale.max); a record without a published legend
 * (fire) goes from ice white at zero to amber at the top of its scale. Always at least 4.5:1
 * against READING_GROUND: the dark ends of a scale are lightened, never left to fail.
 */
export function readingColor(meta, sample, strip = null) {
  if (!sample || sample.nodata || sample.v01 == null) return null;
  const lin = Math.min(1, Math.max(0, sample.v01));
  const v = lin;
  if (meta.scale.kind === "diverging") {
    const value = meta.scale.min + lin * (meta.scale.max - meta.scale.min);
    if (Math.abs(value) <= nearBand(meta) + 1e-9 || !strip?.length) return null;
    return liftTo(strip[Math.round(v * (strip.length - 1))]);
  }
  if (meta.colorbar_strip) return strip?.length ? liftTo(strip[Math.round(v * (strip.length - 1))]) : null;
  // The fire scale (ui/ramp.js): its mild silver when calm (zero included, as in the grooves), its
  // colour as the strength rises, lifted to 4.5:1 like the sea's (the deep reds lighten, stay red).
  const { rgb, strength } = fireRamp(lin);
  return liftTo(mix(ICE, rgb.map((x) => Math.round(x * 255)), strength));
}

/** "rgb(r g b)" for CSS, or "" for none. */
export const cssColor = (rgb) => (rgb ? `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})` : "");
