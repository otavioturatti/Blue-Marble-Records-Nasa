// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
// The voice guide: a synthetic voice that welcomes
// the visitor, says where the needle goes and what happened (paused, ended). It plays the recorded
// clip web/voice/{lang}/{Id}.mp3 when it exists and otherwise says the same text with the browser's
// own speech synthesis in the page's language. It is not a screen reader: the value sentences stay
// in the page's live region and the voice never repeats them, never writes to the live region, and
// waits about 0.6 s after the last arrow key before it speaks. Optional, off by default on touch
// screens, never before the visitor's first gesture.

// Every line of the script, keyed by its id, so the text and the clip file names cannot drift.
// S00 is not in the script yet: the voice's first words must say how to turn it off.
export const LINES = {
  en: {
    S00: "Voice guide on. To turn it off, press G.",
    S00t: "Voice guide on. To turn it off, use the Voice guide box.",
    S01: "Welcome to Blue Marble Records, a listening experience. NASA pictures of the Earth become music. Choose a place, and listen to its months go by.",
    S02: "Up and down choose a place. Left and right switch between sea and fire. Enter pauses. Escape or S stops.",
    S03: "The buttons at the bottom play, skip, or switch between sea and fire. The full list comes after them.",
    S06: "First, the sounds.",
    L1: "Low.",
    L2: "Middle.",
    L3: "High.",
    L4: "This crackle means no data.",
    S07: "Paused.",
    S08: "Continuing.",
    S09: "Stopped.",
    S10: "End of this place. The down arrow goes to the next one; Enter plays it again.",
    S10t: "End of this place. Swipe right to Next place and double tap; or double tap Play to hear it again.",
    S11: "Loading the instruments. The music starts in a moment.",
    S12: "The sound could not start. Check that your device is not muted, and try again.",
    S13: "Back to the start.",
    S14: "Voice off.",
    S15: "Voice on.",
    S16: "For all the keys, press the question mark.",
    S17: "Your phone can vibrate with the music: more pulses mean higher.",
    S18: "There is no data at this place on this date.",
    R01s: "Sea surface temperature. Higher notes are warmer than normal, lower notes cooler.",
    R02s: "Active fires. The more fire, the fuller the music.",
    "P-uberlandia": "Entering Uberlândia, Brazil.",
    "P-cerrado": "Entering the Cerrado, in Jalapão, Tocantins.",
    "P-roraima": "Entering the savanna of Roraima.",
    "P-amazon": "Entering the Amazon rainforest.",
    "P-sao-paulo": "Entering São Paulo.",
    "P-off-santos": "Entering the Atlantic, off Santos.",
    "P-off-recife": "Entering the Atlantic, off Recife.",
    "P-amazon-plume": "Entering the Atlantic, at the mouth of the Amazon.",
    "P-equatorial-pacific": "Entering the equatorial Pacific.",
    "P-off-peru": "Entering the Pacific, off Peru.",
    "P-off-california": "Entering the Pacific, off California.",
    "P-gulf-of-alaska": "Entering the Gulf of Alaska.",
    "P-gulf-of-mexico": "Entering the Gulf of Mexico.",
    "P-north-atlantic-cold-blob": "Entering the North Atlantic, south of Greenland.",
    "P-north-atlantic": "Entering the open North Atlantic.",
    "P-mediterranean": "Entering the Mediterranean Sea.",
    "P-off-namibia": "Entering the Atlantic, off Namibia.",
    "P-indian-ocean": "Entering the Indian Ocean.",
    "P-north-pacific-heatwave": "Entering the North Pacific, east of Japan.",
    "P-off-japan": "Entering the Pacific, off Japan.",
    "P-coral-sea": "Entering the Coral Sea, by the Great Barrier Reef.",
    "P-southern-ocean": "Entering the Southern Ocean, south of Africa.",
    "P-gran-chaco": "Entering the Gran Chaco, in Paraguay.",
    "P-los-angeles": "Entering Los Angeles.",
    "P-saskatchewan": "Entering the boreal forest of Saskatchewan, Canada.",
    "P-northern-nigeria": "Entering the savanna of northern Nigeria.",
    "P-angola": "Entering the miombo woodlands of Angola.",
    "P-borneo": "Entering the peatlands of Borneo.",
    "P-northern-australia": "Entering northern Australia.",
    "P-northern-thailand": "Entering northern Thailand.",
    C01: "Comparing two dates at the same place. If the two notes sound as one, little changed. If they beat against each other, it changed.",
    C02: "A November under a La Niña advisory from NOAA, against the next November, under an El Niño advisory.",
    C03: "The wet season against the dry season of the same year.",
    T01: "Welcome to Blue Marble Records, a listening experience. NASA satellites photograph the Earth every day; here, their pictures become music. We will visit four places: two seas, then two lands where fire burns. When the music climbs and grows fuller, the heat or the fire is rising.",
    T02: "Space pauses. The up and down arrows change the place. The left and right arrows switch between sea and fire. Escape stops the tour.",
    T02t: "You are on the Pause button. Double tap to pause; swipe right for the next place.",
    T02v: "Tap the screen to pause and to continue. Swipe sideways to change the place. Swipe up or down to switch between sea and fire.",
    T03a: "This sea, month by month, from the first picture to the last.",
    T03b: "The same months, on the other side of the world.",
    T03c: "Now, fire. The more fire the satellites see, the fuller and heavier the music.",
    T03d: "Rains and dry seasons, one after the other.",
    T03e: "The same months, across the ocean.",
    T04: "End of the tour. Now the up and down arrows go through every place, and Space plays it. The full list comes after these buttons.",
    T04t: "End of the tour. Next and Previous now go through every place; double tap Play to hear one. The full list comes after these buttons.",
    T04v: "End of the tour. Swipe sideways to visit other places; tap to hear a place again.",
    T05: "Tour stopped. Start the tour begins it again.",
    S10v: "End of this place. Swipe sideways for another place, or tap to hear it again.",
    // The gate speaks (a visitor without a screen reader: a raw touch or key reached the page).
    G01: "Blue Marble Records. Hear the planet NASA sees. Press Space to start the guided tour with this voice. The arrow keys show the other options.",
    G01t: "Blue Marble Records. Hear the planet NASA sees. Tap the screen again to start the guided tour with this voice.",
    G02a: "Guided tour, with my screen reader.",
    G02b: "Guided tour, with the app's voice.",
    G02c: "Explore on my own.",
  },
  "pt-BR": {
    S00: "Voz guia ligada. Para desligar, aperte G.",
    S00t: "Voz guia ligada. Para desligar, use a caixa Voz guia.",
    S01: "Boas-vindas ao Blue Marble Records, uma experiência para ouvir. Imagens da Terra feitas pela NASA viram música. Escolha um lugar e ouça os meses passarem.",
    S02: "Para cima e para baixo escolhem um lugar. Esquerda e direita trocam entre mar e fogo. Enter pausa. Esc ou S para.",
    S03: "Os botões embaixo tocam, pulam ou trocam entre mar e fogo. A lista completa vem depois deles.",
    S06: "Primeiro, os sons.",
    L1: "Grave.",
    L2: "Meio.",
    L3: "Agudo.",
    L4: "Este chiado quer dizer sem dado.",
    S07: "Pausado.",
    S08: "Continuando.",
    S09: "Parado.",
    S10: "Fim deste lugar. A seta para baixo vai para o próximo; Enter toca de novo.",
    S10t: "Fim deste lugar. Deslize para a direita até Próximo lugar e toque duas vezes; ou toque duas vezes em Tocar para ouvir de novo.",
    S11: "Carregando os instrumentos. A música já começa.",
    S12: "O som não ligou. Veja se o aparelho não está no silencioso e tente de novo.",
    S13: "De volta ao início.",
    S14: "Voz desligada.",
    S15: "Voz ligada.",
    S16: "Para ver todas as teclas, aperte o ponto de interrogação.",
    S17: "O seu celular pode vibrar junto com a música: mais pulsos, mais alto.",
    S18: "Não há dado neste lugar nesta data.",
    R01s: "Temperatura do mar. Notas mais agudas, mais quente que o normal; mais graves, mais frio.",
    R02s: "Focos de incêndio. Quanto mais fogo, mais cheia a música.",
    "P-uberlandia": "Entrando em Uberlândia.",
    "P-cerrado": "Entrando no Cerrado, no Jalapão, Tocantins.",
    "P-roraima": "Entrando na savana de Roraima.",
    "P-amazon": "Entrando na Floresta Amazônica.",
    "P-sao-paulo": "Entrando em São Paulo.",
    "P-off-santos": "Entrando no Atlântico, na costa de Santos.",
    "P-off-recife": "Entrando no Atlântico, na costa do Recife.",
    "P-amazon-plume": "Entrando no Atlântico, na foz do Amazonas.",
    "P-equatorial-pacific": "Entrando no Pacífico equatorial.",
    "P-off-peru": "Entrando no Pacífico, na costa do Peru.",
    "P-off-california": "Entrando no Pacífico, na costa da Califórnia.",
    "P-gulf-of-alaska": "Entrando no Golfo do Alasca.",
    "P-gulf-of-mexico": "Entrando no Golfo do México.",
    "P-north-atlantic-cold-blob": "Entrando no Atlântico Norte, ao sul da Groenlândia.",
    "P-north-atlantic": "Entrando no meio do Atlântico Norte.",
    "P-mediterranean": "Entrando no Mar Mediterrâneo.",
    "P-off-namibia": "Entrando no Atlântico, na costa da Namíbia.",
    "P-indian-ocean": "Entrando no Oceano Índico.",
    "P-north-pacific-heatwave": "Entrando no Pacífico Norte, a leste do Japão.",
    "P-off-japan": "Entrando no Pacífico, na costa do Japão.",
    "P-coral-sea": "Entrando no Mar de Coral, junto da Grande Barreira de Corais.",
    "P-southern-ocean": "Entrando no Oceano Austral, ao sul da África.",
    "P-gran-chaco": "Entrando no Gran Chaco, no Paraguai.",
    "P-los-angeles": "Entrando em Los Angeles.",
    "P-saskatchewan": "Entrando na floresta boreal de Saskatchewan, no Canadá.",
    "P-northern-nigeria": "Entrando na savana do norte da Nigéria.",
    "P-angola": "Entrando nas florestas de miombo de Angola.",
    "P-borneo": "Entrando nas turfeiras de Bornéu.",
    "P-northern-australia": "Entrando no norte da Austrália.",
    "P-northern-thailand": "Entrando no norte da Tailândia.",
    C01: "Comparando duas datas no mesmo lugar. Se as duas notas soam como uma só, pouco mudou. Se batem uma contra a outra, mudou.",
    C02: "Um novembro com aviso de La Niña da NOAA, contra o novembro seguinte, com aviso de El Niño.",
    C03: "A estação chuvosa contra a estação seca do mesmo ano.",
    T01: "Boas-vindas ao Blue Marble Records, uma experiência para ouvir. Satélites da NASA fotografam a Terra todos os dias; aqui, essas imagens viram música. Vamos visitar quatro lugares: dois mares, depois duas terras onde o fogo queima. Quando a música sobe e fica mais cheia, o calor ou o fogo está aumentando.",
    T02: "Espaço pausa. As setas para cima e para baixo trocam de lugar. As setas para a esquerda e para a direita trocam entre mar e fogo. Esc para o passeio.",
    T02t: "Você está no botão Pausar. Toque duas vezes para pausar; deslize para a direita para ir ao próximo lugar.",
    T02v: "Toque na tela para pausar e para continuar. Deslize para o lado para trocar de lugar. Deslize para cima ou para baixo para trocar entre mar e fogo.",
    T03a: "Este mar, mês a mês, da primeira imagem à última.",
    T03b: "Os mesmos meses, do outro lado do mundo.",
    T03c: "Agora, o fogo. Quanto mais fogo os satélites veem, mais cheia e pesada fica a música.",
    T03d: "Chuvas e secas, uma depois da outra.",
    T03e: "Os mesmos meses, do outro lado do oceano.",
    T04: "Fim do passeio. Agora as setas para cima e para baixo percorrem todos os lugares, e Espaço toca. A lista completa vem depois destes botões.",
    T04t: "Fim do passeio. Próximo e Anterior agora percorrem todos os lugares; toque duas vezes em Tocar para ouvir. A lista completa vem depois destes botões.",
    T04v: "Fim do passeio. Deslize para o lado para visitar outros lugares; toque para ouvir um lugar de novo.",
    T05: "Passeio parado. Começar o passeio recomeça.",
    S10v: "Fim deste lugar. Deslize para o lado para outro lugar, ou toque para ouvir de novo.",
    G01: "Blue Marble Records. Ouça o planeta que a NASA vê. Aperte Espaço para começar o passeio guiado com esta voz. As setas mostram as outras opções.",
    G01t: "Blue Marble Records. Ouça o planeta que a NASA vê. Toque na tela de novo para começar o passeio guiado com esta voz.",
    G02a: "Passeio guiado, com o meu leitor de tela.",
    G02b: "Passeio guiado, com a voz do aplicativo.",
    G02c: "Explorar por conta própria.",
  },
};

/* ---------- Which line for which event (pure) ---------- */

/**
 * When the voice may speak, by kind of line (from the screen reader simulation: one speaker at a
 * time). FULL_POLICY: the whole script, for a visitor with no screen reader (the voice on, a
 * pointer). SAFE_POLICY: the voice on with the keyboard, or a screen reader likely on a phone: only
 * the welcome (while the page holds its own sentences) and one short line before a record's first
 * Play (after the reader's estimated end); never status words, legend words, place lines or
 * Compare lines.
 */
export const FULL_POLICY = Object.freeze({
  welcome: true,
  tour: true, // the guided tour's lines (before or between the music, never over it)
  record: true, // the record's introduction, before its first Play this session
  legend: true, // the legend's words, only on the Sound legend button and the L key
  placeKeyboard: true, // "Next stop: ..." after an arrow key
  placePointer: true, // "Next stop: ..." after a click, a tap or a dot
  status: true, // paused, continuing, stopped, end, loading, failed, home, voice on and off
  compare: true,
  safe: false,
});
export const SAFE_POLICY = Object.freeze({
  welcome: true, tour: true, record: true, legend: false, placeKeyboard: false, placePointer: false,
  status: false, compare: false, safe: true,
});
export const DEFAULT_POLICY = SAFE_POLICY;

/** May a line of this kind speak? via: "key" or "pointer" (what the visitor used). */
export function allowed(policy, kind, via = "key") {
  const p = policy || DEFAULT_POLICY;
  if (kind === "place") return via === "key" ? !!p.placeKeyboard : !!p.placePointer;
  return p[kind] !== false;
}

/** The text of a line in a language (English when the line has no translation), or "". */
export function lineText(id, lang = "en") {
  return LINES[lang]?.[id] ?? LINES.en[id] ?? "";
}

/** The place's line ("Next stop: ..."), or null for a place the script does not name. */
export function placeLine(placeId) {
  const id = `P-${placeId}`;
  return LINES.en[id] ? id : null;
}

/**
 * The lines for an event, in order. ctx: { kind ("key", "sr" or "touch": how the visitor is using
 * the page, see tour.js), haptics, recordIndex, placeId, stop (a tour stop), first, pairPlace }.
 */
export function linesFor(event, ctx = {}) {
  const sfx = ctx.kind === "sr" ? "t" : ctx.kind === "touch" ? "v" : "";
  const touchy = ctx.kind === "sr" || ctx.kind === "touch";
  switch (event) {
    // Explore on my own, with the voice on: the welcome and how to move about.
    case "welcome": return ["S01", touchy ? "S03" : "S02", ...(touchy && ctx.haptics ? ["S17"] : []), ...(touchy ? [] : ["S16"])];
    // The guided tour.
    case "tourOpen": return ["T01", `T02${sfx}`];
    case "tourStop": return [ctx.stop?.before, placeLine(ctx.stop?.place), ctx.stop?.line].filter(Boolean);
    case "tourEnd": return [`T04${sfx}`];
    case "tourStopped": return ["T05"];
    case "place": return [placeLine(ctx.placeId)].filter(Boolean);
    case "record": return ctx.recordIndex === 1 ? ["R02s"] : ctx.recordIndex === 0 ? ["R01s"] : [];
    case "legend": return ["S06", "L1", "L2", "L3", "L4"];
    case "pause": return ["S07"];
    case "continue": return ["S08"];
    case "stop": return ["S09"];
    case "end": return [`S10${sfx}`];
    case "loading": return ["S11"];
    case "failed": return ["S12"];
    case "home": return ["S13"];
    case "voiceOff": return ["S14"];
    case "voiceOn": return ["S15"];
    case "compare":
      if (ctx.pairPlace === "equatorial-pacific") return ["C02"];
      if (ctx.pairPlace === "uberlandia") return ["C03"];
      return ctx.first ? ["C01"] : [];
    default: return [];
  }
}

/** About how long a line takes to say (ms), for ducking the music: about 70 ms a character. */
export function lineMs(text) {
  return Math.min(15000, Math.max(700, Math.round(300 + 70 * String(text).length)));
}

/* ---------- The voice itself (browser only) ---------- */

/**
 * createVoice({ lang, duck }): say(ids, { delay, onEnd }) speaks a line or a list of lines (one
 * pending request at most: a newer one replaces it); cancel() stops at once; enabled(on).
 * duck(ms) lowers the music while a line plays. Nothing speaks before arm() (the first gesture).
 */
/**
 * quiet(): true while the music of a Play is sounding: no line starts then (the listener feels the
 * tension rise in the music itself); a caller that knows the music is not sounding yet (it waits
 * for its instruments) passes overMusic: true.
 */
export function createVoice({ lang = () => "en", duck = () => {}, base = "voice/", policy = () => DEFAULT_POLICY, quiet = () => false } = {}) {
  // The policy in force: a function (the page picks safe or full from how the visitor is using it),
  // with per-kind overrides from setPolicy on top.
  let overrides = {};
  const rulesNow = () => ({ ...(typeof policy === "function" ? policy() : policy), ...overrides });
  let on = false;
  let armed = false;
  let token = 0;
  let timer = 0;
  let audio = null;
  // ONE audio element for every clip, first started inside a gesture (unlock): phones, iOS above all,
  // may block a new Audio() created later outside a gesture.
  const player = typeof Audio !== "undefined" ? new Audio() : null;
  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  let unlocked = false;
  const clips = new Map(); // lang -> true (clips exist), false (use speech synthesis), Promise (probing)
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

  /** Do the recorded clips exist for this language? Probed once (one request for its first line). */
  function probe(l) {
    if (clips.has(l)) return Promise.resolve(clips.get(l));
    const p = fetch(`${base}${l}/S01.mp3`, { method: "HEAD" }).then((r) => r.ok, () => false).then((ok) => { clips.set(l, ok); return ok; });
    clips.set(l, p);
    return p;
  }

  let speaking = false;
  let pending = null; // { list, delay, resolve }: the one line waiting for the current one

  function run(list, delay) {
    const my = ++token;
    stopNow();
    pending?.resolve(false);
    pending = null;
    return new Promise((resolve) => {
      speaking = true;
      timer = setTimeout(async () => {
        timer = 0;
        let ok = true;
        for (const id of list) {
          if (!(await one(id, my))) { ok = false; break; }
        }
        if (my !== token) { resolve(false); return; }
        speaking = false;
        resolve(ok);
        const next = pending;
        pending = null;
        if (next) run(next.list, next.delay).then(next.resolve);
      }, delay);
    });
  }

  function stopNow() {
    clearTimeout(timer);
    timer = 0;
    if (audio) { audio.onended = audio.onerror = null; try { audio.pause(); } catch { /* gone */ } audio = null; }
    try { synth?.cancel(); } catch { /* none */ }
  }

  /** Speak one line; resolves true when it finished, false when cancelled or impossible. */
  async function one(id, my) {
    const l = lang();
    const text = lineText(id, l);
    if (!text || my !== token) return false;
    const recorded = await Promise.resolve(probe(l));
    if (my !== token) return false;
    duck(lineMs(text) + 300);
    if (recorded && player) {
      const ok = await new Promise((resolve) => {
        audio = player;
        audio.src = `${base}${l}/${id}.mp3`;
        audio.onended = () => resolve(true);
        audio.onerror = () => resolve(null); // this clip is missing: the device voice says it
        audio.play().catch(() => resolve(null));
      });
      audio = null;
      if (ok !== null) return ok && my === token;
      if (my !== token) return false;
    }
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = l;
      u.rate = 1;
      u.onend = () => resolve(my === token);
      u.onerror = () => resolve(false);
      synth.speak(u);
      // Some engines never fire onend: give up after twice the expected time.
      setTimeout(() => resolve(my === token), lineMs(text) * 2 + 1500);
    });
  }

  return {
    /** Turn the voice on or off (off cancels whatever it is saying). */
    enabled(next) { on = !!next; if (!on) { token += 1; stopNow(); speaking = false; pending?.resolve(false); pending = null; } },
    isOn: () => on,
    /** Switch kinds of line on or off: setPolicy({ placeKeyboard: true }). */
    setPolicy(next) { overrides = { ...overrides, ...next }; },
    policy: () => rulesNow(),
    /** Is the safe policy in force (a screen reader likely)? */
    safe: () => !!rulesNow().safe,
    /** Would a line of this kind speak now? (The caller can then wait for it.) */
    willSay: (kind, via = "key") => on && armed && allowed(rulesNow(), kind, via),
    /** The first user gesture happened: the voice may speak from now on. */
    arm() { armed = true; },
    /** Inside a gesture: start the one audio element once (silently), so later clips may play. */
    unlock() {
      if (unlocked || !player) return;
      unlocked = true;
      try { player.src = SILENT; const p = player.play(); p?.catch?.(() => { unlocked = false; }); } catch { unlocked = false; }
    },
    /**
     * Say a line or lines, after delay ms of quiet. interrupt: stop what is being said and say this
     * now (a choice by the visitor); otherwise it waits for the line being said, and replaces any
     * line already waiting (one pending line at most). Resolves true when every line was said,
     * false when it was replaced, cancelled, or the voice is off.
     */
    say(ids, { delay = 0, interrupt = true, force = false, kind = "status", via = "key", overMusic = false } = {}) {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
      if ((!on && !force) || !armed || !list.length) return Promise.resolve(false);
      if (!overMusic && quiet()) return Promise.resolve(false); // never a line over the music
      if (!force && !allowed(rulesNow(), kind, via)) return Promise.resolve(false);
      if (!interrupt && speaking) {
        pending?.resolve(false);
        return new Promise((resolve) => { pending = { list, delay, resolve }; });
      }
      return run(list, delay);
    },    /** Stop at once and drop anything pending. */
    cancel() { token += 1; stopNow(); speaking = false; pending?.resolve(false); pending = null; },
    /** True while a line is waiting or being said. */
    busy: () => speaking,
  };
}
