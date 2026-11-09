// Platform glue: remote keys, Tizen-only calls, fitting 1920×1080 into a desktop window.

// keyCode → action. Tizen's remote sends Back as 10009; on a desktop Escape and Backspace stand in for it.
export const KEY = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 10009: 'back', 27: 'back', 8: 'back',
  // Tizen media keys (registered in registerMediaKeys): play/pause, play, pause, rewind, fast-forward, stop
  10252: 'playpause', 415: 'playpause', 19: 'playpause', 412: 'left', 417: 'right', 413: 'back' };

export const isTizen = typeof window.tizen !== 'undefined';

// Media keys are not delivered to a web app until it asks for them.
export function registerMediaKeys() {
  if (!isTizen) return;
  ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward'].forEach((k) => {
    try { window.tizen.tvinputdevice.registerKey(k); } catch (e) { /* key not supported on this model */ }
  });
}

export function exitApp() {
  if (!isTizen) return;
  try { window.tizen.application.getCurrentApplication().exit(); } catch (e) { /* nothing else to do */ }
}

// The layout is drawn for 1920×1080. On the TV the window is exactly that; in a desktop browser scale it down.
export function fit(root) {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const v = s >= 0.999 ? '' : 'scale(' + s + ')';
  root.style.webkitTransform = v;
  root.style.transform = v;
}
