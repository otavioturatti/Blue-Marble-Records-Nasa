# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""Invert an SVS colorbar: frame color -> position on the color scale (0..1) -> physical value.

Method:
  1. Read the official colorbar EXR, take the median color of a clean band of rows
     (below the white tick marks) for every column between the first and last tick.
  2. Fit column -> value from the tick positions (-4 ... +4 for SVS 5176).
  3. Convert colors from linear RGB (EXR) to CIELAB, so distances match perception.
  4. For each frame pixel, find the nearest colorbar color (k-d tree in CIELAB).
     Pixels farther than MAX_DELTA_E from the colorbar are "no data" (land, sea ice,
     coast blends). Both colorbar and frames are linear EXR from the same renderer,
     so no gamma mismatch is introduced.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import OpenEXR
from scipy.spatial import cKDTree

MAX_DELTA_E = 8.0


def read_exr_rgb(path: Path) -> np.ndarray:
    """Linear RGB float32 array (H, W, 3)."""
    with OpenEXR.File(str(path)) as f:
        ch = f.channels()
        if "RGBA" in ch:
            px = ch["RGBA"].pixels[..., :3]
        elif "RGB" in ch:
            px = ch["RGB"].pixels
        else:
            px = np.stack([ch[k].pixels for k in ("R", "G", "B")], axis=-1)
    return px.astype(np.float32)


# --------------------------------------------------------------- color -----

def linear_to_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def linear_to_lab(rgb: np.ndarray) -> np.ndarray:
    """Linear sRGB (D65) -> CIELAB."""
    rgb = np.clip(rgb.astype(np.float64), 0.0, None)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = rgb @ m.T / np.array([0.95047, 1.0, 1.08883])
    e = 216 / 24389
    k = 24389 / 27
    f = np.where(xyz > e, np.cbrt(xyz), (k * xyz + 16) / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


# ------------------------------------------------------------- colorbar ----

@dataclass
class Colorbar:
    v01: np.ndarray        # (N,) position on the scale, 0..1
    lab: np.ndarray        # (N, 3)
    rgb_linear: np.ndarray  # (N, 3)
    tree: cKDTree
    ticks_x: list[float]

    def decode_rgb(self, rgb_linear: np.ndarray, max_delta_e: float = MAX_DELTA_E):
        """(H, W, 3) linear RGB -> (v01 with NaN for no data, delta_e) arrays (H, W)."""
        # EXR pixels are half floats: pack the three 16-bit patterns into one int64 key,
        # so finding the unique colors is a fast 1-D operation.
        bits = rgb_linear.reshape(-1, 3).astype(np.float16).view(np.uint16).astype(np.int64)
        keys = (bits[:, 0] << 32) | (bits[:, 1] << 16) | bits[:, 2]
        ukeys, first, inverse = np.unique(keys, return_index=True, return_inverse=True)
        uniq = rgb_linear.reshape(-1, 3)[first]
        dist, idx = self.tree.query(linear_to_lab(uniq), k=1, workers=-1)
        v = np.where(dist <= max_delta_e, self.v01[idx], np.nan)
        shape = rgb_linear.shape[:2]
        inverse = inverse.reshape(-1)
        return v[inverse].reshape(shape), dist[inverse].reshape(shape)


def find_ticks(row: np.ndarray) -> list[float]:
    """Centers of white tick marks along one row of the colorbar image."""
    spread = row.max(1) - row.min(1)
    white = np.where((spread < 0.05) & (row.mean(1) > 0.6))[0]
    runs = np.split(white, np.where(np.diff(white) > 1)[0] + 1)
    return [float(r.mean()) for r in runs if len(r)]


def load_colorbar(path: Path, band_rows=(990, 1016), tick_row=955, n_ticks=9) -> Colorbar:
    """Build the lookup for SVS 5176's colorbar (4096 x 2048 EXR, -4..+4 with 9 ticks).

    The tick row also crosses the white outline of the two end arrows; the 9 ticks are
    the evenly spaced run, found as the longest chain with near-constant spacing.
    """
    img = read_exr_rgb(path)
    runs = find_ticks(img[tick_row])
    best = None
    for i in range(len(runs) - n_ticks + 1):
        chain = np.array(runs[i:i + n_ticks])
        gaps = np.diff(chain)
        score = gaps.std() / gaps.mean()
        if best is None or score < best[0]:
            best = (score, chain)
    score, ticks = best
    if score > 0.02:
        raise ValueError(f"tick spacing not regular (cv={score:.3f}): {runs}")
    x0, x1 = ticks[0], ticks[-1]
    xs = np.arange(int(np.ceil(x0)), int(np.floor(x1)) + 1)
    band = np.median(img[band_rows[0]:band_rows[1], xs], axis=0)
    v01 = (xs - x0) / (x1 - x0)
    lab = linear_to_lab(band)
    return Colorbar(v01=v01, lab=lab, rgb_linear=band, tree=cKDTree(lab), ticks_x=[float(t) for t in ticks])
