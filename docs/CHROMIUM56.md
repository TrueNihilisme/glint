# Chromium 56: what a Samsung Tizen 4 TV can and cannot do

Samsung TVs of 2018 run Tizen 4.0 with Chromium M56 ([Samsung, Web Engine Specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)).
Everything below was measured on a UE55NU7090 (model code UNU7090, firmware T-KTSUDEUC-1400.2) on 2026-11-09,
with the probes in [`probes/`](../probes).

## The app must live inside the widget

| | Page loaded from a server inside the widget | Files of the widget (`file:///index.html`) |
|---|---|---|
| `webapis`, `tizen` | missing; `$WEBAPIS/webapis/webapis.js` loads, but **without `avplay`** | present, AVPlay 3.0 |
| AVPlay with an HLS stream | — | prepared in 1.55 s, `PLAYING` |
| Request to another site (no CORS headers) | fails in ~1 s | **200** |
| `<video>` with HLS | `canPlayType` = `maybe`, `canplay` in ~3 s | not measured |
| WebSocket (`wss://`) | works | works |
| JS heap | 13 MB of 756 MB | 10 MB |

So Glint ships as a `.wgt` with its own files; servers only provide data and extensions.

## CSS

`display: grid` — no · `backdrop-filter` (also `-webkit-`) — no · `aspect-ratio` — no ·
`position: sticky` — yes · custom properties — yes.
Not used either (not measured one by one): `gap` in flex, `inset`, `min()/max()/clamp()`, `#RRGGBBAA`,
space-separated `rgb()`.

A glass panel without `backdrop-filter`: put a copy of the background inside the panel, downscaled
about 16 times and stretched back — the browser blurs it for free.

## Animation

| Row of 14 cards, focus moving every 250 ms | fps | p95 frame | frames > 34 ms |
|---|---|---|---|
| Pictures 960×540 in 400×225 cards, `box-shadow` animated | 21.6 | 102 ms | 63 |
| **Pictures at card size, shadow as a separate layer that only fades (`opacity`), `will-change: transform`** | **48.7** | **26 ms** | **2** |
| Two full-screen backgrounds cross-fading (`opacity`) | 52.8 | 26 ms | 7 |

Rule: animate only `transform` and `opacity`, never `box-shadow`; size pictures to where they are shown.

### Glint itself (skeleton `0.0.1`, self-test build, 2026-11-09)

`GLINT_SELFTEST=<report url> GLINT_TV=<ip> npm run tv` — the app drives the remote by itself and reports:

| What | fps | p95 frame | frames > 34 ms |
|---|---|---|---|
| Idle | 59.5 | 17 ms | 0 |
| Hero: next title ×4 | 59.2 | 31 ms | 7 |
| Row: right ×10 (every 250 ms) | **44.1** | 72 ms | 14 |
| Row 1 → row 2 (page scroll, background change) | 49.5 | 41 ms | 10 |
| Back to the menu, switching sections ×3 | 59.2 | 32 ms | 8 |

JS heap 10 MB. Single runs are noisy (the same variant gave 26 and 48 fps), so every comparison below is an
A/B inside one run, two rounds each, started 20 s after install.

**What actually slowed the row: the background layers.** Hiding the two full-screen background layers took
the row from ~42 to ~56 fps; nothing else mattered as much:

| Row variant (A/B, same run) | fps, round 1 / 2 |
|---|---|
| as built (two `.bg` layers, the hidden one at `opacity: 0`) | 42.8 / 42.5 |
| background layers off | 54.3 / 57.7 |
| no `will-change` on cards | 26.2 / 35.8 — worse |
| shade/dim/topshade off | 47.6 / 43.2 |
| card shadow layer off | 43.6 / 51.1 |
| caching layout reads in JS (`offsetTop` once) | no visible change |

A layer at `opacity: 0` is still composited every frame. Fix: after the cross-fade the old background gets
`visibility: hidden`, and `.bg` has no permanent `will-change`. After the fix: **row 49.7 / 55.2 fps**
(background off: 53.6 / 53.4). Still to improve: row → row with a background change (37.5 fps).

## JavaScript

The build targets `chrome56` with esbuild: newer syntax is lowered, and what cannot be lowered fails the build.
No ES modules at runtime (`type="module"` arrived later) — the app is one IIFE bundle.
