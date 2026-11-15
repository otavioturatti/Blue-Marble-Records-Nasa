# Recorded instruments of the fire record and of the sea record

The music of the fire record (`web/js/engine-fire.js`) and of the sea surface temperature record (`web/js/engine-sea.js`) is composed in the browser, live, from the NASA data. Nothing in this folder is a song, a phrase or a chord: every file is **one note of a real instrument, played by a person**, or, in `sea/`, one gesture of an instrument (one wash of an ocean drum, one cymbal swell, one rub of a cabasa, one run of wind chimes). The engine decides which of them sound, when and how loud.

- The fire record plays the guitar, harp, piano, flute, recorders, double bass, accordion and percussion.
- The sea record plays the harp, vibraphone, glockenspiel, kalimba, marimba, mbira, clarinet, ocarina, flute, recorders, cellos, tremolo violins, horn, wine glasses, piano, double bass, four percussion strokes (triangle, cymbal swell, timpani, bell) and the instruments of `sea/`.

No file here was made by a generative AI model. SI disclosure: the scripts that cut the notes, measured their tuning and found the loop points were drafted with an AI coding assistant and reviewed by Otávio.

## Sources and licences

| Folder | Instrument | Source | Licence |
|---|---|---|---|
| `guitar/` | Acoustic guitar, every fret (0 to 12) of the six strings, one note per file | Recorded by the team for this project during the hackathon (files dated 14 Nov 2026) | Our own work |
| `harp/` | Folk harp (lever harp), played by Jordi Francis (Etherealwinds) | Versilian Community Sample Library (VCSL), `Chordophones/Composite Chordophones/Folk Harp` | CC0 1.0 |
| `piano/` | Grand piano, Steinway B, no sustain pedal | VCSL, `Chordophones/Zithers/Grand Piano, Steinway B/NoSus` | CC0 1.0 |
| `recorder/` | Baroque recorders (bass, tenor, alto), sustained, no vibrato | VCSL, `Aerophones/Edge-blown Aerophones/Baroque Bass Recorder`, `Baroque Tenor Recorder`, `Baroque Alto Recorder` (`Sustain`) | CC0 1.0 |
| `perc/` | Cajón, frame drum, bass drum, darbuka, triangle, hand claps, suspended cymbal, timpani, tubular bells | VCSL, `Idiophones/Struck Idiophones` (Cajon, Triangles, Claps, Suspended Cymbal 1, Tubular Bells 1) and `Membranophones/Struck Membranophones` (Bass Drum 1, Frame Drum, Darbuka, Timpani 2) | CC0 1.0 |
| `flute/` | Concert flute, sustained, no vibrato, softest layer | VS Chamber Orchestra: Community Edition (VSCO 2 CE), `Woodwinds/Flute/susNV` | CC0 1.0 |
| `bass/`, `bass2/` | Double bass, pizzicato (two recordings of each note) | VSCO 2 CE, `Strings/Solo Contrabass/Pizz` | CC0 1.0 |
| `accordion/` | Hohner button accordion ("Button Accordion HN", version 2024-03-29), recorded by Jeff Stauffer | FreePats project | CC0 1.0 |
| `vibraphone/` | Vibraphone, soft mallets, pedal down, motor off | VCSL, `Idiophones/Struck Idiophones/Vibraphone/Soft Mallets` | CC0 1.0 |
| `glockenspiel/` | Glockenspiel, soft strokes | VCSL, `Idiophones/Struck Idiophones/Glockenspiel` | CC0 1.0 |
| `kalimba/` | Nyunga Nyunga (a lamellophone of the mbira family, Mozambique), one key per file | VCSL, `Idiophones/Plucked Idiophones/Nyunga Nyunga, Mozambique, Low F` | CC0 1.0 |
| `marimba/` | Marimba, single strokes, medium layer | VCSL, `Idiophones/Struck Idiophones/Marimba` | CC0 1.0 |
| `mbira/` | Mbira dzaVadzimu, Nyamaropa tuning (Zimbabwe), one key per file | VCSL, `Idiophones/Plucked Idiophones/Mbira dzaVadzimu Nyamaropa, Zimbabwe, Low B` | CC0 1.0 |
| `ocarina/` | Ocarinas (typical and small), sustained, no vibrato | VCSL, `Aerophones/Edge-blown Aerophones/Ocarina, Typical/Sustains/Sus` and `Ocarina, Small/Sustain` | CC0 1.0 |
| `glasses/` | Wine glasses, rim rubbed slowly | VCSL, `Idiophones/Friction Idiophones/Wine Glasses/Sustains/Slow` | CC0 1.0 |
| `sea/` | Ocean drum (washes), suspended cymbals (swells), cabasa (rubs), wind chimes (runs up and down) | VCSL, `Membranophones/Other Membranophones/Ocean Drum`, `Idiophones/Struck Idiophones/Suspended Cymbal 1`, `Suspended Cymbal 2` and `Cabasa`, and the Mark Trees | CC0 1.0 |
| `clarinet/` | Clarinet, long sustained notes, soft layer | VSCO 2 CE, `Woodwinds/Clarinet/susLong` | CC0 1.0 |
| `cello/` | Cello section, sustained with vibrato, soft layer | VSCO 2 CE, `Strings/Cello Section/susvib` | CC0 1.0 |
| `violins/` | Violin section, tremolo, softest layer | VSCO 2 CE, `Strings/Violin Section/Trem` | CC0 1.0 |
| `horn/` | French horn in F, sustained, softest layer | VSCO 2 CE, `Brass/F Horn/sus` | CC0 1.0 |

- VCSL: Versilian Studios LLC (Sam Gossner), <https://github.com/sgossner/VCSL>, revision `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e`. Library page: <https://versilian-studios.com/vcsl/>
- VSCO 2 CE: Versilian Studios LLC (Sam Gossner), recorded by Sam Gossner and Simon Dalzell, <https://github.com/sgossner/VSCO-2-CE>, revision `440300901dfe9275fd84e0b7763af1f8443ae62e`. Library page: <https://versilian-studios.com/vsco-community/>
- FreePats button accordion: <https://freepats.zenvoid.org/Organ/accordion.html>, release <https://github.com/freepats/button-accordion-HN/releases/tag/2024-03-29>, edited by michael02022.
- CC0 1.0 Universal: <https://creativecommons.org/publicdomain/zero/1.0/>

## What we changed

- **Notes kept:** only the notes and strokes the engine plays.
- **Mono, 44.1 kHz, 16 bit:** one microphone per note where the two channels of the original are out of phase, a sum where they agree.
- **Tuning:** each note was measured; `centsOff` in the manifest is how far the recording is from the tempered note, and the engine corrects it when it plays.
- **Loops:** the sustained notes (flute, recorder, accordion, clarinet, ocarina, cellos, tremolo violins, horn, wine glasses, and two washes of the ocean drum) carry loop points (`loopStart`, `loopEnd`, in seconds) so a note can be held for as long as the music asks.
- **Gestures of the sea:** each wash, swell, rub and run was cut from a longer recording and levelled, and its loudest moment was measured (`peakAtSec`), so the engine can time a wave to break on the first beat of a bar.
- **Format:** plucked and struck notes are MP3; sustained notes are FLAC (lossless), so the loop points stay exact.

Each `manifest.json` lists the files of its folder; `source` is the name of the original file in the library.
