#!/usr/bin/env node
// Builds the public editions of the three NFL tools from the source
// platform's checkout: its own pages and scripts, working, with live data.
//
//   node live/build.mjs --source <checkout> --out dist/tools/football/live
//
// What it does to the source's files, and nothing more:
//   - the pages keep their own markup, styles and scripts. The platform's
//     header becomes this site's bar (hidden inside the tool page's frame),
//     the head is this site's, and comments are stripped (whitespace too);
//   - nav.js, the platform's site script (menus, sign-in, alerts, account
//     state), is not shipped. navlite.js carries the few drawing helpers the
//     tools use, lifted out of it statement by statement, and shim.js stands
//     in for the rest (see that file);
//   - the platform's name is renamed in every shipped file;
//   - the data the pages read as files is copied, cut to what they read, and
//     what they read through the platform's API is either written beside them
//     (the depth chart, the Madden ratings) or relayed live by feed.php.
// Then every file is checked against the denylist (the committed words, plus
// COPY_DENYLIST from the environment, which Publish uses for the source site's
// host name) and the build fails on any hit, on any script it does not know,
// and on any part of the source it expected and did not find.

import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const SOURCE = arg('source', process.env.SOURCE_DIR || '');
const OUT = arg('out', join(ROOT, 'dist', 'tools', 'football', 'live'));
if (!SOURCE || !existsSync(join(SOURCE, 'site', 'nav.js'))) {
  console.error('usage: build.mjs --source <source checkout, with site/> --out <dir>');
  process.exit(2);
}
const SITE = join(SOURCE, 'site');
const fail = (msg) => { console.error('build: ' + msg); process.exit(1); };

// ---- what ships --------------------------------------------------------------
const PAGES = [
  { file: 'lines.html', name: 'Lines Tracker', home: '/tools/football/nfl-lines-tracker.html',
    desc: 'NFL game lines from open to close, graded against the closing line, with the injury news that moved them.' },
  { file: 'injuries.html', name: 'Injury Tracker', home: '/tools/football/nfl-injury-tracker.html',
    desc: 'Every NFL injury designation, when it began, what changed, and whether it moved a betting line.' },
  { file: 'depth-charts.html', name: 'Depth Charts', home: '/tools/football/nfl-depth-charts.html',
    desc: 'Every NFL depth chart with injury tags, contracts, how each player arrived, and Madden ratings.' },
];
// the source's scripts these pages load, shipped as they are (minified)
const MODULES = ['oddsmerge.js', 'linechart.js', 'nflteam.js', 'injury.js', 'playercard.js', 'madden.js'];
// scripts the pages load that are deliberately left behind
const DROPPED = ['nav.js', 'pwa.js'];
// the platform loads madden.js from nav.js for one account; here every
// visitor gets the ratings on the depth charts
const AFTER_NAV = { 'depth-charts.html': ['madden.js'] };
// window.wwff* helpers navlite.js must carry, each from the one nav.js
// statement that defines it, plus the statements those depend on
const NAV_NAMES = ['wwffTeamPick', 'wwffNflNick', 'wwffMug', 'wwffRefAlertOf', 'wwffRefAlert', 'wwffRefStatsLoad',
  'wwffRefStat', 'wwffRefTip', 'wwffRefHref', 'wwffAlignColumns', 'wwffFitText'];
// nav.js statements carried for what they do rather than a name they set
const NAV_MARKERS = ['wtipcss'];   // titles drawn as styled hover chips
const NAV_MAX_BYTES = 80000;       // nav.js reshaped into one big block would fail here, not ship whole
// Text in the source that reads wrong, or says too much, outside the platform:
// [file, from, to, how many times it must be found]. A count that no longer
// matches fails the build, so a change in the source is looked at, not shipped.
const TEXT = [
  ['playercard.js', 'scored under WWFF rules', 'scored half-PPR', 2],
  ['lines.html', 'WWFF Fair Line Pick', 'Fair Line Pick', 6],
  ['lines.html', 'WWFF fair line', 'Our fair line', 1],
  ['lines.html', 'any manager can read the week again', 'anyone can read the week again', 1],
  // the column naming which league team holds a man: never filled here (the
  // rosters are the league's), so it comes out whole, cells and heading
  ['injuries.html', "    ['wwff', 'WWFF', r => wwffShort(r)],\n", '', 2],
  ['injuries.html', ' + wwffCell(r)', '', 2],
  ['depth-charts.html', "+ (S.det ? '<span class=\"ow\">' + (I() && I().ownerChip ? I().ownerChip(r.pid) : '') + '</span>' : '')", '', 1],
  ['depth-charts.html', '<span>WWFF</span>', '', 1],
  ['depth-charts.html', 'minmax(0,1fr) 96px 160px 108px', 'minmax(0,1fr) 160px 108px', 3],
];
// static data the pages fetch by path; resources.json is cut to the one key read
const DATA_FILES = ['odds-games.json', 'odds-history.json', 'def-starters.json', 'sleeper-injuries.json',
  'refs.json', 'player-stats.json', 'player-values.json'];
const ASSETS = ['assets/refs/vinovich.jpg', 'assets/refs/torbert.jpg'];

// ---- helpers -----------------------------------------------------------------
const read = (p) => readFileSync(p, 'utf8');
function put(rel, text) {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}
function readJson(p) {
  try { return JSON.parse(read(p)); } catch (e) { fail('cannot read ' + relative(SOURCE, p) + ': ' + e.message); }
}
// the platform's name, in every case it is written
const rename = (s) => s.replace(/wwff/g, 'sa').replace(/Wwff/g, 'Sa').replace(/WWFF/g, 'SA');
async function minJs(code, where) {
  try {
    const r = await transform(code, { loader: 'js', minifyWhitespace: true, legalComments: 'none', charset: 'utf8' });
    return r.code.trim();
  } catch (e) { fail('could not minify ' + where + ': ' + e.message); }
}
async function minCss(code, where) {
  try {
    const r = await transform(code, { loader: 'css', minifyWhitespace: true, legalComments: 'none', charset: 'utf8' });
    return r.code.trim();
  } catch (e) { fail('could not minify ' + where + ': ' + e.message); }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** the element that opens at `at`, through its matching close (divs counted) */
function balancedDiv(html, at) {
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = at;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) { return re.lastIndex; }
  }
  return -1;
}

// ---- navlite.js: the drawing helpers, out of nav.js ----------------------------
function navlite() {
  const src = read(join(SITE, 'nav.js'));
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  const body = ast.body;
  // what each top-level statement sets on window, and the top-level names it declares
  const sets = body.map((st) => {
    const out = new Set();
    walk.full(st, (n) => {
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed
        && n.left.object.type === 'Identifier' && n.left.object.name === 'window') { out.add(n.left.property.name); }
    });
    return out;
  });
  const declares = body.map((st) => {
    if (st.type === 'FunctionDeclaration') { return [st.id.name]; }
    if (st.type === 'VariableDeclaration') { return st.declarations.map((d) => d.id.name).filter(Boolean); }
    return [];
  });
  const owner = {};
  declares.forEach((names, i) => names.forEach((n) => { owner[n] = i; }));
  const want = new Set();
  for (const name of NAV_NAMES) {
    const hits = sets.map((s, i) => (s.has(name) ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) { fail('nav.js: expected one statement setting window.' + name + ', found ' + hits.length); }
    want.add(hits[0]);
  }
  for (const mark of NAV_MARKERS) {
    const hits = body.map((st, i) => (src.slice(st.start, st.end).includes(mark) ? i : -1)).filter((i) => i >= 0);
    if (hits.length !== 1) { fail('nav.js: expected one statement holding "' + mark + '", found ' + hits.length); }
    want.add(hits[0]);
  }
  // the top-level names a carried statement reads come with it
  let grew = true;
  while (grew) {
    grew = false;
    for (const i of [...want]) {
      walk.full(body[i], (n) => {
        if (n.type === 'Identifier' && owner[n.name] !== undefined && !want.has(owner[n.name])) {
          want.add(owner[n.name]);
          grew = true;
        }
      });
    }
  }
  const code = [...want].sort((a, b) => a - b).map((i) => src.slice(body[i].start, body[i].end)).join('\n');
  if (code.length > NAV_MAX_BYTES) { fail('navlite.js would be ' + code.length + ' bytes; nav.js has changed shape, look before raising NAV_MAX_BYTES'); }
  return '/* The drawing helpers of the platform\'s site script, lifted out of it unchanged. */\n' + code;
}

// ---- a page ------------------------------------------------------------------
async function page(p) {
  const html = sources[p.file];
  const headEnd = html.indexOf('</head>');
  const bodyAt = html.indexOf('<body>');
  if (headEnd < 0 || bodyAt < headEnd) { fail(p.file + ': no plain <head> and <body>'); }
  // the head: this site's, with the page's own styles
  const styles = [...html.slice(0, headEnd).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  if (!styles.length) { fail(p.file + ': no styles in the head'); }
  let body = html.slice(bodyAt + '<body>'.length, html.lastIndexOf('</body>'));

  // the platform's header becomes this site's bar
  const tops = [...body.matchAll(/<div class="topbar">/g)];
  if (tops.length !== 1) { fail(p.file + ': expected one topbar, found ' + tops.length); }
  const end = balancedDiv(body, tops[0].index);
  if (end < 0) { fail(p.file + ': the topbar does not close'); }
  const bar = '<div id="sa-bar"><a class="home" href="' + p.home + '">&larr; Spatacco Analytics</a>'
    + PAGES.map((q) => '<a href="' + q.file + '"' + (q.file === p.file ? ' aria-current="page"' : '') + '>' + esc(q.name) + '</a>').join('')
    + '<span class="sp"></span><button class="themebtn" id="themebtn" type="button" onclick="toggleTheme()" title="Light or dark"></button></div>';
  body = body.slice(0, tops[0].index) + bar + body.slice(end);

  // its scripts: the known ones kept, nav.js swapped for navlite.js
  const seen = new Set();
  body = body.replace(/<script src="([^"]+)"><\/script>/g, (all, src) => {
    seen.add(src);
    if (src === 'nav.js') { return ['navlite.js'].concat(AFTER_NAV[p.file] || []).map((s) => '<script src="' + s + '"></script>').join(''); }
    if (DROPPED.includes(src)) { return ''; }
    if (MODULES.includes(src)) { return all; }
    fail(p.file + ': loads ' + src + ', which this build does not know');
  });
  if (!seen.has('nav.js')) { fail(p.file + ': nav.js is not loaded where expected'); }
  if (/<script\b/i.test(body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''))) {
    fail(p.file + ': a script tag this build cannot read');
  }

  // comments out, inline scripts and styles minified
  const parts = [];
  let last = 0;
  for (const m of body.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    parts.push({ html: body.slice(last, m.index) });
    parts.push({ tag: m[1].toLowerCase(), attrs: m[2], code: m[3] });
    last = m.index + m[0].length;
  }
  parts.push({ html: body.slice(last) });
  let out = '';
  for (const x of parts) {
    if (x.html !== undefined) { out += x.html.replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*\n+/g, '\n'); continue; }
    if (x.tag === 'style') { out += '<style' + x.attrs + '>' + (await minCss(x.code, p.file)) + '</style>'; continue; }
    const src = /\bsrc="([^"]+)"/.exec(x.attrs);
    if (src) {
      if (!MODULES.includes(src[1]) && src[1] !== 'navlite.js') { fail(p.file + ': loads ' + src[1] + ', which this build does not know'); }
      out += '<script' + x.attrs + '></script>';
      continue;
    }
    if (!x.code.trim()) { continue; }
    if (/\btype=/.test(x.attrs)) { fail(p.file + ': a typed inline script (' + x.attrs.trim() + ')'); }
    out += '<script>' + (await minJs(x.code, p.file)) + '</script>';
  }
  const css = (await Promise.all(styles.map((s) => minCss(s, p.file + ' head')))).join('\n');
  const head = '<!DOCTYPE html>\n<html lang="en"><head>\n<meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n'
    + '<title>' + esc(p.name) + ' · Spatacco Analytics</title>\n'
    + '<meta name="description" content="' + esc(p.desc) + '">\n'
    + '<meta name="robots" content="noindex">\n'
    + '<link rel="canonical" href="https://spataccoanalytics.com' + p.home + '">\n'
    + '<link rel="icon" href="/favicon.ico">\n'
    + '<script src="shim.js"></script>\n<style>' + css + '</style>\n</head>\n<body>';
  return rename(head + out.trim() + '\n</body></html>\n');
}

// ---- data --------------------------------------------------------------------
function data() {
  const n = { files: 0 };
  const dataDir = join(SITE, 'data');
  for (const f of DATA_FILES) {
    const d = readJson(join(dataDir, f));
    put('data/' + f, JSON.stringify(d));
    n.files++;
  }
  // Depth Charts reads one key of the resources list: ESPN's chart for each club
  const res = readJson(join(dataDir, 'resources.json'));
  if (!Array.isArray(res.depth) || !res.depth.length) { fail('resources.json has no depth list'); }
  put('data/resources.json', JSON.stringify({ depth: res.depth }));
  // the platform's depth_chart answer, as a file
  const dc = readJson(join(SITE, 'private', 'depth-chart.json'));
  if (!dc.players || Object.keys(dc.players).length < 1000) { fail('the depth chart holds too few players'); }
  put('data/depth_chart.json', JSON.stringify({ ok: true, players: dc.players, bios: dc.bios || {},
    updated: dc.updated || null, source: dc.source || null }));
  // madden_index, whole and lite, as the platform answers them
  const mi = readJson(join(SITE, 'private', 'madden-index.json'));
  if (!mi.players || Object.keys(mi.players).length < 1000) { fail('the Madden index holds too few players'); }
  put('data/madden_index.json', JSON.stringify(Object.assign({ ok: true }, mi)));
  const lite = {};
  for (const [k, r] of Object.entries(mi.players)) {
    if (!r || typeof r !== 'object') { continue; }
    const o = {};
    for (const f of ['o', 'd', 'x', 'p']) { if (r[f] !== undefined && r[f] !== null && r[f] !== 0 && r[f] !== '') { o[f] = r[f]; } }
    if (o.o === undefined) { o.o = r.o === undefined ? null : r.o; }
    lite[k] = o;
  }
  const meta = Object.assign({}, mi);
  delete meta.players; delete meta.impact;
  put('data/madden_index_lite.json', JSON.stringify(Object.assign({ ok: true, lite: true }, meta, { players: lite })));
  // madden_player: a file a man, and what every answer shares once
  const md = readJson(join(SITE, 'private', 'madden.json'));
  if (!md.players || Object.keys(md.players).length < 1000) { fail('the Madden ratings hold too few players'); }
  put('data/madden/meta.json', JSON.stringify({ iteration: md.iteration || null, updated: md.updated || null,
    game: md.game || null, stats: md.stats || {}, groups: md.groups || [], keys: md.keys || {}, impact: md.impact || {} }));
  for (const [pid, one] of Object.entries(md.players)) {
    if (!/^\d{1,16}$/.test(pid)) { continue; }
    put('data/madden/' + pid + '.json', JSON.stringify({ player: one }));
  }
  for (const a of ASSETS) {
    const p = join(OUT, a);
    mkdirSync(dirname(p), { recursive: true });
    copyFileSync(join(SITE, a), p);
  }
  return { madden: Object.keys(md.players).length, depth: Object.keys(dc.players).length };
}

// ---- the check ---------------------------------------------------------------
function denylist() {
  const cfg = readJson(join(ROOT, 'config', 'hosting.json')).denylist || [];
  const extra = (process.env.COPY_DENYLIST || '').split(',').map((s) => s.trim()).filter(Boolean);
  // the platform's name in any form, even inside a word, after the rename
  return [...new Set([...cfg, ...extra, 'wwff'])].map((p) => new RegExp(p, 'i'));
}
function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
function check() {
  const deny = denylist();
  const bad = [];
  // a data file is read for its words, and for the ids in it, which these files
  // write as keys or all-digit strings; a number is a statistic (a sum of
  // points can be any six digits), and a digit run inside a time is a time
  const walkJson = (v, words, ids) => {
    if (typeof v === 'string') { words.push(v); if (/^\d+$/.test(v)) { ids.push(v); } }
    else if (Array.isArray(v)) { v.forEach((x) => walkJson(x, words, ids)); }
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) { words.push(k); if (/^\d+$/.test(k)) { ids.push(k); } walkJson(x, words, ids); }
    }
  };
  for (const p of files(OUT)) {
    const rel = relative(OUT, p);
    if (/\.(jpg|png|ico)$/.test(p)) { continue; }
    const text = read(p);
    let words = text, ids = text;
    if (p.endsWith('.json')) {
      const w = [], i = [];
      walkJson(JSON.parse(text), w, i);
      words = w.join('\n'); ids = i.join('\n');
    }
    for (const re of deny) {
      const hay = /\\d/.test(re.source) ? ids : words;
      const m = re.exec(hay);
      if (m) { bad.push(rel + ': ' + re.source + ' near "' + hay.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).replace(/\s+/g, ' ') + '"'); }
    }
  }
  if (bad.length) { fail('denylisted text in the build:\n  ' + bad.slice(0, 40).join('\n  ') + (bad.length > 40 ? '\n  ...' : '')); }
}

// ---- run -----------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const sources = {};
for (const m of MODULES) { sources[m] = read(join(SITE, m)); }
for (const p of PAGES) { sources[p.file] = read(join(SITE, p.file)); }
for (const [file, from, to, times] of TEXT) {
  const found = sources[file] === undefined ? 0 : sources[file].split(from).length - 1;
  if (found !== times) { fail(file + ': expected "' + from + '" ' + times + ' time(s), found ' + found); }
  sources[file] = sources[file].split(from).join(to);
}
for (const m of MODULES) { put(m, rename(await minJs(sources[m], m))); }
put('navlite.js', rename(await minJs(navlite(), 'navlite.js')));
put('shim.js', rename(await minJs(read(join(HERE, 'shim.js')), 'shim.js')));
copyFileSync(join(HERE, 'feed.php'), join(OUT, 'feed.php'));
for (const p of PAGES) { put(p.file, await page(p)); }
const counts = data();
check();
const total = files(OUT).reduce((a, p) => a + statSync(p).size, 0);
console.log('built ' + PAGES.length + ' pages, ' + counts.depth + ' charted players, ' + counts.madden + ' Madden ratings, '
  + files(OUT).length + ' files, ' + (total / 1048576).toFixed(1) + ' MB in ' + relative(process.cwd(), OUT));
