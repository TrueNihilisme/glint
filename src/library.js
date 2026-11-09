import { load, save } from './store.js';

// What the viewer keeps on this TV: titles being watched and «My list». A small snapshot of each title is
// stored (name, pictures, TMDB id, section) so the rows can be drawn without asking any extension.

const MAX = 60;

function lib() { return load('library', { items: {}, recent: [], fav: [] }); }

// TMDB backdrops come in fixed widths; cards are 400 px wide, so a 300-px copy is enough (and cheaper on the TV)
function small(url) { return String(url || '').replace('/w1280/', '/w300/').replace('/w780/', '/w300/'); }

function snapshot(it, section) {
  return { id: it.id, title: it.title, year: it.year || '', genre: it.genre || '', desc: it.desc || '', backdrop: it.backdrop || '',
    card: small(it.backdrop) || it.card || '', tmdb: it.tmdb || null, section };
}

// the section a title belongs to: the one it was opened from, or by its type when opened from search
export function sectionFor(it, current) {
  if (['movies', 'series', 'cartoons', 'anime'].indexOf(current) >= 0) return current;
  return it.tmdb && it.tmdb.type === 'tv' ? 'series' : 'movies';
}

export function touch(it, section) {
  const l = lib();
  l.items[it.id] = snapshot(it, section);
  l.recent = [it.id].concat(l.recent.filter((x) => x !== it.id)).slice(0, MAX);
  save('library', l);
}

export function isFav(id) { return lib().fav.indexOf(id) >= 0; }

export function toggleFav(it, section) {
  const l = lib();
  const k = l.fav.indexOf(it.id);
  if (k >= 0) l.fav.splice(k, 1);
  else { l.fav.unshift(it.id); l.items[it.id] = snapshot(it, section); }
  save('library', l);
  return k < 0;
}

function progressLabel(p) {
  if (!p) return '';
  if (p.s) return 'Продовжити · С' + p.s + ', Е' + p.e;
  if (p.dur && p.pos) return 'Залишилось ' + Math.max(1, Math.round((p.dur - p.pos) / 60000)) + ' хв';
  return '';
}

// rows for the top of a section: «Continue watching» and «My list»
export function libraryRows(section) {
  const l = lib();
  const progress = load('progress', {});
  const inSection = (id) => l.items[id] && l.items[id].section === section;
  const going = l.recent.filter((id) => inSection(id) && progress[id] && !progress[id].done && (progress[id].s || progress[id].pos > 60000));
  const rows = [];
  if (going.length) {
    rows.push({ title: 'Продовжити перегляд', style: 'wide', order: 1,
      items: going.map((id) => Object.assign({}, l.items[id], { meta: progressLabel(progress[id]) })) });
  }
  const fav = l.fav.filter(inSection);
  if (fav.length) rows.push({ title: 'Моє', style: 'wide', order: 2, items: fav.map((id) => l.items[id]) });
  return rows;
}
