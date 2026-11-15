// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// SIMULATOR of the DJ text, used only until web/js/dj.js (Otávio) exists.
// Same API as the real DJ text module. Numbers come from ctx only.

import { physicalValue } from "../data.js";
import { formatValue, normalWord } from "./format.js";
import { dateText, monthYearText } from "./valuetext.js";
import { t } from "./i18n.js";

function where(place, lang) {
  if (place?.name) return place.name;
  const ns = place.lat < 0 ? t("south", {}, lang) : t("north", {}, lang);
  const ew = place.lon < 0 ? t("west", {}, lang) : t("east", {}, lang);
  return `${Math.abs(Math.round(place.lat))}° ${ns}, ${Math.abs(Math.round(place.lon))}° ${ew}`;
}

function valueSentence(record, sample, lang, brief = false) {
  const pv = physicalValue(record, sample);
  if (!pv) return lang === "pt-BR" ? "sem dado aqui" : "no data here";
  if (brief && record.scale.kind !== "diverging") {
    // The short form for a screen reader: "fire dots on 23.1% of land pixels".
    const num = formatValue({ ...record, unit: "%" }, pv, lang);
    return record.unit?.startsWith("%") ? t("fireBrief", { v: num }, lang) : formatValue(record, pv, lang);
  }
  const text = formatValue(record, pv, lang);
  if (record.scale.kind === "diverging" && !pv.saturated) {
    // The readout's rule (format.js nearBand): within a sixteenth of the scale's span of zero
    // (0.25 °C on the SST record) the honest words are "near normal"; the number stays.
    const side = normalWord(record, pv, lang)
      || (pv.value > 0 ? (lang === "pt-BR" ? "acima do normal" : "above normal") : (lang === "pt-BR" ? "abaixo do normal" : "below normal"));
    return `${text}, ${side}`;
  }
  // Sequential records name what they measure, e.g. "fire activity (hot-pixel density) 11.4% of land pixels with fire dots".
  return record.scale.kind !== "diverging" && record.quantity ? `${record.quantity} ${text}` : text;
}

function prefix(record, lang) {
  if (!record.synthetic) return "";
  return lang === "pt-BR" ? "Dados sintéticos: " : "Synthetic data: ";
}

// Optional context flags (the rule for the real dj.js too): omitPlace, the place's name is left
// out (the screen reader has just said it, on the focused row); brief, the date as month and year
// ("June 2024") and the fire value in its short form.
const when = (date, lang, brief) => {
  const s = brief ? monthYearText(date, lang) : dateText(date, lang);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function describe(ctx) {
  const { lang = "en", record, place, date, sample, omitPlace = false, brief = false } = ctx;
  const v = valueSentence(record, sample, lang, brief);
  if (omitPlace) return `${prefix(record, lang)}${when(date, lang, brief)}: ${v}.`;
  return `${prefix(record, lang)}${where(place, lang)}, ${brief ? monthYearText(date, lang) : dateText(date, lang)}: ${v}.`;
}

export function describeCompare(ctx) {
  const { lang = "en", record, place, date, dateB, sample, sampleB, omitPlace = false, brief = false } = ctx;
  const a = valueSentence(record, sample, lang, brief);
  const b = valueSentence(record, sampleB, lang, brief);
  const pair = `${when(date, lang, brief)}: ${a}. ${when(dateB, lang, brief)}: ${b}.`;
  return `${prefix(record, lang)}${omitPlace ? "" : `${where(place, lang)}. `}${pair}`;
}
