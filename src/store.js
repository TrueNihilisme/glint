// Settings on the TV: localStorage under "glint.". Every access is guarded — storage can be full or blocked,
// and the app must still start.

const P = 'glint.';

export function load(key, def) {
  try {
    const v = localStorage.getItem(P + key);
    return v == null ? def : JSON.parse(v);
  } catch (e) {
    return def;
  }
}

export function save(key, value) {
  try { localStorage.setItem(P + key, JSON.stringify(value)); } catch (e) { /* nothing to do */ }
}
