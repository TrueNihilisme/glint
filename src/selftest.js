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

export async function selftest(url, press) {
  const send = (step, res) => {
    try {
      const x = new XMLHttpRequest();
      x.open('POST', url, true);
      x.setRequestHeader('Content-Type', 'text/plain');
      x.send(JSON.stringify({ ev: 'glint-selftest', step, res }));
    } catch (e) { /* nothing to report to */ }
  };
  const t0 = Date.now();
  send('start', { ua: navigator.userAgent, mem: mem(), tizen: typeof window.tizen, avplay: !!(window.webapis && window.webapis.avplay) });
  await wait(1500);
  send('idle', await measure(2000));
  send('hero: next title ×4', await run(press, ['right', 'right', 'right', 'right'], 500, 2500));
  press('down');
  await wait(800);
  send('row 1: right ×10', await run(press, Array(10).fill('right'), 250, 3000));
  send('row 1 → row 2 (page scroll, background)', await run(press, ['down', 'right', 'right', 'right', 'right'], 300, 2000));
  send('back to menu, sections ×3', await run(press, ['back', 'right', 'right', 'right'], 700, 3200));
  press('left'); press('left'); press('left');
  send('done', { mem: mem(), totalMs: Date.now() - t0 });
}
