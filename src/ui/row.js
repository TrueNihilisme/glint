import { esc, cssUrl } from './util.js';

// A row of cards. The track moves with transform only; the focused card scales and its shadow is a
// separate layer that fades in (animating box-shadow itself drops a Tizen 4 TV to ~20 fps, see docs).

const STEP = 440; // card 400 + gap 40
const VISIBLE = Math.floor((1920 - 240) / STEP);

export function rowHTML(id, row) {
  return '<section class="row" data-zone="' + id + '"><h2>' + esc(row.title) + '</h2><div class="track">' +
    row.items.map((it) =>
      '<div class="card" data-id="' + esc(it.id) + '"><div class="thumb" style="background-image:' + cssUrl(it.card) + '"></div>' +
      '<div class="cap"><b>' + esc(it.title) + '</b><span>' + it.year + ' · ' + esc(it.genre) + '</span></div></div>'
    ).join('') + '</div></section>';
}

// Keep the focused card on screen: scroll only when it would leave the visible part of the row.
export function scrollTrack(section, i, state) {
  let first = state.first || 0;
  if (i > first + VISIBLE - 2) first = i - (VISIBLE - 2);
  if (i < first) first = i;
  first = Math.max(0, first);
  if (first === state.first && state.applied) return;   // nothing moves: no style write
  state.first = first;
  state.applied = true;
  const track = state.track || (state.track = section.querySelector('.track'));
  const v = 'translate3d(' + (-first * STEP) + 'px,0,0)';
  track.style.webkitTransform = v;
  track.style.transform = v;
}
