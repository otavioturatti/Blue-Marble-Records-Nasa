# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Validate the decoded SST anomaly record against an independent NASA rendering.

Reference: NASA GIBS layer GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies (same MUR v4.1
anomaly product, rendered by a different pipeline with a published colormap of 0.1 °C classes,
saturating below -3 and above +3 °C).

For each sampled 1-degree ocean cell and date:
  * ours:      the value our frame PNG gives for the cell (contract 2.4);
  * reference: the median of the GIBS pixels inside the same cell (20 x 20 px WMS request),
               each pixel mapped to the center of its 0.1 °C class.
Cells where either side is saturated (|value| >= 3 °C) are excluded from the error stats.

Writes meta.validation and web/data/sst-anomaly/validation.csv (every point, for openness).

Usage:
    python pipeline/validate_sst.py [points_per_date] [date ...]
"""

from __future__ import annotations

import csv
import io
import re
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image

from common import GRID, WEB_DATA, decode_frame, read_json, write_json, now_iso

LAYER = "GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies"
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
CMAP_URL = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GHRSST_Sea_Surface_Temperature_Anomalies.xml"
OUT = WEB_DATA / "sst-anomaly"
REF_SATURATION = 3.0


def http_get(url: str, tries: int = 3) -> bytes:
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:
            if k == tries - 1:
                raise
            print(f"  retry: {e}", flush=True)
            time.sleep(2 * (k + 1))
    raise RuntimeError("unreachable")


def load_gibs_colormap() -> dict[tuple[int, int, int], float]:
    """RGB -> class center in °C (saturated ends map to +-inf)."""
    xml = http_get(CMAP_URL).decode("utf-8")
    table = {}
    for rgb, lo, hi in re.findall(r'rgb="(\d+,\d+,\d+)"[^>]*?value="\[([^,]+),([^)\]]+)[)\]]"', xml):
        key = tuple(int(x) for x in rgb.split(","))
        lo_v = float(lo.replace("INF", "inf"))
        hi_v = float(hi.replace("INF", "inf"))
        if np.isinf(lo_v):
            table[key] = -np.inf
        elif np.isinf(hi_v):
            table[key] = np.inf
        else:
            table[key] = (lo_v + hi_v) / 2
    return table


def gibs_cell(lat: float, lon: float, date: str, cmap) -> tuple[float, int]:
    """Median reference value in the 1-degree cell centered on (lat, lon); (nan, 0) if empty."""
    params = {
        "SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.3.0", "LAYERS": LAYER,
        "CRS": "EPSG:4326", "BBOX": f"{lat - 0.5},{lon - 0.5},{lat + 0.5},{lon + 0.5}",
        "WIDTH": "20", "HEIGHT": "20", "FORMAT": "image/png", "TIME": date, "STYLES": "",
    }
    raw = http_get(WMS + "?" + urllib.parse.urlencode(params))
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    px = np.asarray(im).reshape(-1, 4)
    vals = [cmap.get(tuple(int(c) for c in p[:3])) for p in px if p[3] > 0]
    vals = [v for v in vals if v is not None]
    if len(vals) < 200:  # fewer than half of the 400 pixels have data
        return float("nan"), len(vals)
    return float(np.median(vals)), len(vals)


def main(argv: list[str]) -> int:
    n_per_date = int(argv[0]) if argv else 10
    meta = read_json(OUT / "meta.json")
    if meta.get("synthetic", True):
        raise SystemExit("sst-anomaly is synthetic; build the real record first.")
    dates = argv[1:] or meta["dates"][::max(1, len(meta["dates"]) // 6)][:6]
    for c in meta.get("compare", []):
        for d in (c["a"], c["b"]):
            if d in meta["dates"] and d not in dates:
                dates.append(d)
    cmap = load_gibs_colormap()
    rng = np.random.default_rng(42)
    lo, hi = meta["scale"]["min"], meta["scale"]["max"]

    rows = []
    for d in dates:
        p = np.asarray(Image.open(OUT / "frames" / f"{d}.png"))
        ours_all = decode_frame(p, lo, hi)
        cand = np.argwhere(p > 0)
        # stratify by latitude: sample from 6 bands so the tropics do not dominate
        picks = []
        bands = np.array_split(np.arange(GRID["height"]), 6)
        for b in bands:
            inb = cand[np.isin(cand[:, 0], b)]
            if len(inb):
                k = max(1, n_per_date // 6)
                picks += list(inb[rng.choice(len(inb), size=min(k, len(inb)), replace=False)])
        for r, c in picks:
            lat = GRID["lat0"] - r * GRID["step"]
            lon = GRID["lon0"] + c * GRID["step"]
            ref, n = gibs_cell(lat, lon, d, cmap)
            ours = float(ours_all[r, c])
            rows.append({"date": d, "lat": lat, "lon": lon, "ours_c": round(ours, 3),
                         "reference_c": ref,
                         "reference_pixels": n})
            print(f"{d} {lat:+6.1f} {lon:+7.1f} ours={ours:+.2f} ref={ref:+.2f} (n={n})", flush=True)

    def usable(row):
        o, r = row["ours_c"], row["reference_c"]
        return (np.isfinite(r) and abs(o) < REF_SATURATION and abs(r) < REF_SATURATION)

    good = [x for x in rows if usable(x)]
    err = np.array([x["ours_c"] - x["reference_c"] for x in good])

    def cls(v):
        return -1 if v < -0.5 else (1 if v > 0.5 else 0)

    same_class = np.mean([cls(x["ours_c"]) == cls(x["reference_c"]) for x in good])
    validation = {
        "points": int(len(good)),
        "dates": len(dates),
        "mae": round(float(np.mean(np.abs(err))), 3),
        "bias": round(float(np.mean(err)), 3),
        "p90_abs_error": round(float(np.percentile(np.abs(err), 90)), 3),
        "within_0_25": round(float(np.mean(np.abs(err) <= 0.25)), 3),
        "same_class": round(float(same_class), 3),
        "classes": "cold < -0.5 °C, neutral, warm > +0.5 °C",
        "unit": "°C",
        "reference": "NASA GIBS GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies (0.1 °C classes), "
                     "median of the same 1-degree cell",
        "excluded": {
            "saturated": int(sum(1 for x in rows if np.isinf(x["reference_c"])
                                 or abs(x["ours_c"]) >= REF_SATURATION
                                 or (np.isfinite(x["reference_c"]) and abs(x["reference_c"]) >= REF_SATURATION))),
            "no_reference": int(sum(1 for x in rows if np.isnan(x["reference_c"]))),
        },
        "file": "validation.csv",
        "created": now_iso(),
    }
    def csv_row(x):
        ref = x["reference_c"]
        note = ("reference saturated (at or beyond 3 °C)" if np.isinf(ref)
                else "no reference data" if np.isnan(ref) else "")
        return {**x, "reference_c": "" if note else ref, "note": note}

    with open(OUT / "validation.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) + ["note"])
        w.writeheader()
        w.writerows(csv_row(x) for x in rows)
    meta["validation"] = validation
    write_json(OUT / "meta.json", meta)
    print(validation)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
