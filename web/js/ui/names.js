// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Brazilian Portuguese names for the places and records of the blind-test flow.
// The data files (web/data, Arthur's) stay English and unchanged; this table is keyed by their ids.
// Switching language rewrites name, title, short, quantity and unit on the loaded objects, so every
// reader (lists, the VFD, announcements, the DJ) speaks the current language without its own lookup.
// An id missing here keeps its English text.

export const PT = {
  places: {
    uberlandia: "Uberlândia, Brasil",
    cerrado: "Cerrado, Tocantins, Brasil (Jalapão)",
    roraima: "Savana de Roraima, Brasil",
    amazon: "Floresta Amazônica, Brasil",
    "sao-paulo": "São Paulo, Brasil",
    "off-santos": "Oceano Atlântico na costa de Santos, Brasil",
    "off-recife": "Oceano Atlântico na costa do Recife, Brasil",
    "amazon-plume": "Oceano Atlântico na foz do Amazonas",
    "equatorial-pacific": "Pacífico equatorial (perto de 0°, 140°O)",
    "off-peru": "Oceano Pacífico na costa do Peru",
    "off-california": "Oceano Pacífico na costa da Califórnia",
    "gulf-of-alaska": "Golfo do Alasca",
    "gulf-of-mexico": "Golfo do México",
    "north-atlantic-cold-blob": "Mancha fria do Atlântico Norte, ao sul da Groenlândia",
    "north-atlantic": "Atlântico Norte",
    mediterranean: "Mar Mediterrâneo",
    "off-namibia": "Oceano Atlântico na costa da Namíbia",
    "indian-ocean": "Oceano Índico",
    "north-pacific-heatwave": "Onda de calor marinha do Pacífico Norte, a leste do Japão",
    "off-japan": "Oceano Pacífico na costa do Japão",
    "coral-sea": "Mar de Coral, a leste da Grande Barreira de Corais",
    "southern-ocean": "Oceano Austral, ao sul da África",
    "gran-chaco": "Gran Chaco, Paraguai",
    "los-angeles": "Los Angeles, EUA",
    saskatchewan: "Floresta boreal, Saskatchewan, Canadá",
    "northern-nigeria": "Savana do norte da Nigéria (Kaduna)",
    angola: "Florestas de miombo, Angola",
    borneo: "Turfeiras de Kalimantan Central, Bornéu",
    "northern-australia": "Norte da Austrália",
    "northern-thailand": "Norte da Tailândia (Chiang Mai)",
  },
  records: {
    "sst-anomaly": {
      title: "Anomalia da temperatura do mar",
      short: "Temperatura do oceano comparada ao normal",
    },
    fire: {
      title: "Focos de incêndio",
      short: "Atividade de fogo (densidade de pixels quentes)",
    },
  },
  // Quantity and unit are translated by their exact English text: if the pipeline changes them,
  // the English text stays rather than a Portuguese one that no longer says the same thing.
  text: {
    "sea surface temperature anomaly": "anomalia da temperatura da superfície do mar",
    "fire activity (hot-pixel density)": "atividade de fogo (densidade de pixels quentes)",
    "fire activity (hot-pixel density, relative)": "atividade de fogo (densidade de pixels quentes, relativa)",
    "% of land pixels with fire dots": "% dos pixels de terra com pontos de fogo",
  },
};

const english = new WeakMap(); // object -> { field: original English text }

/** Set obj[field] to text, or back to its English original when text is undefined. */
function put(obj, field, text) {
  if (!obj || !(field in obj)) return;
  let saved = english.get(obj);
  if (!saved) english.set(obj, (saved = {}));
  if (!(field in saved)) saved[field] = obj[field];
  obj[field] = text ?? saved[field];
}

/** Rewrite the display names of places, records (records.json rows) and record metas for lang. */
export function localizeData({ places = [], records = [], metas = [] }, lang) {
  const pt = lang === "pt-BR";
  for (const p of places) put(p, "name", pt ? PT.places[p.id] : undefined);
  for (const r of records) put(r, "title", pt ? PT.records[r.id]?.title : undefined);
  for (const m of metas) {
    const tr = pt ? PT.records[m.id] : undefined;
    for (const field of ["title", "short"]) put(m, field, tr?.[field]);
    for (const field of ["quantity", "unit"]) {
      if (!(field in m)) continue;
      const en = english.get(m)?.[field] ?? m[field];
      put(m, field, pt ? PT.text[en] : undefined);
    }
  }
}
