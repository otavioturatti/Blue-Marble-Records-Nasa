# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Rewrite the display images and discs of both records from the raw SVS frames.

For every date listed in web/data/<record>/meta.json:
  * display/{date}.jpg: the frame (same EXR, same linear-to-sRGB conversion, same Lanczos
    resize as the build scripts) at 1024 x 512, quality 82;
  * display-hd/{date}.jpg: the same picture at 2048 x 1024, quality 80;
  * display-uhd/{date}.jpg: the same picture at the native 4096 x 2048, quality 82;
    every display tier keeps full chroma (4:4:4);
  * disc/{date}.jpg: the south polar disc (contract 2.5) at 1024 x 1024, sampled from
    the full 4096 x 2048 sRGB frame, and disc-thumb/{date}.jpg, the same disc at 256 x 256
    (Lanczos, 4:4:4).

It never touches frames/*.png or validation.csv: the decoded values and the validation stay
exactly as the build scripts left them. The only change it makes to meta.json is adding the
"disc_thumb" key (after "disc") when it writes thumbs and the key is missing. The build scripts
write the same images on a full rebuild; this script only avoids re-decoding every frame.

Usage:
    python pipeline/make_hd.py                  # both records, every tier below
    python pipeline/make_hd.py --display --hd   # any subset of --display, --hd, --uhd, --disc, --thumb
    python pipeline/make_hd.py fire --uhd       # one record
    python pipeline/make_hd.py --thumb          # only disc-thumb/, downscaled from the existing disc/
                                                # (no raw frames needed)
    python pipeline/make_hd.py --check          # compare tiers, check chroma and that every date has
                                                # every file, write nothing
"""

from __future__ import annotations

import sys
import time

import numpy as np
from PIL import Image, JpegImagePlugin

import build_fire
import build_sst
from colorbar import read_exr_rgb
from common import (
    DISC_SIZE, DISC_SOURCE_SIZE, DISC_THUMB_QUALITY, DISC_THUMB_SIZE, DISPLAY_SIZE, DISPLAY_TIERS,
    disc_thumb, read_json, save_disc, save_display, save_jpg, write_json,
)

RECORDS = {
    "sst-anomaly": (build_sst, lambda d: build_sst.SRC / f"sst_mur_anomaly_nodates_{d.replace('-', '')}.exr"),
    "fire": (build_fire, lambda d: build_fire.SRC / f"fire_{d}.exr"),
}
TIER_FLAGS = {"--display": "display", "--hd": "display-hd", "--uhd": "display-uhd"}
SUBSAMPLING_NAMES = {0: "4:4:4", 1: "4:2:2", 2: "4:2:0"}


def load_rgb(path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB")).astype(np.int16)


def mad(a: np.ndarray, b: np.ndarray) -> float:
    """Mean absolute difference per channel, in 8-bit levels."""
    return float(np.abs(a.astype(np.int16) - b.astype(np.int16)).mean())


def chroma(path) -> str:
    return SUBSAMPLING_NAMES.get(JpegImagePlugin.get_sampling(Image.open(path)), "other")


def check(record: str, dates: list[str]) -> bool:
    """Print per-date comparisons; return False when a file is missing, mis-sized or subsampled."""
    mod, exr = RECORDS[record]
    out = mod.OUT
    ok = True
    expected = {tier: size for tier, (size, _) in DISPLAY_TIERS.items()}
    expected["disc"] = (DISC_SIZE, DISC_SIZE)
    expected["disc-thumb"] = (DISC_THUMB_SIZE, DISC_THUMB_SIZE)
    for d in dates:
        problems = []
        for folder, size in expected.items():
            f = out / folder / f"{d}.jpg"
            if not f.exists():
                problems.append(f"{folder} missing")
                continue
            if Image.open(f).size != size:
                problems.append(f"{folder} is {Image.open(f).size}, expected {size}")
            if folder != "disc" and chroma(f) != "4:4:4":
                problems.append(f"{folder} chroma {chroma(f)}")
        if problems:
            ok = False
            print(f"{record} {d}: PROBLEM " + "; ".join(problems), flush=True)
            continue
        line = [f"{record} {d}:"]
        rgb = read_exr_rgb(exr(d)) if exr(d).exists() else None
        if rgb is not None:
            fresh_1024 = mod.to_srgb8(rgb, DISPLAY_SIZE)
            line.append(f"display vs fresh 1024 (lossless) {mad(load_rgb(out / 'display' / f'{d}.jpg'), fresh_1024):.2f}")
            for tier in ("display-hd", "display-uhd"):
                down = np.asarray(Image.open(out / tier / f"{d}.jpg").convert("RGB").resize(DISPLAY_SIZE, Image.LANCZOS))
                line.append(f"{tier} down to 1024 vs fresh 1024 {mad(down, fresh_1024):.2f}")
        disc = Image.open(out / "disc" / f"{d}.jpg").convert("RGB")
        thumb = load_rgb(out / "disc-thumb" / f"{d}.jpg")
        line.append(f"disc-thumb vs disc downscaled {mad(thumb, disc_thumb(np.asarray(disc))):.2f}")
        print("  ".join(line), flush=True)
    return ok


def ensure_disc_thumb_key(record: str) -> None:
    mod, _ = RECORDS[record]
    path = mod.OUT / "meta.json"
    meta = read_json(path)
    if meta.get("disc_thumb") == "disc-thumb/{date}.jpg":
        return
    new = {}
    for k, v in meta.items():
        if k != "disc_thumb":
            new[k] = v
        if k == "disc":
            new["disc_thumb"] = "disc-thumb/{date}.jpg"
    new.setdefault("disc_thumb", "disc-thumb/{date}.jpg")
    write_json(path, new)
    print(f"{record}: meta.json now names disc_thumb", flush=True)


def build(record: str, dates: list[str], tiers: list[str], do_disc: bool, do_thumb: bool) -> None:
    mod, exr = RECORDS[record]
    out = mod.OUT
    for d in dates:
        t0 = time.time()
        if tiers or do_disc:
            rgb = read_exr_rgb(exr(d))
            for tier in tiers:
                save_display(out, tier, d, mod.to_srgb8(rgb, DISPLAY_TIERS[tier][0]))
            if do_disc:
                save_disc(out, d, mod.to_srgb8(rgb, DISC_SOURCE_SIZE))   # writes disc-thumb too
        if do_thumb and not do_disc:
            disc = np.asarray(Image.open(out / "disc" / f"{d}.jpg").convert("RGB"))
            save_jpg(out / "disc-thumb" / f"{d}.jpg", disc_thumb(disc), quality=DISC_THUMB_QUALITY, subsampling=0)
        print(f"{record} {d}: {time.time() - t0:.1f}s", flush=True)
    if do_disc or do_thumb:
        ensure_disc_thumb_key(record)


def main(argv: list[str]) -> int:
    flags = {a for a in argv if a.startswith("--")}
    names = [a for a in argv if not a.startswith("--")] or list(RECORDS)
    every = not (flags & (set(TIER_FLAGS) | {"--disc", "--thumb"}))
    tiers = [t for f, t in TIER_FLAGS.items() if every or f in flags]
    do_disc = every or "--disc" in flags
    do_thumb = every or "--thumb" in flags
    ok = True
    for record in names:
        mod, exr = RECORDS[record]
        dates = read_json(mod.OUT / "meta.json")["dates"]
        if "--check" in flags:
            ok &= check(record, dates)
            continue
        if tiers or do_disc:
            missing = [d for d in dates if not exr(d).exists()]
            if missing:
                raise SystemExit(f"{record}: raw frames missing for {missing}; run pipeline/download.py first")
        build(record, dates, tiers, do_disc, do_thumb)
    if "--check" in flags:
        print("check passed" if ok else "check FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
