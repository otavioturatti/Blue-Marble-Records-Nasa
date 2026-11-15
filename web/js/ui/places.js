// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
// The place list: a native radio group (name "place") built from template#tpl-place.
// A screen reader announces "Uberlândia, Brazil, land, radio button, 1 of 9"; the arrow keys move
// between places (native change event). Two levels of choosing:
//   select:   arrow keys, a click or tap on another row        -> onSelect(id) (it plays after a moment)
//   activate: Enter, a click or tap on the row of the place
//             already chosen                                    -> onActivate(id) (pause, continue)
// Home and End go to the first and the last place; a letter that is not a shortcut of the player
// jumps to the next place whose name starts with it.
// Each row also shows, decoratively (aria-hidden), the place's selection code (A01) and its value
// on the date shown; pointing at a row or focusing it lights the place on the globe (onHover).

import { t } from "./i18n.js";

const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Index of the next place after fromIdx whose name starts with letter (accents and case ignored),
 * wrapping round the list; -1 when none does.
 */
export function nextByLetter(places, fromIdx, letter) {
  const k = fold(letter);
  const n = places.length;
  for (let i = 1; i <= n; i++) {
    const j = (((fromIdx + i) % n) + n) % n;
    if (fold(places[j].name).startsWith(k)) return j;
  }
  return -1;
}

/**
 * Does a click on the place already chosen play it again? detail: the click count of the event
 * (0 for keyboard and label-forwarded clicks); pointer: the kind of the last press. A mouse's
 * second click belongs to the double click (a visit); a tap always counts, as a phone has no
 * double click (a double tap there used to start Play through time from the first date).
 */
export function tapCounts(detail, pointer) {
  if (detail < 1) return false;
  return detail === 1 || pointer === "touch";
}

/** True when the places are not all of one surface (then each row shows its surface word). */
export function mixesSurfaces(places) {
  return new Set(places.map((p) => p.surface || "")).size > 1;
}

/**
 * The selection code of a place, like a jukebox's numbered titles: the record's letter (A for the
 * first record, B for the second, and so on) and the place's position in that record's list, two
 * digits: "A01", "B13". Decorative only (hidden from assistive technology).
 */
export function selectionCode(recordIndex, placeIndex) {
  const letter = String.fromCharCode(65 + Math.max(0, recordIndex) % 26);
  return `${letter}${String(placeIndex + 1).padStart(2, "0")}`;
}

/**
 * The query string of a shareable link (contract 2.2: the place id lives in the URL): only the
 * record, place, date and language that differ from the defaults, in that order, without "?".
 * Nothing else is ever written (an old link's view=deck is dropped).
 * cur and defaults: { record, place, date, lang }.
 */
export function linkQuery(cur, defaults) {
  const q = new URLSearchParams();
  for (const key of ["record", "place", "date", "lang"]) {
    if (cur[key] && cur[key] !== defaults[key]) q.set(key, cur[key]);
  }
  return q.toString();
}

/**
 * list: the #places-list element; template: template#tpl-place.
 * reserved(key): true for a letter the player uses as a shortcut (it is left to the player).
 */
export function createPlaceList({ list, template, onSelect, onActivate, onHover = () => {}, reserved = () => false, lang = () => "en" }) {
  let places = [];
  let current = null;
  let values = null; // Map id -> { text, color, nodata }, the values on the date shown (null: loading)
  let soundTimer = 0;

  const inputs = () => [...list.querySelectorAll('input[name="place"]')];
  const inputFor = (id) => inputs().find((i) => i.value === id) || null;

  // The surface word ("ocean", "land") only says something when the list mixes surfaces
  // (a record with no surface); on a list of one surface it is hidden.
  let mixed = false;

  function fill(row, p) {
    // The radio's name: the place without its parenthesis (the audit); the visible name is aria-hidden.
    row.querySelector('input[name="place"]')?.setAttribute("aria-label", p.name.replace(/\s*\([^)]*\)\s*$/, ""));
    // Coordinates in a name ("Equatorial Pacific (near 0°, 140°W)") are shown but hidden from
    // assistive technology: a screen reader would repeat them on every row (W says them on demand).
    const slot = row.querySelector('[data-slot="name"]');
    const m = /^(.*?)(\s*\([^)]*°[^)]*\))$/.exec(p.name);
    if (m) {
      const coords = Object.assign(document.createElement("span"), { className: "place__coords", textContent: m[2] });
      coords.setAttribute("aria-hidden", "true");
      slot.replaceChildren(m[1], coords);
    } else slot.textContent = p.name;
    const meta = row.querySelector('[data-slot="meta"]');
    meta.textContent = p.surface ? t(p.surface, {}, lang()) : "";
    meta.hidden = !mixed;
  }

  /**
   * Scroll the checked row fully into view inside the list (border and focus ring included).
   * Only the list's own scrollTop moves, never the page; nothing happens when the list does not scroll.
   */
  function reveal() {
    const row = inputFor(current)?.closest("label");
    if (!row || list.scrollHeight <= list.clientHeight) return;
    const margin = 6;
    const box = list.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const top = box.top + list.clientTop + margin;
    const bottom = box.top + list.clientTop + list.clientHeight - margin;
    if (r.top < top) list.scrollTop -= top - r.top;
    else if (r.bottom > bottom) list.scrollTop += Math.min(r.bottom - bottom, r.top - top);
  }

  /** One row's value: text and colour only (no layout work), skipped when nothing changed. */
  function paintValue(row, id) {
    const slot = row.querySelector('[data-slot="val"]');
    if (!slot) return;
    const v = values?.get(id);
    const text = v ? v.text : "";
    if (slot.textContent !== text) slot.textContent = text;
    slot.classList.toggle("is-nodata", !!v?.nodata);
    const color = v?.color || "";
    if (slot.style.getPropertyValue("--val") !== color) {
      if (color) slot.style.setProperty("--val", color);
      else slot.style.removeProperty("--val");
    }
  }

  /**
   * Build the list for these places (the ones the current record covers), with checkedId checked.
   * recordIndex: the record's position in the record list, for the selection codes (A01, B01).
   */
  function render(next, checkedId, { recordIndex = 0 } = {}) {
    const hadFocus = list.contains(document.activeElement);
    places = next;
    current = checkedId;
    values = null; // the new record's values are on their way
    mixed = mixesSurfaces(places);
    const frag = document.createDocumentFragment();
    places.forEach((p, i) => {
      const row = template.content.firstElementChild.cloneNode(true);
      const input = row.querySelector("input");
      input.value = p.id;
      input.checked = p.id === checkedId;
      row.dataset.surface = p.surface || "land";
      const code = row.querySelector('[data-slot="code"]');
      if (code) code.textContent = selectionCode(recordIndex, i);
      fill(row, p);
      if (p.id === litId) row.classList.add("is-lit");
      frag.append(row);
    });
    list.replaceChildren(frag);
    list.scrollTop = 0;
    reveal();
    // A re-render must not drop the keyboard focus on the page body.
    if (hadFocus) inputFor(checkedId)?.focus({ preventScroll: true });
  }

  /** Names and surface words in the current language, keeping the checked place and the focus. */
  function relabel() {
    for (const input of inputs()) {
      const p = places.find((x) => x.id === input.value);
      if (p) fill(input.closest("label") || input.parentElement, p);
    }
  }

  /** Check a place without firing change; focus it when asked. */
  function check(id, { focus = false } = {}) {
    const input = inputFor(id);
    current = id;
    if (!input) return;
    input.checked = true;
    if (focus) input.focus({ preventScroll: true });
    reveal();
  }

  /** The values on the date shown (Map id -> { text, color, nodata }), or null while they load. */
  function setValues(next) {
    values = next;
    for (const input of inputs()) paintValue(input.closest("label"), input.value);
  }

  /** Light the row of a place pointed at elsewhere (a dot on the globe), or none (null). */
  let litId = null;
  function light(id) {
    if (id === litId) return;
    litId = id;
    for (const input of inputs()) input.closest("label")?.classList.toggle("is-lit", input.value === id);
  }

  /** The checked row shows its "sounding" mark for ms (a single tone; Play and Compare use CSS). */
  function sounding(ms = 1300) {
    clearTimeout(soundTimer);
    list.classList.add("is-sounding");
    soundTimer = setTimeout(() => list.classList.remove("is-sounding"), ms);
  }

  // Pointing at a row or focusing it lights its place on the globe (and nothing else).
  const rowId = (el) => (el instanceof Element ? el.closest("label")?.querySelector('input[name="place"]')?.value : null) || null;
  let hoverId = null;
  const hover = (id) => { if (id !== hoverId) { hoverId = id; onHover(id); } };
  list.addEventListener("pointerover", (e) => { if (e.pointerType !== "touch") hover(rowId(e.target)); });
  list.addEventListener("pointerleave", () => hover(list.contains(document.activeElement) ? rowId(document.activeElement) : null));
  list.addEventListener("focusin", (e) => hover(rowId(e.target)));
  list.addEventListener("focusout", (e) => { if (!list.contains(e.relatedTarget)) hover(null); });

  // A row chosen by this very click: its click must not also pause it.
  let selectedNow = false;
  list.addEventListener("change", (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.name !== "place") return;
    current = input.value;
    selectedNow = true;
    setTimeout(() => { selectedNow = false; }, 0);
    onSelect(input.value);
  });

  // The kind of pointer of the last press on the list ("mouse", "pen", "touch").
  let pointer = "mouse";
  list.addEventListener("pointerdown", (e) => { pointer = e.pointerType || "mouse"; });

  // A click or tap on the place already chosen pauses or continues it (a click on another place
  // fires change instead). Keyboard and label-forwarded clicks have detail 0 and are ignored; the
  // second click of a mouse double click (detail 2) is left to dblclick, while every tap counts.
  let lastActivate = 0;
  const activate = (id) => {
    const now = performance.now();
    if (now - lastActivate < 250) return; // a click and its double click are one activation
    lastActivate = now;
    onActivate(id);
  };
  // A screen reader's double tap (TalkBack, VoiceOver) arrives as a click with detail 0 and no
  // pointer events: on the chosen row, and with no key pressed on the list just before (Space on a
  // radio also clicks it), it is the same pause and continue.
  let lastKeyAt = -Infinity;
  list.addEventListener("keydown", () => { lastKeyAt = performance.now(); }, true);
  list.addEventListener("click", (e) => {
    const row = e.target instanceof Element ? e.target.closest("label") : null;
    const input = row?.querySelector('input[name="place"]');
    const chosen = !!input && input.value === current && !selectedNow;
    selectedNow = false;
    if (!chosen) return;
    if (e.detail === 0) { if (performance.now() - lastKeyAt > 300) activate(current); return; }
    if (tapCounts(e.detail, pointer) && e.detail === 1) activate(current);
  });

  list.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.name !== "place") return;
    if (e.key === "Enter") {
      e.preventDefault();
      activate(input.value);
      return;
    }
    const idx = places.findIndex((p) => p.id === input.value);
    let next = -1;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = places.length - 1;
    else if (e.key.length === 1 && /\p{L}/u.test(e.key) && !reserved(e.key)) next = nextByLetter(places, idx, e.key);
    if (next < 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (places[next].id === current) return;
    check(places[next].id, { focus: true });
    onSelect(places[next].id);
  });

  return {
    render,
    relabel,
    check,
    reveal,
    setValues,
    light,
    sounding,
    /** True when the keyboard focus is on a place. */
    hasFocus: () => list.contains(document.activeElement),
  };
}
