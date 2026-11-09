import { esc } from './util.js';

// A text prompt over everything. On the TV focusing the field brings up Samsung's on-screen keyboard;
// its Done / Cancel arrive as keyCodes 65376 / 65385.
// Resolves with the trimmed text, or null when cancelled.
export function ask(title, value, placeholder) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'ask';
    box.innerHTML = '<div class="ask-card"><div class="ask-title">' + esc(title) + '</div>' +
      '<input type="text" class="ask-input" autocomplete="off" spellcheck="false">' +
      '<div class="ask-hint">OK — зберегти · Назад — скасувати</div></div>';
    document.getElementById('tv').appendChild(box);
    const input = box.querySelector('input');
    input.value = value || '';
    input.placeholder = placeholder || '';
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      input.blur();
      box.parentNode.removeChild(box);
      resolve(v);
    };
    input.addEventListener('keydown', (e) => {
      const k = e.keyCode;
      if (k === 13 || k === 65376) { e.preventDefault(); finish(input.value.trim()); }
      else if (k === 27 || k === 10009 || k === 65385) { e.preventDefault(); finish(null); }
      e.stopPropagation();
    });
    setTimeout(() => input.focus(), 50);
  });
}
