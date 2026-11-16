# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Make the star catalog of the globe's sky from NASA SVS 4851 "Deep Star Maps 2020".

The star map is a picture: at the globe's field of view it is magnified several times and its
stars turn into soft blobs. So the brightest point sources are measured here once, and the web
page draws them as crisp points (web/js/ui/sky.js); the picture is kept only for the faint glow
of the Milky Way behind them.

Source: starmap_2020_8k.exr (8192 x 4096, linear RGB, celestial plate carree, J2000; public
domain, NASA Goddard Scientific Visualization Studio), downloaded by make_sky.py into raw/sky/.
Orientation: column x is RA = 12h - 24h * (x + 0.5) / width (center RA 0h, RA grows to the
left); row y is Dec = 90 - 180 * (y + 0.5) / height (north up).

Steps:
  1. luminance; candidate peaks are pixels that are the maximum of their 5 x 5 neighborhood;
  2. for each candidate, the local background is the median of a ring 12 to 16 pixels away,
     and the flux is the background-subtracted sum over an aperture that grows (radius 2 to 8
     pixels, stretched sideways by 1 / cos(dec)) while it still gathers light, weighted by
     cos(dec) for the pixel's solid angle, in R, G and B;
  3. sources inside the halo of a brighter one are dropped (the same star found twice); the
     halo radius grows from 0.12 to 0.7 degree with brightness;
  4. the brightest N are kept; the map's brightness scale is compressed, so each source gets an
     approximate magnitude from its brightness rank matched to naked-eye star counts, and a
     color from the flux ratio of the three channels;
  5. written as one compact JSON file with its provenance; the stars are packed binary in
     base64 (RA, Dec, color as 12-bit rgb444, magnitude; 7 bytes a star).

Also writes the Milky Way glow without the stars, web/css/img/sky-glow-1024.jpg: the map is
averaged 4 x 4 (2048 px), point sources are removed with a grey opening (a 5 x 5 minimum,
then maximum), the result is smoothed, averaged down to 1024 x 512, the dark sky's level is
subtracted so space stays black, and it is encoded as a small sRGB JPEG. The page draws the
stars as points on top of it.

Usage:
    python pipeline/make_stars.py            # write web/css/img/sky-stars.json and sky-glow-1024.jpg
"""

from __future__ import annotations

import base64
import json
import sys
from datetime import datetime, timezone

import numpy as np
from PIL import Image

from colorbar import read_exr_rgb
from common import RAW, REPO

SRC = RAW / "sky" / "starmap_2020_8k.exr"
OUT = REPO / "web" / "css" / "img" / "sky-stars.json"
GLOW_OUT = REPO / "web" / "css" / "img" / "sky-glow-1024.jpg"
GLOW_BLACK = 0.0016     # linear level of the dark sky between stars: goes to black (no gray haze)
GLOW_GAIN = 9.0         # then a gain; the Milky Way core in Sagittarius lands near the top
COUNT = 38000           # down to about magnitude 7.7, so the sky reads as a real star field
DEDUPE_DEG = 0.12
MIN_SNR = 12.0          # peak height over the local scatter: drops knots in the Milky Way's star clouds

# Known stars (J2000 RA hours, Dec degrees, V magnitude) to calibrate and check.
CHECK = {
    "Sirius": (6 + 45.1 / 60, -16.72, -1.46),
    "Canopus": (6 + 24.0 / 60, -52.70, -0.74),
    "Vega": (18 + 36.9 / 60, 38.78, 0.03),
    "Rigel": (5 + 14.5 / 60, -8.20, 0.13),
    "Betelgeuse": (5 + 55.2 / 60, 7.41, 0.50),
    "Alnilam": (5 + 36.2 / 60, -1.20, 1.69),
    "Acrux": (12 + 26.6 / 60, -63.10, 0.76),
}


def shift_max(a: np.ndarray, r: int) -> np.ndarray:
    """Maximum over a (2r+1) x (2r+1) window; wraps in x (RA), clamps in y."""
    m = a.copy()
    for d in range(1, r + 1):
        np.maximum(m, np.roll(a, d, axis=1), out=m)
        np.maximum(m, np.roll(a, -d, axis=1), out=m)
    out = m.copy()
    for d in range(1, r + 1):
        up = np.vstack([m[d:], np.repeat(m[-1:], d, axis=0)])
        dn = np.vstack([np.repeat(m[:1], d, axis=0), m[:-d]])
        np.maximum(out, up, out=out)
        np.maximum(out, dn, out=out)
    return out


def gather(img: np.ndarray, ys: np.ndarray, xs: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    return img[np.clip(ys, 0, h - 1), xs % w]


def measure(rgb: np.ndarray, lum: np.ndarray, py: np.ndarray, px: np.ndarray):
    """Background-subtracted RGB flux and centroid of each candidate peak.

    Bright stars are drawn larger in the map, so the aperture grows until the flux stops
    growing (radius 2, 3, 5 or 8 pixels, stretched sideways by 1 / cos(dec))."""
    h, w = lum.shape
    dec = 90.0 - 180.0 * (py + 0.5) / h
    stretch = 1.0 / np.maximum(np.cos(np.radians(dec)), 0.2)
    wts = np.array([0.2126, 0.7152, 0.0722])
    # Background: median of a ring 12 to 16 pixels out (beyond the halo of a bright star).
    ang = np.linspace(0, 2 * np.pi, 64, endpoint=False)
    oy = np.concatenate([np.round(r * np.sin(ang)) for r in (12.0, 14.0, 16.0)]).astype(int)
    oxf = np.concatenate([r * np.cos(ang) for r in (12.0, 14.0, 16.0)])
    ys = py[:, None] + oy[None, :]
    xs = px[:, None] + np.round(oxf[None, :] * np.minimum(stretch, 4)[:, None]).astype(int)
    bg = np.stack([np.median(gather(rgb[..., c], ys, xs), axis=1) for c in range(3)], axis=1)
    # Contrast of the peak against the ring's scatter (robust sigma): a star stands far above it,
    # a knot in the mottled star clouds of the Milky Way does not.
    ring = gather(lum, ys, xs)
    rmed = np.median(ring, axis=1)
    sigma = 1.4826 * np.median(np.abs(ring - rmed[:, None]), axis=1) + 1e-7
    snr = (lum[py, px] - rmed) / sigma
    flux = None
    best = np.zeros(len(py))
    for r in (2, 3, 5, 8):
        dys = np.arange(-r, r + 1)
        dxs = np.arange(-min(4 * r, 24), min(4 * r, 24) + 1)
        gy, gx = np.meshgrid(dys, dxs, indexing="ij")
        gy, gx = gy.ravel(), gx.ravel()
        inside = (gy[None, :] ** 2 + (gx[None, :] / np.minimum(stretch, 4)[:, None]) ** 2) <= r * r + 0.5
        yy = py[:, None] + gy[None, :]
        xx = px[:, None] + gx[None, :]
        f = np.stack([np.where(inside, gather(rgb[..., c], yy, xx) - bg[:, c:c + 1], 0).sum(axis=1) for c in range(3)], axis=1)
        lf = f @ wts
        if flux is None:
            flux, best = f, lf
            wl = np.where(inside, np.clip(gather(lum, yy, xx) - (bg @ wts)[:, None], 0, None), 0)
            tot = np.maximum(wl.sum(axis=1), 1e-12)
            cy = py + (wl * gy[None, :]).sum(axis=1) / tot
            cx = px + (wl * gx[None, :]).sum(axis=1) / tot
        else:
            grow = lf > best * 1.08  # still collecting light: take the larger aperture
            flux = np.where(grow[:, None], f, flux)
            best = np.where(grow, lf, best)
    # A pixel covers cos(dec) of the solid angle of an equator pixel: weight the sums by it, or
    # stars near the poles (spread over many pixels) would read far too bright.
    return flux * np.cos(np.radians(dec))[:, None], cy, cx, snr


def unit(ra_deg, dec_deg):
    ra, dec = np.radians(ra_deg), np.radians(dec_deg)
    return np.stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)], axis=-1)


def dedupe(ra, dec, lflux, order):
    """Greedy, bright to faint: drop a source inside the halo of a kept brighter one. The halo
    radius grows with brightness (bright stars are drawn larger and break into several peaks).
    Kept sources are binned in 0.7 degree cells (wider in RA toward the poles) for the search."""
    v = unit(ra, dec)
    ref = np.median(lflux[order[:COUNT]])
    radius = np.clip(DEDUPE_DEG * (lflux / ref) ** 0.5, DEDUPE_DEG, 0.7)
    cosr = np.cos(np.radians(radius))
    cell = 0.7
    nband = int(np.ceil(180 / cell))
    nra = [max(1, int(360 * np.cos(np.radians(min(89.9, abs(-90 + (k + 0.5) * cell)) )) / cell)) for k in range(nband)]
    cells: dict[tuple[int, int], list[int]] = {}

    def key(b, r):
        n = nra[b]
        return b, int(r / 360 * n) % n

    kept = []
    for i in order:
        b = min(nband - 1, int((dec[i] + 90) / cell))
        clash = False
        for bb in (b - 1, b, b + 1):
            if bb < 0 or bb >= nband:
                continue
            n = nra[bb]
            c0 = int(ra[i] / 360 * n)
            for cc in {(c0 - 1) % n, c0 % n, (c0 + 1) % n}:
                for j in cells.get((bb, cc), ()):
                    if v[i] @ v[j] > cosr[j]:
                        clash = True
                        break
                if clash:
                    break
            if clash:
                break
        if not clash:
            cells.setdefault(key(b, ra[i]), []).append(i)
            kept.append(i)
            if len(kept) >= COUNT:
                break
    return np.array(kept)


def shift_min(a: np.ndarray, r: int) -> np.ndarray:
    return -shift_max(-a, r)


def make_glow(rgb: np.ndarray) -> None:
    """The Milky Way glow without its stars (see the module docstring)."""
    h, w, _ = rgb.shape
    small = rgb.reshape(h // 4, 4, w // 4, 4, 3).mean(axis=(1, 3))          # 2048 x 1024, linear
    out = np.empty_like(small)
    for c in range(3):
        opened = shift_max(shift_min(small[..., c], 2), 2)                   # stars removed
        k = 5                                                                  # 5 x 5 box blur
        pad = np.pad(opened, ((k // 2, k // 2), (0, 0)), mode="edge")
        acc = sum(np.roll(pad, d, axis=1) for d in range(-(k // 2), k // 2 + 1)) / k
        acc = sum(acc[i:i + opened.shape[0]] for i in range(k)) / k
        out[..., c] = acc
    half = out.reshape(out.shape[0] // 2, 2, out.shape[1] // 2, 2, 3).mean(axis=(1, 3))
    lum = half @ np.array([0.2126, 0.7152, 0.0722])
    gain = np.where(lum > 0, np.clip(lum - GLOW_BLACK, 0, None) * GLOW_GAIN / np.maximum(lum, 1e-9), 0)
    lin = np.clip(half * gain[..., None], 0, 1)
    srgb = np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    Image.fromarray((srgb * 255 + 0.5).astype(np.uint8)).save(GLOW_OUT, quality=88, subsampling=0, optimize=True, progressive=True)
    print(f"wrote {GLOW_OUT.relative_to(REPO)}: {GLOW_OUT.stat().st_size / 1024:.0f} KB")


def main(argv: list[str]) -> int:
    if not SRC.exists():
        print(f"missing {SRC}: run pipeline/make_sky.py first (it downloads the star map)")
        return 1
    rgb = read_exr_rgb(SRC)
    h, w, _ = rgb.shape
    make_glow(rgb)
    if "--glow-only" in argv:
        return 0
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    peaks = (lum >= shift_max(lum, 2)) & (lum > np.percentile(lum, 99.0))
    py, px = np.nonzero(peaks)
    # Keep the strongest candidates by peak height above a quick local floor before measuring.
    order = np.argsort(-lum[py, px])[: COUNT * 8]
    py, px = py[order], px[order]
    flux, cy, cx, snr = measure(rgb, lum, py, px)
    lflux = flux @ [0.2126, 0.7152, 0.0722]
    if "--snr" in argv:
        for q in (10, 25, 50, 75, 90):
            print(f"  snr p{q}: {np.percentile(snr, q):.1f}")
    good = (lflux > 0) & (snr > MIN_SNR)
    flux, cy, cx, lflux = flux[good], cy[good], cx[good], lflux[good]
    ra = (180.0 - 360.0 * (cx + 0.5) / w) % 360.0
    dec = 90.0 - 180.0 * (cy + 0.5) / h
    order = np.argsort(-lflux)
    keep = dedupe(ra, dec, lflux, order)
    ra, dec, flux, lflux = ra[keep], dec[keep], flux[keep], lflux[keep]

    # Calibrate on Sirius: the brightest source within 0.3 degree of it.
    v = unit(ra, dec)

    def find(ra_h, d):
        s = unit(ra_h * 15.0, d)
        near = np.nonzero(v @ s > np.cos(np.radians(0.3)))[0]
        return near[np.argmax(lflux[near])] if len(near) else None

    # The map's brightness scale is compressed (its 9000th source would read only about four
    # magnitudes below Sirius), so the magnitude drawn is set by brightness rank, matched to
    # the naked-eye star counts log10 N(<m) = 0.556 + 0.524 m (about 22 stars brighter than
    # 1.5, 500 than 4, 9000 than 6.5).
    rank = np.empty(len(lflux), int)
    rank[np.argsort(-lflux)] = np.arange(1, len(lflux) + 1)
    mag = (np.log10(rank) - 0.556) / 0.524

    rgbn = np.clip(flux, 0, None)
    rgbn = rgbn / np.maximum(rgbn.max(axis=1, keepdims=True), 1e-12)
    q = np.clip(np.round(rgbn * 15), 0, 15).astype(int)
    color = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]

    # Packed little-endian, one array after another: RA as uint16 (360 deg = 65536), Dec as
    # int16 (90 deg = 32767), color as uint16 (rgb444), magnitude as uint8 ((mag + 2) * 20);
    # 7 bytes a star, base64 in the JSON so the file still carries its provenance.
    n = len(ra)
    blob = b"".join([
        np.round(ra / 360.0 * 65536).astype(np.int64).clip(0, 65535).astype("<u2").tobytes(),
        np.round(dec / 90.0 * 32767).astype("<i2").tobytes(),
        color.astype("<u2").tobytes(),
        np.round((mag + 2.0) * 20).clip(0, 255).astype("u1").tobytes(),
    ])
    doc = {
        "about": "Brightest point sources of the NASA SVS Deep Star Maps 2020 (svs.gsfc.nasa.gov/4851), measured by pipeline/make_stars.py. J2000.",
        "encoding": "stars_b64: base64 of little-endian arrays of count items each: ra uint16 (deg = v * 360 / 65536), dec int16 (deg = v * 90 / 32767), color uint16 (rgb444), mag uint8 (mag = v / 20 - 2)",
        "magnitude": "approximate: from brightness rank in the map, matched to naked-eye star counts",
        "count": n,
        "provenance": {"generator": "pipeline/make_stars.py", "source": "NASA SVS 4851 starmap_2020_8k.exr",
                       "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "si_assisted_code": True},
        "stars_b64": base64.b64encode(blob).decode("ascii"),
    }
    OUT.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(REPO)}: {len(ra)} stars, {OUT.stat().st_size / 1024:.0f} KB, "
          f"magnitudes {mag.min():.2f} to {mag.max():.2f}")
    for name, (ra_h, d, vmag) in CHECK.items():
        i = find(ra_h, d)
        if i is None:
            print(f"  {name:10s} NOT FOUND near RA {ra_h:.3f} h, Dec {d:+.2f}")
            continue
        off = np.degrees(np.arccos(np.clip(v[i] @ unit(ra_h * 15.0, d), -1, 1)))
        rank = int((lflux > lflux[i]).sum()) + 1
        print(f"  {name:10s} found at RA {ra[i] / 15:.3f} h, Dec {dec[i]:+.2f} ({off:.3f} deg off), "
              f"mag {mag[i]:+.2f} (V {vmag:+.2f}), brightness rank {rank}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
