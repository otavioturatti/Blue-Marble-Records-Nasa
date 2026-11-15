// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Liner-note texts built from a record's meta.json (dataset, scale, dates, validation, method, provenance).
// Pure functions: every number comes from meta; nothing is computed that the pipeline did not publish.

import { saturationEnds } from "../data.js";
import { dateText } from "./valuetext.js";
import { t } from "./i18n.js";

const num = (n, digits, lang) => {
  const s = String(Number(Number(n).toFixed(digits))); // fixed digits, trailing zeros dropped
  return lang === "pt-BR" ? s.replace(".", ",") : s;
};

/** 0.983 -> "98.3%", 0.88 -> "88%". Accepts fractions (0..1) or percents (> 1). */
export function pct(x, lang = "en") {
  const v = Number(x) <= 1 ? Number(x) * 100 : Number(x);
  return `${num(v, 1, lang)}%`;
}

const signedNum = (n, digits, lang) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${num(Math.abs(n), digits, lang)}`;

/** Value with its unit: "−4 °C", "50% of land pixels with fire dots". */
export function withUnit(n, unit, lang = "en", signed = false) {
  const s = signed ? signedNum(n, 2, lang) : num(n, 2, lang);
  if (!unit) return s;
  return unit.startsWith("%") ? `${s}${unit}` : `${s} ${unit}`;
}

/** Color scale and which ends saturate, e.g. "−4 to +4 °C; at or beyond either end reads as the end of the scale". */
export function scaleText(meta, lang = "en") {
  const { min, max, kind } = meta.scale;
  const diverging = kind === "diverging";
  const unit = meta.unit || "";
  const range = `${withUnit(min, unit.startsWith("%") ? "%" : "", lang, diverging)} ${t("to", {}, lang)} ${withUnit(max, unit, lang, diverging)}`;
  const ends = saturationEnds(meta.scale);
  if (ends.max && ends.min) return `${range}. ${t("saturatesBoth", {}, lang)}`;
  if (ends.max) return `${range}. ${t("saturatesTop", { max: withUnit(max, unit, lang, diverging) }, lang)}`;
  return range;
}

/** "monthly" (same day each month), "daily", or "" when the spacing is irregular. */
export function dateCadence(dates) {
  if (!dates || dates.length < 2) return "";
  const ms = (d) => Date.parse(`${d}T00:00:00Z`);
  const days = dates.slice(1).map((d, i) => Math.round((ms(d) - ms(dates[i])) / 86400000));
  if (days.every((n) => n === 1)) return "daily";
  const sameDay = dates.every((d) => d.slice(8, 10) === dates[0].slice(8, 10));
  const monthIdx = (d) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  const consecutive = dates.slice(1).every((d, i) => monthIdx(d) - monthIdx(dates[i]) === 1);
  if (sameDay && consecutive) return "monthly";
  return "";
}

/** "30 monthly snapshots (the 10th of each month), 10 June 2024 to 10 November 2026." */
export function datesText(meta, lang = "en") {
  const d = meta.dates;
  if (!d.length) return "";
  const cadence = dateCadence(d);
  const vars = { n: d.length, from: dateText(d[0], lang), to: dateText(d[d.length - 1], lang), day: Number(d[0].slice(8, 10)) };
  const key = cadence === "monthly" ? "datesMonthly" : cadence === "daily" ? "datesDaily" : "datesList";
  return t(key, vars, lang);
}

/**
 * Validation summary from meta.validation. Uses whichever metrics the pipeline published, each
 * number under the name of what its key measures (pipeline/validate_sst.py, validate_fire.py):
 * error metrics for a continuous value (mae, bias, p90_abs_error, within_0_25, same_class) or
 * agreement metrics for presence (presence_agreement; missed_by_us = fire in the reference only;
 * extra_in_ours = fire in our frame only; spearman_rho over every sampled cell, quiet ones
 * included; spearman_rho_fire_cells over the fire_cells cells with fire on either side).
 */
export function validationText(meta, lang = "en") {
  const v = meta.validation;
  if (!v) return t("notValidated", {}, lang);
  const unit = v.unit || meta.unit || "";
  const head = v.dates
    ? t("valHeadDates", { points: v.points, dates: v.dates, reference: v.reference || "" }, lang)
    : t("valHead", { points: v.points, reference: v.reference || "" }, lang);
  const parts = [];
  if (v.mae != null) parts.push(t("valMae", { v: withUnit(v.mae, unit, lang) }, lang));
  if (v.bias != null) parts.push(t("valBias", { v: `${signedNum(v.bias, 2, lang)}${unit ? ` ${unit}` : ""}` }, lang));
  if (v.p90_abs_error != null) parts.push(t("valP90", { v: withUnit(v.p90_abs_error, unit, lang) }, lang));
  if (v.within_0_25 != null) parts.push(t("valWithin", { p: pct(v.within_0_25, lang), v: withUnit(0.25, unit, lang) }, lang));
  if (v.same_class != null) parts.push(t("valSameClass", { p: pct(v.same_class, lang), classes: v.classes ? ` (${v.classes})` : "" }, lang));
  if (v.presence_agreement != null) parts.push(t("valPresence", { p: pct(v.presence_agreement, lang) }, lang));
  if (v.missed_by_us != null && v.extra_in_ours != null) parts.push(t("valMissed", { missed: v.missed_by_us, extra: v.extra_in_ours }, lang));
  // The rank correlation among the cells with fire is the honest one: over every sampled cell the
  // many cells that are zero on both sides tie and inflate it, so that one is shown only when the
  // meta has nothing better.
  if (v.spearman_rho_fire_cells != null) {
    parts.push(t(v.fire_cells != null ? "valRhoFire" : "valRhoFireN", { rho: num(v.spearman_rho_fire_cells, 2, lang), n: v.fire_cells }, lang));
  } else if (v.spearman_rho != null) {
    parts.push(t(v.points ? "valRho" : "valRhoAll", { rho: num(v.spearman_rho, 2, lang), points: v.points }, lang));
  }
  let text = `${head}${parts.length ? `: ${parts.join(", ")}` : ""}.`;
  const left = Object.entries(v.excluded && typeof v.excluded === "object" ? v.excluded : {})
    .filter(([, n]) => Number(n) > 0)
    .map(([why, n]) => t(`valEx_${why}`, { n }, lang).replace(`valEx_${why}`, `${n} ${why.replace(/_/g, " ")}`));
  if (left.length) text += ` ${t("valExcluded", { list: left.join(", ") }, lang)}`;
  if (v.quiet_cells) text += ` ${t("valQuiet", { text: v.quiet_cells }, lang)}`;
  if (v.note) text += ` ${v.note.charAt(0).toUpperCase()}${v.note.slice(1)}.`;
  return text;
}

/** "the colorbar ends" -> "The colorbar ends." (the pipeline writes lowercase fragments). */
const sentence = (x) => {
  const s = String(x).trim();
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? "" : "."}` : "";
};

/** Method rows taken as written by the pipeline (English data text), only those present. */
export function methodRows(meta) {
  const m = meta.method;
  if (!m || typeof m !== "object") return [];
  const rows = [];
  const how = [m.decoding || m.classification, m.aggregation || m.density].filter(Boolean).map(sentence).join(" ");
  if (how) rows.push(["method", how]);
  if (typeof m.saturation === "string") rows.push(["saturation", sentence(m.saturation)]);
  else if (typeof m.scale === "string") rows.push(["saturation", sentence(m.scale)]);
  if (m.not_measured) rows.push(["notMeasured", sentence(m.not_measured)]);
  if (m.excluded_dates && typeof m.excluded_dates === "object") {
    const list = Object.entries(m.excluded_dates).map(([d, why]) => `${d}: ${why}`);
    if (list.length) rows.push(["leftOut", list.join("; ")]);
  }
  return rows;
}

/** Compare pairs with their notes, e.g. "Equatorial Pacific: 10 Nov 2025 vs 10 Nov 2026. NOAA CPC: ...". */
export function compareText(meta, places, lang = "en") {
  return (meta.compare || [])
    .map((c) => {
      const name = places.find((p) => p.id === c.place)?.name || c.place;
      const pair = `${name}: ${dateText(c.a, lang)} ${t("versus", {}, lang)} ${dateText(c.b, lang)}`;
      return c.note ? `${pair}. ${c.note}` : pair;
    })
    .join(" ");
}

/** "NASA SVS 5176, pipeline/build_sst.py, 14 November 2026." */
export function provenanceText(meta, lang = "en") {
  const p = meta.provenance;
  if (!p) return "";
  const created = typeof p.created === "string" && /^\d{4}-\d{2}-\d{2}/.test(p.created) ? dateText(p.created.slice(0, 10), lang) : "";
  return [p.source, p.generator, created].filter(Boolean).join(", ") + ".";
}

/**
 * Per-date facts the pipeline published in meta.method.per_date, or "".
 * Ocean anomaly: cells at the ends of the scale. Fire: cells with fire and cells at the top.
 */
export function perDateText(meta, date, lang = "en") {
  const d = meta.method?.per_date?.[date];
  if (!d) return "";
  const { min, max, kind } = meta.scale;
  const diverging = kind === "diverging";
  const unit = meta.unit || "";
  const fmt = (n) => Number(n).toLocaleString(lang === "pt-BR" ? "pt-BR" : "en-GB");
  const parts = [];
  if (d.cells_with_fire != null) parts.push(t("pdCellsFire", { n: fmt(d.cells_with_fire) }, lang));
  if (d.saturated_high_cells != null) parts.push(t("pdHigh", { n: fmt(d.saturated_high_cells), v: withUnit(max, unit, lang, diverging) }, lang));
  if (d.saturated_low_cells != null) parts.push(t("pdLow", { n: fmt(d.saturated_low_cells), v: withUnit(min, unit, lang, diverging) }, lang));
  if (d.saturated_cells != null) parts.push(t("pdHigh", { n: fmt(d.saturated_cells), v: withUnit(max, unit, lang, diverging) }, lang));
  return parts.length ? `${dateText(date, lang)}: ${parts.join(", ")}.` : "";
}
