import { rowHTML, scrollTrack, loadPictures, styleOf, visibleCount } from '../ui/row.js';
import { esc, $, $$, translateY } from '../ui/util.js';
import { whenIdle } from '../idle.js';
import { picOf } from '../ui/color.js';

// A section of the top menu (Movies, Series, …): a hero at the top and rows below.
// Going down, the page scrolls so the focused row sits under the menu; the menu itself never hides.
//
// data: { hero: [Item], rows: [Row], demo?: bool, note?: string }
// opts: { focus, bg, toast, onDeep(bool), openTitle(item) }

function heroMeta(it) {
  return it.meta || [it.genre, it.year].filter(Boolean).join(' · ');
}

const FIRST = 3;   // rows built at once; the rest come while the remote is quiet

export function createSection(root, data, opts) {
  let hero = 0;
  const tracks = {};
  const heroes = data.hero || [];

  root.innerHTML = '<div class="page">' +
    (heroes.length
      ? '<section class="hero" data-zone="hero"><div class="hero-body"></div><div class="dots">' + heroes.map(() => '<i></i>').join('') + '</div></section>'
      : '<div class="pad-top"></div>') +
    (data.note ? '<div class="note">' + esc(data.note) + '</div>' : '') +
    data.rows.slice(0, FIRST).map((r, i) => rowHTML('r' + i, r)).join('') + '</div>';
  const page = $('.page', root);
  // The other rows are added one by one while the remote is quiet: building ~9 rows (~180 cards) at once made
  // switching sections drop to ~5 fps on the TV.
  let built = Math.min(FIRST, data.rows.length);
  function buildMore(upTo) {
    if (built >= upTo || !root.contains(page)) return;
    let html = '';
    while (built < Math.min(upTo, data.rows.length)) { html += rowHTML('r' + built, data.rows[built]); built++; }
    page.insertAdjacentHTML('beforeend', html);
    geo = null;               // positions changed
    rowEls = $$('.row', page);
    const k = liveAt; liveAt = -2; live(k);
  }

  // The hero's text is updated in place: rebuilding it (buttons included) on every switch cost frames and the
  // focused button had to be found again.
  function drawHero() {
    const it = heroes[hero];
    if (!it) return;
    const body = $('.hero-body', page);
    if (!body.firstChild) {
      body.innerHTML = '<h1></h1><div class="meta"></div><div class="desc"></div>' +
        '<div class="btns"><span class="btn">Дивитися</span><span class="btn round">ⓘ</span></div>';
    }
    const h1 = $('h1', body);
    h1.textContent = it.title;
    h1.className = it.title.length > 22 ? 'long' : '';
    $('.meta', body).textContent = heroMeta(it);
    const desc = $('.desc', body);
    desc.textContent = it.desc || '';
    desc.style.display = it.desc ? '' : 'none';
    $$('.dots i', page).forEach((d, i) => { d.className = i === hero ? 'on' : ''; });
    opts.bg.set(heroPhoto(it), true);
  }

  // the hero shows its title's photo full-screen; rows below take the focused card's colour
  function heroPhoto(it) { return it.backdrop || picOf(it); }

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

  // Only rows near the focus are «live»: their cards get compositing layers (will-change) and are painted.
  // Rows further away are hidden. With ~9 rows × 20 cards every card on its own layer the TV ran out of room
  // and a row of cards fell from ~48 to ~25 fps.
  let rowEls = $$('.row', page);
  let liveAt = -2;
  function live(k) {
    if (k === liveAt) return;
    liveAt = k;
    rowEls.forEach((el, i) => {
      el.classList.toggle('live', i >= k - 1 && i <= k + 2);
      el.classList.toggle('far', i < k - 1 || i > k + 3);
    });
  }
  live(0);

  const zones = [];
  if (heroes.length) {
    zones.push({
      id: 'hero',
      dir: 'h',
      items: () => $$('.hero .btn', page),
      onFocus: () => { scrollTo('hero'); live(0); opts.bg.set(heroPhoto(heroes[hero]), true); },
      // past the first / last button the hero switches to the previous / next title, as on Apple TV
      onEdge: (step) => { hero = (hero + step + heroes.length) % heroes.length; drawHero(); },
      onEnter: () => opts.openTitle(heroes[hero]),
    });
  }

  data.rows.forEach((row, ri) => {
    const id = 'r' + ri;
    const secOf = () => $('[data-zone="' + id + '"]', page);   // a row may not be built yet
    tracks[id] = { first: 0 };
    zones.push({
      id,
      dir: 'h',
      items: () => { const s = secOf(); return s ? $$('.card', s) : []; },
      onFocus: (i) => {
        buildMore(ri + 3);    // the rows just below must exist before the page scrolls to them
        const sec = secOf();
        live(ri);
        scrollTrack(sec, i, tracks[id], styleOf(row));
        // the row below comes into view next: start its first pictures now
        const below = $('[data-zone="r' + (ri + 1) + '"]', page);
        if (below) loadPictures(below, 0, visibleCount(styleOf(data.rows[ri + 1])) + 1);
        // below the hero the background takes the focused card's colour (a photo here took row → row down to
        // ~4 fps on the TV); in the first row, while the hero is still on screen, it keeps the hero's photo
        const deep = scrollTo(id);
        if (deep || !heroes.length) opts.bg.set(picOf(row.items[i]));
        else opts.bg.set(heroPhoto(heroes[hero]), true);
      },
      onEnter: (i) => opts.openTitle(row.items[i]),
    });
  });

  drawHero();
  if (!heroes.length && data.rows[0] && data.rows[0].items[0]) opts.bg.set(picOf(data.rows[0].items[0]));
  // first screen: the first two rows' visible cards, one row after another so decoding is spread out
  data.rows.slice(0, 2).forEach((row, ri) => {
    setTimeout(() => loadPictures($('[data-zone="r' + ri + '"]', page), 0, visibleCount(styleOf(row)) + 1), ri * 400);
  });
  // then, only while the remote is quiet, the visible cards of the other rows, one row at a time — so the first
  // move down to a row doesn't start with a dozen downloads and decodes at once
  let next = 2;
  const ahead = () => {
    if (next >= data.rows.length || !root.contains(page)) return;
    buildMore(next + 1);
    const k = next++;
    const sec = $('[data-zone="r' + k + '"]', page);
    if (sec) loadPictures(sec, 0, visibleCount(styleOf(data.rows[k])) + 1);
    whenIdle(ahead, 600);
  };
  whenIdle(ahead, 1500);
  // the hero titles' photos, fetched ahead while the remote is quiet
  whenIdle(() => heroes.forEach((it) => {
    if (it.backdrop) new Image().src = String(it.backdrop).replace('/t/p/w1280/', '/t/p/w780/').replace('/t/p/original/', '/t/p/w780/');
  }), 2500);

  // Sections are kept and shown again when the viewer comes back (see main.js); restore() puts back what lives
  // outside the page: the background and the dimmed look below the hero.
  function restore() {
    opts.onDeep(lastY < 0);
    if (heroes.length && !(lastY < 0)) opts.bg.set(heroPhoto(heroes[hero]), true);
  }
  return { zones, page, restore };
}
