// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
// Where the Sun, the Moon and the planets are in the sky for a UTC instant, and how far the Earth
// has turned (Greenwich sidereal angle). Pure functions, no three.js, so they can be unit tested.
//
// Low precision on purpose (the sky behind the globe is a picture, not an almanac):
// - Sun: Astronomical Almanac low-precision formula, about 0.01 degree.
// - Moon: Astronomical Almanac low-precision series (six terms in longitude, four in latitude),
//   about 0.3 degree, geocentric.
// - Planets: JPL "Approximate Positions of the Planets" (E. M. Standish), Keplerian elements
//   for 1800 to 2050, then shifted from the J2000 ecliptic to the ecliptic of date.
// - Greenwich mean sidereal time: IAU 1982 expression.
// All angles are in degrees. Right ascension is in degrees too (0 to 360), not hours.

const D = Math.PI / 180;
const J2000 = 2451545.0;

const norm360 = (x) => ((x % 360) + 360) % 360;
const sind = (x) => Math.sin(x * D);
const cosd = (x) => Math.cos(x * D);

/** Julian day number (UT) of a Date or a millisecond timestamp. */
export function julianDay(date) {
  const ms = typeof date === "number" ? date : date.getTime();
  return ms / 86400000 + 2440587.5;
}

const daysSinceJ2000 = (date) => julianDay(date) - J2000;
const centuriesSinceJ2000 = (date) => daysSinceJ2000(date) / 36525;

/** Mean obliquity of the ecliptic of date. */
export function obliquityDeg(date) {
  return 23.439291 - 0.0130042 * centuriesSinceJ2000(date);
}

/** General precession in ecliptic longitude since J2000 (how far the equinox has slid). */
export function precessionDeg(date) {
  return 1.396971 * centuriesSinceJ2000(date);
}

/** Greenwich mean sidereal angle: right ascension now on the Greenwich meridian. */
export function greenwichSiderealDeg(date) {
  const d = daysSinceJ2000(date);
  const t = d / 36525;
  return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * t * t);
}

/** Ecliptic (longitude, latitude) to equatorial (right ascension, declination), all in degrees. */
export function eclipticToEquatorial(lon, lat, eps) {
  const x = cosd(lat) * cosd(lon);
  const y = cosd(lat) * sind(lon) * cosd(eps) - sind(lat) * sind(eps);
  const z = cosd(lat) * sind(lon) * sind(eps) + sind(lat) * cosd(eps);
  return { ra: norm360(Math.atan2(y, x) / D), dec: Math.asin(Math.max(-1, Math.min(1, z))) / D };
}

/** Unit vector of a right ascension and declination: x to the March equinox, z to the north celestial pole. */
export function raDecToVector(ra, dec) {
  return [cosd(dec) * cosd(ra), cosd(dec) * sind(ra), sind(dec)];
}

/** The Sun, geocentric, ecliptic and equator of date. */
export function sunPosition(date) {
  const n = daysSinceJ2000(date);
  const L = norm360(280.46 + 0.9856474 * n);
  const g = norm360(357.528 + 0.9856003 * n);
  const lon = norm360(L + 1.915 * sind(g) + 0.02 * sind(2 * g));
  const distAu = 1.00014 - 0.01671 * cosd(g) - 0.00014 * cosd(2 * g);
  const eps = 23.439 - 0.0000004 * n;
  return { lon, lat: 0, distAu, ...eclipticToEquatorial(lon, 0, eps) };
}

/** The Moon, geocentric, ecliptic and equator of date. */
export function moonPosition(date) {
  const t = centuriesSinceJ2000(date);
  const lon = norm360(
    218.32 + 481267.881 * t
      + 6.29 * sind(135.0 + 477198.87 * t)
      - 1.27 * sind(259.3 - 413335.36 * t)
      + 0.66 * sind(235.7 + 890534.22 * t)
      + 0.21 * sind(269.9 + 954397.74 * t)
      - 0.19 * sind(357.5 + 35999.05 * t)
      - 0.11 * sind(186.5 + 966404.03 * t),
  );
  const lat =
    5.13 * sind(93.3 + 483202.02 * t)
    + 0.28 * sind(228.2 + 960400.89 * t)
    - 0.28 * sind(318.3 + 6003.15 * t)
    - 0.17 * sind(217.6 - 407332.21 * t);
  return { lon, lat, ...eclipticToEquatorial(lon, lat, obliquityDeg(date)) };
}

// JPL Keplerian elements, J2000 ecliptic and equinox, valid 1800 to 2050:
// [a (au), e, I, L, long. perihelion, long. ascending node], then their rates per Julian century.
const ELEMENTS = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
};

export const PLANETS = ["mercury", "venus", "mars", "jupiter", "saturn"];

/** Heliocentric position (au) on the J2000 ecliptic, from the Keplerian elements. */
function heliocentric(name, t) {
  const [base, rate] = ELEMENTS[name];
  const [a, e, I, L, peri, node] = base.map((v, i) => v + rate[i] * t);
  const w = peri - node; // argument of perihelion
  let M = norm360(L - peri);
  if (M > 180) M -= 360;
  // Kepler's equation, Newton iterations in radians.
  const m = M * D;
  let E = m + e * Math.sin(m);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = cosd(w), sw = sind(w), cn = cosd(node), sn = sind(node), ci = cosd(I), si = sind(I);
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

// Rough visual magnitude: absolute magnitude H(1,0) plus a phase curve in the phase angle (degrees),
// from Mallama and Hilton (2018), "Computing apparent planetary magnitudes for The Astronomical
// Almanac". Saturn's rings are left out (its globe only), so Saturn can read a little faint.
// Only used to size the planets' points in the sky picture, never shown as a number.
const PHASE_CURVE = {
  mercury: (a) => -0.613 + a * (6.3271e-2 + a * (-1.6336e-3 + a * (3.3644e-5 + a * (-3.4265e-7 + a * (1.6893e-9 - a * 3.0334e-12))))),
  venus: (a) => { a = Math.min(a, 163.7); return -4.384 + a * (-1.044e-3 + a * (3.687e-4 + a * (-2.814e-6 + a * 8.938e-9))); },
  mars: (a) => -1.601 + a * (2.267e-2 - a * 1.302e-4),
  jupiter: (a) => -9.395 + a * (-3.7e-4 + a * 6.16e-4),
  saturn: (a) => -8.914 + a * 0.026,
};

/** Rough apparent visual magnitude of a planet at heliocentric distance r and geocentric distance delta (au). */
export function planetMagnitude(name, r, delta, phaseDeg) {
  return PHASE_CURVE[name](phaseDeg) + 5 * Math.log10(r * delta);
}

/** A planet ("mercury" ... "saturn"), geocentric, ecliptic and equator of date, with a rough magnitude. */
export function planetPosition(name, date) {
  const t = centuriesSinceJ2000(date);
  const p = heliocentric(name, t);
  const e = heliocentric("earth", t);
  const x = p[0] - e[0], y = p[1] - e[1], z = p[2] - e[2];
  const lon = norm360(Math.atan2(y, x) / D + precessionDeg(date));
  const lat = Math.atan2(z, Math.hypot(x, y)) / D;
  const distAu = Math.hypot(x, y, z);
  const r = Math.hypot(p[0], p[1], p[2]);
  const R = Math.hypot(e[0], e[1], e[2]);
  // Phase angle (Sun, planet, Earth), from the triangle's three sides.
  const phase = Math.acos(Math.max(-1, Math.min(1, (r * r + distAu * distAu - R * R) / (2 * r * distAu)))) / D;
  return { lon, lat, distAu, phase, mag: planetMagnitude(name, r, distAu, phase), ...eclipticToEquatorial(lon, lat, obliquityDeg(date)) };
}

/** Everything the sky needs for one instant. */
export function skyAt(date) {
  const planets = {};
  for (const name of PLANETS) planets[name] = planetPosition(name, date);
  return {
    gmst: greenwichSiderealDeg(date),
    obliquity: obliquityDeg(date),
    precession: precessionDeg(date),
    sun: sunPosition(date),
    moon: moonPosition(date),
    planets,
  };
}

/**
 * The instant the globe shows for a record date ("YYYY-MM-DD"): that day at the UTC time when the
 * mean local solar time at longitude lon is localHour (10:30 by default, so the place is in morning
 * daylight with the terminator in view). With no longitude, 12:00 UTC. Returns milliseconds.
 */
export function solarInstant(isoDate, lon = null, localHour = 10.5) {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  const base = Date.UTC(y || 2000, (m || 1) - 1, d || 1);
  const hours = lon == null || !Number.isFinite(lon) ? 12 : (((localHour - lon / 15) % 24) + 24) % 24;
  return base + hours * 3600000;
}
