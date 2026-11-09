import { $ } from './ui/util.js';

// Full-screen player. On the TV: AVPlay (measured: HLS starts in ~1.5 s from the widget's files).
// Elsewhere: <video> (a desktop Chrome plays mp4, not HLS — enough for development).
//
// Keys: Enter / Play-Pause — pause and resume, ← → — 10 s back / forward (music: previous / next track), Back — stop.
// play({ url, title, sub, start })      → Promise<{ pos, dur }> when the player closes (milliseconds)
// play({ queue: [{ url, title, sub, cover }], index }) — music: tracks one after another, the cover on screen

const SEEK = 10000;

function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
}

export function createPlayer(tv) {
  const box = document.createElement('div');
  box.className = 'player';
  box.innerHTML = '<div class="p-screen"></div><div class="p-ui"><div class="p-title"></div><div class="p-sub"></div>' +
    '<div class="p-bar"><i></i></div><div class="p-time"></div></div><div class="p-cover"></div><div class="p-msg"></div>';
  tv.appendChild(box);

  let active = null;   // { engine, done, timer, hideTimer, paused }

  function ui(show) {
    box.classList.toggle('ui', show);
    clearTimeout(active && active.hideTimer);
    if (show && active && !active.paused) active.hideTimer = setTimeout(() => box.classList.remove('ui'), 3500);
  }
  function msg(text) { $('.p-msg', box).textContent = text || ''; }
  function tick() {
    if (!active) return;
    const pos = active.engine.pos();
    const dur = active.engine.dur();
    $('.p-bar i', box).style.width = (dur ? Math.min(100, pos / dur * 100) : 0) + '%';
    $('.p-time', box).textContent = fmt(pos) + (dur ? ' / ' + fmt(dur) : '');
  }

  function avplayEngine(url, start, onReady, onError) {
    const av = window.webapis.avplay;
    const obj = document.createElement('object');
    obj.type = 'application/avplayer';
    obj.className = 'p-av';
    $('.p-screen', box).appendChild(obj);
    av.open(url);
    av.setDisplayRect(0, 0, 1920, 1080);
    av.setListener({
      onerror: (e) => onError('Помилка плеєра: ' + e),
      onstreamcompleted: () => onError(null, true),
    });
    av.prepareAsync(() => {
      if (start > 0) { try { av.seekTo(start); } catch (e) { /* not seekable */ } }
      av.play();
      onReady();
    }, (e) => onError('Не вдалося відкрити потік: ' + (e && e.name || e)));
    return {
      pos: () => { try { return av.getCurrentTime(); } catch (e) { return 0; } },
      dur: () => { try { return av.getDuration(); } catch (e) { return 0; } },
      toggle: (pause) => { try { if (pause) av.pause(); else av.play(); } catch (e) { /* ignore */ } },
      seek: (d) => { try { if (d > 0) av.jumpForward(d); else av.jumpBackward(-d); } catch (e) { /* ignore */ } },
      stop: () => { try { av.stop(); av.close(); } catch (e) { /* ignore */ } obj.parentNode && obj.parentNode.removeChild(obj); },
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
      seek: (d) => { v.currentTime = Math.max(0, v.currentTime + d / 1000); },
      stop: () => { v.pause(); v.removeAttribute('src'); v.load(); v.parentNode && v.parentNode.removeChild(v); },
    };
  }

  return {
    get open() { return !!active; },
    play(opts) {
      return new Promise((resolve) => {
        const audio = !!opts.queue;
        const queue = opts.queue || [{ url: opts.url, title: opts.title, sub: opts.sub, start: opts.start }];
        let idx = opts.index || 0;
        box.classList.add('on');
        box.classList.toggle('audio', audio);
        document.body.classList.add('playing');
        const useAv = !!(window.webapis && window.webapis.avplay);
        const finish = () => {
          if (!active) return;
          const res = { pos: active.engine.pos(), dur: active.engine.dur() };
          clearInterval(active.timer);
          active.engine.stop();
          active = null;
          box.classList.remove('on', 'ui', 'audio');
          document.body.classList.remove('playing');
          resolve(res);
        };
        const onReady = () => { msg(''); ui(true); };
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
          active.timer = setInterval(tick, 1000);
        }
        active = { paused: false, done: finish, audio, engine: null, step: (d) => { const j = idx + d; if (j >= 0 && j < queue.length) start(j); } };
        start(idx);
      });
    },
    // returns true when the key was used
    key(a) {
      if (!active) return false;
      if (a === 'back') { active.done(); return true; }
      if (a === 'enter' || a === 'playpause') { active.paused = !active.paused; active.engine.toggle(active.paused); ui(true); return true; }
      if (a === 'left' || a === 'right') {
        if (active.audio) active.step(a === 'left' ? -1 : 1);
        else { active.engine.seek(a === 'left' ? -SEEK : SEEK); tick(); }
        ui(true);
        return true;
      }
      ui(true);
      return true;
    },
  };
}

