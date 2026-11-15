// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
// The fire record's colour scale, for the eye only (the sound and the number are untouched): one
// function shared by the readout, the place rows, the score, the scale under the reading, the
// globe and the record's grooves, so one value is one colour everywhere. No imports.
//
// fraction: the linear value over the scale's maximum (0 to 1; 0.02 is 1% of land pixels with fire
// dots on the 0 to 50% scale). Returns { rgb: [r, g, b] (sRGB, 0 to 1), strength: 0 to 1 }: how far
// the colour should replace the neutral it is drawn over. A calm place is a soft ice silver, never
// black (strength 0.5 at zero: a clear but quiet tint). The climb is gentle, in small bands: warm
// grey and pale sand first, then tan, light orange, orange, red-orange and red, with the deepest
// fire red only at the top of the scale; full strength by about 25%. All the colours are in the one
// table below, so the order can be swapped in one place.

// The stops, in percent of land pixels on the 0 to 50% scale, and their colours.
export const FIRE_STOPS = Object.freeze([
  { pct: 0, rgb: [0.62, 0.7, 0.82] }, // calm: a soft ice silver
  { pct: 2, rgb: [0.62, 0.7, 0.82] }, // still calm up to about 2%
  { pct: 5, rgb: [0.72, 0.7, 0.68] }, // a warm grey
  { pct: 10, rgb: [0.84, 0.76, 0.62] }, // a pale sand
  { pct: 15, rgb: [0.9, 0.72, 0.54] }, // a soft tan
  { pct: 20, rgb: [0.96, 0.66, 0.4] }, // a light orange
  { pct: 27, rgb: [0.98, 0.54, 0.22] }, // orange
  { pct: 34, rgb: [0.98, 0.38, 0.14] }, // red-orange
  { pct: 42, rgb: [0.96, 0.22, 0.08] }, // red
  { pct: 50, rgb: [0.88, 0.08, 0.04] }, // the deepest fire red (the top of the scale)
]);
const SCALE_MAX_PCT = 50;
const FULL_STRENGTH_PCT = 25;
const CALM_STRENGTH = 0.5;

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function fireRamp(fraction) {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const pct = f * SCALE_MAX_PCT;
  const strength = +(CALM_STRENGTH + (1 - CALM_STRENGTH) * smooth(pct / FULL_STRENGTH_PCT)).toFixed(4);
  const stops = FIRE_STOPS;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (pct <= b.pct) {
      const k = b.pct > a.pct ? (pct - a.pct) / (b.pct - a.pct) : 1;
      return { rgb: a.rgb.map((x, j) => +(x + (b.rgb[j] - x) * k).toFixed(4)), strength };
    }
  }
  return { rgb: [...stops[stops.length - 1].rgb], strength };
}
