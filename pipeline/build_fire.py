# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Build the real fire record (web/data/fire/) from SVS 5113, as hot-pixel density.

The SVS 5113 frames draw every VIIRS fire detection of a 5-day moving window as a dot
(colored by fire radiative power, from dark red to white) over a fixed base map: black land
and a dark blue ocean. We never report power (MW): dots drawn about 10 km wide and
overlapping over 5 days do not give a power per cell. We only count where dots are:

  1. Background: the newest frames of the generation are still empty (no detections yet),
     so the empty frame 900 is the exact base map, pixel by pixel. Two empty frames differ
     by at most 5.4 delta E (noise).
  2. Fire pixel: any pixel more than FIRE_DELTA_E away from the background at the same
     position, whatever the dot color (red, yellow, white or a gray blend of a white dot
     with black land). An earlier version matched dot colors to the colorbar and missed
     white and gray pixels; this version does not depend on the dot color.
  3. Land: background pixels nearer to land black than to ocean blue. Fire pixels count
     as land too (a dot can spill over the coast).
  4. Per 1-degree cell: density = fire pixels / land pixels; no data when less than half
     of the cell is land. Encoded on a fixed scale for every date (contract 2.4).

The number is relative: it is the share of map pixels covered by detection dots in the
SVS rendering, not the share of land that burned.

Usage:
    python pipeline/build_fire.py              # all downloaded dates
    python pipeline/build_fire.py --stats      # print the density distribution only
"""

from __future__ import annotations

import re
import shutil
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

from colorbar import linear_to_lab, linear_to_srgb, read_exr_rgb
from common import (
    DISC_SOURCE_SIZE, DISPLAY_TIERS, GRID, RAW, WEB_DATA,
    now_iso, save_disc, save_display, save_frame, write_json,
)

SRC = RAW / "5113"
OUT = WEB_DATA / "fire"
FRAME_RE = re.compile(r"fire_(\d{4}-\d{2}-\d{2})\.exr$")

# Empty frame used as the base map (same 2026-11-14 generation as the dated frames).
BACKGROUND = SRC / "background_900.exr"
BACKGROUND_URL = ("https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005113/frames/"
                  "4096x2048_2x1_30p/SoaS/fires_frp_VIIRS_eq_nl.900.exr")

LAND_RGB = np.array([0.0, 0.0, 0.0])
OCEAN_RGB = np.array([0.01634, 0.03230, 0.06630])
FIRE_DELTA_E = 20.0   # about 4x the largest difference between two empty frames (5.4)
MIN_LAND = 0.5

# Fixed density scale, the same for every date, set from the measured distribution
# (see --stats); above it the value saturates and is reported as "at or above".
DENSITY_MAX = 0.50

# Dates left out on purpose. On the 2026-11-14 generation the newest frames are still being
# filled in near real time: frames 898 to 900 (2026-11-11 to 2026-11-13) are empty and file
# sizes start dropping at frame 893 (2026-11-07). 2026-11-10 (frame 897) is partial.
EXCLUDED_DATES = {
    "2026-11-10": "incomplete: the newest frames are still being filled in near real time "
                  "(frames for 2026-11-11 to 2026-11-13 are empty)",
}

META = {
    "id": "fire",
    "title": "Active Fires",
    "short": "Fire activity (hot-pixel density)",
    "svs_id": 5113,
    "svs_url": "https://svs.gsfc.nasa.gov/5113/",
    "dataset": "VIIRS active fires (Suomi NPP and NOAA-21), 5-day moving window, via NASA SVS",
    "quantity": "fire activity (hot-pixel density, relative)",
    "unit": "% of land pixels with fire dots",
    "surface": "land",
    "default_place": "uberlandia",
}


def load_background() -> tuple[np.ndarray, np.ndarray]:
    """(background CIELAB per pixel, land mask) from the empty frame."""
    if not BACKGROUND.exists():
        req = urllib.request.Request(BACKGROUND_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=300) as r:
            BACKGROUND.write_bytes(r.read())
    rgb = read_exr_rgb(BACKGROUND)
    lab = linear_to_lab(rgb)
    d_land = np.linalg.norm(lab - linear_to_lab(LAND_RGB), axis=-1)
    d_ocean = np.linalg.norm(lab - linear_to_lab(OCEAN_RGB), axis=-1)
    if lab[..., 0].max() > 30:
        raise SystemExit("background frame is not empty: re-check which frames are blank")
    return lab, d_land <= d_ocean


def classify(rgb: np.ndarray, bg_lab: np.ndarray, bg_land: np.ndarray) -> np.ndarray:
    """0 = land, 1 = ocean, 2 = fire, per pixel."""
    fire = np.linalg.norm(linear_to_lab(rgb) - bg_lab, axis=-1) > FIRE_DELTA_E
    cls = np.where(bg_land, 0, 1).astype(np.uint8)
    cls[fire] = 2
    return cls


def cell_fractions(mask: np.ndarray) -> np.ndarray:
    """Exact area fraction of True pixels in every 1-degree cell, (180, 360)."""
    f = Image.fromarray(mask.astype(np.float32), mode="F")
    fine = np.asarray(f.resize((GRID["width"] * 10, GRID["height"] * 10), Image.BOX))
    return fine.reshape(GRID["height"], 10, GRID["width"], 10).mean(axis=(1, 3))


def density(cls: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    fire = cell_fractions(cls == 2)
    land = cell_fractions(cls != 1)
    with np.errstate(invalid="ignore", divide="ignore"):
        dens = np.where(land >= MIN_LAND, fire / land, np.nan)
    return dens, land


def encode(dens: np.ndarray) -> np.ndarray:
    v01 = np.clip(dens / DENSITY_MAX, 0, 1)
    p = 1 + np.rint(v01 * 254)
    return np.where(np.isnan(dens), 0, p).astype(np.uint8)


def to_srgb8(rgb_linear: np.ndarray, size) -> np.ndarray:
    srgb = (linear_to_srgb(rgb_linear) * 255.0 + 0.5).astype(np.uint8)
    return np.asarray(Image.fromarray(srgb, mode="RGB").resize(size, Image.LANCZOS))


def available_dates(include_excluded: bool = False) -> list[str]:
    found = sorted(m[1] for f in SRC.glob("fire_*.exr") if (m := FRAME_RE.search(f.name)))
    return found if include_excluded else [d for d in found if d not in EXCLUDED_DATES]


def main(argv: list[str]) -> int:
    stats_only = "--stats" in argv
    dates = [a for a in argv if not a.startswith("--")] or available_dates(include_excluded=stats_only)
    if not dates:
        raise SystemExit("No frames in raw/5113. Run `python pipeline/download.py fire` first.")
    bg_lab, bg_land = load_background()
    if not stats_only:
        shutil.rmtree(OUT, ignore_errors=True)

    per_date, all_dens = {}, []
    for d in dates:
        t0 = time.time()
        rgb = read_exr_rgb(SRC / f"fire_{d}.exr")
        cls = classify(rgb, bg_lab, bg_land)
        dens, _ = density(cls)
        valid = dens[np.isfinite(dens)]
        per_date[d] = {
            "fire_pixels": int((cls == 2).sum()),
            "cells_with_fire": int((valid > 0).sum()),
            "p99_density": round(float(np.percentile(valid[valid > 0], 99)) if (valid > 0).any() else 0.0, 4),
            "max_density": round(float(valid.max()), 4),
            "saturated_cells": int((valid >= DENSITY_MAX).sum()),
        }
        print(f"{d}: {time.time() - t0:.1f}s {per_date[d]}", flush=True)
        if d in EXCLUDED_DATES:
            continue
        all_dens.append(valid)
        if stats_only:
            continue
        save_frame(OUT / "frames" / f"{d}.png", encode(dens))
        for tier, (size, _) in DISPLAY_TIERS.items():   # display, display-hd, display-uhd (4:4:4)
            save_display(OUT, tier, d, to_srgb8(rgb, size))
        save_disc(OUT, d, to_srgb8(rgb, DISC_SOURCE_SIZE))   # disc/ and disc-thumb/

    burning = np.concatenate([v[v > 0] for v in all_dens])
    print("density of cells with fire, percentiles 50/90/99/99.9:",
          np.percentile(burning, [50, 90, 99, 99.9]).round(4),
          f"share of fire cells saturated: {(burning >= DENSITY_MAX).mean():.3f}")
    if stats_only:
        return 0

    meta = dict(META)
    meta.update({
        "scale": {"min": 0, "max": round(DENSITY_MAX * 100, 1), "saturates": True, "kind": "sequential"},
        "grid": GRID,
        "dates": sorted(per_date),
        "frames": "frames/{date}.png",
        "display": "display/{date}.jpg",
        "display_hd": "display-hd/{date}.jpg",
        "display_uhd": "display-uhd/{date}.jpg",
        "disc": "disc/{date}.jpg",
        "disc_thumb": "disc-thumb/{date}.jpg",
        # Written by another script (outside fire/, which this script rewrites); listed here
        # so a rebuild keeps it in meta.json.
        "land_mask": "../landmask-fire-hd.png",     # pipeline/make_landmask_hd.py --record fire
        # Wet vs dry season, not year vs year: one 5-day window per date is too noisy to
        # claim that one year burned more than another.
        "compare": [{
            "place": "uberlandia", "a": "2025-02-10", "b": "2025-09-10",
            "note": "Wet season vs dry season in the Cerrado around Uberlândia (5-day windows)",
        }],
        "synthetic": False,
        "validation": None,
        "method": {
            "source_frames": "SVS 5113 'SoaS' equirectangular EXR without labels, 4096 x 2048 (about 10 km "
                             "per pixel); each frame draws the VIIRS detections of a 5-day moving window",
            "window": "SVS says 'moving five-day window' without saying how it aligns; NASA GIBS daily "
                      "detections match the 5 days ending on the frame date best (inferred, not documented)",
            "frame_dates": "frames are numbered, not dated; dates read from the date stamp of the labeled "
                           "EIC version of the 2026-11-14 generation (frames 001, 035, 111, 368, 372, 450, "
                           "817, 822, 859, 897, 900 checked): "
                           "date(n) = 2024-11-13 + floor((n - 1) * 730 / 899) days",
            "classification": f"fire pixel = more than {FIRE_DELTA_E:g} delta E (CIELAB) away from the same "
                              "pixel of the empty frame 900 (the base map), whatever the dot color; "
                              "land = base map pixels nearer to land black than to ocean blue",
            "density": f"fire pixels / land pixels in each 1-degree cell; no data if less than "
                       f"{MIN_LAND:.0%} of the cell is land",
            "scale": f"fixed for all dates: 0 to {DENSITY_MAX:.0%}; saturates above "
                     "(where detection dots overlap, mostly African savannas at the peak of their season)",
            "relative": "a share of map pixels covered by detection dots drawn about 10 km wide, not a "
                        "share of land that burned; rankings are robust, absolute values depend on the "
                        "rendering",
            "excluded_dates": EXCLUDED_DATES,
            "not_measured": "fire radiative power (MW): overlapping dots over 5 days do not give a power "
                            "per cell, so dot colors are used only to see where fire is",
            "per_date": per_date,
        },
        "provenance": {
            "generator": "pipeline/build_fire.py",
            "source": "NASA SVS 5113",
            "created": now_iso(),
            "si_assisted_code": True,
        },
    })
    write_json(OUT / "meta.json", meta)
    print(f"meta.json: {len(meta['dates'])} dates")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
