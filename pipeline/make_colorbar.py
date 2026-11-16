# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Ship the official color scale of the SST anomaly record (SVS 5176) for the web app.

Writes, from raw/5176/sst_mur_anomaly_auto_colorbar_01.exr (NASA SVS 5176, public domain):
  * web/data/sst-anomaly/colorbar.jpg: the colorbar as NASA published it (title, end
    arrows, tick labels -4 ... 4, "Degrees Celsius"), cropped to its content, on the
    EXR's own black background, about 1600 px wide. The EXR holds no logo or mission
    identifier, so nothing else is cut.
  * web/data/sst-anomaly/colorbar-strip.png: only the gradient from the -4 tick to the
    +4 tick, 1024 x 16, no labels and no border. Pixel i sits at v01 = i / 1023, so the
    first pixel is exactly -4 °C and the last exactly +4 °C.

Both are converted from linear RGB to sRGB with colorbar.linear_to_srgb, the same
conversion build_sst.py applies to the frames.

The check reads the strip PNG back, converts it to linear RGB, decodes every pixel with
the decoder's own colorbar lookup (colorbar.load_colorbar) and compares the decoded
position with i / 1023. It also compares the strip's 8-bit colors with the decoder's
colorbar colors at the same positions.

Usage:
    python pipeline/make_colorbar.py           # write both files, then check
    python pipeline/make_colorbar.py --check   # check the committed strip only
"""

from __future__ import annotations

import sys

import numpy as np
from PIL import Image

from colorbar import linear_to_srgb, load_colorbar, read_exr_rgb
from common import RAW, WEB_DATA, save_jpg

SRC = RAW / "5176" / "sst_mur_anomaly_auto_colorbar_01.exr"
OUT = WEB_DATA / "sst-anomaly"
IMAGE = OUT / "colorbar.jpg"
STRIP = OUT / "colorbar-strip.png"

SCALE_MIN, SCALE_MAX = -4.0, 4.0
IMAGE_WIDTH = 1600
IMAGE_QUALITY = 88
IMAGE_MARGIN = 40            # source pixels of black kept around the content
STRIP_SIZE = (1024, 16)
# The bar's inside runs from row 927 to 1120; the white tick marks reach rows 930 to 984
# (top) and 1063 to 1117 (bottom). Rows 1010 to 1037 are the clean middle of the bar.
STRIP_ROWS = (1010, 1038)

# Pass thresholds of the check.
MAX_DECODE_ERROR_C = 0.05    # decoded value vs intended value, at any strip pixel
MAX_LEVEL_DIFF = 2           # 8-bit sRGB levels, strip vs decoder colorbar


def srgb8(rgb_linear: np.ndarray) -> np.ndarray:
    return (linear_to_srgb(rgb_linear) * 255.0 + 0.5).astype(np.uint8)


def srgb8_to_linear(s: np.ndarray) -> np.ndarray:
    c = s.astype(np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def make_image(img: np.ndarray) -> np.ndarray:
    """Crop the colorbar to its content (plus a margin) and scale it to IMAGE_WIDTH."""
    content = img.max(axis=2) > 0.0
    rows = np.where(content.any(axis=1))[0]
    cols = np.where(content.any(axis=0))[0]
    h, w = content.shape
    r0, r1 = max(rows[0] - IMAGE_MARGIN, 0), min(rows[-1] + 1 + IMAGE_MARGIN, h)
    c0, c1 = max(cols[0] - IMAGE_MARGIN, 0), min(cols[-1] + 1 + IMAGE_MARGIN, w)
    crop = srgb8(img[r0:r1, c0:c1])
    height = round(crop.shape[0] * IMAGE_WIDTH / crop.shape[1])
    return np.asarray(Image.fromarray(crop, mode="RGB").resize((IMAGE_WIDTH, height), Image.LANCZOS))


def strip_positions() -> np.ndarray:
    return np.arange(STRIP_SIZE[0]) / (STRIP_SIZE[0] - 1)


def make_strip(img: np.ndarray, ticks_x: list[float]) -> np.ndarray:
    """Gradient from the -4 tick to the +4 tick, interpolated in linear light."""
    band = np.median(img[STRIP_ROWS[0]:STRIP_ROWS[1]], axis=0).astype(np.float64)
    x = ticks_x[0] + strip_positions() * (ticks_x[-1] - ticks_x[0])
    cols = np.arange(band.shape[0])
    line = np.stack([np.interp(x, cols, band[:, k]) for k in range(3)], axis=-1)
    return np.repeat(srgb8(line)[None], STRIP_SIZE[1], axis=0)


def check(cb) -> bool:
    strip = np.asarray(Image.open(STRIP).convert("RGB"))
    ok = strip.shape == (STRIP_SIZE[1], STRIP_SIZE[0], 3)
    print(f"{STRIP.relative_to(OUT.parent.parent.parent)}: {strip.shape[1]} x {strip.shape[0]}"
          + ("" if ok else f" (expected {STRIP_SIZE[0]} x {STRIP_SIZE[1]})"))
    line = strip[STRIP_SIZE[1] // 2]
    ok &= bool((strip == line[None]).all())

    pos = strip_positions()
    decoded, de = cb.decode_rgb(srgb8_to_linear(line)[None].astype(np.float32))
    decoded, de = decoded[0], de[0]
    span = SCALE_MAX - SCALE_MIN
    err_c = np.abs(decoded - pos) * span
    ref = srgb8(np.stack([np.interp(pos, cb.v01, cb.rgb_linear[:, k]) for k in range(3)], axis=-1))
    level = np.abs(line.astype(int) - ref.astype(int)).max(axis=1)

    for name, i in (("left (-4)", 0), ("center", 511), ("center", 512), ("right (+4)", 1023)):
        value = SCALE_MIN + pos[i] * span
        print(f"  {name:10s} px {i:4d}: intended {value:+.3f} degC, decoded {SCALE_MIN + decoded[i] * span:+.3f} degC, "
              f"sRGB strip {tuple(int(c) for c in line[i])} vs decoder {tuple(int(c) for c in ref[i])}, "
              f"delta E {de[i]:.2f}")
    print(f"  all {len(pos)} px: max decode error {np.nanmax(err_c):.3f} degC (mean {np.nanmean(err_c):.3f}), "
          f"max sRGB difference {level.max()} levels, max delta E {de.max():.2f}, "
          f"no-data pixels {int(np.isnan(decoded).sum())}")
    ok &= bool(np.isfinite(decoded).all())
    ok &= bool(np.nanmax(err_c) <= MAX_DECODE_ERROR_C)
    ok &= bool(level.max() <= MAX_LEVEL_DIFF)
    print("check: OK" if ok else "check: FAILED")
    return ok


def main(argv: list[str]) -> int:
    cb = load_colorbar(SRC)
    if "--check" not in argv:
        img = read_exr_rgb(SRC)
        image = make_image(img)
        save_jpg(IMAGE, image, quality=IMAGE_QUALITY)
        print(f"{IMAGE.name}: {image.shape[1]} x {image.shape[0]}, {IMAGE.stat().st_size // 1024} KB")
        STRIP.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(make_strip(img, cb.ticks_x), mode="RGB").save(STRIP, optimize=True)
        print(f"{STRIP.name}: {STRIP_SIZE[0]} x {STRIP_SIZE[1]}, {STRIP.stat().st_size} bytes")
    return 0 if check(cb) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
