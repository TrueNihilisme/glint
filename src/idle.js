// «The remote has been quiet for a while»: background work (loading pictures ahead) runs only then.
// On the TV, preloading on a plain timer collided with key presses and cut a row of cards from ~48 to ~27 fps.

let last = 0;

export function markKey() { last = Date.now(); }

// run fn once the remote has been quiet for `quiet` ms; keeps waiting while keys are pressed
export function whenIdle(fn, quiet) {
  const q = quiet || 800;
  const check = () => {
    const left = q - (Date.now() - last);
    if (left > 0) setTimeout(check, left + 20);
    else fn();
  };
  setTimeout(check, q);
}
