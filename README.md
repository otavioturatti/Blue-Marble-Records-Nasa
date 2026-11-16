# Blue Marble Records

**Hear the planet NASA sees.**

A web jukebox that turns NASA Earth Information Center (EIC) frames into music composed live in the browser, made first for blind and low-vision listeners. Pick a place on Earth, a needle reads that point of the NASA frame (decoded back into its physical value), and the place plays through time like a record turning.

Built at the NASA Space Apps Challenge 2026 (14 and 15 November 2026), challenge "The Earth Information Jukebox", local event Uberlândia, Brazil.

- Live app: <https://blue.oantitrend.com/>
- Project page: <https://otavioturatti.github.io/Blue-Marble-Records-Nasa/>
- Demo video (29 seconds): <https://otavioturatti.github.io/Blue-Marble-Records-Nasa/demo.mp4>

## What is in the app

- **Two records.** Sea surface temperature anomaly (NASA SVS 5176, 30 monthly dates from June 2024 to November 2026, scale -4 to +4 °C) and active fires seen by VIIRS (NASA SVS 5113, 23 monthly dates from December 2024 to October 2026, fire activity as hot-pixel density, a relative number).
- **30 named places**, 17 on the ocean and 13 on land. The needle reads the 1-degree cell that contains the place.
- **Music composed live from the values**, played by recorded instruments. On the sea record the distance from normal sets the tension, warm water is bright and cold water is dark, and a harp runs up when the water warmed and down when it cooled. On the fire record more fire is darker, heavier and louder. Nothing is a recorded song: the files are single notes.
- **Compare:** the same place on two dates, so the change between them can be heard.
- **Built for a screen reader from the start:** native controls, full keyboard use, one polite live region for the sentences, a guided tour of four places, an optional voice guide, vibration on phones that support it, and a distinct "dead groove" sound where there is no data, so silence never reads as a low value.
- English and Brazilian Portuguese. The page starts in English; Portuguese is on the language switch.

## Run it

With Docker:

```bash
docker build -t blue-marble-records .
docker run -p 8080:80 blue-marble-records
```

Then open <http://localhost:8080/>. Without Docker, serve the `web/` folder with any static file server. There is no backend and no build step.

## What is in this repository

| Path | What it is |
|---|---|
| `web/` | The app: HTML, CSS and JavaScript modules, the derived data files, the recorded notes and the voice clips |
| `pipeline/` | Python scripts that decode the NASA frames into the data files of `web/data/` and validate them |
| `docs/VALIDATION.md` | How we know the numbers behind the sound are right |
| `docs/DATA-FORMAT.md` | The format of the data files |
| `docs/index.html`, `docs/demo.mp4` | The project page and the 29-second demo video |
| `Dockerfile`, `deploy/nginx.conf` | Serving the app with nginx |

## NASA data

- **NASA Scientific Visualization Studio (SVS) 5176**, "Sea Surface Temperature (SST) Anomaly - Near Real Time" (MUR SST v4.1 anomaly, JPL): <https://svs.gsfc.nasa.gov/5176/>
- **NASA SVS 5113**, "Active Fires As Observed by VIIRS, 2024-Present" (Suomi NPP and NOAA-21, 5-day moving window): <https://svs.gsfc.nasa.gov/5113/>
- Both come from the Earth Information Center gallery linked by the challenge: <https://svs.gsfc.nasa.gov/gallery/earth-information-center/>
- **NASA GIBS** is used only to validate our decoding, never as a source of the values the app plays.
- Pictures: NASA Earth Observatory, Blue Marble Next Generation (the globe); NASA SVS Deep Star Maps 2020 and CGI Moon Kit (sky and Moon).

The frames are pictures, not data files, so every value is read back from the colors by `pipeline/`. No Space Agency Partner data was used.

## Validation

Checked against a separate NASA rendering of the same data (NASA GIBS). The full report, with every compared point, is in [`docs/VALIDATION.md`](docs/VALIDATION.md) and in `web/data/<record>/validation.csv`.

| Record | Sample | Result |
|---|---|---|
| Sea surface temperature anomaly | 93 cells on 8 dates | Mean absolute error 0.17 °C, 88% in the same class (cold, neutral, warm) |
| Active fires | 80 cells on 5 dates | Fire presence agrees in 97.5% of the cells; amounts are compared by rank only (Spearman rho 0.97 over all cells, 0.94 among the 41 cells with fire) |

Limits we state everywhere: the temperature scale saturates, so a value at the top is "at or above +4 °C"; fire is a relative density of hot pixels in the NASA rendering, never megawatts or fire radiative power; El Niño and La Niña are cited from NOAA Climate Prediction Center advisories, never inferred from the pixels.

## Super Intelligence (SI) disclosure

- **Code:** parts of the code were drafted with AI coding assistants (large language models) and reviewed by the team member named in the first line of each source file. The data files carry the same note in their `provenance`.
- **Validation:** the validation scripts and report were drafted with AI coding assistants and reviewed by Arthur. The numbers come from running the scripts.
- **Voice guide:** the optional voice guide is an SI-generated voice (ElevenLabs text to speech). It is labelled in the interface, described in [`web/voice/README.md`](web/voice/README.md) and stated in the metadata of each clip.
- **Not SI-generated:** the music (recorded instruments, composed live by our own rules from the data), the images (NASA frames and NASA imagery) and the data values.
- This README and the project page were drafted with an AI assistant and reviewed by the team.

## Third-party materials and licences

| Material | Where | Licence | Source |
|---|---|---|---|
| Tone.js 15.1.22 | `web/vendor/Tone.js` | MIT (`web/vendor/Tone.LICENSE.txt`) | <https://github.com/Tonejs/Tone.js> |
| three.js r170 | `web/js/ui/vendor/three.module.min.js` | MIT | <https://github.com/mrdoob/three.js> |
| Recorded instruments: Versilian Community Sample Library, VS Chamber Orchestra Community Edition, FreePats button accordion | `web/vendor/samples/` | CC0 1.0 | Listed instrument by instrument in [`web/vendor/samples/README.md`](web/vendor/samples/README.md) |
| Acoustic guitar | `web/vendor/samples/guitar/` | Our own work | Recorded by the team during the hackathon |
| Fonts: Cormorant, Michroma, Schibsted Grotesk, Martian Mono | `web/css/fonts/` | SIL Open Font License 1.1 | <https://fonts.google.com/> |
| Voice guide clips | `web/voice/` | SI-generated by the team with ElevenLabs text to speech | [`web/voice/README.md`](web/voice/README.md) |
| NASA frames, Earth, sky and Moon pictures | `web/data/`, `web/css/img/` | NASA media, generally not copyrighted (NASA media usage guidelines) | Links under "NASA data" |
| Sun, Moon and planet positions | `web/js/ui/ephemeris.js` | Low-precision formulas from the Astronomical Almanac and JPL (E. M. Standish) | Our own implementation |
| nginx | `Dockerfile` (image `nginx:1.27-alpine`) | BSD 2-Clause | <https://nginx.org/> |
| NumPy, Pillow, OpenEXR | `pipeline/requirements.txt` | BSD 3-Clause, MIT-CMU, BSD 3-Clause | <https://pypi.org/> |

## Licence

Our own work in this repository is offered under the Apache License 2.0 (see [`LICENSE`](LICENSE)). Third-party materials keep the licences listed above.

## Team

- João Otávio Turatti ([LinkedIn](https://www.linkedin.com/in/otavioturatti/), [@otavioturatti](https://github.com/otavioturatti))
- Arthur Flávio ([LinkedIn](https://www.linkedin.com/in/arthurr-arauj/), [@arthurr-arauj](https://github.com/arthurr-arauj))
- Kristen Pavarine ([LinkedIn](https://www.linkedin.com/in/kristen-pavarine-7b6a14328/), [@pavarinekristen](https://github.com/pavarinekristen))
