// SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Kristen and Arthur.
// Geometry for the visuals: crosshair and place dots on the flat frame, radius on the polar record.

/** Crosshair position on an equirectangular frame, in percent. */
export function crosshairPos(lat, lon) {
  return { xPct: ((lon + 180) / 360) * 100, yPct: ((90 - lat) / 180) * 100 };
}

/** Radius on the record (0 = South Pole at the center, 1 = 15°N at the rim). */
export function discRadius(lat) {
  return Math.min(1, Math.max(0, (lat + 90) / 105));
}

/**
 * The place under a pointer on the flat frame. points: [{ id, lat, lon }]; (x, y) in CSS px from
 * the frame's top left corner; width and height: the frame's drawn size. Each place has a square
 * target of 2 * half px (24 x 24 by default) centred on its dot, however small the dot is drawn;
 * where targets overlap, the place nearest to the pointer wins. Returns the id, or null.
 */
export function pickNearest(points, x, y, width, height, half = 12) {
  if (!(width > 0 && height > 0)) return null;
  let best = null;
  let bestD = Infinity;
  for (const p of points) {
    const { xPct, yPct } = crosshairPos(p.lat, p.lon);
    const dx = (xPct / 100) * width - x;
    const dy = (yPct / 100) * height - y;
    if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
    const d = dx * dx + dy * dy;
    if (d < bestD) { best = p.id; bestD = d; }
  }
  return best;
}

/**
 * Which sizes of the NASA frame a plate climbs through: "sd" (1024 px), then "hd" (2048 px), then
 * "uhd" (4096 px) for a still date on a plate wider than 2048 device pixels. A phone (coarse
 * pointer), a data-saving connection or a plate under 700 CSS px stays on "sd": the 2048 px file
 * cost about 0.5 MB per Play step there for no visible gain (the crosshair math is the same).
 */
export function plateSizes({ cssWidth = 0, dpr = 1, coarse = false, saveData = false, still = true, hasUhd = false } = {}) {
  if (coarse || saveData || cssWidth < 700) return ["sd"];
  const sizes = ["sd", "hd"];
  if (still && hasUhd && cssWidth * dpr > 2048) sizes.push("uhd");
  return sizes;
}
