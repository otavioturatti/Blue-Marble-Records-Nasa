# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Make the larger Earth texture and the Moon texture of the globe view (web/css/img/).

  earth-blue-marble-4096.jpg  4096 x 2048, NASA Blue Marble Next Generation with topography
                              and bathymetry, October 2004 (world.topo.bathy.200410). It is the
                              same picture as the existing earth-blue-marble-2048.jpg: --check
                              downscales it to 2048 x 1024 and compares (it also shows that the
                              other months differ, mostly in snow cover).
  moon-1024.jpg               1024 x 512, NASA SVS 4720 "CGI Moon Kit" LROC color map (2019
                              version), equirectangular, longitude 0 at the image center, east
                              to the right, north up.

Both sources are public domain NASA images. Downloads go to raw/ (git-ignored).

Usage:
    python pipeline/make_textures.py            # write both files
    python pipeline/make_textures.py --check    # compare and locate features, write nothing
"""

from __future__ import annotations

import sys
import urllib.request

import numpy as np
from PIL import Image

from common import RAW, REPO

IMG = REPO / "web" / "css" / "img"
EARTH_URL = ("https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/"
             "bmng-topography-bathymetry/october/world.topo.bathy.200410.3x5400x2700.jpg")
EARTH_SRC = RAW / "bluemarble" / "bm_200410.jpg"
MOON_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg"
MOON_SRC = RAW / "moon" / "lroc_color_2k.jpg"


def fetch(url: str, dest) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        dest.write_bytes(r.read())


def save_within(img: Image.Image, path, quality: int, budget: int) -> int:
    """Progressive JPG, stepping the quality down until the file fits the byte budget."""
    while True:
        img.save(path, quality=quality, optimize=True, progressive=True)
        if path.stat().st_size <= budget or quality <= 60:
            return quality
        quality -= 2


def check() -> None:
    ref = np.asarray(Image.open(IMG / "earth-blue-marble-2048.jpg").convert("RGB")).astype(float)
    new = IMG / "earth-blue-marble-4096.jpg"
    for name, path in [("source 5400 x 2700", EARTH_SRC), ("earth-blue-marble-4096.jpg", new)]:
        if path.exists():
            d = np.asarray(Image.open(path).convert("RGB").resize((2048, 1024), Image.LANCZOS)).astype(float)
            print(f"{name} down to 2048 vs earth-blue-marble-2048.jpg: mean abs diff {np.abs(d - ref).mean():.2f}, "
                  f"bias {np.round((d - ref).reshape(-1, 3).mean(0), 2)}")
    moon = IMG / "moon-1024.jpg"
    if moon.exists():
        m = np.asarray(Image.open(moon).convert("L")).astype(float)
        h, w = m.shape

        def at(lat, lon, r=6):
            x, y = int((lon + 180) / 360 * w), int((90 - lat) / 180 * h)
            return m[y - r:y + r + 1, (np.arange(x - r, x + r + 1)) % w].mean()
        # Bright ray craters, each against its east-west mirror (what a flipped map would give):
        # Tycho (43.3S, 11.2W) mirrors into highlands, Copernicus (9.6N, 20.1W) into the dark
        # Mare Tranquillitatis. Mare Crisium (17N, 59E) must be darker than the image mean.
        print(f"moon-1024.jpg: Tycho {at(-43.3, -11.2, 2):.0f} vs mirrored {at(-43.3, 11.2, 2):.0f}; "
              f"Copernicus {at(9.6, -20.1, 2):.0f} vs mirrored {at(9.6, 20.1, 2):.0f}; "
              f"Mare Crisium {at(17.0, 59.1):.0f}; "
              f"image mean {m.mean():.0f}")


def main(argv: list[str]) -> int:
    if "--check" in argv:
        check()
        return 0
    fetch(EARTH_URL, EARTH_SRC)
    fetch(MOON_URL, MOON_SRC)
    earth = Image.open(EARTH_SRC).convert("RGB").resize((4096, 2048), Image.LANCZOS)
    q = save_within(earth, IMG / "earth-blue-marble-4096.jpg", 80, 1_600_000)
    print(f"earth-blue-marble-4096.jpg quality {q}, {(IMG / 'earth-blue-marble-4096.jpg').stat().st_size} bytes")
    moon = Image.open(MOON_SRC).convert("RGB").resize((1024, 512), Image.LANCZOS)
    q = save_within(moon, IMG / "moon-1024.jpg", 82, 150_000)
    print(f"moon-1024.jpg quality {q}, {(IMG / 'moon-1024.jpg').stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
