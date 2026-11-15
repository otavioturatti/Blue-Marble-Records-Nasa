// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Otávio.
// The label rules: the synthesized sound of every record that has no music of its own, and the reference sounds of
// all of them (needle drop, dead groove). Owner: Otávio. Used only through web/js/engine.js.
// The engine never speaks and never touches the page (except loading the vendored Tone.js).

import {
  BPM, clamp01, compareTarget, degreeForV01, hitsForV01, midiForV01, midiToFreq,
  modeForRecord, referenceV01, roughness,
} from "./music.js";

const TONE_URL = new URL("../vendor/Tone.js", import.meta.url).href;

// Mix levels in dB.
// The pad is two voices in unison (+6 dB), so its bus sits lower to stay ~10 dB under the melody.
const LEVEL = { melody: -10, percussion: -12, pad: -26, anchor: -20, crackle: -26 };

let T = null;          // window.Tone once loaded
let ready = false;
let mode = "melody";   // "melody" | "anomaly" | "density"
let refV01 = 0.5;
let nodes = null;
let lastDegree = null;
let turnLoop = null;
let turnResolve = null;
let roomy = false;     // the audio context with the larger block was asked for

function loadTone() {
  if (window.Tone) return Promise.resolve(window.Tone);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TONE_URL;
    s.async = true;
    s.onload = () => (window.Tone ? resolve(window.Tone) : reject(new Error("Tone.js did not load")));
    s.onerror = () => reject(new Error("Could not load " + TONE_URL));
    document.head.appendChild(s);
  });
}

function humanize(v = 1) {
  return v * (0.92 + Math.random() * 0.16); // +-8 % velocity
}

function makeCrackleBuffer(seconds = 2) {
  const ctx = T.getContext().rawContext;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const hiss = (Math.random() * 2 - 1) * 0.04;
    const click = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0;
    d[i] = hiss + click;
  }
  return new T.ToneAudioBuffer(buf);
}

async function buildGraph() {
  // Master chain: duck gain -> high-pass 40 Hz -> limiter -1 dB -> speakers.
  const limiter = new T.Limiter(-1).toDestination();
  const highpass = new T.Filter(40, "highpass").connect(limiter);
  const duckGain = new T.Gain(1).connect(highpass);
  const reverb = new T.Reverb({ decay: 2.5, wet: 1 });
  await reverb.generate();
  const reverbSend = new T.Gain(0.25).connect(reverb);
  reverb.connect(duckGain);

  const bus = (level, pan = 0) => {
    const ch = new T.Channel({ volume: level, pan });
    ch.connect(duckGain);
    ch.connect(reverbSend);
    return ch;
  };

  // Melody: soft bell-like FM voice (mono, sustains while the scale degree does not change).
  const melodyBus = bus(LEVEL.melody);
  const melody = new T.FMSynth({
    volume: 12, // the FM voice is ~10 dB quieter than a triangle; calibrated so melody is the loudest layer
    harmonicity: 3, modulationIndex: 2.2,
    oscillator: { type: "sine" }, modulation: { type: "sine" },
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.35, release: 1.2 },
    modulationEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.8 },
  }).connect(melodyBus);

  // Reference pad (anomaly records): two detuned voices; detune grows with roughness.
  const padFilter = new T.Filter(600, "lowpass");
  const padBus = bus(LEVEL.pad);
  padFilter.connect(padBus);
  const padOpts = { oscillator: { type: "triangle" }, envelope: { attack: 1.0, decay: 0.2, sustain: 0.9, release: 2.0 } };
  const padA = new T.Synth(padOpts).connect(padFilter);
  const padB = new T.Synth(padOpts).connect(padFilter); // detuned by roughness: beating grows with |anomaly|

  // Percussion (density records): low membrane + short noise "crackle of fire".
  const percBus = bus(LEVEL.percussion);
  const drum = new T.MembraneSynth({ pitchDecay: 0.03, octaves: 3, envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 } }).connect(percBus);
  const sparkFilter = new T.Filter(2500, "bandpass").connect(percBus);
  const spark = new T.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.06, sustain: 0 } }).connect(sparkFilter);

  // Anchor tick: one soft click per turn so time is audible even when a note sustains.
  const anchorBus = bus(LEVEL.anchor);
  const anchor = new T.MembraneSynth({ pitchDecay: 0.005, octaves: 2, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 } }).connect(anchorBus);

  // Dead groove: vinyl crackle for "no data" (never silence, never a low note).
  const crackleBus = bus(LEVEL.crackle);
  const crackleFilter = new T.Filter(5500, "lowpass").connect(crackleBus);
  const crackleBuffer = makeCrackleBuffer();
  const crackleSources = new Set();

  // Compare: two voices panned left (A, before) and right (B, now).
  const cmpA = new T.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 1.0 } }).connect(bus(LEVEL.melody - 2, -0.6));
  const cmpB = new T.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 1.0 } }).connect(bus(LEVEL.melody - 2, 0.6));

  return { limiter, duckGain, melody, padA, padB, padFilter, drum, spark, anchor, crackleFilter, crackleBuffer, crackleSources, cmpA, cmpB };
}

/** Optional (contract 3): tell the engine which record is playing. Infers the sound mode from meta. */
export function setRecord(meta) {
  mode = modeForRecord(meta);
  refV01 = referenceV01(meta);
  lastDegree = null;
}

export async function start() {
  if (navigator.audioSession) {
    try { navigator.audioSession.type = "playback"; } catch (_) { /* not supported */ }
  }
  T = await loadTone();
  if (!ready && !roomy) {
    // A larger audio block: 120 ms instead of the 10 ms a browser gives by default. Measured in the app on a laptop
    // with integrated graphics: with a small block the sound card was left without audio for a moment whenever the
    // machine was busy (the globe drawing, pictures loading, a virus scan), and the music stuttered. With 60 ms and
    // the picture shown large, the audio clock still lost a quarter of a second over one record; with 120 ms it kept
    // up. It costs about 0.1 s of delay on a reading and on Stop. A browser that does not grant the size keeps its
    // own (a phone may), so nothing may depend on it. The look-ahead of the library stays as it was.
    roomy = true;
    try { T.setContext(new T.Context({ latencyHint: 0.12, lookAhead: 0.1 })); } catch (_) { /* the default context still works */ }
  }
  await T.start();
  if (!ready) {
    nodes = await buildGraph();
    T.getTransport().bpm.value = BPM;
    // Sounds scheduled before the audio clock really runs are lost (measured: the first note after start was silent).
    const ctx = T.getContext();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 60 && ctx.currentTime - t0 < 0.3; i++) await new Promise((r) => setTimeout(r, 25));
    ready = true;
  }
}

export function isRunning() {
  return ready && T && T.getContext().state === "running";
}

/** One-shot burst of vinyl crackle; independent sources so consecutive no-data steps never cut each other. */
function crackleFor(seconds, time) {
  const n = nodes;
  const src = new T.ToneBufferSource({ url: n.crackleBuffer, fadeIn: 0.02, fadeOut: 0.04 }).connect(n.crackleFilter);
  n.crackleSources.add(src);
  src.onended = () => { n.crackleSources.delete(src); src.dispose(); };
  const offset = Math.random() * Math.max(0, n.crackleBuffer.duration - seconds - 0.1);
  src.start(time ?? T.now(), offset, seconds);
}

/** The dead groove for `seconds` from `time`: what "no data" sounds like on every record. */
export function deadGroove(seconds, time) {
  if (ready) crackleFor(seconds, time);
}

/** Sound one value at `time` for `dur` seconds, according to the current mode. */
function voice(sample, time, dur, { sustainSameDegree = false } = {}) {
  const n = nodes;
  if (!sample || sample.nodata || sample.v01 == null) {
    n.melody.triggerRelease(time);
    lastDegree = null;
    crackleFor(dur, time);
    return;
  }
  const v = clamp01(sample.v01);

  if (mode === "density") {
    const hits = hitsForV01(v);
    for (let i = 0; i < hits; i++) {
      const t = time + (i * dur) / Math.max(hits, 1);
      n.drum.triggerAttackRelease("D2", "32n", t, humanize(0.5 + v * 0.5));
      n.spark.triggerAttackRelease("64n", t + 0.01, humanize(0.3 + v * 0.5));
    }
    return;
  }

  if (mode === "anomaly") {
    const r = roughness(v, refV01);
    n.padB.detune.rampTo(r * 30, 0.2, time);               // detune in cents: beating grows with |anomaly|
    n.padFilter.frequency.rampTo(600 + r * 1900, 0.3, time); // filter opens 600 -> 2500 Hz
  }

  const degree = degreeForV01(v);
  if (sustainSameDegree && degree === lastDegree) return;  // same note: keep sounding, no retrigger
  lastDegree = degree;
  n.melody.triggerAttack(midiToFreq(midiForV01(v)), time, humanize(0.8));
  if (!sustainSameDegree) n.melody.triggerRelease(time + dur);
}

function startReferencePad(time) {
  if (mode !== "anomaly") return;
  const f = midiToFreq(midiForV01(refV01));
  nodes.padA.triggerAttack(f, time, 0.7);
  nodes.padB.triggerAttack(f, time, 0.7);
}

function releasePad(time) {
  nodes.padA.triggerRelease(time);
  nodes.padB.triggerRelease(time);
}

export async function legend() {
  if (!ready) return;
  const now = T.now() + 0.05;
  const step = 0.75;
  startReferencePad(now);
  const marks = mode === "density" ? [0.15, 0.5, 1] : [0, refV01, 1];
  marks.forEach((v, i) => voice({ v01: v, nodata: false }, now + i * step, step * 0.85));
  releasePad(now + step * 3);
  await new Promise((r) => setTimeout(r, step * 3 * 1000 + 300));
}

export function needleDrop() {
  if (!ready) return;
  const t = T.now() + 0.01;
  nodes.drum.triggerAttackRelease("D1", "16n", t, 0.6);
  crackleFor(0.25, t);
}

export function play(sample) {
  if (!ready) return;
  const t = T.now() + 0.02;
  startReferencePad(t);
  voice(sample, t, 0.7);
  releasePad(t + 1.2);
}

/** One sample per date ("one turn per day of NASA data"). opts: { bpm, stepsPerBeat, onStep }. */
export function playTurns(samples, opts = {}) {
  if (!ready || !samples || !samples.length) return Promise.resolve();
  reset();
  const transport = T.getTransport();
  transport.bpm.value = opts.bpm || BPM;
  const stepsPerBeat = opts.stepsPerBeat || 2;           // default: one date per eighth note
  const stepSec = 60 / transport.bpm.value / stepsPerBeat;
  let i = 0;
  lastDegree = null;

  return new Promise((resolve) => {
    turnResolve = resolve;
    startReferencePad(T.now() + 0.05);
    turnLoop = new T.Loop((time) => {
      if (i >= samples.length) {
        nodes.melody.triggerRelease(time);
        releasePad(time);
        T.getDraw().schedule(() => { reset(); }, time);
        return;
      }
      nodes.anchor.triggerAttackRelease("D5", "64n", time, 0.6);
      voice(samples[i], time, stepSec, { sustainSameDegree: mode !== "density" });
      const index = i;
      if (opts.onStep) T.getDraw().schedule(() => opts.onStep(index), time);
      i += 1;
    }, stepSec).start(0);
    transport.start("+0.05");
  });
}

/** Two samples together: A left (before), B right (now). Unison if equal, beating if close, interval if far. */
export function compare(a, b) {
  if (!ready) return;
  const n = nodes;
  const t = T.now() + 0.05;
  const dur = 2.6;
  const aOk = a && !a.nodata && a.v01 != null;
  const bOk = b && !b.nodata && b.v01 != null;
  if (!aOk || !bOk) {
    crackleFor(dur, t);
    if (aOk) n.cmpA.triggerAttackRelease(midiToFreq(midiForV01(a.v01)), dur, t, 0.8);
    if (bOk) n.cmpB.triggerAttackRelease(midiToFreq(midiForV01(b.v01)), dur, t, 0.8);
    return;
  }
  if (mode === "density") {
    // Rhythm: A's hits on the left, then B's on the right, then both.
    const hitsA = hitsForV01(a.v01);
    const hitsB = hitsForV01(b.v01);
    const bar = 1.2;
    for (let i = 0; i < hitsA; i++) n.cmpA.triggerAttackRelease("D3", "32n", t + (i * bar) / hitsA, 0.8);
    for (let i = 0; i < hitsB; i++) n.cmpB.triggerAttackRelease("D3", "32n", t + bar + (i * bar) / hitsB, 0.8);
    return;
  }
  const c = compareTarget(a.v01, b.v01);
  n.cmpA.triggerAttackRelease(c.aFreq, dur, t, 0.8);
  n.cmpB.triggerAttackRelease(c.bFreq, dur, t + 0.4, 0.8); // B enters slightly later so both are heard
}

export function duck(ms) {
  if (!ready) return;
  const g = nodes.duckGain.gain;
  const now = T.immediate();                          // T.now() includes ~100 ms look-ahead; ducking must be instant
  g.cancelScheduledValues(now);
  g.setTargetAtTime(0.25, now, 0.03);                 // about -12 dB
  g.setTargetAtTime(1, now + ms / 1000, 0.15);
}

/** Stop scheduled sound and release voices, letting tails ring (internal). */
function reset() {
  if (!ready) return;
  const transport = T.getTransport();
  if (turnLoop) { turnLoop.dispose(); turnLoop = null; }
  transport.stop();
  transport.cancel(0);
  const now = T.now();
  const n = nodes;
  n.melody.triggerRelease(now);
  releasePad(now);
  n.cmpA.triggerRelease(now);
  n.cmpB.triggerRelease(now);
  n.crackleSources.forEach((src) => { try { src.stop(now); } catch (_) { /* already stopped */ } });
  lastDegree = null;
  if (turnResolve) { const r = turnResolve; turnResolve = null; r(); }
}

/** Stop everything immediately (Esc): hard mute so a screen reader can be heard at once, then reset. */
export function stop() {
  if (!ready) return;
  const g = nodes.duckGain.gain;
  const now = T.immediate();          // not T.now(): that adds ~100 ms look-ahead
  g.cancelScheduledValues(now);
  g.setTargetAtTime(0, now, 0.012);   // silent within ~50 ms, tails included
  g.setTargetAtTime(1, now + 0.4, 0.03);
  reset();
}

/** Debug helper for the dev test page: current output level in dB. */
export function _debugLevel() {
  if (!ready) return -Infinity;
  if (!nodes.meter) { nodes.meter = new T.Meter({ smoothing: 0 }); nodes.limiter.connect(nodes.meter); }
  return nodes.meter.getValue();
}

/** Debug helper for the dev test page: internal nodes (do not use in the app). */
export function _debugNodes() {
  return nodes;
}
