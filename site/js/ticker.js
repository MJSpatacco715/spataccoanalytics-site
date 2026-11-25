/* The market strip under the menu on the homepage (css/ticker.css).

   It asks the site's own feed (market/feed.php) for a handful of market
   figures and scrolls them slowly. Every figure shows who published it and
   for when, and opens its source card on hover, keyboard focus or tap. The
   strip stays hidden until it has at least three figures, so a source that is
   down never leaves an empty bar. Everything is written as text, never as
   markup. */
(function () {
  'use strict';
  var root = document.getElementById('sa-ticker');
  if (!root || !window.fetch) return;

  var FEED = '/market/feed.php';
  var EVERY = 120000;       // ask again every two minutes while the page is in view
  var SPEED = 38;           // pixels a second
  var MIN_ITEMS = 3;
  var NOTE = 'The latest figure each source has published. Not live quotes.';
  var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var view, track, card, pause;
  var data = [];            // the figures as the feed gave them
  var byId = {};
  var openItem = null, closing = null, userPaused = false, lastWidth = 0, pointer = 'mouse';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Focused with the keyboard (true where the browser cannot say).
  function keyed(e) {
    try { return e.matches(':focus-visible'); } catch (x) { return true; }
  }

  function frame() {
    root.textContent = '';
    root.appendChild(el('span', 'sa-tk-tag', 'Markets'));
    view = el('div', 'sa-tk-view');
    track = el('div', 'sa-tk-track');
    view.appendChild(track);
    root.appendChild(view);
    pause = el('button', 'sa-tk-pause');
    pause.type = 'button';
    pause.setAttribute('aria-pressed', 'false');
    pause.setAttribute('aria-label', 'Pause the market figures');
    pause.title = 'Pause';
    pause.addEventListener('click', function () {
      userPaused = !userPaused;
      pause.setAttribute('aria-pressed', String(userPaused));
      pause.setAttribute('aria-label', userPaused ? 'Play the market figures' : 'Pause the market figures');
      pause.title = userPaused ? 'Play' : 'Pause';
      sync();
    });
    root.appendChild(pause);
    card = el('div', 'sa-tk-card');
    card.id = 'sa-tk-card';
    card.hidden = true;
    card.setAttribute('role', 'note');
    card.addEventListener('pointerenter', function () { clearTimeout(closing); });
    card.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') closeSoon(); });
    card.addEventListener('keydown', cardKeys);
    root.appendChild(card);
  }

  function fill(btn, it) {
    btn.textContent = '';
    btn.appendChild(el('span', 'sa-tk-name', it.label));
    btn.appendChild(el('span', 'sa-tk-val', it.value));
    if (it.delta) btn.appendChild(el('span', 'sa-tk-chg' + (it.dir === 'up' ? ' up' : it.dir === 'dn' ? ' dn' : ''), it.delta));
    btn.appendChild(el('span', 'sa-tk-when', it.by + ', ' + it.when));
  }

  function oneSet(real) {
    var ul = el('ul', 'sa-tk-set');
    if (!real) ul.setAttribute('aria-hidden', 'true');
    data.forEach(function (it) {
      var li = el('li');
      var btn = el('button', 'sa-tk-item');
      btn.type = 'button';
      btn.setAttribute('data-id', it.id);
      if (real) {
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-describedby', 'sa-tk-card');
      } else {
        btn.tabIndex = -1;
      }
      fill(btn, it);
      btn.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') show(btn); });
      btn.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') closeSoon(); });
      btn.addEventListener('focus', function () { if (keyed(btn)) show(btn); });
      btn.addEventListener('click', function (e) {
        if (e.detail === 0) {                        // Enter or Space: into the card, to its link
          show(btn);
          var a = card.querySelector('a');
          if (a) a.focus();
        } else if (pointer !== 'mouse' && openItem === btn) {
          shut();                                    // a second tap closes it
        } else {
          show(btn);
        }
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    ul.appendChild(el('li', 'sa-tk-note', NOTE));
    return ul;
  }

  // Enough copies of the set to fill the strip twice over, so the loop has no seam.
  function lay() {
    shut();
    track.textContent = '';
    var first = oneSet(true);
    track.appendChild(first);
    lastWidth = view.clientWidth;
    if (still) return;
    var w = first.getBoundingClientRect().width;
    if (!w || !lastWidth) return;
    var half = Math.max(1, Math.ceil(lastWidth / w));
    for (var i = 1; i < half * 2; i++) track.appendChild(oneSet(false));
    track.style.setProperty('--sa-tk-dur', Math.max(20, Math.round((half * w) / SPEED)) + 's');
  }

  // The strip sits just under the menu, whatever height the menu is.
  function place() {
    var nav = document.getElementById('main-nav') || document.querySelector('nav');
    if (nav && nav.offsetHeight) root.style.setProperty('--sa-tk-top', nav.offsetHeight + 'px');
  }

  function sync() {
    root.classList.toggle('paused', userPaused || !!openItem);
  }

  function under(btn) {
    var box = root.getBoundingClientRect(), b = btn.getBoundingClientRect();
    var most = Math.max(12, box.width - card.offsetWidth - 12);
    card.style.left = Math.min(Math.max(12, b.left - box.left), most) + 'px';
  }

  function show(btn) {
    var it = byId[btn.getAttribute('data-id')];
    if (!it) return;
    clearTimeout(closing);
    if (openItem && openItem !== btn) { openItem.classList.remove('open'); openItem.setAttribute('aria-expanded', 'false'); }
    openItem = btn;
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    card.textContent = '';
    card.appendChild(el('strong', '', it.card.title));
    card.appendChild(document.createTextNode(it.card.text));
    card.appendChild(el('span', '', 'Source: ' + it.card.source + '.'));
    if (/^https:\/\//.test(it.card.url || '')) {
      var a = el('a', '', 'See the source');
      a.href = it.card.url;
      a.target = '_blank';
      a.rel = 'noopener';
      card.appendChild(a);
    }
    card.hidden = false;
    under(btn);
    requestAnimationFrame(function () { if (openItem === btn) under(btn); });
    sync();
  }

  function shut() {
    clearTimeout(closing);
    if (openItem) { openItem.classList.remove('open'); openItem.setAttribute('aria-expanded', 'false'); }
    openItem = null;
    if (card) card.hidden = true;
    sync();
  }

  function closeSoon() {
    clearTimeout(closing);
    closing = setTimeout(function () {
      if (!openItem) return;
      if (card.matches(':hover') || card.contains(document.activeElement)) return;
      if (openItem.matches(':hover') || (openItem === document.activeElement && keyed(openItem))) return;
      shut();
    }, 220);
  }

  // In the card with the keyboard: Escape and Shift+Tab go back to the figure,
  // Tab goes on to the next one.
  function cardKeys(e) {
    if (!openItem) return;
    var from = openItem;
    if (e.key === 'Escape' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      shut();
      from.focus();
    } else if (e.key === 'Tab') {
      var real = Array.prototype.slice.call(track.firstChild.querySelectorAll('.sa-tk-item'));
      var next = real[real.indexOf(from) + 1] || pause;
      e.preventDefault();
      shut();
      next.focus();
    }
  }

  function same(items) {
    if (items.length !== data.length) return false;
    for (var i = 0; i < items.length; i++) if (items[i].id !== data[i].id) return false;
    return true;
  }

  function take(items) {
    var fresh = !same(items) || !track.firstChild;
    data = items;
    byId = {};
    items.forEach(function (it) { byId[it.id] = it; });
    if (fresh) { lay(); return; }
    // the same figures with new values: write them where they stand
    var widthBefore = track.firstChild.getBoundingClientRect().width;
    track.querySelectorAll('.sa-tk-item').forEach(function (btn) {
      var it = byId[btn.getAttribute('data-id')];
      if (it) fill(btn, it);
    });
    if (openItem) show(openItem);
    else if (Math.abs(track.firstChild.getBoundingClientRect().width - widthBefore) > 40) lay();
  }

  function good(d) {
    if (!d || d.ok !== true || !Array.isArray(d.items)) return null;
    var items = d.items.filter(function (it) {
      return it && typeof it.id === 'string' && typeof it.label === 'string' && typeof it.value === 'string' &&
        typeof it.by === 'string' && typeof it.when === 'string' && it.card && typeof it.card.title === 'string' &&
        typeof it.card.text === 'string' && typeof it.card.source === 'string';
    });
    return items.length >= MIN_ITEMS ? items : null;
  }

  function load() {
    if (document.hidden) return;
    fetch(FEED, { credentials: 'omit', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var items = good(d);
        if (!items) return;          // keep whatever is already showing
        if (!track) frame();
        var first = root.hidden;
        if (first) { root.hidden = false; place(); }
        take(items);
        if (first) requestAnimationFrame(function () { root.classList.add('on'); });
      })
      .catch(function () {});
  }

  root.addEventListener('pointerdown', function (e) { pointer = e.pointerType || 'mouse'; }, true);
  // keyboard: the strip stands still and the browser brings the focused figure into view
  root.addEventListener('focusin', function (e) {
    if (keyed(e.target)) root.classList.add('keys');
    if (openItem && e.target !== openItem && !card.contains(e.target) && !(e.target.classList && e.target.classList.contains('sa-tk-item'))) shut();
  });
  root.addEventListener('focusout', function (e) {
    if (root.contains(e.relatedTarget)) return;
    root.classList.remove('keys');
    if (view) view.scrollLeft = 0;
    if (openItem && !openItem.matches(':hover')) shut();
  });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openItem) shut();
  });
  document.addEventListener('click', function (e) { if (openItem && !root.contains(e.target)) shut(); });

  var resizing = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizing);
    resizing = setTimeout(function () {
      if (!track || root.hidden) return;
      place();
      if (view.clientWidth !== lastWidth) lay();
    }, 200);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && root.hidden) load(); });

  load();
  setInterval(load, EVERY);
})();
