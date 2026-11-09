import { extensions, contextFor, problem } from '../ext/registry.js';
import { load } from '../store.js';
import { loadPictures } from '../ui/row.js';
import { esc, $, $$, translateY } from '../ui/util.js';

// The title page: what the row card knew at once, then details from the first extension that has them.
// For series: seasons, ranges of 20 when a season is longer, episodes; it opens on the next unwatched one.
//
// Extension API used here (all optional):
//   details(item, ctx)          → Promise<{ desc, year, genres[], runtime, rating, cast[], director, seasons: [{ n, count }] } | null>
//   episodes(item, season, ctx) → Promise<[{ n, name, runtime, still }]>
//
// deps: { focus, bg, toast, close() }

const RANGE = 20;

function firstAnswer(method, args) {
  const exts = extensions().filter((e) => typeof e[method] === 'function');
  let p = Promise.resolve(null);
  exts.forEach((e) => {
    p = p.then((got) => got || Promise.resolve().then(() => e[method].apply(e, args.concat([contextFor(e)])))
      .catch((err) => { problem((e.name || e.id) + ' ' + method + ': ' + (err && err.message || err)); return null; }));
  });
  return p;
}

function metaLine(it, d) {
  const parts = [];
  if (d && d.genres && d.genres.length) parts.push(d.genres.slice(0, 3).join(', '));
  else if (it.genre) parts.push(it.genre);
  const year = (d && d.year) || it.year;
  if (year) parts.push(year);
  if (d && d.runtime) parts.push(Math.floor(d.runtime / 60) ? Math.floor(d.runtime / 60) + ' год ' + (d.runtime % 60) + ' хв' : d.runtime + ' хв');
  if (d && d.rating) parts.push('★ ' + String(Math.round(d.rating * 10) / 10).replace('.', ','));
  return parts.join(' · ');
}

export function createTitle(root, item, deps) {
  const progress = load('progress', {})[item.id] || null;   // { s, e } — the episode to continue from
  let d = null;
  let season = progress && progress.s || 1;
  let range = 0;
  let eps = [];

  function seriesSeasons() { return d && d.seasons ? d.seasons.filter((s) => s.count > 0) : []; }

  function draw() {
    const seasons = seriesSeasons();
    const watchLabel = seasons.length
      ? (progress ? 'Продовжити С' + progress.s + ' Е' + progress.e : 'Дивитися С1 Е1')
      : 'Дивитися';
    root.innerHTML = '<div class="tscroll">' +
      '<section class="thead" data-zone="tbtn"><div class="t-body">' +
        '<h1' + (item.title.length > 22 ? ' class="long"' : '') + '>' + esc(item.title) + '</h1>' +
        '<div class="meta">' + esc(metaLine(item, d)) + '</div>' +
        '<div class="desc">' + esc((d && d.desc) || item.desc || (d ? '' : 'Завантаження…')) + '</div>' +
        '<div class="btns"><span class="btn">' + esc(watchLabel) + '</span><span class="btn round">+</span></div>' +
      '</div>' +
      (d && (d.cast || d.director) ? '<div class="t-side">' +
        (d.cast && d.cast.length ? '<p><span>У ролях</span><br>' + esc(d.cast.slice(0, 4).join(', ')) + '</p>' : '') +
        (d.director ? '<p><span>Режисер</span><br>' + esc(d.director) + '</p>' : '') + '</div>' : '') +
      '</section>' +
      (seasons.length ? '<section class="tsec" data-zone="tseason">' + seasons.map((s) =>
        '<span class="chip' + (s.n === season ? ' cur' : '') + '">Сезон ' + s.n + '</span>').join('') + '</section>' +
        '<section class="tsec" data-zone="trange"></section>' +
        '<section class="row tsec-eps" data-zone="teps"><div class="track"></div></section>' : '') +
      '</div>';
    if (seasons.length) drawEpisodes();
    layout();
  }

  function ranges() {
    const out = [];
    for (let i = 0; i < eps.length; i += RANGE) out.push(eps.slice(i, i + RANGE));
    return out;
  }

  function drawEpisodes() {
    const rs = ranges();
    const rangeEl = $('[data-zone="trange"]', root);
    if (rangeEl) {
      rangeEl.innerHTML = rs.length > 1 ? rs.map((r, i) =>
        '<span class="chip' + (i === range ? ' cur' : '') + '">' + r[0].n + '–' + r[r.length - 1].n + '</span>').join('') : '';
      rangeEl.style.display = rs.length > 1 ? '' : 'none';
    }
    const track = $('[data-zone="teps"] .track', root);
    if (!track) return;
    const list = rs[range] || [];
    track.innerHTML = list.length ? list.map((e) => {
      const watched = progress && (season < progress.s || (season === progress.s && e.n < progress.e));
      return '<div class="card ep"><div class="thumb"><i class="pic" data-src="' + esc(e.still || '') + '"></i>' +
        (watched ? '<span class="check">✓</span>' : '') + '<span class="epnum">' + e.n + '</span></div>' +
        '<div class="cap"><b>' + esc(e.name || 'Серія ' + e.n) + '</b><span>' + esc(e.runtime ? e.runtime + ' хв' : '') + '</span></div></div>';
    }).join('') : '<div class="t-empty">Серій поки нема</div>';
    loadPictures($('[data-zone="teps"]', root), 0, 6);
    epTrack.first = 0; epTrack.applied = false; epTrack.track = null;
  }

  function loadSeason(n, focusEp) {
    season = n;
    range = 0;
    eps = [];
    drawEpisodes();
    return firstAnswer('episodes', [item, n]).then((list) => {
      if (season !== n) return;
      eps = list || [];
      if (focusEp) {
        const k = eps.findIndex((e) => e.n === focusEp);
        if (k >= 0) { range = Math.floor(k / RANGE); deps.focus.focus('teps', k % RANGE); }
      }
      drawEpisodes();
      deps.focus.refresh();
    });
  }

  // vertical position: the header stays until the focus goes below it
  let lastY = null;
  function layout() {
    const zone = deps.focus.zone();
    let y = 0;
    if (zone && zone !== 'tbtn') {
      const sec = $('[data-zone="' + zone + '"]', root);
      if (sec) {
        const bottom = sec.offsetTop + sec.offsetHeight;
        y = Math.min(0, 1030 - bottom);
      }
    }
    if (y !== lastY) { lastY = y; translateY($('.tscroll', root), y); }
  }

  const epTrack = { first: 0 };
  const zones = [
    {
      id: 'tbtn', dir: 'h',
      items: () => $$('.thead .btn', root),
      onFocus: layout,
      onEnter: (i) => deps.toast(i === 0 ? 'Джерела підключить розширення Lampac — наступний крок' : 'Мій список — скоро'),
    },
    {
      id: 'tseason', dir: 'h',
      items: () => $$('[data-zone="tseason"] .chip', root),
      onFocus: (i) => {
        layout();
        const s = seriesSeasons()[i];
        if (s && s.n !== season) {
          $$('[data-zone="tseason"] .chip', root).forEach((c, k) => c.classList.toggle('cur', k === i));
          loadSeason(s.n);
        }
      },
    },
    {
      id: 'trange', dir: 'h',
      items: () => $$('[data-zone="trange"] .chip', root),
      onFocus: (i) => { layout(); if (i !== range) { range = i; drawEpisodes(); } },
    },
    {
      id: 'teps', dir: 'h',
      items: () => $$('[data-zone="teps"] .card', root),
      onFocus: (i) => {
        layout();
        const sec = $('[data-zone="teps"]', root);
        const first = Math.max(0, i - 3);
        if (first !== epTrack.first || !epTrack.applied) {
          epTrack.first = first; epTrack.applied = true;
          translateX($('.track', sec), -first * 364);
        }
        loadPictures(sec, first, first + 8);
      },
      onEnter: (i) => {
        const e = (ranges()[range] || [])[i];
        if (e) deps.toast('Сезон ' + season + ', серія ' + e.n + ': джерела підключить розширення Lampac');
      },
    },
  ];

  deps.bg.set(item.backdrop);
  draw();
  firstAnswer('details', [item]).then((got) => {
    d = got || { desc: item.desc || '' };
    if (d.backdrop) deps.bg.set(d.backdrop);
    draw();
    const seasons = seriesSeasons();
    if (seasons.length) {
      const start = seasons.find((s) => s.n === season) ? season : seasons[0].n;
      loadSeason(start, progress && progress.s === start ? progress.e : 1);
    }
    deps.focus.refresh();
  });

  return { zones };
}

function translateX(el, x) {
  const v = 'translate3d(' + x + 'px,0,0)';
  el.style.webkitTransform = v;
  el.style.transform = v;
}
