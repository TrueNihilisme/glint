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

### With real pictures (rows from lampac-mcp, TMDB posters w342 / backdrops w1280)

Changing the background on every key press made walking a row ~8–27 fps: each press started decoding a
1280-px photo. **The background now changes only after the focus rests for 300 ms.** Result (same run):

| What | fps |
|---|---|
| Row, pictures already loaded | 48.6 / 48.6 (background off: 49.2 / 50.7) |
| Row, first pass while posters still load | 29.2 |
| Row → next row, first time (page scroll + 15 new posters) | 14.2 |
| Switching sections, first time (30 new pictures) | 24.9 |

The remaining stalls are first-time picture decoding. Ideas, not tried yet: load the next row's posters
while the TV is idle, smaller backdrops (w780) for the hero, build a section's cards in two steps.

## JavaScript

The build targets `chrome56` with esbuild: newer syntax is lowered, and what cannot be lowered fails the build.
No ES modules at runtime (`type="module"` arrived later) — the app is one IIFE bundle.

### With ~9 rows per section (TMDB + lampac-mcp), 2026-11-09 evening

Everything above was measured with 2 rows. With ~9 rows of 20 cards the TV slowed down again; A/B inside one run
showed what costs what:

| Change | Row of cards | Row → row | Sections ×3 |
|---|---|---|---|
| before (every card and track on its own layer, animated shadow, background changes in every row) | 24–29 | 3.5 | 5–7 |
| layers only for rows near the focus, far rows `visibility: hidden` | 25–30 | 4.4 | 6.6 |
| no animated shadow (a static small one), background kept still below the hero, 780-px backdrops | **52–56** | **38.5** | 19.3 |
| + only 3 rows built at once, the rest while the remote is quiet | 50–55 | 32 | 20.5 |

What mattered most: **fading a 60-px blurred shadow repaints the card every frame** (+9 fps without it) and
**changing a full-screen photo while walking rows** (row → row from ~4 to ~38 fps when the background stays put
below the hero, where it is dimmed by 84% anyway). The glass rim and sheen cost almost nothing once the shadow
was static (54 fps without it, 50–56 with it). Still slow: switching the hero title (~19 fps, a new photo each
time) and switching sections (~20 fps).

### Hero, sections and the background (2026-11-09, late evening)

| Change (A/B inside one run where marked) | Hero ×4 | Sections ×3 |
|---|---|---|
| before | ~19 | ~20 |
| hero text updated in place, built sections kept and re-attached | 34–40 | 16–42 (noisy) |
| A/B: background layers hidden (`display: none`) | 37–38 | 44–59, p95 30–40 ms |

Building a section takes 35–75 ms (measured with `Date.now()` around it), and going back to sections already
built was just as slow — so building was not the problem; the full-screen background was. What did **not**
help (A/B, same run): a 960×540 layer scaled ×2, no cross-fade, no shade, a 300-px photo instead of 780 px,
and a plain colour instead of a photo (sections 21–41). Any change of a full-screen layer costs frames here,
whatever is on it; why exactly is not known yet.

What Glint does now: the hero shows its title's photo full-screen (the look was preferred over the speed);
below the hero the background is a colour taken from the focused card — a 92-px TMDB copy drawn into an
8×12 canvas, 2–5 ms on the TV (31 ms the first time). Reading pixels of a TMDB picture works with
`crossOrigin = 'anonymous'` (TMDB sends `Access-Control-Allow-Origin: *`), and inside the widget it worked
without it too.
