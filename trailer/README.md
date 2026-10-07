# Trailer pipeline

`npm run trailer` records and cuts the 30 s gameplay trailer end to end (about 25 minutes; the game is rendered frame by frame).

| Step | Script | Output |
|---|---|---|
| 1. Audio | `scripts/trailer/audio.ts` | `trailer/audio/music.wav`, `trailer/audio/sfx/*.wav` (synthesized, CC0) |
| 2. Record | `scripts/trailer/record.ts` | `trailer/frames/{wide,tall}/<scene>/%05d.png` (git-ignored) |
| 3. Edit | `scripts/trailer/edit.sh` | `trailer/out/trailer_16x9.mp4`, `trailer_9x16.mp4`, `trailer_loop.gif`, `thumbnail.png`, contact sheets |

`npm run trailer:record` and `npm run trailer:edit` run steps 2 and 3 alone. `record.ts` takes `--layout wide|tall|both`,
`--scenes hook,feed`, and `--every N` (keep one screenshot in N, for fast previews).

## How the capture works
- `scripts/trailer/inject.js` is added to the page before the game loads. It replaces `setTimeout`/`setInterval`/`requestAnimationFrame`,
  `Date`, `performance.now` and CSS animations with a **virtual clock** that only moves on `__vclock.step(ms)`, and seeds `Math.random`.
  The recorder steps 1000/60 ms, then screenshots, so a slow screenshot can never drop a frame.
- `src/dev/capture.ts` is loaded only by `vite` dev (never in a production build) and only when the virtual clock exists. It adds
  `window.__fishbowl.capture`: hidden dev UI, a soft touch cursor, scene loading, scripted pointer taps/holds/drags, camera moves,
  captions, the end card and the mock work screen.
- `scripts/trailer/scenes.ts` is the shot list: timing, captions, camera and pointer cues, and SFX cues per scene.
- The game name comes from `GAME_NAME` at the top of `scenes.ts` (currently **Tankquility**, from `index.html`).

## Music
No music files ship with the game (its sound is synthesized), so `audio.ts` writes an original lo-fi loop and the SFX from scratch.
They are released as CC0. To use a different track, drop a WAV at `trailer/audio/music.wav` and skip step 1.
