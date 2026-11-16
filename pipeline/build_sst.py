# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Build the real sea surface temperature anomaly record (web/data/sst-anomaly/) from SVS 5176.

For every downloaded frame (raw/5176/sst_mur_anomaly_nodates_YYYYMMDD.exr):
  1. decode every pixel back to its position on the colorbar (colorbar.py);
  2. aggregate onto the 1-degree grid: median of the valid pixels in the cell,
     "no data" when fewer than half of the pixels are valid;
  3. write frames/{date}.png (contract 2.4), display/{date}.jpg (the frame itself,
     downscaled to 1024 x 512), display-hd/{date}.jpg (the same at 2048 x 1024),
     display-uhd/{date}.jpg (the same at the native 4096 x 2048), all with 4:4:4 chroma,
     disc/{date}.jpg (south polar view, 1024 x 1024, contract 2.5) and
     disc-thumb/{date}.jpg (the same disc at 256 x 256);
  4. write meta.json with "synthetic": false.

Usage:
    python pipeline/build_sst.py            # all downloaded dates
    python pipeline/build_sst.py 2025-11-10 2026-11-10
"""

from __future__ import annotations

import re
import shutil
import sys
import time

import numpy as np
from PIL import Image

from colorbar import MAX_DELTA_E, linear_to_srgb, load_colorbar, read_exr_rgb
from common import (
    DISC_SOURCE_SIZE, DISPLAY_TIERS, GRID, RAW, WEB_DATA,
    now_iso, read_json, save_disc, save_display, save_frame, write_json,
)

SRC = RAW / "5176"
OUT = WEB_DATA / "sst-anomaly"
FRAME_RE = re.compile(r"sst_mur_anomaly_nodates_(\d{4})(\d{2})(\d{2})\.exr$")
MIN_VALID = 0.5  # share of valid pixels a 1-degree cell needs to carry a value

META = {
    "id": "sst-anomaly",
    "title": "Sea Surface Temperature Anomaly",
    "short": "Ocean temperature vs normal",
    "svs_id": 5176,
    "svs_url": "https://svs.gsfc.nasa.gov/5176/",
    "dataset": "MUR SST v4.1 anomaly (JPL), via NASA SVS",
    "quantity": "sea surface temperature anomaly",
    "unit": "°C",
    "scale": {"min": -4, "max": 4, "saturates": True, "kind": "diverging"},
    "surface": "ocean",
    "compare": [{
        "place": "equatorial-pacific", "a": "2025-11-10", "b": "2026-11-10",
        "note": "NOAA CPC: La Niña Advisory (13 Nov 2025) vs El Niño Advisory (12 Nov 2026)",
    }],
    "default_place": "equatorial-pacific",
}


def aggregate(v01: np.ndarray) -> np.ndarray:
    """(2048, 4096) full-resolution v01 with NaN -> (180, 360) cell medians with NaN."""
    h, w = GRID["height"] * 10, GRID["width"] * 10           # 0.1-degree intermediate grid
    rows = ((np.arange(h) + 0.5) * v01.shape[0] / h).astype(int)
    cols = ((np.arange(w) + 0.5) * v01.shape[1] / w).astype(int)
    fine = v01[rows][:, cols]
    blocks = fine.reshape(GRID["height"], 10, GRID["width"], 10).transpose(0, 2, 1, 3).reshape(
        GRID["height"], GRID["width"], 100)
    valid = np.isfinite(blocks).mean(axis=2)
    with np.errstate(all="ignore"):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            med = np.nanmedian(blocks, axis=2)
    return np.where(valid >= MIN_VALID, med, np.nan)


def encode_v01(v01: np.ndarray) -> np.ndarray:
    p = 1 + np.rint(np.clip(v01, 0, 1) * 254)
    return np.where(np.isnan(v01), 0, p).astype(np.uint8)


def to_srgb8(rgb_linear: np.ndarray, size) -> np.ndarray:
    srgb = (linear_to_srgb(rgb_linear) * 255.0 + 0.5).astype(np.uint8)
    return np.asarray(Image.fromarray(srgb, mode="RGB").resize(size, Image.LANCZOS))


def available_dates() -> list[str]:
    out = []
    for f in sorted(SRC.glob("sst_mur_anomaly_nodates_*.exr")):
        m = FRAME_RE.search(f.name)
        if m:
            out.append(f"{m[1]}-{m[2]}-{m[3]}")
    return out


def main(argv: list[str]) -> int:
    dates = argv or available_dates()
    if not dates:
        raise SystemExit("No frames in raw/5176. Run `python pipeline/download.py sst` first.")
    cb = load_colorbar(SRC / "sst_mur_anomaly_auto_colorbar_01.exr")

    # Start clean when the previous content was synthetic.
    meta_path = OUT / "meta.json"
    old = read_json(meta_path) if meta_path.exists() else None
    if old is None or old.get("synthetic", True):
        shutil.rmtree(OUT, ignore_errors=True)
        done, stats = [], {}
    else:
        done, stats = list(old["dates"]), dict(old.get("method", {}).get("per_date", {}))

    for d in dates:
        t0 = time.time()
        rgb = read_exr_rgb(SRC / f"sst_mur_anomaly_nodates_{d.replace('-', '')}.exr")
        v01, de = cb.decode_rgb(rgb)
        cells = aggregate(v01)
        save_frame(OUT / "frames" / f"{d}.png", encode_v01(cells))
        for tier, (size, _) in DISPLAY_TIERS.items():
            save_display(OUT, tier, d, to_srgb8(rgb, size))
        save_disc(OUT, d, to_srgb8(rgb, DISC_SOURCE_SIZE))
        data = np.isfinite(v01)
        stats[d] = {
            "valid_pixels": round(float(data.mean()), 4),
            "median_delta_e": round(float(np.median(de[data])), 2),
            "p95_delta_e": round(float(np.percentile(de[data], 95)), 2),
            "ambiguous_pixels": round(float(((de > 4) & (de <= 12)).mean()), 4),
            "saturated_high_cells": int(np.sum(cells >= 253.5 / 254)),
            "saturated_low_cells": int(np.sum(cells <= 0.5 / 254)),
        }
        if d not in done:
            done.append(d)
        print(f"{d}: {time.time() - t0:.1f}s {stats[d]}", flush=True)

    meta = dict(META)
    meta.update({
        "grid": GRID,
        "dates": sorted(done),
        "frames": "frames/{date}.png",
        "display": "display/{date}.jpg",
        "display_hd": "display-hd/{date}.jpg",
        "display_uhd": "display-uhd/{date}.jpg",
        "disc": "disc/{date}.jpg",
        "disc_thumb": "disc-thumb/{date}.jpg",
        # Written by other scripts; listed here so a rebuild keeps them in meta.json.
        "colorbar": "colorbar.jpg",                 # pipeline/make_colorbar.py
        "colorbar_strip": "colorbar-strip.png",     # pipeline/make_colorbar.py
        "land_mask": "../landmask-hd.png",          # pipeline/make_landmask_hd.py
        "synthetic": False,
        "validation": old.get("validation") if old and not old.get("synthetic", True) else None,
        "method": {
            "source_frames": "SVS 5176 'nodates' equirectangular EXR, 4096 x 2048, linear RGB",
            "colorbar": "SVS 5176 sst_mur_anomaly_auto_colorbar_01.exr; ticks -4..+4 at x = "
                        + ", ".join(f"{t:.1f}" for t in cb.ticks_x),
            "decoding": f"nearest colorbar color in CIELAB; pixels with delta E > {MAX_DELTA_E} are no data "
                        "(land, sea ice, coast blends)",
            "aggregation": f"median of valid pixels per 1-degree cell; no data if fewer than {MIN_VALID:.0%} valid",
            "quantization": "8-bit: 254 steps over 8 °C, about 0.03 °C per step",
            "saturation": "the colorbar ends at -4 and +4 °C; p = 1 and p = 255 mean at or beyond the end",
            "per_date": {k: stats[k] for k in sorted(stats)},
        },
        "provenance": {
            "generator": "pipeline/build_sst.py",
            "source": "NASA SVS 5176",
            "created": now_iso(),
            "si_assisted_code": True,
        },
    })
    write_json(meta_path, meta)
    print(f"meta.json: {len(meta['dates'])} dates")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
