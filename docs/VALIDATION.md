# Validation report

How we know the numbers behind the sound are right.

Blue Marble Records does not invent data. Every value the needle plays is read back from a NASA Earth Information Center (EIC) frame by our Python pipeline (`pipeline/`). Because the frames are pictures, not data files, we checked our decoding in two ways:

- against a **separate NASA rendering of the same data** (NASA GIBS). This tests our decoding, not the satellite data itself;
- with an **independent re-implementation**: separate code, written without our pipeline, that decoded the same frames and compared every cell.

Every compared point is published next to the data (`web/data/<record>/validation.csv`), and the numbers below are also stored in each record's `meta.json` (`validation`).

> SI disclosure: the pipeline code, the independent re-implementations and this report were drafted with AI coding assistants and reviewed by Arthur. The numbers come from running the scripts listed at the end; none were written by hand.

## Where the data comes from

Only two NASA Scientific Visualization Studio (SVS) visualizations feed the app:

- SVS 5176, "Sea Surface Temperature (SST) Anomaly - Near Real Time";
- SVS 5113, "Active Fires As Observed by VIIRS, 2024-Present".

The challenge's Resources tab links the EIC gallery (https://svs.gsfc.nasa.gov/gallery/earth-information-center/) and says "Participants can use the videos and images as data for processing the audio files." That gallery links "Daily Visualizations" (https://svs.gsfc.nasa.gov/gallery/daily-visualizations/), "the data visualizations that are updated daily for NASA's Earth Information Center (EIC)", which lists both 5176 and 5113. Every file we downloaded matches the size served by svs.gsfc.nasa.gov.

NASA GIBS is used only for the checks below, never as a source of the values the app plays.

## Summary

| Record | NASA EIC source | Check against a separate NASA rendering | Independent re-implementation |
|---|---|---|---|
| Sea surface temperature anomaly | SVS 5176 (MUR SST v4.1 anomaly) | GIBS `GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies`, 93 cells, 8 dates: mean absolute error **0.17 °C**, bias +0.04 °C, **88%** in the same class | Mean difference **0.02 °C** per cell, no bias, on 4 dates |
| Active fires | SVS 5113 (VIIRS, 5-day window) | GIBS `VIIRS_SNPP_Thermal_Anomalies_375m_All` and `VIIRS_NOAA21_Thermal_Anomalies_375m_All`, 80 cells, 5 dates: fire presence agrees in **97.5%**, ranking among fire cells Spearman rho **0.94** | Frame dates confirmed on 6 more frames by their printed date |

## 1. Sea surface temperature anomaly (SVS 5176)

### What we decode

- **Frames:** the unlabeled ("nodates") equirectangular EXR frames, 4096 x 2048, linear color, one per month on the 10th, from 2024-06-10 to 2026-11-10 (30 dates). The dated SVS frames of the same days are pixel-identical apart from the printed date.
- **Colorbar:** the official SVS colorbar file for the same visualization, rendered in the same color space as the frames. Its 9 tick marks (-4 to +4 °C) are found automatically and give 3,074 color steps, about 0.003 °C apart.
- **Decoding:** every pixel takes the value of the nearest colorbar color in CIELAB (a color space where distance matches what the eye sees). Pixels farther than 8 units (delta E) from any colorbar color are "no data": land, sea ice and blended coastline pixels.
- **Grid:** the median of the valid pixels in each 1-degree cell. A cell with fewer than half valid pixels is "no data", so coasts and the sea ice edge play the dead-groove sound instead of a guess.
- **Stored precision:** 8 bits, 254 steps over 8 °C, about 0.03 °C per step.

### Decoding quality (every frame)

The colors split cleanly into data and no data, so the 8-unit threshold is not a fine-tuned choice:

| Measure | Range over the 30 dates |
|---|---|
| Median color distance of data pixels to the colorbar | 1.00 to 1.15 delta E |
| 95th percentile | 2.45 to 2.73 delta E |
| Pixels in the ambiguous zone (4 to 12 delta E) | under 1% |
| Land and sea ice pixels | 12 to 40 delta E |

### Check against NASA GIBS

- **Reference:** GIBS layer `GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies`: the same MUR anomaly product, rendered by a separate NASA system with a published colormap of 0.1 °C classes from -3 to +3 °C.
- **Method:** for each sampled cell and date we requested the same 1-degree box from GIBS (20 x 20 pixels), mapped each pixel to the center of its 0.1 °C class and took the median.
- **Sample:** 96 cells on 8 dates, stratified in 6 latitude bands so the tropics do not dominate. We excluded 2 cells where the reference was at or beyond 3 °C (GIBS saturates there) and 1 cell with no reference data, leaving **93 cells**.

| Metric | Result |
|---|---|
| Mean absolute error | **0.17 °C** |
| Mean error (bias) | +0.04 °C |
| 90% of errors below | 0.34 °C |
| Within 0.25 °C | 77% |
| Same class (cold below -0.5 °C, neutral, warm above +0.5 °C) | **88%** |
| Correlation | 0.97 |
| Linear fit | ours = 1.07 x GIBS + 0.01 °C |

**Reading the fit:** our values run about 7% wider than GIBS, meaning slightly farther from zero. This probably comes from the two systems resampling and quantizing colors differently; we did not test the cause. We report it instead of rescaling our values to match GIBS, which would make the check circular.

### Independent re-implementation

Separate code, written without our pipeline, measured the colorbar ticks itself (within 1.5 pixels, 0.004 °C, of ours), decoded 4 dates (2024-08-10, 2025-11-10, 2026-05-10, 2026-11-10) and compared every ocean cell: mean difference 0.022 to 0.024 °C, bias under 0.001 °C, grid aligned (a one-cell shift makes it more than ten times worse). The display images and polar discs matched its own renderings, with the correct orientation.

### The Compare dates

| Place (cell) | 2025-11-10 | 2026-11-10 |
|---|---|---|
| Equatorial Pacific (0 to 1°S, 140 to 139°W) | -0.66 °C (GIBS: -0.65 °C) | ≥ +4 °C, top of scale (all 121 pixels at or above +4; GIBS: in its top class, at least +3 °C) |

### Limits

- **Saturation:** the SVS colorbar ends at -4 and +4 °C. A cell at the end of the scale means "at or beyond", never a measured value; the app says "≥ +4 °C (top of scale)". The number of saturated warm cells grows from 37 (2026-05-10) to 690 (2026-11-10).
- **The +3 to +4 °C range is checked only as "at least +3 °C"**, because GIBS saturates at ±3 °C. That is where the 2026 El Niño sits.
- **Mixed cells:** about 1% of ocean cells hold two water masses (for example the Agulhas Current or the Brazil-Malvinas confluence), with no pixels near the median. There the cell value is less stable, and different reasonable decoders can differ by up to about 0.5 °C.
- **El Niño and La Niña** are never read from pixels. They are cited from the NOAA Climate Prediction Center ENSO diagnostic discussions: "La Niña Advisory" on 13 Nov 2025 and "El Niño Advisory" on 12 Nov 2026. The MUR anomaly is computed from MUR's own climatology, while NOAA uses a 1991 to 2020 base period, so our numbers are not expected to match NOAA's indices.
- **Monthly snapshots:** each date is one daily frame, not a monthly mean.

## 2. Active fires (SVS 5113)

### What we decode

- **Frames:** the unlabeled ("SoaS") equirectangular EXR frames, 4096 x 2048 (about 10 km per pixel). Each frame draws every VIIRS fire detection (Suomi NPP and NOAA-21) of a 5-day moving window as a dot colored by fire radiative power, over a fixed base map of black land and dark blue ocean.
- **Dates:** the frames are numbered 001 to 900 and cover only the **last two years**, despite the "2024-Present" title. We read the dates from the date printed on the labeled version of the same frames (2026-11-14 generation): `date(n) = 2024-11-13 + floor((n - 1) x 730 / 899)` days. We checked 5 frames (001, 368, 450, 817, 900) and the independent re-implementation checked 6 more (035, 111, 372, 822, 859, 897), including every frame we use. All 11 match.
- **Window alignment:** SVS says "moving five-day window" without saying how it aligns with the date. GIBS daily detections match the 5 days ending on the frame date best. This is our inference, not SVS documentation.
- **Fire pixels:** the newest frames of the generation (2026-11-11 to 2026-11-13) are still empty, so frame 900 is the exact base map. A pixel is fire when it is more than 20 delta E away from the same pixel of that empty frame, whatever the dot color. Two empty frames differ by at most 5.4 delta E.
- **Value:** the share of land pixels covered by fire dots in each 1-degree cell ("hot-pixel density"). A cell less than half land is "no data". The scale is fixed for every date: 0 to 50%, saturating above.
- **Dates kept:** the 10th of every month, 2024-12-10 to 2026-10-10 (23 dates).

### A correction made during validation

Our first version recognized fire by matching dot colors to the fire radiative power colorbar. The independent re-implementation found that it missed white dots (the top of the colorbar) and the gray pixels where a white dot half-covers black land: 185 to 247 cells per date read 0% despite visible dots. For example, Uberlândia on 2026-09-10 read 0% while GIBS showed detections on 9 and 10 September. We replaced the method with the base-map comparison above, which does not depend on dot color. Uberlândia on 2026-09-10 now reads 3.0%. All numbers below are from the corrected version.

### Check against NASA GIBS

- **Reference:** GIBS layers `VIIRS_SNPP_Thermal_Anomalies_375m_All` and `VIIRS_NOAA21_Thermal_Anomalies_375m_All`, the daily detections of the two satellites behind SVS 5113.
- **Method:** for each sampled cell and date we took the union of both satellites over the 5 days ending on the date, in the same 1-degree box (100 x 100 pixels), and measured the share of the box covered by detections.
- **Sample:** 80 cells on 5 dates (2025-02-10, 2025-06-10, 2025-09-10, 2026-01-10, 2026-09-10). Half are cells where we see fire. The other half are cells where we see none but that sit within 3 cells of a fire, between 60°S and 60°N and outside Greenland. This is a hard test: no free agreement from ice sheets, where fire cannot happen.

| Metric | Result |
|---|---|
| Fire present on both sides, or absent on both | **97.5%** (78 of 80) |
| Fire seen by GIBS but missed by us | 1 (2025-09-10, 23.5°N 57.5°E, GIBS coverage 0.46%) |
| Fire in our data but not in GIBS | 1 (2026-01-10, 46.5°N 116.5°W, 0.98% in our data) |
| Ranking of amounts, cells with fire on either side (41 cells) | Spearman rho **0.94** |
| Ranking of amounts, all 80 cells | Spearman rho 0.97 |

**Why we compare only presence and ranking:** our values are about 4 times the GIBS coverage, because GIBS draws the same detections at a different size. The number is relative: a share of map pixels covered by fire dots in the SVS rendering, where each 375 m detection is drawn about 10 km wide. It is not the share of land that burned, which is why the app says "fire activity (hot-pixel density)" with the unit "% of land pixels with fire dots".

### Never power

Fire radiative power (megawatts) is never reported. Overlapping dots over 5 days do not give a power per cell, so dot colors are used only to see where fire is.

### Limits

- **One 5-day window per date.** A single cell can jump between dates; Uberlândia reads 22.0% on 2025-09-10 and 3.0% on 2026-09-10. We therefore never compare one year against another. The fire Compare contrasts the wet season (2025-02-10, 1.2%) with the dry season (2025-09-10, 22.0%) at Uberlândia.
- **The 2024 fire season is no longer in the frames.** The dry seasons available are 2025 and 2026.
- **Saturation where dots overlap.** Half of all cells with fire are under 4%, 90% are under 35%, and 6.6% reach the 50% top of the scale, mostly African savannas at the peak of their season.
- **2026-11-10 is left out.** The newest frames are still being filled in near real time: that date has about half the fire pixels of 2025-11-10, file sizes start dropping on 2026-11-07, and the frames for 2026-11-11 to 2026-11-13 are empty. Keeping it would have said "little fire" when the data is simply not there yet.
- **Frame dates depend on the generation.** The SVS regenerates the fire frames every day, shifting the numbering; `download.py fire` stops if the frames no longer come from the generation the dates were read from.

## 3. Places

The 30 named places were chosen from the data, not only from general knowledge. Every candidate was scored against every 1-degree cell of the decoded records (SST anomaly over 30 months, fire over 23), as a percentile of all cells of the same surface:

- **Ocean (17):** cells that change or persist most, for example the Equatorial Pacific (2025 to 2026 change larger than 99% of ocean cells), the North Pacific marine heatwave east of Japan (mean anomaly +3.0 °C, the most persistent warm anomaly in the record, at or above +4 °C in 12 of 30 months) and the North Atlantic cold blob south of Greenland (mean -1.35 °C, the most persistent cold anomaly). One calm control, the Atlantic off the Amazon mouth (less variable than 99% of ocean cells), lets Compare play a unison.
- **Land (13):** cells with a clear fire season in the record, in different months around the world: Uberlândia (0% in the wet season, 22% in September 2025), the Cerrado and the Roraima savanna (opposite seasons in the same country), the Amazon and the peatlands of Central Kalimantan in Borneo (both low in 2025 and high from August to October 2026, a pattern consistent with El Niño drought, which we cite but do not infer), boreal Saskatchewan (June 2025), Los Angeles (January 2025, above a steady background), and savannas in Nigeria, Angola, Australia and Thailand. Cells dominated by static heat sources that VIIRS also detects (gas flares, industry) were avoided.

Six places of the first list were replaced after this check: Yakutia (no fire on any date), the Pantanal (its 2024 fires are older than the frames), Alberta, northern California (fire all year without a season), the Caribbean and the Bay of Bengal (low variability).

Every place was also checked against a land and sea mask taken from the SVS 5176 frame (0 mismatches), and every place has a value on every date of its record. The needle reads the 1-degree cell that contains the point, so key places sit at cell centers (the Equatorial Pacific place is at 0.5°S, 139.5°W). "Southern Ocean south of Africa" sits at 50°S, 20°E, because at 55°S the November sea ice edge leaves the cell without data.

## References

- NASA SVS 5176: https://svs.gsfc.nasa.gov/5176/
- NASA SVS 5113: https://svs.gsfc.nasa.gov/5113/
- NASA SVS Daily Visualizations (EIC): https://svs.gsfc.nasa.gov/gallery/daily-visualizations/
- NASA GIBS: https://nasa-gibs.github.io/gibs-api-docs/ (WMS endpoint https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi)
- JPL MUR SST v4.1 (PO.DAAC): https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1
- NOAA Climate Prediction Center, ENSO diagnostic discussions (13 Nov 2025 and 12 Nov 2026): https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/

## Reproduce

```bash
python -m pip install -r pipeline/requirements.txt
python pipeline/make_landmask.py --check
python pipeline/download.py sst          # about 630 MB into raw/ (not committed)
python pipeline/build_sst.py
python pipeline/validate_sst.py 12       # 12 cells per date
python pipeline/download.py fire         # about 160 MB
python pipeline/build_fire.py            # downloads the empty frame 900 (base map) if missing
python pipeline/validate_fire.py 16      # 16 cells per date
```

The random samples use fixed seeds, so a rerun picks the same cells.
