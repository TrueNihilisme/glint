// Extensions — stage 3 of the plan, only the shape for now.
//
// The core knows nothing about any server. An extension is a script the user adds by URL
// (Settings → Extensions → Add); it calls Glint.register({...}) and can contribute:
//   menu      items or sub-items of the top menu (e.g. TV → IPTV)
//   rows      rows for a section (Movies, Series, …)
//   sources   where a title can be played from (list, seasons, episodes, voices)
//   settings  its own settings page (fields the user turns on and off)
// An extension is someone else's code running in the app: before enabling one, Glint shows its name and URL.

const list = [];

export function register(ext) {
  if (!ext || !ext.id) throw new Error('Glint.register: an extension needs an id');
  if (list.some((e) => e.id === ext.id)) throw new Error('Glint.register: duplicate id ' + ext.id);
  list.push(ext);
}

export function extensions() {
  return list.slice();
}
