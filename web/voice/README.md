# Voice guide clips

These MP3 files are the spoken lines of the optional voice guide (`web/js/ui/voice.js`): the welcome, the guided tour, the place names, and short status words (paused, stopped, end of a place). There is one file per line and per language:

- `en/{Id}.mp3`: English, 81 clips.
- `pt-BR/{Id}.mp3`: Brazilian Portuguese, 81 clips.

`{Id}` is the key of the line in the `LINES` table of `web/js/ui/voice.js` (for example `T01.mp3`, `P-uberlandia.mp3`). That table is the text of every clip: the clips and the table must stay in step.

## SI disclosure

Every clip is an **SI-generated voice**. It was synthesized on 15 Nov 2026 with ElevenLabs text to speech (model `eleven_v4`) from lines written and reviewed by the team. It is not a recording of a person. There are two voices, one per language:

- English: the voice "James" (ElevenLabs voice id `EkK5I93UQWFDigLMpZcX`).
- Brazilian Portuguese: the voice "Rafael Valente" (id `dX7gRq1dIvLTgUaWpEFn`), a native Brazilian voice from the ElevenLabs voice library, listed as a professional narrator (adult male). The team chose it by ear from three Brazilian candidates as the closest to James, so the two languages feel like the same guide. James speaking Portuguese came out with a European Portuguese accent, and the API does not take a regional code (`pt-BR`) for this model, so the accent has to come from the voice itself.

The same statement, naming the voice of that language, is in each file's ID3 comment tag, with the line id as the title, `Blue Marble Records voice guide` as the artist, `Voice guide (en)` or `Voice guide (pt-BR)` as the album, and the date 2026-11-15.

The voice speaks only these fixed lines. It never says data values: the value sentences stay in the page's live region, read by the visitor's own screen reader. The music is not SI-generated: it is composed live in the browser from the data.

## How they were made

1. Each line was sent as plain text to the ElevenLabs text to speech API (`language_code` `en` or `pt`, stability 0.6, similarity 0.8, a fixed seed), as 44.1 kHz 16-bit PCM. One Portuguese line (`L4`) was sent with one word spelled as it is said ("xiado" for "chiado"), because the voice said it with a "t" sound; the meaning is unchanged. Every other clip says exactly the text of its line.
2. Every clip was transcribed locally (faster-whisper) and compared word by word with its line, and measured for speaking rate, silences inside the speech, and a clean ending. A transcript cannot judge an accent: that can only be checked by ear.
3. Processing, the same for every clip: leading silence trimmed to about 40 ms and trailing silence to about 120 ms, with 5 ms and 30 ms fades; mono; the voiced parts brought to the same level (about -18 dBFS RMS, all clips within 0.4 dB of each other) with a short look-ahead limiter keeping true peaks under -1 dBFS; encoded to MP3 at 96 kbps, 44.1 kHz.

## How the page uses them

When the voice guide is on, the page asks once per language for `voice/{lang}/S01.mp3`. If it exists, each line plays from its clip; a clip that fails to load is said by the browser's own speech synthesis instead. If the folder is missing, every line falls back to the browser's speech synthesis in the page's language. The voice never speaks over the music of a Play: lines come before or between the music.

## How to regenerate

The generation script (`generate.py`, with its helper `transcribe.py`) lives outside the repository. It reads the API key from a local file outside the repository, only inside the process; the key is never written to the repository, a log or a command line. Steps:

1. Export the table: `node -e` importing `web/js/ui/voice.js` and writing `LINES` to `lines.json`.
2. `python generate.py gen` (all lines, or a list of ids), then `python generate.py process`, then `python generate.py measure`.
3. Transcribe and compare: `python transcribe.py en` and `python transcribe.py pt-BR`.
4. Copy `out/en/*.mp3` and `out/pt-BR/*.mp3` here.

If a line's text changes in `voice.js`, regenerate that clip in both languages, so the clip never says something the table does not.
