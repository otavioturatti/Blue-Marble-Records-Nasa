// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// The single aria-live region. Announcements are debounced (500 ms) so a moving slider
// speaks once, and the music ducks while the user's screen reader talks.
import { readMs } from "./pace.js";

/**
 * The text as a screen reader speaks it, for timing: signs and units become their spoken words
 * ("−0.7 °C" is "minus 0.7 degrees Celsius"), so a short written sentence is not timed as short.
 */
export function spokenText(text) {
  return String(text)
    .replace(/°C/g, " degrees Celsius ")
    .replace(/°/g, " degrees ")
    .replace(/[−-](?=\d)/g, " minus ")
    .replace(/\+(?=\d)/g, " plus ")
    .replace(/≥/g, " at or above ")
    .replace(/≤/g, " at or below ")
    .replace(/%/g, " percent ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How long to duck the music for a sentence: its speaking time at an unhurried screen reader rate
 * (about 60 ms per spoken character, roughly 170 words a minute, a default rate) plus the reader's
 * start-up, 1 s to 15 s. The sentences in use run from 2 s (a value) to about 10 s (the intro).
 */
export function duckMs(text) {
  const chars = spokenText(text).length;
  return Math.min(15000, Math.max(1000, Math.round(500 + 60 * chars)));
}

export function createAnnouncer({
  region,
  duck = () => {},
  delay = 500,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  now: clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
}) {
  let pending = null;
  let timer = null;
  let held = false;
  let endsAt = 0; // when the last sentence written is estimated to have been spoken
  // When the screen reader is estimated to have said everything written so far, at the safe rate of
  // pace.js (polite updates queue in the reader: each one after the one before).
  let queueEnd = 0;

  function write(text, ms = duckMs(text)) {
    endsAt = clock() + 60 + ms;
    queueEnd = Math.max(clock(), queueEnd) + 60 + readMs(text);
    duck(ms);
    // Clear first so the same sentence twice is still spoken.
    region.textContent = "";
    setTimer(() => { region.textContent = text; }, 60);
  }

  return {
    say(text) {
      if (!text) return;
      pending = text;
      if (timer) clearTimer(timer);
      timer = null;
      if (held) return; // kept until release()
      timer = setTimer(() => { timer = null; const p = pending; pending = null; write(p); }, delay);
    },
    /**
     * Hold the page's own sentences (while the voice guide's welcome speaks: one speaker at a time);
     * release() then says the latest one held.
     */
    hold() { held = true; if (timer) { clearTimer(timer); timer = null; } },
    release() {
      if (!held) return;
      held = false;
      if (pending) { const p = pending; pending = null; this.say(p); }
    },
    /** How long (ms) until the reader has said everything written or waiting, at the safe rate. */
    readerFreeIn() {
      const left = Math.max(0, queueEnd - clock());
      return pending ? left + delay + 60 + readMs(pending) : left;
    },
    /** How long (ms) until `gap` ms after the reader's estimated end (0 when that is already past). */
    guardIn(gap) {
      if (pending) return this.readerFreeIn() + gap;
      return Math.max(0, queueEnd + gap - clock());
    },
    /** Drop a sentence still waiting in the debounce (it is not said). */
    cancel() { if (timer) clearTimer(timer); timer = null; pending = null; },
    /**
     * The visitor acted (a key, a button, a choice): a screen reader stops what it was saying when
     * its user presses a key or activates a control, so its queue counts as cut, free now. focus: the
     * action also moves the focus, which the reader announces first (that time, in ms, is added).
     * Lines the page posts by itself keep queueing behind the estimate as before.
     */
    interrupted({ focus = 0 } = {}) { queueEnd = clock() + focus; },
    /** Something the reader says that the page did not write (a focus move announced), in its queue. */
    addReader(ms) { queueEnd = Math.max(clock(), queueEnd) + ms; },
    /** About how long (ms) until the screen reader is quiet: the sentence waiting, then the one spoken. */
    quietIn() {
      const left = Math.max(0, endsAt - clock());
      return pending ? Math.max(left, delay + 60 + duckMs(pending)) : left;
    },
    /**
     * Speak now, skipping the debounce (used for Esc, errors and the legend). opts.duck: how long
     * to duck the music, when the caller knows better than the text length (a one-word label).
     */
    now(text, { duck: ms } = {}) {
      if (timer) clearTimer(timer);
      timer = null;
      pending = null;
      write(text, ms ?? duckMs(text));
    },
  };
}
