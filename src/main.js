import { createFocus } from './focus.js';
import { KEY, registerMediaKeys, exitApp, fit } from './platform.js';
import { createSection } from './screens/section.js';
import { createSettings } from './screens/settings.js';
import { createTitle } from './screens/title.js';
import { register, loadExtensions, extensions, contextFor, applyPreset, setToast, problem, debugInfo } from './ext/registry.js';
import { load } from './store.js';
import { demoSection } from './data/stub.js';
import { esc, $, $$ } from './ui/util.js';
import { selftest } from './selftest.js';

/* global GLINT_VERSION, GLINT_PRESET, GLINT_SELFTEST */
window.Glint = { version: GLINT_VERSION, register, debug: () => debugInfo() };

// Core sections. TV and Music are not here on purpose: they come with extensions.
const SECTIONS = [
  { id: 'movies', title: 'Фільми' },
  { id: 'series', title: 'Серіали' },
  { id: 'cartoons', title: 'Мультфільми' },
  { id: 'anime', title: 'Аніме' },
];

const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></svg>';

const tv = document.getElementById('tv');
tv.innerHTML =
  '<div class="bg" id="bgA"></div><div class="bg" id="bgB"></div><div class="shade"></div><div class="dim"></div>' +
  '<div id="section"></div><div class="topshade"></div><nav class="menu"></nav>' +
  '<div id="title"></div><div id="settings"></div><div class="toast"><span></span></div>';

// Background: two layers that cross-fade. After the fade the hidden one gets visibility:hidden —
// a full-screen layer at opacity 0 is still composited every frame, and on a Tizen 4 TV that alone
// took a row of cards from ~56 to ~42 fps (self-test A/B, 2026-11-09).
const bg = (() => {
  let front = $('#bgA');
  let back = $('#bgB');
  let cur = '';
  let timer = 0;
  let wait = 0;
  // A new background is applied only once the focus has rested for 300 ms: decoding a photo on every
  // key press while walking a row took it down to ~8 fps on the TV with real TMDB backdrops.
  return {
    set(url) {
      if (!url || url === cur) { clearTimeout(wait); return; }
      clearTimeout(wait);
      wait = setTimeout(() => apply(url), cur ? 300 : 0);
    },
  };
  function apply(url) {
    {
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
  }
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

// ── menu ──
function visibleSections() {
  const h = load('menu.hidden', []);
  return SECTIONS.filter((s) => h.indexOf(s.id) < 0);
}
let current = null;   // section id
function drawMenu() {
  const vis = visibleSections();
  $('.menu').innerHTML = '<div class="pill">' +
    vis.map((s) => '<span class="tab' + (s.id === current ? ' sel' : '') + '">' + esc(s.title) + '</span>').join('') +
    '<span class="tab icon" aria-label="Налаштування">' + GEAR + '</span></div>';
}
const menuZone = {
  id: 'menu',
  dir: 'h',
  items: () => $$('.menu .tab'),
  // sections open only after the extensions have loaded — earlier the first one was built from demo
  // data (no extension yet) and stayed that way
  onFocus: (i) => { const vis = visibleSections(); if (ready && i < vis.length) openSection(vis[i].id); },
  onEnter: (i) => {
    if (i >= visibleSections().length) openSettings();
    else if (sectionZones[0]) focus.focus(sectionZones[0].id);
  },
};

// ── sections: rows from extensions, demo rows when there are none ──
const cache = {};
function sectionData(id) {
  if (cache[id]) return Promise.resolve(cache[id]);
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
    let data;
    if (!rows.length) data = demoSection(id);
    else {
      const seen = {};
      const hero = [];
      rows.forEach((r) => r.items.forEach((it) => { if (hero.length < 5 && it.backdrop && !seen[it.id]) { seen[it.id] = 1; hero.push(it); } }));
      data = { hero, rows };
    }
    if (!data.demo) cache[id] = data;   // demo is never cached: real rows may still arrive
    return data;
  });
}

let sectionZones = [];
let ticket = 0;
function openSection(id) {
  if (id === current) return;
  current = id;
  drawMenu();
  const t = ++ticket;
  sectionData(id).then((data) => {
    if (t !== ticket) return;   // another section was chosen meanwhile
    const s = createSection($('#section'), data, {
      focus, bg, toast,
      onDeep: (deep) => tv.classList.toggle('deep', deep),
      openTitle,
    });
    sectionZones = s.zones;
    if (settingsOpen) return;
    // the very first section opens with the focus on its content, later ones keep it on the menu
    const start = firstOpen && sectionZones[0] ? sectionZones[0].id : focus.zone() || 'menu';
    firstOpen = false;
    focus.set([menuZone].concat(sectionZones), start);
  });
}
let firstOpen = true;
let ready = false;

// ── title page ──
let titleOpen = false;
let beforeTitle = null;
function openTitle(it) {
  beforeTitle = focus.zone();
  titleOpen = true;
  tv.classList.add('ov');
  const root = $('#title');
  root.classList.add('on');
  const t = createTitle(root, it, { focus, bg, toast });
  focus.set(t.zones, 'tbtn');
}
function closeTitle() {
  titleOpen = false;
  tv.classList.remove('ov');
  const root = $('#title');
  root.classList.remove('on');
  root.innerHTML = '';
  focus.set([menuZone].concat(sectionZones), beforeTitle || 'menu');
}

// ── settings ──
let settingsOpen = false;
const settings = createSettings($('#settings'), {
  focus, toast, sections: SECTIONS, version: GLINT_VERSION,
  close: () => { settingsOpen = false; focus.set([menuZone].concat(sectionZones), 'menu'); },
  reload: () => setTimeout(() => location.reload(), 700),
  menuChanged: () => {
    const vis = visibleSections();
    if (!vis.some((s) => s.id === current)) { current = null; openSection(vis[0].id); }
    drawMenu();
  },
});
function openSettings() { settingsOpen = true; settings.open(); }

// ── keys ──
function press(a) {
  if (a === 'enter') { focus.enter(); return; }
  if (a === 'back') {
    if (settingsOpen) { settings.back(); return; }
    if (titleOpen) { closeTitle(); return; }
    if (focus.zone() !== 'menu') { focus.focus('menu', visibleSections().findIndex((s) => s.id === current)); return; }
    exitApp();
    return;
  }
  focus.move(a);
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
  openSection(visibleSections()[0].id);
  if (GLINT_SELFTEST) setTimeout(() => selftest(GLINT_SELFTEST, press), 1500);
});
