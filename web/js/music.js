// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Otávio.
// Pure music rules ("label rules"). No audio, no DOM: testable in Node.

/** D major pentatonic, semitones above D. */
export const PENTATONIC = [0, 2, 4, 7, 9];

/** Lowest note of the label scale: D3. */
export const BASE_MIDI = 50;

/** Number of steps in the label scale, D3 to D6 inclusive (3 octaves x 5 degrees + top D). */
export const SCALE_STEPS = PENTATONIC.length * 3 + 1;

export const BPM = 84;

/** Clamp to [0, 1]. */
export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/** Scale degree index (0 .. SCALE_STEPS - 1) for a position on the color scale. */
export function degreeForV01(v01) {
  return Math.round(clamp01(v01) * (SCALE_STEPS - 1));
}

/** MIDI note for a scale degree index. */
export function midiForDegree(degree) {
  const octave = Math.floor(degree / PENTATONIC.length);
  const step = PENTATONIC[degree % PENTATONIC.length];
  return BASE_MIDI + 12 * octave + step;
}

/** MIDI note for a position on the color scale. */
export function midiForV01(v01) {
  return midiForDegree(degreeForV01(v01));
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Compare two positions on the color scale.
 * - equal (|delta| < UNISON): unison;
 * - small difference (< SMALL): same note, B detuned up to MAX_CENTS (audible beating);
 * - large difference: B on its own scale note (a proportional interval).
 * Returns frequencies for A and B plus a label for tests and captions.
 */
export const UNISON = 0.004;
export const SMALL = 0.08;
export const MAX_CENTS = 30;

export function compareTarget(aV01, bV01) {
  const aMidi = midiForV01(aV01);
  const aFreq = midiToFreq(aMidi);
  const delta = clamp01(bV01) - clamp01(aV01);
  if (Math.abs(delta) < UNISON) {
    return { aFreq, bFreq: aFreq, kind: "unison", cents: 0 };
  }
  if (Math.abs(delta) < SMALL) {
    const cents = Math.sign(delta) * Math.max(4, (Math.abs(delta) / SMALL) * MAX_CENTS);
    return { aFreq, bFreq: aFreq * Math.pow(2, cents / 1200), kind: "beating", cents };
  }
  const bMidi = midiForV01(bV01);
  return { aFreq, bFreq: midiToFreq(bMidi), kind: "interval", cents: (bMidi - aMidi) * 100 };
}

/** Anomaly records: distance from the reference (zero anomaly) as 0..1 roughness. */
export function roughness(v01, ref = 0.5) {
  const span = Math.max(ref, 1 - ref);
  return clamp01(Math.abs(clamp01(v01) - ref) / span);
}

/** Density records (fire): number of hits in one turn, 0..maxHits. */
export function hitsForV01(v01, maxHits = 4) {
  if (v01 <= 0) return 0;
  return Math.max(1, Math.round(clamp01(v01) * maxHits));
}

/** Sound mode for a record's meta. */
export function modeForRecord(meta) {
  if (!meta) return "melody";
  if (meta.sound) return meta.sound;
  if (meta.scale && meta.scale.kind === "diverging") return "anomaly";
  const q = `${meta.id || ""} ${meta.quantity || ""}`.toLowerCase();
  if (q.includes("fire") || q.includes("density")) return "density";
  return "melody";
}

/** Reference position (zero anomaly) for a diverging scale. */
export function referenceV01(meta) {
  if (!meta || !meta.scale) return 0.5;
  const { min, max } = meta.scale;
  if (min < 0 && max > 0) return clamp01((0 - min) / (max - min));
  return 0.5;
}
