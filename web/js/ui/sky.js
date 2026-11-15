// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
// The sky behind the globe: NASA's Deep Star Map on a sphere at "infinity" (it follows the camera),
// the Sun as a limb-darkened disc with a soft corona, the Moon as a sphere lit from the true Sun
// direction (so its phase is right for the date), and the five naked-eye planets, Mercury to
// Saturn, as steady colored points sized by their apparent brightness. Positions come from
// ephemeris.js.
//
// Scale (not true, say so when showing the picture): the Sun and the Moon are drawn at
// SUN_SCALE and MOON_SCALE times their true angular size (both 4.5, so they keep their true
// one-to-one proportion), at their true positions. The planets are points, far larger than
// their true discs (which are below one arcminute), sized by brightness, not by diameter.
//
// World frame (shared with globe3d.js): equatorial, three.js Y = north celestial pole,
// X = March equinox, Z = -(RA 90 degrees). A right ascension and declination maps to
// (cos dec cos ra, sin dec, -cos dec sin ra), the same mapping three.js's SphereGeometry
// uses for longitude and latitude, so the Earth's texture lines up by turning it by the
// sidereal angle.
//
// The sky is its own scene, drawn first each frame (the caller renders it, then the Earth on top),
// so the Earth simply covers it.

import * as THREE from "three";
import { skyAt } from "./ephemeris.js";

const RAD = Math.PI / 180;
const SKY_R = 900; // star sphere radius (camera far plane must be beyond it)
const SUN_D = 800;
const MOON_D = 760;
const PLANET_D = 850;
// Enlargement of the Sun and the Moon over their true angular size. True radii: Sun 0.2666
// degree, Moon 0.259 degree (mean). At 4.5 the Sun is drawn 2.4 degrees across instead of 0.53,
// and the Moon 2.33 degrees instead of 0.52: a body next to the Earth, not a bright star.
export const SUN_SCALE = 4.5;
export const MOON_SCALE = 4.5;
const SUN_ANGULAR_R = 0.2666 * SUN_SCALE * RAD;
const MOON_ANGULAR_R = 0.259 * MOON_SCALE * RAD;
const SUN_QUAD_R = 7 * RAD; // the Sun's quad: disc plus corona and glare, all gone by this radius
const GLOW_GAIN = 0.24; // the star-free glow: a soft, legible Milky Way, space still black
const MAP_GAIN = 0.7; // the same from the full star map's coarse level

/** World direction of a right ascension and declination (degrees). */
export function eqToWorld(raDeg, decDeg, out = new THREE.Vector3()) {
  const a = raDeg * RAD;
  const d = decDeg * RAD;
  return out.set(Math.cos(d) * Math.cos(a), Math.sin(d), -Math.cos(d) * Math.sin(a));
}

/** Small deterministic random generator, so the fallback star field is the same on every load. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The star catalog of pipeline/make_stars.py: { count, star(i) -> [raDeg, decDeg, mag, rgb444] }.
 * Reads the packed base64 form (stars_b64) and the older flat integer list (stars).
 */
export function readStars(doc) {
  if (typeof doc?.stars_b64 === "string" && doc.count > 0) {
    const n = doc.count;
    const bin = atob(doc.stars_b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length < n * 7) return { count: 0, star: () => null };
    const dv = new DataView(bytes.buffer);
    return {
      count: n,
      star: (i) => [
        (dv.getUint16(i * 2, true) * 360) / 65536,
        (dv.getInt16(n * 2 + i * 2, true) * 90) / 32767,
        dv.getUint8(n * 6 + i) / 20 - 2,
        dv.getUint16(n * 4 + i * 2, true),
      ],
    };
  }
  const flat = Array.isArray(doc?.stars) ? doc.stars : [];
  return { count: Math.floor(flat.length / 4), star: (i) => [flat[i * 4] / 100, flat[i * 4 + 1] / 100, flat[i * 4 + 2] / 100, flat[i * 4 + 3]] };
}

// Stars: a round, antialiased point (a small Gaussian), brightness in the color. The sprite is
// a little larger than the star so its edge fades out instead of being cut.
const STAR_VERT = `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vSize;
void main() {
  vColor = aColor;
  vSize = aSize * uScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = ceil(vSize + 2.0);
}`;

const STAR_FRAG = `
uniform float uOpacity;
varying vec3 vColor;
varying float vSize;
void main() {
  float halfPx = ceil(vSize + 2.0) * 0.5;
  float d = length(gl_PointCoord - 0.5) * 2.0 * halfPx; // distance from the center, device px
  float sigma = max(0.62, vSize * 0.42);
  float a = exp(-0.5 * d * d / (sigma * sigma));
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * min(1.0, a * 1.7) * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

// Planets: a steady, solid round core (antialiased) with a small soft glow, so they read as
// planets next to the stars' small Gaussian points. No twinkle: nothing here depends on time.
const PLANET_VERT = `
attribute float aSize;
attribute vec3 aColor;
uniform float uScale;
varying vec3 vColor;
varying float vCore;
void main() {
  vColor = aColor;
  vCore = aSize * uScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = ceil(vCore * 4.0 + 2.0);
}`;

const PLANET_FRAG = `
varying vec3 vColor;
varying float vCore;
void main() {
  float halfPx = ceil(vCore * 4.0 + 2.0) * 0.5;
  float d = length(gl_PointCoord - 0.5) * 2.0 * halfPx; // distance from the center, device px
  float core = 1.0 - smoothstep(vCore * 0.5 - 0.6, vCore * 0.5 + 0.6, d);
  float g = d / (vCore * 0.8);
  float glow = 0.45 * exp(-g * g) * (1.0 - smoothstep(halfPx * 0.55, halfPx, d));
  float a = core + glow * (1.0 - core);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <colorspace_fragment>
}`;

// True tints, as the eye sees them (sRGB). Mars is kept red-orange, well away from the amber
// (#ffb547) reserved for the place being read.
const PLANET_TINT = {
  mercury: "#d9d4cc", // gray-white
  venus: "#fffaf0", // white
  mars: "#ff8f6b", // orange-red
  jupiter: "#f7ecd4", // cream
  saturn: "#f1dca4", // pale gold
};

// Core diameter (CSS px) and brightness of a planet's point from its rough visual magnitude.
// Venus (about -4.5) about 5.6 px, Jupiter (about -2.5) about 4.5 px, Saturn and Mercury (about
// 0 to +1) about 3.2 px with a soft glow: solid round cores, unlike the stars' small Gaussian points.
const finiteMag = (m) => (Number.isFinite(m) ? m : 1);
const planetSize = (m) => Math.min(5.8, Math.max(3.2, 2.4 + 0.55 * (1.5 - finiteMag(m))));
const planetBright = (m) => Math.min(1, Math.max(0.86, 0.9 - 0.03 * finiteMag(m)));

// The Sun: one quad facing the camera (premultiplied: the disc covers the stars behind it, the
// corona adds light over them). Inside the disc a photosphere with limb
// darkening (each color darkens at its own rate, so the limb turns a deeper yellow-orange) and a
// very fine, low-contrast granulation; outside it a soft corona falling off smoothly, gone well
// before the quad's edge so it never washes out the stars far from the Sun.
const BODY_VERT = `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SUN_FRAG = `
uniform float uDiscR; // the disc's radius as a fraction of the quad's half-size
varying vec2 vP;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float q = length(vP);
  float rr = q / uDiscR; // distance from the center in solar radii
  float aa = fwidth(rr);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + 0.5 * aa, rr);
  vec3 c = vec3(0.0);
  if (disc > 0.0) {
    float mu = sqrt(max(0.0, 1.0 - rr * rr));
    vec3 face = vec3(1.26, 1.13, 0.96) * pow(vec3(mu), vec3(0.5, 0.8, 1.35));
    vec2 gp = vP / uDiscR * 13.0;
    float gr = 0.6 * vnoise(gp) + 0.4 * vnoise(gp * 2.3 + 17.0);
    face *= 1.0 + 0.05 * (gr - 0.5) * sqrt(mu);
    c = face * disc;
  }
  float x = max(rr - 1.0, 0.0);
  float corona = (0.42 * exp(-x * 7.0) + 0.05 * exp(-x * 1.6)) * (1.0 - smoothstep(0.5, 1.0, q));
  vec3 coronaCol = mix(vec3(1.0, 0.84, 0.62), vec3(0.86, 0.82, 0.8), smoothstep(0.0, 2.0, x));
  c += coronaCol * corona * (1.0 - disc);
  gl_FragColor = vec4(c, disc); // the disc hides what is behind it, the corona adds light
  #include <colorspace_fragment>
}`;

// The Moon: one quad facing the camera with the sphere computed per pixel (an impostor), so its
// limb is crisp and antialiased at any size. The NASA map is looked up from the sphere's normal,
// near side toward the Earth, lunar north along the ecliptic pole (the Moon's axis is within 1.5
// degrees of it). Lit from the true Sun direction with a Lunar-Lambert law (the full Moon stays
// bright to its limb, as the real one does), plus a very faint earthshine on the night side,
// strongest at a thin crescent (when the Earth seen from the Moon is nearly full).
const MOON_PAD = 1.04; // quad half-size over the disc's radius: room for the antialiased edge
const MOON_FRAG = `
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uSun; // direction to the Sun in the Moon's frame (z toward the camera, y lunar north)
uniform float uEarthLit; // fraction of the Earth's face lit, seen from the Moon
varying vec2 vP;
void main() {
  vec2 p = vP * ${MOON_PAD.toFixed(2)};
  float r = length(p);
  float aa = fwidth(r);
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  if (alpha <= 0.0) discard;
  vec3 n = vec3(p, sqrt(max(0.0, 1.0 - r * r)));
  vec2 uv = vec2(0.5 + atan(n.x, n.z) * 0.15915494, 0.5 + asin(clamp(n.y, -1.0, 1.0)) * 0.31830989);
  vec3 alb = uHasMap > 0.5 ? texture2D(uMap, uv).rgb : vec3(0.3);
  float mu0 = dot(n, uSun);
  float m0 = max(mu0, 0.0);
  float lit = smoothstep(-0.015, 0.04, mu0) * (1.5 * m0 / (m0 + n.z + 1e-3) + 0.25 * m0);
  float earth = 0.012 * uEarthLit * (0.4 + 0.6 * n.z);
  gl_FragColor = vec4(alb * (lit * 1.45 + earth), alpha);
  #include <colorspace_fragment>
}`;

/**
 * @param {object} o
 * @param {string|null} o.starmap URL of the equirectangular star map (center RA 0h, RA increasing to the left, north up), used for the Milky Way glow
 * @param {string|null} o.glow URL of the star-free Milky Way glow (sky-glow-1024.jpg, pipeline/make_stars.py); preferred over starmap
 * @param {string|null} o.stars URL of the star catalog JSON written by pipeline/make_stars.py
 * @param {string|null} o.moon URL of the Moon's map (optional)
 * @param {number} o.anisotropy
 * @param {boolean} o.bodies draw the Sun, the Moon and the planets (default true)
 * @param {Date|number|null} o.date instant for the first placement of the bodies and the stars'
 *   precession (default now); callers that never call setBodies still get a correct sky
 * @param {() => void} o.onChange called when a texture arrives (so the caller can render once more)
 */
export function createSky({ starmap = null, glow: glowUrl = null, stars: starList = null, moon = null, anisotropy = 1, bodies = true, date = null, onChange = () => {} } = {}) {
  const scene = new THREE.Scene();
  const group = new THREE.Group(); // follows the camera: the sky stays at infinity
  scene.add(group);
  const disposables = [];
  const track = (x) => (disposables.push(x), x);
  let disposed = false;

  // Precession: the star catalog and the map are J2000, the bodies are for the equinox of date.
  // The stars turn about the ecliptic pole by the precession angle (set in setBodies).
  const stars = new THREE.Group();
  group.add(stars);

  // Fallback star field: shown at once, kept if the star catalog cannot load.
  const rnd = mulberry32(20261114);
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const z = rnd() * 2 - 1;
    const t = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    pos.set([r * Math.cos(t) * SKY_R * 0.97, z * SKY_R * 0.97, r * Math.sin(t) * SKY_R * 0.97], i * 3);
    const m = rnd();
    size[i] = 1 + 2 * m ** 12;
    const b = 0.18 + 0.82 * m ** 8;
    const warm = rnd();
    col.set([b * (0.88 + 0.12 * warm), b * 0.93, b * (1.04 - 0.12 * warm)], i * 3);
  }
  const fallbackGeo = track(new THREE.BufferGeometry());
  fallbackGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  fallbackGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  fallbackGeo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  const starMat = track(new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uOpacity: { value: 1 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true,
  }));
  const fallback = new THREE.Points(fallbackGeo, starMat);
  fallback.renderOrder = -99;
  fallback.frustumCulled = false;
  stars.add(fallback);

  // The real stars: the brightest point sources of NASA's Deep Star Map (pipeline/make_stars.py),
  // drawn as crisp round points, size and brightness by magnitude, color from the map.
  const catalogMat = track(new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 }, uOpacity: { value: 0 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true,
  }));
  let starFade = 0; // 0 = procedural stars, 1 = catalog
  if (starList) {
    fetch(starList)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((doc) => {
        if (disposed) return;
        const cat = readStars(doc);
        const n = cat.count;
        if (!n) return;
        const p = new Float32Array(n * 3);
        const sz = new Float32Array(n);
        const c = new Float32Array(n * 3);
        const v = new THREE.Vector3();
        const tint = new THREE.Color();
        const white = new THREE.Color(1, 1, 1);
        for (let i = 0; i < n; i++) {
          const [ra, dec, mag, rgb] = cat.star(i);
          eqToWorld(ra, dec, v).multiplyScalar(SKY_R * 0.97);
          p.set([v.x, v.y, v.z], i * 3);
          // Most stars 1 to 1.5 px, the brightest up to about 3 px (CSS px, times the pixel ratio);
          // brightness falls steeply with magnitude so the constellations stand out.
          sz[i] = Math.min(3.6, Math.max(1.2, 1.2 + 0.6 * (4.4 - mag)));
          const b = Math.min(1, Math.max(0.14, Math.pow(10, -0.4 * (mag - 1.5)) ** 0.4));
          // Colors from the map, softened toward white (the eye sees star colors faintly).
          tint.setRGB(((rgb >> 8) & 15) / 15, ((rgb >> 4) & 15) / 15, (rgb & 15) / 15, THREE.SRGBColorSpace).lerp(white, 0.45);
          c.set([tint.r * b, tint.g * b, tint.b * b], i * 3);
        }
        const g = track(new THREE.BufferGeometry());
        g.setAttribute("position", new THREE.BufferAttribute(p, 3));
        g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
        g.setAttribute("aColor", new THREE.BufferAttribute(c, 3));
        const catalog = new THREE.Points(g, catalogMat);
        catalog.renderOrder = -98;
        catalog.frustumCulled = false;
        stars.add(catalog);
        starFade = 0.0001;
        onChange();
      })
      .catch(() => {});
  }

  // The NASA star map, used only as the faint, low-frequency glow of the Milky Way behind the
  // stars: read from a coarse mipmap level (the stars in the picture blur away), smoothed with
  // a bicubic B-spline, pushed down so space stays dark.
  const mapMat = track(new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null }, uSize: { value: new THREE.Vector2(2048, 1024) }, uOpacity: { value: 0 }, uGain: { value: 0.7 }, uLod: { value: 2.0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform sampler2D uMap; uniform vec2 uSize; uniform float uOpacity; uniform float uGain; uniform float uLod;
      varying vec2 vUv;
      vec4 cubic(float v) {
        vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
        vec4 s = n * n * n;
        float x = s.x;
        float y = s.y - 4.0 * s.x;
        float z = s.z - 4.0 * s.y + 6.0 * s.x;
        return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
      }
      vec3 bicubic(vec2 uv, float lod) {
        vec2 size = uSize / exp2(lod);
        vec2 t = uv * size - 0.5;
        vec2 f = fract(t);
        t -= f;
        vec4 xc = cubic(f.x);
        vec4 yc = cubic(f.y);
        vec4 c = t.xxyy + vec2(-0.5, 1.5).xyxy;
        vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
        vec4 o = (c + vec4(xc.yw, yc.yw) / s) / size.xxyy;
        vec3 s0 = textureLod(uMap, o.xz, lod).rgb;
        vec3 s1 = textureLod(uMap, o.yz, lod).rgb;
        vec3 s2 = textureLod(uMap, o.xw, lod).rgb;
        vec3 s3 = textureLod(uMap, o.yw, lod).rgb;
        float sx = s.x / (s.x + s.y);
        float sy = s.z / (s.z + s.w);
        return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
      }
      void main() {
        // Plate carree squeezes texels sideways toward the poles, so a fixed level would streak
        // along the meridians there: take coarser levels as 1 / cos(dec) grows (two whole levels
        // mixed, each sampled in step with its texels), and fade out right at the poles.
        vec2 uv = vec2(1.0 - vUv.x, vUv.y);
        float dec = abs(vUv.y - 0.5) * 3.14159265;
        float lod = uLod + log2(1.0 / max(cos(dec), 0.06));
        float l0 = floor(lod);
        vec3 c = mix(bicubic(uv, l0), bicubic(uv, l0 + 1.0), lod - l0);
        c = pow(max(c - 0.003, 0.0), vec3(1.1)) * uGain;
        c *= 1.0 - smoothstep(1.48, 1.56, dec);
        gl_FragColor = vec4(c * uOpacity, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  }));
  const mapSphere = new THREE.Mesh(track(new THREE.SphereGeometry(SKY_R, 96, 48)), mapMat);
  mapSphere.renderOrder = -100;
  mapSphere.frustumCulled = false;
  mapSphere.visible = false;
  stars.add(mapSphere);
  let mapFade = 0;

  // The glow: preferably the star-free Milky Way written by pipeline/make_stars.py (drawn as
  // is), else the full star map read from a coarse mipmap level (its stars blur away there).
  const loader = new THREE.TextureLoader();
  const useGlow = (tex, clean) => {
    if (disposed) return tex.dispose();
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    track(tex);
    const w = tex.image?.width || 2048;
    mapMat.uniforms.uMap.value = tex;
    mapMat.uniforms.uSize.value.set(w, tex.image?.height || w / 2);
    // A whole mipmap level, so the bicubic taps line up with its texels: level 0 for the clean
    // glow; for the star map, the level about 256 px around (1.4 degrees a texel).
    mapMat.uniforms.uLod.value = clean ? 0 : Math.max(0, Math.round(Math.log2(w / 256)));
    mapMat.uniforms.uGain.value = clean ? GLOW_GAIN : MAP_GAIN;
    mapSphere.visible = true;
    mapFade = 0.0001;
    onChange();
  };
  const fromMap = () => (starmap ? loader.loadAsync(starmap).then((t) => useGlow(t, false)) : Promise.resolve());
  (glowUrl ? loader.loadAsync(glowUrl).then((t) => useGlow(t, true), fromMap) : fromMap()).catch(() => {});

  // The Sun: disc, corona and glare in one quad (one draw call; it used to be a disc sprite and
  // a glare sprite). No texture: the face is computed in the shader.
  const quadGeo = track(new THREE.PlaneGeometry(2, 2));
  const sunMat = track(new THREE.ShaderMaterial({
    uniforms: { uDiscR: { value: Math.tan(SUN_ANGULAR_R) / Math.tan(SUN_QUAD_R) } },
    vertexShader: BODY_VERT,
    fragmentShader: SUN_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    // Premultiplied: the opaque disc covers the stars behind it, the corona (alpha 0) adds light.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  const sunMesh = new THREE.Mesh(quadGeo, sunMat);
  sunMesh.scale.setScalar(SUN_D * Math.tan(SUN_QUAD_R));
  sunMesh.renderOrder = -85;
  group.add(sunMesh);

  // The Moon: one quad, the sphere computed per pixel (see MOON_FRAG).
  const moonMat = track(new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null }, uHasMap: { value: 0 }, uSun: { value: new THREE.Vector3(0, 0, -1) }, uEarthLit: { value: 0 } },
    vertexShader: BODY_VERT,
    fragmentShader: MOON_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  }));
  const moonMesh = new THREE.Mesh(quadGeo, moonMat);
  moonMesh.scale.setScalar(MOON_D * Math.tan(MOON_ANGULAR_R) * MOON_PAD);
  moonMesh.renderOrder = -84;
  group.add(moonMesh);
  if (moon) {
    new THREE.TextureLoader().loadAsync(moon).then((tex) => {
      if (disposed) return tex.dispose();
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = anisotropy;
      track(tex);
      moonMat.uniforms.uMap.value = tex;
      moonMat.uniforms.uHasMap.value = 1;
      onChange();
    }).catch(() => {});
  }

  // Planets: the five seen with the naked eye. Size and brightness follow the rough magnitude of
  // the date (set in setBodies), the tint is fixed.
  const names = Object.keys(PLANET_TINT);
  const pPos = new Float32Array(names.length * 3);
  const pSize = new Float32Array(names.length).fill(3);
  const pCol = new Float32Array(names.length * 3);
  const pTint = new Float32Array(names.length * 3);
  const tmpColor = new THREE.Color();
  names.forEach((n, i) => {
    tmpColor.set(PLANET_TINT[n]);
    pTint.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    pCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
  });
  const planetGeo = track(new THREE.BufferGeometry());
  const planetPosAttr = new THREE.BufferAttribute(pPos, 3);
  const planetSizeAttr = new THREE.BufferAttribute(pSize, 1);
  const planetColAttr = new THREE.BufferAttribute(pCol, 3);
  planetGeo.setAttribute("position", planetPosAttr);
  planetGeo.setAttribute("aSize", planetSizeAttr);
  planetGeo.setAttribute("aColor", planetColAttr);
  const planetMat = track(new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    transparent: true,
  }));
  const planets = new THREE.Points(planetGeo, planetMat);
  planets.renderOrder = -90;
  planets.frustumCulled = false;
  group.add(planets);

  const eclipticPole = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const sunWorld = new THREE.Vector3(1, 0, 0);
  const moonWorld = new THREE.Vector3(1, 0, 0);
  const invQ = new THREE.Quaternion();

  const api = {
    scene,
    /** Fade the star map in (call every frame; returns true while still fading). */
    tick(dt) {
      let moving = false;
      if (mapFade > 0 && mapFade < 1) {
        mapFade = Math.min(1, mapFade + dt / 1.2);
        mapMat.uniforms.uOpacity.value = mapFade;
        moving = true;
      }
      if (starFade > 0 && starFade < 1) {
        starFade = Math.min(1, starFade + dt / 0.8);
        catalogMat.uniforms.uOpacity.value = starFade;
        starMat.uniforms.uOpacity.value = 1 - starFade;
        if (starFade >= 1) fallback.visible = false;
        moving = true;
      }
      return moving;
    },
    /**
     * Place the bodies. sky = skyAt(...) from ephemeris.js, possibly with an interpolated Moon:
     * moonDir (world vector) overrides sky.moon when given.
     */
    setBodies(sky, moonDir = null) {
      const eps = sky.obliquity * RAD;
      eclipticPole.set(0, Math.cos(eps), Math.sin(eps));
      stars.quaternion.setFromAxisAngle(eclipticPole, sky.precession * RAD);
      eqToWorld(sky.sun.ra, sky.sun.dec, sunWorld);
      sunMesh.position.copy(sunWorld).multiplyScalar(SUN_D);
      if (moonDir) moonWorld.copy(moonDir).normalize();
      else eqToWorld(sky.moon.ra, sky.moon.dec, moonWorld);
      moonMesh.position.copy(moonWorld).multiplyScalar(MOON_D);
      // The Moon's axis is close to the ecliptic pole: its north points there on screen.
      moonMesh.up.copy(eclipticPole);
      // Seen from the Moon the Earth is lit on the fraction (1 + cos elongation) / 2: nearly full
      // when the Moon is new, which is when earthshine is brightest.
      moonMat.uniforms.uEarthLit.value = 0.5 * (1 + sunWorld.dot(moonWorld));
      for (let i = 0; i < names.length; i++) {
        const p = sky.planets[names[i]];
        if (!p) continue;
        eqToWorld(p.ra, p.dec, v).multiplyScalar(PLANET_D);
        planetPosAttr.setXYZ(i, v.x, v.y, v.z);
        const bright = planetBright(p.mag);
        pSize[i] = planetSize(p.mag);
        pCol[i * 3] = pTint[i * 3] * bright;
        pCol[i * 3 + 1] = pTint[i * 3 + 1] * bright;
        pCol[i * 3 + 2] = pTint[i * 3 + 2] * bright;
      }
      planetPosAttr.needsUpdate = true;
      planetSizeAttr.needsUpdate = true;
      planetColAttr.needsUpdate = true;
    },
    /** Keep the sky at infinity: centered on the camera. scale = device pixel ratio for point sizes. */
    follow(camera, scale = Math.min(globalThis.devicePixelRatio || 1, 2)) {
      group.position.copy(camera.position);
      // The Sun's and the Moon's quads face the camera (the group's origin now).
      sunMesh.lookAt(camera.position);
      moonMesh.lookAt(camera.position);
      // The Sun's direction in the Moon's own frame lights its phase (the group never rotates, so
      // the quad's local quaternion is its world one).
      invQ.copy(moonMesh.quaternion).invert();
      moonMat.uniforms.uSun.value.copy(sunWorld).applyQuaternion(invQ);
      starMat.uniforms.uScale.value = scale;
      catalogMat.uniforms.uScale.value = scale;
      planetMat.uniforms.uScale.value = scale;
    },
    dispose() {
      disposed = true;
      for (const d of disposables) d.dispose?.();
    },
  };
  for (const o of [sunMesh, moonMesh, planets]) o.visible = !!bodies;
  // A usable sky from the start, even if the caller never sets a date or the Sun.
  api.setBodies(skyAt(new Date(date ?? Date.now())));
  return api;
}
