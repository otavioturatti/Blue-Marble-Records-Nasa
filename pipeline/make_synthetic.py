# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Generate SYNTHETIC data in the exact format of docs/CONTRACT.md section 2.

This lets the interface and the sound engine be built before the real NASA frames are
decoded. Every meta.json says "synthetic": true and every image is stamped
"SYNTHETIC DATA", so nothing here can be mistaken for a measurement.

What the fake data does on purpose:
  * sst-anomaly: the Equatorial Pacific is slightly cold on 2025-11-10 and saturated
    (at or above +4 C) on 2026-11-10, so Compare has something to compare;
    land is "no data" (dead groove).
  * fire: hot-pixel density with a dry-season peak in the Cerrado (Aug to Oct) and
    other fire regions; the ocean is "no data".

Usage:
    python pipeline/make_landmask.py      # once, builds web/data/landmask.png
    python pipeline/make_synthetic.py
"""

from __future__ import annotations

import shutil
from datetime import date

import numpy as np
from PIL import Image, ImageDraw

from common import (
    DISPLAY_SIZE, GRID, WEB_DATA, cell_centers, encode_frame, lerp_colormap,
    now_iso, polar_disc, read_json, save_frame, save_jpg, write_json,
)
from places import PLACES

RNG = np.random.default_rng(20261114)

# One frame on the 10th of every month, June 2024 to November 2026 (30 dates).
# The two Compare dates (2025-11-10 and 2026-11-10) are included.
DATES = [date(2024 + (5 + k) // 12, (5 + k) % 12 + 1, 10).isoformat() for k in range(30)]

SST_STOPS = [  # blue - white - red, like the SVS 5176 colorbar
    (0.00, (5, 48, 97)), (0.25, (67, 147, 195)), (0.50, (247, 247, 247)),
    (0.75, (214, 96, 77)), (1.00, (103, 0, 31)),
]
FIRE_STOPS = [  # dark to yellow-white, for the synthetic display only
    (0.00, (40, 32, 28)), (0.15, (120, 30, 10)), (0.40, (220, 80, 10)),
    (0.70, (255, 180, 40)), (1.00, (255, 250, 210)),
]
LAND_GRAY = (100, 100, 100)
OCEAN_DARK = (12, 22, 40)


def months_since_start(d: str) -> float:
    y, m, _ = map(int, d.split("-"))
    return (y - 2024) * 12 + (m - 6)


def gauss(lat, lon, lat_c, lon_c, s_lat, s_lon):
    dlon = (lon - lon_c + 180.0) % 360.0 - 180.0
    return np.exp(-0.5 * (((lat - lat_c) / s_lat) ** 2 + (dlon / s_lon) ** 2))


def smooth_noise(lat, lon, t, n_waves=6, scale=1.0):
    """A few drifting large-scale waves: looks like weather, means nothing."""
    out = np.zeros_like(lat)
    for k in range(n_waves):
        a, b = RNG.integers(1, 5), RNG.uniform(1, 4)  # integer a: no seam at 180 deg
        ph, sp = RNG.uniform(0, 2 * np.pi), RNG.uniform(0.2, 0.8)
        out += np.sin(np.radians(lon) * a + np.radians(lat) * b + ph + sp * t)
    return scale * out / np.sqrt(n_waves)


# ENSO-like amplitude of the Pacific blob, in degrees C, by month index (0 = Jun 2024).
ENSO = [(0, 0.3), (6, -0.6), (12, 0.0), (17, -1.1), (21, -0.4), (24, 1.0), (27, 2.8), (29, 5.5)]


def sst_field(d: str, lat, lon, land) -> np.ndarray:
    t = months_since_start(d)
    amp = np.interp(t, [p[0] for p in ENSO], [p[1] for p in ENSO])
    v = smooth_noise(lat, lon, t, scale=0.7)
    v += amp * gauss(lat, lon, 0.0, -125.0, 7.0, 40.0)
    v += 1.2 * np.cos(np.radians(30 * t)) * gauss(lat, lon, 45.0, -40.0, 10.0, 30.0)  # N Atlantic wobble
    v = np.where(land, np.nan, v)
    return v


# Fire regions: (lat, lon, s_lat, s_lon, peak month 1..12, strength)
FIRE_REGIONS = [
    (-11.0, -47.0, 5.0, 6.0, 9, 0.85),   # Cerrado
    (-9.0, -60.0, 4.0, 8.0, 8, 0.70),    # southern Amazon arc
    (-20.0, -60.0, 3.0, 4.0, 9, 0.45),   # Chaco and Pantanal
    (-11.0, 22.0, 5.0, 10.0, 7, 0.90),   # southern African savanna
    (9.0, 10.0, 3.0, 14.0, 1, 0.75),     # Sahel
    (-14.0, 132.0, 3.0, 8.0, 10, 0.60),  # northern Australia
    (19.0, 99.0, 4.0, 5.0, 3, 0.55),     # mainland Southeast Asia
    (62.0, 125.0, 5.0, 15.0, 7, 0.40),   # Siberia
    (56.0, -115.0, 5.0, 12.0, 7, 0.35),  # western Canada
    (39.0, -121.0, 3.0, 3.0, 8, 0.30),   # California
]


def fire_field(d: str, lat, lon, land) -> np.ndarray:
    month = int(d[5:7])
    v = np.zeros_like(lat)
    for la, lo, sla, slo, peak, strength in FIRE_REGIONS:
        dm = min(abs(month - peak), 12 - abs(month - peak))
        season = np.exp(-0.5 * (dm / 1.3) ** 2)
        v += strength * season * gauss(lat, lon, la, lo, sla, slo)
    speckle = RNG.random(lat.shape) ** 3          # patchy, like real fire pixels
    v = np.clip(v * (0.4 + 1.2 * speckle), 0.0, 1.0) * 100.0  # percent of hot pixels
    v = np.where(land, v, np.nan)
    return v


def stamp(rgb: np.ndarray, text: str = "SYNTHETIC DATA") -> np.ndarray:
    im = Image.fromarray(rgb.astype(np.uint8), mode="RGB")
    dr = ImageDraw.Draw(im)
    w, h = im.size
    pad = max(4, w // 128)
    box = dr.textbbox((0, 0), text)
    tw, th = box[2] - box[0], box[3] - box[1]
    x, y = pad, h - th - 3 * pad
    dr.rectangle([x - pad, y - pad, x + tw + pad, y + th + pad], fill=(0, 0, 0))
    dr.text((x, y), text, fill=(255, 220, 0))
    return np.asarray(im)


def colorize(values: np.ndarray, vmin: float, vmax: float, stops, nodata_rgb) -> np.ndarray:
    v01 = np.clip((np.nan_to_num(values, nan=vmin) - vmin) / (vmax - vmin), 0, 1)
    rgb = lerp_colormap(v01, stops)
    rgb[np.isnan(values)] = nodata_rgb
    return rgb


def upscale(rgb: np.ndarray, size) -> np.ndarray:
    return np.asarray(Image.fromarray(rgb.astype(np.uint8), mode="RGB").resize(size, Image.NEAREST))


def build_record(rec: dict, field_fn, stops, nodata_rgb, lat, lon, land) -> None:
    folder = WEB_DATA / rec["id"]
    meta_path = folder / "meta.json"
    if meta_path.exists() and not read_json(meta_path).get("synthetic", True):
        print(f"{rec['id']}: real data present, synthetic version skipped")
        return
    if folder.exists():
        shutil.rmtree(folder)
    smin, smax = rec["scale"]["min"], rec["scale"]["max"]
    for d in DATES:
        values = field_fn(d, lat, lon, land)
        save_frame(folder / "frames" / f"{d}.png", encode_frame(values, smin, smax))
        rgb = colorize(values, smin, smax, stops, nodata_rgb)
        display = upscale(rgb, DISPLAY_SIZE)
        save_jpg(folder / "display" / f"{d}.jpg", stamp(display))
        save_jpg(folder / "disc" / f"{d}.jpg", stamp(polar_disc(display)))
    meta = dict(rec)
    meta.update({
        "grid": GRID,
        "dates": DATES,
        "frames": "frames/{date}.png",
        "display": "display/{date}.jpg",
        "disc": "disc/{date}.jpg",
        "synthetic": True,
        "validation": None,
        "provenance": {
            "generator": "pipeline/make_synthetic.py",
            "source": "synthetic (random fields, NOT NASA data); land mask from NASA SVS 5176",
            "created": now_iso(),
            "si_assisted_code": True,
        },
    })
    write_json(folder / "meta.json", meta)
    print(f"{rec['id']}: {len(DATES)} dates -> {folder.relative_to(WEB_DATA.parent.parent)}")


SST = {
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

FIRE = {
    "id": "fire",
    "title": "Active Fires",
    "short": "Fire activity (hot-pixel density)",
    "svs_id": 5113,
    "svs_url": "https://svs.gsfc.nasa.gov/5113/",
    "dataset": "VIIRS active fires (Suomi NPP and NOAA-21), 5-day moving window, via NASA SVS",
    "quantity": "fire activity (hot-pixel density)",
    "unit": "% of area",
    "scale": {"min": 0, "max": 100, "saturates": False, "kind": "sequential"},
    "surface": "land",
    "compare": [{
        "place": "cerrado", "a": "2025-02-10", "b": "2025-09-10",
        "note": "Wet season vs dry season in the Cerrado",
    }],
    "default_place": "uberlandia",
}


def main() -> None:
    mask_path = WEB_DATA / "landmask.png"
    if not mask_path.exists():
        raise SystemExit("Run `python pipeline/make_landmask.py` first.")
    land = np.asarray(Image.open(mask_path)) == 255
    lat, lon = cell_centers()

    build_record(SST, sst_field, SST_STOPS, LAND_GRAY, lat, lon, land)
    build_record(FIRE, fire_field, FIRE_STOPS, OCEAN_DARK, lat, lon, land)

    write_json(WEB_DATA / "records.json", [
        {"id": SST["id"], "title": SST["title"], "meta": "sst-anomaly/meta.json"},
        {"id": FIRE["id"], "title": FIRE["title"], "meta": "fire/meta.json"},
    ])
    write_json(WEB_DATA / "places.json", PLACES)
    print(f"records.json and places.json ({len(PLACES)} places) written")


if __name__ == "__main__":
    main()
