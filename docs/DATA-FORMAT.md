# Data format

The small derived files the web app reads (`web/data/`), written by the Python scripts in `pipeline/`. This is the part of the team's working agreement that describes the data; the section numbers are the ones the code cites.

## 2. Data files (`web/data/`)

### 2.1 `web/data/records.json`

```json
[
  { "id": "sst-anomaly", "title": "Sea Surface Temperature Anomaly", "meta": "sst-anomaly/meta.json" },
  { "id": "fire",        "title": "Active Fires",                    "meta": "fire/meta.json" }
]
```

Order = order shown in the UI.

### 2.2 `web/data/places.json`

```json
[
  { "id": "uberlandia", "name": "Uberlândia, Brazil", "lat": -18.92, "lon": -48.28, "surface": "land" }
]
```

- `surface` is `"land"` or `"ocean"`. It is used for announcements and to pick sensible defaults per record.
- `id` is URL-safe; the UI keeps it in the URL (`?record=...&place=...&date=...`) so a link opens the same place.

### 2.3 `web/data/<record>/meta.json`

```json
{
  "id": "sst-anomaly",
  "title": "Sea Surface Temperature Anomaly",
  "short": "Ocean temperature vs normal",
  "svs_id": 5176,
  "svs_url": "https://svs.gsfc.nasa.gov/5176/",
  "dataset": "MUR SST v4.1 anomaly (JPL), via NASA SVS",
  "quantity": "sea surface temperature anomaly",
  "unit": "°C",
  "scale": { "min": -4, "max": 4, "saturates": true, "kind": "diverging" },
  "surface": "ocean",
  "grid": { "width": 360, "height": 180, "lat0": 89.5, "lon0": -179.5, "step": 1 },
  "dates": ["2024-06-01", "2024-07-01"],
  "frames": "frames/{date}.png",
  "display": "display/{date}.jpg",
  "display_hd": "display-hd/{date}.jpg",
  "display_uhd": "display-uhd/{date}.jpg",
  "disc": "disc/{date}.jpg",
  "disc_thumb": "disc-thumb/{date}.jpg",
  "colorbar": "colorbar.jpg",
  "colorbar_strip": "colorbar-strip.png",
  "land_mask": "../landmask-hd.png",
  "compare": [ { "place": "equatorial-pacific", "a": "2025-11-10", "b": "2026-11-10", "note": "NOAA CPC: La Niña Advisory (13 Nov 2025) vs El Niño Advisory (12 Nov 2026)" } ],
  "default_place": "equatorial-pacific",
  "synthetic": false,
  "validation": null,
  "provenance": { "generator": "pipeline/...", "source": "NASA SVS 5176", "created": "2026-11-14T00:00:00Z", "si_assisted_code": true }
}
```

- `dates` are ISO `YYYY-MM-DD`, ascending. Paths are relative to the `meta.json` folder; replace `{date}`.
- `display_hd` is optional: the same image as `display` at 2048 x 1024, used when the picture is shown large. Fall back to `display` when it is missing.
- `display_uhd` is optional: the same image again at the native 4096 x 2048 of the frames, used when the picture is shown large on capable devices (for example the globe on a desktop GPU). Fall back to `display_hd`, then `display`.
- `disc_thumb` is optional: the same disc as `disc` at 256 x 256, for the small picture of the record (56 to 84 CSS px), which loads one per date during Play. Fall back to `disc` when it is missing.
- `colorbar` and `colorbar_strip` are optional (no `{date}`; one per record). `colorbar` is the color scale image NASA published with the frames, with its title and tick labels, shown next to the frame. `colorbar_strip` is the bare gradient from `scale.min` (left pixel) to `scale.max` (right pixel), 1024 x 16, for small scale indicators. A record without a published legend (the fire record) has neither.
- `land_mask` is optional (no `{date}`): an 8-bit grayscale PNG, 4096 x 2048 equirectangular like `display_uhd`, white (255) = land, black (0) = water, with a one-pixel soft edge. Each record has its own, derived from its own frames, so the coastline matches the picture pixel for pixel and lakes count as land or water the way that record's frames draw them (sea ice is never land). A picture may replace the side of the coast that is outside the record's `surface` (land on an ocean record, water on a land record) with the base Earth image or a neutral fill. It never changes data values: values still come only from `frames/`.
- `synthetic: true` means fake data for development. The UI must show a visible "SYNTHETIC DATA" badge, and the DJ must never speak synthetic numbers as real.
- `validation` is filled by the pipeline later: `{ "points": 30, "mae": 0.21, "unit": "°C", "reference": "NOAA CoastWatch ERDDAP jplMURSST41anom1day" }`.

### 2.4 Frame encoding (`frames/{date}.png`)

- 8-bit grayscale PNG, `grid.width` x `grid.height` (360 x 180).
- Row 0 is the northernmost cell (`lat0` = 89.5); column 0 is the westernmost (`lon0` = -179.5); cell size `step` = 1°.
- Pixel value `p`:
  - `p = 0`: **no data** (land on an ocean record, clouds, outside the frame).
  - `p = 1..255`: `v01 = (p - 1) / 254`, the position on the record's color scale, from 0 to 1.
- Physical value: `value = scale.min + v01 * (scale.max - scale.min)`.
- Saturation, when `scale.saturates` is true:
  - `p = 255` means "at or above `max`" (say "≥ +4 °C, top of scale");
  - `p = 1` means "at or below `min`".
- Cell lookup for a place:
  - `row = floor((lat0 - lat) / step + 0.5)`
  - `col = floor((lon - lon0) / step + 0.5)`
  - both clamped to the grid; `lon` is wrapped into [-180, 180).

### 2.5 Images

- **`display/{date}.jpg`:** the EIC frame as published (or a faithful downscale), equirectangular, 1024 x 512, JPEG with full 4:4:4 chroma (the colors are the data). The UI draws the crosshair on top.
- **`display-hd/{date}.jpg`** (optional, named by `display_hd`): the same image as `display` (same frame, same color conversion) at 2048 x 1024, full 4:4:4 chroma, about 140 to 500 KB per file. Use it when the picture is shown large; the geometry is identical, so crosshair math does not change.
- **`display-uhd/{date}.jpg`** (optional, named by `display_uhd`): the same image at 4096 x 2048, the native size of the SVS frames, JPEG quality 82 with full 4:4:4 chroma (about 0.5 MB per fire frame, 1.5 to 1.6 MB per SST frame). Only for large views on capable devices; same geometry.
- **`disc/{date}.jpg`:** 1024 x 1024, south polar view, sampled from the full 4096 x 2048 frame.
  - The center is the South Pole and the rim is 15°N.
  - Angle = longitude, with 0° pointing up and east increasing clockwise, as seen from above the South Pole. The Earth seen from the south turns clockwise, like a record, so the UI spins the disc clockwise.
  - Outside the disc is black.
- **`disc-thumb/{date}.jpg`** (optional, named by `disc_thumb`): the `disc` image downscaled to 256 x 256 with Lanczos (never upscaled), JPEG quality 70 with full 4:4:4 chroma, about 20 KB per SST frame and 6 KB per fire frame. Same projection, orientation and black outside as `disc`.
