// One focus for the whole screen.
//
// A screen is an ordered list of zones. A zone is a row (dir 'h') or a column (dir 'v') of focusable
// elements: arrows along the zone move inside it, the other two arrows move to the previous / next zone.
// Every zone remembers its last position, so coming back to a row lands on the same card.
//
// Zone: { id, dir: 'h'|'v', items(): Element[], onFocus?(i, el), onEnter?(i, el), onEdge?(step) }

export function createFocus() {
  let zones = [];
  let zi = 0;
  const pos = {};

  const cur = () => zones[zi];
  const items = (z) => (z ? z.items() : []);

  function apply() {
    const prev = document.querySelector('.focus');
    if (prev) prev.classList.remove('focus');
    const z = cur();
    const list = items(z);
    if (!list.length) return;
    const i = Math.min(pos[z.id] || 0, list.length - 1);
    pos[z.id] = i;
    list[i].classList.add('focus');
    if (z.onFocus) z.onFocus(i, list[i]);
  }

  return {
    set(next, startId) {
      zones = next;
      const k = zones.findIndex((z) => z.id === startId);
      zi = k < 0 ? 0 : k;
      apply();
    },
    zone() { return cur() ? cur().id : null; },
    index(id) { return pos[id] || 0; },
    focus(id, i) {
      const k = zones.findIndex((z) => z.id === id);
      if (k < 0) return;
      zi = k;
      if (i != null) pos[id] = i;
      apply();
    },
    refresh: apply,
    move(dir) {
      const z = cur();
      if (!z) return;
      const v = z.dir === 'v';
      const along = v ? (dir === 'up' ? -1 : dir === 'down' ? 1 : 0) : (dir === 'left' ? -1 : dir === 'right' ? 1 : 0);
      if (along) {
        const n = items(z).length;
        const i = (pos[z.id] || 0) + along;
        if (i < 0 || i >= n) { if (z.onEdge) z.onEdge(along); return; }
        pos[z.id] = i;
        apply();
        return;
      }
      const across = v ? (dir === 'left' ? -1 : dir === 'right' ? 1 : 0) : (dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
      let k = zi + across;
      while (k >= 0 && k < zones.length && !items(zones[k]).length) k += across; // skip empty zones
      if (k < 0 || k >= zones.length) return;
      zi = k;
      apply();
    },
    enter() {
      const z = cur();
      const list = items(z);
      const i = pos[z ? z.id : ''] || 0;
      if (z && z.onEnter && list[i]) z.onEnter(i, list[i]);
    },
  };
}
