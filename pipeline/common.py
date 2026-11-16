# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Shared helpers for the Blue Marble Records data pipeline.

Everything here follows docs/DATA-FORMAT.md section 2:
  * a 1-degree grid, 360 x 180, row 0 = 89.5N, column 0 = 179.5W;
  * frames are 8-bit grayscale PNGs where 0 = no data and 1..255 = position on the color scale;
  * display images are 1024 x 512 equirectangular JPGs, display-hd images the same
    picture at 2048 x 1024 and display-uhd at the native 4096 x 2048, all with 4:4:4 chroma;
  * disc images are 1024 x 1024 south polar views (center = South Pole, rim = 15N,
    0 deg longitude pointing up, east increasing clockwise), sampled from the full
    4096 x 2048 frame; disc-thumb images are the same disc at 256 x 256.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
WEB_DATA = REPO / "web" / "data"
RAW = REPO / "raw"

GRID = {"width": 360, "height": 180, "lat0": 89.5, "lon0": -179.5, "step": 1}
DISPLAY_SIZE = (1024, 512)
DISPLAY_QUALITY = 82             # JPEG quality of display
DISPLAY_HD_SIZE = (2048, 1024)   # same picture as display, for when it is shown large
DISPLAY_HD_QUALITY = 80          # JPEG quality of display-hd (about 140 to 500 KB per frame)
DISPLAY_UHD_SIZE = (4096, 2048)  # native size of the SVS frames, for the globe on capable devices
DISPLAY_UHD_QUALITY = 82
# Every display tier keeps full chroma (4:4:4, subsampling=0): at 4:2:0 the red fire dots wash
# toward yellow and the color edges of the SST fronts blur, which hurts most on the small tiers
# that phones get.
DISPLAY_SUBSAMPLING = 0
DISC_SIZE = 1024
DISC_QUALITY = 82
DISC_SOURCE_SIZE = (4096, 2048)  # sRGB equirectangular size the disc is sampled from
DISC_RIM_LAT = 15.0  # degrees north at the rim of the disc
DISC_THUMB_SIZE = 256            # disc-thumb: the disc downscaled (Lanczos) for the small picture
DISC_THUMB_QUALITY = 70          # with 4:4:4 chroma: about 20 KB (SST) and 6 KB (fire) per file


# ---------------------------------------------------------------- grid ----

def cell_centers() -> tuple[np.ndarray, np.ndarray]:
    """Return (lat, lon) 2-D arrays of cell centers, shape (180, 360)."""
    lats = GRID["lat0"] - np.arange(GRID["height"]) * GRID["step"]
    lons = GRID["lon0"] + np.arange(GRID["width"]) * GRID["step"]
    return np.meshgrid(lats, lons, indexing="ij")


def cell_index(lat: float, lon: float) -> tuple[int, int]:
    """Row and column of the cell that contains (lat, lon), as in contract 2.4."""
    lon = ((lon + 180.0) % 360.0) - 180.0
    row = math.floor((GRID["lat0"] - lat) / GRID["step"] + 0.5)
    col = math.floor((lon - GRID["lon0"]) / GRID["step"] + 0.5)
    row = min(max(row, 0), GRID["height"] - 1)
    col = min(max(col, 0), GRID["width"] - 1)
    return row, col


# ------------------------------------------------------------ encoding ----

def encode_frame(values: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    """Physical values (NaN = no data) to contract pixel values (uint8).

    p = 0 means no data; p = 1 + round(v01 * 254) otherwise. Values at or beyond
    the ends of the scale are clipped, so p = 1 and p = 255 mean "at or below min"
    and "at or above max" when the scale saturates.
    """
    v01 = (values - vmin) / (vmax - vmin)
    v01 = np.clip(v01, 0.0, 1.0)
    p = 1 + np.rint(v01 * 254.0)
    p = np.where(np.isnan(values), 0, p)
    return p.astype(np.uint8)


def decode_frame(p: np.ndarray, vmin: float, vmax: float) -> np.ndarray:
    """Inverse of encode_frame, for checks: returns physical values with NaN for no data."""
    v01 = (p.astype(np.float64) - 1.0) / 254.0
    out = vmin + v01 * (vmax - vmin)
    return np.where(p == 0, np.nan, out)


def save_frame(path: Path, p: np.ndarray) -> None:
    assert p.shape == (GRID["height"], GRID["width"]) and p.dtype == np.uint8
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(p, mode="L").save(path, optimize=True)


# -------------------------------------------------------------- images ----

def save_jpg(path: Path, rgb: np.ndarray, quality: int = 82, subsampling: int | None = None) -> None:
    """Progressive JPG. subsampling=0 keeps full chroma (4:4:4); None is Pillow's default (4:2:0)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    extra = {} if subsampling is None else {"subsampling": subsampling}
    Image.fromarray(rgb.astype(np.uint8), mode="RGB").save(
        path, quality=quality, optimize=True, progressive=True, **extra)


def polar_disc(equirect_rgb: np.ndarray, size: int = DISC_SIZE, rim_lat: float = DISC_RIM_LAT,
               supersample: int = 2) -> np.ndarray:
    """Reproject an equirectangular RGB image (any size, 2:1) to the south polar disc.

    Azimuthal equidistant: radius grows linearly from the South Pole (center) to rim_lat (edge).
    Angle = longitude, 0 deg pointing up, east increasing clockwise. Outside the disc is black.
    The disc is sampled at supersample x size and box-filtered down to size, so the radial
    squeeze (105 degrees of latitude over size / 2 pixels) does not alias.
    """
    if supersample > 1:
        big = polar_disc(equirect_rgb, size * supersample, rim_lat, supersample=1)
        return np.asarray(Image.fromarray(big.astype(np.uint8), mode="RGB").resize((size, size), Image.BOX))
    h, w, _ = equirect_rgb.shape
    c = (size - 1) / 2.0
    radius = size / 2.0
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float64)
    dx, dy = xx - c, yy - c
    r = np.hypot(dx, dy)
    lon = np.degrees(np.arctan2(dx, -dy))           # 0 = up, clockwise positive (east)
    lat = -90.0 + (r / radius) * (rim_lat + 90.0)
    # Skip the outermost columns: some frames have a dark seam at 180 degrees.
    col = np.clip(((lon + 180.0) / 360.0 * w).astype(int) % w, 1, w - 2)
    row = np.clip(((90.0 - lat) / 180.0 * h).astype(int), 0, h - 1)
    out = equirect_rgb[row, col]
    out[r > radius] = 0
    return out


DISPLAY_TIERS = {   # folder: (size, JPEG quality); same frame, same conversion, same geometry
    "display": (DISPLAY_SIZE, DISPLAY_QUALITY),
    "display-hd": (DISPLAY_HD_SIZE, DISPLAY_HD_QUALITY),
    "display-uhd": (DISPLAY_UHD_SIZE, DISPLAY_UHD_QUALITY),
}


def save_display(out_dir: Path, tier: str, date: str, srgb: np.ndarray) -> None:
    """Write <tier>/{date}.jpg; srgb must already be at the tier's size (DISPLAY_TIERS)."""
    size, quality = DISPLAY_TIERS[tier]
    assert (srgb.shape[1], srgb.shape[0]) == size, f"{tier} must be {size}"
    save_jpg(out_dir / tier / f"{date}.jpg", srgb, quality=quality, subsampling=DISPLAY_SUBSAMPLING)


def disc_thumb(disc_rgb: np.ndarray, size: int = DISC_THUMB_SIZE) -> np.ndarray:
    """The disc downscaled to size x size with Lanczos (never upscaled)."""
    assert disc_rgb.shape[0] >= size and disc_rgb.shape[1] >= size, "disc-thumb never upscales"
    return np.asarray(Image.fromarray(disc_rgb.astype(np.uint8), mode="RGB").resize((size, size), Image.LANCZOS))


def save_disc(out_dir: Path, date: str, srgb_equirect: np.ndarray) -> None:
    """Write disc/{date}.jpg (contract 2.5) and disc-thumb/{date}.jpg, the same disc at 256 x 256.

    srgb_equirect is the sRGB frame at DISC_SOURCE_SIZE. The thumb is made from the disc pixels
    before JPEG, with full chroma.
    """
    disc = polar_disc(srgb_equirect)
    save_jpg(out_dir / "disc" / f"{date}.jpg", disc, quality=DISC_QUALITY)
    save_jpg(out_dir / "disc-thumb" / f"{date}.jpg", disc_thumb(disc), quality=DISC_THUMB_QUALITY, subsampling=0)


def lerp_colormap(v01: np.ndarray, stops: list[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
    """Piecewise-linear colormap. stops = [(position 0..1, (r, g, b)), ...]."""
    pos = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], dtype=np.float64)
    out = np.empty(v01.shape + (3,), dtype=np.float64)
    for k in range(3):
        out[..., k] = np.interp(v01, pos, cols[:, k])
    return out


# --------------------------------------------------------------- json -----

def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))
