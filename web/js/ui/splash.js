// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// The opening. A record turns alone on black, travels into the "O" of RECORDS, the wordmark opens
// out from it, and the finished mark flies to its place: the gate's wordmark while the entrance is
// up (the app appears only once the visitor chooses), the header's otherwise.
// It is decorative: aria-hidden, silent, drawn over a page that is already usable underneath.
// Any key or press skips it. It plays once per browser session (or with ?intro=1) and never with
// reduced motion: the inline script in index.html decides that before the first paint, by putting
// .intro-on on <html>; the styles are in css/app.css ("The opening").

const root = document.documentElement;
const splash = document.getElementById("splash");
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN_OUT = "cubic-bezier(0.65, 0, 0.2, 1)";

let lifting;
/** Resolves when the veil starts to lift (true), or at once when there is no opening (false). */
export const introLifting = new Promise((resolve) => { lifting = resolve; });

let skipped = false;
const waits = new Set(); // the waits in progress: skipping ends them
const running = new Set();

function skip() {
  if (skipped) return;
  skipped = true;
  for (const a of running) { try { a.finish(); } catch { /* already done */ } }
  for (const done of [...waits]) done();
}

const wait = (ms) => new Promise((resolve) => {
  if (skipped || !(ms > 0)) { resolve(); return; }
  const id = setTimeout(done, ms);
  function done() { clearTimeout(id); waits.delete(done); resolve(); }
  waits.add(done);
});

/** A Web Animation that holds its last frame; skipping jumps it there. */
function animate(el, keyframes, options) {
  const a = el.animate(keyframes, { fill: "both", ...options });
  if (skipped) a.finish();
  else {
    running.add(a);
    a.finished.then(() => running.delete(a), () => running.delete(a));
  }
  return a.finished.catch(() => {});
}

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function finish(played) {
  window.removeEventListener("keydown", skip, true);
  window.removeEventListener("pointerdown", skip, true);
  window.removeEventListener("bmr:skip-intro", skip);
  // The gate's rows come in after the opening (css/app.css "The gate"); a still gate otherwise.
  if (played && root.classList.contains("gate-on")) root.classList.add("gate-enter");
  root.classList.remove("intro-on");
  splash?.remove();
  if (played) { try { sessionStorage.setItem("bmr-intro", "1"); } catch { /* storage blocked */ } }
  lifting(played); // no effect when the veil already started to lift
}

async function run() {
  const mark = document.getElementById("home");
  const hero = splash.querySelector(".splash__hero");
  const veil = splash.querySelector(".splash__veil");
  const real = mark.getBoundingClientRect();
  if (!hero || !veil || !(real.width > 0)) return finish(false);
  window.addEventListener("keydown", skip, true);
  window.addEventListener("pointerdown", skip, true);
  // A choice made on the gate during the opening (a screen reader can press a button through it).
  window.addEventListener("bmr:skip-intro", skip);

  // The same mark as the header, set larger in the middle (hidden until its parts come in).
  const box = splash.getBoundingClientRect();
  const k = Math.min(4.2, Math.max(1.4, Math.min(box.width * 0.74, 600) / real.width));
  const lock = document.createElement("div");
  lock.className = "mark splash__mark";
  lock.style.fontSize = `${k}rem`;
  lock.style.setProperty("--hl", `${k}px`);
  lock.innerHTML = mark.innerHTML;
  const word = lock.querySelector(".mark__word");
  const o = lock.querySelector(".mark__o");
  const disc = lock.querySelector(".mark__disc");
  const name = lock.querySelector(".mark__name");
  word.style.clipPath = "inset(0 50% 0 50%)";
  splash.append(lock);

  // The record alone, about a second from the first paint, while the two display fonts arrive.
  const fonts = Promise.all([document.fonts.load(`600 1em "Cormorant"`), document.fonts.load(`400 1em "Michroma"`)]).catch(() => {});
  await Promise.all([wait(1000 - performance.now()), Promise.race([fonts, wait(2500)])]);

  // The record travels into the "O"; the word opens out from it, then the rules, then the name.
  const from = center(hero.getBoundingClientRect());
  const to = disc.getBoundingClientRect();
  const dest = center(to);
  const shrink = to.width / hero.offsetWidth;
  const w = word.getBoundingClientRect();
  const oBox = o.getBoundingClientRect();
  const left = ((oBox.left - w.left) / w.width) * 100;
  const right = ((w.right - (oBox.right - 0.4 * parseFloat(getComputedStyle(o).fontSize))) / w.width) * 100;
  animate(hero, [
    { transform: "none", opacity: 1 },
    { opacity: 1, offset: 0.7 },
    { transform: `translate(${dest.x - from.x}px, ${dest.y - from.y}px) scale(${shrink})`, opacity: 0 },
  ], { duration: 800, easing: EASE_IN_OUT });
  animate(disc, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 500, easing: "linear" });
  animate(word, [
    { clipPath: `inset(-60% ${right.toFixed(2)}% -60% ${left.toFixed(2)}%)` },
    { clipPath: "inset(-60% -3% -60% -3%)" },
  ], { duration: 750, delay: 640, easing: EASE_OUT });
  setTimeout(() => lock.classList.add("is-ruled"), skipped ? 0 : 900);
  await animate(name, [
    { opacity: 0, transform: "translateY(0.32em)", filter: "blur(0.12em)" },
    { opacity: 1, transform: "none", filter: "blur(0)" },
  ], { duration: 850, delay: 700, easing: EASE_OUT });
  await wait(380);

  // The veil lifts while the mark flies to its place: the gate's wordmark (upper third) while the
  // gate is up, where the visitor chooses how to start; the header's otherwise.
  lock.classList.add("is-ruled");
  hero.remove();
  lifting(true);
  const target = (root.classList.contains("gate-on") && document.getElementById("gate-mark")) || mark;
  const home = target.getBoundingClientRect();
  const big = lock.getBoundingClientRect();
  const a = center(big);
  const b = center(home);
  const fast = skipped;
  skipped = false; // the lift itself is short; it always plays
  // The veil is slower than the mark, so the mark is nearly home before the page shows through.
  animate(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: fast ? 300 : 1000, easing: "ease-in-out" });
  await animate(lock, [
    { transform: "none" },
    { transform: `translate(${(b.x - a.x).toFixed(2)}px, ${(b.y - a.y).toFixed(2)}px) scale(${(home.width / big.width).toFixed(5)})` },
  ], { duration: fast ? 260 : 800, easing: EASE_IN_OUT });
  await wait(fast ? 40 : 200);
  finish(true);
}

if (splash && root.classList.contains("intro-on") && typeof splash.animate === "function" && document.getElementById("home")) {
  run().catch(() => finish(false));
} else {
  finish(false);
}
