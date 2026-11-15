// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Turntable stage view in WebGL (three.js r170, vendored). A decorative mirror of the player state,
// hidden from assistive tech: every action here also exists as a native control on the page.
// The record is a picture disc pressed from the EIC south polar frame (center = South Pole,
// picture rim = 15 degrees north, angle = longitude, 0 up, east clockwise). Every place is an amber
// dot on it; the tonearm lifts, swings and lowers onto the selected place and the platter turns
// once per date. Implements the stage view interface (setPlaces, select, setRecord, setFrame, ...).

import * as THREE from "three";
import { discRadius } from "./geometry.js";
import { createSky, eqToWorld } from "./sky.js";

const R_REC = 0.96; // record radius (world units)
const MAP_FRAC = 0.92; // picture radius / record radius: its edge is 15 degrees north
const LABEL_FRAC = 0.28; // label radius / record radius
const REC_Y = 0.136; // top of the record surface
const C = new THREE.Vector2(-0.45, 0.05); // platter center (x, z)
const P = new THREE.Vector2(1.08, -0.78); // tonearm pivot (x, z)
const ARM_L = 1.72;
const TIP_DROP = 0.105; // stylus tip below the arm axis
const LIFT = 0.1; // arm pitch when lifted (radians)
const TEX = 1536;
const AMBER = 0xffb547;
const PLINTH_W = 3.05; // trimmed close round the platter and the arm, so the record carries the stage
const PLINTH_D = 2.35;
const PLINTH_X = -0.08; // plinth center (x)
const TAP_PX = 6; // pointer travel under this is a click or tap
const HIT_PX = 14; // hit radius of a dot (at least 24 CSS px across)

export function supportsWebGL() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/* ---------- Small helpers ---------- */

function makeCanvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function spring(value, target, vel, dt, k = 60, d = 15) {
  const a = k * (target - value) - d * vel;
  vel += a * dt;
  value += vel * dt;
  return [value, vel];
}
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;

function cssFont(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function labelDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || ""} ${m[1]}`;
}

/** Where a place sits on the record, as a fraction of the record radius. North of 15N: the outer band. */
function placeRadius(lat) {
  if (lat <= 15) return discRadius(lat) * MAP_FRAC;
  return MAP_FRAC + 0.016 + 0.05 * clamp((lat - 15) / 50, 0, 1);
}

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r);
  s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  s.lineTo(-w / 2, -d / 2 + r);
  s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  return s;
}

/* ---------- Procedural textures ---------- */

/** Normal map with concentric grooves and track gaps, plus an anisotropy map along the grooves. */
function grooveMaps() {
  const N = 1024;
  const n = makeCanvas(N);
  const a = makeCanvas(N);
  const ng = n.getContext("2d");
  const ag = a.getContext("2d");
  const nd = ng.createImageData(N, N);
  const ad = ag.createImageData(N, N);
  const half = N / 2;
  const gaps = [0.4, 0.53, 0.66, 0.78, 0.885];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const r = Math.hypot(dx, dy);
      const i = (y * N + x) * 4;
      let tilt = 0;
      let strength = 0;
      if (r > LABEL_FRAC + 0.015 && r < 0.995) {
        tilt = 0.18 * Math.sin(r * 1400);
        for (const gp of gaps) {
          const d = Math.abs(r - gp);
          if (d < 0.006) tilt += 0.55 * Math.cos((d / 0.006) * Math.PI * 0.5) * Math.sign(r - gp || 1);
        }
        strength = 1;
      }
      const ux = r ? dx / r : 0;
      const uy = r ? dy / r : 0;
      // Tangent-space normal tilted along the radius; image y runs down, texture v up.
      nd.data[i] = Math.round((ux * tilt * 0.5 + 0.5) * 255);
      nd.data[i + 1] = Math.round((-uy * tilt * 0.5 + 0.5) * 255);
      nd.data[i + 2] = 255;
      nd.data[i + 3] = 255;
      // Anisotropy direction along the groove (tangential).
      ad.data[i] = Math.round((-uy * 0.5 + 0.5) * 255);
      ad.data[i + 1] = Math.round((-ux * 0.5 + 0.5) * 255);
      ad.data[i + 2] = Math.round(strength * 255);
      ad.data[i + 3] = 255;
    }
  }
  ng.putImageData(nd, 0, 0);
  ag.putImageData(ad, 0, 0);
  const nt = new THREE.CanvasTexture(n);
  const at = new THREE.CanvasTexture(a);
  for (const t of [nt, at]) {
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 16;
  }
  return { normal: nt, aniso: at };
}

/**
 * Surface finish of the record: R = clearcoat, A = specular intensity. The picture area is kept
 * low gloss so the studio reflections never tint the NASA frame; the vinyl band stays glossy.
 */
function finishMap() {
  const N = 512;
  const c = makeCanvas(N);
  const g = c.getContext("2d");
  const h = N / 2;
  const ring = (r, color) => {
    // Replace, not blend: the alpha channel carries the specular intensity.
    g.save();
    g.beginPath();
    g.arc(h, h, r * h, 0, Math.PI * 2);
    g.clip();
    g.clearRect(0, 0, N, N);
    g.fillStyle = color;
    g.fillRect(0, 0, N, N);
    g.restore();
  };
  g.fillStyle = "rgba(255,255,255,1)";
  g.fillRect(0, 0, N, N);
  ring(MAP_FRAC, "rgba(40,40,40,0.16)");
  ring(LABEL_FRAC, "rgba(40,40,40,0.3)");
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = false;
  return t;
}

function glowTexture(rgb) {
  const c = makeCanvas(128);
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.22, `rgba(${rgb},0.5)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowSprite(tex) {
  const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  return new THREE.Sprite(m);
}

/** A dark studio with a cool softbox above and cobalt strips behind and to the sides: the reflections of the logo. */
function studioEnvironment() {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(32, 22, 32), new THREE.MeshBasicMaterial({ color: 0x010102, side: THREE.BackSide }));
  s.add(room);
  const panel = (w, h, pos, rgb) => {
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    m.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(...pos);
    p.lookAt(0, 0, 0);
    s.add(p);
  };
  // Product-photography softbox: large, cool, brightest in the middle and falling off to its edges.
  // It hangs behind and above the deck, where the camera's view reflects off the lacquer top, so the
  // top shows a broad gentle highlight gradient.
  const grad = makeCanvas(256);
  const gg = grad.getContext("2d");
  const rg = gg.createRadialGradient(128, 128, 10, 128, 128, 128);
  rg.addColorStop(0, "#ffffff");
  rg.addColorStop(0.45, "#4a505c");
  rg.addColorStop(1, "#000000");
  gg.fillStyle = rg;
  gg.fillRect(0, 0, 256, 256);
  const gradTex = new THREE.CanvasTexture(grad);
  const softbox = new THREE.Mesh(new THREE.PlaneGeometry(20, 11), new THREE.MeshBasicMaterial({ map: gradTex, side: THREE.DoubleSide }));
  softbox.material.color.setRGB(0.75, 0.82, 1.0, THREE.LinearSRGBColorSpace);
  softbox.position.set(0, 8.5, -8.5);
  softbox.lookAt(0, 0, 0);
  s.add(softbox);
  panel(7, 3.5, [0.5, 6.8, 2.5], [0.8, 0.88, 1.05]); // cool key softbox overhead, a little in front
  // Thin white strips at the horizon all round: the chrome edges, the platter rim and the plinth sides catch them.
  panel(22, 0.45, [0, 0.9, -11.5], [1.2, 1.25, 1.35]);
  panel(22, 0.45, [0, 0.9, 11.5], [0.8, 0.85, 0.95]);
  panel(22, 0.45, [-11.5, 0.9, 0], [1.0, 1.05, 1.15]);
  panel(22, 0.45, [11.5, 0.9, 0], [1.0, 1.05, 1.15]);
  // Cobalt accents (the logo's rim light), kept below the white light.
  panel(16, 1.2, [0, 2.6, -11], [0.12, 0.35, 2.6]);
  panel(1.4, 6, [-11, 2.2, -2], [0.08, 0.25, 1.8]);
  return s;
}

/* ---------- The deck ---------- */

export async function createTurntable(canvasEl, opts = {}) {
  const reducedMotion = opts.reducedMotion || (() => false);
  const safeArea = opts.safeArea || (() => null);
  const onPick = opts.onPick || (() => {});
  const onHover = opts.onHover || (() => {});
  const host = canvasEl.parentElement;

  canvasEl.style.display = "block";
  canvasEl.style.width = "100%";
  canvasEl.style.height = "100%";
  canvasEl.style.touchAction = "pan-y";
  canvasEl.setAttribute("aria-hidden", "true");

  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  renderer.autoClear = false; // the sky is drawn first, then the deck over it

  // The same sky as the globe (NASA Deep Star Map and star catalog), in a fixed orientation, so the
  // two stage pictures are one place. It is its own scene: it never lights or tints the deck.
  // opts.sky = { starmap, stars, glow } (page-relative URLs) or false. A missing file leaves the
  // procedural fallback stars of sky.js.
  let sky = null;
  if (opts.sky !== false) {
    try {
      const so = opts.sky || {};
      sky = createSky({
        starmap: so.starmap ?? "css/img/sky-starmap-2048.jpg",
        stars: so.stars ?? "css/img/sky-stars.json",
        glow: so.glow ?? "css/img/sky-glow-1024.jpg", // star-free Milky Way; the star map above is its fallback
        bodies: false, // no Sun, Moon or planets behind the deck
        anisotropy: renderer.capabilities.getMaxAnisotropy(),
        onChange: () => kick(),
      });
    } catch {
      sky = null;
    }
  }

  // The sky is seen through its own camera, turned so the part behind the deck is the north
  // galactic pole (RA 192.86, Dec +27.13): the darkest, quietest patch of sky, far from the bright
  // Milky Way core and the Magellanic Clouds, which read as a stray glow under the deck.
  const skyCam = new THREE.PerspectiveCamera();
  const skyTurn = new THREE.Quaternion();
  const quietDir = eqToWorld(192.86, 27.13);

  // A black veil drawn over the sky (never over the deck) keeps space dark and quiet behind the record.
  const veilScene = new THREE.Scene();
  const veilCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const veilMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, toneMapped: false });
  veilScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), veilMat));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = studioEnvironment();
  const envTex = pmrem.fromScene(envScene, 0.02).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2500); // far: the sky sphere sits at 900
  const target = new THREE.Vector3(0, 0, 0);

  // Cool key from the upper left front, cobalt rim light from behind.
  const key = new THREE.DirectionalLight(0xe4ecff, 2.6);
  key.position.set(-2.6, 5.2, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.4;
  key.shadow.camera.bottom = -2.4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
  fill.position.set(3.5, 2.0, 4.0);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x3a74ff, 1.8);
  rim.position.set(0.8, 2.2, -4.5);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0x6aa5ff, 0.8);
  rim2.position.set(-4.5, 1.6, -1.5);
  scene.add(rim2);

  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  /* Plinth: black lacquer with a fine chrome edge around the top. */
  const lacquer = keep(new THREE.MeshPhysicalMaterial({ color: 0x030405, roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }));
  const chrome = keep(new THREE.MeshPhysicalMaterial({ color: 0xeef3ff, metalness: 1, roughness: 0.07 }));
  const trimChrome = keep(new THREE.MeshPhysicalMaterial({ color: 0xf2f6ff, metalness: 1, roughness: 0.22, emissive: 0x1a2440, emissiveIntensity: 0.6 }));
  const steel = keep(new THREE.MeshPhysicalMaterial({ color: 0xc4ccd8, metalness: 1, roughness: 0.2 }));
  const anodized = keep(new THREE.MeshPhysicalMaterial({ color: 0x0e1016, metalness: 0.85, roughness: 0.32, clearcoat: 0.4, clearcoatRoughness: 0.2 }));
  const gunmetal = keep(new THREE.MeshPhysicalMaterial({ color: 0x59606c, metalness: 1, roughness: 0.18 })); // polished dark metal for the arm

  const plinthGeo = keep(new THREE.ExtrudeGeometry(roundedRect(PLINTH_W, PLINTH_D, 0.14), { depth: 0.32, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3, curveSegments: 12 }));
  plinthGeo.rotateX(-Math.PI / 2);
  const plinth = new THREE.Mesh(plinthGeo, lacquer);
  plinth.position.set(PLINTH_X, -0.33, 0);
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  scene.add(plinth);

  const trimShape = roundedRect(PLINTH_W, PLINTH_D, 0.14);
  trimShape.holes.push(roundedRect(PLINTH_W - 0.032, PLINTH_D - 0.032, 0.124));
  const trimGeo = keep(new THREE.ExtrudeGeometry(trimShape, { depth: 0.007, bevelEnabled: false, curveSegments: 16 }));
  trimGeo.rotateX(-Math.PI / 2);
  const trim = new THREE.Mesh(trimGeo, trimChrome);
  trim.position.set(PLINTH_X, 0, 0);
  scene.add(trim);
  const footTrimShape = roundedRect(PLINTH_W + 0.02, PLINTH_D + 0.02, 0.15);
  footTrimShape.holes.push(roundedRect(PLINTH_W, PLINTH_D, 0.14));
  const footGeo = keep(new THREE.ExtrudeGeometry(footTrimShape, { depth: 0.01, bevelEnabled: false, curveSegments: 16 }));
  footGeo.rotateX(-Math.PI / 2);
  const foot = new THREE.Mesh(footGeo, trimChrome);
  foot.position.set(PLINTH_X, -0.345, 0);
  scene.add(foot);

  // No shadow catcher: the deck floats in the same star field as the globe, and a shadow on
  // empty space would only blot out stars.

  // Front: a start key (no pilot lamp).
  const startKey = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.026, 0.2), lacquer);
  startKey.position.set(-1.35, 0.013, 1.0);
  startKey.castShadow = true;
  scene.add(startKey);
  const keyEdge = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.004, 0.21), chrome);
  keyEdge.position.set(-1.35, 0.003, 1.0); // a chrome plate just under the key: only its edge shows
  scene.add(keyEdge);

  /* Platter: polished steel with a black mat. */
  const platterGroup = new THREE.Group();
  platterGroup.position.set(C.x, 0, C.y);
  scene.add(platterGroup);
  const spin = new THREE.Group(); // everything that rotates
  platterGroup.add(spin);
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.06, 0.1, 160, 1, false), [chrome, steel, steel]);
  platter.position.y = 0.07;
  platter.castShadow = true;
  platter.receiveShadow = true;
  spin.add(platter);
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.008, 128), keep(new THREE.MeshStandardMaterial({ color: 0x07080b, roughness: 0.95 })));
  mat.position.y = 0.124;
  mat.receiveShadow = true;
  spin.add(mat);

  /* The record: black vinyl edge and a picture-disc top with grooves. */
  const edge = new THREE.Mesh(
    new THREE.CylinderGeometry(R_REC, R_REC, 0.009, 192, 1, true),
    keep(new THREE.MeshPhysicalMaterial({ color: 0x050507, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 })),
  );
  edge.position.y = REC_Y - 0.0045;
  spin.add(edge);

  const discCanvas = makeCanvas(TEX);
  const discTex = keep(new THREE.CanvasTexture(discCanvas));
  discTex.colorSpace = THREE.SRGBColorSpace;
  discTex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const grooves = grooveMaps();
  keep(grooves.normal);
  keep(grooves.aniso);
  const finish = keep(finishMap());
  const recordMat = keep(new THREE.MeshPhysicalMaterial({
    // The picture shows mostly by its own light so the cobalt studio never shifts the data colors.
    map: discTex,
    color: 0x9a9a9a,
    emissive: 0xffffff,
    emissiveMap: discTex,
    emissiveIntensity: 0.62,
    normalMap: grooves.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.3,
    metalness: 0,
    clearcoat: 1,
    clearcoatMap: finish,
    clearcoatRoughness: 0.08,
    specularIntensityMap: finish,
    anisotropy: 0.9,
    anisotropyMap: grooves.aniso,
    specularIntensity: 0.9,
  }));
  const top = new THREE.Mesh(new THREE.CircleGeometry(R_REC, 256), recordMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = REC_Y;
  top.receiveShadow = true;
  spin.add(top);

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 24), chrome);
  spindle.position.y = REC_Y + 0.03;
  spin.add(spindle);

  /* Place dots: amber, turning with the record. Hollow on the outer band (north of 15N). */
  const dotsGroup = new THREE.Group();
  dotsGroup.position.y = REC_Y + 0.0015;
  spin.add(dotsGroup);
  const discGeo = keep(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
  const ringGeo = keep(new THREE.RingGeometry(0.52, 1, 32).rotateX(-Math.PI / 2));
  const keyGeo = keep(new THREE.RingGeometry(0.97, 1.3, 32).rotateX(-Math.PI / 2)); // thin dark keyline round a filled dot
  const keyRingGeo = keep(new THREE.RingGeometry(0.36, 1.18, 32).rotateX(-Math.PI / 2)); // keyline under a hollow dot
  const haloMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }));
  // Transparent pass for all of them, so renderOrder keeps each dot above its dark halo.
  const dotMat = keep(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, depthWrite: false, toneMapped: false }));
  const dimMat = keep(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
  const dimHaloMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
  let dots = []; // { id, name, lat, lon, active, north, group, dot, halo, local: Vector3 }

  // Selected place: amber ring with a soft glow.
  const marker = new THREE.Group();
  const ringMat = keep(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, depthWrite: false, toneMapped: false }));
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.68, 1, 64).rotateX(-Math.PI / 2)), ringMat);
  const ringHalo = new THREE.Mesh(keep(new THREE.RingGeometry(0.6, 1.1, 64).rotateX(-Math.PI / 2)), haloMat);
  // A second, thinner amber ring further out, so the selected place reads from across the room.
  const outerMat = keep(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  const outer = new THREE.Mesh(keep(new THREE.RingGeometry(1.42, 1.54, 64).rotateX(-Math.PI / 2)), outerMat);
  outer.renderOrder = 4;
  marker.add(outer);
  ringHalo.position.y = -0.0004;
  ringHalo.renderOrder = 3;
  ring.renderOrder = 4;
  marker.add(ringHalo, ring);
  const amberGlowTex = keep(glowTexture("255,181,71"));
  const glow = glowSprite(amberGlowTex);
  glow.position.y = 0.01;
  marker.add(glow);
  marker.position.y = REC_Y + 0.0025;
  marker.visible = false;
  spin.add(marker);

  /* Tonearm: base, gimbal, tube, counterweight, headshell, cartridge, stylus; a rest post. */
  const armBase = new THREE.Group();
  armBase.position.set(P.x, 0, P.y);
  scene.add(armBase);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 64), gunmetal);
  base.position.y = 0.025;
  base.castShadow = true;
  armBase.add(base);
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.006, 8, 64), chrome);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.05;
  armBase.add(baseRing);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.13, 48), steel);
  collar.position.y = 0.11;
  collar.castShadow = true;
  armBase.add(collar);
  const yaw = new THREE.Group();
  yaw.position.y = REC_Y + TIP_DROP;
  armBase.add(yaw);
  const pitch = new THREE.Group();
  yaw.add(pitch);
  const gimbal = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.09, 32), chrome);
  gimbal.rotation.x = Math.PI / 2;
  gimbal.castShadow = true;
  pitch.add(gimbal);
  const tubeGeo = new THREE.CylinderGeometry(0.019, 0.019, ARM_L + 0.3, 24);
  tubeGeo.rotateZ(-Math.PI / 2);
  tubeGeo.translate((ARM_L - 0.3) / 2, 0, 0);
  const tube = new THREE.Mesh(tubeGeo, chrome);
  tube.castShadow = true;
  pitch.add(tube);
  const cwGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.17, 48);
  cwGeo.rotateZ(Math.PI / 2);
  const counterweight = new THREE.Mesh(cwGeo, gunmetal);
  counterweight.position.x = -0.28;
  counterweight.castShadow = true;
  pitch.add(counterweight);
  const head = new THREE.Group();
  head.position.x = ARM_L;
  head.rotation.y = 0.32; // headshell offset angle
  pitch.add(head);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.022, 0.085), chrome);
  shell.position.set(0.02, 0, 0);
  shell.castShadow = true;
  head.add(shell);
  const fingerLift = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.02), chrome);
  fingerLift.position.set(0.12, 0.012, -0.05);
  head.add(fingerLift);
  const cart = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.06), keep(new THREE.MeshPhysicalMaterial({ color: 0x07080b, roughness: 0.3, clearcoat: 0.8 })));
  cart.position.set(0, -0.04, 0);
  cart.castShadow = true;
  head.add(cart);
  const stylus = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.04, 12), chrome);
  stylus.rotation.x = Math.PI;
  stylus.position.set(0, -TIP_DROP + 0.02, 0);
  head.add(stylus);
  const tipGlow = glowSprite(amberGlowTex);
  tipGlow.position.set(0, -TIP_DROP + 0.006, 0);
  tipGlow.scale.setScalar(0.12);
  tipGlow.material.opacity = 0;
  head.add(tipGlow);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 24), anodized);
  post.position.set(P.x, 0.1, P.y + ARM_L * 0.62);
  post.castShadow = true;
  scene.add(post);

  /* ---------- State ---------- */

  const st = {
    yaw: Math.PI / 2, yawV: 0, yawT: Math.PI / 2,
    pitch: LIFT, pitchV: 0, pitchT: LIFT,
    theta: 0, from: 0, to: 0, t0: 0, dur: 0, ease: "inout",
    power: false, playing: false,
    want: { rho: 0.6 * R_REC, lon: 0 },
    phase: "rest", // rest | lift | swing | lower | down | settle
    cam: reducedMotion() ? 1 : 0, // entrance progress
    flash: 0, flashKind: "value", flashT: 0,
    dragging: false,
    hover: null,
  };
  let places = [];
  let selectedId = null;
  let meta = null;
  let frameDate = "";
  let shown = true;
  let disposed = false;

  // Stylus tip in pivot space for a given yaw angle a (direction cos a, sin a in x/z).
  const tipAt = (a) => new THREE.Vector2(P.x + ARM_L * Math.cos(a), P.y + ARM_L * Math.sin(a));
  function yawFor(rho) {
    const f = (a) => tipAt(a).distanceTo(C) - rho;
    let lo = Math.PI / 2;
    let hi = Math.atan2(C.y - P.y, C.x - P.x);
    if (f(lo) * f(hi) > 0) return Math.abs(f(lo)) < Math.abs(f(hi)) ? lo : hi;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }
  // Clockwise angle (from screen-up, -z) of the stylus on the record.
  function stylusAngle(a) {
    const t = tipAt(a);
    return Math.atan2(t.x - C.x, -(t.y - C.y));
  }
  // A record point at longitude lon sits at world angle lon + theta: spin so it is under the stylus.
  function alignedTheta(lonRad, a, near = st.to) {
    const want = stylusAngle(a) - lonRad;
    const k = Math.round((near - want) / TAU);
    return want + k * TAU;
  }
  const lonRad = () => (st.want.lon * Math.PI) / 180;

  function seek(to, ms, ease = "inout") {
    st.from = st.theta;
    st.to = to;
    st.t0 = performance.now();
    st.dur = Math.max(0, ms);
    st.ease = ease;
    if (!st.dur) st.theta = to;
    kick();
  }

  /* ---------- Disc artwork: picture disc with lead-in, label and spindle hole ---------- */

  let discImg = null; // the loaded picture being shown
  let discUrl = "";
  let loadToken = 0;

  function paintDisc() {
    const g = discCanvas.getContext("2d");
    const h = TEX / 2;
    g.clearRect(0, 0, TEX, TEX);
    g.fillStyle = "#060609";
    g.beginPath();
    g.arc(h, h, h, 0, TAU);
    g.fill();
    if (discImg && discImg.naturalWidth) {
      g.save();
      g.beginPath();
      g.arc(h, h, h * MAP_FRAC, 0, TAU);
      g.clip();
      g.drawImage(discImg, h - h * MAP_FRAC, h - h * MAP_FRAC, h * MAP_FRAC * 2, h * MAP_FRAC * 2);
      // A thin dark wash at the rim so it reads as ink pressed under clear vinyl.
      const v = g.createRadialGradient(h, h, h * 0.55, h, h, h * MAP_FRAC);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.22)");
      g.fillStyle = v;
      g.fillRect(0, 0, TEX, TEX);
      g.restore();
    }
    // Picture rim (15N) and the lead-in grooves of the outer band.
    g.strokeStyle = "rgba(200,220,255,0.16)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(h, h, h * MAP_FRAC + 1, 0, TAU);
    g.stroke();
    g.strokeStyle = "rgba(170,200,255,0.05)";
    g.lineWidth = 1;
    for (let r = h * MAP_FRAC + 6; r < h - 4; r += 4) {
      g.beginPath();
      g.arc(h, h, r, 0, TAU);
      g.stroke();
    }
    paintLabel(g, h);
    discTex.needsUpdate = true;
    kick();
  }

  function paintLabel(g, h) {
    const lr = h * LABEL_FRAC;
    const display = cssFont("--font-display", '"Gloock", serif');
    const panel = cssFont("--font-panel", '"Michroma", sans-serif');
    // Deep cobalt paper with a soft highlight.
    const lg = g.createRadialGradient(h - lr * 0.35, h - lr * 0.4, lr * 0.05, h, h, lr);
    lg.addColorStop(0, "#2453d6");
    lg.addColorStop(0.45, "#0f339e");
    lg.addColorStop(1, "#061a5e");
    g.fillStyle = lg;
    g.beginPath();
    g.arc(h, h, lr, 0, TAU);
    g.fill();
    // Ice silver hairlines.
    g.strokeStyle = "rgba(232,240,255,0.75)";
    g.lineWidth = lr * 0.012;
    g.beginPath();
    g.arc(h, h, lr * 0.93, 0, TAU);
    g.stroke();
    g.lineWidth = lr * 0.006;
    g.beginPath();
    g.arc(h, h, lr * 0.56, Math.PI * 0.08, Math.PI * 0.92, true);
    g.stroke();

    const silver = g.createLinearGradient(0, h - lr, 0, h + lr);
    silver.addColorStop(0, "#ffffff");
    silver.addColorStop(0.5, "#dce7ff");
    silver.addColorStop(1, "#b9cdf5");
    g.fillStyle = silver;
    g.textAlign = "center";
    g.textBaseline = "middle";

    // "BLUE MARBLE RECORDS" on the upper arc.
    const brand = "BLUE MARBLE RECORDS";
    g.font = `${Math.round(lr * 0.1)}px ${panel}`;
    const arc = Math.PI * 1.02;
    for (let i = 0; i < brand.length; i++) {
      const ang = -Math.PI / 2 - arc / 2 + (arc * (i + 0.5)) / brand.length;
      g.save();
      g.translate(h + Math.cos(ang) * lr * 0.78, h + Math.sin(ang) * lr * 0.78);
      g.rotate(ang + Math.PI / 2);
      g.fillText(brand[i], 0, 0);
      g.restore();
    }
    g.font = `${Math.round(lr * 0.075)}px ${panel}`;
    g.fillStyle = "#cfdcff";
    g.fillText("1 TURN = 1 DATE", h, h - lr * 0.36);

    // Record title in the display serif, two lines at most, shrunk to fit.
    const title = (meta?.title || "").toUpperCase();
    if (title) {
      g.fillStyle = silver;
      const words = title.split(/\s+/);
      let lines = [title];
      if (words.length > 1) {
        let best = null;
        for (let k = 1; k < words.length; k++) {
          const a = words.slice(0, k).join(" ");
          const b = words.slice(k).join(" ");
          const w = Math.max(a.length, b.length);
          if (!best || w < best.w) best = { a, b, w };
        }
        lines = [best.a, best.b];
      }
      let size = lr * 0.2;
      const maxW = lr * 1.42;
      g.font = `${Math.round(size)}px ${display}`;
      const widest = Math.max(...lines.map((l) => g.measureText(l).width));
      if (widest > maxW) size *= maxW / widest;
      g.font = `${Math.round(size)}px ${display}`;
      const y0 = lines.length > 1 ? h + lr * 0.2 : h + lr * 0.3;
      lines.forEach((l, i) => g.fillText(l, h, y0 + i * size * 1.08));
    }
    if (frameDate) {
      g.font = `${Math.round(lr * 0.085)}px ${panel}`;
      g.fillStyle = "#cfdcff";
      g.fillText(labelDate(frameDate), h, h + lr * 0.68);
    }
    // Spindle hole.
    g.fillStyle = "#020203";
    g.beginPath();
    g.arc(h, h, lr * 0.07, 0, TAU);
    g.fill();
  }

  function loadDisc(url) {
    if (!url || url === discUrl) return;
    discUrl = url;
    const token = ++loadToken;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (token !== loadToken || disposed) return;
      discImg = img;
      paintDisc();
    };
    img.onerror = () => {
      if (token === loadToken) discUrl = "";
    };
    img.src = url;
  }

  /* ---------- Place dots ---------- */

  function localPos(lat, lon, out = new THREE.Vector3()) {
    const r = placeRadius(lat) * R_REC;
    const a = (lon * Math.PI) / 180;
    return out.set(r * Math.sin(a), 0, -r * Math.cos(a));
  }

  function buildDots() {
    for (const d of dots) dotsGroup.remove(d.group);
    dots = places.map((p) => {
      const north = p.lat > 15;
      const active = p.active !== false;
      const group = new THREE.Group();
      const halo = new THREE.Mesh(north ? keyRingGeo : keyGeo, active ? haloMat : dimHaloMat);
      halo.renderOrder = 1;
      const dot = new THREE.Mesh(north ? ringGeo : discGeo, active ? dotMat : dimMat);
      dot.position.y = 0.0004;
      dot.renderOrder = 2;
      group.add(halo, dot);
      const local = localPos(p.lat, p.lon);
      group.position.copy(local);
      dotsGroup.add(group);
      return { id: p.id, lat: p.lat, lon: p.lon, active, north, group, dot, halo, local };
    });
    sizeDots();
  }

  // Dots keep a readable size on screen whatever the framing: radius in CSS px converted to world units.
  let pxPerUnit = 200;
  // Sizes follow the disc's on-screen radius: a small disc (phone) gets small dots. Hit areas do not shrink.
  const discPx = () => R_REC * pxPerUnit;
  const ringPx = () => clamp(0.072 * discPx(), 7, 24);
  function sizeDots() {
    const u = 1 / Math.max(1, pxPerUnit);
    for (const d of dots) {
      const hov = st.hover === d.id ? 1.35 : 1;
      const rpx = (d.active ? clamp(0.027 * discPx(), 2.6, 9.5) : clamp(0.018 * discPx(), 2, 6.5)) * hov;
      const s = rpx * u;
      const sd = d.north ? s * 1.15 : s;
      d.dot.scale.setScalar(sd);
      d.halo.scale.setScalar(sd);
    }
    const rp = ringPx() * u;
    ring.scale.setScalar(rp);
    ringHalo.scale.setScalar(rp);
    outer.scale.setScalar(rp);
    glow.scale.setScalar(rp * 5.5);
  }

  function placeMarker() {
    const d = dots.find((x) => x.id === selectedId);
    const p = d || places.find((x) => x.id === selectedId);
    if (!p) {
      marker.visible = false;
      return null;
    }
    localPos(p.lat, p.lon, marker.position);
    marker.position.y = REC_Y + 0.0025;
    marker.visible = true;
    return p;
  }

  /* ---------- Camera framing for the safe area ---------- */

  let viewW = 1;
  let viewH = 1;
  const fit = { dir: new THREE.Vector3(0, 1, 1).normalize(), dist: 8, offX: 0, offY: 0 };
  const corners = [];
  for (const x of [PLINTH_X - PLINTH_W / 2 - 0.02, PLINTH_X + PLINTH_W / 2 + 0.02]) {
    for (const y of [-0.35, 0.34]) {
      for (const z of [-PLINTH_D / 2 - 0.02, PLINTH_D / 2 + 0.02]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  const tmpV = new THREE.Vector3();

  function projectPx(v, out = { x: 0, y: 0 }) {
    tmpV.copy(v).project(camera);
    out.x = (tmpV.x + 1) * 0.5 * viewW;
    out.y = (1 - tmpV.y) * 0.5 * viewH;
    return out;
  }

  function placeCamera(distMul = 1) {
    camera.position.copy(target).addScaledVector(fit.dir, fit.dist * distMul);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function frameCamera() {
    const hostRect = host.getBoundingClientRect();
    let sx = viewW * 0.04;
    let sy = viewH * 0.04;
    let sw = viewW * 0.92;
    let sh = viewH * 0.92;
    let safe = null;
    try { safe = safeArea(); } catch { safe = null; }
    if (safe && safe.width > 40 && safe.height > 40) {
      const l = clamp(safe.left - hostRect.left, 0, viewW);
      const t = clamp(safe.top - hostRect.top, 0, viewH);
      const r = clamp(safe.right - hostRect.left, 0, viewW);
      const b = clamp(safe.bottom - hostRect.top, 0, viewH);
      if (r - l > 40 && b - t > 40) {
        sx = l; sy = t; sw = r - l; sh = b - t;
      }
    }
    const aspect = sw / sh;
    // Wide areas: a three-quarter view. Tall areas: look down more so the record reads larger.
    // Pick the elevation whose projected deck has about the safe box's aspect, so the deck fills it:
    // a squarish or tall box looks down more (the record reads larger), a wide short band less.
    const sinEl = clamp((PLINTH_W / (aspect * PLINTH_D)) * 0.92, Math.sin(THREE.MathUtils.degToRad(40)), Math.sin(THREE.MathUtils.degToRad(62)));
    const el = Math.asin(sinEl);
    const az = THREE.MathUtils.degToRad(5);
    fit.dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    camera.fov = 30;
    camera.aspect = viewW / viewH;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const margin = 0.985;
    let box = null;
    for (let i = 0; i < 5; i++) {
      placeCamera(1);
      box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
      for (const c of corners) {
        const p = projectPx(c);
        box.minX = Math.min(box.minX, p.x); box.maxX = Math.max(box.maxX, p.x);
        box.minY = Math.min(box.minY, p.y); box.maxY = Math.max(box.maxY, p.y);
      }
      const k = Math.max((box.maxX - box.minX) / (sw * margin), (box.maxY - box.minY) / (sh * margin));
      fit.dist *= k;
    }
    placeCamera(1);
    box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const c of corners) {
      const p = projectPx(c);
      box.minX = Math.min(box.minX, p.x); box.maxX = Math.max(box.maxX, p.x);
      box.minY = Math.min(box.minY, p.y); box.maxY = Math.max(box.maxY, p.y);
    }
    fit.offX = (box.minX + box.maxX) / 2 - (sx + sw / 2);
    fit.offY = (box.minY + box.maxY) / 2 - (sy + sh / 2);
    skyTurn.setFromUnitVectors(tmpV.copy(fit.dir).negate(), quietDir);
    camera.setViewOffset(viewW, viewH, fit.offX, fit.offY, viewW, viewH);
    camera.updateProjectionMatrix();
    // Screen scale at the record, for dot sizes and hit areas.
    const a = projectPx(new THREE.Vector3(C.x - R_REC, REC_Y, C.y));
    const b = projectPx(new THREE.Vector3(C.x + R_REC, REC_Y, C.y));
    pxPerUnit = Math.hypot(b.x - a.x, b.y - a.y) / (2 * R_REC);
    sizeDots();
  }

  /* ---------- Loop ---------- */

  let raf = 0;
  let last = 0;
  let idleFrames = 0;
  let inView = true;

  function kick() {
    idleFrames = 0;
    if (!raf && shown && inView && !disposed) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function frame(now) {
    raf = 0;
    if (!shown || disposed) return;
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); // slow frames still settle (springs are sub-stepped)
    last = now;
    const rm = reducedMotion();
    let moving = false;

    // Entrance: the camera settles in once.
    if (rm) st.cam = 1;
    if (st.cam < 1) {
      if (!st.camT0) st.camT0 = now;
      st.cam = Math.min(1, (now - st.camT0) / 1600);
      moving = true;
    }
    const e = 1 - (1 - st.cam) ** 3;
    placeCamera(1 + (1 - e) * 0.35);

    // Needle choreography: lift, swing, lower.
    const swingTarget = yawFor(st.want.rho);
    if (st.dragging) {
      st.pitchT = LIFT;
    } else {
      if (st.phase === "lift") {
        st.pitchT = LIFT;
        if (st.pitch > LIFT * 0.8 || rm) st.phase = "swing";
      }
      if (st.phase === "swing") {
        st.yawT = swingTarget;
        if (Math.abs(st.yaw - st.yawT) < 0.004 || rm) {
          st.phase = "lower";
          // Bring the place round under the stylus as the needle lowers.
          seek(alignedTheta(lonRad(), st.yawT), rm ? 0 : 900, "inout");
        }
      }
      if (st.phase === "settle") {
        st.pitchT = LIFT;
        st.yawT = swingTarget;
        if (!st.dur) st.phase = st.power ? "lower" : "rest";
      }
      if (st.phase === "lower") {
        st.pitchT = 0;
        if (st.pitch < 0.004 || rm) st.phase = "down";
      }
      if (st.phase === "down") { st.yawT = swingTarget; st.pitchT = 0; }
      if (st.phase === "rest") { st.yawT = Math.PI / 2; st.pitchT = LIFT; }
    }

    if (rm) {
      st.yaw = st.yawT; st.pitch = st.pitchT; st.yawV = st.pitchV = 0;
    } else {
      const n = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < n; i++) {
        [st.yaw, st.yawV] = spring(st.yaw, st.yawT, st.yawV, dt / n, 28, 10.5);
        [st.pitch, st.pitchV] = spring(st.pitch, st.pitchT, st.pitchV, dt / n, 70, 17);
      }
    }
    if (Math.abs(st.yaw - st.yawT) > 1e-4 || Math.abs(st.yawV) > 1e-4 || Math.abs(st.pitch - st.pitchT) > 1e-4 || Math.abs(st.pitchV) > 1e-4) moving = true;
    yaw.rotation.y = -st.yaw;
    pitch.rotation.z = st.pitch;

    // Platter rotation (clockwise from above = negative y).
    if (st.dur > 0) {
      const p = clamp((now - st.t0) / st.dur, 0, 1); // rAF time can precede the seek call
      const k = st.ease === "linear" ? p : st.ease === "out" ? easeOut(p) : easeInOut(p);
      st.theta = st.from + (st.to - st.from) * k;
      if (p < 1) moving = true; else { st.dur = 0; st.theta = st.to; }
    } else if (!st.dragging) {
      st.theta = st.to;
    }
    spin.rotation.y = -st.theta;
    if (st.dragging || st.phase === "settle") moving = true;
    if (sky && sky.tick(dt)) moving = true;


    // Pulse: the stylus tip and the selected ring flash with each note.
    if (st.flash > 0) {
      st.flashT += dt;
      st.flash = Math.max(0, st.flash - dt * (st.flashKind === "nodata" ? 3.2 : 2.6));
      moving = true;
    }
    const flicker = st.flashKind === "nodata" ? 0.55 + 0.45 * Math.sign(Math.sin(st.flashT * 70)) : 1;
    const f = st.flash * flicker;
    const needleDown = st.power && (st.phase === "down" || st.phase === "lower") && st.pitch < 0.03;
    tipGlow.material.opacity = (needleDown ? 0.45 : 0) + f * 1.1;
    tipGlow.scale.setScalar(0.1 + f * 0.12);
    glow.material.opacity = 0.7 + f * 0.6;
    outerMat.opacity = 0.55 + f * 0.45;
    ringMat.color.setHex(AMBER).lerp(new THREE.Color(0xfff0d0), f * 0.6);
    ring.scale.setScalar((ringPx() / Math.max(1, pxPerUnit)) * (1 + f * 0.25));

    renderer.clear();
    if (sky) {
      skyCam.position.copy(camera.position);
      skyCam.quaternion.copy(skyTurn).multiply(camera.quaternion);
      skyCam.projectionMatrix.copy(camera.projectionMatrix);
      skyCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      skyCam.updateMatrixWorld();
      sky.follow(skyCam, renderer.getPixelRatio());
      renderer.render(sky.scene, skyCam);
      renderer.render(veilScene, veilCam);
      renderer.clearDepth();
    }
    renderer.render(scene, camera);
    idleFrames = moving ? 0 : idleFrames + 1;
    if (idleFrames < 3 && shown && inView) raf = requestAnimationFrame(frame);
  }

  /* ---------- Size and visibility ---------- */

  function resize() {
    if (disposed) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    viewW = w;
    viewH = h;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    frameCamera();
    kick();
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(host);
  const onWinResize = () => resize();
  window.addEventListener("resize", onWinResize);
  const io = new IntersectionObserver(([en]) => {
    inView = en.isIntersecting;
    if (inView) kick();
  });
  io.observe(host);

  /* ---------- Pointer: drag the record, click or hover a dot ---------- */

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const recPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -REC_Y);
  const hitPoint = new THREE.Vector3();
  const wpos = new THREE.Vector3();

  function localXY(ev) {
    const r = canvasEl.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  /** World angle (clockwise from -z) and distance from the platter center of the pointer on the record plane. */
  function planeAngle(p) {
    ndc.set((p.x / viewW) * 2 - 1, -(p.y / viewH) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(recPlane, hitPoint)) return null;
    const dx = hitPoint.x - C.x;
    const dz = hitPoint.z - C.y;
    return { ang: Math.atan2(dx, -dz), dist: Math.hypot(dx, dz) };
  }
  function dotAt(p) {
    let best = null;
    let bestD = HIT_PX;
    const s = { x: 0, y: 0 };
    spin.updateMatrixWorld();
    for (const d of dots) {
      wpos.copy(d.local);
      wpos.y = 0;
      dotsGroup.localToWorld(wpos);
      projectPx(wpos, s);
      const dd = Math.hypot(s.x - p.x, s.y - p.y);
      if (dd < bestD) {
        bestD = dd;
        best = { id: d.id, x: s.x, y: s.y };
      }
    }
    return best;
  }
  function setHover(h) {
    const id = h ? h.id : null;
    canvasEl.style.cursor = st.dragging ? "grabbing" : id ? "pointer" : "";
    if (id === st.hover) {
      if (id) onHover(id, { x: h.x, y: h.y });
      return;
    }
    st.hover = id;
    sizeDots();
    kick();
    onHover(id, id ? { x: h.x, y: h.y } : null);
  }

  const drag = { id: -1, startX: 0, startY: 0, moved: false, ang: 0, lastT: 0, vel: 0, pick: null, onRecord: false };

  function onDown(ev) {
    if (ev.button !== undefined && ev.button !== 0) return;
    const p = localXY(ev);
    const hit = dotAt(p);
    const pa = planeAngle(p);
    drag.onRecord = !!pa && pa.dist <= 1.08;
    if (!hit && !drag.onRecord) return;
    drag.id = ev.pointerId;
    drag.startX = p.x;
    drag.startY = p.y;
    drag.moved = false;
    drag.pick = hit;
    drag.ang = pa ? pa.ang : 0;
    drag.lastT = performance.now();
    drag.vel = 0;
  }

  function startDrag(ev) {
    drag.moved = true;
    if (!drag.onRecord) return;
    st.dragging = true;
    st.dur = 0;
    st.to = st.theta;
    try { canvasEl.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    setHover(null);
    canvasEl.style.cursor = "grabbing";
    kick();
  }

  function onMove(ev) {
    const p = localXY(ev);
    if (drag.id === ev.pointerId) {
      if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) >= TAP_PX) startDrag(ev);
      if (st.dragging) {
        const pa = planeAngle(p);
        if (pa) {
          let d = pa.ang - drag.ang;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          drag.ang = pa.ang;
          const now = performance.now();
          const dt = Math.max(1, now - drag.lastT) / 1000;
          drag.lastT = now;
          drag.vel = drag.vel * 0.6 + (d / dt) * 0.4;
          st.theta += d;
          st.to = st.theta;
          kick();
        }
        return;
      }
    }
    if (ev.pointerType === "touch" || drag.id !== -1) return;
    setHover(dotAt(p));
  }

  function endDrag(ev, cancelled) {
    if (drag.id !== ev.pointerId) return;
    drag.id = -1;
    try { canvasEl.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (!drag.moved) {
      if (!cancelled && drag.pick) onPick(drag.pick.id);
      return;
    }
    if (!st.dragging) return;
    st.dragging = false;
    canvasEl.style.cursor = "";
    const rm = reducedMotion();
    const idle = performance.now() - drag.lastT > 90;
    const vel = idle || rm ? 0 : clamp(drag.vel, -18, 18);
    // Coast a little, then ease round so the selected place comes back under the stylus.
    const free = st.theta + vel * 0.35;
    const a = yawFor(st.want.rho);
    const goal = alignedTheta(lonRad(), a, free);
    const ms = rm ? 0 : 650 + Math.min(900, Math.abs(goal - st.theta) * 260);
    seek(goal, ms, Math.abs(vel) > 0.5 ? "out" : "inout");
    st.phase = st.power ? "settle" : "rest";
    kick();
  }

  const onUp = (ev) => endDrag(ev, false);
  const onCancel = (ev) => endDrag(ev, true);
  const onLeave = () => { if (drag.id === -1) setHover(null); };
  canvasEl.addEventListener("pointerdown", onDown);
  canvasEl.addEventListener("pointermove", onMove);
  canvasEl.addEventListener("pointerup", onUp);
  canvasEl.addEventListener("pointercancel", onCancel);
  canvasEl.addEventListener("pointerleave", onLeave);

  /* ---------- Fonts: repaint when the faces (or the custom properties) are ready ---------- */

  const repaintFonts = () => { if (!disposed) paintDisc(); };
  try {
    const stacks = [cssFont("--font-display", '"Gloock", serif'), cssFont("--font-panel", '"Michroma", sans-serif')];
    Promise.all(stacks.map((s) => document.fonts.load(`40px ${s}`).catch(() => {}))).then(repaintFonts);
    document.fonts.ready.then(repaintFonts);
    document.fonts.addEventListener?.("loadingdone", repaintFonts);
  } catch { /* fonts API missing: system fallbacks */ }

  paintDisc();
  resize();

  /* ---------- Stage view interface ---------- */

  function aimAt(p, { fly }) {
    st.want = { rho: Math.max(LABEL_FRAC + 0.05, placeRadius(p.lat)) * R_REC, lon: p.lon };
    const rm = reducedMotion();
    if (!fly) {
      // Mark only: no motion at all.
      const a = yawFor(st.want.rho);
      seek(alignedTheta(lonRad(), a), 0);
      if (st.power) {
        st.phase = "down";
        st.yaw = st.yawT = a;
        st.pitch = st.pitchT = 0;
      } else {
        st.phase = "rest";
      }
      st.yawV = st.pitchV = 0;
    } else if (!st.power) {
      st.phase = "rest";
      seek(alignedTheta(lonRad(), yawFor(st.want.rho)), rm ? 0 : 900, "inout");
    } else if (st.dragging) {
      // Released later: settle will bring it round.
    } else {
      st.phase = st.phase === "swing" || st.phase === "lift" ? st.phase : "lift";
    }
    kick();
  }

  const view = {
    setPlaces(list) {
      if (disposed) return;
      places = Array.isArray(list) ? list.filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) : [];
      buildDots();
      const p = placeMarker();
      if (p && st.pendingSelect) {
        const fly = st.pendingSelect.fly;
        st.pendingSelect = null;
        aimAt(p, { fly });
      }
      kick();
    },
    select(id, { fly = true } = {}) {
      if (disposed) return;
      selectedId = id;
      const p = placeMarker();
      if (!p) {
        st.pendingSelect = { fly };
        return;
      }
      st.pendingSelect = null;
      aimAt(p, { fly });
    },
    setRecord(m) {
      if (disposed) return;
      meta = m || null;
      paintDisc();
    },
    setFrame(frame, { stepMs = 0, linear = false } = {}) {
      if (disposed || !frame) return;
      if (frame.date && frame.date !== frameDate) {
        frameDate = frame.date;
        paintDisc();
      }
      loadDisc(frame.disc);
      if (stepMs > 0 && !st.dragging) {
        // One full turn of the record for this date.
        const rm = reducedMotion();
        const a = st.phase === "rest" ? yawFor(st.want.rho) : st.yawT;
        const aligned = alignedTheta(lonRad(), a);
        if (rm) seek(aligned, 0);
        else seek(Math.max(aligned + TAU, st.to + TAU - 0.5), stepMs, linear ? "linear" : "inout");
      }
    },
    setPower(on) {
      if (disposed) return;
      on = !!on;
      if (on === st.power) return;
      st.power = on;
      if (!st.dragging) st.phase = on ? "lift" : "rest";
      kick();
    },
    setPlaying(on) {
      st.playing = !!on;
      kick();
    },
    pulse(v01) {
      if (disposed) return;
      if (v01 == null || !Number.isFinite(v01)) {
        st.flashKind = "nodata";
        st.flash = 0.35;
      } else {
        st.flashKind = "value";
        st.flash = 0.35 + 0.65 * clamp(v01, 0, 1);
      }
      st.flashT = 0;
      kick();
    },
    setShown(on) {
      if (disposed) return;
      shown = !!on;
      if (!shown) {
        cancelAnimationFrame(raf);
        raf = 0;
        setHover(null);
        return;
      }
      resize();
      kick();
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("resize", onWinResize);
      canvasEl.removeEventListener("pointerdown", onDown);
      canvasEl.removeEventListener("pointermove", onMove);
      canvasEl.removeEventListener("pointerup", onUp);
      canvasEl.removeEventListener("pointercancel", onCancel);
      canvasEl.removeEventListener("pointerleave", onLeave);
      try { document.fonts.removeEventListener?.("loadingdone", repaintFonts); } catch { /* ignore */ }
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      for (const d of disposables) d.dispose?.();
      for (const s of [glow, tipGlow]) s.material.dispose();
      sky?.dispose();
      veilMat.dispose();
      veilScene.traverse((o) => o.geometry?.dispose());
      envTex.dispose();
      pmrem.dispose();
      envScene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      renderer.dispose();
    },
  };
  // Dev harnesses only (opts.debug): read-only snapshots, not part of the stage view interface.
  if (opts.debug) Object.defineProperty(view, "debugState", { value: () => ({ ...st, want: { ...st.want }, selectedId, frameDate, pxPerUnit }) });
  if (opts.debug) Object.defineProperty(view, "debugDots", {
    value: () => {
      spin.updateMatrixWorld();
      return dots.map((d) => {
        wpos.copy(d.local);
        wpos.y = 0;
        dotsGroup.localToWorld(wpos);
        const p = projectPx(wpos);
        return { id: d.id, x: p.x, y: p.y };
      });
    },
  });
  return view;
}
