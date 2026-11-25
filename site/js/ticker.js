/* The market strip under the menu on the homepage (css/ticker.css).

   It asks the site's own feed (market/feed.php) for a handful of market
   figures and scrolls them slowly. Every figure shows who published it and
   for when, and opens a card on hover, keyboard focus or tap: the figure, its
   source with a link, and one plain line that the tool runs on free public
   data and the visitor's could too (a soft sell: no link, no pitch). The "Markets" label and the note at the end of the scroll open a card
   about the whole strip, with every source linked. The strip stays hidden
   until it has at least three figures, so a source that is down never leaves
   an empty bar. Everything is written as text, never as markup.

   The host keeps this file for a year: change the ?v= on its tag in
   index.html whenever it changes (tests/market_test.sh checks). */
(function () {
  'use strict';
  var root = document.getElementById('sa-ticker');
  if (!root || !window.fetch) return;

  var FEED = '/market/feed.php';
  var EVERY = 120000;       // ask again every two minutes while the page is in view
  var SPEED = 38;           // pixels a second
  var MIN_ITEMS = 3;
  var NOTE = 'These quotes are latest published figures and not necessarily live.';
  var FREE = 'This tool runs entirely on free public data. Yours could too.';
  var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var view, track, card, pause, tag;
  var data = [];            // the figures as the feed gave them
  var sources = [];         // who published them, once each
  var byId = {};
  var openItem = null, closing = null, userPaused = false, lastWidth = 0, pointer = 'mouse';
  var quiet = false;        // focus put back by Escape does not reopen the card

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // A link that leaves the site, or null when the address is not https.
  function out(text, url) {
    if (!/^https:\/\//.test(url || '')) return null;
    var a = el('a', '', text);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    return a;
  }

  // Focused with the keyboard (true where the browser cannot say).
  function keyed(e) {
    try { return e.matches(':focus-visible'); } catch (x) { return true; }
  }

  // A figure, the note or the label: each opens a card the same way.
  function wire(btn) {
    btn.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') show(btn); });
    btn.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') closeSoon(); });
    btn.addEventListener('focus', function () { if (!quiet && keyed(btn)) show(btn); });
    btn.addEventListener('click', function (e) {
      if (e.detail === 0) {                        // Enter or Space: into the card, to its first link
        show(btn);
        var a = card.querySelector('a');
        if (a) a.focus();
      } else if (pointer !== 'mouse' && openItem === btn) {
        shut();                                    // a second tap closes it
      } else {
        show(btn);
      }
    });
  }

  function frame() {
    root.textContent = '';
    tag = el('button', 'sa-tk-tag', 'Markets');
    tag.type = 'button';
    tag.setAttribute('data-id', 'about');
    tag.setAttribute('aria-expanded', 'false');
    tag.setAttribute('aria-describedby', 'sa-tk-card');
    tag.setAttribute('aria-label', 'Markets: about these figures');
    wire(tag);
    root.appendChild(tag);
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

  function oneSet(real, withNote) {
    var ul = el('ul', 'sa-tk-set');
    if (!real) ul.setAttribute('aria-hidden', 'true');
    function add(cls, id) {
      var li = el('li');
      var btn = el('button', cls);
      btn.type = 'button';
      btn.setAttribute('data-id', id);
      if (real) {
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-describedby', 'sa-tk-card');
      } else {
        btn.tabIndex = -1;
      }
      wire(btn);
      li.appendChild(btn);
      ul.appendChild(li);
      return btn;
    }
    data.forEach(function (it) { fill(add('sa-tk-item', it.id), it); });
    if (withNote) add('sa-tk-item sa-tk-note', 'about').textContent = NOTE;
    return ul;
  }

  // The note on what the figures are rides along on every other pass, not
  // every one: a round is the figures with the note, then the figures alone.
  // Enough rounds to fill the strip twice over, so the loop has no seam.
  function lay() {
    shut();
    track.textContent = '';
    var first = oneSet(true, true);
    track.appendChild(first);
    lastWidth = view.clientWidth;
    if (still) return;
    var plain = oneSet(false, false);
    track.appendChild(plain);
    var round = first.getBoundingClientRect().width + plain.getBoundingClientRect().width;
    if (!round || !lastWidth) return;
    var half = Math.max(1, Math.ceil(lastWidth / round));
    for (var i = 1; i < half * 2; i++) { track.appendChild(oneSet(false, true)); track.appendChild(oneSet(false, false)); }
    track.style.setProperty('--sa-tk-dur', Math.max(20, Math.round((half * round) / SPEED)) + 's');
  }

  // The strip sits just under the menu, whatever height the menu is. Where the
  // menu wraps tall (a narrow phone) the page's first line starts lower, so
  // the strip never sits on it.
  function place() {
    var nav = document.getElementById('main-nav') || document.querySelector('nav');
    if (!nav || !nav.offsetHeight) return;
    root.style.setProperty('--sa-tk-top', nav.offsetHeight + 'px');
    var hero = root.parentNode;
    if (!hero || !hero.style) return;
    hero.style.paddingTop = '';
    var need = nav.offsetHeight + root.offsetHeight + 18;
    if ((parseFloat(getComputedStyle(hero).paddingTop) || 0) < need) hero.style.paddingTop = need + 'px';
  }

  function sync() {
    root.classList.toggle('paused', userPaused || !!openItem);
  }

  function under(btn) {
    var box = root.getBoundingClientRect(), b = btn.getBoundingClientRect();
    var most = Math.max(12, box.width - card.offsetWidth - 12);
    card.style.left = Math.min(Math.max(12, b.left - box.left), most) + 'px';
  }

  // The card for one figure: what it is, and where it comes from.
  function figureCard(it) {
    card.appendChild(el('strong', '', it.card.title));
    card.appendChild(el('p', '', it.card.text));
    var src = el('p', 'sa-tk-from', 'Source: ');
    src.appendChild(out(it.card.source, it.card.url) || document.createTextNode(it.card.source));
    card.appendChild(src);
  }

  // The card for the whole strip: what the figures are, and every source.
  function aboutCard() {
    card.appendChild(el('strong', '', 'About these figures'));
    card.appendChild(el('p', '', NOTE));
    if (sources.length) {
      card.appendChild(el('p', 'sa-tk-from', 'Sources:'));
      var ul = el('ul', 'sa-tk-list');
      sources.forEach(function (s) {
        var li = el('li');
        li.appendChild(out(s.name, s.url) || document.createTextNode(s.name));
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
  }

  function show(btn) {
    var id = btn.getAttribute('data-id');
    var it = byId[id];
    if (!it && id !== 'about') return;
    clearTimeout(closing);
    if (openItem && openItem !== btn) { openItem.classList.remove('open'); openItem.setAttribute('aria-expanded', 'false'); }
    openItem = btn;
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    card.textContent = '';
    if (it) figureCard(it); else aboutCard();
    card.appendChild(el('p', 'sa-tk-free', FREE));   // at the foot of every card
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

  // In the card with the keyboard: Tab walks its links and then goes on to
  // the next figure; Shift+Tab from the first link, or Escape, goes back.
  function cardKeys(e) {
    if (!openItem) return;
    var from = openItem;
    var links = Array.prototype.slice.call(card.querySelectorAll('a'));
    var at = links.indexOf(document.activeElement);
    if (e.key === 'Escape' || (e.key === 'Tab' && e.shiftKey && at <= 0)) {
      e.preventDefault();
      e.stopPropagation();
      shut();
      quiet = true;
      from.focus();
      quiet = false;
    } else if (e.key === 'Tab' && !e.shiftKey && at === links.length - 1) {
      var stops = [tag].concat(Array.prototype.slice.call(track.firstChild.querySelectorAll('button')), [pause]);
      var next = stops[stops.indexOf(from) + 1] || pause;
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
      return it && typeof it.id === 'string' && it.id !== 'about' && typeof it.label === 'string' && typeof it.value === 'string' &&
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
        sources = (Array.isArray(d.sources) ? d.sources : []).filter(function (s) { return s && typeof s.name === 'string' && typeof s.url === 'string'; });
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
    if (openItem && e.target !== openItem && !card.contains(e.target) && !e.target.hasAttribute('data-id')) shut();
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
