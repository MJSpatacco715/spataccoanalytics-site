/*
 * Runs first on the public editions of the NFL tools.
 *
 * The pages are the source platform's own, copied in at build time. Here they
 * run without the platform behind them, so this file:
 *   - answers their calls to the platform's API: the public data through this
 *     site's live relay (feed.php), the depth chart and Madden ratings from
 *     files built beside the pages, and everything account-shaped (sign-in,
 *     follows, league rosters) as "not signed in", which the pages already
 *     handle by hiding those parts;
 *   - stands in for the few helpers the platform's site script supplied
 *     (preferences kept in this browser, the theme, the news link);
 *   - keeps links honest: a page that is not part of this edition says so
 *     instead of breaking, and inside the tool page's frame a link to another
 *     tool opens that tool's page.
 *
 * It is written with the platform's own names; the build renames them with
 * everything else it copies.
 */
(function () {
  'use strict';
  var EMBED = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  var root = document.documentElement;
  if (EMBED) { root.classList.add('sa-embed'); }

  // ---- data calls -------------------------------------------------------
  var LIVE = { odds_get: 1, odds_ticks: 1, injuries: 1, referees: 1 };
  var SIGNED_OUT = { me: 1, login: 1, league_rosters: 1, player_journey: 1, follow_get: 1, follow_set: 1 };
  function reply(obj, status) {
    return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  }
  function route(url) {
    var m = /(?:^|\/)api\.php\?([^#]*)/.exec(url);
    if (!m) { return null; }
    var q = new URLSearchParams(m[1]);
    var a = q.get('action') || '';
    // the Refresh button: the week read again through the relay, which asks
    // the source at most once a minute however many people press it
    if (a === 'odds_refresh') { a = 'odds_get'; }
    if (LIVE[a]) {
      var p = new URLSearchParams({ a: a });
      ['week', 'player'].forEach(function (k) { if (q.get(k)) { p.set(k, q.get(k)); } });
      return { url: 'feed.php?' + p.toString() };
    }
    if (a === 'depth_chart') { return { url: 'data/depth_chart.json' }; }
    if (a === 'madden_index') { return { url: q.get('lite') ? 'data/madden_index_lite.json' : 'data/madden_index.json' }; }
    if (a === 'madden_player') {
      var id = q.get('player') || '';
      return /^\d{1,16}$/.test(id) ? { now: maddenPlayer(id) } : { now: reply({ ok: false }, 400) };
    }
    if (SIGNED_OUT[a]) { return { now: reply({ ok: false, error: 'not signed in' }, 401) }; }
    // preferences, page views and the like: nothing to keep here
    return { now: reply({ ok: true }) };
  }
  var realFetch = window.fetch.bind(window);
  function json(url) {
    return realFetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; });
  }
  // One man's full ratings: his own small file, and the labels and measured
  // order every man shares, kept once beside them (the platform's answer, the
  // same shape).
  var MADDEN_META = null;
  function maddenPlayer(id) {
    MADDEN_META = MADDEN_META || json('data/madden/meta.json');
    return Promise.all([MADDEN_META, json('data/madden/' + id + '.json')]).then(function (x) {
      var m = x[0], one = x[1] && x[1].player ? x[1].player : null;
      if (!m) { return reply({ ok: false }, 502); }
      return reply({ ok: true, player: one, pid: id, iteration: m.iteration, updated: m.updated, game: m.game,
        stats: m.stats || {}, groups: m.groups || [], keys: m.keys || {},
        impact: one && m.impact ? m.impact[String(one.p || '')] || null : null });
    });
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var r = route(url);
    if (!r) { return realFetch(input, init); }
    if (r.now) { return Promise.resolve(r.now); }
    return realFetch(r.url, { cache: 'no-cache' }).then(function (res) {
      return res.ok ? res : reply({ ok: false }, res.status);
    }, function () { return reply({ ok: false }, 502); });
  };

  // ---- the platform's helpers ------------------------------------------
  window.wwffBase = function () { return ''; };
  var PREFS = 'wwff_prefs';
  window.wwffPrefsLoad = function () {
    if (!window.wwffPrefs) {
      try { window.wwffPrefs = JSON.parse(localStorage.getItem(PREFS) || '{}') || {}; } catch (e) { window.wwffPrefs = {}; }
    }
    return Promise.resolve(window.wwffPrefs);
  };
  window.wwffPrefsSave = function (patch) {
    window.wwffPrefs = Object.assign({}, window.wwffPrefs || {}, patch);
    try { localStorage.setItem(PREFS, JSON.stringify(window.wwffPrefs)); } catch (e) {}
    return Promise.resolve();
  };
  ['wwffVisit', 'wwffVisitCurrent', 'wwffFirstTip', 'wwffNavRefresh', 'wwffPageView'].forEach(function (n) {
    window[n] = function () {};
  });
  window.wwffLoginErr = function () { return 'Signing in is not part of this public edition.'; };
  // A name's news, two days either side of a day (or the last two weeks with
  // no day), as the platform builds it.
  window.wwffNewsSearch = function (name, day, words) {
    var DAY = 86400000;
    var fmt = function (t) { return (t.getUTCMonth() + 1) + '/' + t.getUTCDate() + '/' + t.getUTCFullYear(); };
    var min, max;
    if (day) {
      var mid = new Date(String(day).slice(0, 10) + 'T12:00:00Z');
      min = new Date(+mid - 2 * DAY);
      max = new Date(+mid + 2 * DAY);
    } else {
      max = new Date();
      min = new Date(+max - 14 * DAY);
    }
    return 'https://www.google.com/search?q=' + encodeURIComponent('"' + name + '" ' + (words || 'fantasy football news'))
      + '&tbs=cdr:1,cd_min:' + fmt(min) + ',cd_max:' + fmt(max);
  };

  // ---- theme: the reader's last choice, else light, as on the source -------
  var THEME = 'wwff_theme';
  function paint(t) {
    root.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    var b = document.getElementById('themebtn');
    if (b) { b.textContent = t === 'dark' ? '☀' : '☾'; }
  }
  paint((function () { try { return localStorage.getItem(THEME); } catch (e) { return null; } })() || 'light');
  // a page with its own toggle replaces this one; the Lines Tracker has none
  window.toggleTheme = function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    paint(next);
    try { localStorage.setItem(THEME, next); } catch (e) {}
  };

  // ---- links ---------------------------------------------------------------
  // this edition's pages, and the site page each one sits in
  var PAGES = {
    'lines.html': { home: '/tools/football/nfl-lines-tracker.html', name: 'Lines Tracker' },
    'injuries.html': { home: '/tools/football/nfl-injury-tracker.html', name: 'Injury Tracker' },
    'depth-charts.html': { home: '/tools/football/nfl-depth-charts.html', name: 'Depth Charts' }
  };
  var here = location.pathname.split('/').pop() || '';
  var liveDir = location.pathname.replace(/[^\/]*$/, '');
  function toast(msg) {
    var t = document.getElementById('sa-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'sa-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { return; }
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) { return; }
    var raw = a.getAttribute('href') || '';
    if (raw.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(raw)) { return; }
    var u;
    try { u = new URL(raw, location.href); } catch (err) { return; }
    if (u.origin !== location.origin) {
      if (!a.target) { a.target = '_blank'; a.rel = 'noopener'; }
      return;
    }
    if (u.pathname.indexOf(liveDir) !== 0) {
      // a page of this site (the way home): the whole window goes there
      if (EMBED) { e.preventDefault(); try { window.top.location.href = u.href; } catch (err) { location.href = u.href; } }
      return;
    }
    var file = u.pathname.slice(liveDir.length);
    if (!PAGES[file]) {
      // the source's own pages (a league team, the referee record) stay there
      e.preventDefault();
      toast('That part of the platform is not in this public edition.');
      return;
    }
    if (EMBED && file !== here) {
      // another tool: its page on this site, carrying what was asked for
      e.preventDefault();
      try { window.top.location.href = PAGES[file].home + u.search + u.hash; } catch (err) { location.href = u.href; }
    }
  }, true);

  // ---- the bar over a full-screen visit (the build writes it into the page
  // where the platform's own header was), hidden inside the tool page's frame
  var CSS = ''
    + '#sa-toast{position:fixed;left:50%;bottom:22px;transform:translate(-50%,20px);opacity:0;z-index:9999;'
    + 'background:#0C1F3F;color:#fff;font:600 13px/1.3 system-ui,sans-serif;padding:10px 16px;border-radius:6px;'
    + 'box-shadow:0 6px 20px rgba(0,0,0,.25);transition:opacity .2s,transform .2s;pointer-events:none;max-width:90vw}'
    + '#sa-toast.on{opacity:1;transform:translate(-50%,0)}'
    + '#sa-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 14px;background:#0C1F3F;'
    + 'border-bottom:3px solid #1A4D3A;font:600 13px/1.2 system-ui,sans-serif}'
    + '#sa-bar a{color:#E2E8F0;text-decoration:none;padding:6px 11px;border-radius:4px;border:1px solid rgba(61,216,216,.3);white-space:nowrap}'
    + '#sa-bar a:hover{border-color:#3DD8D8;color:#fff}'
    + '#sa-bar a.home{background:#F4D744;color:#0C1F3F;border-color:#F4D744}'
    + '#sa-bar a[aria-current]{background:#3DD8D8;border-color:#3DD8D8;color:#0C1F3F}'
    + '#sa-bar .sp{flex:1}'
    + '#sa-bar .themebtn{background:none;border:1px solid rgba(61,216,216,.3);color:#E2E8F0;border-radius:4px;'
    + 'width:34px;height:30px;cursor:pointer;font-size:14px;padding:0}'
    + '@media (max-width:560px){#sa-bar{padding:6px 8px;gap:6px}#sa-bar a{padding:5px 8px;font-size:12px}}'
    + '.sa-embed #sa-bar{display:none}'
    + '.sa-embed .wrap > h1:first-child{display:none}';
  var st = document.createElement('style');
  st.id = 'sa-css';
  st.textContent = CSS;
  (document.head || root).appendChild(st);
  document.addEventListener('DOMContentLoaded', function () { paint(root.getAttribute('data-theme')); });
})();
