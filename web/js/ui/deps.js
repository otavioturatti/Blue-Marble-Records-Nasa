// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Load Otávio's engine and DJ when they exist; fall back to the interface's simulators.
// The integration needs no code change: once engine.js and dj.js land, they are used.
// The seam is guarded both ways: a module that is missing, fails to load or lacks an export of the
// contract is replaced by its simulator, and every call is
// wrapped so one throwing method never stops a Play or the app.

export const ENGINE_API = ["start", "legend", "needleDrop", "play", "playTurns", "compare", "duck", "stop", "isRunning"];
export const DJ_API = ["describe", "describeCompare"];

/** True when mod exports a function for every name. */
export function hasApi(mod, names) {
  return !!mod && names.every((n) => typeof mod[n] === "function");
}

/** The real module when it loads and has the whole contract, else the simulator. */
async function pick(realUrl, simUrl, names, label) {
  try {
    const mod = await import(realUrl);
    if (hasApi(mod, names)) return mod;
    console.warn(`${label}: ${realUrl} lacks part of the contract (${names.filter((n) => typeof mod[n] !== "function").join(", ")}); using the simulator.`);
  } catch { /* absent (404) or broken: the simulator stands in */ }
  return import(simUrl);
}

const warn = (name, err) => console.warn(`Sound engine: ${name} failed.`, err);

/**
 * The engine with every call guarded. start() still rejects (the app says the sound failed);
 * legend() and playTurns() always give a promise that settles; playTurns() that returns no promise
 * gets one that resolves after its steps (or at stop()); isRunning() is a boolean.
 */
export function guardEngine(eng, { setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) } = {}) {
  let turnsTimer = null;
  let turnsDone = null;
  const endTurns = () => {
    if (turnsTimer) clearTimer(turnsTimer);
    turnsTimer = null;
    const done = turnsDone;
    turnsDone = null;
    done?.();
  };
  const safe = {};
  for (const name of ENGINE_API) {
    safe[name] = (...args) => {
      try { return eng[name](...args); } catch (err) { warn(name, err); return undefined; }
    };
  }
  safe.start = async () => { await eng.start(); };
  safe.legend = async () => { try { await eng.legend(); } catch (err) { warn("legend", err); } };
  safe.isRunning = () => { try { return eng.isRunning() === true; } catch { return false; } };
  safe.stop = () => {
    try { eng.stop(); } catch (err) { warn("stop", err); }
    endTurns();
  };
  safe.playTurns = (samples, opts = {}) => {
    endTurns();
    let r;
    try { r = eng.playTurns(samples, opts); } catch (err) { warn("playTurns", err); return Promise.resolve(); }
    if (r && typeof r.then === "function") return Promise.resolve(r).catch((err) => warn("playTurns", err));
    // No promise: settle after the steps would have run (or at stop()), so Play ends cleanly.
    const ms = (samples?.length || 0) * (60000 / (opts.bpm || 84));
    return new Promise((resolve) => {
      turnsDone = resolve;
      turnsTimer = setTimer(endTurns, ms);
    });
  };
  return safe;
}

/** The DJ with every call guarded: a throw or an empty answer falls back to the simulator's sentence. */
export function guardDj(dj, sim) {
  const safe = {};
  for (const name of DJ_API) {
    safe[name] = (ctx) => {
      try {
        const s = dj[name](ctx);
        if (typeof s === "string" && s.trim()) return s;
      } catch (err) { console.warn(`DJ: ${name} failed.`, err); }
      try { return sim && sim !== dj ? sim[name](ctx) : ""; } catch { return ""; }
    };
  }
  return safe;
}

export async function loadEngine() {
  return guardEngine(await pick(new URL("../engine.js", import.meta.url).href, "./sim-engine.js", ENGINE_API, "Sound engine"));
}

export async function loadDj() {
  const [dj, sim] = await Promise.all([
    pick(new URL("../dj.js", import.meta.url).href, "./sim-dj.js", DJ_API, "DJ"),
    import("./sim-dj.js"),
  ]);
  return guardDj(dj, sim);
}
