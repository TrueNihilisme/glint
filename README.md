# Glint

A TV front-end for Samsung Tizen 4 (2018 TVs, Chromium 56) with an Apple-TV-like look:
a menu that is always on screen, a hero, rows of cards, a title page with seasons and episodes.

**Status: early skeleton.** The menu, sections, rows and focus work on placeholder data; the extension
system, title page and player come next. Measurements that shaped it are in
[`docs/CHROMIUM56.md`](docs/CHROMIUM56.md).

## The idea

- **The core knows no server.** It shows menus, sections, title pages and plays video.
- **Everything else is an extension**, added by URL in Settings → Extensions: where rows come from,
  where a title can be played from, TV channels, music. An extension can add its own menu items and its
  own settings page. No extension — no menu item.
- **Built for the TV first:** one bundle for Chromium 56, only `transform`/`opacity` animations,
  pictures at the size they are shown, AVPlay for playback.

Planned extensions (in [lampac-extra](https://github.com/TrueNihilisme/lampac-extra)):
a Lampac server (sources, seasons, voices, RCH) and [lampac-mcp](https://github.com/TrueNihilisme/lampac-mcp)
(rows for the sections).

## Build and install

Requires Node 18+ and, to install on a TV, [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung)'s
`apps2samsung-cli` with a certificate for your TV (Developer Mode on, Host PC IP = this computer).

```sh
npm install
npm run dev                     # dist/ — open dist/index.html in Chrome, arrows/Enter/Esc
npm run wgt                     # build/glint.wgt
GLINT_TV=<TV ip> npm run tv     # sign, install and launch on the TV
```

## Layout

| Path | What |
|---|---|
| `src/main.js` | boot, top menu, keys |
| `src/focus.js` | one focus for the screen: zones (rows / columns), remembered positions |
| `src/screens/section.js` | a section: hero + rows, scrolling under the menu |
| `src/ui/` | rows, helpers |
| `src/ext/registry.js` | the extension API (shape only for now) |
| `src/data/stub.js` | placeholder titles and canvas pictures |
| `widget/` | `config.xml` template and the icon |
| `probes/` | pages that measure the TV |
