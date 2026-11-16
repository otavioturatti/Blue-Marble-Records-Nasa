# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Make the night sky backdrop of the globe view from NASA SVS 4851 "Deep Star Maps 2020".

Source: the star map in celestial (equatorial, J2000) coordinates, 8192 x 4096 linear EXR
(starmap_2020_8k.exr, public domain, NASA Goddard Scientific Visualization Studio). The
galactic-coordinates variant (*_gal.exr) is NOT used.

Steps:
  1. download the EXR into raw/sky/ (git-ignored) if it is missing;
  2. average 2 x 2 pixels in linear light (8192 -> 4096), which keeps the flux of every star;
  3. tone-map the luminance: subtract a black point so empty space is truly dark, apply a
     gain and a toe (power > 1) so the Milky Way reads while the faint haze stays black, and
     roll the highlights off with an extended Reinhard shoulder whose white point is the
     brightest source pixel, so bright stars stay small points instead of white blobs and
     nothing reaches 255; color is kept by scaling R, G and B by the same factor;
  4. encode to sRGB and write two progressive JPGs (4:4:4 chroma, no subsampling, so star
     colors and the black do not smear into blocks), lowering the quality only as far as
     needed to fit the byte budget.

Orientation (same as the SVS source, checked against real stars by --check):
  plate carree; column x covers right ascension RA = 12h - 24h * (x + 0.5) / width, so the
  image center is RA 0h and RA increases to the LEFT; row 0 is declination +90 (north up),
  the last row is -90.

Usage:
    python pipeline/make_sky.py            # write web/css/img/sky-starmap-2048.jpg
    python pipeline/make_sky.py --check    # report where known stars land in the output
"""

from __future__ import annotations

import sys
import urllib.request

import numpy as np
from PIL import Image

from colorbar import linear_to_srgb, read_exr_rgb
from common import RAW, REPO

SRC_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/starmap_2020_8k.exr"
SRC = RAW / "sky" / "starmap_2020_8k.exr"
OUT_DIR = REPO / "web" / "css" / "img"
# (size, highest JPEG quality, byte budget): quality steps down from the highest until the
# file fits the budget. A dense star field is almost all fine detail, so it costs bytes.
OUTPUTS = [((2048, 1024), 82, 450_000)]  # the globe draws stars as points (make_stars.py); this map is only the Milky Way glow

# Tone curve, on linear luminance (the EXR is linear, 0 to 1). Measured on the 4096 image:
# around the galactic poles the sky sits at 0.0003 to 0.0018, the Milky Way in Cygnus at
# about 0.007 and the core in Sagittarius at about 0.056.
BLACK = 0.0012      # subtracted first: the dark sky between stars goes to black, no gray haze
EXPOSURE = 11.0     # gain after the black point
TOE = 1.4           # power > 1 keeps the faint end dark while the Milky Way stays bright
TOP = 0.92          # linear level the brightest source pixel maps to (sRGB 245), never 255

# Known objects (J2000) used to check the orientation.
STARS = {
    "Sirius": (6 + 45.1 / 60, -16.72),
    "Canopus": (6 + 24.0 / 60, -52.70),
    "Vega": (18 + 36.9 / 60, 38.78),
    "Large Magellanic Cloud": (5 + 23.6 / 60, -69.75),
}


def download() -> None:
    if SRC.exists() and SRC.stat().st_size > 0:
        return
    SRC.parent.mkdir(parents=True, exist_ok=True)
    tmp = SRC.with_suffix(".exr.part")
    req = urllib.request.Request(SRC_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=600) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    tmp.replace(SRC)


def downsample(rgb: np.ndarray, factor: int) -> np.ndarray:
    h, w, c = rgb.shape
    return rgb.reshape(h // factor, factor, w // factor, factor, c).mean(axis=(1, 3))


def tone_map(rgb: np.ndarray) -> np.ndarray:
    """Linear RGB (0..1) -> sRGB uint8, see the module docstring."""
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    x = np.power(np.clip(lum - BLACK, 0.0, None) * EXPOSURE, TOE)
    white = ((1.0 - BLACK) * EXPOSURE) ** TOE                # where a source value of 1.0 lands
    y = TOP * x * (1.0 + x / white**2) / (1.0 + x)            # extended Reinhard: white -> TOP
    with np.errstate(divide="ignore", invalid="ignore"):
        gain = np.where(lum > 0, y / lum, 0.0)
    out = np.clip(rgb * gain[..., None], 0.0, None)
    # A saturated color channel would clip to a flat blob: scale the pixel down to fit instead.
    peak = out.max(axis=-1, keepdims=True)
    out = np.where(peak > 1.0, out / np.maximum(peak, 1e-9), out)
    return (linear_to_srgb(out) * 255.0 + 0.5).astype(np.uint8)


def radec_to_pixel(ra_h: float, dec: float, size: tuple[int, int]) -> tuple[float, float]:
    """Pixel (x, y) of a right ascension (hours) and declination (degrees) in the output."""
    w, h = size
    x = ((12.0 - ra_h) / 24.0 % 1.0) * w - 0.5
    y = (90.0 - dec) / 180.0 * h - 0.5
    return x, y


def box_sum(a: np.ndarray, r: int) -> np.ndarray:
    """Sum over a (2r+1) x (2r+1) box at every pixel; wraps in x (RA), clamps in y."""
    k = 2 * r + 1
    a = np.pad(a, ((r, r), (r, r)), mode="edge")
    a[:, :r], a[:, -r:] = a[:, -2 * r:-r], a[:, r:2 * r]     # wrap columns
    c = np.cumsum(np.cumsum(np.pad(a, ((1, 0), (1, 0))), axis=0), axis=1)
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


def check(path) -> None:
    """Where do known stars land? Compares the flux at the expected pixel with the flux at the
    mirrored pixel (what RA growing to the right would give) and ranks it among all pixels."""
    srgb = np.asarray(Image.open(path).convert("L")).astype(np.float64) / 255.0
    lin = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    h, w = lin.shape
    print(f"{path.name}: {w} x {h}; convention tested: center column = RA 0h, RA grows to the left, north up")
    for name, (ra, dec) in STARS.items():
        extended = name == "Large Magellanic Cloud"
        r = w // 128 if extended else max(1, w // 2048)
        flux = box_sum(lin, r)
        ex, ey = radec_to_pixel(ra, dec, (w, h))
        x0, y0 = int(round(ex)), int(round(ey))
        s = 3 * r                                             # search radius around the expected pixel
        ys = np.arange(y0 - s, y0 + s + 1).clip(0, h - 1)
        xs = np.arange(x0 - s, x0 + s + 1) % w
        win = flux[np.ix_(ys, xs)]
        iy, ix = np.unravel_index(np.argmax(win), win.shape)
        px, py, peak = xs[ix], ys[iy], win[iy, ix]
        rank = (flux > peak).mean() * 100
        mx = int(round(w - 1 - ex))                            # mirrored column
        mirror = flux[np.ix_(ys, np.arange(mx - s, mx + s + 1) % w)].max()
        print(f"  {name:24s} expected ({ex:7.1f}, {ey:6.1f})  peak ({px:5d}, {py:5d})  "
              f"offset ({px - ex:+5.1f}, {py - ey:+5.1f}) px  brighter than {100 - rank:.3f}% of pixels  "
              f"flux / mirrored-position flux = {peak / max(mirror, 1e-9):.1f}")


def main(argv: list[str]) -> int:
    if "--check" in argv:
        for size, _, _ in OUTPUTS:
            check(OUT_DIR / f"sky-starmap-{size[0]}.jpg")
        return 0
    download()
    src = read_exr_rgb(SRC)                                   # (4096, 8192, 3), linear
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for (w, h), quality, budget in OUTPUTS:
        img = Image.fromarray(tone_map(downsample(src, src.shape[1] // w)), mode="RGB")
        path = OUT_DIR / f"sky-starmap-{w}.jpg"
        while True:
            img.save(path, quality=quality, optimize=True, progressive=True, subsampling=0)
            if path.stat().st_size <= budget or quality <= 60:
                break
            quality -= 2
        print(f"{path.relative_to(REPO)}: {w} x {h}, quality {quality}, {path.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
