import { load, save } from '../store.js';
import { ask } from '../ui/input.js';

// Extensions.
//
// The core knows no server. An extension is a script the user adds by URL (Settings → Extensions → Add).
// It runs Glint.register({...}) and may give:
//   id, name, version
//   settings: [{ key, title, type: 'text' | 'toggle', placeholder?, default? }]   — its own settings page
//   rows(section, ctx) → Promise<[{ title, style: 'poster'|'wide', ai?, items: [Item] }]>
//                         section: 'movies' | 'series' | 'cartoons' | 'anime'
//   Item: { id, title, card, backdrop, year?, genre?, meta?, desc?, tmdb?: { id, type } }
// ctx: { get(key), set(key, value), getJSON(url, ms?), request(method, url, body?, headers?, ms?), ask(title, value?, placeholder?), toast(text) }
//
// An extension is someone else's code inside the app — the settings page shows its address, and it
// runs only while it is switched on. Extension files must run on Chromium 56 as they are (ES5 is safest).

const list = [];
const status = {};      // url → 'ok' | 'error' | 'timeout' | 'no-register' | 'off'
let loading = null;
let toastFn = () => {};

export function setToast(fn) { toastFn = fn; }

export function register(ext) {
  if (!ext || !ext.id) throw new Error('Glint.register: an extension needs an id');
  if (list.some((e) => e.id === ext.id)) throw new Error('Glint.register: duplicate id ' + ext.id);
  ext.url = loading;
  list.push(ext);
  if (loading) status[loading] = 'ok';
}

export function extensions() { return list.slice(); }

// what went wrong, for the settings page and the self-test report
const problems = [];
export function problem(text) { problems.push(String(text)); if (problems.length > 20) problems.shift(); }
export function debugInfo() {
  return { entries: entries().map((e) => ({ url: e.url.slice(-60), on: e.on, status: statusOf(e.url) })), registered: list.map((e) => e.id), problems: problems.slice() };
}
export function byUrl(url) { return list.find((e) => e.url === url) || null; }
export function statusOf(url) { return status[url] || 'off'; }

// [{ url, on }] — the order is the load order
export function entries() { return load('ext', []); }
export function setEntries(next) { save('ext', next); }

function loadOne(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (st) => {
      if (done) return;
      done = true;
      if (status[url] !== 'ok') status[url] = st;
      loading = null;
      resolve();
    };
    loading = url;
    const s = document.createElement('script');
    s.onload = () => finish('no-register');
    s.onerror = () => finish('error');
    setTimeout(() => finish('timeout'), 10000);
    s.src = url;
    document.head.appendChild(s);
  });
}

// one by one, so each register() call is tied to the script that made it
export function loadExtensions() {
  let p = Promise.resolve();
  entries().forEach((en) => {
    if (!en.on) { status[en.url] = 'off'; return; }
    p = p.then(() => loadOne(en.url));
  });
  return p;
}

export function getJSON(url, ms) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.timeout = ms || 15000;
    x.onload = () => {
      if (x.status < 200 || x.status >= 300) { reject(new Error('HTTP ' + x.status)); return; }
      try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(new Error('bad JSON')); }
    };
    x.onerror = () => reject(new Error('network'));
    x.ontimeout = () => reject(new Error('timeout'));
    x.send();
  });
}

// Any HTTP request from an extension: { status, text }. In the widget there is no CORS, so other sites answer;
// headers a browser forbids to set (User-Agent, Referer, Cookie…) are skipped quietly.
export function request(method, url, body, headers, ms) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method || 'GET', url, true);
    x.timeout = ms || 15000;
    Object.keys(headers || {}).forEach((h) => { try { x.setRequestHeader(h, headers[h]); } catch (e) { /* forbidden header */ } });
    x.onload = () => resolve({ status: x.status, text: x.responseText || '' });
    x.onerror = () => reject(new Error('network'));
    x.ontimeout = () => reject(new Error('timeout'));
    x.send(body == null ? null : body);
  });
}

export function settingValue(ext, key) {
  const v = load('ext.' + ext.id, {})[key];
  if (v != null) return v;
  const f = (ext.settings || []).find((x) => x.key === key);
  return f ? f.default : undefined;
}

export function setSettingValue(ext, key, value) {
  const all = load('ext.' + ext.id, {});
  all[key] = value;
  save('ext.' + ext.id, all);
}

export function contextFor(ext) {
  return {
    get: (key) => settingValue(ext, key),
    set: (key, value) => setSettingValue(ext, key, value),
    getJSON,
    request,
    ask: (title, value, placeholder) => ask(title, value, placeholder),
    toast: (t) => toastFn(t),
  };
}

// A local build may carry a preset (GLINT_PRESET at build time): extensions and their settings, so nothing
// has to be typed with the remote. Applied once per preset version `v`: extensions it lists are added, and an
// older copy of the same file (same address without the @version part, as jsDelivr links have) is replaced;
// the settings it gives overwrite those keys only. Extensions the user added stay.
const fileKey = (url) => String(url).replace(/@[^/]+/, '');
export function applyPreset(preset) {
  if (!preset) return;
  const v = preset.v || 1;
  if (load('preset.v', 0) === v) return;
  const list = entries();
  (preset.ext || []).forEach((e) => {
    const k = list.findIndex((x) => fileKey(x.url) === fileKey(e.url));
    if (k >= 0) list[k] = { url: e.url, on: list[k].on };
    else list.push({ url: e.url, on: e.on !== false });
  });
  setEntries(list);
  const s = preset.settings || {};
  Object.keys(s).forEach((id) => {
    const cur = load('ext.' + id, {});
    Object.keys(s[id]).forEach((key) => { cur[key] = s[id][key]; });
    save('ext.' + id, cur);
  });
  save('preset.v', v);
}
