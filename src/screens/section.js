import { rowHTML, scrollTrack, loadPictures, styleOf, visibleCount } from '../ui/row.js';
import { esc, $, $$, translateY } from '../ui/util.js';

// A section of the top menu (Movies, Series, …): a hero at the top and rows below.
// Going down, the page scrolls so the focused row sits under the menu; the menu itself never hides.
//
// data: { hero: [Item], rows: [Row], demo?: bool, note?: string }
// opts: { focus, bg, toast, onDeep(bool), openTitle(item) }

function heroMeta(it) {
  return it.meta || [it.genre, it.year].filter(Boolean).join(' · ');
}

export function createSection(root, data, opts) {
  let hero = 0;
  const tracks = {};
  const heroes = data.hero || [];

  root.innerHTML = '<div class="page">' +
    (heroes.length
      ? '<section class="hero" data-zone="hero"><div class="hero-body"></div><div class="dots">' + heroes.map(() => '<i></i>').join('') + '</div></section>'
      : '<div class="pad-top"></div>') +
    (data.note ? '<div class="note">' + esc(data.note) + '</div>' : '') +
    data.rows.map((r, i) => rowHTML('r' + i, r)).join('') + '</div>';
  const page = $('.page', root);

  function drawHero() {
    const it = heroes[hero];
    if (!it) return;
    $('.hero-body', root).innerHTML =
      '<h1' + (it.title.length > 22 ? ' class="long"' : '') + '>' + esc(it.title) + '</h1>' +
      '<div class="meta">' + esc(heroMeta(it)) + '</div>' +
      (it.desc ? '<div class="desc">' + esc(it.desc) + '</div>' : '') +
      '<div class="btns"><span class="btn">Дивитися</span><span class="btn round">ⓘ</span></div>';
    $$('.dots i', root).forEach((d, i) => { d.className = i === hero ? 'on' : ''; });
    opts.bg.set(it.backdrop);
  }

  // Zone positions are read once: reading offsetTop on every key press forces a layout pass.
  let geo = null;
  let lastY = null;
  function scrollTo(zone) {
    if (!geo) {
      geo = {};
      $$('[data-zone]', page).forEach((s) => { geo[s.getAttribute('data-zone')] = { top: s.offsetTop, bottom: s.offsetTop + s.offsetHeight }; });
    }
    let y = 0;
    if (zone !== 'hero') {
      const g = geo[zone];
      const firstRow = zone === 'r0';
      y = firstRow && g.bottom <= 1060 ? 0 : -(g.top - 200);
      if (!heroes.length && g.bottom <= 1060) y = 0;
    }
    if (y !== lastY) {
      lastY = y;
      translateY(page, y);
      opts.onDeep(y < 0);
    }
    return y < 0;
  }

  const zones = [];
  if (heroes.length) {
    zones.push({
      id: 'hero',
      dir: 'h',
      items: () => $$('.hero .btn', root),
      onFocus: () => { scrollTo('hero'); opts.bg.set(heroes[hero].backdrop); },
      // past the first / last button the hero switches to the previous / next title, as on Apple TV
      onEdge: (step) => { hero = (hero + step + heroes.length) % heroes.length; drawHero(); opts.focus.refresh(); },
      onEnter: () => opts.openTitle(heroes[hero]),
    });
  }

  data.rows.forEach((row, ri) => {
    const id = 'r' + ri;
    const sec = $('[data-zone="' + id + '"]', page);
    tracks[id] = { first: 0 };
    zones.push({
      id,
      dir: 'h',
      items: () => $$('.card', sec),
      onFocus: (i) => {
        const deep = scrollTo(id);
        scrollTrack(sec, i, tracks[id], styleOf(row));
        // the row below comes into view next: start its first pictures now
        const below = $('[data-zone="r' + (ri + 1) + '"]', page);
        if (below) loadPictures(below, 0, visibleCount(styleOf(data.rows[ri + 1])) + 1);
        const it = row.items[i];
        opts.bg.set(deep || !heroes.length ? it.backdrop : heroes[hero].backdrop);
      },
      onEnter: (i) => opts.openTitle(row.items[i]),
    });
  });

  drawHero();
  if (!heroes.length && data.rows[0] && data.rows[0].items[0]) opts.bg.set(data.rows[0].items[0].backdrop);
  // first screen: the first two rows' visible cards, one row after another so decoding is spread out
  data.rows.slice(0, 2).forEach((row, ri) => {
    setTimeout(() => loadPictures($('[data-zone="r' + ri + '"]', page), 0, visibleCount(styleOf(row)) + 1), ri * 400);
  });
  return { zones };
}
