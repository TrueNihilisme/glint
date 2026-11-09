import { esc } from './util.js';

// A text prompt with Glint's own on-screen keyboard. Samsung's system keyboard (opened by focusing an <input>)
// looked out of place and its keys never reached the app on the test TV, so there is no <input> at all:
// the remote walks a grid of keys, as in Lampa. A physical keyboard and the remote's digit keys type directly.
//
// ask(title, value, placeholder, opts) → Promise<string | null>  (trimmed text, or null when cancelled)
// opts: { secret: bool — show dots (passwords, PINs), layout: 'uk' | 'en' | 'sym' — the first layout }

// rows of keys; {NAME} is a special key. The letter rows follow Lampa's full keyboard (lampa app.min.js,
// layers.clarify), with Shift and a symbols layer added for addresses and passwords. The top row has the
// language switch and quick address starts: typing «http://» key by key with a remote is the slowest part.
const QUICK = '{LANG} {HTTP} {HTTPS}';
const LAYOUTS = {
  uk: [QUICK, '1 2 3 4 5 6 7 8 9 0 - {BKSP}', 'й ц у к е н г ш щ з х ї', "ф і в а п р о л д ж є '", '{SHIFT} я ч с м и т ь б ю . ,',
    '{SYM} {SPACE} {CLEAR} {DONE}'],
  en: [QUICK, '1 2 3 4 5 6 7 8 9 0 - {BKSP}', 'q w e r t y u i o p', 'a s d f g h j k l', '{SHIFT} z x c v b n m . ,',
    '{SYM} {SPACE} {CLEAR} {DONE}'],
  sym: [QUICK, '1 2 3 4 5 6 7 8 9 0 {BKSP}', ': / . - _ ? = & @ #', "% + ! * ( ) ~ ; ' \"", '< > [ ] { } | \\ $ ^ `',
    '{ABC} {SPACE} {CLEAR} {DONE}'],
};

// icons as SVG: the TV's fonts may not have ⌫ / ⇧
const ICON_BKSP = '<svg width="40" height="30" viewBox="0 0 40 30"><path d="M13 3h22a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H13L2 15z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M19 10l10 10M29 10L19 20" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const ICON_SHIFT = '<svg width="32" height="32" viewBox="0 0 32 32"><path d="M16 3L3 17h7v11h12V17h7z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg>';

const ICON_GLOBE = '<svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="15" cy="15" r="12"/><path d="M3 15h24M15 3c-4 4-4 20 0 24M15 3c4 4 4 20 0 24"/></svg>';

const LANG_NAME = { uk: 'УКР', en: 'ENG' };

let active = null;   // the open prompt's key handler

// main.js passes every keydown here first; true = the prompt took it
export function askKey(e) {
  return active ? active(e) : false;
}

// an address is typed in Latin letters
function looksLikeAddress(s) {
  return /^(https?:|www\.)|:\/\//.test(String(s || '').trim());
}

export function ask(title, value, placeholder, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    let text = String(value || '');
    let lang = o.layout && LAYOUTS[o.layout] && o.layout !== 'sym' ? o.layout
      : (o.secret || looksLikeAddress(value) || looksLikeAddress(placeholder) ? 'en' : 'uk');
    let layer = o.layout === 'sym' ? 'sym' : lang;
    let shift = false;
    let row = 2;          // the first row of letters
    let col = 0;
    let keys = [];      // [row][col] → { el, k, x }

    const box = document.createElement('div');
    box.className = 'ask';
    box.innerHTML = '<div class="ask-card"><div class="ask-title">' + esc(title) + '</div>' +
      '<div class="kb-field"><span class="kb-text"></span><i class="kb-caret"></i><span class="kb-ph"></span></div>' +
      '<div class="kb"></div>' +
      '<div class="ask-hint">OK — ввести · Назад — скасувати · цифри на пульті теж друкують</div></div>';
    document.getElementById('tv').appendChild(box);
    const field = box.querySelector('.kb-field');
    const textEl = box.querySelector('.kb-text');
    const ph = box.querySelector('.kb-ph');
    const kb = box.querySelector('.kb');
    ph.textContent = placeholder || '';

    function label(k) {
      if (k === '{BKSP}') return ICON_BKSP;
      if (k === '{SHIFT}') return ICON_SHIFT;
      // the language key shows the language now in use; OK switches to the other one
      if (k === '{LANG}') return ICON_GLOBE + '<b>' + LANG_NAME[lang] + '</b>';
      if (k === '{HTTP}') return 'http://';
      if (k === '{HTTPS}') return 'https://';
      if (k === '{SYM}') return '?123';
      if (k === '{ABC}') return lang === 'uk' ? 'АБВ' : 'ABC';
      if (k === '{SPACE}') return 'Пробіл';
      if (k === '{CLEAR}') return 'Очистити';
      if (k === '{DONE}') return 'Готово';
      return esc(shift ? k.toUpperCase() : k);
    }

    function drawField() {
      textEl.textContent = o.secret ? text.replace(/./g, '•') : text;
      ph.style.display = text ? 'none' : '';
      field.scrollLeft = 100000;   // the end of a long text stays in view
    }

    function draw() {
      const rows = LAYOUTS[layer];
      kb.innerHTML = rows.map((r, ri) => '<div class="kb-row">' + r.split(' ').map((k, ci) => {
        const special = /^\{[A-Z]+\}$/.test(k);
        const cls = 'kb-key' + (special ? ' kb-' + k.slice(1, -1).toLowerCase() : '') + (k === '{SHIFT}' && shift ? ' on' : '');
        return '<span class="' + cls + '" data-r="' + ri + '" data-c="' + ci + '">' + label(k) + '</span>';
      }).join('') + '</div>').join('');
      // key centres, read once per layout: up / down go to the key nearest in x
      keys = rows.map((r, ri) => r.split(' ').map((k, ci) => {
        const el = kb.querySelector('[data-r="' + ri + '"][data-c="' + ci + '"]');
        return { el, k, x: el.offsetLeft + el.offsetWidth / 2 };
      }));
      row = Math.min(row, keys.length - 1);
      col = Math.min(col, keys[row].length - 1);
      keys[row][col].el.classList.add('focus');
    }

    function relabel() {
      keys.forEach((r) => r.forEach((key) => { key.el.innerHTML = label(key.k); }));
      keys.forEach((r) => r.forEach((key) => { if (key.k === '{SHIFT}') key.el.classList.toggle('on', shift); }));
    }

    function move(r, c) {
      keys[row][col].el.classList.remove('focus');
      row = r; col = c;
      keys[row][col].el.classList.add('focus');
    }

    function nearest(r) {
      const x = keys[row][col].x;
      let best = 0;
      keys[r].forEach((key, i) => { if (Math.abs(key.x - x) < Math.abs(keys[r][best].x - x)) best = i; });
      return best;
    }

    function type(ch) {
      text += ch;
      if (shift) { shift = false; relabel(); }
      drawField();
    }

    function hit() {
      const k = keys[row][col].k;
      if (k === '{BKSP}') { text = text.slice(0, -1); drawField(); }
      else if (k === '{SHIFT}') { shift = !shift; relabel(); }
      else if (k === '{LANG}') { lang = lang === 'uk' ? 'en' : 'uk'; layer = lang; draw(); }
      // an address start replaces the one already typed (http:// ↔ https://) instead of adding a second
      else if (k === '{HTTP}' || k === '{HTTPS}') { text = (k === '{HTTP}' ? 'http://' : 'https://') + text.replace(/^https?:\/\//, ''); drawField(); }
      else if (k === '{SYM}') { layer = 'sym'; draw(); }
      else if (k === '{ABC}') { layer = lang; draw(); }
      else if (k === '{SPACE}') type(' ');
      else if (k === '{CLEAR}') { text = ''; drawField(); }
      else if (k === '{DONE}') finish(text.trim());
      else type(shift ? k.toUpperCase() : k);
    }

    let done = false;
    function finish(v) {
      if (done) return;
      done = true;
      active = null;
      box.parentNode.removeChild(box);
      resolve(v);
    }

    active = (e) => {
      const c = e.keyCode;
      if (c === 37) { if (col > 0) move(row, col - 1); }
      else if (c === 39) { if (col < keys[row].length - 1) move(row, col + 1); }
      else if (c === 38) { if (row > 0) move(row - 1, nearest(row - 1)); }
      else if (c === 40) { if (row < keys.length - 1) move(row + 1, nearest(row + 1)); }
      else if (c === 13) hit();
      else if (c === 10009 || c === 27 || c === 413) finish(null);
      else if (c === 8) { text = text.slice(0, -1); drawField(); }             // a physical keyboard's Backspace
      else if (e.key && e.key.length === 1) type(e.key);                      // digits on the remote, a keyboard
      else if (c >= 48 && c <= 57) type(String.fromCharCode(c));
      return true;   // while the prompt is open no key reaches the page behind it
    };

    draw();
    drawField();
  });
}
