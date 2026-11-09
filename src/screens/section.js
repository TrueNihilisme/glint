import { stubSection } from '../data/stub.js';
import { rowHTML, scrollTrack } from '../ui/row.js';
import { esc, $, $$, translateY } from '../ui/util.js';

// A section of the top menu (Movies, Series, …): a hero at the top and rows below.
// Going down, the page scrolls so the focused row sits under the menu; the menu itself never hides.
//
// opts: { focus, bg, toast, onDeep(bool) }

export function createSection(root, kind, opts) {
  const data = stubSection(kind);
  let hero = 0;
  const tracks = {};

  root.innerHTML = '<div class="page"><section class="hero" data-zone="hero"><div class="hero-body"></div><div class="dots">' +
    data.hero.map(() => '<i></i>').join('') + '</div></section>' +
    data.rows.map((r, i) => rowHTML('r' + i, r)).join('') + '</div>';
  const page = $('.page', root);

  function drawHero() {
    const it = data.hero[hero];
    $('.hero-body', root).innerHTML =
      '<h1>' + esc(it.title) + '</h1>' +
      '<div class="meta">' + esc(it.genre) + ' · ' + it.year + '</div>' +
      '<div class="desc">' + esc(it.desc) + '</div>' +
      '<div class="btns"><span class="btn">Дивитися</span><span class="btn round">+</span></div>';
    $$('.dots i', root).forEach((d, i) => { d.className = i === hero ? 'on' : ''; });
    opts.bg.set(it.backdrop);
  }

  function scrollTo(zone) {
    let y = 0;
    if (zone !== 'hero') {
      const sec = $('[data-zone="' + zone + '"]', page);
      const top = sec.offsetTop;
      const bottom = top + sec.offsetHeight;
      y = zone === 'r0' && bottom <= 1060 ? 0 : -(top - 200);
    }
    translateY(page, y);
    opts.onDeep(y < 0);
    return y < 0;
  }

  const zones = [{
    id: 'hero',
    dir: 'h',
    items: () => $$('.hero .btn', root),
    onFocus: () => { scrollTo('hero'); opts.bg.set(data.hero[hero].backdrop); },
    // past the first / last button the hero switches to the previous / next title, as on Apple TV
    onEdge: (step) => { hero = (hero + step + data.hero.length) % data.hero.length; drawHero(); opts.focus.refresh(); },
    onEnter: (i) => opts.toast(i === 0 ? 'Плеєр — на наступному етапі' : 'Мій список — на наступному етапі'),
  }];

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
        scrollTrack(sec, i, tracks[id]);
        opts.bg.set(deep ? row.items[i].backdrop : data.hero[hero].backdrop);
      },
      onEnter: (i) => opts.toast('Картка «' + row.items[i].title + '» — на наступному етапі'),
    });
  });

  drawHero();
  return { zones };
}
