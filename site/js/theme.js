/* The light / dark switch. The owner, 2026-11-27: "Spatacco analytics should have a light/dark option ... sun/moon.
   I'd like the sun to have sunglasses on and be in the top right corner of the box (can be taking up majority of the
   box but justify top right". One box at the end of the menu: the sun, in sunglasses, fills most of it from the top
   right, and a small moon sits bottom left. Whichever is in use is lit. A press swaps them, and the choice is kept.
   The page's own first line (after <body>) has already set data-theme, so nothing flashes; this file draws the box.
   Only a page that loads this file has the switch: each tool's own page does not, and stays navy. */
(function () {
  var root = document.documentElement, KEY = 'sa_theme';
  function mode() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  var css = '.sa-switch{flex:none;box-sizing:border-box;width:2.5rem;height:2.5rem;padding:0;margin:0 0 0 0.375rem;border:1px solid rgba(203,213,225,0.3);border-radius:0.375rem;background:rgba(255,255,255,0.04);cursor:pointer;line-height:0;transition:border-color .2s,background .2s}'
    + '.sa-switch:hover{border-color:#3DD8D8;background:rgba(61,216,216,0.09)}'
    + '.sa-switch:focus-visible{outline:0.125rem solid #9B82FF;outline-offset:0.125rem}'
    + '.sa-switch svg{display:block;width:100%;height:100%}'
    + '.sa-switch .sun,.sa-switch .moon{transition:opacity .25s}'
    + '.sa-switch .sun{opacity:.34}.sa-switch .moon{opacity:1}'
    + ':root[data-theme="light"] .sa-switch{background:#FFFFFF;border-color:#CBD5E1}'
    + ':root[data-theme="light"] .sa-switch .sun{opacity:1}:root[data-theme="light"] .sa-switch .moon{opacity:.3}'
    + '@media(max-width:560px){.sa-switch{position:absolute;top:0.875rem;right:1.5rem;width:2.25rem;height:2.25rem;margin:0}}';
  var svg = '<svg viewBox="0 0 44 44" aria-hidden="true"><defs>'
    + '<linearGradient id="sa-sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD866"/><stop offset="1" stop-color="#F5A623"/></linearGradient>'
    + '<linearGradient id="sa-moon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E6ECF7"/><stop offset="1" stop-color="#9B82FF"/></linearGradient></defs>'
    + '<g class="sun"><g stroke="url(#sa-sun)" stroke-width="2.4" stroke-linecap="round"><path d="M27.5 1.6v2.6M38.1 5.9l-1.9 1.9M42.4 16.5h-2.6M38.1 27.1l-1.9-1.9M27.5 31.4v-2.6M16.9 27.1l1.9-1.9M12.6 16.5h2.6M16.9 5.9l1.9 1.9"/></g>'
    + '<circle cx="27.5" cy="16.5" r="10.2" fill="url(#sa-sun)"/>'
    + '<path d="M17.6 13.6h19.8" stroke="#0F1B2D" stroke-width="1.5" stroke-linecap="round"/>'
    + '<path d="M19.2 13.4h7.1v2.9a3.55 3.55 0 0 1-7.1 0zM28.7 13.4h7.1v2.9a3.55 3.55 0 0 1-7.1 0z" fill="#0F1B2D"/>'
    + '<path d="M20.6 14.8h1.6M30.1 14.8h1.6" stroke="#5EE4E4" stroke-width="1" stroke-linecap="round"/>'
    + '<path d="M23.6 22.1c1.2 1.5 6.6 1.5 7.8 0" fill="none" stroke="#0F1B2D" stroke-width="1.4" stroke-linecap="round"/></g>'
    + '<g class="moon"><path d="M13.6 28.2a7.6 7.6 0 1 0 6.9 11.2a6.3 6.3 0 0 1-6.9-11.2z" fill="url(#sa-moon)"/><circle cx="6.2" cy="27.6" r="0.9" fill="#C7D0E0"/><circle cx="19.4" cy="31.2" r="0.7" fill="#C7D0E0"/></g></svg>';
  function say(b) { var light = mode() === 'light'; b.setAttribute('aria-pressed', light ? 'true' : 'false'); b.setAttribute('aria-label', light ? 'Light version on. Switch to dark' : 'Dark version on. Switch to light'); b.title = (light ? 'Switch to dark' : 'Switch to light') + '. Every site we build comes in a light version and a dark one.'; }
  function start() {
    var links = document.querySelector('#main-nav .nav-links'); if (!links || document.getElementById('sa-switch')) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var b = document.createElement('button'); b.type = 'button'; b.id = 'sa-switch'; b.className = 'sa-switch'; b.innerHTML = svg; say(b);
    b.addEventListener('click', function () {
      var next = mode() === 'light' ? 'dark' : 'light';
      if (next === 'light') root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
      try { localStorage.setItem(KEY, next); } catch (e) {}
      say(b);
      document.dispatchEvent(new CustomEvent('sa-theme', { detail: next }));
    });
    links.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
