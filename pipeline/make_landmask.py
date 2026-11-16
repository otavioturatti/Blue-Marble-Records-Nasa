# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Build web/data/landmask.png (360 x 180, 255 = land, 0 = ocean) from the SVS 5176 frame.

In the SST anomaly visualization, land is drawn in neutral gray (R = G = B, about 100),
which no color of the blue-white-red scale uses. A 1-degree cell counts as land when
more than half of its pixels are that gray.

Usage:
    python pipeline/make_landmask.py           # build the mask
    python pipeline/make_landmask.py --check   # also check `surface` of every place
"""

from __future__ import annotations

import sys
import urllib.request

import numpy as np
from PIL import Image

from common import GRID, RAW, WEB_DATA, cell_index, write_json, now_iso
from places import PLACES

SOURCE_URL = "https://svs.gsfc.nasa.gov/vis/a000000/a005100/a005176/sst_mur_anomaly_nodates_most_recent_print.jpg"
SOURCE_FILE = RAW / "5176" / "sst_mur_anomaly_nodates_most_recent_print.jpg"


def gray_land(rgb: np.ndarray) -> np.ndarray:
    """True where a pixel is the neutral land gray (not the near-white zero of the scale)."""
    rgb = rgb.astype(np.int16)
    spread = rgb.max(axis=-1) - rgb.min(axis=-1)
    level = rgb.mean(axis=-1)
    return (spread <= 14) & (level >= 60) & (level <= 175)


def build_mask(src_rgb: np.ndarray) -> np.ndarray:
    land = gray_land(src_rgb).astype(np.uint8) * 255
    small = Image.fromarray(land, mode="L").resize((GRID["width"], GRID["height"]), Image.BOX)
    return np.where(np.asarray(small) >= 128, 255, 0).astype(np.uint8)


def main() -> int:
    if not SOURCE_FILE.exists():
        SOURCE_FILE.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            SOURCE_FILE.write_bytes(r.read())
    rgb = np.asarray(Image.open(SOURCE_FILE).convert("RGB"))
    mask = build_mask(rgb)
    out = WEB_DATA / "landmask.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(mask, mode="L").save(out, optimize=True)
    write_json(WEB_DATA / "landmask.json", {
        "file": "landmask.png",
        "encoding": "255 = land, 0 = ocean; same 1-degree grid as the frames (docs/DATA-FORMAT.md 2.4)",
        "grid": GRID,
        "provenance": {
            "generator": "pipeline/make_landmask.py",
            "source": "NASA SVS 5176 (land drawn in gray in the SST anomaly frame)",
            "source_url": SOURCE_URL,
            # The "most recent" image is replaced daily; this is the copy the mask was built from.
            "source_last_modified": "Fri, 13 Nov 2026 21:31:38 GMT",
            "created": now_iso(),
            "si_assisted_code": True,
        },
    })
    print(f"land cells: {int((mask == 255).sum())} of {mask.size} ({(mask == 255).mean():.1%})")

    if "--check" in sys.argv:
        bad = 0
        for p in PLACES:
            r, c = cell_index(p["lat"], p["lon"])
            real = "land" if mask[r, c] == 255 else "ocean"
            flag = "ok " if real == p["surface"] else "BAD"
            bad += real != p["surface"]
            print(f"  {flag} {p['id']:20s} declared={p['surface']:5s} mask={real}")
        print(f"{bad} mismatches")
        return 1 if bad else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
