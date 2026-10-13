#!/usr/bin/env node
// Opens the built public editions in a real browser before they ship, and
// fails if one breaks: an uncaught error, a page that draws nothing, a call
// that reaches for the source platform's API instead of the shim, or a
// request to a host on the denylist.
//
//   node live/smoke.mjs --live dist/tools/football/live [--fixtures DIR] [--shots DIR]
//
// The built files are copied into a scratch web root and served by PHP's own
// server, feed.php included, with a stand-in for the source answering the
// relay: small made-up answers by default, or the files in --fixtures
// (odds_get.json, odds_ticks.json, injuries.json, referees.json) when given.
// Each page is opened on its own (the full-screen view) and inside a frame
// (the tool page's view). Env: CHROMIUM (executable), COPY_DENYLIST.

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const LIVE = resolve(arg('live', 'dist/tools/football/live'));
const FIX = arg('fixtures', '');
const SHOTS = arg('shots', '');
if (!existsSync(join(LIVE, 'lines.html'))) { console.error('smoke: no build at ' + LIVE); process.exit(2); }
const DENY = (process.env.COPY_DENYLIST || '').split(',').map((s) => s.trim()).filter(Boolean)
  .filter((p) => !/\\d/.test(p)).map((p) => new RegExp(p, 'i'));

// ---- a scratch web root, the relay's config beside it --------------------------
const T = mkdtempSync(join(tmpdir(), 'sa-smoke-'));
const WWW = join(T, 'www');
mkdirSync(join(WWW, 'tools', 'football'), { recursive: true });
cpSync(LIVE, join(WWW, 'tools', 'football', 'live'), { recursive: true });
const SRC_PORT = 18741, WEB_PORT = 18742;
writeFileSync(join(T, 'sa-feed.json'), JSON.stringify({ base: 'http://127.0.0.1:' + SRC_PORT + '/' }));
for (const p of ['lines.html', 'injuries.html', 'depth-charts.html']) {
  writeFileSync(join(WWW, 'frame-' + p), '<!DOCTYPE html><html><body style="margin:0">'
    + '<iframe id="f" src="/tools/football/live/' + p + '" style="width:1200px;height:900px;border:0"></iframe></body></html>');
}

// the stand-in source: what the relay passes on, nothing else
const SRC = join(T, 'source');
mkdirSync(SRC);
const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const MADE_UP = {
  odds_get: { ok: true, weeks: [] },
  odds_ticks: { ok: true, ticks: {} },
  referees: { ok: true, games: {} },
  injuries: { ok: true, read_at: now, events: [], players: [
    { espn_id: '1', pid: '1', name: 'Test Receiver', pos: 'WR', team: 'PHI', status: 'Questionable', abbr: 'Q',
      injury: 'Hamstring', note: 'Limited in practice.', at: now, since: now, key: true, big: false },
    { espn_id: '2', pid: '2', name: 'Test Linebacker', pos: 'LB', team: 'DAL', status: 'Out', abbr: 'O',
      injury: 'Knee', note: 'Ruled out.', at: now, since: now, key: false, big: false }] },
};
for (const [a, d] of Object.entries(MADE_UP)) {
  const f = FIX && existsSync(join(FIX, a + '.json')) ? readFileSync(join(FIX, a + '.json'), 'utf8') : JSON.stringify(d);
  writeFileSync(join(SRC, a + '.json'), f);
}
writeFileSync(join(SRC, 'api.php'), `<?php
header('Content-Type: application/json');
$a = preg_replace('/[^a-z_]/', '', (string)($_GET['action'] ?? ''));
$f = __DIR__ . '/' . $a . '.json';
if ($a === '' || !is_file($f)) { http_response_code(404); echo '{"ok":false}'; exit; }
echo file_get_contents($f);
`);

const procs = [];
function serve(port, dir) {
  const p = spawn('php', ['-S', '127.0.0.1:' + port, '-t', dir], { stdio: 'ignore' });
  procs.push(p);
}
serve(SRC_PORT, SRC);
serve(WEB_PORT, WWW);
// the servers keep this process alive, so every way out takes them down
const cleanup = () => { procs.forEach((p) => p.kill()); rmSync(T, { recursive: true, force: true }); };
const done = (code) => { cleanup(); process.exit(code); };
for (let i = 0; i < 50; i++) {
  try { const r = await fetch('http://127.0.0.1:' + WEB_PORT + '/frame-lines.html'); if (r.ok) { break; } } catch (e) { /* not up yet */ }
  await sleep(100);
}

// ---- the pages -------------------------------------------------------------------
const BASE = 'http://127.0.0.1:' + WEB_PORT;
const CHECKS = {
  'lines.html': async (f) => {
    const n = await f.locator('#detail tr, #detail .empty, #detail .gm').count();
    return n > 0 ? '' : 'the week\'s games were not drawn';
  },
  'injuries.html': async (f) => {
    const txt = (await f.locator('body').innerText()).trim();
    return /Test Receiver|Questionable|nobody|no one|No /i.test(txt) ? '' : 'the report was not drawn';
  },
  'depth-charts.html': async (f) => {
    if (await f.locator('#lemail').count()) { return 'the sign-in form was drawn instead of the charts'; }
    const rooms = await f.locator('.rm').count();
    if (rooms < 32) { return 'only ' + rooms + ' rooms drawn'; }
    const badges = await f.locator('.mdnb').count();
    return badges > 0 ? '' : 'no Madden ratings on the charts';
  },
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
const problems = [];
for (const [file, check] of Object.entries(CHECKS)) {
  for (const mode of ['full', 'framed']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('error: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/i.test(m.text())) { errs.push('console: ' + m.text()); }
    });
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (/\/api\.php$/.test(u.pathname)) { errs.push('reached for the platform API: ' + u.pathname + u.search); }
      if (DENY.some((re) => re.test(u.hostname))) { errs.push('request to a denylisted host'); }
    });
    // the outside world is not needed (logos, headshots): answered empty, fast
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 204, body: '' }));
    const url = mode === 'full' ? BASE + '/tools/football/live/' + file : BASE + '/frame-' + file;
    // the pages poll, so the network never goes quiet: load, then a moment to draw
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await sleep(3000);
    const f = mode === 'full' ? page : page.frameLocator('#f');
    const why = await check(f);
    if (why) { errs.push(why); }
    if (mode === 'framed') {
      const frame = page.frames().find((x) => x.url().endsWith('/' + file));
      const embed = frame ? await frame.evaluate(() => document.documentElement.classList.contains('sa-embed')) : false;
      if (!embed) { errs.push('the framed page does not know it is framed'); }
      const barShown = frame ? await frame.evaluate(() => { const b = document.getElementById('sa-bar'); return !!b && b.offsetHeight > 0; }) : true;
      if (barShown) { errs.push('the full-screen bar shows inside the frame'); }
    } else {
      const bar = await page.locator('#sa-bar a.home').count();
      if (!bar) { errs.push('no way home in the full-screen view'); }
    }
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, file.replace('.html', '') + '-' + mode + '.png'), fullPage: mode === 'full' });
    }
    console.log((errs.length ? 'FAIL ' : 'ok   ') + mode.padEnd(7) + file + (errs.length ? '\n       ' + [...new Set(errs)].join('\n       ') : ''));
    if (errs.length) { problems.push(file + ' ' + mode); }
    await ctx.close();
  }
}
await browser.close();
if (problems.length) { console.error('smoke: ' + problems.length + ' page view(s) failed'); done(1); }
console.log('smoke: every page drew, framed and full screen');
done(0);
