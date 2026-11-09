import { $, $$, esc } from './ui/util.js';

// Full-screen player. On the TV: AVPlay (measured: HLS starts in ~1.5 s from the widget's files).
// Elsewhere: <video> (a desktop Chrome plays mp4, not HLS — enough for development).
//
// play({ url, title, sub, start, next })  → Promise<{ pos, dur, next? }> when the player closes (milliseconds);
//   next: a label for the «next episode» button; pressing it closes the player with next: true
// play({ queue: [{ url, title, sub, cover }], index }) — music: tracks one after another, the cover on screen
//
// Controls, as on Apple TV: a panel at the bottom with the title, a progress bar and buttons. Any key shows it,
// it hides after 4 s (stays while paused). With the panel hidden: OK — pause, ← → — 10 s back / forward.
// On the bar ← → scrub, the step grows while the key is pressed again and again (10 s → 30 s → 1 min) and the
// jump happens once the remote rests; ↓ — the buttons (⏪ ⏯ ⏩, audio, subtitles, next episode).
// Remote media keys (play/pause, rewind, fast-forward, stop) work at any time.

const STEP = 10000;
const BAR = 1680;          // progress bar width, px

const ICON = {
  back: '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 22a12 12 0 1 0 4-9"/><path d="M14 6v7h7"/><text x="22" y="27" font-size="12" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle" font-family="sans-serif">10</text></svg>',
  fwd: '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M34 22a12 12 0 1 1-4-9"/><path d="M30 6v7h-7"/><text x="22" y="27" font-size="12" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle" font-family="sans-serif">10</text></svg>',
  play: '<svg width="40" height="40" viewBox="0 0 40 40"><path d="M12 7l22 13-22 13z" fill="currentColor"/></svg>',
  pause: '<svg width="40" height="40" viewBox="0 0 40 40"><rect x="9" y="7" width="8" height="26" rx="2" fill="currentColor"/><rect x="23" y="7" width="8" height="26" rx="2" fill="currentColor"/></svg>',
  prev: '<svg width="40" height="40" viewBox="0 0 40 40"><rect x="7" y="8" width="4" height="24" rx="1.5" fill="currentColor"/><path d="M33 8L13 20l20 12z" fill="currentColor"/></svg>',
  next: '<svg width="40" height="40" viewBox="0 0 40 40"><rect x="29" y="8" width="4" height="24" rx="1.5" fill="currentColor"/><path d="M7 8l20 12L7 32z" fill="currentColor"/></svg>',
};

// ISO 639 codes the streams use → names
const LANGS = {
  ukr: 'Українська', uk: 'Українська', rus: 'Російська', ru: 'Російська', eng: 'Англійська', en: 'Англійська',
  jpn: 'Японська', ja: 'Японська', kor: 'Корейська', ko: 'Корейська', fre: 'Французька', fra: 'Французька', fr: 'Французька',
  ger: 'Німецька', deu: 'Німецька', de: 'Німецька', spa: 'Іспанська', es: 'Іспанська', ita: 'Італійська', it: 'Італійська',
  pol: 'Польська', pl: 'Польська', chi: 'Китайська', zho: 'Китайська', zh: 'Китайська',
};

function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
}

function trackLabel(info, i, kind) {
  const lang = String(info.language || info.track_lang || info.lang || '').toLowerCase();
  const name = LANGS[lang] || (lang && lang !== 'und' ? lang.toUpperCase() : '');
  const extra = info.channels ? ' · ' + info.channels + ' кан.' : '';
  return (name || (kind === 'TEXT' ? 'Субтитри ' : 'Доріжка ') + (i + 1)) + extra;
}

export function createPlayer(tv) {
  const box = document.createElement('div');
  box.className = 'player';
  box.innerHTML = '<div class="p-screen"></div><div class="p-cover"></div><div class="p-subs"><span></span></div>' +
    '<div class="p-ui"><div class="p-title"></div><div class="p-sub"></div>' +
    '<div class="p-bar"><i class="p-fill"></i><b class="p-thumb"><span class="p-at"></span></b></div>' +
    '<div class="p-pos"></div><div class="p-left"></div><div class="p-btns"></div><div class="p-list"></div></div>' +
    '<div class="p-msg"></div>';
  tv.appendChild(box);

  // { engine, done, audio, paused, timer, hideTimer, zone: 'bar'|'btns', btn, list, scrub, next, step }
  let active = null;

  function msg(text) { $('.p-msg', box).textContent = text || ''; }

  // ── panel ──
  function shown() { return box.classList.contains('ui'); }
  function show() {
    box.classList.add('ui');
    clearTimeout(active.hideTimer);
    if (!active.paused && !active.list && !active.audio) active.hideTimer = setTimeout(hide, 4000);
  }
  function hide() {
    if (!active || active.paused || active.list || active.audio) return;
    box.classList.remove('ui');
    active.zone = 'bar';
    drawFocus();
  }

  function drawBar() {
    if (!active) return;
    const dur = active.engine.dur();
    const pos = active.scrub ? active.scrub.target : active.engine.pos();
    const f = dur ? Math.max(0, Math.min(1, pos / dur)) : 0;
    $('.p-fill', box).style.transform = 'scaleX(' + f + ')';
    $('.p-thumb', box).style.transform = 'translateX(' + Math.round(f * BAR) + 'px)';
    $('.p-at', box).textContent = active.scrub ? fmt(pos) : '';
    $('.p-pos', box).textContent = fmt(pos);
    $('.p-left', box).textContent = dur ? '−' + fmt(dur - pos) : '';
    box.classList.toggle('scrubbing', !!active.scrub);
  }

  // buttons: transport in the middle, tracks and the next episode on the right
  function buttons() {
    if (active.audio) return [{ act: 'prev', html: ICON.prev }, { act: 'toggle', html: active.paused ? ICON.play : ICON.pause }, { act: 'nexttrack', html: ICON.next }];
    const t = active.engine.tracks();
    const out = [{ act: 'back', html: ICON.back }, { act: 'toggle', html: active.paused ? ICON.play : ICON.pause }, { act: 'fwd', html: ICON.fwd }];
    if (t.audio.length > 1) out.push({ act: 'audio', html: 'Озвучка', text: true });
    if (t.text.length) out.push({ act: 'subs', html: 'Субтитри', text: true });
    if (active.next) out.push({ act: 'nextep', html: esc(active.next) + ' ›', text: true });
    return out;
  }
  function drawButtons() {
    const list = buttons();
    active.btns = list;
    $('.p-btns', box).innerHTML = list.map((b, i) => '<span class="p-btn' + (b.text ? ' text' : '') + (i >= 3 ? ' right' : '') + '" data-i="' + i + '">' + b.html + '</span>').join('');
    if (active.btn >= list.length) active.btn = 1;
    drawFocus();
  }
  function drawFocus() {
    box.classList.toggle('on-bar', active.zone === 'bar' && !active.list);
    $$('.p-btn', box).forEach((el, i) => el.classList.toggle('focus', active.zone === 'btns' && !active.list && i === active.btn));
  }

  // a list of tracks over the buttons
  function openList(kind) {
    const t = active.engine.tracks();
    const items = kind === 'audio' ? t.audio : [{ id: null, label: 'Вимкнено', on: !t.text.some((x) => x.on) }].concat(t.text);
    const cur = Math.max(0, items.findIndex((x) => x.on));
    active.list = { kind, items, idx: cur };
    drawList();
    show();
  }
  function drawList() {
    const l = active.list;
    const el = $('.p-list', box);
    if (!l) { el.className = 'p-list'; el.innerHTML = ''; drawFocus(); return; }
    el.className = 'p-list on';
    el.innerHTML = '<div class="p-list-title">' + (l.kind === 'audio' ? 'Озвучка' : 'Субтитри') + '</div>' +
      l.items.map((x, i) => '<div class="p-item' + (i === l.idx ? ' focus' : '') + '">' + (x.on ? '✓ ' : '') + esc(x.label) + '</div>').join('');
    drawFocus();
  }
  function pickFromList() {
    const l = active.list;
    const x = l.items[l.idx];
    if (l.kind === 'audio') active.engine.selectAudio(x.id);
    else active.engine.selectText(x.id);
    active.list = null;
    drawList();
    show();
  }

  // ── seeking ──
  function jump(d) {
    if (active.audio) { active.step(d < 0 ? -1 : 1); return; }
    const dur = active.engine.dur();
    let to = active.engine.pos() + d;
    if (dur) to = Math.min(to, dur - 1000);
    active.engine.seekTo(Math.max(0, to));
    drawBar();
  }
  // ← → on the bar move a target; the jump happens once the remote has rested for 0.8 s
  function scrub(dir) {
    if (active.audio) { active.step(dir); return; }
    const now = Date.now();
    const sc = active.scrub || (active.scrub = { target: active.engine.pos(), n: -1, last: 0, timer: 0 });
    sc.n = now - sc.last < 900 ? sc.n + 1 : 0;
    sc.last = now;
    const step = sc.n < 3 ? STEP : sc.n < 8 ? 30000 : 60000;
    const dur = active.engine.dur();
    sc.target = Math.max(0, sc.target + dir * step);
    if (dur) sc.target = Math.min(sc.target, dur - 1000);
    clearTimeout(sc.timer);
    sc.timer = setTimeout(applyScrub, 800);
    drawBar();
  }
  function applyScrub() {
    const sc = active && active.scrub;
    if (!sc) return;
    clearTimeout(sc.timer);
    active.scrub = null;
    active.engine.seekTo(sc.target);
    drawBar();
  }
  function togglePause() {
    active.paused = !active.paused;
    active.engine.toggle(active.paused);
    drawButtons();
    show();
  }

  function act(a) {
    if (a === 'back') jump(-STEP);
    else if (a === 'fwd') jump(STEP);
    else if (a === 'toggle') togglePause();
    else if (a === 'prev') active.step(-1);
    else if (a === 'nexttrack') active.step(1);
    else if (a === 'audio' || a === 'subs') openList(a);
    else if (a === 'nextep') active.done(true);
  }

  // ── engines ──
  function avplayEngine(url, start, onReady, onError) {
    const av = window.webapis.avplay;
    const obj = document.createElement('object');
    obj.type = 'application/avplayer';
    obj.className = 'p-av';
    $('.p-screen', box).appendChild(obj);
    const subsEl = $('.p-subs span', box);
    let subsTimer = 0;
    let textOn = null;          // selected TEXT track index, null = off
    let seeking = false;
    let pending = null;
    av.open(url);
    av.setDisplayRect(0, 0, 1920, 1080);
    av.setListener({
      onerror: (e) => onError('Помилка плеєра: ' + e),
      onstreamcompleted: () => onError(null, true),
      // AVPlay hands over subtitle text; the app draws it (Samsung's subtitles guide, a Tizen forum example)
      onsubtitlechange: (duration, text) => {
        if (textOn === null) return;
        subsEl.textContent = String(text || '').replace(/<[^>]*>/g, '');
        clearTimeout(subsTimer);
        subsTimer = setTimeout(() => { subsEl.textContent = ''; }, Number(duration) || 3000);
      },
    });
    av.prepareAsync(() => {
      if (start > 0) { try { av.seekTo(start); } catch (e) { /* not seekable */ } }
      try { av.setSilentSubtitle(true); } catch (e) { /* no subtitles */ }
      av.play();
      onReady();
    }, (e) => onError('Не вдалося відкрити потік: ' + (e && e.name || e)));
    // seekTo is asynchronous: the next call waits for its callback (AVPlay API reference)
    function seekTo(ms) {
      if (seeking) { pending = ms; return; }
      seeking = true;
      const doneSeek = () => { seeking = false; subsEl.textContent = ''; if (pending !== null) { const p = pending; pending = null; seekTo(p); } };
      try { av.seekTo(Math.round(ms), doneSeek, doneSeek); } catch (e) { seeking = false; }
    }
    const parse = (t) => { try { return JSON.parse(t.extra_info || '{}'); } catch (e) { return {}; } };
    return {
      pos: () => { try { return av.getCurrentTime(); } catch (e) { return 0; } },
      dur: () => { try { return av.getDuration(); } catch (e) { return 0; } },
      toggle: (pause) => { try { if (pause) av.pause(); else av.play(); } catch (e) { /* ignore */ } },
      seekTo,
      tracks: () => {
        let all = [];
        let cur = [];
        try { all = av.getTotalTrackInfo() || []; } catch (e) { /* not ready */ }
        try { cur = av.getCurrentStreamInfo() || []; } catch (e) { /* not ready */ }
        const curAudio = (cur.find ? cur.find((t) => t.type === 'AUDIO') : null);
        const audio = all.filter((t) => t.type === 'AUDIO');
        const text = all.filter((t) => t.type === 'TEXT');
        return {
          audio: audio.map((t, i) => ({ id: t.index, label: trackLabel(parse(t), i, 'AUDIO'), on: curAudio ? curAudio.index === t.index : i === 0 })),
          text: text.map((t, i) => ({ id: t.index, label: trackLabel(parse(t), i, 'TEXT'), on: textOn === t.index })),
          raw: all.map((t) => ({ index: t.index, type: t.type, extra: t.extra_info })),
        };
      },
      selectAudio: (id) => { try { av.setSelectTrack('AUDIO', id); } catch (e) { msg('Не вдалося змінити озвучку'); } },
      selectText: (id) => {
        textOn = id;
        subsEl.textContent = '';
        try {
          if (id === null) av.setSilentSubtitle(true);
          else { av.setSelectTrack('TEXT', id); av.setSilentSubtitle(false); }
        } catch (e) { msg('Не вдалося ввімкнути субтитри'); }
      },
      stop: () => { clearTimeout(subsTimer); subsEl.textContent = ''; try { av.stop(); av.close(); } catch (e) { /* ignore */ } obj.parentNode && obj.parentNode.removeChild(obj); },
    };
  }

  function videoEngine(url, start, onReady, onError) {
    const v = document.createElement('video');
    v.className = 'p-video';
    v.autoplay = true;
    $('.p-screen', box).appendChild(v);
    v.onloadedmetadata = () => { if (start > 0) v.currentTime = start / 1000; onReady(); };
    v.onerror = () => onError('Цей браузер не відтворює такий потік');
    v.onended = () => onError(null, true);
    v.src = url;
    return {
      pos: () => v.currentTime * 1000,
      dur: () => (isFinite(v.duration) ? v.duration * 1000 : 0),
      toggle: (pause) => { if (pause) v.pause(); else v.play(); },
      seekTo: (ms) => { v.currentTime = Math.max(0, ms / 1000); },
      tracks: () => ({ audio: [], text: [], raw: [] }),   // a desktop browser is only for development
      selectAudio: () => {},
      selectText: () => {},
      stop: () => { v.pause(); v.removeAttribute('src'); v.load(); v.parentNode && v.parentNode.removeChild(v); },
    };
  }

  return {
    get open() { return !!active; },
    // for the self-test: what the panel and the stream offer
    state() {
      if (!active) return null;
      return { ui: shown(), zone: active.zone, paused: active.paused, buttons: (active.btns || []).map((b) => b.act),
        pos: Math.round(active.engine.pos() / 1000), dur: Math.round(active.engine.dur() / 1000), tracks: active.engine.tracks() };
    },
    play(opts) {
      return new Promise((resolve) => {
        const audio = !!opts.queue;
        const queue = opts.queue || [{ url: opts.url, title: opts.title, sub: opts.sub, start: opts.start }];
        let idx = opts.index || 0;
        box.classList.add('on');
        box.classList.toggle('audio', audio);
        document.body.classList.add('playing');
        const useAv = !!(window.webapis && window.webapis.avplay);
        const finish = (next) => {
          if (!active) return;
          const res = { pos: active.engine.pos(), dur: active.engine.dur(), next: next === true };
          clearInterval(active.timer);
          clearTimeout(active.hideTimer);
          if (active.scrub) clearTimeout(active.scrub.timer);
          active.engine.stop();
          active = null;
          box.classList.remove('on', 'ui', 'audio', 'on-bar', 'scrubbing');
          $('.p-list', box).className = 'p-list';
          document.body.classList.remove('playing');
          resolve(res);
        };
        // the stream's tracks are known only once it plays: the buttons are drawn again then
        const onReady = () => { msg(''); drawButtons(); show(); setTimeout(() => { if (active) drawButtons(); }, 1500); };
        // end of a track: the next one in a queue, otherwise close
        const onError = (text, ended) => {
          if (!ended) { msg(text); return; }
          if (audio && idx + 1 < queue.length) start(idx + 1);
          else finish();
        };
        function start(i) {
          if (active.engine) { clearInterval(active.timer); active.engine.stop(); }
          idx = i;
          const tr = queue[i];
          $('.p-title', box).textContent = tr.title || '';
          $('.p-sub', box).textContent = (tr.sub || '') + (audio && queue.length > 1 ? (tr.sub ? ' · ' : '') + (i + 1) + ' з ' + queue.length : '');
          $('.p-cover', box).style.backgroundImage = tr.cover ? 'url("' + String(tr.cover).replace(/["\\]/g, '') + '")' : '';
          msg('Завантаження…');
          active.engine = (useAv ? avplayEngine : videoEngine)(tr.url, tr.start || 0, onReady, onError);
          active.timer = setInterval(drawBar, 1000);
          drawButtons();
          drawBar();
        }
        active = { paused: false, done: finish, audio, engine: null, zone: 'bar', btn: 1, list: null, scrub: null,
          next: audio ? null : opts.next || null, hideTimer: 0,
          step: (d) => { const j = idx + d; if (j >= 0 && j < queue.length) start(j); } };
        start(idx);
      });
    },
    // returns true when the key was used
    key(a) {
      if (!active) return false;
      if (a === 'back') {
        if (active.list) { active.list = null; drawList(); show(); return true; }
        active.done();
        return true;
      }
      if (a === 'playpause') { togglePause(); return true; }
      if (a === 'rew' || a === 'ff') { jump(a === 'rew' ? -STEP : STEP); show(); return true; }
      if (!shown()) {
        // panel hidden: OK pauses, ← → jump 10 s, anything else just brings the panel up
        if (a === 'enter') togglePause();
        else if (a === 'left' || a === 'right') { jump(a === 'left' ? -STEP : STEP); show(); }
        else show();
        return true;
      }
      const l = active.list;
      if (l) {
        if (a === 'up') l.idx = Math.max(0, l.idx - 1);
        else if (a === 'down') l.idx = Math.min(l.items.length - 1, l.idx + 1);
        else if (a === 'enter') { pickFromList(); return true; }
        drawList();
        show();
        return true;
      }
      if (active.zone === 'bar') {
        if (a === 'left' || a === 'right') scrub(a === 'left' ? -1 : 1);
        else if (a === 'enter') { if (active.scrub) applyScrub(); else togglePause(); }
        else if (a === 'down') { active.zone = 'btns'; drawFocus(); }
      } else {
        if (a === 'left') active.btn = Math.max(0, active.btn - 1);
        else if (a === 'right') active.btn = Math.min(active.btns.length - 1, active.btn + 1);
        else if (a === 'up') active.zone = 'bar';
        else if (a === 'enter') { act(active.btns[active.btn].act); if (!active) return true; }   // «next episode» closes
        drawFocus();
      }
      show();
      return true;
    },
  };
}
