# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Validate the fire record against NASA GIBS VIIRS thermal anomalies (independent rendering).

Reference: GIBS layers VIIRS_SNPP_Thermal_Anomalies_375m_All and
VIIRS_NOAA21_Thermal_Anomalies_375m_All, one image per day. For a 1-degree cell and a date d,
the reference coverage is the share of the cell (100 x 100 px request) covered by any
detection of either satellite on days d-4 .. d (the 5-day window of SVS 5113).

Sample per date: half cells where we see fire, half cells where we see none. The quiet cells
are a hard test: land within 3 cells of a fire cell, between 60S and 60N, outside Greenland
(no ice sheets, where fire cannot happen and agreement would be free).

Per sampled land cell we compare:
  * presence: does each side show any fire in the cell?
  * amount:   our hot-pixel density vs the reference coverage (Spearman rank correlation;
              the two renderings draw dots of different sizes, so only the ranking is comparable).

Writes meta.validation and web/data/fire/validation.csv.

Usage:
    python pipeline/validate_fire.py [cells_per_date] [date ...]
"""

from __future__ import annotations

import csv
import io
import sys
import urllib.parse
from datetime import date, timedelta

import numpy as np
from PIL import Image
from scipy.stats import spearmanr

from common import GRID, WEB_DATA, decode_frame, now_iso, read_json, write_json
from validate_sst import http_get

WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
LAYERS = ["VIIRS_SNPP_Thermal_Anomalies_375m_All", "VIIRS_NOAA21_Thermal_Anomalies_375m_All"]
OUT = WEB_DATA / "fire"
WINDOW_DAYS = 5


def reference_coverage(lat: float, lon: float, d: str) -> float:
    covered = np.zeros((100, 100), dtype=bool)
    end = date.fromisoformat(d)
    for k in range(WINDOW_DAYS):
        day = (end - timedelta(days=k)).isoformat()
        for layer in LAYERS:
            params = {
                "SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.3.0", "LAYERS": layer,
                "CRS": "EPSG:4326", "BBOX": f"{lat - 0.5},{lon - 0.5},{lat + 0.5},{lon + 0.5}",
                "WIDTH": "100", "HEIGHT": "100", "FORMAT": "image/png", "TIME": day, "STYLES": "",
            }
            img = Image.open(io.BytesIO(http_get(WMS + "?" + urllib.parse.urlencode(params))))
            covered |= np.asarray(img.convert("RGBA"))[..., 3] > 0
    return float(covered.mean())


def main(argv: list[str]) -> int:
    n = int(argv[0]) if argv else 12
    meta = read_json(OUT / "meta.json")
    if meta.get("synthetic", True):
        raise SystemExit("fire is synthetic; build the real record first.")
    dates = argv[1:] or ["2025-02-10", "2025-06-10", "2025-09-10", "2026-01-10", "2026-09-10"]
    rng = np.random.default_rng(7)
    lo, hi = meta["scale"]["min"], meta["scale"]["max"]
    rows = []
    for d in dates:
        p = np.asarray(Image.open(OUT / "frames" / f"{d}.png"))
        ours = decode_frame(p, lo, hi)
        burning = np.argwhere(p > 1)
        near_fire = np.zeros_like(p, dtype=bool)
        for dr in range(-3, 4):
            for dc in range(-3, 4):
                near_fire |= np.roll(np.roll(p > 1, dr, axis=0), dc, axis=1)
        lat_c = GRID["lat0"] - np.arange(GRID["height"])[:, None] * GRID["step"] + 0 * p
        lon_c = GRID["lon0"] + np.arange(GRID["width"])[None, :] * GRID["step"] + 0 * p
        greenland = (lat_c > 59) & (lon_c > -75) & (lon_c < -10)
        quiet = np.argwhere((p == 1) & near_fire & (np.abs(lat_c) <= 60) & ~greenland)
        picks = list(burning[rng.choice(len(burning), size=min(n // 2, len(burning)), replace=False)])
        picks += list(quiet[rng.choice(len(quiet), size=min(n - len(picks), len(quiet)), replace=False)])
        for r, c in picks:
            lat = GRID["lat0"] - r * GRID["step"]
            lon = GRID["lon0"] + c * GRID["step"]
            ref = reference_coverage(lat, lon, d)
            rows.append({"date": d, "lat": lat, "lon": lon, "ours_pct": round(float(ours[r, c]), 2),
                         "reference_coverage_pct": round(ref * 100, 2)})
            print(f"{d} {lat:+6.1f} {lon:+7.1f} ours={ours[r, c]:6.2f}% ref={ref * 100:6.2f}%", flush=True)

    o = np.array([x["ours_pct"] for x in rows])
    f = np.array([x["reference_coverage_pct"] for x in rows])
    ours_fire, ref_fire = o > 0, f > 0
    rho = spearmanr(o, f).statistic
    any_fire = ours_fire | ref_fire
    rho_fire = spearmanr(o[any_fire], f[any_fire]).statistic
    validation = {
        "points": len(rows),
        "dates": len(dates),
        "presence_agreement": round(float(np.mean(ours_fire == ref_fire)), 3),
        "missed_by_us": int(np.sum(~ours_fire & ref_fire)),
        "extra_in_ours": int(np.sum(ours_fire & ~ref_fire)),
        "spearman_rho": round(float(rho), 3),
        "spearman_rho_fire_cells": round(float(rho_fire), 3),
        "fire_cells": int(any_fire.sum()),
        "quiet_cells": "land within 3 cells of fire, 60S to 60N, no Greenland",
        "reference": "NASA GIBS VIIRS_SNPP and VIIRS_NOAA21 Thermal_Anomalies_375m_All, "
                     f"union of the {WINDOW_DAYS} days ending on the date, same 1-degree cell",
        "note": "amounts are compared by rank only: our values are a share of dots in the SVS rendering, "
                "GIBS draws the same detections at a different size",
        "file": "validation.csv",
        "created": now_iso(),
    }
    with open(OUT / "validation.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    meta["validation"] = validation
    write_json(OUT / "meta.json", meta)
    print(validation)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
