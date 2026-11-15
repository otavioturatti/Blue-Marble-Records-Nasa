// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen.
// SIMULATOR of the sound engine, used only until web/js/engine.js (Otávio) exists.
// Same API as the real sound engine. Plain Web Audio, deliberately simple.

let ctx = null;
let bus = null;
let duckGain = null;
let live = new Set();
let turnTimer = null;
let turnResolve = null;

const PENTA = [0, 2, 4, 7, 9];
const D3 = 146.83;

function freqFor(v01) {
  const steps = PENTA.length * 3;
  const i = Math.round(Math.max(0, Math.min(1, v01)) * steps);
  return D3 * 2 ** (Math.floor(i / PENTA.length) + PENTA[i % PENTA.length] / 12);
}

function voice(freq, { dur = 0.5, db = -14, type = "triangle", when = 0, detuneCents = 0 } = {}) {
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detuneCents;
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(10 ** (db / 20), t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(lp).connect(g).connect(duckGain);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  live.add(osc);
  osc.onended = () => live.delete(osc);
}

function crackle(dur = 0.5, db = -30) {
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() < 0.003 ? Math.random() * 2 - 1 : (Math.random() * 2 - 1) * 0.04;
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  g.gain.value = 10 ** (db / 20) * 6;
  src.buffer = buf;
  src.connect(hp).connect(g).connect(duckGain);
  src.start();
  live.add(src);
  src.onended = () => live.delete(src);
}

export async function start() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    duckGain = ctx.createGain();
    bus = ctx.createDynamicsCompressor();
    duckGain.connect(bus).connect(ctx.destination);
    console.info("[sound] Using the interface's sound simulator until engine.js is available.");
  }
  if (ctx.state !== "running") await ctx.resume();
}

export function isRunning() {
  return !!ctx && ctx.state === "running";
}

export async function legend() {
  if (!ctx) return;
  [0, 0.5, 1].forEach((v, i) => voice(freqFor(v), { dur: 0.5, when: i * 0.6 }));
  await new Promise((r) => setTimeout(r, 1900));
}

export function needleDrop() {
  if (!ctx) return;
  voice(180, { dur: 0.09, db: -16, type: "sine" });
  crackle(0.2, -26);
}

export function play(sample) {
  if (!ctx) return;
  if (!sample || sample.nodata || sample.v01 == null) { crackle(); return; }
  voice(freqFor(sample.v01));
}

export function playTurns(samples, opts = {}) {
  if (!ctx) return Promise.resolve();
  const beat = 60 / (opts.bpm || 84);
  stopTurns();
  return new Promise((resolve) => {
    turnResolve = resolve;
    let i = 0;
    const step = () => {
      if (i >= samples.length) { turnTimer = null; turnResolve = null; resolve(); return; }
      play(samples[i]);
      opts.onStep?.(i);
      i += 1;
      turnTimer = setTimeout(step, beat * 1000);
    };
    step();
  });
}

export function compare(a, b) {
  if (!ctx) return;
  if (!a || a.nodata || !b || b.nodata) { crackle(0.8); return; }
  const diff = b.v01 - a.v01;
  const fa = freqFor(a.v01);
  voice(fa, { dur: 1.6, db: -16 });
  if (Math.abs(diff) < 0.08) voice(fa, { dur: 1.6, db: -16, type: "sine", detuneCents: (diff / 0.08) * 30 });
  else voice(freqFor(b.v01), { dur: 1.6, db: -16, type: "sine" });
}

export function duck(ms) {
  if (!ctx) return;
  const t = ctx.currentTime;
  duckGain.gain.cancelScheduledValues(t);
  duckGain.gain.setTargetAtTime(0.25, t, 0.03);
  duckGain.gain.setTargetAtTime(1, t + ms / 1000, 0.12);
}

function stopTurns() {
  if (turnTimer) clearTimeout(turnTimer);
  turnTimer = null;
  if (turnResolve) { const r = turnResolve; turnResolve = null; r(); }
}

export function stop() {
  stopTurns();
  for (const n of live) { try { n.stop(); } catch { /* already stopped */ } }
  live = new Set();
}
