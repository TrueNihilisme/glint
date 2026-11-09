# Glint

A TV front-end for Samsung Tizen 4 (2018 TVs, Chromium 56) with an Apple-TV-like look:
a menu that is always on screen, a hero, rows of cards, a title page with seasons and episodes.

**Status: early, but usable.** Sections with rows, a title page with seasons and episodes, a player
(AVPlay), search, «Continue watching» and «My list», menus from extensions (TV, Music), settings with
extensions by URL. Measurements that shaped it are in [`docs/CHROMIUM56.md`](docs/CHROMIUM56.md).

## The idea

- **The core knows no server.** It shows menus, sections, title pages and plays video.
- **Everything else is an extension**, added by URL in Settings → Extensions: where rows come from,
  where a title can be played from, TV channels, music. An extension can add its own menu items and its
  own settings page. No extension — no menu item.
- **Built for the TV first:** one bundle for Chromium 56, only `transform`/`opacity` animations,
  pictures at the size they are shown, AVPlay for playback.

Extensions in [lampac-extra/glint](https://github.com/TrueNihilisme/lampac-extra/tree/main/glint) (load them by their
jsDelivr address, e.g. `https://cdn.jsdelivr.net/gh/TrueNihilisme/lampac-extra@main/glint/tmdb.js`):

| File | Gives |
|---|---|
| `tmdb.js` | rows for every section (trends, actor of the week, genres, studios), details, seasons, episodes, search — with a TMDB key or through a [lampac-mcp](https://github.com/TrueNihilisme/lampac-mcp) server that keeps the key |
| `lampac-mcp.js` | the AI-picked rows a lampac-mcp server keeps |
| `lampac.js` | sources from a Lampac server: online sources, voices, seasons, episodes, RCH |
| `iptv.js` | «TV → IPTV» from an M3U playlist, with an optional programme guide |
| `navidrome.js` | «Music → Navidrome»: albums and playlists as queues |

The extension API is described at the top of [`src/ext/registry.js`](src/ext/registry.js),
[`src/screens/title.js`](src/screens/title.js) and [`src/main.js`](src/main.js) (menus and pages).

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

## License

[GPL-3.0](LICENSE) or later. Use and change Glint freely; if you publish a changed version, publish its source too.
