// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Short spoken texts: latitude, longitude and dates.

import { t } from "./i18n.js";

/** "1 degree north" or "48 degrees west": the singular is spoken on every 1-degree step near 0. */
function degText(n, dir, lang) {
  return t(n === 1 ? "deg1" : "deg", { n, dir }, lang).trim();
}

export function latText(lat, lang) {
  const n = Math.round(Math.abs(lat));
  if (n === 0) return t("equator", {}, lang);
  return degText(n, t(lat < 0 ? "south" : "north", {}, lang), lang);
}

export function lonText(lon, lang) {
  const n = Math.round(Math.abs(lon));
  if (n === 0) return t("primeMeridian", {}, lang);
  if (n === 180) return degText(n, "", lang);
  return degText(n, t(lon < 0 ? "west" : "east", {}, lang), lang);
}

// Intl.DateTimeFormat objects are costly to build and these run on every Play step: one per locale
// and options, built once.
const formatters = new Map();
function formatter(lang, opts) {
  const locale = lang === "pt-BR" ? "pt-BR" : "en-GB";
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = formatters.get(key);
  if (!f) { f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }); formatters.set(key, f); }
  return f;
}

export function dateText(iso, lang) {
  return formatter(lang, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
}

/** Month and year in words, "June 2024" or "junho de 2024" (the screen reader's short date). */
export function monthYearText(iso, lang) {
  return formatter(lang, { month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * Short month and year, "Nov 2026" or "nov. 2026", for a narrow list of dates (the Compare
 * options). withDay: "10 Nov 2026", for a record with more than one date in a month.
 */
export function monthText(iso, lang, { withDay = false } = {}) {
  const parts = formatter(lang, { day: "numeric", month: "short", year: "numeric" }).formatToParts(new Date(`${iso}T00:00:00Z`));
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return [withDay ? get("day") : "", get("month"), get("year")].filter(Boolean).join(" ");
}

/**
 * The two dates of a published pair, short enough for the Compare select: "Nov 2025, 2026" (same
 * month), "Feb, Sept 2025" (same year), else "Nov 2025, Feb 2026".
 */
export function pairText(a, b, lang) {
  const part = (iso) => {
    const parts = formatter(lang, { month: "short", year: "numeric" }).formatToParts(new Date(`${iso}T00:00:00Z`));
    return { month: parts.find((p) => p.type === "month")?.value || "", year: parts.find((p) => p.type === "year")?.value || "" };
  };
  const [x, y] = [part(a), part(b)];
  if (x.month === y.month) return `${x.month} ${x.year}, ${y.year}`;
  if (x.year === y.year) return `${x.month}, ${y.month} ${x.year}`;
  return `${x.month} ${x.year}, ${y.month} ${y.year}`;
}
