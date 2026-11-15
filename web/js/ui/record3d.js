// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
// The record in the globe scene: a 12 inch LP in the plane of the Earth's orbit (the ecliptic), fixed
// among the stars, with the Earth where its label is, and the stylus that reads it.
//
// The anatomy of an LP, kept compact so the sky stays visible around it: the Earth and a printed
// paper ring around it (out to LABEL_EDGE) are the label; then a band of smooth dead wax, the grooved
// playing area, a smooth lead-in and a rounded rim with thickness (out to OUTER). What keeps it from
// reading as Saturn's rings is the print and the material, not the size. The paper label is a texture drawn at run time on a 2D canvas: deep
// cobalt paper with a fine grain, one thin silver ring, and silver serif lettering set round the
// circle (the team's wordmark, the record's title, the side, the span of dates). Side A is seen from
// the ecliptic north, side B from the south, so the lettering never reads mirrored. In the overview
// the globe asks the print to face the viewer (setLabelFacing): it turns so the wordmark reads upright
// on the far side of the label. Otherwise the print is fixed to the disc, so the disc's turning with
// the dates shows.
//
// The vinyl is matte black lacquer (no stars through it). The grooves show only through what they
// catch: the real Sun lies in the disc's plane and draws the anisotropic sheen of circular grooves,
// two broad soft wedges across them; there are no bright circles anywhere (no ring at the label
// edge, no line along the current date's groove round the record, no highlight on the rim). The
// Earth's shadow falls across the disc on the side away from the Sun (a soft strip two Earth radii
// wide). The record's dates are its grooves: the first date at the outer playing edge, the last at
// the inner edge, a smooth gap at each January like the gap between two tracks; the groove of the
// date shown glints only for a short stretch under the stylus. Where the disc lies between the
// camera and the planet it fades almost to nothing, so it never veils the NASA frame being read.
// Seen within EDGE_FADE degrees of its plane (a flat disc is then only a thin ellipse through the
// planet, a ringed planet's signature) the whole record gives way and comes back as the view opens.
// Where it runs off the canvas it dissolves instead of ending in a straight cut.
//
// The stylus is an amber hairline (the point being read) that leaves the chosen place along its
// local vertical, curves without ever passing through the planet, and rests on the groove of the
// date shown at the place's own ecliptic longitude. The disc is fixed to the stars while the place
// keeps its angle to the Sun, so as the dates advance the disc turns under the stylus, one turn per
// year, spiraling inward: that is the record playing, and it is the Earth moving along its orbit.
//
// While a record plays, the disc carries the data (inert until called): mark() keeps each played
// date's value color in its groove, all the way round the record; setEffect() sends a packet of the
// effect from the place along the stylus and, when it lands, that date's groove catches it all the
// way round: a flame front running both ways from the landing point (fire) or a swell (sea), which
// settles to the held color. setSpin() is the scratch: an extra turn of everything on the disc.
//
// Three draw calls (disc, stylus ribbon, stylus tip), one canvas texture (2048 x 256, redrawn only
// when the record or the fonts change) and one 128 x 1 data texture for the played dates, no
// per-frame allocations. Nothing moves on its own: update() advances the eases and returns true while
// any is still running (an effect animates only while it shows).

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const AMBER = 0xffb547; // the point being read
const KEYLINE = 0x02050c;

const MAX_MARKS = 128; // date boundaries with their own strength (January); later ones are plain
const STYLUS_SEGMENTS = 72;
const TAU_GLSL = "6.2831853";
const RING_CLOSE_SEA = 0.9; // s: the swell runs round the whole groove (both ways from the landing point) in this time
const RING_CLOSE_FIRE = 1.1; // s: the flame front closes round the groove in this time
const RING_SETTLE_SEA = 1.4; // s: after closing, the water shimmers and settles to the held color within this
const RING_EMBER_FIRE = 3.0; // s: after the flames, embers glow down to the held color within this (times the burn length)
const PKT_MS_SEA = 440; // ms: the packet's run from the place to the tip on a sea record (steps about 1.4 s)
const PKT_MS_FIRE = 640; // and on a land record (steps about 4 s)
const TRACE_TINT_FIRE = 0.26; // the even tint of a fire record's held color (sea records keep 0.055)
const ENTER_S = 0.55; // s: a newly played date without an effect of its own eases its color in over this (spreading from the stylus)
const BURN_OUT_MS = 1500; // the sustained flames die down to embers and to the held color in this time
const SPIN_BACK_MS = 520; // the scratch's ease back, when no time is given // s: the effect's level eases toward the value asked for
export const OUTER = 2.14; // outer edge of the record, Earth radii (a little beyond the 1.92 of the first disc)
export const LABEL_EDGE = 1.32; // edge of the printed paper label, Earth radii (0.26 of paper beyond the atmosphere: the lettering still reads at the overview size)
const LABEL_W = 2048; // label texture, unrolled: columns round the record
const LABEL_H = 128; // rows per side (two sides: 2048 x 256, the memory of one 512 x 512 texture)
const EDGE_MODE = "fade"; // seen nearly edge on: "fade" (the disc gives way) or "thick" (a slab with a visible rim)
const FACING_CANDIDATES = 72; // positions tried for the wordmark round the label (5 degrees apart)
const FACING_CLEAR = 1.08; // Earth radii: the wordmark's baseline counts as in view when its view ray passes this far from the center (atmosphere 1.06, plus a margin)
const LABEL_TURN_TAU = 0.15; // s: time constant of the label turning to face the viewer (settled in about 0.6 s)
const EDGE_FADE = [12, 22]; // degrees of the camera above the disc's plane: gone below the first, whole above the second

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * A fire color for a record without a published color strip (fire activity): v01 on the record's
 * scale to [r, g, b] 0 to 1, from a dark ember through orange to a pale yellow. For mark() and setEffect().
 */
export function fireColor(v01) {
  const t = Math.min(1, Math.max(0, +v01 || 0) * 2.5); // the fire scale's useful range is its lower part
  const a = [0.30, 0.10, 0.05], b = [1.0, 0.42, 0.08], c = [1.0, 0.88, 0.55];
  const [p, q, k] = t < 0.5 ? [a, b, t / 0.5] : [b, c, (t - 0.5) / 0.5];
  return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
}
const wrapPi = (a) => a - TAU * Math.round(a / TAU);
// Angle (rad, in the disc's frame, before the print is turned) of the middle of the wordmark, drawn at
// a quarter of the label texture's width: the print runs clockwise as seen from each face, so face A
// (seen from the ecliptic north) puts it at -pi/2 and face B (seen from the south) at +pi/2.
const WORDMARK = "BLUE MARBLE RECORDS";
const WORD_A = -Math.PI / 2;
const WORD_B = Math.PI / 2;
const smoothstepJs = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const smoother = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };

// ---------------------------------------------------------------- disc shaders

const DISC_VERT = `
attribute float aEdge;  // 0 on the face, 1 on the thin outer edge
varying vec3 vP;        // local position: the face lies in z = 0, z is the ecliptic pole
varying vec3 vCam;      // the camera in the same local frame
varying float vEdge;
void main() {
  vP = position;
  vEdge = aEdge;
  // The group only rotates (it is centered on the Earth), so its inverse is the transpose.
  vCam = transpose(mat3(modelMatrix)) * (cameraPosition - modelMatrix[3].xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// All colors are display (sRGB) values: the disc is drawn onto the finished picture.
const DISC_FRAG = `
uniform float uRin;      // inner edge of the disc (hidden behind the planet and its atmosphere)
uniform float uR0;       // radius of the label texture's inner row (the planet's surface)
uniform float uRl;       // edge of the paper label
uniform float uG1;       // inner playing edge: the last date ends here, the dead wax starts
uniform float uG0;       // outer playing edge: the first date starts here, inside the lead-in
uniform float uRo;       // outer edge
uniform float uBand;     // radial width of one date
uniform float uCount;    // number of dates (0: a plain grooved disc)
uniform float uMicro;    // fine grooves per date band
uniform float uCur;      // index of the date shown (eased, fractional between dates)
uniform vec4 uMarks[${MAX_MARKS / 4}]; // strength of boundary k: 1 plain, 2 January
uniform vec2 uSun;       // the Sun's direction in the disc plane
uniform float uPresence; // 0 hidden, 1 fully there (includes the edge-on fade)
uniform vec2 uTip;       // direction of the stylus tip in the disc plane
uniform float uTipOn;    // how visible the stylus is, 0 to 1
uniform vec2 uView;      // drawing buffer size, device px (the disc dissolves near the canvas edges)
uniform float uLabelRot;  // turn of the print on the disc, rad (counterclockwise seen from the ecliptic north)
uniform sampler2D uLabel; // the printed label, unrolled: x = angle (clockwise), y = radius; side A on top, side B below
uniform sampler2D uPlayed; // one texel per date: rgb the value's color, a 1 when played (0: not played or no data)
uniform float uPlayedOn;   // 1 when any date is marked (else the trace costs nothing)
uniform float uFxTime;     // seconds (the flicker of the animated grooves)
uniform float uRingKind;   // 0 none, 1 water (sea), 2 fire (land): the kind of the grooves being animated
uniform vec4 uRingA;       // a date whose groove is being animated: x its index (-1 none), y the landing angle on the disc,
uniform vec4 uRingB;       //   z seconds since the landing (below 0: the packet is still on its way), w the level
uniform vec3 uRingColA;    // their values' colors
uniform vec3 uRingColB;
uniform float uSpin;       // an extra turn of the whole record (the scratch), rad
uniform float uFireTrace; // 1 on the fire record (its held colors are drawn louder: calm is a clear tint, fire a strong red)
uniform float uBurnOn;     // 1 while grooves may keep burning (the fire record during and just after a Play; never with reduced motion or lite)
uniform float uBurnFade;   // 1 burning; eases to 0 when the effect ends (the flames die down to embers and to the held color)
uniform vec4 uEnter;       // the newest date's entry (no effect of its own): x its index (-1 none), y the stylus angle on the disc, z seconds since
varying vec3 vP;
varying vec3 vCam;
varying float vEdge;

const vec3 SHEEN = vec3(0.80, 0.86, 0.96);  // the Sun caught by the groove walls, a cool white
const vec3 SKY = vec3(0.060, 0.072, 0.105); // what the glossy lacquer mirrors at a grazing angle

// A periodic line of physical width w (in cycles) at the integers of x, filtered over the pixel
// footprint fw (cycles per pixel): never thinner than a pixel (it dims instead), and once the lines
// are denser than the pixel grid they become their own mean. No shimmer, no moire.
float lineAA(float x, float w, float fw) {
  float d = abs(fract(x + 0.5) - 0.5);
  float ww = max(w, fw);
  float c = 1.0 - smoothstep(0.5 * (ww - fw), 0.5 * (ww + fw), d);
  c *= w / ww;
  return mix(c, w, smoothstep(0.22, 0.5, fw));
}

// Cheap value noise (one octave): hashed lattice, smooth interpolation. Only evaluated inside the
// small region of an effect round the stylus.
float hash12(vec2 q) { q = fract(q * vec2(0.1031, 0.1030)); q += dot(q, q.yx + 33.33); return fract((q.x + q.y) * q.x); }
float vnoise(vec2 q) {
  vec2 i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

float wrapPi(float a) { return a - ${TAU_GLSL} * floor((a + 3.14159265) / ${TAU_GLSL}); }
vec3 fireRamp(float h) {
  // dark red tips and embers, a strong fire red body, orange where it runs hot, a small hot core
  vec3 c = mix(vec3(0.32, 0.02, 0.0), vec3(0.95, 0.12, 0.04), smoothstep(0.04, 0.42, h));
  c = mix(c, vec3(1.0, 0.40, 0.07), smoothstep(0.5, 0.82, h));
  return mix(c, vec3(1.0, 0.78, 0.48), smoothstep(0.9, 1.0, h));
}

// How far the front has run round the groove of a ring (rad, from the landing point both ways) and
// whether this point is behind it: the groove's held color shows only where the front has passed.
float ringReveal(vec4 rg, float th, float close, float delay) {
  if (rg.z < 0.0) return 0.0;
  float d = abs(wrapPi(th - rg.y));
  float phi = 3.14159265 * clamp((rg.z - delay) / close, 0.0, 1.0); // fire: the color shows once the flames have passed
  return 1.0 - smoothstep(phi - 0.10, phi + 0.02, d);
}

// The animation of one ring at this point of the disc (added light), from the landing point both
// ways round the date's groove. Evaluated only near that groove's radius.
vec3 ringFx(vec4 rg, vec3 rc3, float r, float th, float wedge, float broad, float lit) {
  vec3 res = vec3(0.0);
  float t = rg.z;
  float lvl = rg.w;
  float rc = uG0 - (rg.x + 0.5) * uBand; // the groove's radius
  float up = r - rc;                      // outward from its middle
  float hb = 0.5 * uBand;
  float d = abs(wrapPi(th - rg.y));       // angle from the landing point, either way round
  float s = d * rc;                       // the same along the groove (Earth radii)
  if (uRingKind > 1.5) {
    // Fire: the front runs both ways from the landing point and closes; behind it the groove burns
    // (flames rising outward a few grooves high, a hot pale core, an orange body, dark red tips,
    // flicker and a few sparks, a faint glow on the lacquer around), then dies down to embers.
    float burn = 0.35 + 0.9 * lvl;
    float tall = uBand * (0.6 + 3.2 * lvl);
    float age = t - ${RING_CLOSE_FIRE.toFixed(2)} * d / 3.14159265;
    if (up >= -hb * 1.3 && up <= hb + tall * 1.25 + uBand && age >= 0.0) {
    float f = exp(-age / burn);
    float emb = exp(-age / (burn * ${RING_EMBER_FIRE.toFixed(2)}));
    float hot = exp(-age / 0.04);
    float n1 = vnoise(vec2(s * 70.0, up * 95.0 - uFxTime * 6.5));
    float n2 = vnoise(vec2(s * 150.0 + 3.7, up * 210.0 - uFxTime * 12.0));
    float n = 0.64 * n1 + 0.36 * n2;
    float inBand = 1.0 - smoothstep(hb * 0.55, hb * 1.25, abs(up));
    // Tongues: height varies along the groove and flickers; cooler toward their tips.
    float y = (up + hb) / max(tall * max(f, 0.2), 1e-4) + (n2 - 0.5) * 0.35;
    float hgt = 0.35 + 0.65 * n1;
    float tongue = step(0.0, up + hb) * (1.0 - smoothstep(hgt * 0.55, hgt, y));
    // Mostly an orange body; pale only where the flicker runs hot, at the flames' roots.
    float heat = f * (inBand * (0.30 + 0.55 * n * n) + tongue * (1.0 - clamp(y / hgt, 0.0, 1.0)) * (0.5 + 0.6 * n));
    heat = min(heat, 0.82) + hot * inBand * 0.3;                                      // the front itself, a hair hotter
    heat = max(heat, emb * (1.0 - f) * inBand * smoothstep(0.5, 0.85, n) * 0.75);     // embers after the flames
    heat = clamp(heat, 0.0, 1.0);
    vec3 add = fireRamp(heat) * heat * (0.45 + 0.55 * lvl);
    // A few sparks rising off the flames.
    float cell = floor(s * 85.0);
    float tick = floor(uFxTime * 3.0);
    float sp = hash12(vec2(cell, tick));
    if (sp > 0.94 && f > 0.15) {
      float sy = hb + fract(uFxTime * 3.0) * (tall * 1.4 + uBand);
      float sx = fract(s * 85.0) - 0.5;
      add += vec3(1.0, 0.75, 0.4) * exp(-sx * sx / 0.02) * exp(-pow((up - sy) / (0.18 * uBand), 2.0)) * f * 0.9;
    }
    // A faint glow on the lacquer round the burning groove.
    add += vec3(1.0, 0.32, 0.04) * f * lvl * 0.10 * exp(-abs(up) / (uBand * 2.5));
    res = add;
    }
  } else {
  // Water: a swell runs both ways round the groove from the landing point, with a bright crest and a
  // little foam at its front and wavelets behind it that catch the light, then a slow shimmer.
  float phi = 3.14159265 * clamp(t / ${RING_CLOSE_SEA.toFixed(2)}, 0.0, 1.0);
  float behind = (phi - d) * rc;                // Earth radii behind the front (negative: not reached)
  if (abs(up) <= hb * 1.5 && behind >= -0.02) {
  float prof = 1.0 - smoothstep(hb * 0.5, hb * 1.5, abs(up));
  float closing = 1.0 - smoothstep(${RING_CLOSE_SEA.toFixed(2)}, ${RING_CLOSE_SEA.toFixed(2)} + 0.25, t);
  float crest = exp(-behind * behind / 0.0016) * closing;
  float settle = exp(-max(t - ${RING_CLOSE_SEA.toFixed(2)}, 0.0) / (0.25 + 0.3 * lvl)) * (1.0 - smoothstep(${(RING_CLOSE_SEA + 1.2).toFixed(2)}, ${(RING_CLOSE_SEA + 1.6).toFixed(2)}, t));
  float wn = vnoise(vec2(s * 18.0, uFxTime * 0.8));
  float wave = sin((behind + 0.04 * wn) / 0.11 * 6.2831853 - uFxTime * 5.0) * exp(-max(behind, 0.0) / (0.3 + 0.4 * lvl));
  float wl = (0.5 + 0.5 * wave) * exp(-max(behind, 0.0) / (0.3 + 0.4 * lvl)) * settle * step(0.0, behind);
  float foam = crest * smoothstep(0.5, 0.9, vnoise(vec2(s * 140.0, uFxTime * 3.0 + up * 160.0)));
  float shim = (0.5 + 0.5 * sin(s * 45.0 - uFxTime * 2.5)) * settle * step(0.0, behind) * 0.35;
  vec3 c = mix(rc3, vec3(0.93, 0.97, 1.0), 0.55);
  vec3 add = c * crest * (1.0 + 0.8 * lvl);
  add += (rc3 * 0.6 + SHEEN * 0.4) * wl * (0.25 + 1.2 * wedge + 0.3 * broad) * (0.5 + 0.7 * lvl) * (0.6 + 0.4 * lit);
  add += vec3(0.95, 0.98, 1.0) * foam * 0.35;
  add += rc3 * shim * (0.15 + 0.5 * wedge) * lvl;
  res = add * prof;
  }
  }
  return res;
}

// The sustained flame of a burning groove (band j, burn level b) at this point: lower and calmer than
// the ignition, one octave, flames no taller than one groove so neighbouring bands never pile up into a
// wall of fire, no glow on the lacquer. As uBurnFade falls it dies down to a few embers.
vec3 sustainFire(float j, float b, float r, float th) {
  vec3 res = vec3(0.0);
  float rc = uG0 - (j + 0.5) * uBand;
  float up = r - rc;
  float hb = 0.5 * uBand;
  float tall = uBand * (0.3 + 0.6 * b);
  if (up >= -hb * 1.1 && up <= hb + tall) {
    float s = th * rc;
    float n = vnoise(vec2(s * 55.0 + j * 7.3, up * 75.0 - uFxTime * 4.5));
    float inBand = 1.0 - smoothstep(hb * 0.5, hb * 1.1, abs(up));
    float y = (up + hb) / max(tall, 1e-4);
    float h = 0.4 + 0.6 * n;
    float tongue = step(0.0, up + hb) * (1.0 - smoothstep(h * 0.55, h, y)) * (1.0 - clamp(y / h, 0.0, 1.0));
    float heat = b * (inBand * (0.22 + 0.3 * n) + tongue * (0.32 + 0.38 * n));
    float flame = heat * uBurnFade;
    float ember = b * inBand * smoothstep(0.62, 0.86, n) * (1.0 - uBurnFade) * smoothstep(0.0, 0.35, uBurnFade) * 0.6;
    float hh = min(max(flame, ember), 0.68);
    res = fireRamp(hh) * hh * 0.6;
  }
  return res;
}

// The newest date's entry when it has no effect of its own: its color spreads both ways round the
// groove from the stylus, a soft fade rather than a pop.
float enterReveal(vec4 e, float th) {
  float d = abs(wrapPi(th - e.y));
  float phi = (3.14159265 + 0.9) * smoothstep(0.0, 1.0, e.z / ${ENTER_S.toFixed(2)});
  return clamp((phi - d) / 0.9, 0.0, 1.0);
}

// One hairline of width w (same units as d and fw) at d = 0, at least a pixel wide (dimmer instead).
float hair(float d, float w, float fw) {
  float ww = max(w, fw);
  return (1.0 - smoothstep(0.5 * (ww - fw), 0.5 * (ww + fw), abs(d))) * w / ww;
}

void main() {
  vec2 p = vP.xy;
  float r = length(p);
  vec2 R = p / max(r, 1e-4);           // outward, in the plane
  vec3 V = normalize(vCam - vP);
  vec3 L = vec3(uSun, 0.0);            // the Sun lies in the disc's plane
  float RL = dot(R, uSun);

  // In front of the planet? The view ray continues past this point into the Earth (or its thin
  // atmosphere): then the disc all but disappears, so the frame on the planet is never veiled.
  vec3 dir = -V;
  float s = -dot(vP, dir);
  float h = sqrt(max(dot(vP, vP) - s * s, 0.0));
  float front = s > 0.0 ? 1.0 - smoothstep(1.0, 1.09, h) : 0.0;

  // The Earth's shadow: a strip two Earth radii wide along the anti-Sun direction, soft-edged.
  float perp = abs(p.x * uSun.y - p.y * uSun.x);
  float lit = 1.0 - 0.8 * step(dot(p, uSun), 0.0) * (1.0 - smoothstep(0.86, 1.14, perp));

  vec3 col;
  float cover = 1.0;
  if (vEdge > 0.5) {
    // The outer edge (the record's thickness): only its outward face, matte black with a soft,
    // broad sheen on the side facing the Sun (no specular line, so it never draws a bright ellipse).
    float facing = dot(vec3(R, 0.0), V);
    if (facing <= 0.0) discard;
    float dif = max(RL, 0.0) * lit;
    col = vec3(0.016, 0.018, 0.024) + SHEEN * 0.07 * dif * dif + SKY * 0.25;
  } else {
    float fr = max(length(vec2(dFdx(r), dFdy(r))), 1e-6); // radius per pixel (grows at grazing angles)
    cover = smoothstep(uRin, uRin + 1.5 * fr, r);
    if (cover <= 0.0) discard;
    float cosV = abs(V.z);
    float c5 = 1.0 - cosV;
    float F = 0.04 + 0.96 * c5 * c5 * c5 * c5 * c5; // glossy lacquer: a mirror only at grazing angles

    // The anisotropic sheen of circular grooves: broad soft wedges across them, along the half-way
    // direction between the Sun and the eye (no line highlights anywhere).
    vec3 T = vec3(-R.y, R.x, 0.0);
    vec3 H = normalize(L + V);
    float th = dot(T, H);
    float a2 = max(1.0 - th * th, 0.0);
    float a4 = a2 * a2;
    float a8 = a4 * a4;
    float wedge = a8 * a2;                  // soft core
    float broad = a2;                       // its wide skirt

    // ---------------- the paper label (from the planet out to uRl)
    float paper = 1.0 - smoothstep(uRl - 0.5 * fr, uRl + 0.5 * fr, r);
    vec3 lab = vec3(0.0);
    if (paper > 0.0) {
      // Unrolled print: clockwise as seen from the face in view, so the lettering never reads mirrored
      // (each face carries its own side of the label). Two angle coordinates, one without a seam
      // where the other has it, so mipmapping never draws a line at the seam.
      float side = vCam.z >= 0.0 ? 1.0 : -1.0;
      float a = (atan(p.y, p.x) - uLabelRot - uSpin) / ${(Math.PI * 2).toFixed(6)} * -side;
      float ua = fract(a);
      float ub = fract(a + 0.5) - 0.5;
      float uu = fwidth(ua) <= fwidth(ub) + 1e-5 ? ua : ub;
      float vr = clamp((r - uR0) / (uRl - uR0), 0.0, 1.0);
      float tv = side > 0.0 ? 0.5 + 0.5 * vr : 0.5 * vr;
      tv = min(tv, side > 0.0 ? 0.998 : 0.498);
      lab = texture2D(uLabel, vec2(uu, tv)).rgb;
      // Matte paper: an even light (the Sun grazes the plane), a little brighter on the Sun's side,
      // dimmer in the Earth's shadow; no sheen.
      lab *= (0.80 + 0.20 * max(RL, 0.0)) * mix(0.55, 1.0, lit);
    }

    // ---------------- the vinyl (from the label edge out to the rim)
    // Grooves. u counts dates from the outer playing edge (u = k: boundary k; date i is u in i..i+1).
    float u = (uG0 - r) / uBand;
    float fu = fr / uBand;
    float groove = smoothstep(uG1 - fr, uG1, r) * (1.0 - smoothstep(uG0, uG0 + fr, r));
    float tex = 1.0;
    if (uCount > 0.0) {
      float k = clamp(floor(u + 0.5), 0.0, uCount);
      int ki = int(k);
      float m = ki < ${MAX_MARKS} ? uMarks[ki / 4][ki - (ki / 4) * 4] : 1.0;
      float jan = step(1.5, m) * step(0.5, k) * step(k, uCount - 0.5);
      // Each January opens a year with a smooth band, like the gap between two tracks; the other
      // date boundaries are only a faint narrowing of the grooves (seen up close).
      groove *= 1.0 - jan * hair(u - k, 0.30, fu);
      groove *= 1.0 - 0.30 * (1.0 - jan) * lineAA(u, 0.08, fu);
      tex = 0.7 + 0.6 * lineAA(u * uMicro, 0.5, fu * uMicro);
    }
    float wall = abs(RL);
    col = vec3(0.006, 0.007, 0.010);                          // black lacquer
    col += SKY * F;                                           // the sky in the gloss
    col += SHEEN * groove * tex * lit * (0.016 * wall + 0.045 * broad + 0.30 * wedge);
    col += vec3(0.008, 0.009, 0.012) * groove * tex;          // grooves read a touch lighter than gloss
    // The dead wax and the lead-in are smooth: no sheen, a hair darker than the grooves.
    // A soft shadow on the vinyl just outside the paper edge (the label is a sheet laid on it).
    col *= 0.55 + 0.45 * smoothstep(uRl, uRl + 0.035, r);
    // The rounded rim: the last stretch turns down to the edge and darkens, no highlight line.
    col *= 1.0 - 0.45 * smoothstep(uRo - 0.05, uRo, r);

    // The groove of the date shown, only where the stylus rests: a short soft glint under the tip,
    // nothing round the rest of the record.
    if (uCount > 0.0 && uTipOn > 0.001) {
      float x = u - (uCur + 0.5);
      float se = max(0.10, 0.6 * fu);
      // Distance along the groove from the tip, in Earth radii: the glint is about a third of a radius long.
      float along = r * acos(clamp(dot(R, uTip), -1.0, 1.0));
      col += SHEEN * exp(-0.5 * x * x / (se * se)) * 0.45 * uTipOn * exp(-along * along / 0.03);
    }

    // The trace: each date already played keeps its value's color in its groove, all the way round
    // the record, as lacquer that caught the color (a tint in the lacquer and in the Sun the grooves
    // catch, strongest in the sheen wedges). A date whose effect is running shows its color only
    // where the front has passed.
    float thd = atan(p.y, p.x) - uSpin; // the angle on the disc itself (the scratch turns it)
    if (uPlayedOn > 0.5 && uCount > 0.0 && groove > 0.0) {
      float kk = floor(u);
      if (kk >= 0.0 && kk < uCount) {
        vec4 m = texture2D(uPlayed, vec2((kk + 0.5) / ${MAX_MARKS}.0, 0.5));
        float rclose = uRingKind > 1.5 ? ${RING_CLOSE_FIRE.toFixed(2)} : ${RING_CLOSE_SEA.toFixed(2)};
        if (m.r + m.g + m.b > 0.0) {
          // rgb carries the color already scaled by how much of it the groove takes (strength).
          float rev = 1.0;
          float rdelay = uRingKind > 1.5 ? 0.6 : 0.0;
          if (kk == uRingA.x) rev = ringReveal(uRingA, thd, rclose, rdelay);
          else if (kk == uRingB.x) rev = ringReveal(uRingB, thd, rclose, rdelay);
          else if (kk == uEnter.x && uEnter.z >= 0.0) rev = enterReveal(uEnter, thd);
          // Colored lacquer, not a light: an even tint plus what the grooves catch from the Sun, all of
          // it dimmed in the Earth's shadow. The fire record's held colors are a stronger tint, so a
          // calm month reads as a quiet silver and a strong one as a deep red at any distance.
          float tint = mix(0.055, ${TRACE_TINT_FIRE.toFixed(2)}, uFireTrace) * (0.35 + 0.65 * lit);
          float catchSun = lit * mix(0.025 * wall + 0.11 * broad + 0.38 * wedge, 0.04 * wall + 0.16 * broad + 0.5 * wedge, uFireTrace);
          col += m.rgb * groove * tex * rev * (tint + catchSun);
        }
        // Burning grooves (alpha: the burn level): this band's own flame, and the flame of the groove
        // just inside it, which rises into this band. Only bands that burn pay for the noise.
        if (uBurnOn > 0.5) {
          float b0 = m.a;
          float b1 = kk + 1.0 < uCount ? texture2D(uPlayed, vec2((kk + 1.5) / ${MAX_MARKS}.0, 0.5)).a : 0.0;
          if (b0 > 0.0 && kk == uRingA.x) b0 *= ringReveal(uRingA, thd, rclose, 0.0);
          else if (b0 > 0.0 && kk == uRingB.x) b0 *= ringReveal(uRingB, thd, rclose, 0.0);
          if (b1 > 0.0 && kk + 1.0 == uRingA.x) b1 *= ringReveal(uRingA, thd, rclose, 0.0);
          else if (b1 > 0.0 && kk + 1.0 == uRingB.x) b1 *= ringReveal(uRingB, thd, rclose, 0.0);
          if (b0 > 0.0) col += sustainFire(kk, b0, r, thd);
          if (b1 > 0.0) col += sustainFire(kk + 1.0, b1, r, thd);
        }
      }
    }

    // The grooves being animated (at most two dates at once): only points near their radius pay.
    if (uRingKind > 0.5 && r > uRl) {
      if (uRingA.x >= 0.0 && uRingA.z >= 0.0) col += ringFx(uRingA, uRingColA, r, thd, wedge, broad, lit);
      if (uRingB.x >= 0.0 && uRingB.z >= 0.0) col += ringFx(uRingB, uRingColB, r, thd, wedge, broad, lit);
    }

    col = mix(col, lab, paper);
  }

  // Where the record runs off the canvas it dissolves instead of ending in a straight cut.
  vec2 e = min(gl_FragCoord.xy, uView - gl_FragCoord.xy) / (0.05 * min(uView.x, uView.y));
  float edge = smoothstep(0.0, 1.0, min(e.x, e.y));
  float k = uPresence * cover * edge * (1.0 - 0.97 * front);
  gl_FragColor = vec4(col * k, k);
}`;

// ---------------------------------------------------------------- stylus shaders

// The stylus is a cubic curve given by four control points (uniforms), evaluated in the vertex
// shader and drawn as a ribbon of constant width on screen. A point that would fall inside the
// planet is pushed back to its surface, so the hairline can never pass through the Earth.
const STYLUS_VERT = `
attribute float aT;
attribute float aSide;
uniform vec3 uP0;
uniform vec3 uP1;
uniform vec3 uP2;
uniform vec3 uP3;
uniform vec2 uViewport; // drawing buffer, device px
uniform float uHalf;    // half width, device px
uniform float uPktOn;   // the effect packet riding the hairline: strength 0 to 1 (0: none, the common path)
uniform float uPktHead; // where its head is along the curve (0 at the place, 1 at the tip)
uniform float uPktKind; // 1 a crest of water, 2 embers and a short flame
uniform float uPktW;    // its extra half width at full strength, device px
varying float vAcross;  // device px from the center line
varying float vT;
varying float vOver;    // 1 where the hairline lies over the planet's face (the packet keeps thin there)
varying float vHalf;    // half width of the ribbon here (wider where the packet is)
vec3 curve(float t) {
  float s = 1.0 - t;
  vec3 p = s * s * s * uP0 + 3.0 * s * s * t * uP1 + 3.0 * s * t * t * uP2 + t * t * t * uP3;
  float l = length(p);
  return p * (max(l, 1.006) / max(l, 1e-5));
}
vec2 screen(vec4 c) { return c.xy / max(c.w, 1e-4) * uViewport * 0.5; }
void main() {
  mat4 mvp = projectionMatrix * modelViewMatrix;
  vec3 q = curve(aT);
  vec4 c = mvp * vec4(q, 1.0);
  // Over the planet's face? The view ray to this point passes within the Earth, and the point lies on
  // the camera's side of it (behind the planet it is hidden anyway).
  vec3 wq = (modelMatrix * vec4(q, 1.0)).xyz;
  vec3 dq = normalize(wq - cameraPosition);
  float sq = -dot(cameraPosition, dq);
  float hq = length(cameraPosition + dq * sq);
  vOver = dot(wq - cameraPosition, dq) < sq ? 1.0 - smoothstep(1.0, 1.07, hq) : 0.0;
  vec2 a = screen(mvp * vec4(curve(max(aT - 0.004, 0.0)), 1.0));
  vec2 b = screen(mvp * vec4(curve(min(aT + 0.004, 1.0)), 1.0));
  vec2 dir = b - a;
  dir = dot(dir, dir) > 1e-8 ? normalize(dir) : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  // The packet: a short swelling of the ribbon round its head, with a longer tail behind (fire) or
  // a rounder crest (water); kept thin over the planet's face.
  float hw = uHalf;
  if (uPktOn > 0.001) {
    float d = aT - uPktHead;
    float tail = uPktKind > 1.5 ? 0.16 : 0.08;
    float sw = d > 0.0 ? exp(-d * d / 0.0009) : exp(-d * d / (tail * tail));
    hw += uPktW * uPktOn * sw * (1.0 - 0.4 * vOver);
  }
  c.xy += n * aSide * hw / (uViewport * 0.5) * c.w;
  vAcross = aSide * hw;
  vHalf = hw;
  vT = aT;
  gl_Position = c;
}`;

// Amber core between dark keylines (the Keyline Rule), so it reads over the bright limb and over
// any colorbar value.
const STYLUS_FRAG = `
uniform vec3 uAmber;
uniform vec3 uKey;
uniform float uCore;    // half width of the amber core, device px
uniform float uHalf;
uniform float uOpacity;
uniform float uFade;
uniform float uPktOn;
uniform float uPktHead;
uniform float uPktKind;
uniform float uPktTime;
uniform vec3 uPktColor;
varying float vAcross;
varying float vT;
varying float vOver;
varying float vHalf;
float hash11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float noise11(float x) { float i = floor(x), f = fract(x); return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
void main() {
  float d = abs(vAcross);
  float edge = 1.0 - smoothstep(uHalf - 1.0, uHalf, d);
  float core = 1.0 - smoothstep(uCore - 0.5, uCore + 0.5, d);
  // It rises out of the place: the first stretch fades in from the selected-place ring.
  float rise = smoothstep(0.0, 0.06, vT);
  float a = max(core, edge * 0.55) * uOpacity * uFade * rise;
  vec3 col = mix(uKey, uAmber, core);
  // The effect packet riding the line (only while one travels): it leaves the place, runs along the
  // hairline and lands on the record. The amber core stays visible through it.
  if (uPktOn > 0.001) {
    float dt = vT - uPktHead;
    float x = d / max(vHalf, 1.0); // 0 on the center line, 1 at the ribbon's edge
    float pa = 0.0;
    vec3 pc = uPktColor;
    if (uPktKind < 1.5) {
      // Water: one crest, sharp in front and smooth behind, then two small wavelets in its wake.
      float crest = dt > 0.0 ? exp(-dt * dt / 0.0004) : exp(-dt * dt / 0.0036);
      float wake = dt < 0.0 ? exp(-dt * dt / 0.02) * (0.5 + 0.5 * sin(dt * 140.0 + uPktTime * 9.0)) * 0.45 : 0.0;
      float body = max(crest, wake);
      pa = body * (1.0 - 0.35 * x * x);
      // The value's color, a white crest line along its front, and a dark rim so it reads on any
      // background (the pale land, the colored frame, the black lacquer).
      pc = mix(uPktColor, vec3(0.95, 0.98, 1.0), 0.75 * crest * (1.0 - smoothstep(0.0, 0.45, x)));
      pc = mix(pc, uKey, 0.85 * smoothstep(0.55, 0.9, x));
    } else {
      // Fire: embers strung along the tail and a short flame licking ahead of them, flickering.
      float tail = smoothstep(-0.17, -0.02, dt) * (1.0 - smoothstep(0.0, 0.03, dt));
      float flick = noise11(vT * 70.0 - uPktTime * 24.0);
      float lick = exp(-pow(max(dt + 0.015, 0.0) / 0.02, 2.0)) * smoothstep(-0.06, -0.01, dt);
      float flame = max(tail * (0.45 + 0.55 * flick), lick) * (1.0 - smoothstep(0.35 + 0.5 * flick, 1.0, x));
      float cell = floor(vT * 160.0 - uPktTime * 30.0);
      float ember = step(0.78, hash11(cell)) * tail * (1.0 - smoothstep(0.0, 0.6, abs(x - hash11(cell + 7.0) * 0.8)));
      float heat = clamp(max(flame * 1.25, ember * 1.3), 0.0, 1.0);
      pa = heat;
      pc = mix(vec3(0.55, 0.07, 0.01), vec3(1.0, 0.42, 0.06), smoothstep(0.1, 0.6, heat));
      pc = mix(pc, vec3(1.0, 0.88, 0.6), smoothstep(0.65, 1.0, heat) * (1.0 - x));
    }
    pa *= uPktOn * uOpacity * uFade * mix(1.0, 0.8, vOver);
    // Keep the amber core readable: the packet sits round it, lighter over the core itself.
    pa *= 1.0 - 0.6 * core;
    float outA = a + pa * (1.0 - a);
    col = (col * a * (1.0 - pa) + pc * pa) / max(outA, 1e-4);
    a = outA;
  }
  if (a <= 0.003) discard;
  gl_FragColor = vec4(col, a);
}`;

const TIP_VERT = `
uniform vec3 uTip;
uniform float uSize;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(uTip, 1.0);
  gl_PointSize = uSize;
}`;

const TIP_FRAG = `
uniform vec3 uAmber;
uniform vec3 uKey;
uniform float uSize;
uniform float uScale;
uniform float uOpacity;
void main() {
  float R = uSize * 0.5;
  float rpx = length(gl_PointCoord * 2.0 - 1.0) * R;
  float edge = 1.0 - smoothstep(R - 1.0, R, rpx);
  if (edge <= 0.0) discard;
  float key = 1.3 * uScale;
  float core = 1.0 - smoothstep(R - key - 0.8, R - key + 0.2, rpx);
  gl_FragColor = vec4(mix(uKey, uAmber, core), edge * mix(0.75, 1.0, core) * uOpacity);
}`;

// ---------------------------------------------------------------- the record

/**
 * @param THREE the three.js module
 * @param opts.reducedMotion () => boolean: eases become cuts
 * @param opts.outer outer edge of the disc, in Earth radii
 * @param opts.label inner edge of the disc: the label reaches down to the planet's atmosphere
 * @param opts.paper edge of the printed paper label, in Earth radii
 */
export function createRecord(THREE, { reducedMotion = () => false, lite = false, outer = OUTER, label = 1.06, paper = LABEL_EDGE } = {}) {
  // The Earth and a printed paper ring around it are the label; the grooved playing area is matte
  // black, the rim has thickness.
  const Ro = outer;
  const Rin = label;
  const RL = paper; // edge of the paper label
  const LEAD_IN = 0.08; // smooth lacquer (and the rounded rim) between the edge and the first groove
  const DEAD_WAX = 0.10; // smooth lacquer between the label and the last groove
  const G0 = Ro - LEAD_IN; // first date's groove starts here
  const G1 = RL + DEAD_WAX; // last date's groove ends here
  const THICK = EDGE_MODE === "thick" ? 0.06 : 0.03; // the disc's thickness, seen at its edge (a real LP: about 1/150 of its diameter)

  const raw = (hex) => new THREE.Color().setHex(hex, THREE.NoColorSpace); // display values, unconverted

  // ------------------------------------------------------------ the printed label
  // Drawn once on a 2D canvas (again when the record or the fonts change), unrolled: x is the angle
  // round the record (clockwise as seen from the face), y the radius from the paper edge (the band's
  // top row) to the planet's surface (its bottom row). Side A (seen from the ecliptic north) fills
  // the upper half, side B the lower half.
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = LABEL_W;
  labelCanvas.height = LABEL_H * 2;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.NoColorSpace; // display values, drawn as they are
  labelTex.wrapS = THREE.RepeatWrapping;
  labelTex.wrapT = THREE.ClampToEdgeWrapping;
  labelTex.anisotropy = 4;
  const labelText = { title: "", span: "" };
  // The wordmark as printed: its angular length round the record (rad) and its radius, measured when
  // the label is drawn (for setLabelFacing).
  const wordmark = { span: 1.2, r: 1.23, base: 1.21 };
  function drawLabel() {
    const ctx = labelCanvas.getContext("2d");
    if (!ctx) return;
    const W = LABEL_W, Hh = LABEL_H;
    const rowR = (row) => RL - (row / Hh) * (RL - 1); // radius of a row (0: paper edge)
    for (let sideI = 0; sideI < 2; sideI++) {
      const y0 = sideI * Hh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, W, Hh);
      ctx.clip();
      // Deep cobalt paper, a touch lighter toward its edge, with a fine grain.
      const g = ctx.createLinearGradient(0, y0, 0, y0 + Hh);
      g.addColorStop(0, "#1a3a9e");
      g.addColorStop(0.35, "#132f8a");
      g.addColorStop(1, "#0c2266");
      ctx.fillStyle = g;
      ctx.fillRect(0, y0, W, Hh);
      let seed = 7 + sideI * 13;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      ctx.fillStyle = "rgba(200,215,255,0.035)";
      for (let i = 0; i < 2600; i++) ctx.fillRect(rnd() * W, y0 + rnd() * Hh, 1 + rnd() * 2, 1);
      ctx.fillStyle = "rgba(0,0,20,0.06)";
      for (let i = 0; i < 2600; i++) ctx.fillRect(rnd() * W, y0 + rnd() * Hh, 1 + rnd() * 2, 1);
      // The paper edge itself: a slightly lighter, worn border.
      ctx.fillStyle = "rgba(170,190,240,0.16)";
      ctx.fillRect(0, y0, W, 2);
      // One thin silver ring just inside the edge.
      ctx.fillStyle = "rgba(205,215,232,0.85)";
      ctx.fillRect(0, y0 + 8, W, 1.6);
      // Lettering: silver serif. The glyphs are squeezed along x so they keep their shape at the
      // radius they are printed at (a column is an angle; a row is a length).
      const ink = "rgba(222,230,244,0.94)";
      const word = (text, cx, rowTop, px, spacing, flip, weight = 600) => {
        const r = rowR(rowTop + px * 0.5);
        const sx = (Hh / (RL - 1)) / (W / (Math.PI * 2 * r)); // column width vs row height at that radius
        ctx.save();
        ctx.font = `${weight} ${px}px Cormorant, "Cormorant Garamond", Garamond, serif`;
        ctx.letterSpacing = `${spacing}px`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = ink;
        if (text === WORDMARK) {
          wordmark.span = (ctx.measureText(text).width / sx / W) * TAU;
          wordmark.r = r;
          wordmark.base = rowR(rowTop + px * 0.72);
        }
        for (const off of [0, -W, W]) {
          ctx.save();
          ctx.translate(cx + off, y0 + rowTop + px * 0.36);
          if (flip) ctx.rotate(Math.PI);
          ctx.scale(1 / sx, 1);
          ctx.fillText(text, 0, px * 0.36);
          ctx.restore();
        }
        ctx.restore();
      };
      // Tops outward, reading clockwise: the wordmark. Opposite, tops inward (upright when that part
      // of the record faces the viewer): the record's title.
      word(WORDMARK, W * 0.25, 16, 40, 3, false); // letter spacing kept tight so it fits beside the planet in the home view
      if (labelText.title) word(labelText.title.toUpperCase(), W * 0.75, 18, 30, 4, true);
      word(sideI === 0 ? "SIDE A" : "SIDE B", W * 0.5, 22, 22, 6, false, 500);
      if (labelText.span) word(labelText.span, 0, 22, 22, 5, true, 500);
      ctx.restore();
    }
    labelTex.needsUpdate = true;
  }
  drawLabel();
  try {
    document.fonts?.load?.('600 40px "Cormorant"').then(() => document.fonts.ready).then(drawLabel, () => {});
  } catch { /* fonts API missing: the fallback serif stays */ }

  const group = new THREE.Group(); // add to the ecliptic-plane group (local z = ecliptic pole)
  group.name = "record";

  // ------------------------------------------------------------ disc
  const marks = Array.from({ length: MAX_MARKS / 4 }, () => new THREE.Vector4(1, 1, 1, 1));
  // The trace: one texel per date (rgb the value's color times how much of it the groove takes, alpha
  // the date's sustained burn level on the fire record; all 0: not played, no data or no color).
  // 128 x 1 RGBA, 512 bytes.
  const playedData = new Uint8Array(MAX_MARKS * 4);
  const playedTex = new THREE.DataTexture(playedData, MAX_MARKS, 1, THREE.RGBAFormat);
  const marked = new Uint8Array(MAX_MARKS); // which dates have been played (with a value)
  const playedBase = new Uint8Array(MAX_MARKS * 4); // the marks at full strength (a clearing fade scales them)
  const fading = new Uint8Array(MAX_MARKS); // dates fading out in a clearMarks({ ms })
  playedTex.colorSpace = THREE.NoColorSpace;
  playedTex.magFilter = THREE.NearestFilter;
  playedTex.minFilter = THREE.NearestFilter;
  playedTex.generateMipmaps = false;
  playedTex.needsUpdate = true;
  const discUniforms = {
    uPlayed: { value: playedTex },
    uPlayedOn: { value: 0 },

    uFxTime: { value: 0 },
    uRingKind: { value: 0 },
    uRingA: { value: new THREE.Vector4(-1, 0, -1, 0) },
    uRingB: { value: new THREE.Vector4(-1, 0, -1, 0) },
    uRingColA: { value: new THREE.Vector3(1, 1, 1) },
    uRingColB: { value: new THREE.Vector3(1, 1, 1) },
    uSpin: { value: 0 },
    uBurnOn: { value: 0 },
    uFireTrace: { value: 0 },
    uEnter: { value: new THREE.Vector4(-1, 0, -1, 0) },
    uBurnFade: { value: 1 },
    uRin: { value: Rin },
    uLabelRot: { value: 0 },
    uR0: { value: 1 },
    uView: { value: new THREE.Vector2(1, 1) },
    uLabel: { value: labelTex },
    uRl: { value: RL },
    uG1: { value: G1 },
    uG0: { value: G0 },
    uRo: { value: Ro },
    uBand: { value: (G0 - G1) / 24 },
    uCount: { value: 0 },
    uMicro: { value: 6 },
    uCur: { value: 0 },
    uMarks: { value: marks },
    uSun: { value: new THREE.Vector2(1, 0) },
    uPresence: { value: 1 },
    uTip: { value: new THREE.Vector2(1, 0) },
    uTipOn: { value: 0 },
  };
  const discMat = new THREE.ShaderMaterial({
    uniforms: discUniforms,
    vertexShader: DISC_VERT,
    fragmentShader: DISC_FRAG,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true, // opaque lacquer; it fades (premultiplied) only in front of the planet
  });
  // One mesh, one draw call: the face (an annulus in z = 0) and the thin outer edge (a short band).
  const SEG = 360;
  const discPos = new Float32Array((SEG + 1) * 4 * 3);
  const discEdge = new Float32Array((SEG + 1) * 4);
  const discIdx = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * TAU;
    const c = Math.cos(a), sn = Math.sin(a);
    const o = i * 4;
    discPos.set([c * Rin, sn * Rin, 0, c * Ro, sn * Ro, 0, c * Ro, sn * Ro, -THICK / 2, c * Ro, sn * Ro, THICK / 2], o * 3);
    discEdge.set([0, 0, 1, 1], o);
    if (i < SEG) {
      const n = o + 4;
      discIdx.push(o, o + 1, n, o + 1, n + 1, n); // face
      discIdx.push(o + 2, o + 3, n + 2, o + 3, n + 3, n + 2); // edge
    }
  }
  const discGeo = new THREE.BufferGeometry();
  discGeo.setAttribute("position", new THREE.BufferAttribute(discPos, 3));
  discGeo.setAttribute("aEdge", new THREE.BufferAttribute(discEdge, 1));
  discGeo.setIndex(discIdx);
  const disc = new THREE.Mesh(discGeo, discMat);
  // Drawn after the clouds and before the atmosphere (2), so the thin blue limb glow stays over the
  // label where the disc passes behind the planet's edge.
  disc.renderOrder = 1.5;
  disc.frustumCulled = false;
  group.add(disc);

  // ------------------------------------------------------------ stylus
  const n = STYLUS_SEGMENTS + 1;
  const tAttr = new Float32Array(n * 2);
  const sideAttr = new Float32Array(n * 2);
  const index = [];
  for (let i = 0; i < n; i++) {
    tAttr[i * 2] = tAttr[i * 2 + 1] = i / STYLUS_SEGMENTS;
    sideAttr[i * 2] = -1;
    sideAttr[i * 2 + 1] = 1;
    if (i < n - 1) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const stylusGeo = new THREE.BufferGeometry();
  // three.js wants a position attribute to count vertices; the curve itself comes from uniforms.
  stylusGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  stylusGeo.setAttribute("aT", new THREE.BufferAttribute(tAttr, 1));
  stylusGeo.setAttribute("aSide", new THREE.BufferAttribute(sideAttr, 1));
  stylusGeo.setIndex(index);
  const viewport = new THREE.Vector2(1, 1);
  const stylusUniforms = {
    uP0: { value: new THREE.Vector3() },
    uP1: { value: new THREE.Vector3() },
    uP2: { value: new THREE.Vector3() },
    uP3: { value: new THREE.Vector3() },
    uViewport: { value: viewport },
    uHalf: { value: 2 },
    uCore: { value: 0.8 },
    uOpacity: { value: 0 },
    uFade: { value: 1 },
    uAmber: { value: raw(AMBER) },
    uKey: { value: raw(KEYLINE) },
    uPktOn: { value: 0 },
    uPktHead: { value: 0 },
    uPktKind: { value: 1 },
    uPktW: { value: 6 },
    uPktTime: { value: 0 },
    uPktColor: { value: new THREE.Vector3(0.8, 0.86, 0.96) },
  };
  const stylusMat = new THREE.ShaderMaterial({
    uniforms: stylusUniforms,
    vertexShader: STYLUS_VERT,
    fragmentShader: STYLUS_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const stylus = new THREE.Mesh(stylusGeo, stylusMat);
  stylus.renderOrder = 12;
  stylus.frustumCulled = false;
  stylus.visible = false;
  group.add(stylus);

  const tipUniforms = {
    uTip: { value: stylusUniforms.uP3.value },
    uSize: { value: 9 },
    uScale: { value: 1 },
    uOpacity: { value: 0 },
    uAmber: stylusUniforms.uAmber,
    uKey: stylusUniforms.uKey,
  };
  const tipGeo = new THREE.BufferGeometry();
  tipGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  const tip = new THREE.Points(tipGeo, new THREE.ShaderMaterial({
    uniforms: tipUniforms,
    vertexShader: TIP_VERT,
    fragmentShader: TIP_FRAG,
    transparent: true,
    depthWrite: false,
  }));
  tip.renderOrder = 13;
  tip.frustumCulled = false;
  tip.visible = false;
  group.add(tip);

  // Screen metrics for the hairline, read from the renderer just before it draws (no allocation).
  disc.onBeforeRender = (renderer) => renderer.getDrawingBufferSize(discUniforms.uView.value);
  stylus.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(viewport);
    const dpr = renderer.getPixelRatio();
    stylusUniforms.uCore.value = 0.85 * dpr;
    stylusUniforms.uHalf.value = 0.85 * dpr + 1.15 * dpr;
    stylusUniforms.uPktW.value = dpr * (5 + 6 * st.pkt.level);
    tipUniforms.uSize.value = 10 * dpr;
    tipUniforms.uScale.value = dpr;
  };

  // ------------------------------------------------------------ state
  const st = {
    count: 0,
    cur: { from: 0, to: 0, t0: 0, dur: 0, linear: false, active: false },
    presence: { from: 1, to: 1, t0: 0, dur: 0, active: false },
    stylusOn: { from: 0, to: 0, t0: 0, dur: 0, active: false },
    place: new THREE.Vector3(1, 0, 0),
    hasPlace: false,
    lastLon: 0,
    camSide: 1,
    reach: 1, // 0 while the tip would sit in front of the planet (nothing visible to rest on)
    presVal: 1, // presence asked for (setPresence), before the edge-on fade
    played: 0, // dates marked with a value
    // The grooves being animated: two slots, the newest replaces the oldest.
    rings: [{ index: -1, angle: 0, t0: 0, level: 0, kind: 0, pending: false, life: 0 }, { index: -1, angle: 0, t0: 0, level: 0, kind: 0, pending: false, life: 0 }],
    ringNext: 0,
    lastMarked: -1, // the date most recently given a color (the one the next packet is for)
    burning: 0, // dates whose groove keeps burning
    enter: { index: -1, angle: 0, t0: 0 }, // the newest date's entry (when it has no effect of its own)
    clearing: { active: false, t0: 0, dur: 0 }, // clearMarks({ ms }): the marks fade back to black lacquer
    burnFade: { val: 1, t0: 0, active: false }, // the burn dies down over BURN_OUT_MS when the effect ends
    spin: { val: 0, from: 0, to: 0, t0: 0, dur: 0, active: false }, // the scratch's extra turn of the record
    pkt: { on: false, t0: 0, dur: 0, level: 0, kind: 0 }, // the packet travelling along the hairline
    open: 1, // 0 when the camera is within EDGE_FADE[0] degrees of the disc's plane, 1 beyond EDGE_FADE[1]
    dirty: true,
    facing: null, // azimuth of the camera's side of the record (setLabelFacing), or null: the print is fixed to the disc
    facingInit: false, // the first facing jumps
    wordWhole: false, // the whole wordmark found a place in view (diagnostics)
    lastT: 0,
  };

  const camL = new THREE.Vector3(0, 0, 10);
  const radiusAt = (i) => G0 - (i + 0.5) * discUniforms.uBand.value;

  // Diagnostics only (info()): where a point of the record's frame lands on the canvas, in CSS px.
  let lastCam = null;
  const diagV = new THREE.Vector3();
  function screenOf(P) {
    if (!lastCam) return null;
    diagV.copy(P).applyMatrix4(group.matrixWorld).project(lastCam);
    const c = typeof document !== "undefined" ? document.querySelector("#globe-host canvas") : null;
    const w = c ? c.clientWidth : 1, h = c ? c.clientHeight : 1;
    return [+(((diagV.x + 1) / 2) * w).toFixed(1), +(((1 - diagV.y) / 2) * h).toFixed(1)];
  }
  function tipInView() {
    const P = stylusUniforms.uP3.value;
    const xy = screenOf(P);
    if (!xy) return false;
    const c = document.querySelector("#globe-host canvas"), sb = document.getElementById("stage-safe");
    if (!c || !sb) return false;
    const cr = c.getBoundingClientRect(), b = sb.getBoundingClientRect();
    const x = cr.left + (xy[0] / (c.clientWidth || 1)) * cr.width, y = cr.top + (xy[1] / (c.clientHeight || 1)) * cr.height;
    const dx = P.x - camL.x, dy = P.y - camL.y, dz = P.z - camL.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const s = -(P.x * dx + P.y * dy + P.z * dz) / len;
    const hh = Math.sqrt(Math.max(0, P.lengthSq() - s * s));
    return hh > 1.05 && x > b.left && x < b.right && y > b.top && y < b.bottom;
  }

  /**
   * Where the middle of the wordmark should sit (angle in the disc's frame) for setLabelFacing: on the
   * far side of the record (st.facing + pi), where lettering with its tops outward reads upright, but
   * slid along the label to the nearest stretch where the planet does not hide it or stand behind it
   * (with the label close to the planet, the far side itself is usually behind the Earth). Each
   * candidate is scored over the wordmark's length: visible beside the planet, and reading left to
   * right on screen (upright). Ties go to the far side and to where the wordmark already is.
   */
  /** Distance from the Earth's center of the view ray through a point of the disc (Earth radii). */
  function clearance(px, py) {
    const dx = px - camL.x, dy = py - camL.y, dz = -camL.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const s = -(px * dx + py * dy) / len;
    return Math.sqrt(Math.max(0, px * px + py * py - s * s));
  }

  function wordmarkAngle(camera) {
    const far = st.facing + Math.PI;
    if (!camera) return far;
    // The camera's right and up axes in the group's frame (the group only rotates).
    const e = group.matrixWorld.elements;
    const c = camera.matrixWorld.elements;
    const rx = c[0] * e[0] + c[1] * e[1] + c[2] * e[2], ry = c[0] * e[4] + c[1] * e[5] + c[2] * e[6];
    const ux = c[4] * e[0] + c[5] * e[1] + c[6] * e[2], uy = c[4] * e[4] + c[5] * e[5] + c[6] * e[6];
    const side = camL.z >= 0 ? 1 : -1; // the print reads clockwise as seen from the face in view
    const r = wordmark.r;
    const rb = wordmark.base; // the letters' baseline, their edge nearest the planet
    const half = wordmark.span / 2;
    const cur = discUniforms.uLabelRot.value + (side > 0 ? WORD_A : WORD_B);
    // First choice: the whole wordmark in view (every sample point clear of the planet and its air,
    // with a margin), the most level of those that still read left to right. Fallback when no
    // position shows it whole (low cameras): the most letters in view, as level as possible.
    let best = far, bestScore = -1e9, full = far, fullScore = -1e9;
    for (let i = 0; i < FACING_CANDIDATES; i++) {
      const th = far + ((i / FACING_CANDIDATES) * 2 - 1) * Math.PI;
      let score = 0, level = 0, allClear = true, allRight = true;
      for (let k = -3; k <= 3; k++) {
        // Along the wordmark, in its reading direction (clockwise as seen: decreasing angle from the north).
        const a = th - side * (k / 3) * half;
        const ca = Math.cos(a), sa = Math.sin(a);
        // Beside the planet: the view ray through this point passes clear of the Earth and its air.
        const vis = smoothstepJs(1.08, 1.16, clearance(r * ca, r * sa));
        if (clearance(rb * ca, rb * sa) < FACING_CLEAR) allClear = false;
        // Upright: the reading direction points right on screen and the letters' tops (outward) up.
        const tx = side * sa, ty = -side * ca; // reading direction in the plane
        const right = tx * rx + ty * ry;
        const up = ca * ux + sa * uy;
        // Up the flank of the label is fine (a steep line, letters leaning back by up to about 27
        // degrees past vertical); never further, so it never turns upside down.
        if (right < -0.45) allRight = false;
        level += right * (0.7 + 0.3 * Math.max(0, up));
        score += right > 0 ? vis * (0.5 + 0.5 * right) * (0.6 + 0.4 * Math.max(0, up)) : 0;
      }
      // Ties go to where the wordmark already is (no hopping between two equal stretches), then the far side.
      const keep = 0.08 * Math.cos(th - cur) + 0.03 * Math.cos(th - far);
      if (allClear && allRight && level / 7 + keep > fullScore) { fullScore = level / 7 + keep; full = th; }
      score = score / 7 + 0.08 * Math.cos(th - far) + 0.05 * Math.cos(th - cur);
      if (score > bestScore) { bestScore = score; best = th; }
    }
    st.wordWhole = fullScore > -1e9;
    if (st.wordWhole) return full;
    return best;
  }

  /** The stylus: from the place along its local vertical, curving down onto the groove shown. */
  function placeStylus() {
    const S = st.place;
    const rho = Math.hypot(S.x, S.y);
    // The place's own ecliptic longitude (kept when the place is right at the ecliptic pole).
    if (rho > 1e-4) st.lastLon = Math.atan2(S.y, S.x);
    const lon = st.lastLon;
    const rT = st.count > 0 ? radiusAt(discUniforms.uCur.value) : (G0 + G1) / 2;
    const c = Math.cos(lon), s = Math.sin(lon);
    // Which side of the disc it comes down on: the camera's, so the tip rests on the face in view
    // (a place on the other side rises through the label area beside the planet, where the disc is
    // hidden by the planet or faded in front of it).
    // Only when the camera is close to the plane does the place's own side decide. Eased, never a jump.
    const side = clamp(st.camSide + (S.z / 0.22) * (1 - Math.abs(st.camSide)), -1, 1);
    // A place on the other side of the disc: the stylus comes round low, nearly flat, so its path
    // never folds back on itself on screen (no loop over the tip).
    const far = Math.max(0, -S.z * Math.sign(side || 1));
    const lift = (0.32 + 0.18 * (rT - 1)) * (0.35 + 0.65 * Math.abs(side)) * Math.sign(side || 1) * clamp(1 - far / 0.5, 0.15, 1);
    const rise = 0.3 + 0.22 * Math.abs(S.z) + 0.15 * far;
    stylusUniforms.uP0.value.copy(S).multiplyScalar(1.004);
    stylusUniforms.uP1.value.copy(S).multiplyScalar(1 + rise);
    // Like a tonearm's head, it comes down along the groove, from the side the groove arrives from
    // (the disc turns under it toward lower ecliptic longitude as the dates advance).
    const L = Math.hypot(c * rT - stylusUniforms.uP1.value.x, s * rT - stylusUniforms.uP1.value.y, stylusUniforms.uP1.value.z);
    const b = 0.12 * L * Math.min(1, L / 0.9); // a short stylus barely bows (no hook at the tip)
    stylusUniforms.uP2.value.set(c * rT - s * b, s * rT + c * b, lift);
    // The tip rests on the groove, a hair above the lacquer on the stylus's side.
    stylusUniforms.uP3.value.set(c * rT, s * rT, 0.003 * Math.sign(side || 1));
    discUniforms.uTip.value.set(c, s);
  }

  function ease(e, t) {
    if (!e.active) return e.to;
    const s = e.dur > 0 ? clamp((t - e.t0) / e.dur, 0, 1) : 1;
    if (s >= 1) { e.active = false; return e.to; }
    const k = e.linear ? s : smoother(s);
    return e.from + (e.to - e.from) * k;
  }

  function start(e, from, to, dur, linear = false) {
    e.from = from;
    e.to = to;
    e.t0 = performance.now();
    e.dur = dur;
    e.linear = linear;
    e.active = dur > 0 && !reducedMotion() && from !== to;
  }

  // ------------------------------------------------------------ interface
  const record = {
    group,
    innerRadius: Rin, // the disc's inner edge (the label reaches the planet's atmosphere)
    outerRadius: Ro,
    /** Radius of a date's groove (index may be fractional). */
    radiusAt,

    /** The record's dates, ISO "YYYY-MM-DD", ascending; [] when there is no record. title: printed on the label. */
    setTrack(dates, title = "") {
      const list = Array.isArray(dates) ? dates : [];
      const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
      const tag = (iso) => `${MON[(+iso.slice(5, 7) || 1) - 1]} ${iso.slice(0, 4)}`;
      const span = list.length ? `${tag(list[0])} TO ${tag(list[list.length - 1])}` : "";
      if (title !== labelText.title || span !== labelText.span) {
        labelText.title = title || "";
        labelText.span = span;
        drawLabel();
      }
      st.count = list.length;
      discUniforms.uCount.value = st.count;
      const band = (G0 - G1) / Math.max(1, st.count || 24);
      discUniforms.uBand.value = band;
      // Fine grooves at a pitch of about 0.006 Earth radii, a whole number per date.
      discUniforms.uMicro.value = Math.max(2, Math.round(band / 0.006));
      for (let k = 0; k < MAX_MARKS; k++) {
        // Boundary k opens date k: January opens a year.
        const iso = list[k];
        const jan = iso && iso.slice(5, 7) === "01" ? 2 : 1;
        marks[k >> 2].setComponent(k & 3, jan);
      }
      const last = Math.max(0, st.count - 1);
      const c = clamp(st.cur.to, 0, last);
      st.cur.active = false;
      st.cur.to = st.cur.from = c;
      discUniforms.uCur.value = c;
      st.dirty = true;
    },

    /** The date shown. ms > 0: ease there over ms (linear: at a constant rate, as in Play). */
    setIndex(i, { ms = 0, linear = false } = {}) {
      const to = clamp(Math.round(+i || 0), 0, Math.max(0, st.count - 1));
      const from = discUniforms.uCur.value;
      if (ms > 0 && !reducedMotion() && Math.abs(to - from) > 1e-4) start(st.cur, from, to, ms, linear);
      else { st.cur.active = false; st.cur.to = st.cur.from = to; discUniforms.uCur.value = to; }
      st.dirty = true;
    },

    /** The Sun's ecliptic longitude (rad) for the instant shown. */
    setSun(lonRad) {
      discUniforms.uSun.value.set(Math.cos(lonRad), Math.sin(lonRad));
    },

    /** The selected place as a unit vector in the group's local (ecliptic) frame, or null. */
    setStylus(p) {
      const had = st.hasPlace;
      if (!p) {
        if (!had) return;
        st.hasPlace = false;
        start(st.stylusOn, stylusUniforms.uOpacity.value, 0, 220);
        if (!st.stylusOn.active) stylusUniforms.uOpacity.value = 0;
        return;
      }
      st.place.set(p.x, p.y, p.z).normalize();
      st.hasPlace = true;
      if (!had) {
        start(st.stylusOn, stylusUniforms.uOpacity.value, 1, 420);
        if (!st.stylusOn.active) stylusUniforms.uOpacity.value = 1;
      }
      st.dirty = true;
    },

    /** How present the disc is, 0 to 1. The stylus shows only when the disc is mostly there (above about 0.5). */
    setPresence(v01, { ms = 0 } = {}) {
      const to = clamp(+v01 || 0, 0, 1);
      if (ms > 0 && !reducedMotion()) start(st.presence, st.presVal, to, ms);
      else { st.presence.active = false; st.presence.to = to; st.presVal = to; }
    },

    /**
     * Turn the print to face the viewer: azimuth (rad, atan2(y, x) in the group's frame, like setSun)
     * is the near side of the record for the camera. The middle of the wordmark goes to the far side
     * (azimuth + pi), where lettering set with its tops outward reads upright and left to right, on
     * whichever face is seen. Eased in update(), the shortest way round; the first call and reduced
     * motion jump. null freezes the print where it is: fixed to the disc again, it turns with the dates.
     */
    setLabelFacing(azimuth) {
      if (azimuth == null || !Number.isFinite(+azimuth)) { st.facing = null; return; }
      st.facing = +azimuth;
    },

    /**
     * The date at index has been played: rgb (three numbers 0 to 1, sRGB, the value's color on the
     * record's own scale) stays in its groove, all the way round (while that date's effect runs, only
     * where its front has passed); null: the date has no data (its groove stays black). strength (0 to
     * 1): how much of the color the groove takes (0 leaves the black lacquer, a little is a faint tint).
     * burn (0 to 1): the groove keeps a live flame at this height for the rest of the Play (fire record;
     * 0: none), until setEffect(null) lets every burning groove die down together.
     */
    mark(index, rgb, { strength = 1, burn = 0 } = {}) {
      const i = Math.round(+index);
      if (!(i >= 0 && i < MAX_MARKS)) return;
      const o = i * 4;
      const had = marked[i];
      const wasBurning = playedData[o + 3] > 0;
      const k = clamp(Number.isFinite(+strength) ? +strength : 1, 0, 1);
      if (rgb && rgb.length >= 3 && [0, 1, 2].every((c) => Number.isFinite(+rgb[c]))) {
        for (let c = 0; c < 3; c++) playedData[o + c] = Math.round(clamp(+rgb[c], 0, 1) * k * 255);
        // The sustained flame (fire record): never on lite devices.
        playedData[o + 3] = lite ? 0 : Math.round(clamp(+burn || 0, 0, 1) * 255);
        if (!had) { marked[i] = 1; st.played++; }
        st.lastMarked = i;
      } else {
        playedData[o] = playedData[o + 1] = playedData[o + 2] = playedData[o + 3] = 0;
        if (had) { marked[i] = 0; st.played--; }
      }
      const isBurning = playedData[o + 3] > 0;
      if (isBurning !== wasBurning) st.burning += isBurning ? 1 : -1;
      for (let c = 0; c < 4; c++) playedBase[o + c] = playedData[o + c];
      fading[i] = 0; // a mark arriving during a clearing fade keeps this date at full color
      // The entry: the color eases in from the stylus (a date with an effect is revealed by it instead).
      if (marked[i] && !reducedMotion() && !lite) { st.enter.index = i; st.enter.angle = wrapPi(st.lastLon - st.spin.val); st.enter.t0 = performance.now(); }
      else if (st.enter.index === i) st.enter.index = -1;
      // A new burning date while the flames were dying (a new Play): they burn again.
      if (isBurning && (st.burnFade.active || st.burnFade.val < 1)) { st.burnFade.active = false; st.burnFade.val = 1; }
      discUniforms.uPlayedOn.value = st.played > 0 ? 1 : 0;
      playedTex.needsUpdate = true;
    },

    /**
     * Nothing played: a new record, a new place, or a Play starting again. ms > 0: the colors and any
     * flames fade back to black lacquer over ms first (a mark arriving meanwhile keeps its date).
     */
    clearMarks({ ms = 0 } = {}) {
      for (const rg of st.rings) rg.index = -1;
      st.enter.index = -1;
      st.burnFade.active = false; st.burnFade.val = 1;
      if (ms > 0 && !reducedMotion() && (st.played || st.burning)) {
        for (let i = 0; i < MAX_MARKS; i++) fading[i] = marked[i] || playedData[i * 4 + 3] > 0 ? 1 : 0;
        st.clearing.active = true; st.clearing.t0 = performance.now(); st.clearing.dur = ms;
        return;
      }
      st.clearing.active = false;
      if (!st.played && !st.burning) return;
      playedData.fill(0);
      playedBase.fill(0);
      marked.fill(0);
      fading.fill(0);
      st.played = 0;
      st.burning = 0;
      discUniforms.uPlayedOn.value = 0;
      playedTex.needsUpdate = true;
    },

    /**
     * The effect of the value just played: kind "ripples" (sea records), "embers" (land records) or
     * null; level 0 to 1, how far the value is past the effect's threshold (0: none); rgb the value's
     * color. A packet runs from the place along the stylus; when it lands, the date's groove catches
     * the effect all the way round (water or fire), and keeps the color. Below the threshold, with
     * reduced motion and on lite devices nothing animates: the groove simply takes its color.
     */
    setEffect(kind, level = 0, rgb = null) {
      // The effect is over (the Play ended or was stopped): every burning groove dies down together.
      if (kind == null && st.burning > 0 && !st.burnFade.active && st.burnFade.val > 0) {
        st.burnFade.active = true; st.burnFade.t0 = performance.now();
        if (reducedMotion()) { st.burnFade.active = false; st.burnFade.val = 0; }
      }
      // The record's kind (the effect it asks for), for how loud its held colors are drawn.
      if (kind === "embers") discUniforms.uFireTrace.value = 1;
      else if (kind === "ripples") discUniforms.uFireTrace.value = 0;
      const k = lite ? 0 : kind === "ripples" ? 1 : kind === "embers" ? 2 : 0;
      const lv = k ? clamp(+level || 0, 0, 1) : 0;
      if (rgb && rgb.length >= 3) {
        const r = clamp(+rgb[0] || 0, 0, 1), g = clamp(+rgb[1] || 0, 0, 1), b = clamp(+rgb[2] || 0, 0, 1);
        stylusUniforms.uPktColor.value.set(r, g, b);
      }
      const rm = reducedMotion();
      if (lv > 0 && !rm) {
        // A new value past the threshold: a packet of the effect leaves the place now (with the
        // globe's ring pulse) and runs along the hairline; the disc takes the new level when it lands.
        st.pkt.on = true;
        st.pkt.t0 = -1; // its clock starts with the first frame drawn after this, so it is always seen leaving the place
        stylusUniforms.uPktHead.value = -0.04;
        st.pkt.dur = k === 2 ? PKT_MS_FIRE : PKT_MS_SEA;
        st.pkt.level = lv;
        st.pkt.kind = k;
        // The date's groove waits for it: its color appears only as the effect runs round it.
        const i = st.lastMarked;
        if (i >= 0 && marked[i]) {
          let rg = st.rings.find((x) => x.index === i);
          if (!rg) { rg = st.rings[st.ringNext]; st.ringNext = (st.ringNext + 1) % st.rings.length; }
          rg.index = i;
          rg.level = lv;
          rg.kind = k;
          rg.pending = true;
          rg.life = k === 2 ? RING_CLOSE_FIRE + (0.35 + 0.9 * lv) * (1 + RING_EMBER_FIRE * 1.6) : RING_CLOSE_SEA + 1.6; // a swell is done before the step after next
          const slot = st.rings.indexOf(rg);
          (slot === 0 ? discUniforms.uRingColA : discUniforms.uRingColB).value.set(playedData[i * 4] / 255, playedData[i * 4 + 1] / 255, playedData[i * 4 + 2] / 255);
        }
        return;
      }
      // Nothing travels below the threshold, with reduced motion, or on lite devices: the groove
      // simply keeps its color.
      st.pkt.on = false;
    },

    /**
     * The scratch: an extra turn of the whole record about its own axis (rad), on top of its true
     * angle. Everything printed or recorded on the disc turns with it (the label, the colored grooves'
     * effects); the stylus does not. ms > 0: ease there (a short spring); reduced motion: at once.
     */
    setSpin(angleRad, { ms = 0 } = {}) {
      const to = Number.isFinite(+angleRad) ? +angleRad : 0;
      const sp = st.spin;
      if (ms > 0 && !reducedMotion() && Math.abs(to - sp.val) > 1e-5) {
        sp.from = sp.val; sp.to = to; sp.t0 = performance.now(); sp.dur = ms; sp.active = true;
      } else {
        sp.active = false; sp.val = sp.to = to; discUniforms.uSpin.value = to;
      }
    },

    /** Call once per rendered frame, after the camera is placed. Returns true while anything eases. */
    update(t, camera) {
      let moving = false;
      const dt = st.lastT ? Math.min(0.1, Math.max(0, (t - st.lastT) / 1000)) : 0;
      st.lastT = t;
      // The packet: from the place to the tip, eased (it gathers, runs, and arrives); when it lands the
      // disc effect takes its level and flares, and the ripples start from that instant.
      {
        const pk = st.pkt;
        if (pk.on) {
          if (pk.t0 < 0) pk.t0 = t;
          const s = clamp((t - pk.t0) / pk.dur, 0, 1);
          const e = s * s * (3 - 2 * s); // gathers, runs, arrives: no stretch too fast to see
          stylusUniforms.uPktHead.value = -0.04 + 1.1 * e;
          stylusUniforms.uPktOn.value = (0.75 + 0.25 * pk.level) * smoothstepJs(0, 0.1, s) * (1 - smoothstepJs(0.9, 1, s));
          stylusUniforms.uPktKind.value = pk.kind;
          stylusUniforms.uPktTime.value = (t / 1000) % 1000;
          moving = true;
          if (s >= 1) {
            pk.on = false;
            stylusUniforms.uPktOn.value = 0;
            // Landed: the waiting groove ignites from the point under the tip.
            for (const rg of st.rings) if (rg.pending) { rg.pending = false; rg.t0 = t; rg.angle = wrapPi(st.lastLon - st.spin.val); }
          }
        } else stylusUniforms.uPktOn.value = 0;
      }
      // The grooves being animated: their clocks, and free slots when done.
      {
        let kind = 0;
        for (let k = 0; k < st.rings.length; k++) {
          const rg = st.rings[k];
          const u = k === 0 ? discUniforms.uRingA.value : discUniforms.uRingB.value;
          if (rg.index >= 0 && !rg.pending && (t - rg.t0) / 1000 > rg.life) rg.index = -1;
          if (rg.index >= 0) {
            u.set(rg.index, rg.angle, rg.pending ? -1 : (t - rg.t0) / 1000, rg.level);
            kind = rg.kind;
            moving = true;
          } else u.set(-1, 0, -1, 0);
        }
        discUniforms.uRingKind.value = kind;
        // The newest date's entry.
        {
          const en = st.enter;
          const u = discUniforms.uEnter.value;
          if (en.index >= 0) {
            const z = (t - en.t0) / 1000;
            if (z > ENTER_S || reducedMotion()) { en.index = -1; u.set(-1, 0, -1, 0); }
            else { u.set(en.index, en.angle, Math.max(0, z), 0); moving = true; }
          } else if (u.x !== -1) u.set(-1, 0, -1, 0);
        }
        // clearMarks({ ms }): the fading dates' colors and flames scale down, then they are cleared.
        if (st.clearing.active) {
          const k = 1 - clamp((t - st.clearing.t0) / st.clearing.dur, 0, 1);
          const done = k <= 0;
          for (let i = 0; i < MAX_MARKS; i++) {
            if (!fading[i]) continue;
            const o = i * 4;
            if (done) {
              if (marked[i]) { marked[i] = 0; st.played--; }
              if (playedData[o + 3] > 0) st.burning--;
              for (let c = 0; c < 4; c++) playedData[o + c] = playedBase[o + c] = 0;
              fading[i] = 0;
            } else for (let c = 0; c < 4; c++) playedData[o + c] = Math.round(playedBase[o + c] * k);
          }
          if (done) { st.clearing.active = false; discUniforms.uPlayedOn.value = st.played > 0 ? 1 : 0; }
          playedTex.needsUpdate = true;
          moving = true;
        }
        // Sustained burn: animated while any groove burns and the flames have not died yet.
        const bf = st.burnFade;
        if (bf.active) {
          bf.val = 1 - clamp((t - bf.t0) / BURN_OUT_MS, 0, 1);
          if (bf.val <= 0) bf.active = false;
        }
        const burnOn = st.burning > 0 && bf.val > 0 && !reducedMotion() && !lite;
        discUniforms.uBurnOn.value = burnOn ? 1 : 0;
        discUniforms.uBurnFade.value = bf.val;
        if (burnOn) moving = true;
        if (kind || burnOn) discUniforms.uFxTime.value = (t / 1000) % 1000;
      }
      // The scratch: the extra turn eases where it was asked to go.
      if (st.spin.active) {
        const sp = st.spin;
        const s = clamp((t - sp.t0) / sp.dur, 0, 1);
        // A short spring back: it overshoots a little and settles.
        const c1 = 1.4, c3 = c1 + 1;
        const e = s >= 1 ? 1 : 1 + c3 * Math.pow(s - 1, 3) + c1 * Math.pow(s - 1, 2);
        sp.val = sp.from + (sp.to - sp.from) * e;
        if (s >= 1) { sp.active = false; sp.val = sp.to; }
        discUniforms.uSpin.value = sp.val;
        moving = true;
      }
      group.updateWorldMatrix(true, false); // the ecliptic frame may have turned since the last render
      if (st.cur.active) {
        discUniforms.uCur.value = ease(st.cur, t);
        st.dirty = true;
        moving ||= st.cur.active;
      }
      if (st.presence.active) {
        st.presVal = ease(st.presence, t);
        moving ||= st.presence.active;
      }
      if (st.stylusOn.active) {
        stylusUniforms.uOpacity.value = ease(st.stylusOn, t);
        moving ||= st.stylusOn.active;
      }
      if (camera) {
        // The camera in the group's frame (the group only rotates about the Earth's center).
        const e = group.matrixWorld.elements;
        const cp = camera.position;
        const dx = cp.x - e[12], dy = cp.y - e[13], dz = cp.z - e[14];
        camL.set(dx * e[0] + dy * e[1] + dz * e[2], dx * e[4] + dy * e[5] + dz * e[6], dx * e[8] + dy * e[9] + dz * e[10]);
        const side = clamp(camL.z / 0.6, -1, 1);
        if (Math.abs(side - st.camSide) > 1e-3) { st.camSide = side; st.dirty = true; }
        // Seen nearly edge on, a flat disc is only a thin line through the planet (a ringed planet's
        // signature): the disc gives way there and comes back as the view opens.
        const el = Math.abs(camL.z) / (camL.length() || 1);
        st.open = EDGE_MODE === "fade" ? smoothstepJs(Math.sin(EDGE_FADE[0] * RAD), Math.sin(EDGE_FADE[1] * RAD), el) : 1;
      }
      discUniforms.uPresence.value = st.presVal * st.open;
      if (st.facing != null) {
        // The wordmark's middle sits at print angle WORD_A on face A (seen from the north) and WORD_B
        // on face B: turned by uLabelRot it lies at that angle plus the turn. Bring it to the far side.
        const target = wordmarkAngle(camera) - (camL.z >= 0 ? WORD_A : WORD_B);
        const rot = discUniforms.uLabelRot.value;
        const diff = wrapPi(target - rot);
        if (!st.facingInit || reducedMotion() || Math.abs(diff) < 1e-4) {
          discUniforms.uLabelRot.value = wrapPi(target);
          st.facingInit = true;
        } else {
          discUniforms.uLabelRot.value = wrapPi(rot + diff * (1 - Math.exp(-dt / LABEL_TURN_TAU)));
          moving = true;
        }
      }
      lastCam = camera || lastCam;
      if (st.dirty && (st.hasPlace || stylusUniforms.uOpacity.value > 0.001)) placeStylus();
      st.dirty = false;
      // The stylus only shows where its tip can rest on a visible groove: where the tip would sit
      // between the camera and the planet (the disc fades there), it gives way to the data.
      if (camera) {
        const P = stylusUniforms.uP3.value;
        const dx = P.x - camL.x, dy = P.y - camL.y, dz = P.z - camL.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const s = -(P.x * dx + P.y * dy + P.z * dz) / len; // closest approach to the Earth's center, past the tip
        const h = Math.sqrt(Math.max(0, P.lengthSq() - s * s));
        st.reach = s > 0 ? smoothstepJs(1.0, 1.1, h) : 1;
      }
      // It also gives way when the disc is kept quiet (the arrival close-up: the data comes first).
      const fade = st.reach * smoothstepJs(0.45, 0.9, st.presVal) * smoothstepJs(0.4, 1, st.open);
      const op = stylusUniforms.uOpacity.value * fade;
      const on = op > 0.001;
      stylus.visible = tip.visible = on;
      stylusUniforms.uFade.value = fade;
      tipUniforms.uOpacity.value = op;
      discUniforms.uTipOn.value = op;
      disc.visible = discUniforms.uPresence.value > 0.001;
      return moving;
    },

    /** Diagnostics: what the record shows now. */
    info() {
      return {
        presence: +discUniforms.uPresence.value.toFixed(2),
        open: +st.open.toFixed(2),
        elevationDeg: +((Math.asin(clamp(Math.abs(camL.z) / (camL.length() || 1), 0, 1)) / RAD).toFixed(1)),
        index: +discUniforms.uCur.value.toFixed(2),
        count: st.count,
        indexTo: st.cur.to,
        played: st.played,
        rings: st.rings.filter((rg) => rg.index >= 0).map((rg) => ({ index: rg.index, kind: rg.kind === 1 ? "water" : "fire", level: +rg.level.toFixed(2), t: rg.pending ? null : +((st.lastT - rg.t0) / 1000).toFixed(2) })),
        spin: +st.spin.val.toFixed(3),
        burning: st.burning,
        // The newest date's entry: which date, and how much of its groove has taken its color (0 to 1).
        enter: st.enter.index < 0 ? null : (() => {
          const z = Math.max(0, (st.lastT - st.enter.t0) / 1000);
          const e = clamp(z / ENTER_S, 0, 1), phi = (Math.PI + 0.9) * e * e * (3 - 2 * e);
          let sum = 0;
          for (let k = 0; k < 32; k++) sum += clamp((phi - ((k + 0.5) / 32) * Math.PI) / 0.9, 0, 1);
          return { index: st.enter.index, z: +z.toFixed(3), colored: +(sum / 32).toFixed(3) };
        })(),
        burnFade: +st.burnFade.val.toFixed(2),
        packet: st.pkt.on ? +stylusUniforms.uPktHead.value.toFixed(2) : null,
        stylus: stylus.visible,
        // Diagnostics for the motion checks: the hairline's two ends on the canvas (CSS px), and whether
        // the tip is in view (inside the page's #stage-safe box, clear of the planet).
        base: screenOf(stylusUniforms.uP0.value),
        tip: screenOf(stylusUniforms.uP3.value),
        tipOnScreen: stylus.visible && tipInView(),
        t: +st.lastT.toFixed(1),
        face: camL.z >= 0 ? "A" : "B",
        labelFacing: st.facing == null ? null : +st.facing.toFixed(3),
        labelRot: +discUniforms.uLabelRot.value.toFixed(3),
        wordmarkWhole: st.wordWhole,
        wordmarkSpanDeg: +(wordmark.span / RAD).toFixed(1),
        wordmarkAzimuth: +wrapPi(discUniforms.uLabelRot.value + (camL.z >= 0 ? WORD_A : WORD_B)).toFixed(3),
      };
    },

    dispose() {
      disc.geometry.dispose();
      discMat.dispose();
      stylusGeo.dispose();
      stylusMat.dispose();
      tipGeo.dispose();
      tip.material.dispose();
      labelTex.dispose();
      playedTex.dispose();
      group.removeFromParent();
    },
  };
  return record;
}
