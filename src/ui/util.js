export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

// A picture address for an inline style="background-image:…". Addresses will come from extensions,
// so quotes, backslashes and line breaks are encoded and the result is escaped for the attribute.
export function cssUrl(u) {
  const safe = String(u).replace(/["'\\\n\r()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return esc('url("' + safe + '")');
}

export function $(sel, root) {
  return (root || document).querySelector(sel);
}

export function $$(sel, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(sel));
}

export function translateY(el, y) {
  const v = 'translate3d(0,' + y + 'px,0)';
  el.style.webkitTransform = v;
  el.style.transform = v;
}
