import { load, save } from '../store.js';
import { entries, setEntries, byUrl, statusOf, settingValue, setSettingValue } from '../ext/registry.js';
import { ask } from '../ui/input.js';
import { esc, $, $$ } from '../ui/util.js';

// Settings: the core's own pages on the left (Extensions, Menu, About), the chosen page on the right.
// Each extension has its own page with the fields it declared, opened from the Extensions list.
//
// deps: { focus, toast, sections, version, close(), reload(), menuChanged() }

const NAV = [
  { id: 'ext', title: 'Розширення' },
  { id: 'menu', title: 'Меню' },
  { id: 'about', title: 'Про Glint' },
];

const STATUS = { ok: 'працює', error: 'не завантажилось', timeout: 'не відповідає', 'no-register': 'не зареєструвалось', off: 'вимкнено' };

export function createSettings(root, deps) {
  let nav = 0;
  let extPage = null;   // url of the extension whose page is open, or null

  function hidden() { return load('menu.hidden', []); }

  // every row: { label, value?, sw?: bool, button?: bool, run() }
  function rows() {
    const page = NAV[nav].id;
    if (page === 'ext' && extPage) return extRows(extPage);
    if (page === 'ext') {
      const out = [{ label: 'Додати розширення', button: true, run: addExtension }];
      entries().forEach((en) => {
        const ext = byUrl(en.url);
        out.push({ label: ext ? ext.name || ext.id : en.url, value: STATUS[en.on ? statusOf(en.url) : 'off'], run: () => { extPage = en.url; draw(1, 0); } });
      });
      return out;
    }
    if (page === 'menu') {
      return deps.sections.map((s) => ({
        label: s.title,
        sw: hidden().indexOf(s.id) < 0,
        run: () => {
          const h = hidden();
          const k = h.indexOf(s.id);
          if (k >= 0) h.splice(k, 1);
          else if (deps.sections.length - h.length <= 1) { deps.toast('Хоча б один розділ має лишитися в меню'); return; }
          else h.push(s.id);
          save('menu.hidden', h);
          deps.menuChanged();
          draw(1);
        },
      }));
    }
    return [
      { label: 'Версія', value: deps.version },
      { label: 'Код', value: 'github.com/TrueNihilisme/glint' },
      { label: 'Ліцензія', value: 'GPL-3.0' },
    ];
  }

  function extRows(url) {
    const ext = byUrl(url);
    const list = entries();
    const en = list.find((e) => e.url === url) || { url, on: false };
    const out = [{
      label: 'Увімкнено', sw: en.on,
      run: () => { en.on = !en.on; setEntries(list); deps.toast('Застосовую…'); deps.reload(); },
    }];
    ((ext && ext.settings) || []).forEach((f) => {
      const v = settingValue(ext, f.key);
      if (f.type === 'toggle') {
        out.push({ label: f.title, sw: !!v, run: () => { setSettingValue(ext, f.key, !v); deps.toast('Застосовую…'); deps.reload(); } });
      } else {
        out.push({
          label: f.title, value: v || f.placeholder || '—',
          run: () => ask(f.title, v || '', f.placeholder).then((t) => {
            if (t == null) { deps.focus.refresh(); return; }
            setSettingValue(ext, f.key, t);
            deps.toast('Застосовую…');
            deps.reload();
          }),
        });
      }
    });
    out.push({ label: 'Адреса', value: url });
    out.push({
      label: 'Видалити розширення', button: true,
      run: () => { setEntries(list.filter((e) => e.url !== url)); deps.toast('Видалено, перезапускаю…'); deps.reload(); },
    });
    return out;
  }

  function addExtension() {
    ask('Адреса розширення (файл .js)', '', 'https://…').then((url) => {
      if (url == null) { deps.focus.refresh(); return; }
      if (!/^https?:\/\/\S+$/.test(url)) { deps.toast('Потрібна адреса, що починається з http:// або https://'); deps.focus.refresh(); return; }
      const list = entries();
      if (list.some((e) => e.url === url)) { deps.toast('Це розширення вже додано'); deps.focus.refresh(); return; }
      list.push({ url, on: true });
      setEntries(list);
      deps.toast('Додано, перезапускаю…');
      deps.reload();
    });
  }

  let current = [];
  function draw(focusZone, index) {
    current = rows();
    const title = NAV[nav].id === 'ext' && extPage ? ((byUrl(extPage) || {}).name || 'Розширення') : NAV[nav].title;
    root.innerHTML = '<div class="s-title">Налаштування</div>' +
      '<div class="s-nav">' + NAV.map((n, i) => '<div class="sitem' + (i === nav ? ' cur' : '') + '">' + esc(n.title) + '</div>').join('') + '</div>' +
      '<div class="s-body"><h2>' + esc(title) + '</h2>' + current.map((r) =>
        '<div class="sfield' + (r.button ? ' btnf' : '') + '">' + esc(r.label) +
        (r.sw != null ? '<span class="sw' + (r.sw ? ' on' : '') + '"></span>' : r.value ? '<span class="v">' + esc(r.value) + '</span>' : '') +
        '</div>').join('') + '</div>';
    if (focusZone === 1) deps.focus.focus('sbody', index != null ? index : deps.focus.index('sbody'));
    else deps.focus.refresh();
  }

  const zones = [
    {
      id: 'snav', dir: 'v',
      items: () => $$('.s-nav .sitem', root),
      onFocus: (i) => { if (i !== nav) { nav = i; extPage = null; draw(0); } },
      onEnter: () => deps.focus.focus('sbody', 0),
    },
    {
      id: 'sbody', dir: 'v',
      items: () => $$('.s-body .sfield', root),
      onEnter: (i) => { if (current[i] && current[i].run) current[i].run(); },
    },
  ];

  return {
    zones,
    open() { nav = 0; extPage = null; root.classList.add('on'); deps.focus.set(zones, 'snav'); draw(0); },
    // Back: from an extension's page to the list, from the page to the left column, then out
    back() {
      if (extPage) { extPage = null; draw(1, 0); return; }
      if (deps.focus.zone() === 'sbody') { deps.focus.focus('snav', nav); return; }
      root.classList.remove('on');
      deps.close();
    },
  };
}
