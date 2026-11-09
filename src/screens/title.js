import { extensions, contextFor, problem } from '../ext/registry.js';
import { load, save } from '../store.js';
import { loadPictures } from '../ui/row.js';
import { esc, $, $$, translateY } from '../ui/util.js';

// The title page: what the row card knew at once, then details from the first extension that has them.
// For series: seasons, ranges of 20 when a season is longer, episodes; it opens on the next unwatched one.
// «Source» and «Voice» chips choose where to play from; Play and Enter on an episode open the player.
//
// Extension API used here (all optional):
//   details(item, ctx)          → Promise<{ desc, year, genres[], runtime, rating, cast[], director, original, imdb, lang,
//                                           backdrop, seasons: [{ n, count }] } | null>
//   episodes(item, season, ctx) → Promise<[{ n, name, runtime, still }]>
//   sources(item, ctx)          → Promise<[{ id, name, note? }]>
//   play(item, sourceId, { season, episode, voice }, ctx) → Promise<{ url, title?, voices?: [name], voice? }>
//
// deps: { focus, bg, toast, player }

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

function allSources(item) {
  const exts = extensions().filter((e) => typeof e.sources === 'function');
  return Promise.all(exts.map((e) => Promise.resolve().then(() => e.sources(item, contextFor(e)))
    .then((list) => (list || []).map((s) => ({ ext: e, id: s.id, name: s.name, note: s.note || '' })))
    .catch((err) => { problem((e.name || e.id) + ' sources: ' + (err && err.message || err)); return []; })))
    .then((lists) => [].concat.apply([], lists));
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
  const saved = () => load('progress', {})[item.id] || null;   // { s, e, pos, dur }
  let progress = saved();
  let d = null;
  let season = progress && progress.s || 1;
  let range = 0;
  let eps = [];
  let sources = null;         // null — not loaded yet
  let src = load('src.' + item.id, 0);
  let voices = [];
  let voice = load('voice.' + item.id, null);

  const seriesSeasons = () => (d && d.seasons ? d.seasons.filter((s) => s.count > 0) : []);
  const isSeries = () => !!(item.tmdb && item.tmdb.type === 'tv') || seriesSeasons().length > 0;

  function watchLabel() {
    if (!isSeries()) return progress && progress.pos > 60000 ? 'Продовжити' : 'Дивитися';
    return progress ? 'Продовжити С' + progress.s + ' Е' + progress.e : 'Дивитися С1 Е1';
  }
  function srcLabel() {
    if (sources === null) return 'Джерела: шукаю…';
    if (!sources.length) return 'Джерел нема';
    const s = sources[src % sources.length];
    return 'Джерело: ' + s.name + (s.note ? ' (' + s.note + ')' : '');
  }

  function draw() {
    const seasons = seriesSeasons();
    root.innerHTML = '<div class="tscroll">' +
      '<section class="thead" data-zone="tbtn"><div class="t-body">' +
        '<h1' + (item.title.length > 22 ? ' class="long"' : '') + '>' + esc(item.title) + '</h1>' +
        '<div class="meta">' + esc(metaLine(item, d)) + '</div>' +
        '<div class="desc">' + esc((d && d.desc) || item.desc || (d ? '' : 'Завантаження…')) + '</div>' +
        '<div class="btns"><span class="btn">' + esc(watchLabel()) + '</span><span class="btn round">+</span></div>' +
      '</div>' +
      (d && ((d.cast && d.cast.length) || d.director) ? '<div class="t-side">' +
        (d.cast && d.cast.length ? '<p><span>У ролях</span><br>' + esc(d.cast.slice(0, 4).join(', ')) + '</p>' : '') +
        (d.director ? '<p><span>' + (isSeries() ? 'Автори' : 'Режисер') + '</span><br>' + esc(d.director) + '</p>' : '') + '</div>' : '') +
      '</section>' +
      '<section class="tsec" data-zone="tsrc"><span class="chip">' + esc(srcLabel()) + ' ▾</span>' +
        (voices.length ? '<span class="chip">Озвучка: ' + esc(voice || voices[0]) + ' ▾</span>' : '') + '</section>' +
      (seasons.length ? '<section class="tsec" data-zone="tseason">' + seasons.map((s) =>
        '<span class="chip' + (s.n === season ? ' cur' : '') + '">Сезон ' + s.n + '</span>').join('') + '</section>' +
        '<section class="tsec" data-zone="trange"></section>' +
        '<section class="row tsec-eps" data-zone="teps"><div class="track"></div></section>' : '') +
      '</div>';
    if (seasons.length) drawEpisodes();
    lastY = null;
    layout();
  }

  function ranges() {
    const out = [];
    for (let i = 0; i < eps.length; i += RANGE) out.push(eps.slice(i, i + RANGE));
    return out;
  }

  const epTrack = { first: 0 };
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
    }).join('') : '<div class="t-empty">' + (eps.length ? '' : 'Серії завантажуються…') + '</div>';
    loadPictures($('[data-zone="teps"]', root), 0, 6);
    epTrack.first = 0; epTrack.applied = false;
    translateX(track, 0);
  }

  function loadSeason(n, focusEp) {
    season = n;
    range = 0;
    eps = [];
    drawEpisodes();
    return firstAnswer('episodes', [item, n]).then((list) => {
      if (season !== n) return;
      eps = list && list.length ? list : fallbackEpisodes(n);
      let k = -1;
      if (focusEp) k = eps.findIndex((e) => e.n === focusEp);
      if (k >= 0) range = Math.floor(k / RANGE);
      drawEpisodes();
      if (k >= 0) deps.focus.focus('teps', k % RANGE);
      else deps.focus.refresh();
    });
  }
  // without an extension that knows episodes: numbers only, as many as the season has
  function fallbackEpisodes(n) {
    const s = seriesSeasons().find((x) => x.n === n);
    const out = [];
    for (let i = 1; i <= (s ? s.count : 0); i++) out.push({ n: i });
    return out;
  }

  // vertical position: the header stays until the focus goes below it
  let lastY = null;
  function layout() {
    const zone = deps.focus.zone();
    let y = 0;
    if (zone && zone !== 'tbtn' && zone !== 'tsrc') {
      const sec = $('[data-zone="' + zone + '"]', root);
      if (sec) y = Math.min(0, 1030 - (sec.offsetTop + sec.offsetHeight));
    }
    if (y !== lastY) { lastY = y; translateY($('.tscroll', root), y); }
  }

  // ── playing ──
  function play(s, e) {
    if (!sources || !sources.length) {
      deps.toast(sources === null ? 'Джерела ще шукаються…' : 'Нема джерел: підключіть розширення з джерелами (Lampac)');
      return;
    }
    const source = sources[src % sources.length];
    deps.toast('Відкриваю: ' + source.name + (s ? ' · С' + s + ' Е' + e : ''));
    Promise.resolve().then(() => source.ext.play(item, source.id, { season: s, episode: e, voice }, contextFor(source.ext)))
      .then((r) => {
        if (!r || !r.url) { deps.toast(source.name + ': нічого не знайшлось — спробуйте інше джерело'); return; }
        if (r.voices && r.voices.length) { voices = r.voices; if (!voice || voices.indexOf(voice) < 0) voice = r.voice || voices[0]; }
        const start = s ? (progress && progress.s === s && progress.e === e ? progress.pos || 0 : 0) : (progress ? progress.pos || 0 : 0);
        return deps.player.play({
          url: r.url,
          title: item.title,
          sub: (s ? 'Сезон ' + s + ', серія ' + e + ' · ' : '') + source.name + (voice ? ' · ' + voice : ''),
          start: start > 60000 ? start - 5000 : 0,
        }).then((res) => remember(s, e, res));
      })
      .catch((err) => { problem(source.name + ' play: ' + (err && err.message || err)); deps.toast(source.name + ': ' + (err && err.message || err)); });
  }
  function remember(s, e, res) {
    const all = load('progress', {});
    const done = res.dur > 0 && res.pos / res.dur > 0.92;
    if (s) {
      const eCount = (eps.length && season === s) ? eps[eps.length - 1].n : e;
      all[item.id] = done ? (e < eCount ? { s, e: e + 1, pos: 0 } : { s: s + 1, e: 1, pos: 0 }) : { s, e, pos: res.pos, dur: res.dur };
    } else {
      all[item.id] = done ? { pos: 0, done: true } : { pos: res.pos, dur: res.dur };
    }
    save('progress', all);
    progress = all[item.id];
    draw();
    deps.focus.refresh();
  }

  const zones = [
    {
      id: 'tbtn', dir: 'h',
      items: () => $$('.thead .btn', root),
      onFocus: layout,
      onEnter: (i) => {
        if (i !== 0) { deps.toast('Мій список — скоро'); return; }
        if (isSeries()) play(progress ? progress.s : 1, progress ? progress.e : 1);
        else play(0, 0);
      },
    },
    {
      id: 'tsrc', dir: 'h',
      items: () => $$('[data-zone="tsrc"] .chip', root),
      onFocus: layout,
      onEnter: (i) => {
        if (i === 0 && sources && sources.length > 1) {
          src = (src + 1) % sources.length;
          save('src.' + item.id, src);
          voices = []; voice = null;
        } else if (i === 1 && voices.length > 1) {
          voice = voices[(voices.indexOf(voice) + 1) % voices.length];
          save('voice.' + item.id, voice);
        }
        draw();
        deps.focus.focus('tsrc', i);
      },
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
      onEnter: (i) => { const e = (ranges()[range] || [])[i]; if (e) play(season, e.n); },
    },
  ];

  deps.bg.set(item.backdrop);
  draw();
  firstAnswer('details', [item]).then((got) => {
    d = got || { desc: item.desc || '' };
    // what sources need to find the title: original name, year, IMDb id, language
    ['original', 'imdb', 'lang'].forEach((k) => { if (d[k]) item[k] = d[k]; });
    if (d.year) item.year = d.year;
    if (d.backdrop) deps.bg.set(d.backdrop);
    draw();
    const seasons = seriesSeasons();
    if (seasons.length) {
      const start = seasons.find((s) => s.n === season) ? season : seasons[0].n;
      loadSeason(start, progress && progress.s === start ? progress.e : 1);
    }
    deps.focus.refresh();
    return allSources(item);
  }).then((list) => {
    sources = list || [];
    if (src >= sources.length) src = 0;
    const z = deps.focus.zone();
    const i = deps.focus.index(z);
    draw();
    deps.focus.focus(z, i);
  });

  return { zones };
}

function translateX(el, x) {
  const v = 'translate3d(' + x + 'px,0,0)';
  el.style.webkitTransform = v;
  el.style.transform = v;
}
