// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// The globe stage: the Earth as a real 3D sphere (three.js, vendored) wrapped in NASA's Blue Marble,
// under drifting Blue Marble clouds and a thin atmosphere, in real space: the NASA Deep Star Map,
// the Sun (also the scene's light, so day and night are real), the Moon and the planets at their
// positions for the instant shown. That instant is the record's date at 10:30 local solar time at
// the chosen place, so stepping through dates turns the sky behind the Earth (its orbit).
// Once a place is chosen, the record's NASA frame for the date is draped over the Earth: what is
// seen is what is heard. Where the record names a land mask, the side of the coast without data
// shows a light gray land (ocean records) or the real, sunlit ocean (land records); the data side
// stays the frame as published. Around the Earth, in the plane of its orbit and fixed among the
// stars, lies the record (record3d.js): a vinyl disc whose grooves are the record's dates, with an
// amber stylus from the chosen place to the groove of the date shown, so the disc turns under it as
// the dates advance. While Play runs the camera holds still relative to the Earth with the place at
// the center of the picture, and the Sun, the stars, the Moon, the planets and the record turn around
// it, one turn per year. Place dots (land: solid, ocean: a ring; ice white, amber for the place
// being read) are clickable; the
// same actions exist as native controls, so the canvas stays hidden from assistive tech.
// Implements the stage view interface (see view.js): setPlaces, select, setRecord, setFrame,
// setPower, setPlaying, pulse, setShown, resize, dispose.

import * as THREE from "three";
import { skyAt, solarInstant, greenwichSiderealDeg, moonPosition } from "./ephemeris.js";
import { createSky, eqToWorld } from "./sky.js";
import { createRecord, OUTER } from "./record3d.js";
import { fireRamp } from "./ramp.js";

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const FOV = 32; // vertical field of view, degrees
const ATMOSPHERE_R = 1.06; // atmosphere shell radius (Earth = 1)
const CLOUD_R = 1.012; // cloud shell radius
const DOT_R = 1.004; // place dots sit just above the surface
const CLOUD_CYCLE_DAYS = 2.5; // the clouds' flow map: each of its two samples is carried by the winds for this many simulated days, then fades out (see CLOUD_FRAG)
const SIM_RATE = 86400 / 80; // overview clock: one simulated day every 80 s
const SIDEREAL_DEG_PER_DAY = 360.98564736629; // the Earth's turn per solar day (west to east)
const AUTO_RESUME_MS = 4000; // a hold or drag pauses the overview clock this long
const ENTRANCE_MS = 3000; // the first appearance: a push in from far out
const HOME_MIN_MS = 2500; // the way home: one calm swing back to the opening view, at least this long
const HOME_MAX_MS = 6000; // and at most this long
const HOME_DEG_PER_S = 40; // the swing lasts long enough that nothing seen turns faster than this (the Earth, the stars)
const HOME_PULL = 1.06; // its gentle pull-back at mid-swing (times the larger of the start and overview distances)
const IDLE_HOME_MS = 9000; // overview turned away from the opening view and untouched this long: it swings back by itself
// One zoom range, two ends: distance decides what is seen. The near end is the arrival distance of a
// place brought closer by ZOOM_NEAR_NOTCHES notches; the far end is the overview distance, where the
// globe is in its default overview state again (the real Earth, the clock, the record's label).
const ZOOM_PER_NOTCH = 1.12; // one wheel notch (deltaY 100 px) changes the distance by this factor (every notch the same visual step)
const ZOOM_NEAR_NOTCHES = 3; // the closest view: the arrival distance divided by ZOOM_PER_NOTCH this many times
const ZOOM_FADE_FROM = 0.35; // the drape fades to the real Earth over the part of the range from this fraction (log scale, arrival 0, overview 1) to the far end
const ZOOM_ZONE = 0.12; // the wheel zooms over the planet's disc plus this fraction of its radius
const ZOOM_ZONE_MIN = 24; // and at least this many px around it
const LEAVE_MS = 2200; // dragging out of an arrived place: the distance eases out to the overview over this long
const MAX_LAT = 78 * RAD; // camera pitch limit: the poles never flip
const FOCUS_HALF_SPAN = 44 * RAD; // arrived: about 88 degrees of Earth around the place fills the safe area
const PLAY_FIT = 0.92; // while Play runs: the Earth as close as it can be with its whole disc (and the place at the center) inside this fraction of the safe area's half width and half height (see playDistFor)
const PLAY_LIMB_R = 1.03; // the radius fitted: the Earth and the brightest part of its atmosphere
const PLAY_TIP_ROOM = 1 / 3; // and the record's stylus tip, wherever it rests beside the planet over the record's dates, at least this many Earth radii inside the safe area (playDistOf)
const PHONE_PLAY_W = 600; // a canvas narrower than this (and not wider than tall by more than a fifth) is a phone's portrait picture
const PHONE_EARTH_SHARE = 0.5; // during Play on a phone: the Earth's diameter as this fraction of the picture's width (the record around it shows)
const PHONE_MIN_CAM_LAT = 47.5 * RAD; // and the camera at least this far from the equator: the record (within 23.44 degrees of it) is then seen at 24 degrees or more on every date
const PLAY_MAX_FILL = 0.62; // but never farther than the first Play framing (the Earth's diameter this fraction of the safe area's short side): the user prefers the closer view
const RECORD_OPEN_DEG = 12; // the record fades out when the camera is within about this many degrees of its plane (record3d.js): its tip does not count then
const PLAY_TILT_LAT = 35 * RAD; // while Play runs: a camera tilted from the place's vertical toward its hemisphere's pole aims for this latitude, so the record is less often edge on over the year
const PLAY_MAX_TILT = 13 * RAD; // but never tilted more than this from the place's vertical: the place is seen nearly from above and the Earth's center stays close to it on screen
const PLAY_EQ_BAND = 3 * RAD; // places this close to the equator tilt south (the Earth seen from the south turns clockwise, like a record)
const PLAY_RETURN_MS = 8000; // a drag during Play turns the view; this long after release (time to simply look) the camera eases back to the Play framing
const OVERVIEW_SUN_AZ = -37 * RAD; // overview camera: west of the Sun by this much (along the ecliptic), so most of the disc is in daylight
const OVERVIEW_ECL_LAT = 41 * RAD; // and this far above the ecliptic, so the record's near rim shows below the planet (the planet sits in the record's label, never reads as a ringed planet)
const OVERVIEW_FILL = 0.52; // overview: the Earth's diameter as a fraction of the safe area's short side (the record fits around it)
const OVERVIEW_FILL_NARROW = 0.38; // a narrow safe area (phones): the fill that lets the whole record reach to DISC_EDGE of the screen edge, never below this
const NARROW_SAFE = 560; // px: a safe area narrower than this counts as narrow (the record meets the screen edge)
const DISC_SPAN = 2.06 * OUTER; // the record's widest extent on screen in the overview, in Earth radii (outer edge OUTER = 2.25, plus perspective)
const DISC_EDGE = 4; // px kept between the record and the screen edge in a narrow overview
const WIDE_FILL = 0.36; // the farthest pull-back of a long trip
const CLICK_SLOP = 6; // px of pointer travel that still counts as a click
const HIT_R = 14; // px: the dot hit area is at least 28 px across
const HIT_R_TOUCH = 22; // px: on coarse pointers (touch) a 44 px target
const TOUCH_EARTH_MARGIN = 12; // px round the Earth's disc on screen where a finger turns the globe on both axes (Explore on touch)
const TOUCH_DOT_SCALE = 0.6; // Explore on a touch layout: place dots (and the selected ring) at this fraction of their size
const TEX_BUDGET_UHD = 230e6; // bytes of data textures on the GPU when the 4096 px tier is used (one is about 45 MB with mipmaps)
const TEX_BUDGET = 80e6; // the same with the 2048 px tier (about 11 MB each)
const TEX_BUDGET_SMALL = 24e6; // the same on small or low-memory devices
const PREFETCH = 3; // HD frames decoded ahead of Play
const PREFETCH_UHD = 2; // 4096 px frames decoded ahead of Play
const PREFETCH_SMALL = 2; // small devices: 1024 px frames decoded ahead of Play (inside TEX_BUDGET_SMALL with the land mask)
const MAG_MAX = 1.2; // a frame tier is enough while one of its texels covers at most this many screen pixels at the place (the drape upsamples a magnified frame with Catmull-Rom: at 1.2 px a texel the next tier looks the same, see the round 8 pair)
const HD_DELAY = 500; // small devices: ms a date must stay still before the 2048 px frame replaces the small one
const HD_UPGRADE_MS = 220; // small to HD of the same date: a short crossfade, no pop
const OVERVIEW_FPS = 30; // the overview clock alone (the Earth turns once per 80 s, under a pixel per frame) draws at most this often
const OVERVIEW_FPS_SMALL = 20; // the same on small or low-memory devices
const STEP_SETTLE_MS = 350; // Play stopping mid-step: the picture eases onto the date shown over this long
const SCRATCH_RETURN_MS = 500; // a scratch released: the record's print springs back to its true angle over this long
const SCRATCH_STILL_MS = 80; // the hand held still this long: the scratch reports velocity 0 (silent)
const SCRATCH_MIN_SHOW = 0.3; // the record must be at least this present and open (not edge on) to be scratched
const DIST_REST = 2e-4; // the camera distance is at rest within this fraction of its target (under a tenth of a pixel of the Earth's radius)
const MOTION_FPS = 30; // anything that moves by itself (Play, flights, the entrance, eases) draws at most this often: the sound engine needs the main thread too
const INPUT_FULL_MS = 1000; // the full frame rate while the user drags, zooms or scratches the picture, and this long after
const SKY_KEY_MS = 3600000; // the Sun, the planets and the Moon are computed for instants this far apart and interpolated between (also a Play step's two dates)
const MIN_FRAME_MS = 11; // motion draws at most one frame per this many ms: every vsync up to 90 Hz, every other one on 120 Hz (60 fps), about 72 fps on 144 Hz
const METRICS_POLL_MS = 2000; // the stage's metrics are read when a ResizeObserver says they changed, else this often
const PIXEL_RATIO_WEAK = 1.5; // the canvas pixel ratio cap on devices with 2 GB of memory or less (2 elsewhere)

// The record's effect at the stylus during Play (setEffect level 0 to 1): how far the value is past a
// threshold. First guesses, for the user to judge.
const FX_SEA_FROM = 1; // sea record: ripples start 1 degree C from normal
const FX_SEA_SPAN = 2; // and are full 2 degrees further (3 degrees C)
// Fire record: level = ((pct - FX_FIRE_FROM) / (FX_FIRE_TOP - FX_FIRE_FROM)) ^ FX_FIRE_EXP between the
// two ends (0 below, 1 at the top): first embers at 3 percent of land pixels with fire dots, 0.49 at
// 20, 0.85 at 40, 1 at 50 (the top of the scale): the big fire only where the fire is really high.
const FX_FIRE_FROM = 3;
const FX_FIRE_TOP = 50;
const FX_FIRE_EXP = 0.7;
const END_OPEN_DEG = 22; // a Play that reached its last date with the record seen below this angle to its plane (where it starts to fade)
const END_TARGET_DEG = 24; // turns the camera until the record is seen at this angle (whole)
const END_MAX_TILT = 70 * RAD; // but never farther than this from the place's vertical (the place stays on the visible side)
const END_MS = 1200; // over this long (placed at once with reduced motion)
const MARKS_FADE_MS = 900; // another place chosen: the played disc fades back to plain lacquer during the flight

const AMBER = "#ffb547"; // the point being read
const DOT_WHITE = "#e8f0ff"; // every other place dot (ice white)
const KEYLINE = "#02050c";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const smoother = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
const wrapPi = (a) => a - TAU * Math.round(a / TAU);
const now = () => performance.now();

/** Earth-fixed unit vector (three.js axes, the SphereGeometry convention) of a latitude and longitude in radians. */
function latLonVec(lat, lon, out = new THREE.Vector3()) {
  return out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}
function vecLat(v) { return Math.asin(clamp(v.y / (v.length() || 1), -1, 1)); }
function vecLon(v) { return Math.atan2(-v.z, v.x); }

/** Great-circle interpolation between two unit vectors. */
function slerpDir(a, b, t, out) {
  const d = clamp(a.dot(b), -1, 1);
  const ang = Math.acos(d);
  if (ang < 1e-5) return out.copy(b);
  if (Math.PI - ang < 1e-3) {
    // Opposite points: go round through the equator side of a, never over a pole.
    const mid = new THREE.Vector3(-a.z, 0, a.x);
    if (mid.lengthSq() < 1e-6) mid.set(1, 0, 0);
    mid.normalize();
    return t < 0.5 ? slerpDir(a, mid, t * 2, out) : slerpDir(mid, b, t * 2 - 1, out);
  }
  const s = Math.sin(ang);
  const wa = Math.sin((1 - t) * ang) / s;
  const wb = Math.sin(t * ang) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb).normalize();
}

/** Same direction with the latitude kept inside the camera's pitch limit. */
function clampPitch(v) {
  const lat = vecLat(v);
  if (Math.abs(lat) <= MAX_LAT) return v.normalize();
  return latLonVec(Math.sign(lat) * MAX_LAT, vecLon(v), v);
}

/** URL of a file next to another one (same folder), or null. */
function siblingUrl(url, name) {
  try { return new URL(name, new URL(url, document.baseURI)).href; } catch { return null; }
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- shaders

const EARTH_VERT = `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

// Blue Marble lit by the real Sun (soft terminator, ocean glint, day-side haze at the limb),
// crossfading into the record's NASA frame, which is lit only gently so its colors stay legible.
// Each drape slot can carry its record's land mask (white = land) and the side of the coast that
// holds the data: ocean records get a light gray land fill, land records get the real ocean.
const EARTH_FRAG = `
uniform sampler2D uDay;
uniform sampler2D uDataA;
uniform sampler2D uDataB;
uniform vec2 uSizeA;
uniform vec2 uSizeB;
uniform sampler2D uMaskTexA;
uniform sampler2D uMaskTexB;
uniform float uMaskA;
uniform float uMaskB;
uniform float uSurfA;
uniform float uSurfB;
uniform float uMix;
uniform float uData;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;

// The NASA frame under magnification: Catmull-Rom bicubic interpolation of its own pixels (nine
// bilinear taps), clamped to the range of the four nearest pixels so it cannot overshoot or
// create structure. Where the frame is minified (toward the limb) the mipmapped, anisotropic
// lookup is used instead; the two blend around one texel per pixel.
vec3 catmullRom(sampler2D tex, vec2 uv, vec2 size) {
  vec2 p = uv * size;
  vec2 t1 = floor(p - 0.5) + 0.5;
  vec2 f = p - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0) / size;
  vec2 t3 = (t1 + 2.0) / size;
  vec2 t12 = (t1 + w2 / w12) / size;
  vec3 c = textureLod(tex, vec2(t0.x, t0.y), 0.0).rgb * w0.x * w0.y
    + textureLod(tex, vec2(t12.x, t0.y), 0.0).rgb * w12.x * w0.y
    + textureLod(tex, vec2(t3.x, t0.y), 0.0).rgb * w3.x * w0.y
    + textureLod(tex, vec2(t0.x, t12.y), 0.0).rgb * w0.x * w12.y
    + textureLod(tex, vec2(t12.x, t12.y), 0.0).rgb * w12.x * w12.y
    + textureLod(tex, vec2(t3.x, t12.y), 0.0).rgb * w3.x * w12.y
    + textureLod(tex, vec2(t0.x, t3.y), 0.0).rgb * w0.x * w3.y
    + textureLod(tex, vec2(t12.x, t3.y), 0.0).rgb * w12.x * w3.y
    + textureLod(tex, vec2(t3.x, t3.y), 0.0).rgb * w3.x * w3.y;
  vec2 a = t1 / size;
  vec2 b = (t1 + 1.0) / size;
  vec3 q0 = textureLod(tex, a, 0.0).rgb;
  vec3 q1 = textureLod(tex, vec2(b.x, a.y), 0.0).rgb;
  vec3 q2 = textureLod(tex, vec2(a.x, b.y), 0.0).rgb;
  vec3 q3 = textureLod(tex, b, 0.0).rgb;
  return clamp(c, min(min(q0, q1), min(q2, q3)), max(max(q0, q1), max(q2, q3)));
}
vec3 frameColor(sampler2D tex, vec2 size) {
  vec2 d = fwidth(vUv * size);
  float texelsPerPx = max(d.x, d.y);
  vec3 mip = texture2D(tex, vUv).rgb;
  if (texelsPerPx > 1.0 || size.x < 2.0) return mip;
  return mix(catmullRom(tex, vUv, size), mip, smoothstep(0.7, 1.0, texelsPerPx));
}

// Land fill of ocean records (linear RGB of sRGB 138, 142, 148): a cool light gray between the
// frame's own land gray (sRGB 104) and its sea-ice gray (sRGB 178), far from the near-white center
// of the diverging scale (sRGB 227). The frame's relief shading is kept, softened.
const vec3 LAND_FILL = vec3(0.2542, 0.2705, 0.2961);
const float NASA_LAND = 0.1384; // the frame's land gray, linear

// One drape slot: the frame lit like the data, composited with its record's land mask when it has
// one (hasMask 1). surf 0: the data is on the ocean, land gets LAND_FILL. surf 1: the data is on
// land, the ocean is the real one (the lit Blue Marble, its sun glint softened so it never outshines
// a fire dot), except where the frame shows anything but its flat ocean fill.
vec3 drape(vec3 f, sampler2D maskTex, float hasMask, float surf, vec3 marble, vec3 glint, vec3 haze, float dataLight) {
  vec3 col = f * dataLight + haze * 0.12;
  if (hasMask < 0.5) return col;
  float land = texture2D(maskTex, vUv).r;
  if (surf < 0.5) {
    float relief = pow(clamp(dot(f, vec3(0.2126, 0.7152, 0.0722)) / NASA_LAND, 0.55, 1.35), 0.5);
    return mix(col, LAND_FILL * relief * dataLight + haze * 0.12, land);
  }
  // The fire frame: black land, a flat slate ocean (sRGB 34, 50, 73), bright detection dots. The
  // real ocean replaces only the slate: anything off the line from black to slate (in sRGB units,
  // so JPEG noise in the slate and the soft black coast do not count) keeps the frame anywhere, so
  // dots crossing the coast and offshore gas flares are never hidden.
  vec3 s = pow(max(f, vec3(0.0)), vec3(1.0 / 2.2)) * 255.0;
  const vec3 SLATE = vec3(34.0, 50.0, 73.0);
  float off = length(s - SLATE * clamp(dot(s, SLATE) / dot(SLATE, SLATE), 0.0, 1.0));
  float keep = max(land, smoothstep(12.0, 30.0, off));
  return mix(marble - glint * 0.7, col, keep);
}

void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vP);
  float ndl = dot(n, uSun);
  vec3 day = texture2D(uDay, vUv).rgb;
  float diff = clamp((ndl + 0.05) / 1.05, 0.0, 1.0);
  vec3 lit = day * (uAmbient + uSunColor * diff);
  float ocean = smoothstep(0.004, 0.03, day.b - day.r * 1.4);
  vec3 h = normalize(uSun + v);
  vec3 glint = uSunColor * pow(max(dot(n, h), 0.0), 140.0) * ocean * 0.16 * smoothstep(0.0, 0.15, ndl);
  lit += glint;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 haze = vec3(0.16, 0.32, 0.78) * fres * smoothstep(-0.25, 0.45, ndl);
  // The NASA frame, lit gently so its colors stay legible (see drape() for the land mask).
  vec3 marble = lit + haze * 0.55;
  // No drape (the overview): the frame lookups are skipped (a uniform branch, the same for every pixel).
  vec3 col = marble;
  if (uData > 0.0) {
    float dataLight = mix(0.66, 1.0, smoothstep(-0.3, 0.3, ndl));
    vec3 colA = drape(frameColor(uDataA, uSizeA), uMaskTexA, uMaskA, uSurfA, marble, glint, haze, dataLight);
    vec3 dataCol = colA;
    if (uMix > 0.0) {
      vec3 colB = drape(frameColor(uDataB, uSizeB), uMaskTexB, uMaskB, uSurfB, marble, glint, haze, dataLight);
      dataCol = mix(colA, colB, uMix);
    }
    col = mix(marble, dataCol, uData);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const CLOUD_FRAG = `
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uFlow; // simulated days on the clouds' own clock, modulo CLOUD_CYCLE
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vP;

// The clouds move like weather, relative to the turning ground. A stylization of the mean zonal
// winds applied to a single cloud snapshot, not a weather simulation: the atmosphere turns with the
// planet, and what is seen is the weather's motion over the ground, organized in latitude bands
// (three cells per hemisphere, NOAA JetStream "Global circulations",
// https://www.noaa.gov/jetstream/global-circulations). Tropics: trade winds from the east, about
// 7 m/s (Stull, Practical Meteorology, ch. 11,
// https://www.eoas.ubc.ca/books/Practical_Meteorology/mse3/Ch11-Global.pdf), tropical waves moving
// west at 5 to 8 m/s (US National Hurricane Center discussions): here 6 m/s west, peaking near 12
// degrees. About 28 degrees (the subtropical highs): little zonal motion. Mid-latitudes: weather
// systems carried east by the westerlies at about 30 to 50 km/h, some 1200 km a day (Environment and
// Climate Change Canada, https://publications.gc.ca/collections/collection_2017/eccc/En56-261-2011-eng.pdf;
// 10 to 15 m/s, COMET MetEd, https://meted.ucar.edu/ams/wim_2014/9a.html): here 10 m/s east near 47
// degrees, 30 percent more in the south (the Roaring Forties). Weak polar easterlies near 78 degrees.
// Degrees of longitude per day = u * 86400 / (111320 m * cos(latitude)), zero at the poles.
const float CLOUD_CYCLE = ${CLOUD_CYCLE_DAYS.toFixed(2)};
const float CLOUD_MEAN = 0.30; // the cloud map's mean value (for its contrast, below)
float zonalDegPerDay(float lat) {
  float a = abs(lat);
  float u = -6.0 * exp(-pow((a - 12.0) / 10.0, 2.0))
    + 10.0 * (lat < 0.0 ? 1.3 : 1.0) * exp(-pow((a - 47.0) / 12.0, 2.0))
    - 2.0 * exp(-pow((a - 78.0) / 7.0, 2.0));
  float c = max(cos(radians(a)), 0.2);
  return u * 0.7761 / c * (1.0 - smoothstep(80.0, 90.0, a)); // 0.7761 = 86400 / 111320
}

void main() {
  // The flow-map trick: two samples of the same map, each carried by the local wind for one cycle
  // around its mid-point, half a cycle apart, crossfaded with a triangle weight. The shear between
  // latitudes stays bounded (no endless smearing) and the motion is continuous.
  float sp = zonalDegPerDay((vUv.y - 0.5) * 180.0) / 360.0; // turns per day, east positive
  float p0 = fract(uFlow / CLOUD_CYCLE);
  float p1 = fract(uFlow / CLOUD_CYCLE + 0.5);
  float a0 = texture2D(uMap, vec2(vUv.x - sp * (p0 - 0.5) * CLOUD_CYCLE, vUv.y)).r;
  float a1 = texture2D(uMap, vec2(vUv.x - sp * (p1 - 0.5) * CLOUD_CYCLE, vUv.y)).r;
  float w0 = 1.0 - abs(2.0 * p0 - 1.0);
  float a = mix(a1, a0, w0);
  // Two offset copies crossfaded lose contrast; give it back around the map's mean, in proportion to
  // how far apart the copies are (none where the wind is calm and they coincide), so the cloud
  // cover neither pulses nor flattens.
  float apart = clamp(abs(sp) * CLOUD_CYCLE * 0.5 * 360.0 / 6.0, 0.0, 1.0);
  float k = mix(1.0, inversesqrt(w0 * w0 + (1.0 - w0) * (1.0 - w0)), apart);
  a = clamp(CLOUD_MEAN + (a - CLOUD_MEAN) * k, 0.0, 1.0);
  float ndl = dot(normalize(vN), uSun);
  float diff = clamp((ndl + 0.05) / 1.05, 0.0, 1.0);
  vec3 c = uAmbient * 0.8 + uSunColor * diff;
  gl_FragColor = vec4(c, a * uOpacity);
  #include <colorspace_fragment>
}`;

// Place dots: constant size on screen, hidden on the far side. aKind 0: a land place, a solid disc;
// 1: an ocean place, a ring with a dark center (it carries its own contrast, so it reads on any
// temperature color). Both inside the same dark keyline. aKind + 2: the place being read, amber;
// every other place is ice white (amber is only the point being read).
const DOT_VERT = `
attribute float aSize;
attribute float aAlpha;
attribute float aKind;
uniform float uScale;
uniform float uMaxSize;
varying float vAlpha;
varying float vSize;
varying float vKind;
varying float vHot;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 nV = normalize(normalMatrix * normalize(position));
  float facing = dot(nV, normalize(-mv.xyz));
  vAlpha = aAlpha * smoothstep(0.03, 0.2, facing);
  vSize = min(aSize * uScale, uMaxSize);
  vHot = step(1.5, aKind);
  vKind = aKind - 2.0 * vHot;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vAlpha > 0.002 ? vSize : 0.0;
}`;

const DOT_FRAG = `
uniform vec3 uAmber;
uniform vec3 uWhite;
uniform vec3 uKey;
uniform float uScale;
varying float vAlpha;
varying float vSize;
varying float vKind;
varying float vHot;
void main() {
  float rpx = length(gl_PointCoord * 2.0 - 1.0) * vSize * 0.5;
  float R = vSize * 0.5;
  // One system for every dot: the color inside a thin dark keyline (about an eighth of the diameter,
  // 0.9 to 1.4 CSS px), so small dots keep their color instead of turning into dark rings. The
  // keyline and the crisp round edge set the white dots apart from the fire frame's own specks.
  float key = clamp(vSize * 0.12, 0.9 * uScale, 1.4 * uScale);
  float edge = 1.0 - smoothstep(R - 1.0, R, rpx);
  if (edge <= 0.0) discard;
  float core = 1.0 - smoothstep(R - key - 0.8, R - key + 0.2, rpx);
  // Ocean places: the inner half of the disc is dark, leaving a ring.
  float hole = max(1.1 * uScale, (R - key) * 0.45);
  float ringOnly = smoothstep(hole - 0.6, hole + 0.6, rpx);
  vec3 c = mix(uKey, mix(uWhite, uAmber, vHot), core * mix(1.0, ringOnly, vKind));
  gl_FragColor = vec4(c, edge * mix(0.75, 1.0, core) * vAlpha);
  #include <colorspace_fragment>
}`;

// The ring around the selected place (and its ripple): an amber stroke between dark keylines.
const RING_FRAG = `
uniform vec3 uAmber;
uniform vec3 uKey;
uniform float uScale;
varying float vAlpha;
varying float vSize;
void main() {
  float rpx = length(gl_PointCoord * 2.0 - 1.0) * vSize * 0.5;
  float R = vSize * 0.5 - 2.8 * uScale;
  float d = abs(rpx - R);
  float amber = 1.0 - smoothstep(0.8 * uScale, 1.4 * uScale, d);
  float key = 1.0 - smoothstep(2.0 * uScale, 2.6 * uScale, d);
  if (key <= 0.0) discard;
  gl_FragColor = vec4(mix(uKey, uAmber, amber), max(amber, key * 0.6) * vAlpha);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- the stage

export async function createGlobe3d(host, opts = {}) {
  const {
    texture,
    clouds = null,
    textureHd = null,
    sky: skyUrls = null,
    moon = null,
    reducedMotion = () => false,
    safeArea = () => null,
    onPick = () => {},
    onHover = () => {},
    onScratch = () => {},
  } = opts;
  if (!supportsWebGL()) throw new Error("WebGL is not available");

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "globe__canvas";
  // The canvas fills its host at any aspect ratio. On touch, one finger sideways turns the globe,
  // vertical swipes scroll the page and two fingers zoom the page (low vision); the browser then
  // takes the gesture over and the drag is cancelled (pointercancel).
  Object.assign(canvas.style, { display: "block", width: "100%", height: "100%", touchAction: "pan-y pinch-zoom", cursor: "grab" });

  let renderer;
  try {
    // MSAA only below 1.5 device pixels per CSS px: above, the pixels are small enough that the edges
    // look the same without it, and 4 samples of a high-density buffer cost about four times the memory.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 1.5, alpha: false, powerPreference: "high-performance" });
  } catch (err) {
    throw new Error(`WebGL could not start: ${err?.message || err}`);
  }
  host.prepend(canvas);
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = false; // the sky scene is drawn first, then the Earth over it
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const gl = renderer.getContext();
  const maxPoint = (() => { try { return gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64; } catch { return 64; } })();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const coarse = matchMedia("(pointer: coarse)").matches;
  const saveData = !!navigator.connection?.saveData;
  const small = Math.min(innerWidth || 9999, innerHeight || 9999) < 700
    || coarse
    || (navigator.deviceMemory && navigator.deviceMemory < 4)
    || renderer.capabilities.maxTextureSize < 4096;
  // At most 2 device pixels per CSS px; 1.5 on devices that report 2 GB of memory or less (their
  // GPUs pay for every pixel of the sky, the record and the Earth, which are redrawn each frame).
  const weak = !!(navigator.deviceMemory && navigator.deviceMemory <= 2);
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, weak ? PIXEL_RATIO_WEAK : 2);
  const hitR = coarse ? HIT_R_TOUCH : HIT_R;
  // "Explore on my own" on a touch layout (<body class="touch-ui">, not the guided mode, which takes
  // every touch for its own gestures): the fingers handle the globe, two of them zoom it.
  const exploreTouch = () => !!document.body && document.body.classList.contains("touch-ui") && !document.body.classList.contains("guided-touch");
  // While a Play runs the drawing buffer uses at most 1 device pixel per CSS px (fewer pixels while
  // the music needs the machine); the normal ratio comes back when the Play ends (one redraw).
  let playRatio = false;
  const drawRatio = () => (playRatio ? Math.min(1, pixelRatio()) : pixelRatio());
  // Small or low-memory devices keep the old path: small frames while playing, HD when still (and the record's lite mode).
  const lowMemory = small
    || coarse
    || (navigator.deviceMemory && navigator.deviceMemory <= 4)
    || saveData;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 1200);
  camera.up.set(0, 1, 0);

  // ------------------------------------------------------------ textures
  const loader = new THREE.TextureLoader();
  const blank = new THREE.DataTexture(new Uint8Array([6, 16, 40, 255]), 1, 1);
  blank.colorSpace = THREE.SRGBColorSpace;
  blank.needsUpdate = true;
  // Decoded off the main thread (createImageBitmap, as the data frames), not inside the upload.
  const load = (url, colorSpace = THREE.SRGBColorSpace) =>
    url ? decodeFrame(url).then((t) => { if (!t) return null; t.colorSpace = colorSpace; t.anisotropy = anisotropy; return t; }).catch(() => null) : Promise.resolve(null);
  const [dayMap, cloudMap] = await Promise.all([load(texture), load(clouds, THREE.NoColorSpace)]);
  if (cloudMap) cloudMap.wrapS = THREE.RepeatWrapping;

  // ------------------------------------------------------------ light (the Sun)
  const sunDir = new THREE.Vector3(1, 0, 0);
  const SUN_COLOR = new THREE.Color(1.0, 0.965, 0.9).multiplyScalar(1.3);
  const AMBIENT = new THREE.Color(0.62, 0.72, 1.0).multiplyScalar(0.05);

  // ------------------------------------------------------------ sky
  const skyApi = createSky({
    // The map now only gives the faint Milky Way glow (read blurred), so the 2048 px one is enough.
    starmap: skyUrls ? skyUrls.sd || skyUrls.hd : null,
    // Crisp stars: the catalog written by pipeline/make_stars.py, next to the star map.
    stars: skyUrls ? skyUrls.stars || siblingUrl(skyUrls.sd || skyUrls.hd, "sky-stars.json") : null,
    // The Milky Way without its stars, from the same pipeline step (the star map is the fallback).
    glow: skyUrls ? skyUrls.glow || siblingUrl(skyUrls.sd || skyUrls.hd, "sky-glow-1024.jpg") : null,
    moon,
    anisotropy,
    onChange: () => kick(),
  });

  // ------------------------------------------------------------ Earth
  const earthGroup = new THREE.Group(); // turns by the sidereal angle: Earth-fixed inside
  scene.add(earthGroup);
  const earthUniforms = {
    uDay: { value: dayMap || blank },
    uDataA: { value: blank },
    uDataB: { value: blank },
    uSizeA: { value: new THREE.Vector2(1, 1) },
    uSizeB: { value: new THREE.Vector2(1, 1) },
    uMaskTexA: { value: blank },
    uMaskTexB: { value: blank },
    uMaskA: { value: 0 },
    uMaskB: { value: 0 },
    uSurfA: { value: 0 },
    uSurfB: { value: 0 },
    uMix: { value: 0 },
    uData: { value: 0 },
    uSun: { value: sunDir },
    uSunColor: { value: SUN_COLOR },
    uAmbient: { value: AMBIENT },
  };
  const earthGeo = new THREE.SphereGeometry(1, 160, 112);
  const earthMat = new THREE.ShaderMaterial({ uniforms: earthUniforms, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  earthGroup.add(earth);

  const cloudUniforms = {
    uMap: { value: cloudMap || blank },
    uOpacity: { value: cloudMap ? 0.92 : 0 },
    uFlow: { value: 0 },
    uSun: { value: sunDir },
    uSunColor: { value: SUN_COLOR },
    uAmbient: { value: AMBIENT },
  };
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: cloudUniforms, vertexShader: EARTH_VERT, fragmentShader: CLOUD_FRAG,
    transparent: true, depthWrite: false,
  });
  const cloudShell = new THREE.Mesh(new THREE.SphereGeometry(CLOUD_R, 128, 96), cloudMat);
  cloudShell.visible = !!cloudMap;
  cloudShell.renderOrder = 1;
  earthGroup.add(cloudShell);

  // Thin atmosphere: a back-facing shell, strongest at the Earth's edge, fading to nothing at its
  // own edge, brighter on the day side.
  const rimAtLimb = Math.sqrt(1 - (1 / ATMOSPHERE_R) ** 2).toFixed(4);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(ATMOSPHERE_R, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir } },
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: "varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vW = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * mv; }",
      fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ float rim = clamp(-dot(normalize(vN), normalize(vV)) / ${rimAtLimb}, 0.0, 1.0); float day = 0.22 + 0.78 * smoothstep(-0.35, 0.35, dot(normalize(vW), uSun)); gl_FragColor = vec4(0.45, 0.72, 1.0, 0.8 * rim * rim * day); }`,
    }),
  );
  atmosphere.renderOrder = 2;
  scene.add(atmosphere);

  // ------------------------------------------------------------ place dots and ring
  const amber = new THREE.Color(AMBER);
  const white = new THREE.Color(DOT_WHITE);
  const keyColor = new THREE.Color(KEYLINE);
  const dotUniforms = {
    uScale: { value: pixelRatio() },
    uMaxSize: { value: maxPoint },
    uAmber: { value: amber },
    uWhite: { value: white },
    uKey: { value: keyColor },
  };
  const dotMat = new THREE.ShaderMaterial({
    uniforms: dotUniforms, vertexShader: DOT_VERT, fragmentShader: DOT_FRAG,
    transparent: true, depthTest: false, depthWrite: false,
  });
  let dotGeo = new THREE.BufferGeometry();
  let dots = new THREE.Points(dotGeo, dotMat);
  dots.renderOrder = 10;
  dots.frustumCulled = false;
  earthGroup.add(dots);

  const ringMat = new THREE.ShaderMaterial({
    uniforms: dotUniforms, vertexShader: DOT_VERT, fragmentShader: RING_FRAG,
    transparent: true, depthTest: false, depthWrite: false,
  });
  const ringGeo = new THREE.BufferGeometry();
  const ringPos = new THREE.BufferAttribute(new Float32Array(6), 3);
  const ringSize = new THREE.BufferAttribute(new Float32Array(2), 1);
  const ringAlpha = new THREE.BufferAttribute(new Float32Array(2), 1);
  ringGeo.setAttribute("position", ringPos);
  ringGeo.setAttribute("aSize", ringSize);
  ringGeo.setAttribute("aAlpha", ringAlpha);
  ringGeo.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(2), 1));
  const ring = new THREE.Points(ringGeo, ringMat);
  ring.renderOrder = 11;
  ring.frustumCulled = false;
  ring.visible = false;
  earthGroup.add(ring);

  // ------------------------------------------------------------ the record (time)
  // The record's time track, in the ecliptic (the plane of the Earth's orbit, tilted 23.44 degrees
  // to the equator) and fixed among the stars: the vinyl disc of record3d.js, its grooves the
  // record's dates from the outer edge inward, and the stylus from the chosen place to the groove of
  // the date shown. Nothing else is drawn around the planet, so nothing reads as something in orbit.
  const orbit = new THREE.Group(); // in the ecliptic plane (local z = ecliptic pole)
  scene.add(orbit);
  const vinyl = createRecord(THREE, { reducedMotion, lite: lowMemory });
  orbit.add(vinyl.group);
  let sunLonRad = 0; // the Sun's ecliptic longitude for the instant shown

  // ------------------------------------------------------------ state
  let places = []; // { id, name, lat, lon, active, pos }
  let byId = new Map();
  let selectedId = null;
  let pendingSelect = null;
  let hoveredId = null;
  let listHoverId = null; // a place lit from the place list (view.hover): shown while the pointer is not over the picture
  let mode = "overview";
  let power = false;
  let playing = false;
  let held = false; // a Play has run at this place: its framing (and the record, fully present) stays after it ends
  // The trace's owner: the place, the record and the last date marked (a resume is told from a new Play by them).
  const marks = { place: null, rec: null, last: -1, resume: false };
  // A Play that reached its last date with the record nearly edge on: the camera turns to show it whole.
  const endFix = { dir: null, dist: 0, mix: 0, t0: 0, check: false };
  const playView = () => playing || held; // the Play framing is shown (playing, or held after a Play)
  let frameInfo = null;
  let record = null;
  let shown = true;
  // The page's opening gate (an opaque full-screen entrance, <html class="gate-on">) hides the picture
  // although it is on screen: one frame is drawn under it (everything uploaded and ready), then
  // nothing until it lifts (the class goes, or the page asks for the entrance as it starts lifting).
  const rootEl = document.documentElement;
  const gateCovers = () => rootEl.classList.contains("gate-on") && !rootEl.classList.contains("gate-leaving");
  let gateUp = gateCovers();
  let gateFrames = 0;
  let pageVisible = !document.hidden;
  let onScreen = true;
  let lost = false;
  let disposed = false;
  let raf = 0;
  let last = now();

  // Frame metrics (from the host and the safe area).
  const M = { W: 1, H: 1, cx: 0.5, cy: 0.5, tcx: 0.5, tcy: 0.5, placedCenter: false, play: 5, sh: 1, k: 0.25, overview: 6, wide: 12, focus: 2.7, checked: 0 };

  // Camera: an Earth-fixed direction and a distance, so a chosen place stays put while the sky turns.
  const cam = {
    dir: latLonVec(12 * RAD, -38 * RAD),
    dist: 6,
    placed: false, // first layout done
    touched: false, // the user has turned the globe
    flight: null,
    prev: null, // the flight being left behind on a retarget, blended out
    prevT0: 0,
    vLon: 0,
    vLat: 0,
    lastInteract: -Infinity,
    spin: 1, // overview clock speed, 0 (held) to 1 (running)
    ovAz: 0, // overview: the user's drag offsets from the sunlit view
    ovEl: 0,
    entrance: null, // the first appearance: { t0, from }
    home: null, // the way back to the opening view: { t0, az0, el0, d0, peak, dur, idle }
    out: null, // the distance easing out of an arrived place: { t0, d0 }
    lastTouch: -Infinity, // the last pointer, wheel or touch activity over the picture (the idle return)
    zd: 0, // the data view's distance chosen by the zoom (0: the arrival distance)
    pz: 1, // the zoom's factor on the Play distance while Play runs
    entered: false,
    leftPlace: false, // dragged away from an arrived place: back in the overview
    playMix: 0, // 0 arrival framing, 1 the Play framing (Earth-fixed, the place at the center)
    playFor: null, // the place the Play framing was chosen for (once per Play)
    playLat: 0, // the Play camera's Earth-fixed latitude and longitude (rad)
    playLon: 0,
    playTilt: 0, // its tilt from the place's vertical (rad)
    pOffLon: 0, // a drag during Play: offsets from the Play framing, eased back after release
    pOffLat: 0,
    aim: new THREE.Vector3(), // the Earth-fixed point the camera looks at (the Earth's center, or the place while playing)
    aimFrom: null, // a look point being blended out (a flight or a drag leaving the Play framing)
    aimT0: 0,
  };
  const ovWorld = new THREE.Vector3();
  let pickRefocus = null; // a dot the user just clicked: its select flies in even if it is the same place
  let cloudDays = 0; // the clouds' own clock (simulated days, modulo CLOUD_CYCLE_DAYS): it runs only with the overview clock, never with date steps

  // Time shown: instant (ms), unwrapped sidereal angle (rad) and the Moon's direction.
  const time = {
    T: solarInstant(todayIso()),
    theta: 0,
    moon: new THREE.Vector3(1, 0, 0),
    tw: null,
    dirty: true,
  };
  time.theta = greenwichSiderealDeg(time.T) * RAD;
  moonVec(time.T, time.moon);

  // Data drape.
  const data = {
    on: false, // a place has been flown to: show the record's frame
    onAt: 0, // when the drape may start fading in (mid-flight)
    aUrl: null,
    bUrl: null,
    want: null,
    fade: null,
    amount: 0,
    hdTimer: 0,
    stepMs: 0,
    token: 0, // increases with every setFrame: late images of an older date are ignored
    keep: new Set(), // prefetched HD frames, protected from eviction
    need: 0, // the frame width the framing in use needs (1024, 2048 or 4096; 0 before the first frame)
    prefetchLater: false, // the next dates wait for the end of a flight (arrive())
  };
  const texCache = new Map(); // url -> { tex, promise, used, bytes }
  const uhdOk = !lowMemory && renderer.capabilities.maxTextureSize >= 4096;
  // The byte budget follows the tier in use: the 4096 px budget only while the framing needs it
  // (Play at 2048 px keeps the cache to the 2048 px budget, evicting the older frames).
  const texBudget = () => (lowMemory ? TEX_BUDGET_SMALL : uhdOk && data.need >= 4096 ? TEX_BUDGET_UHD : TEX_BUDGET);
  // Land masks by URL (white = land; each record names its own), the record (meta) each drape slot
  // shows, and the record the current frame belongs to (setRecord comes before its setFrame).
  const masks = new Map(); // url -> { tex, promise, failed, bytes, used }
  const slotRec = { a: null, b: null };
  let frameRec = null;

  // Pulses.
  const fx = { ripple: null, flicker: null, arrive: null };



  // Pointer.
  const ptr = { inside: false, x: 0, y: 0, drag: null, scratch: null, pinch: null };

  // ------------------------------------------------------------ helpers
  function moonVec(T, out) {
    const m = moonPosition(new Date(T));
    return eqToWorld(m.ra, m.dec, out);
  }

  /**
   * The sky (Sun, planets, obliquity, precession) for an instant, from two computed keys and a cheap
   * interpolation between them: the keys are a Play step's two dates while it runs, else instants
   * SKY_KEY_MS apart. ephemeris.js runs a few times per date instead of every frame.
   */
  const skyKeys = { Ta: NaN, Tb: NaN, a: null, b: null };
  const skyNow = { obliquity: 0, precession: 0, sun: { ra: 0, dec: 0, lon: 0 }, planets: {}, moon: null };
  const lerpDeg = (a, b, k) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;
  function skyFor(T) {
    const tw = time.tw;
    let Ta, Tb;
    if (tw && T >= Math.min(tw.T0, tw.T1) && T <= Math.max(tw.T0, tw.T1) && tw.T0 !== tw.T1) { Ta = tw.T0; Tb = tw.T1; }
    else { Ta = Math.floor(T / SKY_KEY_MS) * SKY_KEY_MS; Tb = Ta + SKY_KEY_MS; }
    if (Ta !== skyKeys.Ta || Tb !== skyKeys.Tb) {
      skyKeys.a = Ta === skyKeys.Tb ? skyKeys.b : Ta === skyKeys.Ta ? skyKeys.a : skyAt(new Date(Ta));
      skyKeys.b = skyAt(new Date(Tb));
      skyKeys.Ta = Ta;
      skyKeys.Tb = Tb;
    }
    const a = skyKeys.a, b = skyKeys.b;
    const k = clamp((T - Ta) / (Tb - Ta), 0, 1);
    skyNow.obliquity = a.obliquity + (b.obliquity - a.obliquity) * k;
    skyNow.precession = a.precession + (b.precession - a.precession) * k;
    skyNow.sun.ra = lerpDeg(a.sun.ra, b.sun.ra, k);
    skyNow.sun.dec = a.sun.dec + (b.sun.dec - a.sun.dec) * k;
    skyNow.sun.lon = lerpDeg(a.sun.lon, b.sun.lon, k);
    for (const name in a.planets) {
      const pa = a.planets[name], pb = b.planets[name] || pa;
      const o = skyNow.planets[name] || (skyNow.planets[name] = { ra: 0, dec: 0, mag: 0 });
      o.ra = lerpDeg(pa.ra, pb.ra, k);
      o.dec = pa.dec + (pb.dec - pa.dec) * k;
      o.mag = pa.mag + (pb.mag - pa.mag) * k;
    }
    return skyNow;
  }
  /** The Moon's direction for an instant, from hourly keys (slerped): the overview clock's every frame. */
  const moonKeys = { Ta: NaN, a: new THREE.Vector3(), b: new THREE.Vector3() };
  function moonAt(T, out) {
    const Ta = Math.floor(T / SKY_KEY_MS) * SKY_KEY_MS;
    if (Ta !== moonKeys.Ta) {
      if (Ta === moonKeys.Ta + SKY_KEY_MS) moonKeys.a.copy(moonKeys.b);
      else moonVec(Ta, moonKeys.a);
      moonVec(Ta + SKY_KEY_MS, moonKeys.b);
      moonKeys.Ta = Ta;
    }
    return slerpDir(moonKeys.a, moonKeys.b, (T - Ta) / SKY_KEY_MS, out);
  }

  const visible = () => shown && pageVisible && onScreen && !lost && !disposed && !(gateUp && gateFrames > 0);

  let lastFrameAt = 0;
  let lastInputAt = -Infinity; // the last drag, wheel or scratch on the picture (full frame rate shortly after)
  let frameCount = 0; // frames drawn (diagnostics: the loop goes idle when nothing moves)
  let lastCalls = 0; // draw calls of the last frame, sky and scene (diagnostics)
  let watchdog = 0;
  let ovClock = false; // the overview clock alone keeps the loop going (drawn at most OVERVIEW_FPS times a second)
  let capTimer = 0; // the overview's next capped frame (a timer, not an animation frame polled every vsync)
  let wakeAt = 0; // nothing moves until then (the overview clock resumes after a hold): one timer wakes the loop
  let wakeTimer = 0;
  let forceNext = false; // the next frame draws even within MIN_FRAME_MS (a kick, a resize)
  const ovFrameMs = 1000 / (lowMemory ? OVERVIEW_FPS_SMALL : OVERVIEW_FPS);
  function kick() {
    if (!visible()) return;
    // Something changed: draw on the next animation frame.
    if (capTimer) { clearTimeout(capTimer); capTimer = 0; }
    if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = 0; }
    forceNext = true;
    if (!raf) {
      last = now();
      raf = requestAnimationFrame(frame);
    }
    // Some hosts stop delivering animation frames while nothing on the page changes (headless
    // capture, throttled iframes): if the frame asked for has not come within 120 ms, draw anyway.
    if (!watchdog) {
      const asked = now();
      watchdog = setTimeout(() => {
        watchdog = 0;
        if (raf && lastFrameAt < asked && visible()) {
          cancelAnimationFrame(raf);
          raf = 0;
          forceNext = true;
          frame();
        }
      }, 120);
    }
  }

  function readMetrics() {
    M.dirty = false;
    const W = host.clientWidth || canvas.clientWidth || 1;
    const H = host.clientHeight || canvas.clientHeight || 1;
    const hr = host.getBoundingClientRect();
    let s = null;
    try { s = safeArea(); } catch { s = null; }
    if (!s || !(s.width > 20) || !(s.height > 20)) s = hr;
    const cx = s.left + s.width / 2 - hr.left;
    const cy = s.top + s.height / 2 - hr.top;
    const minDim = Math.max(60, Math.min(s.width, s.height));
    const k = (minDim / H) * Math.tan((FOV / 2) * RAD);
    const sizeChanged = W !== M.W || H !== M.H;
    const first = !M.placedCenter;
    // The record around the Earth must fit the safe area: a narrow one (phones) meets the screen edge.
    const narrow = s.width < NARROW_SAFE;
    // Narrow: the Earth as large as the record allows, the record's widest extent reaching to
    // DISC_EDGE px of the nearer screen edge (the record's half width is DISC_SPAN / 4 * fill * minDim).
    const room = Math.min(cx, W - cx) - DISC_EDGE;
    const ovFill = narrow ? clamp((4 * room) / (DISC_SPAN * minDim), OVERVIEW_FILL_NARROW, OVERVIEW_FILL) : OVERVIEW_FILL;
    Object.assign(M, {
      W, H, tcx: cx, tcy: cy, k, sh: s.height, sw: s.width,
      overview: 1 / Math.sin(Math.atan(ovFill * k)),
      play: PLAY_LIMB_R / Math.sin(Math.atan(PLAY_FIT * k)), // untilted fallback (playDistFor has the real one)
      wide: 1 / Math.sin(Math.atan(WIDE_FILL * k)),
      focus: Math.max(1.35, Math.cos(FOCUS_HALF_SPAN) + Math.sin(FOCUS_HALF_SPAN) / k),
      checked: now(),
    });
    if (first || reducedMotion()) { M.cx = cx; M.cy = cy; M.placedCenter = true; }
    if (sizeChanged || first) applyCenter();
    return sizeChanged;
  }

  /** The Earth's center on screen: the safe box's center (eased when the box changes). */
  function applyCenter() {
    camera.aspect = M.W / M.H;
    camera.setViewOffset(M.W, M.H, M.W / 2 - M.cx, M.H / 2 - M.cy, M.W, M.H);
    camera.updateProjectionMatrix();
  }
  function easeCenter(dt) {
    const dx = M.tcx - M.cx, dy = M.tcy - M.cy;
    if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) {
      if (dx || dy) { M.cx = M.tcx; M.cy = M.tcy; applyCenter(); }
      return false;
    }
    const k = 1 - Math.exp(-dt * 5);
    M.cx += dx * k;
    M.cy += dy * k;
    applyCenter();
    return true;
  }

  // Arrived: close in; while Play runs, pulled back so the whole Earth and some sky are in view.
  const nearDist = () => M.focus / Math.pow(ZOOM_PER_NOTCH, ZOOM_NEAR_NOTCHES);
  const farDist = () => M.overview;
  /** The distance the camera rests at: the overview's, the zoomed data view's, or the zoomed Play distance. */
  function restDist() {
    if (mode !== "focus") return M.overview;
    if (playView()) {
      let pd = playDistOf(placeOf(selectedId));
      if (endFix.dir) pd += (Math.max(pd, endFix.dist) - pd) * endFix.mix;
      return clamp(pd * cam.pz, Math.min(nearDist(), pd), Math.max(farDist(), pd));
    }
    return clamp(cam.zd || M.focus, nearDist(), farDist());
  }
  /** How much of the drape the distance lets through: 1 up to ZOOM_FADE_FROM of the range, 0 at the far end. */
  function distFade() {
    if (mode !== "focus" || playView() || cam.flight) return 1;
    const u = Math.log(Math.max(cam.dist, 1e-3) / M.focus) / Math.log(Math.max(1.0001, farDist() / M.focus));
    return 1 - smooth((u - ZOOM_FADE_FROM) / (1 - ZOOM_FADE_FROM));
  }

  /** The wheel's zoom, clamped so the camera stays outside the atmosphere and not far beyond the overview. */
  /**
   * Zoom by n wheel notches (above 0: farther). In the overview, zooming in brings the data view back
   * around whatever is in front of the camera; in the data view, zooming out to the far end returns
   * to the overview (updateCamera); during Play the zoom is a factor on the Play distance.
   */
  function zoomNotches(n) {
    if (!(Math.abs(n) > 1e-6) || !cam.placed) return;
    const f = Math.pow(ZOOM_PER_NOTCH, n);
    cam.home = null;
    cam.entrance = null;
    cam.out = null;
    if (mode === "overview") {
      if (n > 0 || cam.flight) { kick(); return; } // already the far end
      enterFromOverview();
      cam.zd = clamp(farDist() * f, nearDist(), farDist());
    } else if (playView()) {
      const pd = playDistOf(placeOf(selectedId));
      cam.pz = clamp(cam.pz * f, Math.min(nearDist(), pd) / pd, Math.max(farDist(), pd) / pd);
    } else {
      cam.zd = clamp((cam.zd || M.focus) * f, nearDist(), farDist());
    }
    if (reducedMotion()) cam.dist = restDist();
    // The frame tier follows the real magnification.
    if (data.on && frameInfo && !lowMemory && data.need && neededWidth() !== data.need) showFrame(frameInfo, HD_UPGRADE_MS);
    kick();
  }

  /** From the overview into the data view at the same camera: Earth-fixed from now on, the drape on. */
  function enterFromOverview() {
    cam.dir.copy(camera.position).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, -time.theta);
    clampPitch(cam.dir);
    mode = "focus";
    cam.leftPlace = false;
    cam.touched = true; // choosing the selected place again flies to it
    cam.vLon = cam.vLat = 0;
    cam.zd = cam.dist;
    if (!data.on) {
      data.on = true;
      data.onAt = 0;
      if (frameInfo) { showFrame(frameInfo, 0); prefetchAhead(); }
    }
  }

  /** The Play camera's tilt from a place's vertical, and the hemisphere it tilts toward (+1 north, -1 south). */
  /** A phone's portrait picture (by the canvas's own size): Play frames the record in view there. */
  const phonePlay = () => M.W < PHONE_PLAY_W && M.W <= M.H * 1.2;
  function playTiltOf(p) {
    const lat = p.lat * RAD;
    if (phonePlay()) {
      // On a phone the record must show whole all through the Play: the camera sits at least
      // PHONE_MIN_CAM_LAT from the equator, tilted from the place's vertical toward its hemisphere's
      // pole (south near the equator) only as far as that needs.
      const sg = lat > PLAY_EQ_BAND ? 1 : -1;
      return [Math.max(0, PHONE_MIN_CAM_LAT - Math.abs(lat)), sg];
    }
    if (Math.abs(lat) >= PLAY_TILT_LAT) return [0, 0];
    const sg = lat > PLAY_EQ_BAND ? 1 : -1;
    return [Math.min(PLAY_MAX_TILT, Math.abs(sg * PLAY_TILT_LAT - lat)), sg];
  }

  /**
   * The Play distance for a camera tilted by tilt (rad) from the place's vertical and aimed at the
   * place: as close as possible while the whole Earth stays inside PLAY_FIT of the safe area. The
   * place is at the center; the Earth's center sits off it, along the screen's vertical (the camera,
   * the place and the axis share the meridian plane), by the angle a with tan a = sin(tilt) /
   * (d - cos(tilt)); its far limb is at a + asin(R / d) from the center, which must stay within the
   * half height, and the limb across, asin(R / d), within the half width.
   */
  const playMemo = { tilt: NaN, kH: NaN, kW: NaN, d: 0 }; // numbers, not a string key: this runs every frame
  function playDistFor(tilt) {
    const t = (Math.tan((FOV / 2) * RAD) / M.H) * PLAY_FIT; // tan of the angle per px, times the fit
    const kH = (M.sh || M.H) * t; // tan of the reachable half height and half width
    const kW = (M.sw || M.W) * t;
    if (playMemo.tilt === tilt && playMemo.kH === kH && playMemo.kW === kW) return playMemo.d;
    const R = PLAY_LIMB_R;
    const across = R / Math.sin(Math.atan(kW)); // the distance where the limb meets the half width
    const reach = Math.atan(kH);
    const far = (d) => Math.atan2(Math.sin(tilt), d - Math.cos(tilt)) + Math.asin(R / d);
    let lo = R * 1.001;
    let hi = 60;
    if (far(hi) > reach) lo = hi; // a tiny stage: as far as allowed
    for (let i = 0; i < 40 && hi - lo > 1e-4; i++) {
      const mid = (lo + hi) / 2;
      if (far(mid) > reach) lo = mid; else hi = mid;
    }
    playMemo.tilt = tilt;
    playMemo.kH = kH;
    playMemo.kW = kW;
    playMemo.d = Math.max(hi, across);
    return playMemo.d;
  }

  /**
   * The Play distance for a place: the closest one where the whole Earth fits (playDistFor), pulled
   * back just enough that the stylus tip (at the place's ecliptic longitude on each date's groove, at
   * the instant each date is shown: 10:30 local time) stays PLAY_TIP_ROOM radii inside the safe area
   * on every date of the record where it rests beside the planet with the record in view; never
   * farther than the first Play framing (PLAY_MAX_FILL). Computed once per place, record and stage.
   */
  const tipMemo = { p: null, rec: null, fit: NaN, sw: NaN, sh: NaN, H: NaN, d: 0 };
  const tw = { P: new THREE.Vector3(), C: new THREE.Vector3(), T: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3() };
  function playDistOf(p) {
    if (!p) return M.play;
    const [tilt, sg] = playTiltOf(p);
    const fit = playDistFor(tilt);
    if (phonePlay()) {
      // A phone: the Earth at PHONE_EARTH_SHARE of the picture's width (the record, its played grooves
      // and the stylus around it), never closer than the whole Earth needs.
      const share = PLAY_LIMB_R / Math.sin(Math.atan(((PHONE_EARTH_SHARE * (M.sw || M.W)) / M.H) * Math.tan((FOV / 2) * RAD)));
      return Math.max(fit, share);
    }
    const dates = Array.isArray(record?.dates) ? record.dates : [];
    if (!dates.length || !vinyl.radiusAt) return fit;
    const short = Math.min(M.sh || M.H, M.sw || M.W);
    const maxD = Math.max(fit, PLAY_LIMB_R / Math.sin(Math.atan(((PLAY_MAX_FILL * short) / M.H) * Math.tan((FOV / 2) * RAD))));
    if (tipMemo.p === p && tipMemo.rec === record && tipMemo.fit === fit && tipMemo.sw === M.sw && tipMemo.sh === M.sh && tipMemo.H === M.H) return tipMemo.d;
    const lat = p.lat * RAD, lon = p.lon * RAD;
    const camLat = clamp(lat + sg * tilt, -MAX_LAT, MAX_LAT);
    const UP = THREE.Object3D.DEFAULT_UP;
    const eps = 23.44 * RAD;
    const eY = new THREE.Vector3(0, Math.sin(eps), -Math.cos(eps));
    const eZ = new THREE.Vector3(0, Math.cos(eps), Math.sin(eps));
    const tanH = Math.tan((FOV / 2) * RAD);
    const hw = (M.sw || M.W) / 2, hh = (M.sh || M.H) / 2;
    // The dates' geometry (independent of the distance): the place, the camera direction, the tip.
    // Each date, and two instants inside each step to the next (a step eases the Earth's turn the
    // short way and the groove radius between the two dates, as setInstant and the record do).
    const geo = [];
    const Ts = dates.map((d) => solarInstant(d, p.lon));
    const add = (th, idx) => {
      const P = latLonVec(lat, lon, new THREE.Vector3()).applyAxisAngle(UP, th);
      const Cd = latLonVec(camLat, lon, new THREE.Vector3()).applyAxisAngle(UP, th);
      const lam = Math.atan2(P.dot(eY), P.x);
      const rT = vinyl.radiusAt(idx);
      const tip = new THREE.Vector3(1, 0, 0).multiplyScalar(Math.cos(lam) * rT).addScaledVector(eY, Math.sin(lam) * rT);
      geo.push({ P, Cd, tip });
    };
    for (let i = 0; i < Ts.length; i++) {
      if (!Number.isFinite(Ts[i])) continue;
      const th0 = greenwichSiderealDeg(Ts[i]) * RAD;
      add(th0, i);
      if (i + 1 < Ts.length && Number.isFinite(Ts[i + 1])) {
        const turn = wrapPi(greenwichSiderealDeg(Ts[i + 1]) * RAD - th0);
        for (const f of [1 / 3, 2 / 3]) add(th0 + turn * f, i + f);
      }
    }
    const fits = (d) => {
      const Rpx = (Math.tan(Math.asin(1 / d)) / tanH) * (M.H / 2);
      const room = Rpx * PLAY_TIP_ROOM;
      for (const g of geo) {
        const C = tw.C.copy(g.Cd).multiplyScalar(d);
        if (Math.asin(Math.abs(C.dot(eZ)) / d) < RECORD_OPEN_DEG * RAD) continue; // the record is edge on: hidden
        const f = tw.f.copy(g.P).sub(C).normalize();
        const r = tw.r.crossVectors(f, UP).normalize();
        const u = tw.u.crossVectors(r, f);
        const v = tw.v.copy(g.tip).sub(C);
        const z = v.dot(f);
        if (z <= 0.05) continue;
        // Hidden by the planet (behind it, or in front of it where the disc fades): no need to frame it.
        const dir = tw.T.copy(v).normalize();
        const sc = -C.dot(dir);
        if (sc > 0 && Math.sqrt(Math.max(0, d * d - sc * sc)) <= 1.05) continue;
        const px = ((v.dot(r) / z) / tanH) * (M.H / 2);
        const py = ((v.dot(u) / z) / tanH) * (M.H / 2);
        if (Math.abs(px) > hw - room || Math.abs(py) > hh - room) return false;
      }
      return true;
    };
    let d = fit;
    if (!fits(fit)) {
      let lo = fit, hi = maxD;
      if (!fits(hi)) d = hi;
      else {
        for (let i = 0; i < 30 && hi - lo > 1e-3; i++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) hi = mid; else lo = mid;
        }
        d = hi;
      }
    }
    Object.assign(tipMemo, { p, rec: record, fit, sw: M.sw, sh: M.sh, H: M.H, d });
    return d;
  }

  function placeOf(id) { return byId.get(id) || null; }

  // ------------------------------------------------------------ time and sky
  function instantTarget() {
    const p = placeOf(selectedId);
    return solarInstant(frameInfo?.date || todayIso(), p ? p.lon : null);
  }

  /**
   * Show another instant. The Earth's turn (sidereal angle) takes the shortest way round, or, during
   * a flight, the way that keeps the Sun where it is relative to the moving camera (prefTurn, rad),
   * so the place being flown to never passes through night on the way.
   */
  function setInstant(T1, dur, linear = false, prefTurn = null, isStep = false) {
    if (!Number.isFinite(T1)) return;
    let turn = wrapPi(greenwichSiderealDeg(T1) * RAD - time.theta);
    if (prefTurn != null) turn += TAU * Math.round((prefTurn - turn) / TAU);
    const th1 = time.theta + turn;
    const m1 = moonVec(T1, new THREE.Vector3());
    if (dur <= 0 || reducedMotion()) {
      time.T = T1; time.theta = th1; time.moon.copy(m1); time.tw = null; time.dirty = true;
      return;
    }
    const h = cam.home;
    if (h && !isStep) {
      // The way home also changes the instant (the logo resets the place and the date): the
      // Earth's turn (the shortest way, under half a turn) and the sky (the Sun moves along the
      // ecliptic with the date, and the overview camera with it) move with the swing, in one calm
      // ease, and a long turn stretches the swing so nothing turns faster than HOME_DEG_PER_S.
      const t = now();
      const sunTurn = Math.abs(wrapPi(((T1 - time.T) / (365.2422 * 86400000)) * TAU));
      const ang = Math.max(Math.abs(turn), sunTurn) + Math.max(Math.abs(h.az0), Math.abs(h.el0));
      if (t - h.t0 < 300) h.dur = Math.max(h.dur, homeDur(ang));
      dur = Math.max(dur, h.t0 + h.dur - t);
    }
    time.tw = { T0: time.T, T1, th0: time.theta, th1, m0: time.moon.clone(), m1, t0: now(), dur, linear, isStep };
  }

  /**
   * Land a running step on its target instant (Play stopping or pausing): the rest of the step in a
   * short ease from where the picture is now; a cut with reduced motion.
   */
  function settleStep() {
    const tw = time.tw;
    if (!tw || !tw.isStep) return;
    if (reducedMotion()) { time.T = tw.T1; time.theta = tw.th1; time.moon.copy(tw.m1); time.tw = null; time.dirty = true; return; }
    time.tw = { T0: time.T, T1: tw.T1, th0: time.theta, th1: tw.th1, m0: time.moon.clone(), m1: tw.m1, t0: now(), dur: STEP_SETTLE_MS, linear: false, isStep: false };
  }

  /**
   * The overview clock: the simulated instant runs on (one day every 80 s); the Earth turns at the
   * sidereal rate, the Sun, Moon and planets move from the same instant, and the clouds drift a
   * little over the ground. Nothing moves while the clock is held.
   */
  function advanceTime(simSeconds) {
    if (!(simSeconds > 0) || time.tw) return;
    const days = simSeconds / 86400;
    time.T += simSeconds * 1000;
    time.theta += days * SIDEREAL_DEG_PER_DAY * RAD;
    moonAt(time.T, time.moon);
    cloudDays = (cloudDays + days) % CLOUD_CYCLE_DAYS;
    time.dirty = true;
  }

  const orbitBasis = new THREE.Matrix4();
  // The ecliptic frame in world axes: x to the March equinox, z to the ecliptic north pole.
  const eclX = new THREE.Vector3(1, 0, 0);
  const eclY = new THREE.Vector3(0, 0.3978, -0.9175);
  const eclZ = new THREE.Vector3(0, 0.9175, 0.3978);
  /** Ecliptic longitude and latitude (rad) of a world direction. */
  const toEcliptic = (v) => [Math.atan2(v.dot(eclY), v.dot(eclX)), Math.asin(clamp(v.dot(eclZ) / (v.length() || 1), -1, 1))];
  /** World direction of an ecliptic longitude and latitude (rad). */
  const fromEcliptic = (lon, lat, out) => out.copy(eclX).multiplyScalar(Math.cos(lat) * Math.cos(lon))
    .addScaledVector(eclY, Math.cos(lat) * Math.sin(lon)).addScaledVector(eclZ, Math.sin(lat));
  function updateTime(t) {
    const tw = time.tw;
    if (tw) {
      const s = clamp((t - tw.t0) / tw.dur, 0, 1);
      const e = tw.linear ? s : smoother(s);
      time.T = tw.T0 + (tw.T1 - tw.T0) * e;
      time.theta = tw.th0 + (tw.th1 - tw.th0) * e;
      slerpDir(tw.m0, tw.m1, e, time.moon);
      time.dirty = true;
      if (s >= 1) time.tw = null;
    }
    if (!time.dirty) return false;
    time.dirty = false;
    const sky = skyFor(time.T);
    earthGroup.rotation.y = time.theta;
    eqToWorld(sky.sun.ra, sky.sun.dec, sunDir);
    skyApi.setBodies(sky, time.moon);
    cloudUniforms.uFlow.value = cloudDays;
    sunLonRad = sky.sun.lon * RAD;
    // The ring lies in the ecliptic of date: local x to the March equinox, local z to the pole.
    const eps = sky.obliquity * RAD;
    eclX.set(1, 0, 0);
    eclY.set(0, Math.sin(eps), -Math.cos(eps));
    eclZ.set(0, Math.cos(eps), Math.sin(eps));
    orbitBasis.makeBasis(eclX, eclY, eclZ);
    orbit.quaternion.setFromRotationMatrix(orbitBasis);
    return true;
  }

  // ------------------------------------------------------------ camera
  function evalFlight(f, t, out) {
    const s = clamp((t - f.t0) / f.dur, 0, 1);
    slerpDir(f.fromDir, f.toDir, smoother(s), out.dir);
    clampPitch(out.dir);
    const toDist = f.toDist;
    const P = f.peakAt;
    out.dist = s < P
      ? f.fromDist + (f.peak - f.fromDist) * smoother(s / P)
      : f.peak + (toDist - f.peak) * smoother((s - P) / (1 - P));
    out.s = s;
    return out;
  }
  const evA = { dir: new THREE.Vector3(), dist: 0, s: 0 };
  const evB = { dir: new THREE.Vector3(), dist: 0, s: 0 };

  function flyTo(place) {
    cam.entrance = null;
    cam.home = null;
    cam.out = null;
    const toDir = clampPitch(latLonVec(place.lat * RAD, place.lon * RAD));
    const toDist = restDist(); // arrived, or the Play distance when Play brought the camera here
    if (reducedMotion() || !cam.placed) {
      cam.dir.copy(toDir);
      cam.dist = toDist;
      cam.flight = null;
      cam.prev = null;
      cam.aimFrom = null;
      return 0;
    }
    const t = now();
    // Leaving the Play framing: start from where the camera really is, and blend its look point
    // (the place it was aimed at) back to the Earth's center.
    if (cam.playMix > 0) {
      cam.dir.copy(camera.position).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, -time.theta);
      cam.playMix = 0;
      blendAimOut(t);
    }
    // Start from where the camera is now (mid-flight included), blending the old path out.
    let fromDir = cam.dir.clone();
    let fromDist = cam.dist;
    if (cam.flight) {
      cam.prev = cam.flight;
      cam.prevT0 = t;
    }
    const angle = Math.acos(clamp(fromDir.dot(toDir), -1, 1));
    const x = clamp(angle / (100 * RAD), 0, 1);
    const reach = Math.sin((x * Math.PI) / 2) ** 1.6; // a hop barely pulls back, a long trip goes wide
    const base = Math.max(fromDist, M.focus);
    const peak = base + Math.max(0, M.wide - base) * reach;
    const dur = 2000 + 1400 * smooth(angle / (120 * RAD));
    // Signed longitude the camera travels (east positive), for the Earth's turn during the flight.
    let lonTravel = 0;
    const a = new THREE.Vector3();
    let prevLon = vecLon(fromDir);
    for (let i = 1; i <= 24; i++) {
      const lon = vecLon(slerpDir(fromDir, toDir, i / 24, a));
      lonTravel += wrapPi(lon - prevLon);
      prevLon = lon;
    }
    cam.flight = { fromDir, toDir, fromDist, toDist, peak, peakAt: 0.42, t0: t, dur, angle, lonTravel };
    cam.vLon = cam.vLat = 0;
    return dur;
  }

  function updateCamera(t, dt) {
    const rm = reducedMotion();
    let moving = false;
    ovClock = false;
    wakeAt = 0;
    if (cam.flight) {
      evalFlight(cam.flight, t, evA);
      if (cam.prev) {
        const w = smooth((t - cam.prevT0) / 600);
        evalFlight(cam.prev, t, evB);
        slerpDir(evB.dir, evA.dir, w, cam.dir);
        cam.dist = evB.dist + (evA.dist - evB.dist) * w;
        if (w >= 1) cam.prev = null;
      } else {
        cam.dir.copy(evA.dir);
        cam.dist = evA.dist;
      }
      if (evA.s >= 1 && !cam.prev) {
        cam.flight = null;
        arrive();
      }
      moving = true;
    } else {
      // Inertia after a drag.
      if (!ptr.drag?.active) {
        if (!rm && (Math.abs(cam.vLon) > 0.002 || Math.abs(cam.vLat) > 0.002)) {
          turnBy(cam.vLon * dt, cam.vLat * dt);
          const decay = Math.exp(-3.4 * dt);
          cam.vLon *= decay;
          cam.vLat *= decay;
          moving = true;
        } else {
          cam.vLon = cam.vLat = 0;
        }
      }
      // Overview: the clock runs (the Earth turns under the fixed Sun and camera); a hold or a drag
      // stops it at once, and it resumes after a while. Play owns the clock while it runs.
      if (mode === "overview" && !rm) {
        const idle = !ptr.drag && t - cam.lastInteract > AUTO_RESUME_MS;
        cam.spin = clamp(cam.spin + (idle ? dt / 1.6 : -dt / 0.25), 0, 1);
        if (cam.spin > 0 && !playing) advanceTime(SIM_RATE * smooth(cam.spin) * dt);
        // The clock turning (or ramping) draws at the overview's capped rate (frame()); held, nothing
        // changes: one timer wakes the loop when it may resume.
        if (cam.spin > 0 || idle) ovClock = true;
        else wakeAt = cam.lastInteract + AUTO_RESUME_MS;
        // Turned away from the opening view and left alone: swing back by itself (camera only).
        if (!cam.home && !cam.entrance && !cam.out && !playing && !data.on && !ptr.drag
          && !cam.vLon && !cam.vLat && t - cam.lastTouch > IDLE_HOME_MS && t - cam.lastInteract > IDLE_HOME_MS
          && (Math.abs(wrapPi(cam.ovAz)) > 0.03 || Math.abs(cam.ovEl) > 0.03)) startHome(true);
      }
      const target = restDist();
      if (cam.home) {
        // The way home: the drag offsets go back to zero (the sunlit opening view) while the
        // camera pulls out a little and settles at the overview distance.
        const h = cam.home;
        const s = clamp((t - h.t0) / h.dur, 0, 1);
        const e = smoother(s);
        cam.ovAz = h.az0 * (1 - e);
        cam.ovEl = h.el0 * (1 - e);
        // A gentle pull-back that peaks mid-swing, ending on the overview distance.
        cam.dist = h.d0 + (target - h.d0) * e + (h.peak - Math.max(h.d0, target)) * Math.sin(Math.PI * s);
        if (s >= 1) cam.home = null;
        moving = true;
      } else if (cam.entrance) {
        // The entrance: from far out, the Earth already turning, an ease-out push to the overview.
        if (cam.entrance.fresh) { cam.entrance.fresh = false; cam.entrance.t0 = t; }
        const s = clamp((t - cam.entrance.t0) / ENTRANCE_MS, 0, 1);
        cam.dist = cam.entrance.from + (target - cam.entrance.from) * (1 - (1 - s) ** 3);
        if (s >= 1) cam.entrance = null;
        moving = true;
      } else if (rm) cam.dist = target;
      else if (cam.out) {
        // Out of an arrived place: one calm ease to the overview distance (no exponential snap).
        const s = clamp((t - cam.out.t0) / LEAVE_MS, 0, 1);
        cam.dist = cam.out.d0 + (target - cam.out.d0) * smoother(s);
        if (s >= 1) cam.out = null;
        moving = true;
      } else if (Math.abs(target - cam.dist) > DIST_REST * target) {
        // Ease the distance to rest: layout changes, a drag out of a place (also while dragging).
        cam.dist += (target - cam.dist) * (1 - Math.exp(-dt * 2.4));
        moving = true;
      } else cam.dist = target; // the last tenth of a pixel: land on it and let the loop go idle
      // Zoomed out to the far end of the data view: the default overview again, from where the
      // camera is (leavePlace converts its direction to the Sun-fixed overview offsets: no jump).
      if (mode === "focus" && !playing && cam.zd >= farDist() * 0.999 && Math.abs(cam.dist - farDist()) <= farDist() * 0.003) {
        leavePlace();
        cam.out = null;
        cam.zd = 0;
        data.amount = 0; // the distance had already faded the drape out: no flash back when the fade lets go
        moving = true;
      }
    }
    const turn = time.theta;
    const UP = THREE.Object3D.DEFAULT_UP;
    earthGroup.rotation.y = turn;
    if (mode === "overview" && !cam.flight) {
      // Overview: the camera is held relative to the Sun, in the ecliptic frame (offset by the
      // user's drags), so it is fixed against the Sun and the stars while the Earth turns; its
      // Earth-fixed direction follows from it (a flight starts from there).
      const sunLon = Math.atan2(sunDir.dot(eclY), sunDir.dot(eclX)); // toEcliptic's longitude, without an array per frame
      fromEcliptic(sunLon + OVERVIEW_SUN_AZ + cam.ovAz, clamp(OVERVIEW_ECL_LAT + cam.ovEl, -1.45, 1.45), ovWorld);
      clampPitch(ovWorld);
      cam.dir.copy(ovWorld).applyAxisAngle(UP, -turn);
    }
    // While Play runs the camera moves to the Play framing (eased in when Play starts and out when
    // it stops, a cut with reduced motion) and then holds still relative to the Earth: the place
    // stays at the center of the safe area while the Sun, the stars, the planets and the record
    // turn around it as the dates advance.
    const playPlace = mode === "focus" && playView() && !cam.flight ? placeOf(selectedId) : null;
    const want = playPlace ? 1 : 0;
    if (rm) cam.playMix = want;
    else if (cam.playMix !== want) {
      cam.playMix += (want - cam.playMix) * (1 - Math.exp(-dt * 2.4));
      if (Math.abs(want - cam.playMix) < 1e-3) cam.playMix = want;
      moving = true;
    }
    const pp = playPlace || (cam.playMix > 0 ? placeOf(selectedId) : null);
    if (pp && cam.playFor !== pp.id) choosePlayFraming(pp);
    // A drag during Play turned the view: a moment after release it eases back.
    if ((cam.pOffLon || cam.pOffLat) && !ptr.drag?.active && t - cam.lastInteract > PLAY_RETURN_MS) {
      const k = rm ? 1 : 1 - Math.exp(-dt * 2.4);
      cam.pOffLon -= cam.pOffLon * k;
      cam.pOffLat -= cam.pOffLat * k;
      if (Math.abs(cam.pOffLon) < 1e-4 && Math.abs(cam.pOffLat) < 1e-4) cam.pOffLon = cam.pOffLat = 0;
      moving = true;
    } else if (cam.pOffLon || cam.pOffLat) moving = true; // keeps checking the release time
    aimE.set(0, 0, 0);
    if (cam.playMix > 0 && pp) {
      playDirEarth(playE);
      if (held && endFix.check && cam.playMix >= 1 && !time.tw && !cam.flight) chooseEndFraming(pp, t);
      if (endFix.dir) {
        // The end framing: eased in over END_MS (placed with reduced motion), then held.
        endFix.mix = rm ? 1 : smooth((t - endFix.t0) / END_MS);
        if (endFix.mix < 1) moving = true;
        // A drag's offsets (eased back after release) apply on top of the end framing too.
        latLonVec(clamp(vecLat(endFix.dir) + cam.pOffLat, -MAX_LAT, MAX_LAT), vecLon(endFix.dir) + cam.pOffLon, endE);
        slerpDir(playE, endE, endFix.mix, playE);
      }
      slerpDir(cam.dir, playE, cam.playMix, camE);
      // Aimed at the place (so it sits at the center of the safe area), less so as a drag turns away.
      const off = Math.hypot(cam.pOffLat, cam.pOffLon * Math.cos(cam.playLat));
      aimE.copy(pp.pos).multiplyScalar(cam.playMix * (1 - smooth(off / 0.6)));
      // Fully in the Play framing: the arrival framing to come back to is the place's vertical.
      if (cam.playMix >= 1) cam.dir.copy(clampPitch(latLonVec(pp.lat * RAD, pp.lon * RAD, camBase)));
    } else camE.copy(cam.dir);
    if (cam.aimFrom) {
      const w = rm ? 1 : smooth((t - cam.aimT0) / 700);
      aimE.lerp(cam.aimFrom, 1 - w);
      if (w >= 1) cam.aimFrom = null;
      else moving = true;
    }
    cam.aim.copy(aimE);
    // World position: the Earth-fixed direction turned by the sidereal angle.
    camera.position.copy(camE).applyAxisAngle(UP, turn).multiplyScalar(cam.dist);
    camera.lookAt(aimW.copy(aimE).applyAxisAngle(UP, turn));
    camera.updateMatrixWorld();
    return moving;
  }

  const playE = new THREE.Vector3();
  const endE = new THREE.Vector3();
  const camE = new THREE.Vector3();
  const camBase = new THREE.Vector3();
  const aimE = new THREE.Vector3();
  const aimW = new THREE.Vector3();

  /**
   * The Play framing for a place, chosen once when Play starts: Earth-fixed, on the place's own
   * meridian, tilted from its vertical toward the pole of its hemisphere (south near the equator)
   * just enough to reach PLAY_TILT_LAT and never more than PLAY_MAX_TILT, so the record (in the
   * ecliptic, within 23.44 degrees of the equator) is not seen edge on all year. Places beyond
   * PLAY_TILT_LAT keep the plain vertical. The camera then aims at the place itself.
   */
  function choosePlayFraming(p) {
    const lat = p.lat * RAD;
    const [tilt, sg] = playTiltOf(p);
    cam.playFor = p.id;
    cam.pOffLon = cam.pOffLat = 0;
    cam.playLat = clamp(lat + sg * tilt, -MAX_LAT, MAX_LAT);
    cam.playLon = p.lon * RAD;
    cam.playTilt = tilt;
  }

  /** The Play camera's Earth-fixed direction, with a drag's offsets. */
  function playDirEarth(out) {
    return latLonVec(clamp(cam.playLat + cam.pOffLat, -MAX_LAT, MAX_LAT), cam.playLon + cam.pOffLon, out);
  }

  /**
   * The end of a Play with the record nearly edge on (seen below END_OPEN_DEG to its plane, where it
   * fades): the nearest framing that shows it whole. The camera turns toward the side of the record
   * it is already on until it sees it at END_TARGET_DEG, still aimed at the place (which stays in the
   * picture, on the visible side), pulled back only as far as the whole Earth needs. Chosen once.
   */
  const endW = new THREE.Vector3();
  const endN = new THREE.Vector3();
  function chooseEndFraming(pp, t) {
    endFix.check = false;
    camera.updateMatrixWorld();
    endW.copy(camera.position).normalize();
    const cn = endW.dot(eclZ);
    const el = Math.asin(Math.min(1, Math.abs(cn)));
    if (el >= END_OPEN_DEG * RAD) return; // the record is whole already: the framing does not move
    const sg = cn >= 0 ? 1 : -1;
    // Rotate toward the pole on the camera's side, in the plane of the camera and the pole.
    endN.copy(eclZ).multiplyScalar(sg).addScaledVector(endW, -sg * cn);
    if (endN.lengthSq() < 1e-8) return;
    endN.normalize();
    const d = END_TARGET_DEG * RAD - el;
    endW.multiplyScalar(Math.cos(d)).addScaledVector(endN, Math.sin(d)).normalize();
    // Earth-fixed (the camera holds still relative to the Earth in the Play framing).
    endW.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -time.theta);
    clampPitch(endW);
    const tilt = Math.acos(clamp(endW.dot(tmpN.copy(pp.pos).normalize()), -1, 1));
    if (tilt > END_MAX_TILT) return; // the place would leave the visible side: keep the framing
    endFix.dir = (endFix.dir || new THREE.Vector3()).copy(endW);
    endFix.dist = playDistFor(tilt);
    endFix.t0 = t;
    endFix.mix = 0;
  }

  /** Blend the camera's look point from where it is back toward the Earth's center. */
  function blendAimOut(t) {
    if (cam.aim.lengthSq() < 1e-8) return;
    cam.aimFrom = (cam.aimFrom || new THREE.Vector3()).copy(cam.aim);
    cam.aimT0 = t;
  }

  /**
   * A drag while arrived (and not playing) means "I am leaving this place": back to the overview,
   * keeping the view where it is (the overview offsets are set from the current camera) while the
   * distance eases out. While Play runs a drag only turns the view for a moment (turnBy).
   */
  function leavePlace() {
    if (mode !== "focus") return;
    cam.flight = null;
    cam.prev = null;
    const [lon, lat] = toEcliptic(camera.position.clone().normalize());
    const [sunLon] = toEcliptic(sunDir);
    cam.ovAz = wrapPi(lon - sunLon - OVERVIEW_SUN_AZ);
    cam.ovEl = lat - OVERVIEW_ECL_LAT;
    mode = "overview";
    held = false;
    endFix.dir = null;
    endFix.check = false;
    cam.playMix = 0; // the overview offsets above already hold where the camera is
    blendAimOut(now());
    cam.leftPlace = true;
    cam.spin = 0;
    cam.out = reducedMotion() ? null : { t0: now(), d0: cam.dist };
    if (!playing) data.on = false;
  }

  /**
   * Back to the opening view from wherever the camera is: the overview, sunlit side, no drag
   * offsets, the Blue Marble again (the state the page opens in). entrance: play the first push in
   * from far out again instead of the swing back. A cut with reduced motion.
   */
  function goHome(entrance) {
    if (mode === "focus") leavePlace(); // the overview offsets now hold where the camera is
    cam.flight = null;
    cam.prev = null;
    cam.leftPlace = false;
    cam.touched = false;
    cam.vLon = cam.vLat = 0;
    cam.lastInteract = -Infinity; // the overview clock runs again
    cam.entrance = null;
    cam.home = null;
    if (!playing) data.on = false;
    if (!cam.placed) { cam.ovAz = cam.ovEl = 0; return; }
    cam.zd = 0;
    cam.pz = 1;
    if (reducedMotion()) {
      cam.ovAz = cam.ovEl = 0;
      cam.dist = M.overview;
    } else if (entrance) {
      cam.ovAz = cam.ovEl = 0;
      cam.entered = true;
      cam.entrance = { t0: now(), from: M.overview * 3.6, fresh: true }; // its clock starts with the first frame drawn (the page may be busy as the gate lifts)
    } else startHome(false);
  }

  /**
   * One calm swing to the opening view: the drag offsets ease to zero (the shortest way round), the
   * duration grows with the angle so nothing seen turns faster than HOME_DEG_PER_S. setInstant
   * stretches it (and moves the Earth's turn and the sky with it) when the logo also changes the
   * instant. idle: the swing the overview starts by itself; any touch of the picture cancels it.
   */
  function startHome(idle) {
    cam.out = null;
    cam.zd = 0;
    cam.pz = 1;
    const ang = Math.max(Math.abs(wrapPi(cam.ovAz)), Math.abs(cam.ovEl));
    cam.home = { t0: now(), az0: wrapPi(cam.ovAz), el0: cam.ovEl, d0: cam.dist, peak: Math.max(cam.dist, M.overview) * HOME_PULL, dur: homeDur(ang), idle };
  }
  function homeDur(rad) {
    // smoother() peaks at 1.875 times its mean speed: the peak, not the mean, stays under the limit.
    return clamp(((1.875 * rad) / RAD / HOME_DEG_PER_S) * 1000, HOME_MIN_MS, HOME_MAX_MS);
  }

  function turnBy(dLon, dLat) {
    if (mode === "overview" && !cam.flight) {
      // Overview drags move the camera around the Earth relative to the Sun.
      cam.ovAz = wrapPi(cam.ovAz + dLon);
      cam.ovEl = clamp(cam.ovEl + dLat, -1.45 - OVERVIEW_ECL_LAT, 1.45 - OVERVIEW_ECL_LAT);
      return;
    }
    if (mode === "focus" && playView() && !cam.flight) {
      // During Play: offsets from the Play framing, eased back after release (the place is kept).
      cam.pOffLon = wrapPi(cam.pOffLon + dLon);
      cam.pOffLat = clamp(cam.playLat + cam.pOffLat + dLat, -MAX_LAT, MAX_LAT) - cam.playLat;
      return;
    }
    const lat = clamp(vecLat(cam.dir) + dLat, -MAX_LAT, MAX_LAT);
    latLonVec(lat, vecLon(cam.dir) + dLon, cam.dir);
  }

  /** Radius of the Earth on screen, in CSS px, at the current distance. */
  function earthRadiusPx() {
    const a = Math.asin(1 / Math.max(1.0001, cam.dist));
    return (Math.tan(a) / Math.tan((FOV / 2) * RAD)) * (M.H / 2);
  }

  /** CSS px per degree of the surface at the point nearest a camera at distance d (the place, when framed). */
  function pxPerDeg(d) {
    return (RAD / Math.max(0.05, d - 1) / Math.tan((FOV / 2) * RAD)) * (M.H / 2);
  }
  /** Screen (device) pixels one texel of an equirectangular map `width` px wide covers there. */
  function pxPerTexel(d, width) {
    return (pxPerDeg(d) * drawRatio()) / (width / 360);
  }

  // ------------------------------------------------------------ data drape
  /**
   * A NASA frame as a texture. Decoded off the main thread with createImageBitmap where the
   * browser has it (flipped there, since WebGL does not flip bitmaps), then uploaded to the GPU
   * at once (renderer.initTexture), so a Play step can crossfade to it without a hitch.
   */
  async function decodeFrame(url) {
    if (typeof createImageBitmap === "function") {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const bmp = await createImageBitmap(await res.blob(), { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
        const tex = new THREE.Texture(bmp);
        tex.flipY = false;
        tex.needsUpdate = true;
        return tex;
      } catch {
        /* fall back to the image loader */
      }
    }
    return loader.loadAsync(url).catch(() => null);
  }

  function getTexture(url) {
    let e = texCache.get(url);
    if (!e) {
      e = { tex: null, used: now(), bytes: 0, promise: null };
      e.promise = decodeFrame(url).then((tex) => {
        if (!tex) return null;
        if (disposed || !texCache.has(url)) { freeTexture(tex); return null; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = anisotropy;
        tex.wrapS = THREE.RepeatWrapping; // the frame wraps around in longitude (bicubic taps cross the seam)
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        const w = tex.image?.width || 1;
        const h = tex.image?.height || 1;
        e.bytes = w * h * 4 * 1.34;
        e.tex = tex;
        e.used = now(); // just decoded: the most recently used, and never the one evicted for itself
        try { renderer.initTexture(tex); } catch { /* uploaded on first use instead */ }
        evict(url);
        return tex;
      });
      texCache.set(url, e);
    }
    e.used = now();
    evict();
    return e.promise;
  }

  function freeTexture(tex) {
    if (!tex) return;
    tex.dispose();
    tex.image?.close?.(); // an ImageBitmap holds decoded pixels until closed
  }

  /** Release the least recently used frames beyond the byte budget, never the ones on screen or queued (nor `fresh`, being handed out). */
  function evict(fresh = null) {
    let total = 0;
    for (const e of texCache.values()) total += e.bytes;
    for (const m of masks.values()) total += m.bytes; // the land masks share the budget
    const budget = texBudget();
    if (total <= budget) return;
    const keep = new Set([data.aUrl, data.bUrl, data.want, fresh, ...data.keep]);
    const onScreen = [earthUniforms.uDataA.value, earthUniforms.uDataB.value];
    const list = [...texCache.entries()].filter(([u, e]) => !keep.has(u) && e.tex && !onScreen.includes(e.tex)).sort((a, b) => a[1].used - b[1].used);
    while (total > budget && list.length) {
      const [u, e] = list.shift();
      total -= e.bytes;
      freeTexture(e.tex);
      texCache.delete(u);
    }
  }

  function texOf(url) { return texCache.get(url)?.tex || null; }

  function sizeOf(tex) {
    return [tex?.image?.width || 1, tex?.image?.height || 1];
  }

  function requestData(url, fadeMs, rec) {
    if (!url) return;
    data.want = url;
    getTexture(url).then((tex) => {
      if (!tex || disposed || data.want !== url || texOf(url) !== tex) return; // texOf: still cached, not freed
      showData(url, tex, fadeMs, rec);
      kick();
    });
  }

  const hdNow = () => !lowMemory;

  /**
   * Show the frame of a date: the 2048 px picture when it is ready (it usually is during Play,
   * decoded ahead), else the small one at once and the HD one as soon as it arrives, with a short
   * crossfade (the same picture, only sharper). Small devices keep the small one while playing.
   */
  function showFrame(frame, fadeMs) {
    // Nothing is loaded before a place is flown to: the overview shows only the Blue Marble.
    if (!frame?.display || !data.on) return;
    const token = data.token;
    const rec = frameRec;
    // A record with a land mask shows its frame only once its mask is in (or has failed), so a
    // coast is never drawn with the wrong side filled, not even for one frame.
    loadMask(rec);
    const m = maskOf(rec);
    if (m && !m.tex && !m.failed) {
      m.promise.then(() => { if (!disposed && token === data.token && frameRec === rec) showFrame(frame, fadeMs); });
      return;
    }
    if (lowMemory) {
      // Small devices: the small frame while playing, the HD one once the date is still (scheduleHd).
      const hd = !playing && frame.displayHd && texOf(frame.displayHd);
      if (hd) { data.want = frame.displayHd; showData(frame.displayHd, hd, fadeMs, rec); kick(); return; }
      requestData(frame.display, fadeMs, rec);
      return;
    }
    // Best first: 4096 px (when the device can take it), 2048 px, 1024 px. The framing in use needs
    // only the smallest one whose texels stay at or under about a screen pixel at the place (the
    // close arrival on a desktop: 4096; the whole Earth while Play runs: usually 2048).
    const tiers = frameTiers(frame);
    const top = tierFor(tiers);
    const state = { rank: Infinity };
    const ready = tiers.findIndex((u) => texOf(u));
    if (ready >= 0) {
      state.rank = ready;
      data.want = tiers[ready];
      // Already crossfading in (a stop during a step's crossfade): let it finish.
      if (!(data.fade && tiers[ready] === data.bUrl)) showData(tiers[ready], texOf(tiers[ready]), fadeMs, rec);
      kick();
    }
    // Ask for the better tiers up to the one needed (and the small one if nothing is ready yet);
    // each one that arrives replaces a lesser one of the same date with a short crossfade (the same
    // picture, sharper). A better tier already decoded is shown as it is. The tiers between the small
    // one and the one needed are skipped: one decode and one upload fewer in every flight.
    for (let r = (ready >= 0 ? ready : tiers.length) - 1; r >= top; r--) {
      if (r !== top && r !== tiers.length - 1) continue;
      const url = tiers[r];
      getTexture(url).then((tex) => {
        if (!tex || disposed || token !== data.token || r >= state.rank || texOf(url) !== tex) return;
        const upgrade = state.rank !== Infinity;
        state.rank = r;
        data.want = url;
        showData(url, tex, upgrade ? HD_UPGRADE_MS : fadeMs, rec);
        kick();
      });
    }
  }

  /**
   * The frame width the framing in use needs: the smallest of 1024, 2048 and 4096 px whose texel
   * covers at most MAG_MAX screen pixels at the place (arrived close, or the whole Earth while
   * Play runs), from the stage size and the pixel ratio.
   */
  function neededWidth(play = playView()) {
    let d;
    if (play) {
      const pd = playDistOf(placeOf(selectedId));
      d = clamp(pd * cam.pz, Math.min(nearDist(), pd), Math.max(farDist(), pd));
    } else d = clamp(cam.zd || M.focus, nearDist(), farDist());
    if (pxPerTexel(d, 1024) <= MAG_MAX) return 1024;
    if (pxPerTexel(d, 2048) <= MAG_MAX) return 2048;
    return 4096;
  }

  /** A frame's pictures, best first (4096 px when the device can take it, 2048, 1024), with their widths. */
  function frameTiers(frame) {
    const urls = [];
    const widths = [];
    if (uhdOk && frame.displayUhd) { urls.push(frame.displayUhd); widths.push(4096); }
    if (frame.displayHd) { urls.push(frame.displayHd); widths.push(2048); }
    urls.push(frame.display);
    widths.push(1024);
    urls.widths = widths;
    return urls;
  }

  /** Index of the smallest tier the framing in use needs (the best one there is when none is enough). */
  function tierFor(tiers, play = playView()) {
    const need = neededWidth(play);
    data.need = need;
    let top = 0;
    tiers.widths.forEach((w, i) => { if (w >= need) top = i; });
    return top;
  }

  /** URL of a record's image for a date: key "display", "display_hd" or "display_uhd". */
  function recordUrl(meta, key, date) {
    const tpl = meta?.[key];
    if (!tpl || typeof tpl !== "string") return null;
    return (meta.__base || "") + tpl.replace("{date}", date);
  }

  /**
   * Decode the frames of the next dates ahead (and drop the protection of older ones), at the tier
   * the framing in use needs, so a Play step finds its frame decoded and on the GPU. Small devices
   * decode ahead only while Play runs, at the 1024 px size they play.
   */
  function prefetchAhead() {
    data.keep.clear();
    data.prefetchLater = false;
    if (!data.on || !record || !frameInfo) return;
    // During a flight that is not Play, the date's own frame comes first: the next dates are decoded
    // once the camera has arrived (arrive()), so their uploads do not land in the flight.
    if (cam.flight && !playing) { data.prefetchLater = true; return; }
    const dates = Array.isArray(record.dates) ? record.dates : [];
    const i = dates.indexOf(frameInfo.date);
    if (i < 0) return;
    let key = "display";
    let n = PREFETCH_SMALL;
    if (lowMemory) {
      if (!playing) return;
    } else {
      const keys = [];
      const widths = [];
      if (uhdOk && record.display_uhd) { keys.push("display_uhd"); widths.push(4096); }
      if (record.display_hd) { keys.push("display_hd"); widths.push(2048); }
      keys.push("display");
      widths.push(1024);
      // At the tier Play needs, also while arrived: the dates ahead are most often seen in Play (a
      // date step while arrived shows that tier at once, then upgrades with the usual crossfade).
      const need = neededWidth(true);
      let top = 0;
      widths.forEach((w, j) => { if (w >= need) top = j; });
      key = keys[top];
      n = widths[top] >= 4096 ? PREFETCH_UHD : PREFETCH;
    }
    for (let k = 1; k <= n && dates.length > 1; k++) {
      const url = recordUrl(record, key, dates[(i + k) % dates.length]);
      if (!url) continue;
      data.keep.add(url);
      getTexture(url);
    }
  }

  /** URL of a record's land mask (meta.land_mask, relative to its meta.json), or null. */
  function maskUrl(meta) {
    return meta?.land_mask && typeof meta.land_mask === "string" ? (meta.__base || "") + meta.land_mask : null;
  }
  function maskOf(meta) {
    const url = maskUrl(meta);
    return url ? masks.get(url) || null : null;
  }

  /**
   * Load a record's land mask. It tells the drape which side of the coast holds the record's data:
   * ocean records fill land with a light gray, land records show the real ocean. Kept on the GPU as
   * one channel (a quarter of an RGBA frame); the masks in use and the last other one stay, so a
   * record change back and forth does not reload them.
   */
  function loadMask(meta) {
    const url = maskUrl(meta);
    if (!url) return;
    let m = masks.get(url);
    if (!m) {
      m = { tex: null, failed: false, bytes: 0, used: now(), promise: null };
      masks.set(url, m);
      m.promise = loader.loadAsync(url).then((tex) => {
        if (disposed || masks.get(url) !== m) { tex.dispose(); return; }
        tex.format = THREE.RedFormat;
        tex.colorSpace = THREE.NoColorSpace;
        tex.anisotropy = anisotropy;
        tex.wrapS = THREE.RepeatWrapping;
        m.bytes = (tex.image?.width || 1) * (tex.image?.height || 1) * 1.34;
        m.tex = tex;
        try { renderer.initTexture(tex); } catch { /* uploaded on first use instead */ }
        evict();
        kick();
      }).catch(() => { m.failed = true; /* no mask: the frame shows as it is */ });
    }
    m.used = now();
    const inUse = new Set([url, maskUrl(slotRec.a), maskUrl(slotRec.b), maskUrl(frameRec)]);
    const spare = [...masks.entries()].filter(([u]) => !inUse.has(u)).sort((a, b) => b[1].used - a[1].used);
    for (const [u, e] of spare.slice(lowMemory ? 0 : 1)) { e.tex?.dispose(); masks.delete(u); }
  }

  /** The compositing a drape slot's record gets (reported by view.info()). */
  /**
   * The record's color for a position on its scale (sRGB, 0 to 1): the meta's colorbar_strip (the bare
   * gradient, read once per record into 1024 RGBA values), else the shared fire ramp (ramp.js; the
   * fire record has no strip).
   */
  const strips = new Map(); // url -> Uint8ClampedArray | null (failed) | undefined (loading)
  function loadStrip(meta) {
    const url = meta?.colorbar_strip && typeof meta.colorbar_strip === "string" ? (meta.__base || "") + meta.colorbar_strip : null;
    if (!url || strips.has(url)) return;
    strips.set(url, undefined);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || 1;
        c.height = 1;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, Math.floor((img.naturalHeight || 1) / 2), c.width, 1, 0, 0, c.width, 1); // the strip's middle row
        strips.set(url, g.getImageData(0, 0, c.width, 1).data);
      } catch { strips.set(url, null); }
    };
    img.onerror = () => strips.set(url, null);
    img.src = url;
  }
  function scaleColor(meta, v) {
    const url = meta?.colorbar_strip ? (meta.__base || "") + meta.colorbar_strip : null;
    const px = url ? strips.get(url) : null;
    if (px && px.length >= 4) {
      const n = px.length / 4;
      const o = Math.round(clamp(v, 0, 1) * (n - 1)) * 4;
      return [px[o] / 255, px[o + 1] / 255, px[o + 2] / 255];
    }
    return fireRamp(v).rgb;
  }

  /** A Play step's value on the record: its groove keeps the value's color, the effect follows the value. */
  function recordStep(v01) {
    if (!playing || !record || !frameInfo || !Number.isFinite(+frameInfo.index)) return;
    const i = +frameInfo.index;
    if (marks.resume) {
      marks.resume = false;
      if (i < marks.last) vinyl.clearMarks?.(); // not a resume: the Play started before the last date marked
    }
    marks.place = selectedId;
    marks.rec = record;
    marks.last = i;
    const kind = record.surface === "ocean" ? "ripples" : "embers";
    if (v01 == null || !Number.isFinite(+v01)) {
      vinyl.mark?.(i, null);
      vinyl.setEffect?.(kind, 0);
    } else {
      // The linear single-cell value (no curve): its physical value sets the effect's level.
      const v = clamp(+v01, 0, 1);
      const sc = record.scale || {};
      const max = Number.isFinite(+sc.max) ? +sc.max : 1;
      const min = Number.isFinite(+sc.min) ? +sc.min : 0;
      const value = min + v * (max - min);
      if (kind === "ripples") {
        const rgb = scaleColor(record, v);
        const level = clamp((Math.abs(value) - FX_SEA_FROM) / FX_SEA_SPAN, 0, 1);
        vinyl.mark?.(i, rgb); // the sea record's groove: the strip's color, full strength
        vinyl.setEffect?.(kind, level, rgb);
      } else {
        // The fire record: the project's one ramp (no color at zero, nearly neutral under about 1
        // percent), with how much (strength) and how long the groove keeps burning (burn: the
        // effect's level; setEffect(null) at the end of Play lets it die down).
        const { rgb, strength } = fireRamp(max > 0 ? Math.max(0, value) / max : 0);
        const level = value > FX_FIRE_FROM ? Math.pow(clamp((value - FX_FIRE_FROM) / (FX_FIRE_TOP - FX_FIRE_FROM), 0, 1), FX_FIRE_EXP) : 0;
        vinyl.mark?.(i, rgb, { strength, burn: level });
        vinyl.setEffect?.(kind, level, rgb);
      }
    }
    kick();
  }

  function compositeOf(meta) {
    if (!maskOf(meta)?.tex) return "frame";
    return meta.surface === "land" ? "frame-on-land+real-ocean" : "frame-on-ocean+gray-land";
  }

  function showData(url, tex, fadeMs, rec = null) {
    if (data.fade) {
      // A new date arrived mid-fade: settle on the incoming one first.
      slotRec.a = slotRec.b;
      data.aUrl = data.bUrl;
      earthUniforms.uDataA.value = earthUniforms.uDataB.value;
      earthUniforms.uSizeA.value.copy(earthUniforms.uSizeB.value);
      earthUniforms.uMix.value = 0;
      data.fade = null;
    }
    if (url === data.aUrl) return;
    if (!data.aUrl || fadeMs <= 0 || data.amount < 0.01) {
      slotRec.a = rec;
      data.aUrl = url;
      earthUniforms.uDataA.value = tex;
      earthUniforms.uSizeA.value.set(...sizeOf(tex));
      earthUniforms.uMix.value = 0;
      return;
    }
    slotRec.b = rec;
    data.bUrl = url;
    earthUniforms.uDataB.value = tex;
    earthUniforms.uSizeB.value.set(...sizeOf(tex));
    earthUniforms.uMix.value = 0;
    data.fade = { t0: now(), dur: fadeMs };
  }

  function scheduleHd() {
    clearTimeout(data.hdTimer);
    const f = frameInfo;
    const rec = frameRec;
    if (!f?.displayHd || playing || hdNow()) return;
    data.hdTimer = setTimeout(() => {
      if (disposed || frameInfo !== f || playing || !data.on) return;
      requestData(f.displayHd, 250, rec);
    }, HD_DELAY);
  }

  function updateData(t, dt) {
    let moving = false;
    if (data.fade) {
      const s = clamp((t - data.fade.t0) / data.fade.dur, 0, 1);
      earthUniforms.uMix.value = smooth(s);
      if (s >= 1) {
        slotRec.a = slotRec.b;
        data.aUrl = data.bUrl;
        data.bUrl = null;
        earthUniforms.uDataA.value = earthUniforms.uDataB.value;
        earthUniforms.uSizeA.value.copy(earthUniforms.uSizeB.value);
        earthUniforms.uMix.value = 0;
        data.fade = null;
      }
      moving = true;
    }
    const target = data.on && data.aUrl && t >= data.onAt ? 1 : 0;
    if (data.amount !== target) {
      const rate = reducedMotion() ? 1 / 0.15 : 1 / 1.1;
      data.amount = target > data.amount ? Math.min(target, data.amount + dt * rate) : Math.max(target, data.amount - dt * rate);
      moving = true;
    } else if (data.on && data.aUrl && t < data.onAt) moving = true;
    const drapeShown = smooth(data.amount) * distFade(); // the zoom fades the drape out toward the far end
    earthUniforms.uData.value = drapeShown;
    // Each slot gets the land mask of the record it shows (during a record change the two differ).
    const mA = maskOf(slotRec.a)?.tex || null;
    const mB = maskOf(slotRec.b)?.tex || null;
    earthUniforms.uMaskTexA.value = mA || blank;
    earthUniforms.uMaskTexB.value = mB || blank;
    earthUniforms.uMaskA.value = mA ? 1 : 0;
    earthUniforms.uMaskB.value = mB ? 1 : 0;
    earthUniforms.uSurfA.value = slotRec.a?.surface === "land" ? 1 : 0;
    earthUniforms.uSurfB.value = slotRec.b?.surface === "land" ? 1 : 0;
    // The clouds give way to the data.
    const cOp = cloudMap ? 0.92 * (1 - drapeShown) : 0;
    cloudUniforms.uOpacity.value = cOp;
    cloudShell.visible = cOp > 0.002;
    return moving;
  }

  // ------------------------------------------------------------ dots
  function dotStyle(p) {
    const sel = p.id === selectedId;
    // The pointer's hover wins while the pointer is over the picture; otherwise the list's.
    const hov = p.id === (hoveredId || (ptr.inside ? null : listHoverId));
    // Active places: 11 px; places of the other record: the same mark a little smaller, still clearly visible.
    const k = exploreTouch() ? TOUCH_DOT_SCALE : 1; // smaller on a touch layout in Explore (constant on screen at any zoom)
    if (sel) return [12 * k, 1];
    if (p.active === false) return [(hov ? 12 : 10) * k, hov ? 1 : 0.92];
    return [(hov ? 13.5 : 11) * k, 1];
  }

  /** Ocean places: a ring (1); land places: a solid dot (0); + 2 for the place being read (amber). */
  function dotKind(p) {
    return (p.surface === "ocean" ? 1 : 0) + (p.id === selectedId ? 2 : 0);
  }

  function rebuildDots() {
    const n = places.length;
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const alpha = new Float32Array(n);
    const kind = new Float32Array(n);
    places.forEach((p, i) => {
      pos.set([p.pos.x, p.pos.y, p.pos.z], i * 3);
      [size[i], alpha[i]] = dotStyle(p);
      kind[i] = dotKind(p);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    g.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
    dots.geometry = g;
    dotGeo.dispose();
    dotGeo = g;
    placeRing();
  }

  function restyleDots() {
    const size = dotGeo.getAttribute("aSize");
    const alpha = dotGeo.getAttribute("aAlpha");
    if (!size) return;
    const kind = dotGeo.getAttribute("aKind");
    places.forEach((p, i) => { const [s, a] = dotStyle(p); size.setX(i, s); alpha.setX(i, a); kind.setX(i, dotKind(p)); });
    size.needsUpdate = alpha.needsUpdate = kind.needsUpdate = true;
  }

  function placeRing() {
    const p = placeOf(selectedId);
    ring.visible = !!p;
    if (!p) return;
    for (let i = 0; i < 2; i++) ringPos.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
    ringPos.needsUpdate = true;
  }

  function updateRing(t) {
    if (!ring.visible) return false;
    const rm = reducedMotion();
    let moving = false;
    let base = 26 * (exploreTouch() ? TOUCH_DOT_SCALE / 0.75 : 1); // the ring a little smaller in proportion on a touch layout
    let a = power ? 1 : 0.85;
    if (fx.arrive && !rm) {
      const e = (t - fx.arrive) / 650;
      if (e >= 1) fx.arrive = null;
      else { base = 26 + 22 * (1 - smoother(e)); a *= smooth(e * 2.5); moving = true; }
    }
    if (fx.flicker && !rm) {
      const e = (t - fx.flicker) / 420;
      if (e >= 1) fx.flicker = null;
      else { a *= 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(e * TAU * 2)); moving = true; }
    }
    ringSize.setX(0, base);
    ringAlpha.setX(0, a);
    let rs = 0;
    let ra = 0;
    if (fx.ripple && !rm) {
      const e = (t - fx.ripple.t0) / 950;
      if (e >= 1) fx.ripple = null;
      else {
        rs = base + (14 + 52 * fx.ripple.v) * smooth(Math.sqrt(e));
        ra = 0.95 * (1 - e) ** 1.4;
        moving = true;
      }
    }
    ringSize.setX(1, rs);
    ringAlpha.setX(1, ra);
    ringSize.needsUpdate = ringAlpha.needsUpdate = true;
    return moving;
  }

  function arrive() {
    if (data.prefetchLater) prefetchAhead(); // the next dates, now that the flight is over
    if (!playing) wantDayHd(); // the 4096 px Blue Marble, seen close (the fire record's ocean); never uploaded during Play
    if (reducedMotion()) return;
    fx.ripple = { t0: now(), v: 0.5 };
  }

  // ------------------------------------------------------------ picking
  const tmpV = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpS = { x: 0, y: 0 };
  /** Screen position (CSS px) of a place, or null on the far side; out is reused when given. */
  function screenOf(p, out = { x: 0, y: 0 }) {
    tmpV.copy(p.pos).applyMatrix4(earthGroup.matrixWorld);
    tmpN.copy(tmpV).normalize();
    const toCam = tmpC.copy(camera.position).sub(tmpV).normalize();
    if (tmpN.dot(toCam) < 0.08) return null; // far side or on the limb
    tmpV.project(camera);
    out.x = ((tmpV.x + 1) / 2) * M.W;
    out.y = ((1 - tmpV.y) / 2) * M.H;
    return out;
  }

  function hitTest(x, y) {
    // The globe may have turned since the last frame (auto turn, inertia, flight): use the dot
    // positions of this instant. (Called every frame while a mouse is over the globe: no allocation
    // unless a dot is hit.)
    earthGroup.updateMatrixWorld();
    camera.updateMatrixWorld();
    let best = null;
    let bestD = Infinity;
    for (const p of places) {
      const s = screenOf(p, tmpS);
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      const r = Math.max(hitR, dotStyle(p)[0] / 2 + 6);
      if (d <= r && d < bestD) { best = { id: p.id, x: s.x, y: s.y }; bestD = d; }
    }
    return best;
  }

  function updateHover() {
    if (!ptr.inside || ptr.drag?.active || ptr.scratch) return;
    const h = hitTest(ptr.x, ptr.y);
    const id = h?.id || null;
    if (id !== hoveredId) {
      hoveredId = id;
      restyleDots();
      canvas.style.cursor = id ? "pointer" : "grab";
      try { onHover(id, id ? { x: h.x, y: h.y } : null); } catch {}
    }
  }

  function localXY(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.pointerType === "touch") touches.set(e.pointerId, localXY(e));
    if (e.pointerType === "touch" && exploreTouch() && touches.size === 2 && !ptr.pinch) { startPinch(); return; }
    if (ptr.pinch) return; // a third finger: ignored
    if (ptr.drag && ptr.drag.id !== e.pointerId) {
      // A second finger: a pinch, which belongs to the page's zoom. Drop the drag (no click, no
      // fling) and ignore the fingers until they are lifted.
      const d = ptr.drag;
      ptr.drag = null;
      try { canvas.releasePointerCapture(d.id); } catch {}
      cam.vLon = cam.vLat = 0;
      cam.lastInteract = now();
      canvas.style.cursor = "grab";
      kick();
      return;
    }
    if (ptr.scratch) { if (ptr.scratch.id !== e.pointerId) endScratch(); return; } // a second finger cancels a scratch
    const { x, y } = localXY(e);
    // During Play a press on the visible record scratches it (the picture's camera, Earth and clock
    // are untouched); anywhere else, or when Play is not running, the press is a drag as before.
    const a = playing ? recordAngleAt(x, y, true) : null;
    if (a != null) {
      ptr.scratch = { id: e.pointerId, last: a, acc: 0, t: now(), vel: 0, still: 0 };
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      canvas.style.cursor = "grabbing";
      noteTouch();
      reportScratch(true, 0);
      return;
    }
    // free: a finger that starts on the Earth (Explore on touch) turns it on both axes, as the mouse does.
    ptr.drag = { id: e.pointerId, type: e.pointerType, x0: x, y0: y, x, y, t: now(), travel: 0, active: false, hit: hitTest(x, y), free: e.pointerType === "touch" && exploreTouch() && onEarth(x, y) };
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    if (e.pointerType === "mouse") e.preventDefault();
    cam.vLon = cam.vLat = 0;
    cam.home = null; // a press takes the camera back from the way home
    cam.lastInteract = now(); // a hold stops the overview clock
    lastInputAt = cam.lastInteract;
    noteTouch();
    kick();
  }

  /** Any pointer, wheel or touch activity over the picture: restarts the idle wait, cancels an idle swing home. */
  function noteTouch() {
    cam.lastTouch = now();
    if (cam.home?.idle) { cam.home = null; kick(); }
  }
  /**
   * The wheel over the planet (its disc plus a margin) zooms the Earth and is consumed; anywhere else
   * the page scrolls. Ctrl + wheel (page zoom, trackpad pinch) stays the browser's.
   */
  function onWheel(e) {
    noteTouch();
    lastInputAt = now();
    if (e.ctrlKey || !cam.placed) return;
    const { x, y } = localXY(e);
    earthGroup.updateMatrixWorld();
    tmpV.set(0, 0, 0).project(camera);
    const ex = ((tmpV.x + 1) / 2) * M.W, ey = ((1 - tmpV.y) / 2) * M.H;
    const R = earthRadiusPx();
    if (Math.hypot(x - ex, y - ey) > R + Math.max(R * ZOOM_ZONE, ZOOM_ZONE_MIN)) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * M.H : e.deltaY;
    zoomNotches(clamp(dy, -400, 400) / 100);
  }

  function onPointerMove(e) {
    noteTouch();
    if (e.pointerType === "touch" && touches.has(e.pointerId)) touches.set(e.pointerId, localXY(e));
    if (ptr.pinch) { if (ptr.pinch.ids.includes(e.pointerId)) movePinch(); return; }
    if (ptr.drag || ptr.scratch) lastInputAt = now();
    if (ptr.scratch && ptr.scratch.id === e.pointerId) { moveScratch(e); return; }
    const { x, y } = localXY(e);
    ptr.x = x;
    ptr.y = y;
    if (!ptr.inside && listHoverId) { ptr.inside = true; restyleDots(); kick(); } // the pointer takes over from the list
    ptr.inside = true;
    const d = ptr.drag;
    if (!d || d.id !== e.pointerId) {
      updateHover();
      return;
    }
    const dx = x - d.x;
    const dy = d.type === "touch" && !d.free ? 0 : y - d.y; // touch off the Earth: vertical swipes belong to the page
    d.travel += Math.hypot(x - d.x, y - d.y);
    const t = now();
    const dtm = Math.max(1, t - d.t);
    d.x = x;
    d.y = y;
    d.t = t;
    if (!d.active && d.travel > CLICK_SLOP) {
      d.active = true;
      canvas.style.cursor = "grabbing";
      if (hoveredId) { hoveredId = null; restyleDots(); try { onHover(null, null); } catch {} }
      // Dragging out of a place: back to the overview. While Play runs the place is kept: the drag
      // turns the view while held and the Play framing comes back after release.
      // (A drag at a place turns the Earth under the camera at the current zoom: the data stays.)
      if (cam.flight) { cam.flight = null; cam.prev = null; } // the user takes over
      cam.touched = true;
    }
    if (!d.active) return;
    const rpx = Math.max(60, earthRadiusPx());
    const lat = vecLat(cam.dir);
    const dLon = -dx / rpx / Math.max(0.35, Math.cos(lat));
    const dLat = dy / rpx;
    turnBy(dLon, dLat);
    // Velocity for inertia, smoothed.
    cam.vLon = cam.vLon * 0.6 + ((dLon * 1000) / dtm) * 0.4;
    cam.vLat = cam.vLat * 0.6 + ((dLat * 1000) / dtm) * 0.4;
    cam.lastInteract = t;
    kick();
  }

  // ------------------------------------------------------------ the scratch
  const scrV = new THREE.Vector3();
  const scrD = new THREE.Vector3();
  /**
   * The angle (rad, in the record's own plane: x to the March equinox) of the point of the record
   * under the pointer, or null when the pointer is not on the visible record: the ray must meet the
   * record's plane between its inner and outer edge, away from the planet's disc on screen (plus the
   * wheel zone's margin, so the zoom and the dots keep working), on a record that is showing, and
   * not on a place dot. strict false: only the plane and the angle (a scratch under way).
   */
  function recordAngleAt(x, y, strict) {
    if (!vinyl.innerRadius) return null;
    camera.updateMatrixWorld();
    scrV.set((x / M.W) * 2 - 1, 1 - (y / M.H) * 2, 0.5).unproject(camera);
    scrD.copy(scrV).sub(camera.position).normalize();
    const dn = scrD.dot(eclZ);
    if (Math.abs(dn) < 1e-4) return null;
    const tHit = -camera.position.dot(eclZ) / dn;
    if (tHit <= 0) return null;
    scrV.copy(camera.position).addScaledVector(scrD, tHit);
    const lx = scrV.dot(eclX), ly = scrV.dot(eclY);
    if (strict) {
      const r = Math.hypot(lx, ly);
      if (r < vinyl.innerRadius || r > vinyl.outerRadius) return null;
      const ri = vinyl.info();
      if (!(ri.presence > SCRATCH_MIN_SHOW) || !(ri.open > SCRATCH_MIN_SHOW)) return null;
      earthGroup.updateMatrixWorld();
      tmpV.set(0, 0, 0).project(camera);
      const ex = ((tmpV.x + 1) / 2) * M.W, ey = ((1 - tmpV.y) / 2) * M.H;
      const R = earthRadiusPx();
      if (Math.hypot(x - ex, y - ey) <= R + Math.max(R * ZOOM_ZONE, ZOOM_ZONE_MIN)) return null;
      if (hitTest(x, y)) return null;
    }
    return Math.atan2(ly, lx);
  }

  const scratchDiag = { active: false, velocity: 0, calls: 0, maxAbs: 0 };
  /** The view's report of a scratch (onScratch), also kept for info(). */
  function reportScratch(active, velocity) {
    scratchDiag.active = active;
    scratchDiag.velocity = +velocity.toFixed(3);
    scratchDiag.calls++;
    scratchDiag.maxAbs = Math.max(scratchDiag.maxAbs, Math.abs(velocity));
    try { onScratch({ active, velocity }); } catch { /* the sound is a nicety: never let it break the picture */ }
  }
  /** Diagnostics: a screen point (CSS px) where a press would scratch the record now, or null. */
  function scratchPoint() {
    earthGroup.updateMatrixWorld();
    tmpV.set(0, 0, 0).project(camera);
    const ex = ((tmpV.x + 1) / 2) * M.W, ey = ((1 - tmpV.y) / 2) * M.H, R = earthRadiusPx();
    for (const f of [1.7, 1.5, 1.9, 1.3, 2.1]) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU;
        const x = ex + Math.cos(a) * R * f, y = ey + Math.sin(a) * R * f;
        if (x < 4 || y < 4 || x > M.W - 4 || y > M.H - 4) continue;
        if (recordAngleAt(x, y, true) != null) return [Math.round(x), Math.round(y)];
      }
    }
    return null;
  }

  let scratchStillTimer = 0;
  function moveScratch(e) {
    const sc = ptr.scratch;
    const { x, y } = localXY(e);
    const a = recordAngleAt(x, y, false);
    if (a == null) return; // edge on for a moment: keep the last angle
    const t = now();
    const d = wrapPi(a - sc.last);
    sc.last = a;
    sc.acc += d;
    const dt = Math.max(1, t - sc.t) / 1000;
    sc.t = t;
    sc.vel = sc.vel * 0.5 + (d / dt) * 0.5; // smoothed over a few events
    vinyl.setSpin?.(sc.acc); // the print follows the hand (direct manipulation, also with reduced motion)
    kick();
    reportScratch(true, sc.vel);
    clearTimeout(scratchStillTimer);
    scratchStillTimer = setTimeout(() => {
      if (ptr.scratch !== sc) return;
      sc.vel = 0;
      reportScratch(true, 0);
    }, SCRATCH_STILL_MS);
  }

  /** The scratch ends (release, cancel, a second finger, Play stopping): the print springs back. */
  function endScratch() {
    const sc = ptr.scratch;
    if (!sc) return;
    ptr.scratch = null;
    clearTimeout(scratchStillTimer);
    try { canvas.releasePointerCapture(sc.id); } catch {}
    canvas.style.cursor = hoveredId ? "pointer" : "grab";
    vinyl.setSpin?.(0, { ms: SCRATCH_RETURN_MS }); // reduced motion: at once (setSpin)
    kick();
    reportScratch(false, 0);
  }
  // Touch: a finger that lands on the record during Play scratches it, so the page must not scroll
  // for that touch (touch-action is decided at touchstart; pointer events cannot cancel it).
  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const r = canvas.getBoundingClientRect();
    const tch = e.touches[0];
    const x = tch.clientX - r.left, y = tch.clientY - r.top;
    if (playing && recordAngleAt(x, y, true) != null) { e.preventDefault(); return; } // the scratch
    // Explore on touch: a finger that starts on the Earth turns it freely, so the page must not scroll
    // for that gesture (touch-action is decided here; the pointer events keep coming).
    if (exploreTouch() && onEarth(x, y)) e.preventDefault();
  }
  /** On the Earth's disc on screen (its projected radius plus TOUCH_EARTH_MARGIN), CSS px. */
  function onEarth(x, y) {
    earthGroup.updateMatrixWorld();
    camera.updateMatrixWorld();
    tmpV.set(0, 0, 0).project(camera);
    const ex = ((tmpV.x + 1) / 2) * M.W, ey = ((1 - tmpV.y) / 2) * M.H;
    return Math.hypot(x - ex, y - ey) <= earthRadiusPx() + TOUCH_EARTH_MARGIN;
  }
  function onTouchMove(e) {
    if (ptr.scratch || ptr.pinch || (e.touches.length >= 2 && exploreTouch())) e.preventDefault();
  }

  function endDrag(e, cancelled) {
    const d = ptr.drag;
    if (!d || d.id !== e.pointerId) return;
    ptr.drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    cam.lastInteract = now();
    if (!d.active) {
      cam.vLon = cam.vLat = 0;
      if (!cancelled && !d.noClick) {
        // The dot under the pointer now, or the one under it when it was pressed (the globe
        // keeps turning between press and release).
        const h = hitTest(d.x, d.y) || d.hit;
        if (h) {
          pickRefocus = h.id; // a dot click is an explicit choice: fly in, even to the same place
          try { onPick(h.id); } catch (err) { console.error(err); }
          setTimeout(() => { if (pickRefocus === h.id) pickRefocus = null; }, 1000);
        }
      }
    } else if (cancelled || now() - d.t > 120 || reducedMotion()) {
      cam.vLon = cam.vLat = 0; // the pointer rested before letting go, or the browser took the gesture over
    }
    canvas.style.cursor = hoveredId ? "pointer" : "grab";
    kick();
  }

  const onUp = (e) => { if (endPinchFor(e)) return; if (ptr.scratch && ptr.scratch.id === e.pointerId) endScratch(); else endDrag(e, false); };
  const onCancel = (e) => { if (endPinchFor(e)) return; if (ptr.scratch && ptr.scratch.id === e.pointerId) endScratch(); else endDrag(e, true); };

  // ------------------------------------------------------------ pinch (Explore on a touch layout)
  // Two fingers on the picture zoom the Earth with the wheel's model (zoomNotches: the same limits and
  // the same fade to the real map at the far end); the ratio of their distance from one move to the
  // next is the zoom step. No drag, scratch or dot click meanwhile; when one finger lifts, the other
  // carries on as a fresh drag from where it is (no jump) that never counts as a click.
  const touches = new Map(); // touch pointer id -> its last position (CSS px)
  function pinchDist() {
    const [a, b] = ptr.pinch.ids.map((id) => touches.get(id));
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
  function startPinch() {
    if (ptr.scratch) endScratch();
    if (ptr.drag) { try { canvas.releasePointerCapture(ptr.drag.id); } catch {} ptr.drag = null; }
    cam.vLon = cam.vLat = 0;
    ptr.pinch = { ids: [...touches.keys()].slice(0, 2), dist: 0 };
    for (const id of ptr.pinch.ids) { try { canvas.setPointerCapture(id); } catch {} }
    ptr.pinch.dist = pinchDist();
    lastInputAt = now();
    noteTouch();
    kick();
  }
  function movePinch() {
    const d = pinchDist();
    const pd = ptr.pinch.dist;
    if (d > 4 && pd > 4) zoomNotches(Math.log(pd / d) / Math.log(ZOOM_PER_NOTCH)); // fingers apart: closer
    ptr.pinch.dist = d;
    lastInputAt = now();
  }
  function endPinchFor(e) {
    if (e.pointerType === "touch") {
      const was = touches.has(e.pointerId);
      touches.delete(e.pointerId);
      if (!ptr.pinch) return false;
      if (!was || !ptr.pinch.ids.includes(e.pointerId)) return true;
      const other = ptr.pinch.ids.find((id) => id !== e.pointerId);
      ptr.pinch = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
      const pos = touches.get(other);
      if (pos) ptr.drag = { id: other, type: "touch", x0: pos.x, y0: pos.y, x: pos.x, y: pos.y, t: now(), travel: 0, active: false, hit: null, noClick: true };
      cam.lastInteract = now();
      kick();
      return true;
    }
    return false;
  }
  function onLeave() {
    ptr.inside = false;
    if (hoveredId && !ptr.drag) {
      hoveredId = null;
      restyleDots();
      canvas.style.cursor = "grab";
      try { onHover(null, null); } catch {}
    }
    if (listHoverId) { restyleDots(); kick(); } // the list's hover shows again
  }
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onCancel);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  // ------------------------------------------------------------ record update
  const stylusW = new THREE.Vector3();
  const stylusL = new THREE.Vector3();
  let presenceTarget = -1;
  let labelFacing = false; // the record's print is turned to face the camera (the overview)
  function updateOrbit() {
    // In the overview (not flying) the record turns its print so BLUE MARBLE RECORDS reads upright
    // for this camera: the azimuth of the camera's projection on the record's plane, in the
    // record's frame (x to the March equinox, as setSun). Leaving the overview freezes it.
    if (mode === "overview" && !cam.flight) {
      vinyl.setLabelFacing?.(Math.atan2(camera.position.dot(eclY), camera.position.dot(eclX)));
      labelFacing = true;
    } else if (labelFacing) {
      vinyl.setLabelFacing?.(null);
      labelFacing = false;
    }
    // The record: the Sun's direction (for the Earth's shadow and the sheen), the stylus from the
    // selected place (in the ecliptic frame, for the instant shown), and how present the disc is:
    // fully in the overview and while Play runs, quiet in the arrival close-up (the data first).
    // The stylus shows only once a place is arrived at, or while Play runs; never in the overview.
    vinyl.setSun(sunLonRad);
    const reading = mode === "focus" && !cam.flight; // arrived (Play keeps the camera arrived)
    const p = ring.visible && reading ? placeOf(selectedId) : null;
    if (p) {
      stylusW.copy(p.pos).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, time.theta);
      vinyl.setStylus(stylusL.set(stylusW.dot(eclX), stylusW.dot(eclY), stylusW.dot(eclZ)));
    } else vinyl.setStylus(null);
    const presence = mode === "focus" && !playView() ? 0.4 : 1;
    if (presence !== presenceTarget) {
      vinyl.setPresence(presence, { ms: presenceTarget < 0 ? 0 : 1100 });
      presenceTarget = presence;
    }
  }

  // ------------------------------------------------------------ render loop
  function frame() {
    raf = 0;
    if (!visible()) return;
    // Motion at most about 60 frames a second, also on 120 and 144 Hz screens.
    if (!forceNext && now() - lastFrameAt < MIN_FRAME_MS) { raf = requestAnimationFrame(frame); return; }
    forceNext = false;
    const t = now(); // one clock for the loop and for every animation start time
    lastFrameAt = t;
    const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
    last = t;
    let moving = false;
    if (M.dirty || t - M.checked > METRICS_POLL_MS) readMetrics();
    if (easeCenter(dt)) moving = true;
    if (!cam.placed) { cam.dist = M.overview; cam.placed = true; }
    if (!cam.entered) {
      // The first time the globe is seen: one entrance from far out (none with reduced motion,
      // none if a place has already been flown to).
      cam.entered = true;
      if (!reducedMotion() && mode === "overview" && !cam.flight) cam.entrance = { t0: t, from: M.overview * 3.6 };
    }
    updateTime(t);
    if (time.tw) moving = true;
    if (updateCamera(t, dt)) moving = true;
    if (updateData(t, dt)) moving = true;
    if (updateRing(t)) moving = true;
    if (skyApi.tick(dt)) moving = true;
    updateOrbit();
    if (vinyl.update(t, camera)) moving = true;
    dotUniforms.uScale.value = drawRatio();
    skyApi.follow(camera, drawRatio());
    updateHover();
    try {
      renderer.clear();
      renderer.render(skyApi.scene, camera);
      const skyCalls = renderer.info.render.calls;
      renderer.clearDepth();
      renderer.render(scene, camera);
      lastCalls = skyCalls + renderer.info.render.calls;
      frameCount++;
      if (gateUp) gateFrames++;
    } catch (err) {
      console.error(err);
      return;
    }
    // Draw again only when something moved (a held pointer that does not move draws nothing:
    // pointer moves kick); the overview clock alone at its capped rate, by a timer; a hold of the
    // clock wakes the loop once, when the clock may resume.
    if (moving && t - lastInputAt < INPUT_FULL_MS) raf = requestAnimationFrame(frame); // the hand on the picture: every frame
    else if (moving) capTimer = setTimeout(() => { capTimer = 0; if (!raf && visible()) raf = requestAnimationFrame(frame); }, Math.max(0, 1000 / MOTION_FPS - 8));
    else if (ovClock) capTimer = setTimeout(() => { capTimer = 0; if (!raf && visible()) raf = requestAnimationFrame(frame); }, Math.max(0, ovFrameMs - 8));
    else if (wakeAt > t) wakeTimer = setTimeout(() => { wakeTimer = 0; kick(); }, wakeAt - t + 5);
  }

  function resize() {
    if (disposed) return;
    const W = host.clientWidth;
    const H = host.clientHeight;
    if (!W || !H) return;
    renderer.setPixelRatio(drawRatio());
    renderer.setSize(W, H, false);
    M.W = 0; // force the projection update
    readMetrics();
    applyCenter();
    if (!cam.placed) {
      cam.dist = mode === "focus" ? M.focus : M.overview;
      cam.placed = true;
    }
    // The magnification follows the stage size and the pixel ratio: a high-density overview wants
    // the 4096 px Blue Marble at once, and the frame shown may need another tier now.
    if (pxPerTexel(M.overview, dayMap?.image?.width || 2048) > MAG_MAX) wantDayHd();
    if (data.on && frameInfo && !lowMemory && data.need && neededWidth() !== data.need) showFrame(frameInfo, HD_UPGRADE_MS);
    // Resizing clears the drawing buffer: draw again right away so the picture never blinks.
    if (visible()) {
      cancelAnimationFrame(raf);
      raf = 0;
      forceNext = true;
      frame();
    }
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(host);
  // The safe area's size changes (the console opening or closing) mark the metrics dirty; they are
  // read then, and otherwise only every METRICS_POLL_MS (each read can force a layout).
  const safeEl = document.getElementById("stage-safe");
  const roSafe = safeEl ? new ResizeObserver(() => { M.dirty = true; kick(); }) : null;
  roSafe?.observe(safeEl);
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) kick(); });
  // The gate lifting: drawing starts at once (no event from the page needed).
  const gateMo = new MutationObserver(() => {
    const up = gateCovers() && gateUp;
    if (up !== gateUp) { gateUp = up; if (!up) kick(); }
  });
  gateMo.observe(rootEl, { attributes: true, attributeFilter: ["class"] });
  // Explore on a touch layout: the browser leaves two-finger gestures to the picture (pinch zoom),
  // one finger keeps its rule (sideways turns the globe, up and down scrolls the page), and the dots
  // are drawn smaller. Elsewhere, as before (two fingers zoom the page).
  const applyTouchMode = () => {
    canvas.style.touchAction = exploreTouch() ? "pan-y" : "pan-y pinch-zoom";
    restyleDots();
    kick();
  };
  const bodyMo = document.body ? new MutationObserver(applyTouchMode) : null;
  bodyMo?.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  applyTouchMode();
  io.observe(host);
  const onVis = () => { pageVisible = !document.hidden; if (pageVisible) kick(); };
  document.addEventListener("visibilitychange", onVis);
  const onLost = (e) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); raf = 0; };
  const onRestored = () => { lost = false; time.dirty = true; kick(); };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  // The 4096 px Blue Marble, when published, replaces the 2048 one (not on small or data-saving
  // devices), only once it would be magnified: on the first flight to a place, or at once where
  // the overview itself magnifies the 2048 px map (high-density screens). Until then the 2048 px
  // map is minified on screen and the larger one would look the same.
  let dayHdAsked = false;
  function wantDayHd() {
    if (dayHdAsked || !textureHd || small || saveData || disposed) return;
    dayHdAsked = true;
    load(textureHd).then((t) => {
      if (!t || disposed) return t?.dispose();
      try { renderer.initTexture(t); } catch { /* uploaded on first use instead */ }
      const old = earthUniforms.uDay.value;
      earthUniforms.uDay.value = t;
      if (old && old !== blank) old.dispose();
      kick();
    });
  }

  resize();
  updateTime(now());
  // Link every shader program now (three r170 compiles invisible objects too: the stylus and its
  // tip, the Sun, the Moon), so none links inside a frame of the first arrival or Play.
  try { renderer.compileAsync(scene, camera).catch(() => {}); } catch { /* compiled on first use instead */ }
  try { renderer.compileAsync(skyApi.scene, camera).catch(() => {}); } catch { /* compiled on first use instead */ }

  // ------------------------------------------------------------ interface
  function doSelect(id, fly, refocus = false) {
    const p = placeOf(id);
    if (!p) { pendingSelect = { id, fly, refocus }; selectedId = id; return; }
    pendingSelect = null;
    if (pickRefocus === id) { refocus = true; pickRefocus = null; }
    // Pulled back out of this place by a drag: a select of the same place is a state refresh (a date
    // step, a language change) and must not pull the camera in again; an explicit choice does.
    if (fly && cam.leftPlace && id === selectedId && !refocus && ring.visible) { kick(); return; }
    const changed = selectedId !== id || !ring.visible;
    if (selectedId !== id) {
      // Another place: the held Play framing ends and the played disc fades back to plain lacquer
      // during the flight (a Play starting meanwhile clears it at once and records the new place).
      held = false;
      endFix.dir = null;
      endFix.check = false;
      marks.place = null;
      vinyl.clearMarks?.({ ms: MARKS_FADE_MS });
    }
    selectedId = id;
    restyleDots();
    placeRing();
    if (fly) {
      cam.zd = 0; // a place chosen: the arrival distance
      if (mode !== "focus" || changed || cam.touched || cam.flight) {
        mode = "focus";
        cam.touched = false;
        cam.leftPlace = false;
        const dur = flyTo(p);
        if (dur > 0) {
          setInstant(instantTarget(), dur, false, -cam.flight.lonTravel);
          if (!data.on) { data.on = true; data.onAt = now() + dur * 0.4; }
        } else {
          setInstant(instantTarget(), 0);
          data.on = true;
          data.onAt = 0;
          if (!reducedMotion()) fx.arrive = now();
        }
        // The frames start loading now (none before a place is flown to); the sharper Blue Marble
        // for the close view comes on arrival (arrive()), or now when there is no flight.
        if (dur <= 0) wantDayHd();
        if (frameInfo) { showFrame(frameInfo, 0); prefetchAhead(); }
      }
    } else {
      // Marking a place (no flight): the instant becomes the frame date at 10:30 local time there.
      // In the overview the camera sits west of the Sun, so the place starts on the lit face.
      const boot = !cam.placedOnPlace;
      cam.placedOnPlace = true;
      if (!(mode === "overview" && cam.leftPlace)) setInstant(instantTarget(), changed && !boot ? 600 : 0);
      if (!reducedMotion() && changed) fx.arrive = now();
    }
    kick();
  }

  /**
   * Diagnostics of the Play framing: the selected place on screen relative to the safe area's
   * center (CSS px; null when it is out of view), the tilt used, the Earth's radius on screen.
   */
  function playInfo() {
    const p = placeOf(selectedId);
    let placePx = null;
    if (p) {
      earthGroup.updateMatrixWorld();
      const s = screenOf(p);
      if (s) placePx = [+(s.x - M.tcx).toFixed(1), +(s.y - M.tcy).toFixed(1)];
    }
    // The Earth's center on screen relative to the safe area's center, and the safe area's size.
    tmpV.set(0, 0, 0).project(camera);
    const earthPx = [+(((tmpV.x + 1) / 2) * M.W - M.tcx).toFixed(1), +(((1 - tmpV.y) / 2) * M.H - M.tcy).toFixed(1)];
    return {
      earthPx,
      safe: [Math.round(M.sw || M.W), Math.round(M.sh || M.H)],
      ovDeg: [+(wrapPi(cam.ovAz) / RAD).toFixed(2), +(cam.ovEl / RAD).toFixed(2)],
      thetaDeg: +(time.theta / RAD).toFixed(2),
      home: cam.home ? { durMs: Math.round(cam.home.dur), idle: !!cam.home.idle } : null,
      leaving: !!cam.out,
      tip: tipInfo(),
      scratch: { ...scratchDiag, held: !!ptr.scratch, point: playing ? scratchPoint() : null },
      zoom: +(restDist() / (mode !== "focus" ? M.overview : playView() ? playDistOf(placeOf(selectedId)) : M.focus)).toFixed(3),
      held,
      endFraming: endFix.dir ? +endFix.mix.toFixed(2) : null,
      zoomNear: +nearDist().toFixed(3),
      zoomFar: +farDist().toFixed(3),
      drapeShown: +earthUniforms.uData.value.toFixed(3),
      mix: +cam.playMix.toFixed(2),
      place: p?.id || null,
      placePx,
      tiltDeg: cam.playFor ? +(cam.playTilt / RAD).toFixed(1) : null,
      camLatDeg: cam.playFor ? +(cam.playLat / RAD).toFixed(1) : null,
      dragOffDeg: [+(cam.pOffLon / RAD).toFixed(1), +(cam.pOffLat / RAD).toFixed(1)],
      dist: +cam.dist.toFixed(2),
      earthRadiusPx: Math.round(earthRadiusPx()),
      safeShort: Math.round(Math.min(M.sh, M.sw || M.sh)),
      mode,
      flying: !!cam.flight,
      dataOn: data.on,
    };
  }

  /**
   * Diagnostics of the stylus tip (at the place's ecliptic longitude on the date's groove): its
   * screen position, how far inside the safe area it is (px and Earth radii; negative outside),
   * and whether the planet hides it (the line of sight passes within 1.05 radii of the center).
   */
  const tipV = new THREE.Vector3();
  function tipInfo() {
    const p = placeOf(selectedId);
    if (!p || !vinyl.radiusAt) return null;
    const lon = Math.atan2(stylusL.y, stylusL.x);
    const rT = vinyl.radiusAt(vinyl.info().index);
    vinyl.group.updateWorldMatrix(true, false);
    tipV.set(Math.cos(lon) * rT, Math.sin(lon) * rT, 0).applyMatrix4(vinyl.group.matrixWorld);
    const cp = camera.position;
    const dir = tmpC.copy(tipV).sub(cp).normalize();
    const sc = -cp.dot(dir);
    const hidden = sc > 0 && Math.sqrt(Math.max(0, cp.lengthSq() - sc * sc)) <= 1.05; // behind the planet, or in front of it (where the disc fades out)
    tipV.project(camera);
    const x = ((tipV.x + 1) / 2) * M.W, y = ((1 - tipV.y) / 2) * M.H;
    const l = M.tcx - (M.sw || M.W) / 2, r = M.tcx + (M.sw || M.W) / 2, t = M.tcy - (M.sh || M.H) / 2, b = M.tcy + (M.sh || M.H) / 2;
    const room = Math.min(x - l, r - x, y - t, b - y);
    return { x: Math.round(x), y: Math.round(y), roomPx: Math.round(room), roomR: +(room / Math.max(1, earthRadiusPx())).toFixed(2), hidden };
  }

  /** Diagnostics: the place dots on the visible face, [id, x, y] in CSS px relative to the host. */
  function visibleDots() {
    earthGroup.updateMatrixWorld();
    const out = [];
    for (const p of places) {
      const s = screenOf(p);
      if (s && s.x >= 0 && s.y >= 0 && s.x <= M.W && s.y <= M.H) out.push([p.id, Math.round(s.x), Math.round(s.y)]);
    }
    return out;
  }

  const view = {
    /** Diagnostics: GPU textures alive and the frame cache (for checking memory across a Play). */
    info() {
      let bytes = 0;
      for (const e of texCache.values()) bytes += e.bytes;
      // Screen pixels per degree of the surface at the place's center, arrived and while playing,
      // and the resulting magnification of each frame tier (texels are 360 / width degrees).
      // (CSS px; the tier choice multiplies by the pixel ratio: tiers.)
      const mag = (d) => ({ px1024: +(pxPerDeg(d) / (1024 / 360)).toFixed(2), px2048: +(pxPerDeg(d) / (2048 / 360)).toFixed(2), px4096: +(pxPerDeg(d) / (4096 / 360)).toFixed(2) });
      let maskBytes = 0;
      for (const m of masks.values()) maskBytes += m.bytes;
      // tiers: the frame width each framing needs and the one on screen; drawCallsFrame: sky and scene.
      const tiers = { pixelRatio: pixelRatio(), arrived: lowMemory ? 2048 : neededWidth(false), playing: lowMemory ? 1024 : neededWidth(true), shown: data.aUrl ? sizeOf(texOf(data.aUrl))[0] : 0, day: earthUniforms.uDay.value?.image?.width || 0, overviewFps: 1000 / ovFrameMs, lowMemory };
      // composite: what the drape shows now (slot A; compositeIncoming while a crossfade runs).
      return { tiers, drawCallsFrame: lastCalls, textures: renderer.info.memory.textures, cached: texCache.size, cachedMB: Math.round(bytes / 1e6), hdWhilePlaying: hdNow(), uhd: uhdOk, maskLoaded: !!maskOf(record)?.tex, masks: [...masks.keys()].map((u) => u.slice(u.lastIndexOf("/") + 1)), masksMB: Math.round(maskBytes / 1e6), composite: data.aUrl ? compositeOf(slotRec.a) : "none", compositeIncoming: data.fade ? compositeOf(slotRec.b) : null, drape: +data.amount.toFixed(2), magnificationArrived: mag(M.focus), magnificationPlaying: mag(playDistOf(placeOf(selectedId))), record: vinyl.info(), playFraming: +cam.playMix.toFixed(2), play: playInfo(), dots: visibleDots(), frames: frameCount, drawCalls: renderer.info.render.calls, center: [Math.round(M.cx), Math.round(M.tcx)] };
    },
    setPlaces(list) {
      if (disposed) return;
      places = (Array.isArray(list) ? list : [])
        .filter((p) => p && p.id != null && Number.isFinite(+p.lat) && Number.isFinite(+p.lon))
        .map((p) => ({ id: p.id, name: p.name, lat: +p.lat, lon: +p.lon, active: p.active !== false, surface: p.surface === "ocean" ? "ocean" : "land", pos: latLonVec(+p.lat * RAD, +p.lon * RAD).multiplyScalar(DOT_R) }));
      byId = new Map(places.map((p) => [p.id, p]));
      if (hoveredId && !byId.has(hoveredId)) hoveredId = null;
      if (listHoverId && !byId.has(listHoverId)) listHoverId = null;
      rebuildDots();
      if (pendingSelect && byId.has(pendingSelect.id)) doSelect(pendingSelect.id, pendingSelect.fly, pendingSelect.refocus);
      kick();
    },
    /** opts.refocus: an explicit choice (keys, a row, a dot): fly in even after a drag out of this place. */
    select(id, { fly = true, refocus = false } = {}) {
      if (disposed || id == null) return;
      doSelect(id, !!fly, !!refocus);
    },
    setRecord(meta) {
      if (disposed) return;
      const changed = (meta || null) !== record;
      record = meta || null;
      if (data.on) loadMask(record); // else it loads with the first frame shown (showFrame)
      if (changed) {
        vinyl.setTrack(Array.isArray(record?.dates) ? record.dates : [], record?.title || "");
        held = false; // another record: the held Play framing ends
        endFix.dir = null;
        endFix.check = false;
        marks.place = null;
        vinyl.clearMarks?.();
        vinyl.setEffect?.(null);
        loadStrip(record);
      }
    },
    setFrame(frame, { stepMs = 0, linear = false } = {}) {
      if (disposed || !frame) return;
      const prev = frameInfo;
      const sameRec = frameRec === record;
      frameInfo = { ...frame };
      frameRec = record;
      const rm = reducedMotion();
      const step = Math.max(0, +stepMs || 0);
      data.stepMs = step;
      // A step still running is not cut short: the new step starts from the instant shown now (the
      // current interpolated instant, sidereal angle and Moon) and ends on its date in exactly stepMs,
      // so the sky, the Earth's turn and the stylus never jump when a step comes early or late, and
      // the picture is never more than one step behind the sound.
      // The sky: the Earth moves along its orbit to the new date, in exactly stepMs.
      const dur = rm ? 0 : step > 0 ? step : prev ? 700 : 0;
      setInstant(instantTarget(), dur, step > 0 && linear, null, step > 0);
      // The record: the stylus moves to the date's groove in the same time as the sky.
      vinyl.setIndex(Number.isFinite(+frame.index) ? +frame.index : 0, { ms: sameRec ? dur : 0, linear: step > 0 && linear });
      // The data drape: the HD frame when ready (decoded ahead during Play), else small then HD.
      data.token++;
      showFrame(frameInfo, rm ? 120 : step > 0 ? clamp(step * 0.45, 150, 900) : 350);
      prefetchAhead();
      scheduleHd();
      kick();
    },
    setPower(on) {
      power = !!on;
      kick();
    },
    setPlaying(on) {
      const was = playing;
      playing = !!on;
      if (playing !== was) {
        // Fewer pixels while the music plays: the buffer at 1 device pixel per CSS px, back to the
        // normal ratio when it ends; resize() redraws in the same task, so the picture never blinks.
        playRatio = playing;
        if (pixelRatio() > 1) resize();
        // The Play framing is chosen anew for each Play; a drag's offsets do not carry over.
        cam.playFor = null;
        cam.pOffLon = cam.pOffLat = 0;
        // The record's trace starts with each Play and stays on the disc after it; the effect stops.
        // Play starts at its own distance and clears the trace; when it ends, pauses or stops, the
        // Play framing and the colored disc stay (held) until another place is chosen.
        if (playing) {
          // How a resume is told from a new Play, without a signal from the page: a Play that starts
          // while the trace belongs to this place and record (held after a Pause, a Stop or the end)
          // keeps it, unless its first date comes before the last date marked (a restart from the
          // beginning, or the slider moved back: checked at its first step, recordStep).
          const same = held && marks.place === selectedId && marks.rec === record && marks.last >= 0;
          cam.pz = 1;
          held = false;
          endFix.dir = null;
          endFix.check = false;
          marks.resume = same;
          if (!same) { vinyl.clearMarks?.(); marks.last = -1; }
        } else {
          vinyl.setEffect?.(null);
          cam.zd = 0;
          if (mode === "focus" && selectedId != null) {
            held = true;
            // At the last date (the Play reached its end): show the record whole if it is seen edge on.
            const count = Array.isArray(record?.dates) ? record.dates.length : 0;
            endFix.check = count > 0 && +frameInfo?.index === count - 1;
          }
        }
      }
      if (!playing) {
        settleStep(); // a stop lands on the date shown (a short ease, a cut with reduced motion)
        endScratch(); // a scratch is only a thing while the record plays
        if (mode === "overview" && cam.leftPlace) data.on = false; // pulled back: the Blue Marble returns
        // Back to the close arrival: the date shown at the tier that framing needs (a short
        // crossfade to the same picture, sharper, while the camera comes back in).
        if (was && data.on && frameInfo && !lowMemory) showFrame(frameInfo, HD_UPGRADE_MS);
        scheduleHd();
      } else {
        clearTimeout(data.hdTimer);
        // Play always shows the data: when the globe is not in the place's data view (dragged out
        // of it, or the place was only marked at boot), the short flight back to the place drapes
        // the record's frame, then the Play framing takes over.
        if (!was && selectedId != null && byId.has(selectedId)) {
          if (mode !== "focus") doSelect(selectedId, true, true);
          else if (!data.on) { data.on = true; data.onAt = 0; if (frameInfo) showFrame(frameInfo, 0); }
        }
        prefetchAhead(); // the next dates at the tier the Play framing needs
      }
      kick();
    },
    /**
     * Light a place's dot from the place list (its row hovered or focused): the pointer's hover
     * style, without selecting it, without onHover (no loop with the list) and without moving the
     * camera; null clears it. A pointer over the picture takes precedence.
     */
    /** Zoom the Earth by a factor (above 1: farther), as the wheel does over the planet (keys + and -). */
    zoomBy(factor) {
      if (disposed || !(+factor > 0)) return;
      noteTouch();
      zoomNotches(Math.log(+factor) / Math.log(ZOOM_PER_NOTCH));
    },
    hover(id) {
      if (disposed) return;
      const next = id != null && byId.has(id) ? id : null;
      if (next === listHoverId) return;
      listHoverId = next;
      restyleDots();
      kick(); // one frame, then the loop goes idle again
    },
    pulse(v01) {
      if (disposed) return;
      recordStep(v01); // the record's trace and effect (also with reduced motion: the marks are still)
      if (reducedMotion() || !selectedId) return;
      if (v01 == null || !Number.isFinite(+v01)) fx.flicker = now();
      else fx.ripple = { t0: now(), v: clamp(+v01, 0, 1) };
      kick();
    },
    /** The logo's way home: back to the opening view. opts.entrance: play the first push in again. */
    home({ entrance = false } = {}) {
      if (disposed) return;
      gateUp = false; // the page asks for the entrance as its gate starts to lift: draw from the first frame
      goHome(!!entrance);
      kick();
    },
    setShown(on) {
      shown = !!on;
      if (shown) resize();
      else { cancelAnimationFrame(raf); raf = 0; }
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(data.hdTimer);
      clearTimeout(watchdog);
      ro.disconnect();
      roSafe?.disconnect();
      clearTimeout(capTimer);
      clearTimeout(wakeTimer);
      io.disconnect();
      gateMo.disconnect();
      bodyMo?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      clearTimeout(scratchStillTimer);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      for (const e of texCache.values()) freeTexture(e.tex);
      for (const m of masks.values()) m.tex?.dispose();
      masks.clear();
      texCache.clear();
      skyApi.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.());
      });
      dayMap?.dispose();
      cloudMap?.dispose();
      blank.dispose();
      renderer.dispose();
      canvas.remove();
      delete host.__globe;
    },
  };
  // Reachable from DevTools for the diagnostics above (the canvas itself stays aria-hidden).
  Object.defineProperty(host, "__globe", { value: view, configurable: true });
  return view;
}
