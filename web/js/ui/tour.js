// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
// The guided tour and the simple remote, the pure parts: the route of four stops, the excerpt of dates each one plays, how the
// visitor is using the page (which variant of a line to say), and the remote's keys.

/**
 * The route: two seas, then two fire places. Every stop plays its whole record, from the first date
 * to the last, like any place chosen by hand (a place always starts at the beginning). An excerpt is
 * still possible: add from and to (ISO dates, included) to a stop, as in the comment at its end.
 * "before" is said first (the fire record's line), then the place's "Entering ..." line, then the
 * stop's listening line.
 */
export const TOUR = Object.freeze([
  { record: "sst-anomaly", place: "north-atlantic-cold-blob", line: "T03a" }, // excerpt: from: "2025-11-10", to: "2026-11-10"
  { record: "sst-anomaly", place: "equatorial-pacific", line: "T03b" }, // excerpt: from: "2025-11-10", to: "2026-11-10"
  { record: "fire", place: "uberlandia", line: "T03d", before: "T03c" }, // excerpt: from: "2025-02-10", to: "2025-09-10"
  { record: "fire", place: "angola", line: "T03e" }, // excerpt: from: "2025-02-10", to: "2025-09-10"
]);

/**
 * The indexes of the dates a stop plays: the whole record (first to last) when the stop names no
 * excerpt; with from and to, the first date on or after "from" and the last on or before "to" (the
 * whole record again when those dates are not there).
 */
export function stopRange(dates, stop) {
  const n = dates.length;
  let from = stop.from ? dates.findIndex((d) => d >= stop.from) : 0;
  let to = stop.to ? -1 : n - 1;
  if (stop.to) for (let i = n - 1; i >= 0; i--) if (dates[i] <= stop.to) { to = i; break; }
  if (from < 0 || to < 0 || to < from) { from = 0; to = n - 1; }
  return { from, to };
}

/**
 * How the visitor is using the page, for the variant of a line: "key" (a keyboard), "sr" (a touch
 * screen activated with no touch events, most likely a screen reader's double tap), "touch" (a
 * finger). Suffixes in the script: "" for key, "t" for sr, "v" for touch.
 */
export function inputKind({ lastInput = "key", srLikely = false, touch = false } = {}) {
  if (touch && srLikely) return "sr";
  if (touch || lastInput === "touch") return "touch";
  return "key";
}
export const SUFFIX = Object.freeze({ key: "", sr: "t", touch: "v" });

/**
 * The gate's choice as a fact about the visitor: "Guided tour, with my screen reader" on a touch
 * layout says she uses one, whatever its events looked like (TalkBack and VoiceOver differ), so the
 * "t" lines are hers for the whole session. The other buttons, and keyboards, keep the heuristic.
 */
export function choiceSaysScreenReader(buttonId, touch) {
  return !!touch && buttonId === "tour-start";
}

/**
 * The remote's keys. where: "remote" (the focus is on a remote button), "list" (on a place), or
 * "page" (anywhere else in the player); onButton: the focus is on a button (Space presses it);
 * tour: the tour is running. Returns "next", "prev", "sea", "fire", "tour", "stop" or null (the
 * key keeps its own behaviour).
 */
export function remoteKey(key, { where = "page", onButton = false, tour = false } = {}) {
  if (key === "Escape" || key === "s" || key === "S") return "stop";
  if (key === " " && !onButton && where !== "list") return "tour";
  if (where !== "remote" && where !== "list") return null;
  if (key === "ArrowLeft") return "sea";
  if (key === "ArrowRight") return "fire";
  // On the place list, Up and Down keep the radio group's own behaviour outside the tour.
  if (key === "ArrowDown" && (where === "remote" || tour)) return "next";
  if (key === "ArrowUp" && (where === "remote" || tour)) return "prev";
  return null;
}

/**
 * The gate's arrows, an extra for keyboards (the three buttons stay plain buttons): which of the
 * `count` buttons gets the focus for `key` from button `at` (-1: none focused yet, the page's body).
 * Down and Up move in order and wrap; Home and End go to the first and the last; from the body,
 * Down goes to the first and Up to the last. null: the key is not one of these (left to the page).
 */
export function gateKey(key, at = -1, count = 3) {
  if (!(count > 0)) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return at < 0 ? 0 : (at + 1) % count;
  if (key === "ArrowUp") return at < 0 ? count - 1 : (at - 1 + count) % count;
  return null;
}

/**
 * Guided mode (the visitor entered by one of the two guided tours; it lasts the whole session): one
 * key map for the whole page, wherever the focus is. focus: "button" (a button, a link or a
 * checkbox: Space and Enter keep their native meaning and press it), "keep" (a select, the date
 * slider, a text field: every key is theirs except Esc), "list" (a place in the list) or "other"
 * (the body, the picture, anything else). Down and Up: next and previous place; Right and Left: the
 * fire record and the sea record; Space and Enter: pause and continue; Esc and S: stop. null: the
 * key keeps its native meaning.
 */
export function guidedKey(key, focus = "other") {
  if (key === "Escape") return "stop";
  if (focus === "keep") return null;
  if (key === "s" || key === "S") return "stop";
  if (key === "ArrowDown") return "next";
  if (key === "ArrowUp") return "prev";
  if (key === "ArrowRight") return "fire";
  if (key === "ArrowLeft") return "sea";
  if (key === " " || key === "Enter") return focus === "button" ? null : "pause";
  return null;
}


/**
 * A touch in the voice tour on a touch screen, from its movement: "tap" (under 12 px and 300 ms:
 * pause and continue), "next" (a swipe to the left), "prev" (to the right), "switch" (up or down: sea
 * and fire), or null. A swipe is at least 60 px, mostly along one axis, under 700 ms.
 */
export function touchGesture({ dx = 0, dy = 0, ms = 0 } = {}) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < 12 && ay < 12 && ms < 300) return "tap";
  if (ms >= 700) return null;
  if (ax >= 60 && ax >= 1.5 * ay) return dx < 0 ? "next" : "prev";
  if (ay >= 60 && ay >= 1.5 * ax) return "switch";
  return null;
}

/** The gate's three options, in order: a (with my screen reader), b (with the app's voice), c (explore). */
export const GATE_OPTIONS = Object.freeze(["a", "b", "c"]);

/**
 * The gate's rule: the first raw interaction only speaks; an option is chosen, then confirmed.
 * input: "assist" (a click with no raw pointer: a screen reader, or Enter or Space on a focused
 * button), "touch" or "mouse" (a raw press), "double" (a double tap or click), "swipeUp" or
 * "swipeDown" (a finger on the gate). target: "a", "b", "c" or "bg" (the background). Returns
 * { action: "enter" | "wake" | "select" | "say" | "none", option, lines }.
 */
export function gateDecision({ input, woken = false, target = "bg", selected = "a" } = {}) {
  const name = (o) => `G02${o}`;
  const isOpt = GATE_OPTIONS.includes(target);
  if (input === "assist") return isOpt ? { action: "enter", option: target, lines: [] } : { action: "none", option: selected, lines: [] };
  if (!woken) {
    // The first option of the list, wherever a finger landed (it lands anywhere). A mouse: the option
    // clicked. Entered by a raw finger, the first option is led by the app's voice (app.js enterGate).
    const option = input === "mouse" && isOpt ? target : "a";
    return { action: "wake", option, lines: [input === "mouse" ? "G01" : "G01t", name(option)] };
  }
  if (input === "double") return { action: "enter", option: selected, lines: [] };
  if (input === "swipeUp" || input === "swipeDown") {
    const i = GATE_OPTIONS.indexOf(selected);
    const option = GATE_OPTIONS[(i + (input === "swipeDown" ? 1 : -1) + 3) % 3];
    return { action: "select", option, lines: [name(option)] };
  }
  if (!isOpt) return { action: "say", option: selected, lines: [name(selected)] };
  if (target === selected) return { action: "enter", option: target, lines: [] };
  return { action: "select", option: target, lines: [name(target)] };
}

/** Two taps or clicks close enough in time and place to be one double tap. */
export function isDoubleTap(prev, next, { ms = 350, px = 40 } = {}) {
  if (!prev || !next) return false;
  return next.t - prev.t <= ms && Math.hypot(next.x - prev.x, next.y - prev.y) <= px;
}

