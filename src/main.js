import { createFocus } from './focus.js';
import { KEY, registerMediaKeys, exitApp, fit } from './platform.js';
import { createSection } from './screens/section.js';
import { createSettings } from './screens/settings.js';
import { createTitle } from './screens/title.js';
import { createPlayer } from './player.js';
import { ask } from './ui/input.js';
import { libraryRows, sectionFor } from './library.js';
import { register, loadExtensions, extensions, contextFor, applyPreset, setToast, problem, debugInfo } from './ext/registry.js';
import { load } from './store.js';
import { demoSection } from './data/stub.js';
import { esc, $, $$ } from './ui/util.js';
import { selftest } from './selftest.js';
import { markKey } from './idle.js';

/* global GLINT_VERSION, GLINT_PRESET, GLINT_SELFTEST, GLINT_SELFTEST_MODE */
window.Glint = { version: GLINT_VERSION, register, debug: () => debugInfo() };

// Core sections. TV, Music and the like are not here on purpose: they come with extensions (see extMenus).
const SECTIONS = [
  { id: 'movies', title: 'Фільми' },
  { id: 'series', title: 'Серіали' },
  { id: 'cartoons', title: 'Мультфільми' },
  { id: 'anime', title: 'Аніме' },
];

const LENS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';
const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></svg>';

const tv = document.getElementById('tv');
tv.innerHTML =
  '<div class="bg" id="bgA"></div><div class="bg" id="bgB"></div><div class="shade"></div><div class="dim"></div>' +
  '<div id="section"></div><div class="topshade"></div><nav class="menu"></nav><div class="drop"></div>' +
  '<div id="title"></div><div id="settings"></div><div class="toast"><span></span></div>';

// Background: two layers that cross-fade. After the fade the hidden one gets visibility:hidden —
// a full-screen layer at opacity 0 is still composited every frame, and on a Tizen 4 TV that alone
// took a row of cards from ~56 to ~42 fps (self-test A/B, 2026-11-09).
// A new background is applied only once the focus has rested for 300 ms: decoding a photo on every
// key press while walking a row took it down to ~8 fps on the TV with real TMDB backdrops.
const bg = (() => {
  let front = $('#bgA');
  let back = $('#bgB');
  let cur = '';
  let timer = 0;
  let wait = 0;
  function apply(url) {
    cur = url;
    clearTimeout(timer);
    back.style.backgroundImage = 'url("' + String(url).replace(/["\\]/g, '') + '")';
    back.style.visibility = 'visible';
    back.classList.add('on');
    front.classList.remove('on');
    const t = front; front = back; back = t;
    const old = back;
    timer = setTimeout(() => { old.style.visibility = 'hidden'; }, 750);
  }
  return {
    set(url) {
      clearTimeout(wait);
      // the background sits under a shade and often a dim layer: a 780-px TMDB copy is plenty, and a third of
      // the pixels of the 1280-px one to decode
      url = String(url || '').replace('/t/p/w1280/', '/t/p/w780/').replace('/t/p/original/', '/t/p/w780/');
      if (!url || url === cur) return;
      wait = setTimeout(() => apply(url), cur ? 300 : 0);
    },
  };
})();

let toastTimer = 0;
function toast(text) {
  const el = $('.toast');
  $('span', el).textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}
setToast(toast);

const focus = createFocus();
const player = createPlayer(tv);

// ── menu: core sections + menus from extensions ──
//
// Extension API: menu: [{ id, title, items: [{ id, title }] }] and page(menuId, itemId, ctx) → Promise<{ rows, hero? }>.
// Menus with the same id from several extensions merge (TV from an IPTV extension and from another one).
// A menu with more than one item shows a drop-down under its tab.
function extMenus() {
  const byId = {};
  const out = [];
  extensions().forEach((e) => (e.menu || []).forEach((m) => {
    let entry = byId[m.id];
    if (!entry) { entry = byId[m.id] = { key: 'ext:' + m.id, id: m.id, title: m.title, items: [] }; out.push(entry); }
    (m.items && m.items.length ? m.items : [{ id: m.id, title: m.title }]).forEach((it) => entry.items.push({ id: it.id, title: it.title, ext: e }));
  }));
  return out;
}
function allEntries() {
  return SECTIONS.map((s) => ({ key: s.id, id: s.id, title: s.title, section: true })).concat(extMenus());
}
function menuEntries() {
  const h = load('menu.hidden', []);
  return allEntries().filter((m) => h.indexOf(m.key) < 0);
}

let current = null;         // key of the open entry
const sub = {};             // entry key → chosen item index
function drawMenu() {
  $('.menu').innerHTML = '<div class="pill">' +
    menuEntries().map((m) => '<span class="tab' + (m.key === current ? ' sel' : '') + '">' + esc(m.title) +
      (m.items && m.items.length > 1 ? '<span class="chev">▾</span>' : '') + '</span>').join('') +
    '<span class="tab icon" aria-label="Пошук">' + LENS + '</span><span class="tab icon" aria-label="Налаштування">' + GEAR + '</span></div>';
}

const menuZone = {
  id: 'menu',
  dir: 'h',
  items: () => $$('.menu .tab'),
  // sections open only after the extensions have loaded — earlier the first one was built from demo
  // data (no extension yet) and stayed that way
  // the page is built once the focus rests on a tab for 350 ms: walking across the menu built every page on the
  // way, each with ~9 rows, and the TV dropped to ~3 fps
  onFocus: (i) => {
    clearTimeout(menuWait);
    const m = menuEntries()[i];
    if (ready && m) menuWait = setTimeout(() => { if (focus.zone() === 'menu' && focus.index('menu') === i) openEntry(m.key); }, 350);
  },
  onEnter: (i) => {
    const n = menuEntries().length;
    if (i === n) { openSearch(); return; }
    if (i > n) { openSettings(); return; }
    const m = menuEntries()[i];
    if (m.items && m.items.length > 1) focus.focus('drop', sub[m.key] || 0);
    else if (pageZones[0]) focus.focus(pageZones[0].id);
  },
};

// drop-down under a tab: the items of an extension menu
const dropZone = {
  id: 'drop',
  dir: 'v',
  items: () => ($('.drop').classList.contains('on') ? $$('.drop .ditem') : []),   // hidden drop-down: no zone
  onEdge: (step) => { if (step < 0) focus.focus('menu', menuEntries().findIndex((m) => m.key === current)); },
  onEnter: (i) => {
    const m = menuEntries().find((x) => x.key === current);
    if (!m) return;
    sub[m.key] = i;
    current = null;
    openEntry(m.key, true);
  },
};
function updateDrop() {
  const box = $('.drop');
  const zone = focus.zone();
  const entries = menuEntries();
  const i = zone === 'menu' ? focus.index('menu') : entries.findIndex((m) => m.key === current);
  const m = entries[i];
  const show = !!(m && m.items && m.items.length > 1 && (zone === 'menu' || zone === 'drop'));
  if (!show) { box.classList.remove('on'); return; }
  const tab = $$('.menu .tab')[i];
  const pill = $('.menu .pill');
  box.style.left = (pill.offsetLeft + tab.offsetLeft - 6) + 'px';
  const html = m.items.map((it, k) => '<div class="ditem' + (k === (sub[m.key] || 0) && m.key === current ? ' cur' : '') + '">' + esc(it.title) + '</div>').join('');
  if (box.getAttribute('data-for') !== m.key || box.innerHTML !== html) {
    box.setAttribute('data-for', m.key);
    box.innerHTML = html;
    if (zone === 'drop') focus.refresh();
  }
  box.classList.add('on');
}

// ── pages: sections (rows from all extensions) and extension menu items (rows from that extension) ──
const cache = {};
function sectionData(id) {
  const withRows = extensions().filter((e) => typeof e.rows === 'function');
  return Promise.all(withRows.map((e) =>
    Promise.resolve().then(() => e.rows(id, contextFor(e))).catch((err) => {
      const msg = (e.name || e.id) + ': ' + (err && err.message || err);
      problem(msg);
      toast(msg);
      return [];
    })
  )).then((lists) => {
    // Order: a row may set `order`; otherwise posters come first, wide cards next, the rest after —
    // the same order whichever extension the rows came from. Equal orders keep the extensions' order.
    const rank = (r) => (typeof r.order === 'number' ? r.order : r.style === 'poster' ? 10 : r.style === 'wide' ? 20 : 50);
    const rows = [].concat.apply([], lists).filter((r) => r && r.items && r.items.length)
      .map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
    if (!rows.length) return demoSection(id);
    const seen = {};
    const hero = [];
    rows.forEach((r) => r.items.forEach((it) => { if (hero.length < 5 && it.backdrop && !seen[it.id]) { seen[it.id] = 1; hero.push(it); } }));
    return { hero, rows };
  });
}
function entryData(m) {
  if (m.section) return sectionData(m.id);
  const item = m.items[sub[m.key] || 0] || m.items[0];
  const e = item.ext;
  if (typeof e.page !== 'function') return Promise.resolve({ rows: [], note: 'Розширення не дало сторінки' });
  return Promise.resolve().then(() => e.page(m.id, item.id, contextFor(e))).then((p) => {
    // remember which extension a card came from: Enter on it may need that extension's open()
    ((p && p.rows) || []).forEach((r) => (r.items || []).forEach((it) => { if (!it._ext) it._ext = e; }));
    return p;
  }).then((p) => ({
    hero: (p && p.hero) || [],
    rows: ((p && p.rows) || []).filter((r) => r && r.items && r.items.length),
    note: p && p.rows && p.rows.length ? p.note : (p && p.note) || 'Тут поки порожньо',
  })).catch((err) => {
    problem((e.name || e.id) + ' page: ' + (err && err.message || err));
    return { rows: [], note: (e.name || e.id) + ': ' + (err && err.message || err) };
  });
}

let pageZones = [];
let ticket = 0;
function openEntry(key, focusContent) {
  if (key === current) return;
  const m = menuEntries().find((x) => x.key === key);
  if (!m) return;
  current = key;
  drawMenu();
  const cacheKey = key + '#' + (sub[key] || 0);
  const t = ++ticket;
  (cache[cacheKey] ? Promise.resolve(cache[cacheKey]) : entryData(m)).then((data) => {
    if (t !== ticket) return;   // another page was chosen meanwhile
    if (!data.demo && data.rows.length) cache[cacheKey] = data;   // demo / empty is never cached
    // «Продовжити перегляд» and «Моє» are drawn fresh every time, on top of the (cached) extension rows
    const lib = m.section ? libraryRows(m.id) : [];
    if (lib.length) data = Object.assign({}, data, { rows: lib.concat(data.demo ? [] : data.rows), note: data.demo ? '' : data.note });
    const s = createSection($('#section'), data, {
      focus, bg, toast,
      onDeep: (deep) => tv.classList.toggle('deep', deep),
      openTitle,
    });
    pageZones = s.zones;
    if (settingsOpen || titleOpen) return;
    // the very first page opens with the focus on its content, later ones keep it where it is
    const start = reopenFocus || ((firstOpen || focusContent) && pageZones[0] ? pageZones[0].id : focus.zone() || 'menu');
    reopenFocus = null;
    firstOpen = false;
    focus.set([menuZone, dropZone].concat(pageZones), start);
    updateDrop();
  });
}
let firstOpen = true;
let ready = false;
let reopenFocus = null;
let menuWait = 0;

// ── search: every extension with search(query, ctx) → rows ──
function openSearch() {
  const withSearch = extensions().filter((e) => typeof e.search === 'function');
  if (!withSearch.length) { toast('Пошук дасть розширення з даними (напр. TMDB)'); return; }
  ask('Пошук', '', 'Назва фільму, серіалу, аніме…').then((q) => {
    focus.refresh();
    if (!q) return;
    toast('Шукаю «' + q + '»…');
    const t = ++ticket;
    Promise.all(withSearch.map((e) => Promise.resolve().then(() => e.search(q, contextFor(e)))
      .then((rows) => { (rows || []).forEach((r) => (r.items || []).forEach((it) => { if (!it._ext) it._ext = e; })); return rows || []; })
      .catch((err) => { problem((e.name || e.id) + ' search: ' + (err && err.message || err)); return []; })))
      .then((lists) => {
        if (t !== ticket) return;
        const rows = [].concat.apply([], lists).filter((r) => r && r.items && r.items.length);
        current = 'search';
        drawMenu();
        const s = createSection($('#section'), { hero: [], rows, note: rows.length ? 'Пошук: «' + q + '»' : 'За «' + q + '» нічого не знайшлося' }, {
          focus, bg, toast, onDeep: (deep) => tv.classList.toggle('deep', deep), openTitle,
        });
        pageZones = s.zones;
        focus.set([menuZone, dropZone].concat(pageZones), pageZones[0] ? pageZones[0].id : 'menu');
      });
  });
}

// ── title page; a card with a stream (a TV channel) plays at once ──
let titleOpen = false;
let beforeTitle = null;
function openTitle(it) {
  if (it.stream) {
    player.play({ url: it.stream, title: it.title, sub: it.meta || '' });
    return;
  }
  // a card an extension opens itself (an album → a queue of tracks)
  if (!it.tmdb && it._ext && typeof it._ext.open === 'function') {
    toast('Відкриваю «' + it.title + '»…');
    Promise.resolve().then(() => it._ext.open(it, contextFor(it._ext))).then((r) => {
      if (r && r.queue && r.queue.length) player.play({ queue: r.queue, index: r.index || 0 });
      else if (r && r.stream) player.play({ url: r.stream, title: it.title, sub: it.meta || '' });
      else toast('Тут нема що відтворювати');
    }).catch((err) => { problem((it._ext.name || it._ext.id) + ' open: ' + (err && err.message || err)); toast(String(err && err.message || err)); });
    return;
  }
  beforeTitle = focus.zone();
  titleOpen = true;
  tv.classList.add('ov');
  const root = $('#title');
  root.classList.add('on');
  const t = createTitle(root, it, { focus, bg, toast, player, section: sectionFor(it, current) });
  focus.set(t.zones, 'tbtn');
}
function closeTitle() {
  titleOpen = false;
  tv.classList.remove('ov');
  const root = $('#title');
  root.classList.remove('on');
  root.innerHTML = '';
  // draw the page again: «Продовжити перегляд» / «Моє» may have changed while the title was open
  if (current && current !== 'search') {
    reopenFocus = beforeTitle || 'menu';
    const key = current;
    current = null;
    openEntry(key);
  } else focus.set([menuZone, dropZone].concat(pageZones), beforeTitle || 'menu');
}

// ── settings ──
let settingsOpen = false;
const settings = createSettings($('#settings'), {
  focus, toast, version: GLINT_VERSION,
  entries: () => allEntries().map((m) => ({ id: m.key, title: m.title })),
  close: () => { settingsOpen = false; focus.set([menuZone, dropZone].concat(pageZones), 'menu'); updateDrop(); },
  reload: () => setTimeout(() => location.reload(), 700),
  menuChanged: () => {
    const vis = menuEntries();
    drawMenu();
    if (!vis.some((m) => m.key === current) && vis[0]) { current = null; openEntry(vis[0].key); }
  },
});
function openSettings() { settingsOpen = true; $('.drop').classList.remove('on'); settings.open(); }

// ── keys ──
function press(a) {
  markKey();
  if (player.open) { player.key(a); return; }
  if (a === 'playpause') return;
  if (a === 'enter') focus.enter();
  else if (a === 'back') {
    if (settingsOpen) settings.back();
    else if (titleOpen) closeTitle();
    else if (focus.zone() !== 'menu') {
      const k = menuEntries().findIndex((m) => m.key === current);
      focus.focus('menu', k >= 0 ? k : menuEntries().length);   // search results: back to the search icon
    }
    else exitApp();
  } else focus.move(a);
  if (!settingsOpen && !titleOpen) updateDrop();
}
document.addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;   // the prompt handles its own keys
  const a = KEY[e.keyCode];
  if (!a) return;
  e.preventDefault();
  press(a);
});

// ── start ──
registerMediaKeys();
fit(tv);
window.addEventListener('resize', () => fit(tv));
if (GLINT_PRESET) applyPreset(JSON.parse(GLINT_PRESET));
drawMenu();
focus.set([menuZone], 'menu');
loadExtensions().then(() => {
  ready = true;
  drawMenu();
  const first = menuEntries()[0];
  if (first) openEntry(first.key);
  if (GLINT_SELFTEST) setTimeout(() => selftest(GLINT_SELFTEST, press, GLINT_SELFTEST_MODE), 1500);
});
