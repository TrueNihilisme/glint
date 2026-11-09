import { createFocus } from './focus.js';
import { KEY, registerMediaKeys, exitApp, fit } from './platform.js';
import { createSection } from './screens/section.js';
import { register } from './ext/registry.js';
import { esc, $, $$ } from './ui/util.js';
import { selftest } from './selftest.js';

/* global GLINT_VERSION */
window.Glint = { version: GLINT_VERSION, register };

// Core sections. TV and Music are not here on purpose: they appear when an extension brings them.
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
  '<div id="section"></div><div class="topshade"></div>' +
  '<nav class="menu"><div class="pill">' +
  SECTIONS.map((s, i) => '<span class="tab' + (i ? '' : ' sel') + '">' + esc(s.title) + '</span>').join('') +
  '<span class="tab icon" aria-label="Налаштування">' + GEAR + '</span></div></nav>' +
  '<div class="toast"><span></span></div>';

// Background: two layers that cross-fade. After the fade the hidden one gets visibility:hidden —
// a full-screen layer at opacity 0 is still composited every frame, and on a Tizen 4 TV that alone
// took a row of cards from ~56 to ~42 fps (self-test A/B, 2026-11-09).
const bg = (() => {
  let front = $('#bgA');
  let back = $('#bgB');
  let cur = '';
  let timer = 0;
  return {
    set(url) {
      if (!url || url === cur) return;
      cur = url;
      clearTimeout(timer);
      back.style.backgroundImage = 'url(' + url + ')';
      back.style.visibility = 'visible';
      back.classList.add('on');
      front.classList.remove('on');
      const t = front; front = back; back = t;
      const old = back;
      timer = setTimeout(() => { old.style.visibility = 'hidden'; }, 750);
    },
  };
})();

let toastTimer = 0;
function toast(text) {
  const el = $('.toast');
  $('span', el).textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

const focus = createFocus();
let current = -1;

const menuZone = {
  id: 'menu',
  dir: 'h',
  items: () => $$('.menu .tab'),
  onFocus: (i) => { if (i < SECTIONS.length) openSection(i); },
  onEnter: (i) => {
    if (i < SECTIONS.length) focus.focus('hero');
    else toast('Налаштування й розширення — на наступному етапі');
  },
};

function openSection(i) {
  if (i === current) return;
  current = i;
  $$('.menu .tab').forEach((t, k) => t.classList.toggle('sel', k === i));
  const section = createSection($('#section'), SECTIONS[i].id, {
    focus, bg, toast,
    onDeep: (deep) => tv.classList.toggle('deep', deep),
  });
  focus.set([menuZone].concat(section.zones), focus.zone() || 'hero');
}

function press(a) {
  if (a === 'enter') focus.enter();
  else if (a === 'back') {
    if (focus.zone() !== 'menu') focus.focus('menu', current);
    else exitApp();
  } else focus.move(a);
}

document.addEventListener('keydown', (e) => {
  const a = KEY[e.keyCode];
  if (!a) return;
  e.preventDefault();
  press(a);
});

registerMediaKeys();
fit(tv);
window.addEventListener('resize', () => fit(tv));
openSection(0);

/* global GLINT_SELFTEST */
if (GLINT_SELFTEST) selftest(GLINT_SELFTEST, press);
