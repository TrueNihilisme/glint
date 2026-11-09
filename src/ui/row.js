import { esc, cssUrl } from './util.js';

// A row of cards: 'wide' (400×225, 16:9) or 'poster' (248×372). The track moves with transform only; the
// focused card scales, its shadow is a separate layer that fades in (animating box-shadow itself drops a
// Tizen 4 TV to ~20 fps, see docs), and a static glass layer (rim + sheen) sits on top of the picture.
//
// Pictures load in portions — what is on screen first, then a few cards ahead — and each fades in over a
// dark placeholder once it has arrived: loading a whole row at once on the TV stalled the scroll and
// pictures popped in half-drawn.

const STEP = { wide: 440, poster: 288 };   // card width + 40 gap
const AHEAD = 3;                           // cards loaded past the visible ones

function sub(it) {
  if (it.meta) return it.meta;
  return [it.year, it.genre].filter(Boolean).join(' · ');
}

export function styleOf(row) { return row.style === 'poster' ? 'poster' : 'wide'; }
export function visibleCount(style) { return Math.floor((1920 - 120 + 40) / STEP[style]); }

export function rowHTML(id, row) {
  const style = styleOf(row);
  return '<section class="row" data-zone="' + id + '"><h2>' + esc(row.title) + '</h2><div class="track">' +
    row.items.map((it) =>
      '<div class="card ' + style + '"><div class="thumb"><i class="pic" data-src="' + esc(it.card || '') + '"></i></div>' +
      '<div class="cap"><b>' + esc(it.title) + '</b><span>' + esc(sub(it)) + '</span></div></div>'
    ).join('') + '</div></section>';
}

// Start loading the pictures of cards [from, to) in this row section; already started ones are skipped.
export function loadPictures(section, from, to) {
  const pics = section.querySelectorAll('.pic');
  for (let i = Math.max(0, from); i < Math.min(to, pics.length); i++) {
    const pic = pics[i];
    const src = pic.getAttribute('data-src');
    if (!src) continue;
    pic.removeAttribute('data-src');
    const img = new Image();
    img.onload = () => { pic.style.backgroundImage = cssUrlRaw(src); pic.className = 'pic ready'; };
    img.src = src;
  }
}

function cssUrlRaw(u) {
  // same encoding as cssUrl, without the attribute escaping (this goes straight into style)
  return 'url("' + String(u).replace(/["'\\\n\r()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + '")';
}

// Keep the focused card on screen: scroll only when it would leave the visible part of the row.
export function scrollTrack(section, i, state, style) {
  const step = STEP[style];
  const visible = visibleCount(style);
  let first = state.first || 0;
  if (i > first + visible - 2) first = i - (visible - 2);
  if (i < first) first = i;
  first = Math.max(0, first);
  loadPictures(section, first, first + visible + AHEAD);
  if (first === state.first && state.applied) return;   // nothing moves: no style write
  state.first = first;
  state.applied = true;
  const track = state.track || (state.track = section.querySelector('.track'));
  const v = 'translate3d(' + (-first * step) + 'px,0,0)';
  track.style.webkitTransform = v;
  track.style.transform = v;
}

export { cssUrl };
