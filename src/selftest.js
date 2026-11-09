import { askKey } from './ui/input.js';
// Self-test for the TV: drives the remote by itself and measures frame times, then POSTs the numbers.
// Built in only with `GLINT_SELFTEST=<report url> npm run tv`; a normal build drops this code entirely.
// The report url gets text/plain JSON: {ev:'glint-selftest', step, res}.

function measure(ms) {
  return new Promise((resolve) => {
    const ints = [];
    let last = 0;
    let t0 = 0;
    function f(t) {
      if (!t0) t0 = t;
      if (last) ints.push(t - last);
      last = t;
      if (t - t0 < ms) { requestAnimationFrame(f); return; }
      ints.sort((a, b) => a - b);
      let sum = 0;
      ints.forEach((v) => { sum += v; });
      resolve({
        fps: Math.round(1000 / (sum / ints.length) * 10) / 10,
        p95ms: Math.round(ints[Math.floor(ints.length * 0.95)] || 0),
        jank: ints.filter((v) => v > 34).length,
        frames: ints.length + 1,
      });
    }
    requestAnimationFrame(f);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mem() {
  const m = window.performance && performance.memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
}

// press a sequence while measuring the whole time
async function run(press, keys, every, ms) {
  const pending = measure(ms);
  for (const k of keys) { press(k); await wait(every); }
  return pending;
}

// A/B variants of the row animation, switched by a class on #tv; injected only in the self-test build.
const AB_CSS =
  '.ab-nowc .thumb{will-change:auto}.ab-nowc .track{will-change:auto}' +
  '.ab-noshade .shade,.ab-noshade .dim,.ab-noshade .topshade{display:none}' +
  '.ab-nobg .bg{display:none}' +
  '.ab-noshadow .thumb:before{display:none}' +
  '.ab-bgwc .bg{will-change:transform}' +
  '.ab-noglass .thumb:after{display:none}' +
  '.ab-nopic .pic{display:none}';

// A/B of switching between sections that are already built (menu focus, a key every 700 ms).
async function sectionAB(press, send) {
  const tv = document.getElementById('tv');
  const variants = ['', 'ab-nobg'];
  let dir = 'right';
  for (let round = 1; round <= 3; round++) {
    for (const v of variants) {
      const cls = v ? [v] : [];
      cls.forEach((c) => tv.classList.add(c));
      await wait(800);
      send('sections A/B ' + (v || 'colour') + ' #' + round, await run(press, [dir, dir, dir], 700, 2500));
      cls.forEach((c) => tv.classList.remove(c));
      dir = dir === 'right' ? 'left' : 'right';
    }
  }
}

function addAB() {
  if (document.getElementById('ab-css')) return;
  const st = document.createElement('style');
  st.id = 'ab-css';
  st.textContent = AB_CSS;
  document.head.appendChild(st);
}

async function rowAB(press, send) {
  const tv = document.getElementById('tv');
  const variants = ['', 'ab-noglass', 'ab-nobg'];
  for (let round = 1; round <= 2; round++) {
    for (const v of variants) {
      if (v) tv.classList.add(v);
      for (let k = 0; k < 10; k++) press('left');           // back to the row start, unmeasured
      await wait(800);
      const r = await run(press, Array(10).fill('right'), 250, 3000);
      send('row A/B ' + (v || 'base') + ' #' + round, r);
      if (v) tv.classList.remove(v);
    }
  }
}

// GLINT_SELFTEST_MODE=play: open the first hero title, press Play, report what the player shows, go back.
async function playFlow(press, send) {
  const pick = () => ({
    title: (document.querySelector('#title h1') || {}).textContent || null,
    source: (document.querySelector('#title [data-zone="tsrc"] .chip') || {}).textContent || null,
    playing: document.body.classList.contains('playing'),
    msg: (document.querySelector('.p-msg') || {}).textContent || '',
    time: (document.querySelector('.p-time') || {}).textContent || '',
    sub: (document.querySelector('.p-sub') || {}).textContent || '',
    toast: (document.querySelector('.toast.on span') || {}).textContent || '',
    avObject: !!document.querySelector('.p-av'),
  });
  press('enter');                       // hero → title page
  for (let i = 0; i < 20 && !/Джерело:/.test(pick().source || ''); i++) await wait(1000);
  send('play: title page', pick());
  press('enter');                       // Play
  await wait(4000);
  send('play: +4 s', pick());
  await wait(8000);
  send('play: +12 s', pick());
  press('back');
  await wait(1500);
  press('back');
  send('play: back', pick());
}

// GLINT_SELFTEST_MODE=color: can the TV read a poster's colour (canvas), and how long does it take?
function colorOf(src, cors) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const t1 = Date.now();
      try {
        const c = document.createElement('canvas');
        c.width = 8; c.height = 12;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, 8, 12);
        const d = g.getImageData(0, 0, 8, 12).data;
        let r = 0, gr = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        resolve({ ok: true, rgb: [Math.round(r / n), Math.round(gr / n), Math.round(b / n)], loadMs: t1 - t0, readMs: Date.now() - t1 });
      } catch (e) { resolve({ ok: false, err: String(e && e.name || e), loadMs: t1 - t0 }); }
    };
    img.onerror = () => resolve({ ok: false, err: 'load error', loadMs: Date.now() - t0 });
    img.src = src;
  });
}

async function colorProbe(send) {
  const srcs = Array.prototype.slice.call(document.querySelectorAll('.card .pic')).slice(0, 6).map((p) =>
    p.getAttribute('data-src') || String(p.style.backgroundImage).replace(/^url\(["']?|["']?\)$/g, ''));
  for (let i = 0; i < srcs.length; i++) {
    const small = srcs[i].replace(/\/t\/p\/w\d+\//, '/t/p/w92/');
    send('color ' + i + ' cors', Object.assign({ src: small.slice(-40) }, await colorOf(small, true)));
  }
  if (srcs[0]) send('color 0 without cors', await colorOf(srcs[0].replace(/\/t\/p\/w\d+\//, '/t/p/w154/'), false));
}

// GLINT_SELFTEST_MODE=keyboard: open the search, walk the on-screen keyboard to type a word, measure, press Done
async function keyboardFlow(press, send) {
  const key = (code) => askKey({ keyCode: code });
  const focused = () => document.querySelector('.kb-key.focus');
  press('up');                                         // hero → menu
  await wait(400);
  const onLens = () => { const f = document.querySelector('.menu .tab.focus'); return f && f.getAttribute('aria-label') === 'Пошук'; };
  for (let i = 0; i < 12 && !onLens(); i++) { press('right'); await wait(150); }
  press('enter');
  await wait(800);
  send('keyboard open', { open: !!document.querySelector('.ask .kb'), keys: document.querySelectorAll('.kb-key').length });
  // walk to each letter: rows first, then along the row
  const typeWord = async (word) => {
    for (const ch of word) {
      for (let guard = 0; guard < 40; guard++) {
        const f = focused();
        const target = Array.prototype.slice.call(document.querySelectorAll('.kb-key')).find((k) => k.textContent === ch);
        if (!f || !target) return false;
        const fr = +f.getAttribute('data-r'); const tr = +target.getAttribute('data-r');
        if (fr !== tr) { key(fr < tr ? 40 : 38); await wait(120); continue; }
        const fc = +f.getAttribute('data-c'); const tc = +target.getAttribute('data-c');
        if (fc !== tc) { key(fc < tc ? 39 : 37); await wait(120); continue; }
        key(13); await wait(150); break;
      }
    }
    return true;
  };
  const pending = measure(6000);
  const ok = await typeWord('дюна');
  send('keyboard: typed with the remote (fps while walking keys)', Object.assign({ ok, text: (document.querySelector('.kb-text') || {}).textContent }, await pending));
  // to Done: bottom row, last key
  for (let i = 0; i < 7; i++) { key(40); await wait(100); }
  for (let i = 0; i < 6; i++) { key(39); await wait(100); }
  send('keyboard: on', { key: (focused() || {}).textContent });
  key(13);
  await wait(3000);
  send('keyboard: after Done', { open: !!document.querySelector('.ask'), toast: (document.querySelector('.toast.on span') || {}).textContent || '',
    rows: Array.prototype.slice.call(document.querySelectorAll('#section .row h2')).map((h) => h.textContent).slice(0, 3) });
  press('back');
}

export async function selftest(url, press, mode) {
  const send = (step, res) => {
    try {
      const x = new XMLHttpRequest();
      x.open('POST', url, true);
      x.setRequestHeader('Content-Type', 'text/plain');
      x.send(JSON.stringify({ ev: 'glint-selftest', step, res }));
    } catch (e) { /* nothing to report to */ }
  };
  const t0 = Date.now();
  const rows = Array.prototype.slice.call(document.querySelectorAll('.row h2')).map((h) => h.textContent);
  const cards = document.querySelectorAll('.card .thumb');
  send('start', {
    mem: mem(), tizen: typeof window.tizen, avplay: !!(window.webapis && window.webapis.avplay),
    rows, demo: !!document.querySelector('.note'), cards: cards.length,
    firstCard: cards[0] ? String(cards[0].style.backgroundImage).slice(0, 90) : null,
    ext: window.Glint && window.Glint.debug ? window.Glint.debug() : null,
  });
  send('bg at start', ['bgA', 'bgB'].map((id) => document.getElementById(id).style.backgroundColor));
  await wait(4000);   // right after install/launch the TV is busy: numbers taken earlier were noise
  if (mode === 'play') { await playFlow(press, send); send('done', { mem: mem() }); return; }
  if (mode === 'color') { await colorProbe(send); send('done', { mem: mem() }); return; }
  if (mode === 'keyboard') { await keyboardFlow(press, send); send('done', { mem: mem() }); return; }
  send('idle', await measure(2000));
  addAB();
  for (let round = 1; round <= 2; round++) {
    for (const v of ['', 'ab-nobg']) {
      if (v) document.getElementById('tv').classList.add(v);
      await wait(800);
      send('hero ×4 ' + (v || 'colour') + ' #' + round, await run(press, ['right', 'right', 'right', 'right'], 500, 2500));
      if (v) document.getElementById('tv').classList.remove(v);
    }
  }
  press('down');
  await wait(800);
  await rowAB(press, send);
  send('row 1 → row 2 (page scroll, background)', await run(press, ['down', 'right', 'right', 'right', 'right'], 300, 2000));
  send('back to menu, sections ×3', await run(press, ['back', 'right', 'right', 'right'], 700, 3200));
  await wait(1500);
  // the same sections again: they are kept built, so this shows what is left besides building them
  send('sections ×3 back (already built)', await run(press, ['left', 'left', 'left'], 700, 2500));
  send('build times', window.glintTimes || []);
  await sectionAB(press, send);
  const bgNow = () => ['bgA', 'bgB'].map((id) => { const e = document.getElementById(id); return e.style.backgroundColor + (e.classList.contains('on') ? ' on' : ''); });
  send('done', { mem: mem(), totalMs: Date.now() - t0, bg: bgNow() });
}
