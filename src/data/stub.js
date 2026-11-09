// Demo content, shown only while no extension gives rows. Titles are made up; pictures are drawn on a canvas
// at the size they are shown (cards 400×225, backdrops 960×540) — big pictures in small cards cost frames on the TV.

function art(seed, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const hue = (seed * 47) % 360;
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, 'hsl(' + hue + ',55%,32%)');
  gr.addColorStop(1, 'hsl(' + ((hue + 50) % 360) + ',65%,10%)');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let k = 0; k < 30; k++) {
    g.fillStyle = 'rgba(255,255,255,' + (rnd() * 0.08) + ')';
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, (20 + rnd() * 120) * w / 960, 0, 7);
    g.fill();
  }
  return c.toDataURL('image/jpeg', 0.85);
}

const TITLES = [
  ['Північне сяйво', 'Драма', 2026], ['Вежа 17', 'Фантастика', 2026], ['Сіль і попіл', 'Історична драма', 2024],
  ['Сад зі скла', 'Фентезі', 2025], ['Орбіта', 'Фантастика', 2026], ['Мідний берег', 'Трилер', 2025],
  ['Крига', 'Документальний', 2026], ['Перевал', 'Пригоди', 2025], ['Тиха гавань', 'Детектив', 2026],
  ['Нічний експрес', 'Детектив', 2025], ['Дім на пагорбі', 'Драма', 2024], ['Кордон', 'Трилер', 2025],
];

let cache = null;

function items() {
  if (cache) return cache;
  cache = TITLES.map((t, i) => ({
    id: 'demo' + i,
    title: t[0],
    genre: t[1],
    year: t[2],
    desc: 'Демо-картка. Справжні ряди зʼявляться, коли в Налаштуваннях додати розширення з даними.',
    card: art(i + 1, 400, 225),
    backdrop: art(i + 1, 960, 540),
  }));
  return cache;
}

export function demoSection(kind) {
  const all = items();
  const shift = { movies: 0, series: 3, cartoons: 6, anime: 9 }[kind] || 0;
  const rot = all.slice(shift).concat(all.slice(0, shift));
  return {
    demo: true,
    note: 'Демо-дані: додайте розширення в Налаштуваннях (шестерня праворуч).',
    hero: rot.slice(0, 4),
    rows: [
      { title: 'Нове', style: 'wide', items: rot.slice(0, 8) },
      { title: 'Варто подивитися', style: 'wide', items: rot.slice(4).concat(rot.slice(0, 4)) },
    ],
  };
}
