# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Build the 4096 x 2048 land masks that match each record's frames pixel for pixel.

A picture may replace the side of the coast that is outside the record's `surface` (land on
the sea record, ocean on the fire record) with the base Earth image or a neutral fill. The
masks never change data values: frames/*.png and the decoding stay as they are. Each record
gets its own mask because the two SVS renderings draw different coastlines (the fire base map
draws big lakes and inland seas as water, the SST frames draw them as land gray).

SST (web/data/landmask-hd.png, from raw/5176). A pixel is land when, on EVERY date:
  1. the colorbar decoder classes it as no data (delta E above colorbar.MAX_DELTA_E), and
  2. it is not the flat light gray SVS uses for sea ice (sRGB level >= SEA_ICE_LEVEL; land is
     drawn in a darker, relief-shaded gray, about 80 to 125).
Rule 1 alone keeps seasonal sea ice out (it is open ocean with data on some date), but the
central Arctic pack never melts in these frames, so rule 2 keeps it out too: it stays
NASA's own gray. Ice shelves and the Antarctic and Greenland ice sheets are drawn in land gray
and count as land.

Fire (web/data/landmask-fire-hd.png, from raw/5113). Land is the black land of the empty frame
900, the exact base map under every fire frame (build_fire.load_background: nearer to land
black than to ocean blue in CIELAB), the same land the density in build_fire.py divides by.
The empty frame has no fire dots and no JPEG noise, so no consensus over dates is needed.
Lakes and inland seas the base map draws in ocean blue (the Caspian, the Great Lakes, Lake
Victoria, Baikal) are water here. Land then grows by FIRE_GROW_PX (2 px) so the Blue Marble's
own coast never shows as a light sliver just off the frame's coast (see FIRE_GROW_PX); this only
extends where the frame's own pixels are shown. Fire dots that spill past the grown coast onto
the ocean fill stay on the ocean side; `--check` counts them.

The edge is softened by one pixel: the binary mask is blurred with a Gaussian (sigma 0.6 px),
so coastline pixels take intermediate values. White (255) = land, black (0) = ocean.

Usage:
    python pipeline/make_landmask_hd.py                  # SST mask (and the 2048 version if large)
    python pipeline/make_landmask_hd.py --record fire    # fire mask
    python pipeline/make_landmask_hd.py --check          # SST: compare with landmask.png, overlay to raw/
    python pipeline/make_landmask_hd.py --record fire --check   # fire: compare with frames, overlay to raw/
"""

from __future__ import annotations

import sys

import numpy as np
from PIL import Image, ImageFilter

import build_fire
import build_sst
from colorbar import linear_to_lab, linear_to_srgb, load_colorbar, read_exr_rgb
from common import RAW, WEB_DATA, read_json

OUT = WEB_DATA / "landmask-hd.png"
OUT_FIRE = WEB_DATA / "landmask-fire-hd.png"   # outside fire/: build_fire.py rewrites that folder
SEA_ICE_LEVEL = 150     # sRGB mean level: land gray sits below, sea ice gray (about 178) above
EDGE_SIGMA = 0.6        # pixels
# Fire only: land grows by this radius (pixels, Euclidean disk) before the edge is softened. The
# globe shows the lit Blue Marble on the water side of the mask; where the Blue Marble coastline
# sits offshore of the frame's coastline a thin light sliver of Blue Marble land or shallow water
# showed (1 px offshore of the base map's coast 20% of the Blue Marble is land, 2 px 11%, 3 px 8%,
# 5 to 6 px about 4%). Growing land only extends where the frame's own pixels are shown, so no data
# is hidden (the globe already keeps every frame pixel that is not the flat ocean fill). Radius 2
# cuts the bright sliver by about 73% and turns 1.3% of all pixels to land; radius 1.5 cut 55%.
# The SST mask is never grown: its land fill would cover valid coastal SST pixels.
FIRE_GROW_PX = 2.0
SIZE_LIMIT = 600_000    # bytes; above it a 2048 x 1024 version is written as well


def frame_path(d: str):
    return build_sst.SRC / f"sst_mur_anomaly_nodates_{d.replace('-', '')}.exr"


def land_mask() -> np.ndarray:
    dates = read_json(build_sst.OUT / "meta.json")["dates"]
    cb = load_colorbar(build_sst.SRC / "sst_mur_anomaly_auto_colorbar_01.exr")
    land = None
    for d in dates:
        rgb = read_exr_rgb(frame_path(d))
        v01, _ = cb.decode_rgb(rgb)
        level = (linear_to_srgb(rgb) * 255.0).mean(axis=-1)
        this = ~np.isfinite(v01) & (level < SEA_ICE_LEVEL)
        land = this if land is None else (land & this)
        print(f"{d}: land so far {land.mean():.4f}", flush=True)
    return land


def grow(land: np.ndarray, radius: float) -> np.ndarray:
    """Binary dilation by a Euclidean disk of the given radius (wraps around in longitude)."""
    r = int(np.floor(radius))
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    out = land.copy()
    for dy, dx in zip(yy.ravel(), xx.ravel()):
        if (dy or dx) and dy * dy + dx * dx <= radius * radius:
            shifted = np.roll(land, dx, axis=1)            # longitude wraps
            if dy > 0:
                shifted = np.vstack([np.zeros((dy, land.shape[1]), bool), shifted[:-dy]])
            elif dy < 0:
                shifted = np.vstack([shifted[-dy:], np.zeros((-dy, land.shape[1]), bool)])
            out |= shifted
    return out


def fire_land_mask() -> np.ndarray:
    _, land = build_fire.load_background()
    grown = grow(land, FIRE_GROW_PX)
    print(f"fire base map: land share {land.mean():.4f}; grown by {FIRE_GROW_PX:g} px: {grown.mean():.4f} "
          f"({(grown & ~land).mean():.4%} of pixels turned land)", flush=True)
    return grown


def soften(land: np.ndarray) -> Image.Image:
    img = Image.fromarray(land.astype(np.uint8) * 255, mode="L")
    return img.filter(ImageFilter.GaussianBlur(EDGE_SIGMA))


def check() -> None:
    hd = np.asarray(Image.open(OUT).convert("L")).astype(np.float64) / 255.0
    h, w = hd.shape
    print(f"{OUT.name}: {w} x {h}, land share {hd.mean():.4f}, "
          f"edge pixels (1..254) {((hd > 0) & (hd < 1)).mean():.4f}")
    # Against the 1-degree mask (land = more than half of the cell is land gray).
    coarse = np.asarray(Image.open(WEB_DATA / "landmask.png").convert("L")) >= 128
    frac = np.asarray(Image.fromarray((hd * 255).astype(np.uint8), mode="L")
                      .resize((360, 180), Image.BOX)).astype(np.float64) / 255.0
    agree = ((frac >= 0.5) == coarse).mean()
    print(f"vs landmask.png (1 degree): {agree:.4f} of cells agree; "
          f"land cells {int(coarse.sum())} there, {int((frac >= 0.5).sum())} here")
    # Overlay on one frame: mask edge in magenta over the SVS picture.
    d = "2026-09-10"
    rgb = (linear_to_srgb(read_exr_rgb(frame_path(d))) * 255.0 + 0.5).astype(np.uint8)
    edge = (hd > 0.1) & (hd < 0.9)
    over = rgb.copy()
    over[edge] = [255, 0, 255]
    path = RAW / "landmask_hd_overlay.png"
    Image.fromarray(over).save(path)
    print(f"overlay with frame {d}: {path}")


def check_fire() -> None:
    hd = np.asarray(Image.open(OUT_FIRE).convert("L")).astype(np.float64) / 255.0
    land = hd >= 0.5
    print(f"{OUT_FIRE.name}: {hd.shape[1]} x {hd.shape[0]}, land share {hd.mean():.4f}, "
          f"edge pixels (1..254) {((hd > 0) & (hd < 1)).mean():.4f}")
    bg_lab, bg_land = build_fire.load_background()
    grown = grow(bg_land, FIRE_GROW_PX)
    print(f"vs the base map's own land: {int((land != bg_land).sum())} pixels differ "
          f"({int((land & ~bg_land).sum())} grown onto the ocean side, {int((~land & bg_land).sum())} land lost); "
          f"vs the base map grown by {FIRE_GROW_PX:g} px: {int((land != grown).sum())} pixels differ")
    dates = read_json(build_fire.OUT / "meta.json")["dates"]
    spill = np.zeros_like(land)
    for d in dates:
        lab = linear_to_lab(read_exr_rgb(build_fire.SRC / f"fire_{d}.exr"))
        fire = np.linalg.norm(lab - bg_lab, axis=-1) > build_fire.FIRE_DELTA_E
        on_ocean = fire & ~land
        spill |= on_ocean
        print(f"{d}: fire pixels {int(fire.sum())}, on the ocean side {int(on_ocean.sum())}", flush=True)
    print(f"fire pixels ever on the ocean side (any date): {int(spill.sum())}")
    d = dates[-1]
    rgb = (linear_to_srgb(read_exr_rgb(build_fire.SRC / f"fire_{d}.exr")) * 255.0 + 0.5).astype(np.uint8)
    over = rgb.copy()
    over[(hd > 0.1) & (hd < 0.9)] = [255, 0, 255]
    path = RAW / "landmask_fire_hd_overlay.png"
    Image.fromarray(over).save(path)
    print(f"overlay with frame {d}: {path}")


def main(argv: list[str]) -> int:
    record = argv[argv.index("--record") + 1] if "--record" in argv else "sst-anomaly"
    if record not in ("sst-anomaly", "sst", "fire"):
        raise SystemExit(f"unknown record {record!r}: use sst-anomaly or fire")
    fire = record == "fire"
    if "--check" in argv:
        check_fire() if fire else check()
        return 0
    out = OUT_FIRE if fire else OUT
    img = soften(fire_land_mask() if fire else land_mask())
    img.save(out, optimize=True)
    size = out.stat().st_size
    print(f"{out.relative_to(WEB_DATA.parent.parent)}: {img.size[0]} x {img.size[1]}, {size} bytes")
    if size > SIZE_LIMIT:
        small_path = out.with_name(out.stem + "-2048.png")
        small = img.resize((2048, 1024), Image.BOX)
        small.save(small_path, optimize=True)
        print(f"{small_path.name}: 2048 x 1024, {small_path.stat().st_size} bytes (full size is over {SIZE_LIMIT})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
