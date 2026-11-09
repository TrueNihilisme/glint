import { esc, cssUrl } from './util.js';

// A row of cards: 'wide' (400×225, 16:9) or 'poster' (248×372). The track moves with transform only; the
// focused card scales and its shadow is a separate layer that fades in (animating box-shadow itself drops a
// Tizen 4 TV to ~20 fps, see docs).

const STEP = { wide: 440, poster: 288 };   // card width + 40 gap

function sub(it) {
  if (it.meta) return it.meta;
  return [it.year, it.genre].filter(Boolean).join(' · ');
}

export function rowHTML(id, row) {
  const style = row.style === 'poster' ? 'poster' : 'wide';
  return '<section class="row" data-zone="' + id + '"><h2>' + esc(row.title) + (row.ai ? '<span class="ai">ШІ</span>' : '') +
    '</h2><div class="track">' +
    row.items.map((it) =>
      '<div class="card ' + style + '"><div class="thumb" style="background-image:' + cssUrl(it.card || '') + '"></div>' +
      '<div class="cap"><b>' + esc(it.title) + '</b><span>' + esc(sub(it)) + '</span></div></div>'
    ).join('') + '</div></section>';
}

// Keep the focused card on screen: scroll only when it would leave the visible part of the row.
export function scrollTrack(section, i, state, style) {
  const step = STEP[style === 'poster' ? 'poster' : 'wide'];
  const visible = Math.floor((1920 - 240) / step);
  let first = state.first || 0;
  if (i > first + visible - 2) first = i - (visible - 2);
  if (i < first) first = i;
  first = Math.max(0, first);
  if (first === state.first && state.applied) return;   // nothing moves: no style write
  state.first = first;
  state.applied = true;
  const track = state.track || (state.track = section.querySelector('.track'));
  const v = 'translate3d(' + (-first * step) + 'px,0,0)';
  track.style.webkitTransform = v;
  track.style.transform = v;
}
