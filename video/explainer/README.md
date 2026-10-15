# Tally explainer film

75 seconds. The finance back office that lives in your customer conversations: a client asks for a change in Telegram, the agent reads the thread, recalls the deal, bills in Stripe, sends the PDF back into the chat and leaves a note for staff, inside a written policy, with a human above the limits.

- Brief: `PROMPT.md`. Numbers allowed on screen: `SOURCES.md`. Pivot notes: `refs/pivot.md`.
- Decisions, cut list, review and accessibility pass: `DECISIONS.md`.
- Four directions and why A won: `directions.html`.
- Storyboard as a contact sheet: `contact.png` (one frame per scene at its midpoint).
- Source: `src/` (see below). Renders: `out/` (not committed). Public copies for the landing page dialog: `web/public/demo/tally-demo.{mp4,webm}` and `tally-demo-poster.png`.

## Source

| File | What it is |
| --- | --- |
| `src/timeline.js` | The one TIMELINE: scenes, anchors, captions, cues, bed. Everything is timed from here. |
| `src/index.html` | The film. `window.seek(t)` paints the frame at `t`; every frame is a pure function of `t`. `?aspect=9x16` / `?aspect=1x1` recompose; `?rm=1` is the reduced-motion cut; `?t=30` seeks on load. |
| `src/shared/tokens.css` | Brand tokens from `brand/tokens.stylex.ts`, Geist and Geist Mono from `brand/fonts`, one accent. |
| `src/render.mjs` | Headless Chromium steps `t = n/60`, pipes PNG frames into ffmpeg (libx264, crf 16, yuv420p). `--stills` and `--frame` for verification. |
| `src/voice.mjs` | One voice line per caption (gpt-4o-mini-tts, onyx). Trims silence, fits each line to its slot (tempo at most 1.2), writes `captions-timing.{js,json}`. Reads the key from `server/.env`; never prints it. |
| `src/audio.html`, `src/audio.mjs` | Procedural bed and cues (Web Audio, OfflineAudioContext, seeded), ducked under the voice; two-pass loudnorm; writes `out/mix.wav` and `captions.srt`. |
| `src/contact.mjs` | The contact sheet. |
| `src/mux.sh` | Muxes video and audio into the three deliverables; `sh mux.sh web` also writes the landing-page copies. |
| `src/cuts.sh` | Renders the 9:16 and 1:1 recompositions in parallel, then muxes. |

Re-render everything: `cd src && node voice.mjs && node audio.mjs && node render.mjs --aspect 16x9 --out ../out/video_16x9.mp4 && node render.mjs --aspect 9x16 --out ../out/video_9x16.mp4 && node render.mjs --aspect 1x1 --out ../out/video_1x1.mp4 && sh mux.sh`.

## What was tested

Only what is listed here was run. Results are from this branch, 15 Oct 2026.

- Render one frame twice and diff it: `render.mjs --frame 30` in two separate browser launches produced byte-identical PNGs (`cmp` exit 0, same SHA-256 prefix `bb7456293d7d1b6a`).
- A still at every beat was rendered and read at 1920 px (`contact.png` plus 12 beat stills at 2, 6, 10, 16, 24, 31, 38, 46, 53, 61, 65, 72 s) and the fixed beats again at 11, 46, 61, 66 s. The 9:16 and 1:1 layouts were read at 24 s (and 9:16 at 46 s). At 390 px wide the anchors and captions read; UI text inside the scaled stage does not, and DECISIONS.md says so.
- Four review fixes ship with before/after pairs in `review/`: `quote-tag`, `policy-card`, `turn-thread`, `punch-in`.
- Contrast, computed from the token values (WCAG relative luminance): ink on canvas 17.93:1, ink on well 16.31:1, ink2 on canvas 9.59:1, ink3 on canvas 4.74:1, ink2 on well 8.72:1, accent on canvas 6.17:1, white on accent 6.17:1, white on ink 17.93:1. The one failure found (ink3 on the well, 4.31:1, client-bubble meta) was fixed to ink2 before the master was rendered.
- Forbidden strings: a search of `src/` for vendor names, `localhost`, port numbers, `/app/` paths, mock ids and test keys, "prorat", WhatsApp, WeChat and Slack found nothing.
- Audio, measured with ffmpeg `ebur128` after loudnorm: integrated -16.0 LUFS, true peak -1.5 dBFS, LRA 3.4 LU. The voice ends at 74.36 s of 75.
- Voice timing: each line's measured start and end is in `src/captions-timing.json`; the largest shift from its planned start is 0.76 s (c02), and every line stays inside its scene.
- Muted pass: frames decoded from the muxed `out/master_16x9.mp4` at 45 s and 61.5 s were read; the anchors, the invoice evidence rows, the dispute thread and the approval card read without sound. The burned-in captions carry the voice line on every spoken beat.
- Audio-only pass: `ebur128` on the muxed master (not the intermediate mix): integrated -16.0 LUFS, true peak -1.5 dBFS. Cues fall on the actions they mark (the times are in `src/timeline.js`, `cues`), the bed ducks to 42 % under every voice line.
- Master probe: H.264 1920×1080, 60/1 fps, 75.000 s; AAC 48 kHz stereo, 75.000 s; 6.6 MB; `+faststart`.

Not run: a human viewer; a screen reader; the reduced-motion render (implemented as `?rm=1`, not rendered in the time box).
