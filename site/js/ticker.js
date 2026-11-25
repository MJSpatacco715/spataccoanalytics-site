/* The market strip under the menu on the homepage (css/ticker.css).

   It asks the site's own feed (market/feed.php) for a handful of market
   figures and scrolls them slowly. Every figure shows who published it and
   for when, and opens a card on hover, keyboard focus or tap: the figure
   drawn (its value and change, a line of its recent history that reads out
   any day, the low, the high and the change; for the deal count, the year
   beside the record year), its source with a link, and one plain line that the tool runs on free public
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
        var a = card.querySelector('svg[tabindex], a');   // the chart when there is one, then the source
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

  // A whole number from the feed, or null. Sizes are worked out from these
  // and from nothing else the feed sends.
  function whole(v) {
    return typeof v === 'number' && isFinite(v) && v >= 0 && v < 1e6 ? Math.round(v) : null;
  }

  // How far a count is toward its limit: a bar, with a line under each end.
  function meter(m) {
    var pct = whole(m.pct);
    if (pct === null) return;
    var box = el('div', 'sa-tk-meter');
    var bar = el('div', 'sa-tk-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', String(m.label || ''));
    var fill = el('span');
    fill.style.width = Math.min(100, pct) + '%';
    bar.appendChild(fill);
    box.appendChild(bar);
    var ends = el('div', 'sa-tk-ends');
    ends.appendChild(el('span', '', m.left));
    ends.appendChild(el('span', '', m.right));
    box.appendChild(ends);
    card.appendChild(box);
  }

  // Two years side by side, a pair of columns a quarter, each with its number
  // on top. A quarter still to come shows what it would need, drawn hollow.
  var TALL = 58;            // pixels: the tallest column
  function chart(ch) {
    var rows = Array.isArray(ch.rows) ? ch.rows.slice(0, 4) : [];
    var top = 0, needs = false;
    rows.forEach(function (r) {
      ['then', 'now', 'need'].forEach(function (k) { var n = whole(r && r[k]); if (n !== null && n > top) top = n; });
      if (r && whole(r.need) !== null) needs = true;
    });
    if (!rows.length || top <= 0) return;
    var fig = el('div', 'sa-tk-chart');
    var head = el('div', 'sa-tk-chead');
    head.appendChild(el('span', 'sa-tk-ctitle', ch.title));
    var key = el('span', 'sa-tk-key');
    [['then', ch.then], ['now', ch.now], ['need', needs ? ch.need : '']].forEach(function (k) {
      if (k[1]) key.appendChild(el('span', 'sa-tk-k ' + k[0], k[1]));
    });
    head.appendChild(key);
    fig.appendChild(head);
    var plot = el('div', 'sa-tk-plot');
    plot.setAttribute('role', 'img');
    plot.setAttribute('aria-label', String(ch.label || ''));
    rows.forEach(function (r) {
      var grp = el('div', 'sa-tk-grp');
      var cols = el('div', 'sa-tk-cols');
      ['then', 'now', 'need'].forEach(function (k) {
        var n = whole(r && r[k]);
        if (n === null) return;
        var col = el('span', 'sa-tk-col ' + k);
        col.appendChild(el('span', 'sa-tk-n', String(n)));
        var bar = el('i');
        bar.style.height = Math.max(2, Math.round(n / top * TALL)) + 'px';
        col.appendChild(bar);
        cols.appendChild(col);
      });
      grp.appendChild(cols);
      grp.appendChild(el('span', 'sa-tk-q', r && r.q));
      plot.appendChild(grp);
    });
    fig.appendChild(plot);
    if (typeof ch.note === 'string' && ch.note) fig.appendChild(el('p', 'sa-tk-take', ch.note));
    card.appendChild(fig);
  }

  // A value as its unit is written, and a day as "Nov 24". The chart's own
  // numbers are written here: nothing in it comes from the feed as markup.
  var UNITS = {
    pct: function (v) { return v.toFixed(2) + '%'; },
    fx: function (v) { return v.toFixed(4); },
    eur4: function (v) { return '\u20AC' + v.toFixed(4); },
    usd0: function (v) { return '$' + Math.round(v).toLocaleString('en-US'); },
    usd2: function (v) { return '$' + v.toFixed(2); },
    usd3: function (v) { return '$' + v.toFixed(3); }
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayText(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    return m && MONTHS[+m[2] - 1] ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) : '';
  }
  var SVG = 'http://www.w3.org/2000/svg';
  function shape(tag, attrs) {
    var e = document.createElementNS(SVG, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // A figure's recent history as a line: the high and the low marked at the
  // side, the first and last day underneath, a dot on the latest. Moving
  // along it (mouse, finger or the arrow keys) reads out any day.
  var LW = 336, LH = 104, LTOP = 18, LBOT = 16, LPAD = 6;
  function line(ln) {
    var fmt = UNITS[ln.unit];
    var pts = [];
    (Array.isArray(ln.points) ? ln.points.slice(-90) : []).forEach(function (p) {
      if (Array.isArray(p) && typeof p[1] === 'number' && isFinite(p[1]) && dayText(p[0])) pts.push({ d: p[0], v: p[1] });
    });
    if (!fmt || pts.length < 5) return false;
    var lo = pts[0].v, hi = pts[0].v;
    pts.forEach(function (p) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
    var range = hi - lo || 1;
    var last = pts.length - 1;
    function x(i) { return LPAD + i / last * (LW - 2 * LPAD); }
    function y(v) { return LTOP + (hi - v) / range * (LH - LTOP - LBOT); }
    function r(n) { return Math.round(n * 10) / 10; }

    var fig = el('div', 'sa-tk-chart');
    var head = el('div', 'sa-tk-chead');
    head.appendChild(el('span', 'sa-tk-ctitle', ln.title));
    var read = el('span', 'sa-tk-read');
    head.appendChild(read);
    fig.appendChild(head);

    var g = shape('svg', { viewBox: '0 0 ' + LW + ' ' + LH, 'class': 'sa-tk-line', role: 'img', tabindex: '0', 'aria-label': String(ln.label || '') });
    g.appendChild(shape('line', { x1: 0, x2: LW, y1: r(y(hi)), y2: r(y(hi)), 'class': 'sa-tk-rule' }));
    g.appendChild(shape('line', { x1: 0, x2: LW, y1: r(y(lo)), y2: r(y(lo)), 'class': 'sa-tk-rule' }));
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + r(x(i)) + ' ' + r(y(p.v)); }).join(' ');
    g.appendChild(shape('path', { d: d + ' L' + r(x(last)) + ' ' + (LH - LBOT + 6) + ' L' + r(x(0)) + ' ' + (LH - LBOT + 6) + ' Z', 'class': 'sa-tk-wash' }));
    g.appendChild(shape('path', { d: d, 'class': 'sa-tk-path' }));
    var hiText = shape('text', { x: 0, y: r(y(hi)) - 5, 'class': 'sa-tk-tick' });
    hiText.textContent = fmt(hi);
    g.appendChild(hiText);
    if (hi !== lo) {
      var loText = shape('text', { x: 0, y: r(y(lo)) + 12, 'class': 'sa-tk-tick' });
      loText.textContent = fmt(lo);
      g.appendChild(loText);
    }
    var rule = shape('line', { y1: LTOP - 6, y2: LH - LBOT + 6, 'class': 'sa-tk-cross' });
    var spot = shape('circle', { r: 4, 'class': 'sa-tk-spot' });
    g.appendChild(rule);
    g.appendChild(shape('circle', { cx: r(x(last)), cy: r(y(pts[last].v)), r: 4, 'class': 'sa-tk-dot' }));
    g.appendChild(spot);
    fig.appendChild(g);

    var ends = el('div', 'sa-tk-days');
    ends.appendChild(el('span', '', dayText(pts[0].d)));
    ends.appendChild(el('span', '', dayText(pts[last].d)));
    fig.appendChild(ends);

    var at = last;
    function point(i, on) {
      at = Math.max(0, Math.min(last, i));
      read.textContent = dayText(pts[at].d) + ': ' + fmt(pts[at].v);
      g.classList.toggle('reading', !!on);
      rule.setAttribute('x1', r(x(at)));
      rule.setAttribute('x2', r(x(at)));
      spot.setAttribute('cx', r(x(at)));
      spot.setAttribute('cy', r(y(pts[at].v)));
    }
    function follow(e) {
      var b = g.getBoundingClientRect();
      if (b.width) point(Math.round(((e.clientX - b.left) / b.width * LW - LPAD) / (LW - 2 * LPAD) * last), true);
    }
    g.addEventListener('pointermove', follow);
    g.addEventListener('pointerdown', follow);
    g.addEventListener('pointerleave', function () { point(last, false); });
    g.addEventListener('blur', function () { point(last, false); });
    g.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      point(at + step, true);
    });
    point(last, false);
    card.appendChild(fig);
    return true;
  }

  // The low, the high and the change over the stretch drawn: three small tiles.
  function tiles(list) {
    var row = el('div', 'sa-tk-tiles');
    list.slice(0, 3).forEach(function (t) {
      if (!t || typeof t !== 'object') return;
      var tile = el('div', 'sa-tk-tile');
      tile.appendChild(el('span', 'sa-tk-tl', t.label));
      tile.appendChild(el('span', 'sa-tk-tv' + (t.dir === 'up' ? ' up' : t.dir === 'dn' ? ' dn' : ''), t.value));
      tile.appendChild(el('span', 'sa-tk-tn', t.note));
      row.appendChild(tile);
    });
    if (row.firstChild) card.appendChild(row);
  }

  // The card for one figure: what it is, and where it comes from. A figure
  // that sends a picture of itself is drawn. A market figure: the value with
  // its change, a line of its history, the low, high and change, and a line
  // on what it is. The deal count: the number, how
  // far it is to the record, the year beside the record year, a few facts.
  function figureCard(it) {
    var c = it.card;
    var drawn = !!(c.hero && typeof c.hero === 'object' && c.hero.value);
    card.classList.toggle('sa-tk-wide', drawn);
    if (drawn) {
      card.appendChild(el('strong', 'sa-tk-eye', c.eyebrow || c.title));
      var hero = el('p', 'sa-tk-hero');
      hero.appendChild(el('span', 'sa-tk-big', c.hero.value));
      if (typeof c.hero.delta === 'string' && c.hero.delta) {
        // the change, with an arrow so the direction is not left to color
        var way = c.hero.dir === 'up' ? 'up' : c.hero.dir === 'dn' ? 'dn' : 'flat';
        var side = el('span', 'sa-tk-side');
        var moved = el('span', 'sa-tk-moved');
        moved.appendChild(el('span', 'sa-tk-chip ' + way, (way === 'up' ? '\u25B2 ' : way === 'dn' ? '\u25BC ' : '') + c.hero.delta));
        if (typeof c.hero.vs === 'string' && c.hero.vs) moved.appendChild(el('span', 'sa-tk-vs', c.hero.vs));
        side.appendChild(moved);
        side.appendChild(el('span', 'sa-tk-cap', c.hero.label));
        hero.appendChild(side);
      } else {
        hero.appendChild(el('span', 'sa-tk-cap', c.hero.label));
      }
      card.appendChild(hero);
      if (Array.isArray(c.pair)) {
        // a rate both ways round, and one line on which side is worth more
        var pair = el('div', 'sa-tk-pair');
        c.pair.slice(0, 2).forEach(function (t) { if (typeof t === 'string' && t) pair.appendChild(el('span', '', t)); });
        if (pair.firstChild) card.appendChild(pair);
      }
      if (typeof c.verdict === 'string' && c.verdict) card.appendChild(el('p', 'sa-tk-verdict', c.verdict));
      if (c.meter && typeof c.meter === 'object') meter(c.meter);
      if (c.chart && typeof c.chart === 'object') chart(c.chart);
      if (c.line && typeof c.line === 'object' && line(c.line) && Array.isArray(c.tiles)) tiles(c.tiles);
      if (typeof c.about === 'string' && c.about) card.appendChild(el('p', 'sa-tk-about', c.about));
      var facts = Array.isArray(c.facts) ? c.facts.slice(0, 4).filter(function (f) { return typeof f === 'string' && f; }) : [];
      if (facts.length) {
        var ul = el('ul', 'sa-tk-facts');
        facts.forEach(function (f) { ul.appendChild(el('li', '', f)); });
        card.appendChild(ul);
      } else if (!c.chart && !c.about) {
        card.appendChild(el('p', '', c.text));
      }
    } else {
      card.appendChild(el('strong', '', c.title));
      card.appendChild(el('p', '', c.text));
    }
    var src = el('p', 'sa-tk-from', 'Source: ');
    src.appendChild(out(c.source, c.url) || document.createTextNode(c.source));
    if (drawn && typeof c.next === 'string' && c.next) src.appendChild(document.createTextNode('. ' + c.next));
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
    card.classList.remove('sa-tk-wide');
    if (it) figureCard(it); else aboutCard();
    // at the foot of every card; its second sentence is kept on one line
    var free = el('p', 'sa-tk-free');
    var cut = FREE.indexOf('. ') + 2;
    free.appendChild(document.createTextNode(FREE.slice(0, cut)));
    free.appendChild(el('span', 'sa-tk-nb', FREE.slice(cut)));
    card.appendChild(free);
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

  // In the card with the keyboard: Tab walks its chart and its links and then
  // goes on to the next figure; Shift+Tab from the first of them, or Escape,
  // goes back.
  function cardKeys(e) {
    if (!openItem) return;
    var from = openItem;
    var links = Array.prototype.slice.call(card.querySelectorAll('svg[tabindex], a'));   // a chart is a stop too: the arrow keys read it
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
