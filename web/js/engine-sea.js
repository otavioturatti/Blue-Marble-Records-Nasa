// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Otávio.
// The music of the sea surface temperature record. Owner: Otávio. Used only through web/js/engine.js.
//
// Nothing here is a recorded song. The only recordings are single notes and single gestures of real instruments (CC0
// libraries, see web/vendor/samples/README.md). Every chord, pattern and melody is decided while it plays, from the
// values of the record:
//   - a value is an anomaly: how far the water is from normal (the middle of the color scale), and to which side;
//   - the distance from normal sets a tension (3 x the distance to the power 0.75, so half a degree is already heard).
//     The tension chooses the chord, how dense the picking is, the weight of piano, bass and low strings, the size of
//     the waves and how loud everyone plays;
//   - the side chooses the colour. Warm water is bright: Lydian and augmented chords, the tune up high, a glockenspiel
//     on top of it, wine glasses, tremolo violins up high. Cold water is dark: minor and Phrygian chords, the tune an
//     octave lower, a horn, the tremolo violins down low;
//   - the place (its cell on the map) chooses the key, the tempo, the opening pattern and the woodwind (clarinet,
//     ocarina or flute) that takes the tune every other phrase; the other phrases belong to the vibraphone;
//   - each date lasts one bar;
//   - the harp is kept for one thing only. When the temperature has moved at least three quarters of a degree it runs
//     up (warmer) or down (colder), one note per half degree, ending on the note of the new level, while everyone else
//     leaves the way clear. A bell marks normal whenever the run starts at, ends at or passes through it. A record opens
//     with that run, from normal to where its data start. A harp line going up or down never means anything else;
//   - the sea itself is played by instruments: an ocean drum far away, cymbal swells that break on the first beat of a
//     bar (bigger and more often the further the water is from normal), a rubbed cabasa as the foam, wind chimes when
//     a date jumps a degree or more.
// The same data always gives the same music (seeded random streams).

let T = null;                                 // Tone, handed over by engine.js
let BPM = 63;
const OPEN = [40, 45, 50, 55, 59, 64];        // the six strings of the picking patterns (guitar tuning): E2 A2 D3 G3 B3 E4

// ---------- a random generator with a seed: the same data always sounds the same ----------
let seedState = 1;
function reseed(n) { seedState = n >>> 0; }
function rnd() { seedState = (seedState + 0x6D2B79F5) >>> 0; let t = seedState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

// A second stream for the way of playing (small delays and accents), so that it never changes the notes themselves.
let seedB = 1;
function reseedB(n) { seedB = n >>> 0; }
function jit() { seedB = (seedB + 0x6D2B79F5) >>> 0; let t = seedB; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

// ---------- each place has its own key and its own way ----------
// The temperature decides the tension and the colour. The place decides the key (the same chord shapes, some frets
// higher), the tempo, the pattern that opens each phrase, a taste for some chords, the woodwind and the seed. All of
// it comes from the cell of the place on the 1 degree map, so a place always sounds like itself.
let capo = 0;
const SALT = 6073;
const HOME_CALM = [0, 2, 3, 4];               // which pattern opens the phrases
const pers = { seed: 20261114, capo: 0, bpm: 63, homeCalm: 0, homeTight: 0, bias: {}, drum: "frame" };
function hash32(n) { let t = (n + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; }
function setPersonality(row, col) {
  const cell = row * 360 + col;
  let h = hash32(cell + SALT);
  const next = () => { h = hash32(h); return h / 4294967296; };
  pers.seed = hash32(cell * 7919 + 13);
  pers.capo = Math.floor(next() * 6);                                   // D, E flat, E, F, F sharp or G
  pers.bpm = [59, 61, 63, 65, 67][Math.floor(next() * 5)];
  pers.homeCalm = HOME_CALM[Math.floor(next() * 4)];
  pers.homeTight = Math.floor(next() * 2);
  pers.bias = {};
  for (const c of CHORDS) pers.bias[c.name] = (next() - 0.5) * 1.0;     // a taste for some chords, never stronger than the tension
  capo = pers.capo; BPM = pers.bpm;
}

// ---------- the chords ----------
// Guitar shapes: fret on each string (6th to 1st, null = not played). Every one keeps an open string in the bass
// (the D, or the A for the A chords), and the three treble strings move by one or two frets from one chord to the next.
// "tau" = how tense the chord is, from 0 (peace) to 3 (anguish).
const N = null;
const CHORDS = [
  { name: "D", tau: 0.0, frets: [N, 0, 0, 2, 3, 2], home: "major" },
  { name: "Dsus2", tau: 0.0, frets: [N, 0, 0, 2, 3, 0] },
  { name: "Dmaj7", tau: 0.0, frets: [N, 0, 0, 2, 2, 2] },
  { name: "D6", tau: 0.1, frets: [N, 0, 0, 2, 0, 2] },
  { name: "G/D", tau: 0.1, frets: [N, N, 0, 4, 3, 3] },
  { name: "Gmaj7/D", tau: 0.2, frets: [N, N, 0, 4, 3, 2] },
  { name: "A/D", tau: 0.2, frets: [N, 0, 0, 2, 2, 0] },
  { name: "Dsus4", tau: 0.6, frets: [N, 0, 0, 2, 3, 3] },
  { name: "D7", tau: 0.8, frets: [N, 0, 0, 2, 1, 2], side: "cold" },
  { name: "A7sus4", tau: 0.8, frets: [N, 0, 2, 0, 3, 0], bassA: true },
  { name: "A7", tau: 0.9, frets: [N, 0, 2, 0, 2, 0], bassA: true },
  { name: "D7sus4", tau: 1.0, frets: [N, 0, 0, 2, 1, 3], side: "cold" },
  { name: "Gm/D", tau: 1.2, frets: [N, N, 0, 3, 3, 3], side: "cold" },
  { name: "Dm", tau: 1.3, frets: [N, 0, 0, 2, 3, 1], home: "minor", side: "cold" },
  { name: "Bb/D", tau: 1.4, frets: [N, N, 0, 3, 3, 1], side: "cold" },
  { name: "Dm7", tau: 1.4, frets: [N, 0, 0, 2, 1, 1], side: "cold" },
  { name: "Gm6/D", tau: 1.5, frets: [N, N, 0, 3, 3, 0], side: "cold" },
  { name: "Dm6", tau: 1.8, frets: [N, 0, 0, 2, 0, 1], side: "cold" },
  { name: "Dm(maj7)", tau: 1.9, frets: [N, 0, 0, 2, 2, 1], side: "cold" },
  { name: "A7(b13)", tau: 2.0, frets: [N, 0, 2, 0, 2, 1], bassA: true, side: "cold" },
  { name: "Bb7/D", tau: 2.2, frets: [N, N, 0, 1, 3, 1], side: "cold" },
  { name: "A7(b9)", tau: 2.2, frets: [N, 0, 2, 3, 2, 3], bassA: true, side: "cold" },
  { name: "C#°/D", tau: 2.6, frets: [N, N, 0, 3, 2, 3], side: "cold" },
  { name: "Eb/D", tau: 2.8, frets: [N, N, 0, 3, 4, 3], side: "cold" },
  { name: "D°", tau: 3.0, frets: [N, N, 0, 1, 0, 1], side: "cold" },
  // the warm side: the water heats. Bright and without ground: Lydian, then augmented, then whole tones
  { name: "D6/9", tau: 0.5, frets: [N, 0, 0, 2, 0, 0], side: "warm" },
  { name: "E/D", tau: 0.8, frets: [N, N, 0, 1, 0, 0], side: "warm" },
  { name: "Dmaj7(#11)", tau: 1.2, frets: [N, N, 0, 1, 2, 2], home: "lydian", side: "warm" },
  { name: "E7/D", tau: 1.5, frets: [N, N, 0, 1, 3, 0], side: "warm" },
  { name: "D7(#11)", tau: 1.8, frets: [N, N, 0, 1, 1, 2], side: "warm" },
  { name: "Daug", tau: 2.1, frets: [N, N, 0, 3, 3, 2], side: "warm" },
  { name: "Dmaj7(#5)", tau: 2.4, frets: [N, N, 0, 3, 2, 2], side: "warm" },
  { name: "D9(#5)", tau: 2.7, frets: [N, N, 0, 3, 1, 0], side: "warm" },
  { name: "E+/D", tau: 3.0, frets: [N, N, 0, 1, 1, 0], side: "warm" },
];
function pcsOf(ch) { const out = []; ch.frets.forEach((fr, s) => { if (fr != null) out.push((OPEN[s] + fr + capo) % 12); }); return out; }
function trebleMove(a, b) { let m = 0; for (const s of [3, 4, 5]) m += Math.abs(a.frets[s] - b.frets[s]); return m; }

// The tension chooses the chord of each bar. It wants: a chord as tense as the water asks, fingers that move little,
// no chord repeated soon, and a breath every four bars (home on the first bar of a phrase, while there is a home to go to).
function chooseChord(st) {
  let best = null, bestScore = -1e9;
  for (const c of CHORDS) {
    if (c.side && c.side !== st.side) continue;            // the dark chords belong to cold water, the bright unstable ones to warm water
    let sc = -2.0 * Math.abs(c.tau - st.tension);
    if (st.chord) sc -= 0.25 * trebleMove(st.chord, c);
    const ago = st.recent.indexOf(c.name);
    if (ago === 0) sc -= 3.0; else if (ago === 1) sc -= 1.5; else if (ago >= 2) sc -= 0.7;
    if (st.bar % 4 === 0 && st.tension < 2.2 && c.home === (st.tension < 1.05 ? "major" : st.side === "warm" ? "lydian" : "minor")) sc += 1.6;
    if (st.bar % 4 === 3 && c.bassA && st.tension > 0.5 && st.tension < 2.4) sc += 0.9;
    sc += (rnd() - 0.5) * 0.5 + (pers.bias[c.name] || 0);
    if (sc > bestScore) { bestScore = sc; best = c; }
  }
  return best;
}

// ---------- state of the music ----------
const st = { tension: 0, chord: null, recent: [], bar: 0, mel: 78, plan: [], lastHarp: [], smoke: 0, duoLevel: 2, duoSteps: [], lead: [], pat: [], side: "", temp: 0, lvl: null, run: null, runFirst: 99, quietFrom: 99, said: 0 };
const layers = { gtr: true, harp: true, acc: true, flute: true, piano: true, perc: true, bass: true };   // every voice is on; the switches are kept for listening tests
// 15 Nov: the waves (the cymbal swells that break on a bar, the foam, the chimes) and the cymbal swell at a rise of
// tension are off: listeners heard them as sound effects of the picture, not as music. Set wavesOn and swellsOn back
// to true to restore them.
const swellsOn = false;
const surfOn = true, wavesOn = false, glassOn = true;                                                      // the same for the sea, the waves and the long high notes
let SCENE = [];               // the record being played: one value per date, from -1 (4 degrees below normal) to +1 (4 degrees above)
let GAP = [];                 // dates without data: the band rests and the dead groove sounds
let count = 0;
let loop = null;
const journal = [];           // what was played, bar by bar: for checking that the same data gives the same music

// ---------- the mix ----------
// Level (dB), reverb send and pan of each voice, set by ear and by measurement.
// gtr = the picked patterns (marimba under the thumb, kalimba under the fingers), duo = the mbira that answers them,
// lead = the tune, vib = the vibraphone's melody, acc = the cellos, glass = wine glasses, tremolo violins and horn,
// sea = the instruments that play the water.
const BUS = {
  gtr: { db: -3, send: 0.3, pan: -0.1 }, duo: { db: -3, send: 0.2, pan: 0.32 }, lead: { db: 1, send: 0.38, pan: 0.04 },
  harp: { db: -2, send: 0.3, pan: 0 }, acc: { db: -4.5, send: 0.2, pan: 0 }, flute: { db: 2, send: 0.35, pan: 0 },
  piano: { db: -5, send: 0.2, pan: -0.06 }, perc: { db: 0, send: 0.14, pan: 0 }, bass: { db: -4, send: 0.08, pan: 0 },
  vib: { db: -7, send: 0.34, pan: 0.08 }, sea: { db: 3, send: 0.22, pan: 0 }, glass: { db: 0, send: 0.4, pan: -0.1 },
};
const LIMITER = { threshold: -3, ratio: 20, knee: 0, attack: 0.001, release: 0.12 };   // a real ceiling
const TRIM_DB = -1;                           // after the limiter: peaks stay under -1 dBFS
const TENSION_RIDE = { flute: 1, harp: 1, vib: 1 };   // dB per point of tension above 1 (at most 2 points): the melody keeps its place over a denser band
const RIDE_TAU = 0.3;                         // seconds: every move glides, nothing jumps
const fx = {};                // per voice: { n (level), ride (slow moves), place (pan), s (reverb send) }
let g = null;                 // where each voice plugs in
let dyn = null;               // the dynamics of the whole music: { gain, tone }
let duckGain = null;          // lowered while the screen reader speaks
let revRet = null;            // the return of the reverb, closed for a moment when everything must stop
let meter = null;

// ---------- the instruments of the sea ----------
const KAL_GAIN = 1.25, MAR_GAIN = 1.25, MBIRA_GAIN = 2.5;        // kalimba, marimba and mbira: set by measurement against the picked guitar of the fire record
const GLOCK_GAIN = 0.5, TREM_GAIN = 0.22, HORN_GAIN = 0.3;       // glockenspiel, tremolo violins, horn
const PIANO_CHORDS = false;                                      // the piano keeps only its low octave: the strings carry the harmony
const LADDER_GAIN = 1.5;                                         // the ladder is the one voice that must never be covered
let kalSet = null, marSet = null, mbiraSet = null, vibSet = null, glassSet = null, glockSet = null, tremSet = null, hornSet = null, celloSet = null;

// ---------- the dynamics of each instrument ----------
// Each instrument has its own way of growing. Nothing goes above the balance set by ear: from tension 2 up every
// instrument is exactly at its level in the table above.
const INST_DYN = { piano: -2.5, bass: -1.5, perc: -3 };          // dB in full calm: the weight stays in the background
const SOLO_ARC = [-1.0, -0.5, 0, -1.2];                           // dB: the tune's idea, sequence, climb and resolution
const FLUTE_BREATH = 1.5;                                         // dB: how much a long note of the flutes blooms and lets go
function calmNow() { return 1 - Math.min(1, st.tension / 2); }    // 1 in full calm, 0 from tension 2 up
function instDb(name, bar) {
  let d = (INST_DYN[name] || 0) * calmNow();
  if (name === "lead") d += st.solo ? SOLO_ARC[bar % 4] : SOLO_ARC[0];
  return d;
}
// The picking's own dynamics are in the fingers: lighter (softer and darker) in the calm, full force from tension 2 up.
function gtrForce() { return 1 - 0.14 * calmNow(); }
// The slow moves of the mix, decided once per bar.
function mixBar(bar, time) {
  const stepSec = 60 / BPM / 4, barSec = 8 * stepSec;
  const up = Math.min(2, Math.max(0, st.tension - 1));
  for (const name of Object.keys(fx)) {
    const db = (TENSION_RIDE[name] || 0) * up + instDb(name, bar);
    if (name === "flute") {
      // the flutes breathe: each long note blooms to the middle of the bar and lets go
      fx.flute.ride.gain.setTargetAtTime(T.dbToGain(db), time, barSec * 0.18);
      fx.flute.ride.gain.setTargetAtTime(T.dbToGain(db - FLUTE_BREATH), time + barSec * 0.6, barSec * 0.15);
      continue;
    }
    fx[name].ride.gain.setTargetAtTime(T.dbToGain(db), time, RIDE_TAU);
  }
}
// ---------- the dynamics: the volume of the whole music ----------
// All of it comes from the data and the phrase: the whole band plays softer near normal and grows with the distance
// from it; each phrase of four bars swells to its third bar and lets go; and the level never jumps: within each bar it
// glides to where the next bar will be. It only ever lowers: the furthest from normal is as loud as the mix allows.
// A soft treble shelf moves with the level, because softer is also darker on real instruments.
const DYN_RANGE = 6;                                              // dB between the softest calm and the top of the scale
const PHRASE_ARC = [-1.0, -0.5, 0, -0.7];                         // dB at the start of each bar of a phrase
function dynDb(tension, bar) {
  return -DYN_RANGE * (1 - Math.pow(Math.max(0, Math.min(1, tension / 3)), 0.7)) + PHRASE_ARC[bar % 4] * DYN_RANGE / 6;
}
function dynBar(bar, time) {
  const barSec = 60 / BPM * 2;
  // where the next bar will be: the same rule the tension follows
  const want = 3 * Math.sqrt(magAt(bar + 1)), next = st.tension + (want - st.tension) * (want > st.tension ? 0.55 : 0.35);
  const now = dynDb(st.tension, bar), then = dynDb(next, bar + 1);
  if (bar === 0) {
    dyn.gain.gain.cancelScheduledValues(time); dyn.tone.gain.cancelScheduledValues(time);
    dyn.gain.gain.setValueAtTime(T.dbToGain(now), time); dyn.tone.gain.setValueAtTime(now * 0.5, time);
  }
  dyn.gain.gain.linearRampTo(T.dbToGain(then), barSec, time);
  dyn.tone.gain.linearRampTo(then * 0.5, barSec, time);
  st.dynNow = Math.round(now * 10) / 10;
}
function mixRest(time) { for (const name of Object.keys(fx)) { fx[name].ride.gain.cancelScheduledValues(time); fx[name].ride.gain.setTargetAtTime(1, time, RIDE_TAU); } }

// ---------- audio: the chain and the recordings ----------
let built = false, ready = false, loading = null, graph = null;
let harpSet = null;
const voice = [null, null, null, null, null, null];   // what rings on each string of the picking
const duetOn = true;                    // the mbira that answers the kalimba
const stats = { duo: 0, flute: 0, lead: 0, miss: 0, piano: 0, picks: 0, cello: 0, perc: 0, bass: 0, runs: 0, pad: 0, glass: 0, waves: 0 };
const BASE = new URL("../vendor/samples/", import.meta.url).href;

// A download that fails is tried again (a slow or busy connection must not leave the record without its instruments).
async function retry(load) {
  for (let i = 0; ; i++) {
    try { return await load(); } catch (err) { if (i >= 3) throw err; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
}
function loadJson(path) { return retry(async () => { const r = await fetch(BASE + path); if (!r.ok) throw new Error("could not load " + path); return r.json(); }); }
function loadBuffer(path) { return retry(() => T.ToneAudioBuffer.fromUrl(BASE + path)); }
async function loadSet(dir) {
  const list = await loadJson(dir + "/manifest.json");
  const set = await Promise.all(list.map(async (it) => ({ midi: it.midi, centsOff: it.centsOff || 0, loopStart: it.loopStart || 0, loopEnd: it.loopEnd || 0, levelDbA: it.levelDbA, buffer: await loadBuffer(dir + "/" + it.file) })));
  return set.sort((a, b) => a.midi - b.midi);
}

async function buildGraph(destination) {
  // every voice -> its bus -> mix -> limiter -> trim -> dynamics (tone, gain) -> duck -> out
  duckGain = new T.Gain(1).connect(destination || T.getDestination());
  const dynGain = new T.Gain(1).connect(duckGain);
  const dynTone = new T.Filter({ type: "highshelf", frequency: 3200, gain: 0 }).connect(dynGain);
  dyn = { tone: dynTone, gain: dynGain };
  meter = new T.Meter({ smoothing: 0.5 }); duckGain.connect(meter);
  const trim = new T.Gain(T.dbToGain(TRIM_DB)).connect(dynTone);
  const limiter = new T.Compressor(LIMITER).connect(trim);
  const mix = new T.Gain(1).connect(limiter);
  // The browser's compressor is born with its gain closed and takes a tenth of a second to open on the first sound it gets:
  // without this, the first note is swallowed. One second of a tone nobody can hear opens it.
  const wake = new T.Oscillator(25, "sine").connect(new T.Gain(0.0002).connect(limiter)); wake.start(); wake.stop("+1");
  const reverb = new T.Reverb({ decay: 2.5, preDelay: 0.03, wet: 1 });      // a soft room
  await reverb.generate();
  // The room is mono and short. Measured on a laptop: the reverb was half of the work of the audio thread (49 of
  // 96 ms per second of music on the sea record), a stereo room is two convolutions where a mono one is one, and the
  // work follows the length of the room (3.8 s before). The price: the music is narrower on headphones.
  // A phone speaker is mono anyway. `_convolver` is the library's own node (the library is vendored, so it stays).
  try {
    const room = reverb._convolver.buffer, one = T.getContext().createBuffer(1, room.length, room.sampleRate);
    one.copyToChannel(room.getChannelData(0), 0);
    reverb._convolver.buffer = one;
  } catch (_) { /* the stereo room still works */ }
  revRet = new T.Gain(1).connect(mix); reverb.connect(revRet);
  g = {};
  for (const name of Object.keys(BUS)) {
    const o = BUS[name];
    const place = new T.Panner(o.pan).connect(mix);
    const ride = new T.Gain(1).connect(place);                 // the slow moves of the mix
    const s = new T.Gain(o.send).connect(reverb); ride.connect(s);
    const n = new T.Gain(T.dbToGain(o.db)).connect(ride);
    fx[name] = { n, ride, place, s };
    g[name] = new T.Gain(1).connect(n);                        // what is ringing can be let go at once by swapping this node
  }
  built = true;
}

const PERC_USED = ["triangle|open", "cymbal|swell", "timpani|soft", "bells|soft"];      // the sea has no drum kit
async function loadAll() {
  const [harp, vibraphone, glockenspiel, kalimba, marimba, mbira, clarinet, ocarina, flute, recorder, cello, violins, horn, glasses, piano, bass1, bass2, pm, wm] = await Promise.all([
    loadSet("harp"), loadSet("vibraphone"), loadSet("glockenspiel"), loadSet("kalimba"), loadSet("marimba"), loadSet("mbira"), loadSet("clarinet"), loadSet("ocarina"),
    loadSet("flute"), loadSet("recorder"), loadSet("cello"), loadSet("violins"), loadSet("horn"), loadSet("glasses"), loadSet("piano"), loadSet("bass"), loadSet("bass2"),
    loadJson("perc/manifest.json"), loadJson("sea/manifest.json"),
  ]);
  harpSet = harp; vibSet = vibraphone; glockSet = glockenspiel; kalSet = kalimba; marSet = marimba; mbiraSet = mbira;
  celloSet = cello; tremSet = violins; hornSet = horn; glassSet = glasses;
  fluteSets.a = flute; fluteSets.b = recorder; pianoSet = piano; bassSets.push(bass1, bass2);
  // percussion: every recording of the strokes the sea uses, sorted from soft to loud
  const hits = await Promise.all(pm.filter((it) => PERC_USED.includes(it.inst + "|" + it.stroke)).map(async (it) => ({ key: it.inst + "|" + it.stroke, peakDb: it.peakDb, attack: (it.attackMs || 0) / 1000, pitchHz: it.pitchHz || 0, midi: it.midi, centsOff: it.centsOff || 0, peakAt: it.peakAtSec || 0, buffer: await loadBuffer("perc/" + it.file) })));
  for (const h of hits) (percSets[h.key] = percSets[h.key] || []).push(h);
  for (const k of Object.keys(percSets)) {
    percSets[k].sort((a, b) => a.peakDb - b.peakDb);
    const hz = percSets[k].map((x) => x.pitchHz).filter(Boolean).sort((a, b) => a - b);
    percPitch[k] = hz.length ? hz[Math.floor(hz.length / 2)] : 0;
  }
  // the instruments that play the water: "instrument|gesture" -> its recordings
  const waves = await Promise.all(wm.map(async (it) => Object.assign({}, it, { buffer: await loadBuffer("sea/" + it.file) })));
  for (const w of waves) (waveSets[w.inst + "|" + w.gesture] = waveSets[w.inst + "|" + w.gesture] || []).push(w);
  soloSets.celesta = vibSet; soloSets.clarinet = clarinet; soloSets.ocarina = ocarina; soloSets.flute = flute;
  ready = true;
}

// ---------- a note is two plain audio nodes ----------
// Every note is one recording through its own volume. The library has objects for both (ToneBufferSource and Gain),
// convenient and heavy to build: four audio nodes and a dozen objects per note. Measured in the app with the main
// thread slowed four times (a weak phone), a third of the time of the page went into building notes, and they reached
// the audio clock late. These two do only what the notes here need, on the same audio nodes the library would create
// and with the same calls, so the sound is the same.
class NoteGain {
  constructor(value) {
    this.node = T.getContext().createGain();
    this.gain = this.node.gain;
    if (value !== 1) this.gain.setValueAtTime(value, 0);
  }
  connect(to) { T.connect(this.node, to); return this; }
  dispose() { this.node.disconnect(); }
}
class NoteSource {
  constructor(o) {
    const n = this.node = T.getContext().createBufferSource();
    n.buffer = o.url.get ? o.url.get() : o.url;
    if (o.playbackRate != null && o.playbackRate !== 1) n.playbackRate.setValueAtTime(o.playbackRate, 0);
    if (o.loop) { n.loop = true; n.loopStart = o.loopStart || 0; n.loopEnd = o.loopEnd || n.buffer.duration; }
    this.onended = null;
    n.onended = () => { const done = this.onended; this.onended = null; if (done) done(); };
  }
  connect(to) { T.connect(this.node, to instanceof NoteGain ? to.node : to); return this; }
  // `seconds` is how long it plays: it is stopped then, as the library does
  start(time, offset, seconds) { this.node.start(time, offset || 0); if (seconds != null) this.node.stop(time + Math.max(0, seconds)); return this; }
  stop(time) { this.node.stop(time); return this; }
  dispose() { this.node.onended = null; this.node.disconnect(); }
}

function nearest(set, midi) { let b = set[0]; for (const x of set) if (Math.abs(x.midi - midi) < Math.abs(b.midi - midi)) b = x; return b; }

// One string holds one note: a new note takes the string, the other strings keep ringing.
function damp(str, time) {
  const v = voice[str];
  if (!v || v.end <= time) return;
  v.env.gain.cancelScheduledValues(time);
  v.env.gain.setValueAtTime(v.vel, time);
  v.env.gain.linearRampToValueAtTime(0, time + 0.035);
  v.src.stop(time + 0.05);                  // silent from here on: let the recording go
  v.end = time;
}
function pick(str, fret, time, vel) {
  vel *= gtrForce();
  // the notes a guitar would play: the thumb's go to the marimba, the three fingers' to the kalimba
  const low = str <= 2;
  const set = low ? marSet : kalSet, midi = OPEN[str] + (fret || 0) + capo;
  if (!set || !layers.gtr) return;
  const take = nearest(set, midi);
  vel *= low ? MAR_GAIN : KAL_GAIN;
  damp(str, time);
  const env = new NoteGain(vel).connect(g.gtr);
  const src = new NoteSource({ url: take.buffer, playbackRate: Math.pow(2, (midi - take.midi) / 12 + ((touchOn ? (rt() - 0.5) * 7 : 0) - take.centsOff) / 1200) });
  if (touchOn) {
    // a softer pluck is darker and an accent is brighter, as on the instrument: before, force only changed the volume
    const tone = T.getContext().createBiquadFilter();        // one plain filter (the library's own is a dozen audio nodes for every note)
    tone.type = "lowpass"; tone.frequency.value = Math.min(15000, 1700 * Math.pow(2, 3.3 * Math.min(1, vel))); tone.Q.value = 0.4;
    T.connect(tone, env.node);
    src.connect(tone);
    src.onended = () => { src.dispose(); tone.disconnect(); env.dispose(); };
  } else {
    src.connect(env);
    src.onended = () => { src.dispose(); env.dispose(); };
  }
  src.start(time);
  stats.picks++;
  voice[str] = { env, vel, fret, src, end: time + take.buffer.duration };
}
// The second voice: company. It answers the index and the middle finger an octave above, a moment later, softer, a
// little to the right.
const duoVoice = { i: null, m: null };
// Where a second guitar would find the octave (it tells when the answering note changes): on the 2nd string when the fret exists, else on the 1st; above the 12th fret, nothing.
function duoSpot(finger, ch) {
  if (finger === "i") { const f = ch.frets[3] + 8 + capo; return f <= 12 ? [4, f] : [5, ch.frets[3] + 3 + capo]; }
  const f = ch.frets[4] + 7 + capo;
  return f <= 12 ? [5, f] : null;
}
function duoFret(finger, ch) { const sp = duoSpot(finger, ch); return sp ? sp[0] * 100 + sp[1] : -1; }
function dampDuo(finger, time) {
  const v = duoVoice[finger];
  if (!v || v.end <= time) return;
  v.env.gain.cancelScheduledValues(time);
  v.env.gain.setValueAtTime(v.vel, time);
  v.env.gain.linearRampToValueAtTime(0, time + 0.035);
  v.src.stop(time + 0.05);                  // silent from here on: let the recording go
  v.end = time;
}
function partner(finger, ch, time, vel) {
  // the second voice answers the index and the middle finger: the mbira, an octave above the kalimba
  const set = mbiraSet;
  const fret = duoFret(finger, ch), midi = (finger === "i" ? OPEN[3] + ch.frets[3] : OPEN[4] + ch.frets[4]) + 12 + capo;
  if (!set) return;
  const take = nearest(set, midi);
  vel *= MBIRA_GAIN;
  dampDuo(finger, time);
  const env = new NoteGain(vel).connect(g.duo);
  const src = new NoteSource({ url: take.buffer, playbackRate: Math.pow(2, (midi - take.midi) / 12 - take.centsOff / 1200) }).connect(env);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time);
  duoVoice[finger] = { env, vel, fret, src, end: time + take.buffer.duration };
  stats.duo++;
}
function harp(midi, time, vel, ring) {
  if (!layers.harp) return;
  const b = nearest(harpSet, midi);
  const hold = ring || 1.6;
  const env = new NoteGain(vel).connect(g.harp);
  const src = new NoteSource({ url: b.buffer, playbackRate: Math.pow(2, (midi - b.midi) / 12 - b.centsOff / 1200) }).connect(env);
  env.gain.setValueAtTime(vel, time + hold);
  env.gain.linearRampToValueAtTime(0, time + hold + 1.0);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time, 0, hold + 1.1);
}
// The vibraphone sings the melody: soft mallets, the pedal down, each note left to ring.
function vib(midi, time, vel, ring) {
  if (!layers.harp || !vibSet) return;
  const b = nearest(vibSet, midi);
  const hold = (ring || 1.6) * 1.25;
  const env = new NoteGain(vel).connect(g.vib);
  const src = new NoteSource({ url: b.buffer, playbackRate: Math.pow(2, (midi - b.midi) / 12 - b.centsOff / 1200) }).connect(env);
  env.gain.setValueAtTime(vel, time + hold);
  env.gain.linearRampToValueAtTime(0, time + hold + 1.3);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time, 0, hold + 1.4);
}
// The glockenspiel: the sparkle on top of the vibraphone.
function glock(midi, time, vel) {
  if (!glockSet) return;
  const b = nearest(glockSet, midi);
  const env = new NoteGain(vel).connect(g.lead);
  const src = new NoteSource({ url: b.buffer, playbackRate: Math.pow(2, (midi - b.midi) / 12 - b.centsOff / 1200) }).connect(env);
  env.gain.setValueAtTime(vel, time + 1.2);
  env.gain.linearRampToValueAtTime(0, time + 2.2);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time, 0, 2.3);
}
// A long note that swells in and out (the violins in tremolo, the horn): the same breath as the glasses.
function padNote(set, midi, time, seconds, vel) {
  const b = nearest(set, midi);
  const env = new NoteGain(0).connect(g.glass);
  const src = new NoteSource({ url: b.buffer, playbackRate: Math.pow(2, (midi - b.midi) / 12 - b.centsOff / 1200), loop: b.loopEnd > b.loopStart, loopStart: b.loopStart, loopEnd: b.loopEnd }).connect(env);
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(vel, time + seconds * 0.5);
  env.gain.linearRampToValueAtTime(vel * 0.75, time + seconds);
  env.gain.linearRampToValueAtTime(0, time + seconds + 1.0);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time, 0, seconds + 1.1);
  stats.pad = (stats.pad || 0) + 1;
}
// The wine glasses hold one long note: a rubbed rim, slowly in and slowly out, like light on the water.
function glass(midi, time, seconds, vel) {
  if (!glassOn || !glassSet) return;
  const b = nearest(glassSet, midi);
  const env = new NoteGain(0).connect(g.glass);
  const src = new NoteSource({ url: b.buffer, playbackRate: Math.pow(2, (midi - b.midi) / 12 - b.centsOff / 1200), loop: b.loopEnd > b.loopStart, loopStart: b.loopStart, loopEnd: b.loopEnd }).connect(env);
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(vel, time + seconds * 0.45);
  env.gain.linearRampToValueAtTime(vel * 0.7, time + seconds);
  env.gain.linearRampToValueAtTime(0, time + seconds + 0.9);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time, 0, seconds + 1.0);
  stats.glass = (stats.glass || 0) + 1;
}

// ---------- the sea itself: recorded instruments that sound like water ----------
// An ocean drum (beads rolling inside a drum), soft cymbal rolls and swells, a rubbed cabasa, wind chimes. Nothing is
// synthesized. A distant surf sounds all the time; waves break on the first beat of a bar, bigger and more often the
// further the water is from normal.
const waveSets = {};                    // "instrument|gesture" -> recordings
const waveLast = {};
const waveLive = new Set();
const SURF_GAIN = 0.3, WAVE_GAIN = 0.14;      // set by measurement: the surf well under the band, a wave about as loud as the melody
function waveTake(keys) {
  for (const k of keys) {
    const list = waveSets[k];
    if (!list || !list.length) continue;
    let i = Math.floor(rp() * list.length);
    if (list.length > 1 && i === waveLast[k]) i = (i + 1) % list.length;         // never the same recording twice in a row
    waveLast[k] = i;
    return list[i];
  }
  return null;
}
function wavePlay(tk, start, gain, pan, fadeIn, hold) {
  const place = new T.Panner(pan || 0).connect(g.sea);
  const env = new NoteGain(0).connect(place);
  const looped = hold && tk.loopEnd > tk.loopStart;                      // a wash with a loop lasts as long as it is asked to
  const src = new NoteSource({ url: tk.buffer, loop: !!looped, loopStart: tk.loopStart || 0, loopEnd: tk.loopEnd || 0 }).connect(env);
  const t0 = Math.max(T.now() + 0.01, start), len = looped ? hold : Math.min(tk.buffer.duration, hold || 99);
  env.gain.setValueAtTime(fadeIn ? 0 : gain, t0);
  if (fadeIn) env.gain.linearRampToValueAtTime(gain, t0 + fadeIn);
  env.gain.setValueAtTime(gain, t0 + Math.max(fadeIn || 0, len - 1.2));
  env.gain.linearRampToValueAtTime(0, t0 + len);
  waveLive.add(env);
  src.onended = () => { waveLive.delete(env); src.dispose(); env.dispose(); place.dispose(); };
  src.start(t0, 0, len + 0.05);
  stats.waves = (stats.waves || 0) + 1;
}
function wavesOff(time) { for (const e of waveLive) { e.gain.cancelScheduledValues(time); e.gain.setTargetAtTime(0, time, 0.1); } }
function planWaves(bar, time) {
  st.waveNow = "";
  const t = st.tension, barSec = 60 / BPM * 2, inPhrase = bar % 4;
  // the distant surf: the ocean drum, one long wash per phrase, each one fading in under the tail of the one before
  if (surfOn && inPhrase === 0) {
    const wash = waveTake(["oceandrum|wash"]);
    if (wash) { wavePlay(wash, time, SURF_GAIN * (1 + 0.35 * t), (rp() - 0.5) * 0.5, 1.6, barSec * 4 + 1.3); st.waveNow = "surf"; }
  }
  if (!wavesOn) return;
  // A wave: a soft cymbal swell whose loudest point falls on the first beat of a bar, two bars from now (it needs that
  // long to arrive). Calm sea: one small wave per phrase, on its third bar, where the phrase itself swells. Further
  // from normal: on the first and the third bar; far from normal: on every bar.
  const target = bar + 2, at = target % 4;
  if (!(t < 0.6 ? at === 2 : t < 1.9 ? at % 2 === 0 : true)) return;
  const fits = (waveSets["cymbal|swell"] || []).filter((x) => x.peakAtSec <= 2 * barSec - 0.05 && (t >= 0.6 || x.peakAtSec >= 1.5));
  if (!fits.length) return;
  let i = Math.floor(rp() * fits.length);
  if (fits.length > 1 && fits[i].file === waveLast.swell) i = (i + 1) % fits.length;       // never the same wave twice in a row
  const wave = fits[i];
  waveLast.swell = wave.file;
  const size = WAVE_GAIN * (1 + 0.75 * t), pan = (rp() - 0.5) * 0.8, breakAt = time + 2 * barSec;
  wavePlay(wave, breakAt - wave.peakAtSec, size, pan, 0, 0);
  // the foam: a soft rub of the cabasa as the wave pulls back
  if (t >= 0.6) { const foam = waveTake(["cabasa|rub"]); if (foam) wavePlay(foam, breakAt + 0.28 + rp() * 0.1, size * 0.5, -pan, 0, 0); }
  st.waveNow += (st.waveNow ? ", " : "") + "wave on bar " + (target + 1);
}
// The low strings never leave: a section of cellos holds one long low note, swelling in and out with the bar.
const CELLO_GAIN = 1.55;                // set by measurement
function acc(midi, time, seconds, vel) {
  if (!layers.acc || !celloSet) return;
  midi += capo;
  const c = nearest(celloSet, midi), v = vel * CELLO_GAIN;
  const env = new NoteGain(0).connect(g.acc);
  const src = new NoteSource({ url: c.buffer, playbackRate: Math.pow(2, (midi - c.midi) / 12 - c.centsOff / 1200), loop: c.loopEnd > c.loopStart, loopStart: c.loopStart, loopEnd: c.loopEnd }).connect(env);
  env.gain.setValueAtTime(0, time);
  env.gain.linearRampToValueAtTime(v, time + seconds * 0.5);
  env.gain.linearRampToValueAtTime(v * 0.6, time + seconds);
  env.gain.linearRampToValueAtTime(0, time + seconds + 0.5);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time, 0, seconds + 0.6);
  stats.cello++;
}

// ---------- the picking: thumb on the bass, three fingers on the three treble strings ----------
// (the patterns of a fingerpicked guitar, played here on marimba and kalimba; "toada" is the plain pattern of
// Brazilian country guitar; the other names say what the hand does)
// [step, finger, loudness]. p = bass string, q = the other bass string, i m a = 3rd, 2nd and 1st strings.
// Each phrase opens with the home pattern (the first of its family); after that the hand varies, never the same twice in a row.
const PATTERNS = {
  calm: [
    ["toada", [[0, "p", 0.85], [2, "i", 0.5], [3, "m", 0.55], [4, "q", 0.6], [4, "a", 0.72], [6, "m", 0.5], [7, "i", 0.46]]],
    ["open", [[0, "p", 0.85], [2, "i", 0.5], [4, "m", 0.56], [6, "a", 0.66]]],
    ["pinch", [[0, "p", 0.85], [0, "a", 0.62], [2, "m", 0.5], [3, "i", 0.46], [4, "q", 0.6], [6, "m", 0.52], [7, "a", 0.6]]],
    ["up and down", [[0, "p", 0.85], [1, "i", 0.44], [2, "m", 0.5], [3, "a", 0.64], [4, "q", 0.58], [5, "a", 0.5], [6, "m", 0.5], [7, "i", 0.44]]],
    ["middle first", [[0, "p", 0.85], [2, "m", 0.5], [3, "i", 0.46], [4, "q", 0.62], [5, "i", 0.44], [6, "m", 0.5], [7, "a", 0.62]]],
    ["answer", [[0, "p", 0.85], [3, "a", 0.66], [4, "q", 0.58], [5, "m", 0.52], [6, "i", 0.48]]],
  ],
  sparse: [                                              // under the solo the hand leaves room
    ["open", [[0, "p", 0.85], [2, "i", 0.48], [4, "m", 0.52], [6, "a", 0.58]]],
    ["two beats", [[0, "p", 0.85], [2, "i", 0.46], [3, "m", 0.5], [4, "q", 0.58], [6, "m", 0.46]]],
    ["basses", [[0, "p", 0.85], [3, "m", 0.46], [4, "q", 0.6], [7, "i", 0.44]]],
  ],
  tight: [
    ["running", [[0, "p", 0.9], [1, "i", 0.48], [2, "m", 0.52], [3, "a", 0.66], [4, "q", 0.66], [5, "i", 0.48], [6, "m", 0.52], [7, "a", 0.62]]],
    ["running down", [[0, "p", 0.9], [1, "a", 0.62], [2, "m", 0.52], [3, "i", 0.48], [4, "q", 0.66], [5, "a", 0.62], [6, "m", 0.52], [7, "i", 0.48]]],
    ["insistent", [[0, "p", 0.9], [1, "a", 0.6], [2, "m", 0.5], [3, "a", 0.64], [4, "q", 0.66], [5, "a", 0.6], [6, "m", 0.5], [7, "a", 0.66]]],
    ["broken", [[0, "p", 0.9], [1, "i", 0.48], [2, "m", 0.52], [3, "i", 0.5], [4, "q", 0.66], [5, "a", 0.64], [6, "m", 0.52], [7, "a", 0.66]]],
  ],
};
let ladderOn = true;              // the harp's ladder: the cue for "warmer" and "colder"
let patsOn = true;
let touchOn = true;               // the human touch on the fingerpicking
let seedT = 1;
function reseedT(n) { seedT = n >>> 0; }
function rt() { seedT = (seedT + 0x6D2B79F5) >>> 0; let t = seedT; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const touch = { hand: { i: 1, m: 1, a: 1 }, topFret: -1, topStrong: false };
let soloOn = true;
let lastPat = "";
function choosePattern(bar) {
  const tight = st.tension >= 1.9;
  let family = tight ? PATTERNS.tight : PATTERNS.calm, k = tight ? pers.homeTight : pers.homeCalm;
  if (patsOn) {
    // (the arpeggio keeps flowing under the tune: it is the water)
    if (st.solo || bar % 4 !== 0) {
      k = Math.floor(jit() * family.length);
      if (family.length > 1 && family[k][0] === lastPat) k = (k + 1) % family.length;
    }
  }
  st.patName = family[k][0]; st.pat = family[k][1]; lastPat = st.patName;
  // how each finger weighs in this bar; the top finger also follows the shape of the phrase (strong, lighter, strongest, lightest)
  touch.hand = touchOn ? { i: 0.84 + rt() * 0.26, m: 0.84 + rt() * 0.26, a: (0.9 + rt() * 0.3) * [1, 0.9, 1.06, 0.86][bar % 4] } : { i: 1, m: 1, a: 1 };
}
function bassStrings(ch) {
  if (ch.bassA) return [1, 2];                          // A in the bass, then the E on the 4th string
  return [2, ch.frets[1] === 0 ? 1 : 2];                // D in the bass, then the open A when the chord allows it
}
function playGuitar(pos, time) {
  const ch = st.chord;
  if (pos === 0) {
    // the left hand moves: a string that keeps its fret keeps ringing, a string that changes is stopped
    for (let s = 0; s < 6; s++) { const v = voice[s]; if (v && v.end > time && ch.frets[s] !== v.fret) damp(s, time); }
    for (const finger of ["i", "m"]) { const v = duoVoice[finger]; if (v && v.end > time && duoFret(finger, ch) !== v.fret) dampDuo(finger, time); }
  }
  const force = 0.82 + 0.1 * st.tension;
  const [p, q] = bassStrings(ch);
  for (const [at, finger, vel] of st.pat) {
    if (at !== pos) continue;
    if (st.run && at >= st.quietFrom && finger !== "p" && finger !== "q") continue;      // the fingers leave the way clear for the ladder
    const str = finger === "p" ? p : finger === "q" ? q : finger === "i" ? 3 : finger === "m" ? 4 : 5;
    const late = finger === "p" || finger === "q" ? 0 : 0.004 + jit() * 0.009;       // the fingers come a hair after the thumb
    let weight = 1, free = 0;
    if (touchOn && finger !== "p" && finger !== "q") {
      weight = touch.hand[finger];
      if (finger === "a") {
        // never two equal accents in a row on the same top note; now and then the top string is only brushed
        const same = touch.topFret === ch.frets[5];
        if (same && touch.topStrong) weight *= 0.76;
        touch.topStrong = !(same && touch.topStrong);
        touch.topFret = ch.frets[5];
        if (rt() < 0.12) weight *= 0.5;
        free = rt() * 0.012;                                                         // and it is a little freer in time
      }
    }
    pick(str, ch.frets[str], time + late + free, vel * force * weight * (0.9 + jit() * 0.2));
    // the duet: the second guitar answers the index and the middle finger an octave above, a moment later
    if ((finger === "i" || finger === "m") && st.duoSteps.includes(pos)) partner(finger, ch, time + late + 0.018 + jit() * 0.014, vel * force * (st.duoLevel === 2 ? 0.6 : 0.45) * (0.9 + jit() * 0.2));
  }
}

// ---------- who plays the tune ----------
// The tune never stops: one phrase of four bars on the vibraphone (with a glockenspiel on top over warm water, which
// together sound like a celesta), the next phrase on the woodwind of the place.
// "hold" = blown: one voice, each note held until the next. "pluck" = struck single notes.
// shift = how many semitones above the written line the instrument plays.
const SOLOISTS = {
  celesta: { kind: "pluck", shift: 12, level: 1.15, ring: 2.0 },
  clarinet: { kind: "hold", shift: 0, level: 0.75 },
  ocarina: { kind: "hold", shift: 12, level: 0.85 },
  flute: { kind: "hold", shift: 12, level: 0.8 },
};
const soloSets = {};                          // the recordings of each of them
// Cold water: the tune sinks an octave.
function coldLow() { return st.side === "cold" && st.temp <= -0.4; }
// The woodwind of the place.
function windOf() { const list = ["clarinet", "ocarina", "flute"].filter((k) => soloSets[k]); return list.length ? list[pers.seed % list.length] : "celesta"; }
function soloKey() { return "tune"; }
// Which instrument has the tune in a given bar.
function soloVoiceAt(key, bar, run) { return Math.floor(bar / 4) % 2 === 0 ? "celesta" : windOf(); }
function voiceSet(k) { return k === "solo" ? soloSets[st.soloKey] : fluteSets[k]; }
function soloNote(midi, time, vel) {
  const key = st.soloKey || "guitar", who = SOLOISTS[key];
  if (key === "guitar") { leadNote(midi, time, vel); return; }
  if (!layers.gtr) return;
  const m = midi + who.shift + (coldLow() ? -12 : 0);          // cold water: the tune sinks an octave
  if (who.kind === "pluck") {
    // a plucked note rings for a while and then fades, so a line of notes does not pile up
    const b = nearest(soloSets[key], m), v = vel * who.level, ring = who.ring || 1.4;
    const env = new NoteGain(v).connect(g.lead);
    const src = new NoteSource({ url: b.buffer, playbackRate: Math.pow(2, (m - b.midi) / 12 - b.centsOff / 1200) }).connect(env);
    env.gain.setValueAtTime(v, time + ring);
    env.gain.linearRampToValueAtTime(0, time + ring + 0.8);
    src.onended = () => { src.dispose(); env.dispose(); };
    src.start(time, 0, ring + 0.9);
    // warm water has the sparkle of the metal bars (and a second one an octave up when it is very warm); cold water has none
    if (key === "celesta" && st.side === "warm") { glock(m, time, v * GLOCK_GAIN); if (st.temp >= 2) glock(m + 12, time, v * GLOCK_GAIN * 0.6); }
  } else {
    // one singing voice: the note takes over from the one before, with no slide; the force of each note shapes the breath or the bow
    st.heldKey = key;
    if (voices.solo) voiceMove("solo", m, time); else voiceStart("solo", m, time, who.level * 0.6);
    if (voices.solo) voices.solo.gain.gain.setTargetAtTime(who.level * (0.55 + 0.6 * vel), time + 0.02, 0.06);
  }
  stats.lead++;
}

// ---------- the tune: it improvises in the mode of each chord ----------
// Pitch classes of each mode (D = 2). The mode follows the chord, and the chord follows the temperature.
const MODES = {
  ionian: [2, 4, 6, 7, 9, 11, 1],          // D E F# G A B C#: peace
  mixo: [2, 4, 6, 7, 9, 11, 0],            // C natural: the first shadow
  dorian: [2, 4, 5, 7, 9, 11, 0],          // minor with a bright sixth: bittersweet
  aeolian: [2, 4, 5, 7, 9, 10, 0],         // natural minor: grief
  harmonic: [2, 4, 5, 7, 9, 10, 1],        // harmonic minor: the leading note pulls
  phrygian: [2, 3, 5, 7, 9, 10, 0],        // the flat second: dread
  lydDom: [10, 0, 2, 4, 5, 7, 8],          // B flat Lydian dominant, for the augmented sixth chord
  whole: [2, 4, 6, 8, 10, 0],              // whole tones: no ground
  lydian: [2, 4, 6, 8, 9, 11, 1],          // the raised fourth: light on the water, the first warmth
  lydDomD: [2, 4, 6, 8, 9, 11, 0],         // Lydian dominant: bright and restless
  lydAug: [2, 4, 6, 8, 10, 11, 1],         // Lydian augmented: the heat rises
  dim: [2, 4, 5, 7, 8, 10, 11, 1],         // diminished (whole step, half step)
};
function modeOf(ch) {
  const n = ch.name, t = st.tension;
  if (n === "Daug" || n === "D9(#5)" || n === "E+/D") return "whole";
  if (n === "E/D" || n === "Dmaj7(#11)") return "lydian";
  if (n === "E7/D" || n === "D7(#11)") return "lydDomD";
  if (n === "Dmaj7(#5)") return "lydAug";
  if (n === "D°") return "dim";
  if (n === "Eb/D") return "phrygian";
  if (n === "Bb7/D") return "lydDom";
  if (n === "C#°/D" || n === "Dm(maj7)" || n === "A7(b13)" || n === "A7(b9)") return "harmonic";
  if (n === "A7" || n === "A7sus4") return t < 1.2 ? "ionian" : "harmonic";
  if (n === "Dm6" || n === "Dm7") return "dorian";
  if (n === "Dm") return t < 1.5 ? "dorian" : "aeolian";
  if (n === "Gm/D" || n === "Bb/D" || n === "Gm6/D") return "aeolian";
  if (n === "D7" || n === "D7sus4" || n === "Dsus4") return "mixo";
  return "ionian";
}
let seedS = 1;
function reseedS(n) { seedS = n >>> 0; }
function rs() { seedS = (seedS + 0x6D2B79F5) >>> 0; let t = seedS; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const leadTakes = {};                         // midi -> recordings of that note
let leadPrev = null, leadLast = { midi: -1, k: 0 };
const solo = { rhythm: null, moves: null, start: 69, last: 69, lastCell: -1 };
function resetSolo() { solo.rhythm = null; solo.moves = null; solo.start = 69; solo.last = 69; solo.lastCell = -1; leadPrev = null; leadLast = { midi: -1, k: 0 }; lastPat = ""; st.lead = []; st.solo = false; st.modeName = ""; }
// One singing line: a new note takes over from the one before.
function leadNote(midi, time, vel) {
  const list = leadTakes[midi];
  if (!list || !layers.gtr) return;
  const k = list.length > 1 && leadLast.midi === midi ? (leadLast.k + 1) % list.length : 0;
  leadLast = { midi, k };
  if (leadPrev && leadPrev.end > time) {
    leadPrev.env.gain.setValueAtTime(leadPrev.vel, time);
    leadPrev.env.gain.linearRampToValueAtTime(0, time + 0.06);
    leadPrev.end = time;
  }
  const take = list[k].take;
  const env = new NoteGain(vel).connect(g.lead);
  const src = new NoteSource({ url: take.buffer, playbackRate: Math.pow(2, -take.centsOff / 1200) }).connect(env);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time);
  leadPrev = { env, vel, end: time + take.buffer.duration };
  stats.lead++;
}
function nearestIn(list, target) { let b = list[0]; for (const x of list) if (Math.abs(x - target) < Math.abs(b - target)) b = x; return b; }
function walk(notes, from, steps) {
  const i = notes.indexOf(nearestIn(notes, from));
  return notes[Math.max(0, Math.min(notes.length - 1, i + steps))];
}
// Rhythms of one bar (the sixteenth steps where a note starts): calm, moving, urgent.
const CELLS = [
  [[0, 4, 6], [0, 3, 4], [2, 4, 6], [0, 2, 4], [0, 3, 6], [1, 2, 4]],
  [[0, 2, 3, 4, 6], [0, 2, 4, 5, 6], [1, 2, 4, 6, 7], [0, 3, 4, 6, 7], [0, 1, 2, 4, 6]],
  [[0, 1, 2, 3, 4, 6], [0, 2, 3, 4, 5, 6, 7], [0, 1, 2, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 6, 7]],
];
// A solo is a phrase of four bars: an idea, the same idea a step away, a climb to the highest note, and a resolution.
// On the strong steps (0 and 4) it lands on a note of the chord; between them it walks the scale.
function planSolo(bar, ch) {
  st.lead = []; st.modeName = "";
  const inPhrase = bar % 4, phrase = Math.floor(bar / 4);
  const mode = modeOf(ch);
  const pcs = MODES[mode].map((x) => (x + capo) % 12).concat(pcsOf(ch)), chordPcs = pcsOf(ch);
  const notes = [], tones = [];
  // the solo sings above the accompaniment (whose top note is around F#4) and below the harp: from E4 to E5
  // on the guitar the solo stays at or below C5: above it the recordings are the shortest and thinnest (frets 9 to 12 of the first string)
  const onGuitar = (st.soloKey || "guitar") === "guitar", top = onGuitar ? 72 : 76;
  for (let m = 64; m <= top; m++) { if (pcs.includes(m % 12)) notes.push(m); if (chordPcs.includes(m % 12)) tones.push(m); }
  const centre = onGuitar ? Math.max(67, Math.min(70, 67.5 + st.tension)) : Math.max(69, Math.min(73, 70 + 1.2 * st.tension));
  if (!st.solo) {
    if (soloOn && layers.gtr && inPhrase === 3 && (phrase + 1) % 2 === 1) {
      // the bar before a solo: two notes that climb into it
      const c = nearestIn(tones, centre);
      st.lead = [[6, walk(notes, c, -2), 0.5], [7, walk(notes, c, -1), 0.58]];
      solo.last = st.lead[1][1];
    }
    return;
  }
  st.modeName = mode;
  const level = st.tension < 0.9 ? 0 : st.tension < 2.0 ? 1 : 2;
  const grief = st.tension >= 1.3 && st.side !== "warm";       // cold water laments downwards; warm water keeps climbing
  if (inPhrase === 3 && solo.rhythm) {
    // the last bar resolves: down by step to a note of the chord, which is left ringing
    const target = nearestIn(tones, solo.last - 4);
    st.lead = [[0, walk(notes, target, 2), 0.66], [2, walk(notes, target, 1), 0.6], [4, target, 0.8]];
    solo.last = target;
    return;
  }
  let rhythm, moves, start;
  if (inPhrase === 1 && solo.rhythm) {
    rhythm = solo.rhythm; moves = solo.moves;
    start = nearestIn(tones, walk(notes, solo.start, grief ? -2 : 2));       // the same idea, lower when there is grief, higher when there is not
  } else if (inPhrase === 2 && solo.rhythm) {
    const cells = CELLS[Math.min(2, level + 1)];
    rhythm = cells[Math.floor(rs() * cells.length)];
    moves = rhythm.slice(1).map(() => { const r = rs(); return r < 0.65 ? 1 : r < 0.85 ? 2 : -1; });      // it climbs
    start = nearestIn(tones, solo.last);
  } else {
    const cells = CELLS[level];
    let k = Math.floor(rs() * cells.length);
    if (k === solo.lastCell) k = (k + 1) % cells.length;
    solo.lastCell = k;
    rhythm = cells[k];
    const shape = grief ? "lament" : rs() < 0.5 ? "arch" : "rise";
    moves = rhythm.slice(1).map((_, i, arr) => {
      const r = rs();
      if (shape === "lament") return i === 0 ? 2 : r < 0.8 ? -1 : -2;         // a cry upwards, then it falls by step
      if (shape === "arch") return i < arr.length / 2 ? (r < 0.7 ? 1 : 2) : (r < 0.7 ? -1 : -2);
      return r < 0.65 ? 1 : r < 0.85 ? 2 : -1;
    });
    start = nearestIn(tones, centre);
    solo.rhythm = rhythm; solo.moves = moves; solo.start = start;
  }
  let prev = null, dir = 1;
  rhythm.forEach((at, i) => {
    const move = i === 0 ? 0 : moves[i - 1] * dir;
    let m = i === 0 ? start : walk(notes, prev, move);
    if (i > 0 && m === prev) { dir = -dir; m = walk(notes, prev, -move); }    // at the edge of the range it turns around, and keeps going that way
    const strong = at === 0 || at === 4;
    if (strong) {
      m = nearestIn(tones, m);
      if (m === prev && tones.length > 1) { const j = tones.indexOf(m); m = tones[move < 0 ? Math.max(0, j - 1) : Math.min(tones.length - 1, j + 1)]; if (m === prev) m = tones[j > 0 ? j - 1 : 1]; }
    }
    st.lead.push([at, m, (strong ? 0.82 : 0.6) * (0.85 + 0.08 * st.tension) * (inPhrase === 2 ? 1.08 : 1)]);
    prev = m;
  });
  solo.last = prev;
}

// ---------- the harp: a few notes of the chord, moving by step; the more tension, the more sighs ----------
function melodyFor(ch) {
  const pcs = pcsOf(ch);
  const centre = st.side === "cold" ? 77 - 3 * st.tension : 77 + 2.5 * st.tension;      // warmer climbs, colder sinks
  let best = st.mel, bestScore = -1e9;
  for (let m = 62; m <= 90; m++) {
    if (!pcs.includes(m % 12)) continue;
    const step = Math.abs(m - st.mel);
    let sc = -0.35 * Math.abs(m - centre) - (step <= 2 ? step * 0.2 : step <= 5 ? 0.6 + step * 0.25 : 3 + step * 0.4);
    if (m === st.lastHarp[0]) sc -= 1.2;
    if (m === st.lastHarp[1]) sc -= 0.5;
    sc += (rnd() - 0.5) * 0.4;
    if (sc > bestScore) { bestScore = sc; best = m; }
  }
  return best;
}
function scaleNow(ch) {
  const base = st.tension < 1.05 ? [2, 4, 6, 7, 9, 11, 1] : st.side === "warm" ? [2, 4, 6, 8, 9, 11, 1] : [2, 4, 5, 7, 9, 10, 0];
  return base.map((x) => (x + capo) % 12).concat(pcsOf(ch));
}
function neighbourAbove(m, scale) { for (let d = 1; d <= 3; d++) if (scale.includes((m + d) % 12)) return m + d; return m + 2; }
function planHarp(ch) {
  // what the harp will do in this bar: [step, note, loudness, ring]
  const plan = [];
  const note = melodyFor(ch);
  const sighChance = Math.min(0.85, 0.12 + 0.26 * st.tension);
  const phraseEnd = st.bar % 4 === 3;
  if (rnd() < sighChance) {
    plan.push([0, neighbourAbove(note, scaleNow(ch)), 0.62, 0.5]);     // the note above, on the beat...
    plan.push([2, note, 0.5, 2.0]);                                     // ...sighing down into the note of the chord
  } else plan.push([0, note, 0.58, 2.0]);
  if (phraseEnd) {
    // end of the phrase: the chord goes up through the harp, like a breath
    const pcs = pcsOf(ch); const up = [];
    for (let m = 57; m <= 84 && up.length < 4; m++) if (pcs.includes(m % 12) && (up.length === 0 || m - up[up.length - 1] >= 3)) up.push(m);
    up.forEach((m, i) => plan.push([4 + i, m, 0.3 + 0.04 * i, 1.4]));
  } else if (rnd() < 0.55) {
    // a second, softer note of the chord, close to the first
    const pcs = pcsOf(ch); let second = null;
    for (const d of [-3, -4, 3, 4, -5, 5, -2, 2]) if (pcs.includes((note + d + 120) % 12) && note + d >= 60 && note + d <= 90) { second = note + d; break; }
    if (second != null) plan.push([st.tension >= 1.9 ? 5 : 4, second, 0.4, 1.6]);
  }
  if (st.bar % 4 === 0) plan.push([0, (ch.bassA ? 45 : 38) + capo, 0.5, 2.6]);  // a low bell at the start of each phrase
  st.lastHarp = [note, st.lastHarp[0]];
  st.mel = note;
  return plan;
}

// ---------- the flutes: they sing the melody ----------
// The concert flute is the first voice: it holds the note the harp plucks (an octave below it, or at its pitch). The harp gives
// the attack, the flute holds. When the harp sighs (the note above, then the note), the flute sighs with it.
// The baroque recorder is the second voice: it comes in on the second bar of each phrase, a third or a sixth below,
// always on a note of the chord. Both breathe at the end of each phrase. No slides: one note fades in while the other fades out.
const fluteSets = { a: null, b: null };       // a = concert flute, b = baroque recorders
let fluteShift = -12;                         // where the flutes sing: an octave below the harp (-12) or at its pitch (0)
const voices = { a: null, b: null, solo: null };          // what each flute is holding: { gain, seg, note }
function fluteSeg(set, midi, time, breathGain, fade, from) {
  const b = nearest(set, midi);
  const comp = b.levelDbA != null ? Math.pow(10, (-22 - b.levelDbA) / 40) : 1;       // the low notes of a flute sound weaker: even them out half way
  const segGain = new NoteGain(fade ? 0 : comp).connect(breathGain);
  if (fade) { segGain.gain.setValueAtTime(0, time); segGain.gain.linearRampToValueAtTime(comp, time + fade); }
  const src = new NoteSource({ url: b.buffer, playbackRate: Math.pow(2, (midi - b.midi) / 12 - b.centsOff / 1200), loop: b.loopEnd > b.loopStart, loopStart: b.loopStart, loopEnd: b.loopEnd }).connect(segGain);
  src.onended = () => { src.dispose(); segGain.dispose(); };
  // a soloist plays legato: a note that follows another starts inside the held sound (no new attack), and the first note of a
  // phrase starts just before it, so a slow bow or breath does not swallow short notes
  const looped = b.loopEnd > b.loopStart;
  src.start(time, looped && from === "loop" ? b.loopStart : looped && from === "near" ? Math.max(0, b.loopStart - 0.35) : 0);
  return { src, gain: segGain, comp };
}
function voiceStart(k, note, time, peak) {
  if (!voiceSet(k)) return;
  const gain = new T.Gain(0).connect(k === "solo" ? g.lead : g.flute);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(peak * 0.8, time + 0.14);
  voices[k] = { gain, seg: fluteSeg(voiceSet(k), note, time, gain, 0, k === "solo" ? "near" : ""), note };
  stats.flute++;
}
function voiceMove(k, note, time) {
  const v = voices[k];
  if (!v || v.note === note) return;                      // the same note is tied, not played again
  v.seg.gain.gain.setValueAtTime(v.seg.comp, time);
  v.seg.gain.gain.linearRampToValueAtTime(0, time + 0.09);
  v.seg.src.stop(time + 0.15);
  v.seg = fluteSeg(voiceSet(k), note, time, v.gain, 0.09, k === "solo" ? "loop" : "");
  v.note = note;
  stats.flute++;
}
function voiceSwell(k, t0, t1, peak, held) {
  const v = voices[k];
  if (!v) return;
  if (held) v.gain.gain.cancelAndHoldAtTime(t0);
  v.gain.gain.linearRampToValueAtTime(peak, t0 + 0.45 * (t1 - t0));       // each bar breathes: it swells...
  v.gain.gain.linearRampToValueAtTime(peak * 0.78, t1);                    // ...and eases
}
function voiceEnd(k, time, release) {
  const v = voices[k];
  if (!v) return;
  v.gain.gain.cancelAndHoldAtTime(time);
  v.gain.gain.linearRampToValueAtTime(0, time + release);
  v.seg.src.stop(time + release + 0.1);
  const node = v.gain;
  setTimeout(() => node.dispose(), Math.max(0, time + release + 2 - T.now()) * 1000);
  voices[k] = null;
}
function flutesOff(time, release) { voiceEnd("a", time, release); voiceEnd("b", time, release); }
// The second voice: a note of the chord a third below (best), a sixth below, or a fourth or fifth below; close to where it was.
function secondVoice(ch, note, prev) {
  const pcs = pcsOf(ch);
  let best = null, bestScore = -1e9;
  [3, 4, 8, 9, 5, 7].forEach((d, rank) => {
    const m = note - d;
    if (m < 55 || !pcs.includes(m % 12)) return;
    const sc = -0.6 * rank - (prev == null ? 0 : 0.25 * Math.abs(m - prev));
    if (sc > bestScore) { bestScore = sc; best = m; }
  });
  return best;
}
function planFlute(bar, time, ch) {
  st.fluteNow = "";
  if (!layers.flute || !fluteSets.a) { flutesOff(time, 0.25); return; }
  const stepSec = 60 / BPM / 4, sec = stepSec * 8, inPhrase = bar % 4;
  const down = st.mel + fluteShift < 60 ? 0 : fluteShift;    // when the melody sinks, the flute sings at its pitch (it has no notes below middle C)
  const note = st.mel + down;                                // the melody note of the vibraphone in this bar
  const sigh = st.plan[0][1] !== st.mel;                     // the vibraphone starts on the note above and resolves on step 2
  const first = sigh ? st.plan[0][1] + down : note;
  const peakA = (0.5 + 0.06 * st.tension) * 0.55, peakB = (0.36 + 0.04 * st.tension) * 0.55;
  const heldA = !!voices.a;
  if (heldA) voiceMove("a", first, time); else voiceStart("a", first, time, peakA);
  if (sigh) voiceMove("a", note, time + 2 * stepSec);
  voiceSwell("a", time, time + sec, peakA, heldA);
  let nb = null;
  if (fluteSets.b && inPhrase >= 1) {
    nb = secondVoice(ch, note, voices.b ? voices.b.note : null);
    const heldB = !!voices.b;
    if (nb == null) voiceEnd("b", time, 0.25);
    else {
      if (heldB) voiceMove("b", nb, time); else voiceStart("b", nb, time, peakB);
      voiceSwell("b", time, time + sec, peakB, heldB);
    }
  }
  if (inPhrase === 3) flutesOff(time + 5 * stepSec, 0.3);    // both breathe while the harp goes up the chord
  st.fluteNow = (sigh ? first + ">" : "") + note + (nb == null ? "" : " + " + nb);
}
// The end: like a duo, the first voice on the third of the chord and the second on the tonic, held and fading.
function fluteFinal(home, time) {
  if (!layers.flute || !fluteSets.a) return;
  const up = (fluteShift === 0 ? 12 : 0) + capo;
  for (const [k, note, peak] of [["a", (home.home === "minor" ? 65 : 66) + up, 0.42], ["b", 62 + up, 0.3]]) {
    if (!fluteSets[k]) continue;
    if (voices[k]) { voiceMove(k, note, time + 0.25); voices[k].gain.gain.cancelAndHoldAtTime(time + 0.25); voices[k].gain.gain.linearRampToValueAtTime(peak, time + 0.6); }
    else { voiceStart(k, note, time + 0.25, peak); voices[k].gain.gain.linearRampToValueAtTime(peak, time + 0.6); }
    voiceEnd(k, time + 1.8, 2.2);
  }
}

// ---------- the piano: weight ----------
let pianoSet = null;
let pianoHeld = [];                           // what is ringing under the pedal
let pianoChord = "";
function pianoNote(midi, time, vel) {
  const b = nearest(pianoSet, midi);
  const rate = Math.pow(2, (midi - b.midi) / 12 - b.centsOff / 1200);
  const env = new NoteGain(vel).connect(g.piano);
  const src = new NoteSource({ url: b.buffer, playbackRate: rate }).connect(env);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time);
  pianoHeld.push({ env, vel, src, end: time + b.buffer.duration / rate });
  stats.piano++;
}
// The pedal changes: what was ringing fades, so the old chord never smears into the new one.
function pianoPedal(time) {
  for (const v of pianoHeld) if (v.end > time) { v.env.gain.setValueAtTime(v.vel, time); v.env.gain.linearRampToValueAtTime(0, time + 0.25); v.src.stop(time + 0.3); }
  pianoHeld = [];
}
function pianoStroke(ch, time, low, oct, chord) {
  const root = (ch.bassA ? 33 : 38) + capo;                                // A1 or D2, with the key of the place
  if (low) pianoNote(root, time, low);
  if (oct) pianoNote(root + 12, time + 0.004, oct);
  // the right hand: the notes the guitar's three fingers play, rolled upwards just after the bass
  if (chord && PIANO_CHORDS) [3, 4, 5].forEach((str, i) => pianoNote(OPEN[str] + ch.frets[str] + capo, time + 0.03 + i * 0.028 + jit() * 0.008, chord * (0.92 + 0.06 * i) * (0.92 + jit() * 0.16)));
}
function planPiano(bar, time, ch) {
  st.pianoNow = "";
  if (!pianoSet) return;
  const t = st.tension, inPhrase = bar % 4, stepSec = 60 / BPM / 4;
  if (ch.name !== pianoChord || !layers.piano) pianoPedal(time);
  pianoChord = ch.name;
  if (!layers.piano) return;
  // in peace the chord comes at the start and in the middle of the phrase, and the bass alone in between; from the first shadow on, bass and chord every bar
  if (t < 0.6 && inPhrase % 2 === 1) { pianoStroke(ch, time, 0.24, 0.32, 0); st.pianoNow = "bass only"; return; }       // the bass never leaves: that is the weight
  pianoStroke(ch, time, 0.3 + 0.15 * t, 0.42 + 0.1 * t, 0.32 + 0.08 * t);
  st.pianoNow = "bass and chord";
  if (t >= 1.9) { pianoStroke(ch, time + 4 * stepSec, t >= 2.5 ? 0.3 + 0.12 * t : 0, 0.36 + 0.08 * t, t >= 2.5 ? 0.26 + 0.06 * t : 0); st.pianoNow += t >= 2.5 ? ", and again mid-bar" : ", and the bass mid-bar"; }
}

// ---------- the double bass, plucked ----------
const bassSets = [];                          // the two recordings of each note
let bassPrev = null, bassFlip = 0;
function bassNote(midi, time, vel) {
  if (!layers.bass || !bassSets.length) return;
  // the two recordings of a note alternate. The first recording of the low D is almost a pure 73 Hz tone, which small
  // speakers cannot play: for that note the second recording is always used.
  let set = bassSets[bassSets.length > 1 ? bassFlip++ % 2 : 0];
  if (bassSets.length > 1 && nearest(bassSets[0], midi).midi === 38) set = bassSets[1];
  const b = nearest(set, midi), rate = Math.pow(2, (midi - b.midi) / 12 - b.centsOff / 1200);
  if (bassPrev && bassPrev.end > time) { bassPrev.env.gain.setValueAtTime(bassPrev.vel, time); bassPrev.env.gain.linearRampToValueAtTime(0, time + 0.05); bassPrev.src.stop(time + 0.07); bassPrev.end = time; }
  const env = new NoteGain(vel).connect(g.bass);
  const src = new NoteSource({ url: b.buffer, playbackRate: rate }).connect(env);
  src.onended = () => { src.dispose(); env.dispose(); };
  src.start(time);
  bassPrev = { env, vel, src, end: time + b.buffer.duration / rate };
  stats.bass++;
}
function bassCut(time) { if (bassPrev && bassPrev.end > time) { bassPrev.env.gain.setValueAtTime(bassPrev.vel, time); bassPrev.env.gain.linearRampToValueAtTime(0, time + 0.1); bassPrev.src.stop(time + 0.12); bassPrev.end = time; } }
function planBass(bar, time, ch) {
  st.bassNow = "";
  if (!layers.bass || !bassSets.length) return;
  const t = st.tension, stepSec = 60 / BPM / 4;
  const root = (ch.bassA ? 33 : 38) + capo;                                 // A1 or D2, with the key of the place
  // the second note: the fifth when the chord has one (below the D, above the A); else the root an octave up
  const fifth = pcsOf(ch).includes((root + 7) % 12) ? (ch.bassA ? root + 7 : root - 5) : root + 12;
  const hum = () => (0.92 + jit() * 0.16) * (0.9 + 0.1 * t);                // it digs in a little as the tension grows, like the guitar
  bassNote(root, time + 0.004, 0.8 * hum());
  st.bassNow = "root";
  if (t >= 1.3) bassNote(root, time + 3 * stepSec, 0.45 * hum());           // with the drum, just before the second beat
  if (t >= 0.6 || bar % 2 === 1) { bassNote(fifth, time + 4 * stepSec, 0.56 * hum()); st.bassNow += " and fifth"; }
  if (t >= 2.5) bassNote(fifth, time + 6 * stepSec, 0.5 * hum());
}

// ---------- percussion: a groove on the grid of the music, soft in peace, fuller as the tension grows ----------
const percSets = {};                          // "instrument|stroke" -> recordings from soft to loud
const percPitch = {};                         // the pitch of a stroke that has one (the middle value of its recordings)
const percParts = { drum: false, tri: true, clap: false, moments: true };      // the sea has no drum kit: a triangle in the calm, and the moments
const KITS = {
  frame: { name: "frame drum", low: "frame|low", high: "frame|high", tune: true },
};
function kitNow() { return KITS[pers.drum]; }
let seedP = 1;
function reseedP(n) { seedP = n >>> 0; }
function rp() { seedP = (seedP + 0x6D2B79F5) >>> 0; let t = seedP; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const percLast = {};
// One stroke. The force chooses the recording (a soft stroke uses a softly played one) and sets the level; never the same
// recording twice in a row. rate retunes a drum or a bell to the key of the place.
function percHit(key, time, vel, pan, rate) {
  const list = percSets[key];
  if (!list || !list.length || !layers.perc) return;
  let i = Math.round(Math.min(1, Math.max(0, (vel - 0.25) / 0.6)) * (list.length - 1));
  if (list.length > 1 && i === percLast[key]) i = i === 0 ? 1 : i === list.length - 1 ? i - 1 : i + (rp() < 0.5 ? -1 : 1);
  percLast[key] = i;
  const tk = list[i];
  const gain = Math.min(8, Math.pow(10, ((-3 + 20 * Math.log10(vel)) - tk.peakDb) / 20));
  const place = new T.Panner(pan || 0).connect(g.perc);
  const src = new T.ToneBufferSource({ url: tk.buffer, playbackRate: rate || 1 }).connect(place);
  src.onended = () => { src.dispose(); place.dispose(); };
  src.start(Math.max(T.now() + 0.005, time - tk.attack), 0, undefined, gain);       // a shake grows before its peak: it starts early
  stats.perc++;
}
// A drum has a pitch: tune it to the tonic or the fifth of the key of the place, whichever is nearer (at most 3.5 semitones).
function tuneRate(key) {
  const hz = percPitch[key];
  if (!hz) return 1;
  const own = 69 + 12 * Math.log2(hz / 440);
  let best = own;
  let dist = 99;
  for (const pc of [(2 + capo) % 12, (9 + capo) % 12]) for (let m = pc; m < 100; m += 12) if (Math.abs(m - own) < dist) { dist = Math.abs(m - own); best = m; }
  return dist <= 3.5 ? Math.pow(2, (best - own) / 12) : 1;
}
function pitchedRate(key, target) {             // the recording of a timpani or a bell nearest to a note, and the rate that gives the note
  const list = percSets[key] || [];
  let tk = null;
  for (const x of list) if (x.midi != null && (!tk || Math.abs(x.midi - target) < Math.abs(tk.midi - target))) tk = x;
  return tk ? { tk, rate: Math.pow(2, (target - tk.midi) / 12 - tk.centsOff / 1200) } : null;
}
function percOne(tk, time, gain, rate, pan) {    // one given recording (swells, timpani, bells)
  if (!layers.perc) return;
  const place = new T.Panner(pan || 0).connect(g.perc);
  const src = new T.ToneBufferSource({ url: tk.buffer, playbackRate: rate || 1 }).connect(place);
  src.onended = () => { src.dispose(); place.dispose(); };
  src.start(Math.max(T.now() + 0.005, time), 0, undefined, gain);
  stats.perc++;
}
function planPerc(bar, time) {
  st.percNow = "";
  if (!layers.perc || !Object.keys(percSets).length) return;
  const t = st.tension, inPhrase = bar % 4, stepSec = 60 / BPM / 4, kit = kitNow();
  const at = (step) => time + step * stepSec + (rp() - 0.5) * 0.008;
  const hum = () => 0.92 + rp() * 0.16;
  const lowRate = kit.tune ? tuneRate(kit.low) : 1;
  const low = (step, v) => { if (percParts.drum) percHit(kit.low, at(step), v * hum(), 0, lowRate); };
  const high = (step, v) => { if (percParts.drum) percHit(kit.high, at(step), v * hum(), 0.15, 1); };
  // the triangle sounds a B: where the key has no B (E flat and F) it is tuned a semitone down
  const tri = (step, v) => { if (percParts.tri) percHit("triangle|open", at(step), v, 0.4, Math.pow(2, (capo === 1 || capo === 3 ? -1.3 : -0.3) / 12)); };
  const clap = (step, v) => { if (percParts.clap) percHit("claps|claps", at(step), v * hum(), -0.1, 1); };
  if (t < 0.6) {
    if (inPhrase % 2 === 0) low(0, 0.38);
    if (inPhrase === 0) tri(0, 0.3);
    st.percNow = "calm";
  } else if (t < 1.3) {
    low(0, 0.5);
    if (inPhrase === 0) tri(0, 0.28);
    st.percNow = "shadow";
  } else if (t < 1.9) {
    low(0, 0.62); low(3, 0.4); high(6, 0.46);
    st.percNow = "grief";
  } else if (t < 2.5) {
    low(0, 0.75); low(3, 0.5); high(6, 0.56); high(7, 0.32);
    st.percNow = "tension";
  } else {
    low(0, 0.9); low(3, 0.6); low(4, 0.5); high(6, 0.66); high(7, 0.46);
    clap(4, 0.55);
    st.percNow = "anguish";
  }
  if (inPhrase === 3 && t >= 1.3) high(5, 0.36);                              // a small turn at the end of the phrase
  if (!percParts.moments) return;
  // moments. Where is the tension going in the next bar?
  const fNext = magAt(bar + 1);
  const wantNext = 3 * Math.sqrt(fNext), tNext = t + (wantNext - t) * (wantNext > t ? 0.55 : 0.35);
  const swell = (percSets["cymbal|swell"] || []).find((x) => x.peakAt < 2.5);
  if (swellsOn && swell && ((t < 1.9 && tNext >= 1.9) || (t < 2.5 && tNext >= 2.5))) {
    // the cymbal swells so that its loudest point falls on the first beat of the next bar, where the tension tightens
    percOne(swell, time + 8 * stepSec - swell.peakAt, tNext >= 2.5 ? 0.55 : 0.4, 1, 0.2);
    st.percNow += ", cymbal swell";
  }
  if (t >= 2.2 && inPhrase === 0) {
    const tp = pitchedRate("timpani|soft", 38 + capo);                // the timpani on the tonic, for weight
    if (tp) { percOne(tp.tk, time, 0.5 + 0.12 * (t - 2.2), tp.rate, -0.15); st.percNow += ", timpani"; }
  }
  if (t >= 1.9) st.percHot = true;
  if (st.percHot && t < 0.8 && inPhrase === 0) {
    const bell = pitchedRate("bells|soft", 62 + capo);                // a bell on the tonic when calm returns
    if (bell) { percOne(bell.tk, time, 0.34, bell.rate, 0.25); st.percNow += ", bell"; }
    st.percHot = false;
  }
}

// ---------- one bar: the distance from normal sets the tension; the tension and the side choose the chord ----------
const monthBars = 1;                          // how many bars each date of data lasts
const ladderThr = 1.5;                        // in steps of half a degree: how far the temperature must be from the value the harp last spoke about
function valueAt(bar) {
  const m = Math.min(SCENE.length - 1, Math.floor(bar / monthBars)), nx = Math.min(SCENE.length - 1, m + 1);
  return SCENE[m] + (SCENE[nx] - SCENE[m]) * ((bar % monthBars) / monthBars);
}
// How far from normal, from 0 to 1, with room for the small anomalies where most of the ocean lives
// (half a degree is already heard; four degrees is the top). Its square root times 3 is the tension.
function magAt(bar) { return Math.pow(Math.abs(valueAt(bar)), 1.5); }
function monthStarts(bar, time) {
  if (!onMonth || bar % monthBars !== 0) return;
  const m = bar / monthBars, cb = onMonth;
  T.getDraw().schedule(() => cb(m), time);
}
function planBar(bar, time) {
  const a = valueAt(bar), f = Math.pow(Math.abs(a), 1.5);
  // which side of normal: it only changes when the water is clearly on the other side
  st.side = a > 0.03 ? "warm" : a < -0.03 ? "cold" : st.side || "warm";
  st.temp = Math.round(a * 40) / 10;
  const want = 3 * Math.sqrt(f);            // the tension follows the distance from normal
  if (bar === 0) st.tension = want;                                       // a record starts where its data are, not from calm
  st.tension += (want - st.tension) * (want > st.tension ? 0.55 : 0.35);   // up fast, down slowly: a warm or a cold spell leaves a memory
  st.bar = bar;
  st.solo = soloOn && layers.gtr;                                       // the tune never stops: one phrase on the vibraphone, the next on a woodwind
  st.chord = chooseChord(st);
  st.recent.unshift(st.chord.name); st.recent.length = Math.min(st.recent.length, 6);
  st.plan = planHarp(st.chord);
  // The ladder: the temperature on steps of half a degree, from -8 (4 C below normal) to +8 (4 C above); 0 is normal.
  // The harp only speaks when the temperature has really moved: at least three eighths of a degree away from the value it
  // last spoke about, so a value that hovers around a step never makes it flicker. Then it runs from the old step to the
  // new one: up = warmer, down = colder, one note per half degree plus one of run-up (so the smallest change has three
  // notes and a bigger one is longer), always ending on the note of the new level. From half a beat before it starts,
  // everyone else leaves the way clear.
  const exact = a * 8;
  st.run = null; st.runFirst = 99; st.quietFrom = 99;
  if (ladderOn) {
    if (st.lvl == null) {
      // the first bar: the run starts on the note of normal, so the listener hears where this record begins
      st.lvl = Math.max(-8, Math.min(8, Math.round(exact)));
      st.run = { from: 0, to: st.lvl, opening: true };
      st.said = exact;
    } else if (Math.abs(exact - st.said) >= ladderThr) {                     // measured from the value it last spoke about, not from the step
      const to = Math.max(-8, Math.min(8, Math.round(exact)));
      if (to !== st.lvl) { st.run = { from: st.lvl, to }; st.lvl = to; st.said = exact; }
    }
    // so that "harp going up" only ever means "warmer", the arpeggio at the end of a phrase becomes a rolled chord
    st.plan = st.plan.map((e) => (e[0] >= 4 && e[3] === 1.4 ? [4, e[1], e[2], e[3], (e[0] - 4) * 0.04] : e));
    if (st.run) {
      // the ladder is centred on the tonic: normal is the D in the middle, warmer climbs above it, colder goes below
      const scale = st.tension < 1.05 ? [0, 2, 4, 5, 7, 9, 11] : st.side === "warm" ? [0, 2, 4, 6, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
      const pitchOf = (i) => 74 + capo + 12 * Math.floor(i / 7) + scale[((i % 7) + 7) % 7];
      const dir = st.run.to >= st.run.from ? 1 : -1;
      let idx = [];
      for (let i = st.run.from; i !== st.run.to + dir; i += dir) idx.push(i);
      if (st.run.to === st.run.from) idx = [st.run.from];                               // the record opens exactly at normal: its note alone
      else idx.unshift(st.run.opening ? 0 : idx[0] - dir);                              // one note of run-up: the smallest change has three notes and every half degree more adds one (the opening repeats the note of normal)
      while (idx.length > 8) idx.splice(1 + Math.floor((idx.length - 2) / 2), 1);       // a very large change still fits one bar
      const first = 8 - idx.length, stepSec = 60 / BPM / 4;
      st.runFirst = first;
      st.quietFrom = Math.max(0, first - 2);                                            // the others fall silent half a beat before the harp starts
      st.plan = st.plan.filter((e) => e[0] < Math.min(4, st.quietFrom) || e[1] < 50);   // the vibraphone leaves room for the run
      idx.forEach((i, k) => {
        const vel = (dir > 0 ? 0.6 + 0.3 * k / Math.max(1, idx.length - 1) : 0.9 - 0.25 * k / Math.max(1, idx.length - 1)) * LADDER_GAIN;
        st.plan.push([first + k, pitchOf(i), vel, 1.0, 0, true]);
        // normal has a sound of its own: a bell rings whenever the run starts at, ends at or passes through normal
        if (i === 0 && idx.indexOf(0) === k) { const bell = pitchedRate("bells|soft", 62 + capo); if (bell) percOne(bell.tk, time + (first + k) * stepSec, 0.42, bell.rate, 0); }
      });
      // the pads and the tune step back while the harp speaks
      const t0 = Math.max(time, time + st.quietFrom * stepSec - 0.06), t1 = time + 8 * stepSec;
      for (const name of ["glass", "lead", "flute", "vib"]) { fx[name].ride.gain.setTargetAtTime(0.45, t0, 0.05); fx[name].ride.gain.setTargetAtTime(1, t1, 0.25); }
      stats.runs++;
    }
  }
  // the wind chimes mark a big change of the month as a whole (a degree or more), in its direction
  if (wavesOn) {
    let jump = 0;
    if (bar > 0 && bar % monthBars === 0) { const mth = Math.min(SCENE.length - 1, Math.floor(bar / monthBars)); if (!GAP[mth - 1]) jump = (SCENE[mth] - SCENE[mth - 1]) * 4; }
    if (Math.abs(jump) >= 1) { const ch = waveTake([jump > 0 ? "chimes|up" : "chimes|down"]); if (ch) wavePlay(ch, time, 0.22, jump > 0 ? 0.35 : -0.35, 0, 0); }
  }
  // a slow memory of how far from normal the water has been (it decides when the second voice may answer)
  st.smokePrev = st.smoke;
  st.smoke += (f - st.smoke) * (f > st.smoke ? 0.30 : 0.40);
  // The second voice is company. Decided at the start of each phrase: 2 = duet, 1 = farewell or return, 0 = silent.
  // It leaves at once, comes back one step per phrase, and from silence only when the water has really been back at normal for a while.
  if (bar % 4 === 0) {
    const want = st.tension < 0.8 && st.smoke < 0.10 ? 2 : st.tension < 1.9 && st.smoke < 0.62 ? 1 : 0;
    if (want < st.duoLevel) st.duoLevel = want;
    else if (want > st.duoLevel && (st.duoLevel > 0 || (st.tension < 0.8 && st.smoke < 0.07))) st.duoLevel += 1;
  }
  // duet: silent on the first bar of the phrase (home and the bell alone), then it answers; farewell: only two notes in the second bar
  const inPhrase = bar % 4;
  st.duoSteps = !duetOn || !layers.gtr || st.tension >= 1.9 || st.solo ? []
    : st.duoLevel === 2 ? (inPhrase === 0 ? [] : inPhrase === 3 ? [1, 2, 3] : [1, 2, 3, 5, 6, 7])
    : st.duoLevel === 1 && inPhrase === 1 ? [5, 6, 7] : [];
  planFlute(bar, time, st.chord);
  choosePattern(bar);
  // the two notes that lead into a solo belong to whoever starts it
  st.soloKey = soloVoiceAt(soloKey(), bar % 4 === 3 && !st.solo ? bar + 1 : bar, !!st.run);
  // one harp: in the bar where it improvises in the conversation of three, it leaves its melody
  if (st.solo && (st.soloKey === "vibraphone" || st.soloKey === "celesta")) st.plan = st.plan.filter((e) => e[5]);      // one vibraphone: it leaves its melody to improvise; the harp's ladder stays
  if (voices.solo && st.heldKey !== st.soloKey) voiceEnd("solo", time, 0.2);            // another soloist takes over: the one that was holding a note lets go
  planSolo(bar, st.chord);
  if (!st.solo && !st.lead.length && voices.solo) voiceEnd("solo", time, 0.3);
  planPiano(bar, time, st.chord);
  planPerc(bar, time);
  planWaves(bar, time);
  planBass(bar, time, st.chord);
  mixBar(bar, time);
  dynBar(bar, time);
  journal.push({ bar, temp: st.temp, side: st.side, tension: Math.round(st.tension * 100) / 100, chord: st.chord.name, key: capo, pattern: st.patName, soloist: st.solo ? st.soloKey : "", mode: st.modeName, lead: st.lead.map((e) => e[0] + ":" + e[1]).join(" "), harp: st.plan.map((p) => p[0] + ":" + p[1]).join(" "), flute: st.fluteNow, piano: st.pianoNow, bass: st.bassNow, perc: st.percNow, waves: st.waveNow, level: st.lvl, run: st.run ? st.run.to - st.run.from : 0, opening: !!(st.run && st.run.opening), dyn: st.dynNow });
  if (journal.length > 600) journal.shift();
  const sec = 60 / BPM * 2;
  // the low strings never leave: a soft pedal in the calm, heavier as the water moves away from normal
  acc(st.chord.bassA ? 57 : 50, time, sec, st.tension > 1.0 ? 0.1 + 0.14 * (st.tension - 1) : 0.09 + 0.05 * st.tension);
  if (st.tension > 2.3) acc(st.chord.bassA ? 58 : 51, time, sec, 0.05 + 0.08 * (st.tension - 2.3));   // a neighbour note that grinds
  // the glasses: one long note of the chord per bar, high up where the four glasses really sound, never the note of the melody
  if (glassOn && glassSet && st.side === "warm") {                    // the glasses are the light on warm water only
    const pcs = pcsOf(st.chord);
    let note = null, dist = 99;
    for (let m = 73; m <= 88; m++) if (pcs.includes(m % 12) && m % 12 !== st.mel % 12 && Math.abs(m - 80) < dist) { dist = Math.abs(m - 80); note = m; }
    if (note != null) glass(note, time, sec, (st.side === "warm" ? 0.34 : 0.22) + 0.05 * st.tension);     // more light on warm water
  }
  // the violins shimmer: two notes of the chord in tremolo, one around G4 and one around D5
  if (glassOn && tremSet) {
    const pcs = pcsOf(st.chord);
    for (const centre of (st.side === "warm" ? [72, 79] : [57, 64])) {      // high over warm water, low over cold water
      let note = null, dist = 99;
      for (let m = centre - 4; m <= centre + 4; m++) if (pcs.includes(m % 12) && Math.abs(m - centre) < dist) { dist = Math.abs(m - centre); note = m; }
      if (note != null) padNote(tremSet, note, time, sec, TREM_GAIN * (0.7 + 0.25 * st.tension));
    }
  }
  // the horn: one long note of the chord when the sea is far from normal
  if (glassOn && hornSet && st.side === "cold" && st.tension >= 0.5) {   // the horn belongs to cold water
    const pcs = pcsOf(st.chord);
    let note = null, dist = 99;
    for (let m = 50; m <= 62; m++) if (pcs.includes(m % 12) && Math.abs(m - 57) < dist) { dist = Math.abs(m - 57); note = m; }      // where the horn was recorded note by note
    if (note != null) padNote(hornSet, note, time, sec, HORN_GAIN * (0.5 + 0.25 * st.tension));
  }
  monthStarts(bar, time);
}
// A date without data: the band rests (what was ringing is let go) and the dead groove sounds instead.
function restBar(bar, time) {
  flutesOff(time, 0.25); voiceEnd("solo", time, 0.3); bassCut(time); wavesOff(time);
  if (pianoSet) pianoPedal(time);
  st.plan = []; st.lead = []; st.pat = []; st.run = null;
  if (onGap) onGap(time, 60 / BPM * 2);
  monthStarts(bar, time);
}
// The music is handed to the audio clock this much earlier than the library does by itself (a tenth of a second). A
// page that stalls for a moment (pictures loading, the globe) would otherwise deliver a note after its time, and the
// music would stumble. Measured in the app: stalls of up to 0.3 s on a laptop, and of about a second with the main
// thread slowed four times (a weak phone). The pictures follow the same shifted time.
const AHEAD = 1.0;
function step(tick) {
  if (ended) return;
  const time = tick + AHEAD;
  const n = count++;
  const pos = n % 8, bar = Math.floor(n / 8);
  if (bar >= SCENE.length * monthBars) { ended = true; finish(time); return; }
  // the tempo breathes a little at the end of each phrase; it never runs
  const ease = bar % 4 === 3 && pos >= 4 ? 1 - 0.05 * (pos - 3) / 4 : 1;
  T.getTransport().bpm.setValueAtTime(BPM * ease, tick);
  if (GAP[Math.floor(bar / monthBars)]) { if (pos === 0) restBar(bar, time); return; }
  if (pos === 0) planBar(bar, time);
  playGuitar(pos, time);
  // the ladder and the low notes belong to the harp; the melody belongs to the vibraphone
  for (const [at, note, vel, ring, delay, ladder] of st.plan) if (at === pos) (ladder || note < 57 ? harp : vib)(note, time + (delay || 0) + 0.006 + jit() * 0.008, vel * (0.9 + jit() * 0.2), ring);
  for (const [at, midi, vel] of st.lead) if (at === pos && !(st.run && at >= st.quietFrom)) soloNote(midi, time + 0.008 + rs() * 0.012, vel * (0.92 + rs() * 0.16));
  if (pos === 7 && st.solo && bar % 4 === 3) voiceEnd("solo", time, 0.4);                  // whoever has the tune breathes at the end of the phrase
}
function finish(time) {
  // the end: the home chord of the moment, rolled slowly and answered by the harp
  const home = CHORDS.find((c) => c.home === (st.tension < 1.05 ? "major" : st.side === "warm" ? "lydian" : "minor"));
  [1, 2, 3, 4, 5].forEach((s, i) => pick(s, home.frets[s], time + i * 0.07, 0.8));
  if (duetOn && layers.gtr && st.duoLevel > 0) { partner("i", home, time + 0.24, 0.42); partner("m", home, time + 0.32, 0.42); }
  const pcs = pcsOf(home); let i = 0;
  for (let m = 62; m <= 86 && i < 5; m++) if (pcs.includes(m % 12)) { harp(m, time + 0.4 + i * 0.09, 0.45, 2.6); i++; m += 2; }
  fluteFinal(home, time);
  if (layers.piano && pianoSet) { pianoPedal(time); pianoStroke(home, time, 0.5, 0.5, 0.4); }
  bassNote(38 + capo, time + 0.004, 0.8);
  mixRest(time);                                                          // the last chord with every voice back at its own level
  if (st.solo) { soloNote(74 + capo > 76 ? 62 + capo : 74 + capo, time + 0.5, 0.6); voiceEnd("solo", time + 2.2, 1.8); }
  else voiceEnd("solo", time, 0.4);                             // the tune lands on the tonic
  journal.push({ bar: "end", chord: home.name });
  const done = onDone;
  onDone = null; onMonth = null; onGap = null;
  T.getDraw().schedule(() => { halt(); playing = false; }, time);
  // the record is reported as finished when the last chord has been heard
  endTimer = setTimeout(() => { endTimer = null; halt(); playing = false; if (done) done(); }, (Math.max(0, time - T.now()) + END_RING) * 1000);
}

// ---------- what engine.js calls ----------
let playing = false, ended = false;
let onMonth = null, onGap = null, onDone = null;
let endTimer = null;
const END_RING = 3.2;         // seconds of the last chord that are heard before a record is reported as finished
const DUCK = 0.25;            // about -12 dB: the level of the music while the screen reader speaks
const LEAD_IN = 0.25;         // seconds between Play and the first step of the clock. The first bar sounds AHEAD later (1.25 s after Play): time for the announcement of the record to ask for room
let duckUntil = 0;            // when the sentence being spoken ends
let opening = 0;              // until when a request to duck belongs to the announcement of the record that is starting
let mapCell = { row: 90, col: 40 };
let sounding = false;         // true from a Play until what it left ringing has been let go

function halt() { if (loop) { loop.dispose(); loop = null; } const tr = T.getTransport(); tr.stop(); tr.cancel(0); }

// Let go of everything that is ringing: each bus gets a new input and the old one fades with all that plays into it.
function cutTails(fade) {
  const now = T.immediate();
  flutesOff(now, fade); voiceEnd("solo", now, fade); wavesOff(now);
  for (const name of Object.keys(fx)) {
    const old = g[name];
    old.gain.cancelScheduledValues(now);
    old.gain.setTargetAtTime(0, now, fade / 3);
    setTimeout(() => old.dispose(), 9000);
    g[name] = new T.Gain(1).connect(fx[name].n);
  }
  voice.fill(null); duoVoice.i = null; duoVoice.m = null; leadPrev = null; bassPrev = null; pianoHeld = [];
}

function silence(fade) {
  if (!built) return;
  const was = playing || !!loop;
  if (was) halt();                            // the clock is shared with the other records: only stop it when it is ours
  playing = false; ended = false;
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
  onMonth = null; onGap = null;
  cutTails(fade);
  if (onDone) onDone();
  onDone = null;
  sounding = false;
}

/**
 * Build the audio chain and start loading the recordings, in the background: the caller does not have to wait.
 * `Tone` is the loaded library; `destination` is optional.
 */
export function attach(Tone, destination) {
  T = Tone;
  if (!graph) graph = buildGraph(destination);
  whenReady().catch(() => { /* reported by whoever waits for it */ });
  return graph;
}
/** True once attach() was called. */
export function isAttached() { return !!graph; }
/** Resolves when every recording is loaded (a record can be played). */
export function whenReady() {
  if (!graph) return Promise.reject(new Error("the sea music is not attached yet"));
  if (!loading) loading = graph.then(loadAll).catch((err) => { loading = null; throw err; });   // a failed load can be asked for again
  return loading;
}
export function isReady() { return ready; }
export function isPlaying() { return playing; }

/** How long one date of a record lasts at a place, in seconds: one bar at the tempo of that place. */
export function monthSeconds(lat, lon) {
  if (lat == null || lon == null) return monthBars * 2 * 60 / 63;
  const wrapped = ((Number(lon) + 180) % 360 + 360) % 360 - 180;
  const row = Math.max(0, Math.min(179, Math.floor(89.5 - Number(lat) + 0.5))), col = Math.max(0, Math.min(359, Math.floor(wrapped + 179.5 + 0.5)));
  let h = hash32(row * 360 + col + SALT);
  h = hash32(h);                                                        // the first number of a place is its key
  h = hash32(h);                                                        // the second is its tempo
  return monthBars * 2 * 60 / [59, 61, 63, 65, 67][Math.floor(h / 4294967296 * 5)];
}

/** The place under the needle. It chooses the key, the tempo and the woodwind of the record. */
export function setPlace(lat, lon) {
  if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) return;
  lon = ((Number(lon) + 180) % 360 + 360) % 360 - 180;
  mapCell = { row: Math.max(0, Math.min(179, Math.floor(89.5 - Number(lat) + 0.5))), col: Math.max(0, Math.min(359, Math.floor(lon + 179.5 + 0.5))) };
}

/**
 * Play a record: one value per date (0 to 1 on the color scale, 0.5 = normal; null = no data). Each date lasts one bar.
 * opts.onMonth(index) is called when a date starts; opts.onGap(time, seconds) when a date has no data.
 * Resolves when the last chord has been heard, or at once when stopped.
 */
export function playRecord(values, opts = {}) {
  if (!ready || !values || !values.length) return Promise.resolve();
  silence(0.05);
  halt();                                     // from here on the clock is ours
  SCENE = values.map((v) => (v == null ? 0 : Math.max(-1, Math.min(1, (Number(v) - 0.5) * 2))));
  GAP = values.map((v) => v == null);
  setPersonality(mapCell.row, mapCell.col);
  count = 0; journal.length = 0;
  reseed(pers.seed);
  reseedB((pers.seed ^ 4071) >>> 0);          // the way of playing also belongs to the place
  reseedS((pers.seed ^ 5521) >>> 0);
  resetSolo();
  reseedT((pers.seed ^ 9173) >>> 0);
  touch.topFret = -1; touch.topStrong = false;
  reseedP((pers.seed ^ 3301) >>> 0);
  bassFlip = 0;
  for (const k of Object.keys(waveLast)) delete waveLast[k];
  st.lvl = null; st.run = null; st.side = ""; st.runFirst = 99; st.quietFrom = 99; st.temp = 0; st.said = 0;
  st.percHot = false;
  st.tension = 0; st.chord = null; st.recent = []; st.bar = 0; st.mel = 78; st.plan = []; st.lastHarp = []; st.smoke = 0; st.smokePrev = 0; st.duoLevel = 2; st.duoSteps = [];
  pianoChord = "";
  mixRest(T.now());
  onMonth = opts.onMonth || null; onGap = opts.onGap || null;
  playing = true; ended = false; sounding = true;
  // The interface announces the record half a second after Play. The first bar waits for that request; a sentence
  // already being spoken counts too.
  const now = T.immediate();
  opening = now + LEAD_IN + AHEAD + 0.05;
  if (duckUntil - now > 0.4) riseUnderSpeech(duckUntil);
  return new Promise((resolve) => {
    onDone = resolve;
    loop = new T.Loop(step, "16n").start(0);
    T.getTransport().bpm.value = BPM;
    T.getTransport().start("+" + LEAD_IN);
  });
}

// A record that starts while a sentence is spoken comes in like music under a radio announcer: 12 dB down, growing
// slowly at first and faster towards the end, at its own level when the sentence ends. No burst, no dip, no jump.
function riseUnderSpeech(until) {
  const now = T.immediate(), from = now + 0.12, d = Math.max(0.3, until - from);
  const p = duckGain.gain;
  p.cancelScheduledValues(now);
  p.setTargetAtTime(DUCK, now, 0.02);
  p.setValueAtTime(DUCK, from);
  for (let i = 1; i <= 10; i++) { const x = i / 10; p.linearRampToValueAtTime(T.dbToGain(-12 * (1 - x * x)), from + d * x); }
}

/** Lower the music about 12 dB for `ms` milliseconds (while the screen reader speaks). */
export function duck(ms) {
  if (!built) return;
  const now = T.immediate();
  duckUntil = now + ms / 1000;
  if (playing && now < opening) { riseUnderSpeech(duckUntil); return; }      // the announcement of the record that is starting
  duckGain.gain.cancelScheduledValues(now);
  duckGain.gain.setTargetAtTime(DUCK, now, 0.03);
  duckGain.gain.setTargetAtTime(1, now + ms / 1000, 0.15);
}

/** Let go of whatever the sea music is sounding (another record is taking over). */
export function release() {
  if (built && sounding) silence(0.05);
}

/** Stop everything at once: what was ringing is let go and the reverb tail is closed for a moment. */
export function stop() {
  if (!built) return;
  silence(0.03);
  const now = T.immediate();
  duckGain.gain.cancelScheduledValues(now);
  duckGain.gain.setTargetAtTime(0, now, 0.012);       // silent within about 50 ms, so a screen reader is heard at once
  duckGain.gain.setTargetAtTime(1, now + 0.35, 0.03);
  revRet.gain.cancelScheduledValues(now);
  revRet.gain.setTargetAtTime(0, now, 0.01);          // the tail of the room does not come back
  revRet.gain.setTargetAtTime(1, now + 1.2, 0.25);
}

/** Debug helpers for the dev test page (not used by the app). */
export function _debugJournal() { return journal.slice(); }
export function _debugLevel() { return meter ? meter.getValue() : -Infinity; }
export function _debugState() {
  return { ready, playing, key: capo, bpm: BPM, wind: ready ? windOf() : "", cell: mapCell, stats: { ...stats },
    duck: built ? duckGain.gain.value : 1, dynDb: built ? Math.round(200 * Math.log10(Math.max(1e-6, dyn.gain.gain.value))) / 10 : 0 };
}
