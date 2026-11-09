// The colour of a card's picture, for the background.
// A full-screen photo behind the menu made switching sections stutter on a Tizen 4 TV (16–42 fps; ~50 without
// it), so the background is a calm colour taken from the focused card instead. Reading it costs a 92-px copy
// of the picture and 2–5 ms of canvas work (measured on the TV); results are cached per picture.

const cache = {};

// TMDB serves every size for every picture; other servers get the picture as it is
function small(url) {
  return String(url).replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w92/');
}

export function picOf(it) {
  return (it && (it.card || it.poster || it.backdrop)) || '';
}

// resolves to [r, g, b] for the background, or null when the picture can't be read
export function pictureColor(url) {
  if (!url) return Promise.resolve(null);
  const src = small(url);
  if (!cache[src]) {
    cache[src] = new Promise((resolve) => {
      const tryLoad = (cors) => {
        const img = new Image();
        // TMDB allows reading its pictures from another origin; for servers that don't, the widget can still
        // read them (measured on the TV), a desktop browser can't — then there is simply no colour
        if (cors) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(read(img));
        img.onerror = () => { if (cors) tryLoad(false); else resolve(null); };
        img.src = src;
      };
      tryLoad(true);
    });
  }
  return cache[src];
}

let canvas = null;
function read(img) {
  try {
    if (!canvas) { canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 12; }
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 8, 12);
    g.drawImage(img, 0, 0, 8, 12);
    const d = g.getImageData(0, 0, 8, 12).data;
    // a plain average turns most posters muddy brown; weighting by saturation lets the picture's colour win
    // over its black, white and grey areas (and transparent parts of logos count for nothing)
    let r = 0, gr = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i], d[i + 1], d[i + 2]);
      const min = Math.min(d[i], d[i + 1], d[i + 2]);
      const sat = max ? (max - min) / max : 0;
      const k = (0.04 + sat * sat) * (0.25 + max / 255) * (d[i + 3] / 255);
      r += d[i] * k; gr += d[i + 1] * k; b += d[i + 2] * k; w += k;
    }
    return w ? tone(r / w, gr / w, b / w) : null;
  } catch (e) {
    return null;   // a picture from a server that doesn't allow reading it
  }
}

// keep the hue, calm the saturation, and make it dark enough for white text on top
function tone(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const dd = max - min;
    s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    if (max === r) h = (g - b) / dd + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / dd + 2;
    else h = (r - g) / dd + 4;
    h /= 6;
  }
  s = Math.min(0.62, Math.max(s ? 0.28 : 0, s));
  return hsl(h, s, 0.24);
}

function hsl(h, s, l) {
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}
