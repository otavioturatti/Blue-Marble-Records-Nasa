// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// How long the visitor's own screen reader takes to say a line, for the path without the app's voice
// (the page cannot hear the reader, so it estimates, and the estimate must be safe): the tour posts
// its next line, and any music starts, only after this estimate.

/**
 * The reading rate. A default screen reader rate with a margin (about 15 characters a second, a
 * little slower here), plus the pauses at punctuation and a start-up per line. Not a measurement.
 */
export const PACE = Object.freeze({
  perChar: 68, // ms per character
  sentenceEnd: 350, // ms per . ? ! ; :
  comma: 150, // ms per comma
  perLine: 600, // ms per posted line (the reader picks it up, a breath before it speaks)
});
/** The silence kept after the estimated end of the last line before any music or needle drop. */
export const GUARD_MS = 1200;
/** The reader announcing a focus move ("Pause, button"), before the page's next line. */
export const FOCUS_MS = 1500;
/** A line longer than this is posted sentence by sentence. */
export const SPLIT_OVER = 120;

const ENDS = /[.?!;:…](?=\s|$)/g;

/** The estimated time (ms) to read one posted line at the safe rate. */
export function readMs(text, pace = PACE) {
  const s = String(text || "").trim();
  if (!s) return 0;
  const ends = (s.match(ENDS) || []).length;
  const commas = (s.match(/,/g) || []).length;
  return Math.round(pace.perLine + pace.perChar * s.length + pace.sentenceEnd * ends + pace.comma * commas);
}

/** A long line as its sentences (each its own live update); a short line as it is. */
export function splitLine(text, over = SPLIT_OVER) {
  const s = String(text || "").trim();
  if (s.length <= over) return s ? [s] : [];
  const parts = s.match(/[^.?!;:…]+[.?!;:…]+(?=\s|$)|[^.?!;:…]+$/g) || [s];
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * The page's schedule for lines posted one after another (each part waits for the estimated end of
 * the one before), then the music GUARD_MS after the last estimated end. focusMs: a focus move
 * announced by the reader first. Returns the posting times and the music start (ms from 0).
 */
export function schedule(lines, { focusMs = 0, start = 0, pace = PACE } = {}) {
  let t = start + focusMs;
  const posts = [];
  for (const line of lines) for (const part of splitLine(line)) { posts.push({ part, at: t }); t += readMs(part, pace); }
  return { posts, music: t + GUARD_MS };
}

/**
 * A model of a screen reader at `cps` characters a second (with the same punctuation pauses), the
 * parts queued as they are posted. Returns the overlap of its speech with the music start (ms, 0 if
 * none) and the longest silence between the end of one utterance and the next thing heard.
 */
export function readerModel({ posts, music }, { cps, focusMs = 0, pace = PACE }) {
  const speak = (s) => Math.round(1000 * s.length / cps + pace.sentenceEnd * ((s.match(ENDS) || []).length) + pace.comma * ((s.match(/,/g) || []).length));
  let busy = focusMs; // the focus utterance first
  let longest = { ms: 0, before: null };
  for (const { part, at } of posts) {
    const begin = Math.max(at, busy);
    if (begin - busy > longest.ms) longest = { ms: begin - busy, before: part };
    busy = begin + speak(part);
  }
  if (music - busy > longest.ms) longest = { ms: music - busy, before: "(music)" };
  return { overlap: Math.max(0, busy - music), longest, readerEnd: busy };
}
