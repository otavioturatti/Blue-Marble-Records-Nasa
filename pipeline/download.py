# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Download the NASA SVS frames we need into raw/ (git-ignored).

  sst:  SVS 5176, "nodates" equirectangular EXR frames (4096 x 2048, about 21 MB each)
        on the 10th of every month, plus the colorbar EXR.
  fire: SVS 5113, "SoaS" equirectangular EXR frames without labels (about 7 MB each)
        on the 10th of every month, saved under their date.

Fire frames have no date in their file name. They are numbered 001 to 900 and cover the
last two years, so a frame number means a different date every day the SVS regenerates
them. The mapping below was read from the date stamp of the labeled "EIC" version of the
same frames generated on 2026-11-14 (frames 001, 368, 450, 817 and 900 checked by eye):

    date(n) = 2024-11-13 + floor((n - 1) * 730 / 899) days

The download refuses frames from a different generation, so the mapping cannot silently drift.

Usage:
    python pipeline/download.py sst
    python pipeline/download.py fire
"""

from __future__ import annotations

import math
import sys
import time
import urllib.request
from datetime import date, timedelta
from email.utils import parsedate_to_datetime

from common import RAW

SVS = "https://svs.gsfc.nasa.gov/vis/a000000/a005100"
SST_FRAME = SVS + "/a005176/frames/4096x2048_2x1_30p/sst_mur_anomaly_nodates/sst_mur_anomaly_nodates_{ymd}.exr"
SST_COLORBAR = SVS + "/a005176/sst_mur_anomaly_auto_colorbar_01.exr"

# 10th of every month, 2024-06-10 to 2026-11-10 (the frames start on 2024-05-25).
SST_DATES = [date(2024 + (5 + k) // 12, (5 + k) % 12 + 1, 10).isoformat() for k in range(30)]

FIRE_FRAME = SVS + "/a005113/frames/4096x2048_2x1_30p/SoaS/fires_frp_VIIRS_eq_nl.{n:03d}.exr"
FIRE_FIRST = date(2024, 11, 13)   # date stamp of frame 001 (generation of 2026-11-14)
FIRE_LAST = date(2026, 11, 13)    # date stamp of frame 900
FIRE_FRAMES = 900
FIRE_GENERATION = date(2026, 11, 14)  # Last-Modified day of the frames the mapping was read from
# 10th of every month, 2024-12-10 to 2026-11-10 (24 dates).
FIRE_DATES = [date(2024 + (11 + k) // 12, (11 + k) % 12 + 1, 10).isoformat() for k in range(24)]


def fire_frame_date(n: int) -> date:
    step = (FIRE_LAST - FIRE_FIRST).days / (FIRE_FRAMES - 1)
    return FIRE_FIRST + timedelta(days=math.floor((n - 1) * step + 1e-9))


def fire_frame_number(d: str) -> int:
    """Smallest frame number whose date stamp is d."""
    target = date.fromisoformat(d)
    for n in range(1, FIRE_FRAMES + 1):
        if fire_frame_date(n) == target:
            return n
    raise ValueError(f"{d} is outside the frames ({FIRE_FIRST} to {FIRE_LAST})")


def last_modified(url: str) -> date:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return parsedate_to_datetime(r.headers["Last-Modified"]).date()


def fetch(url: str, dest, tries: int = 3) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=300) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            tmp.replace(dest)
            return True
        except Exception as e:  # network hiccups at the venue are expected
            print(f"  retry {attempt}/{tries} {dest.name}: {e}", flush=True)
            time.sleep(3 * attempt)
    return False


def download_sst() -> int:
    folder = RAW / "5176"
    ok = fetch(SST_COLORBAR, folder / "sst_mur_anomaly_auto_colorbar_01.exr")
    for i, d in enumerate(SST_DATES, 1):
        ymd = d.replace("-", "")
        good = fetch(SST_FRAME.format(ymd=ymd), folder / f"sst_mur_anomaly_nodates_{ymd}.exr")
        ok &= good
        print(f"[{i:2d}/{len(SST_DATES)}] {d} {'ok' if good else 'FAILED'}", flush=True)
    return 0 if ok else 1


def download_fire() -> int:
    folder = RAW / "5113"
    ok = True
    for i, d in enumerate(FIRE_DATES, 1):
        dest = folder / f"fire_{d}.exr"
        n = fire_frame_number(d)
        url = FIRE_FRAME.format(n=n)
        if not dest.exists():
            gen = last_modified(url)
            if gen != FIRE_GENERATION:
                print(f"STOP: frames were regenerated on {gen}; the date mapping was read on "
                      f"{FIRE_GENERATION}. Re-check frame dates before downloading.")
                return 2
        good = fetch(url, dest)
        ok &= good
        print(f"[{i:2d}/{len(FIRE_DATES)}] {d} = frame {n:03d} {'ok' if good else 'FAILED'}", flush=True)
    return 0 if ok else 1


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "sst"
    sys.exit({"sst": download_sst, "fire": download_fire}[what]())
