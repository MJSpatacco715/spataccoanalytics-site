/* The light / dark switch. The owner, 2026-11-27: "Spatacco analytics should have a light/dark option ... sun/moon.
   I'd like the sun to have sunglasses on and be in the top right corner of the box (can be taking up majority of the
   box but justify top right". And then a pencil sketch of it: the sun is a quarter disc set into the top right corner
   of the box, cut off by its edges, sunglasses on, its rays, long and short by turns, fanning down and to the left.
   So that is the box. In the dark version the sun is faint and a small moon is lit at the bottom left; in the light
   version the sun is lit and the moon is gone. A press swaps them, and the choice is kept.
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
    + '.sa-switch .sun{opacity:.3}.sa-switch .moon{opacity:1}'
    + ':root[data-theme="light"] .sa-switch{background:#FFFFFF;border-color:#CBD5E1}'
    + ':root[data-theme="light"] .sa-switch .sun{opacity:1}:root[data-theme="light"] .sa-switch .moon{opacity:0}'
    + '@media(max-width:560px){.sa-switch{position:absolute;top:0.875rem;right:1.5rem;width:2.25rem;height:2.25rem;margin:0}}';
  var svg = '<svg viewBox="0 0 44 44" aria-hidden="true"><defs>'
    + '<linearGradient id="sa-sun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD866"/><stop offset="1" stop-color="#F5A623"/></linearGradient>'
    + '<linearGradient id="sa-moon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E6ECF7"/><stop offset="1" stop-color="#9B82FF"/></linearGradient><clipPath id="sa-box"><rect x="0.5" y="0.5" width="43" height="43" rx="5"/></clipPath></defs>'
    + '<g class="sun" clip-path="url(#sa-box)"><g stroke="url(#sa-sun)" stroke-width="2.4" stroke-linecap="round"><path d="M40.3 26.2L38.6 38.6M34.5 24.7L32.4 30.3M29.2 22.0L22.2 32.3M24.6 18.1L20.2 22.2M21.1 13.2L10.2 19.5M18.7 7.7L12.9 9.5M17.6 1.8L5.1 2.7"/></g><circle cx="44" cy="0" r="23" fill="url(#sa-sun)"/><g transform="rotate(45 34.5 9.5)"><path d="M24.3 9.3h20.4" stroke="#0F1B2D" stroke-width="1.6" stroke-linecap="round"/><path d="M26 9.1h7.6v3.1a3.8 3.8 0 0 1-7.6 0zM35.4 9.1h7.6v3.1a3.8 3.8 0 0 1-7.6 0z" fill="#0F1B2D"/><path d="M27.5 10.6h1.8M36.9 10.6h1.8" stroke="#5EE4E4" stroke-width="1" stroke-linecap="round"/><path d="M31 18.6c1.3 1.5 5.7 1.5 7 0" fill="none" stroke="#0F1B2D" stroke-width="1.4" stroke-linecap="round"/></g></g>'
    + '<g class="moon"><path d="M10.6 29.2a6.6 6.6 0 1 0 6 9.7a5.5 5.5 0 0 1-6-9.7z" fill="url(#sa-moon)"/><circle cx="4.6" cy="27.8" r="0.8" fill="#C7D0E0"/></g></svg>';
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
