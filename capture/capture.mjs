// Takes the showcase screenshots. Never signs in to the source platform and
// never writes to it.
//
//   depth  : the source repo's depth chart page, rendered locally from its own
//            code and data files (php -S with capture/stub_api.php), with the
//            Madden badges switched on.
//   lines  : the live Lines Tracker, signed out, opened on the most recent
//            played game so the shot shows its line from open to close.
//   injury : the live Injuries page, signed out.
//
// Env: SOURCE_SITE_DIR (checkout's site/ directory), SOURCE_SITE_URL (live base
// URL), OUT_DIR (default build/shots), ONLY (comma list), CHROMIUM (executable,
// optional), DEPTH_TEAM (default PHI), COPY_DENYLIST (comma-separated regular
// expressions cut out of every visible label before a shot).
// A shot that fails is reported and skipped; the build then keeps the
// committed baseline image for it, so the site never shows a broken capture.

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT_DIR || 'build/shots';
const ONLY = (process.env.ONLY || 'depth,lines,injury').split(',').map(s => s.trim()).filter(Boolean);
const SITE_DIR = process.env.SOURCE_SITE_DIR || '';
const SITE_URL = (process.env.SOURCE_SITE_URL || '').replace(/\/?$/, '/');
const DENY = (process.env.COPY_DENYLIST || '').split(',').map(s => s.trim()).filter(Boolean);
const PORT = 8099;
mkdirSync(OUT, { recursive: true });

// Hidden in every shot: the platform's own header and footer marks, pop-ups,
// tips, and any column that says which league team holds a player.
const PUBLIC_ONLY_CSS = `
  .topbar, #sa-mark, .wwfoot, #toast, .disc, .lpop, .wtip, #fopop, .wwfftip, #wwfftip { display:none !important }
  .rm li .ow, .rm li .own, .wwown, .ownchip { display:none !important }
`;

// Runs in the page before its own scripts, and again on every redraw: cuts
// the private names out of visible text so a label like "<name> Fair Line
// Pick" reads "Fair Line Pick", and hides the tip pop-ups as they appear.
function initScript(deny, css) {
  return `(() => {
    const rx = ${JSON.stringify(deny)}.map(p => new RegExp(p, 'gi'));
    const fix = root => {
      if (!rx.length || !root) return;
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        let t = n.nodeValue, hit = false;
        for (const r of rx) { r.lastIndex = 0; if (r.test(t)) { r.lastIndex = 0; t = t.replace(r, ''); hit = true; } }
        if (hit) n.nodeValue = t.replace(/\\s{2,}/g, ' ').replace(/^\\s+(?=\\S)/, '');
      }
    };
    const start = () => {
      const st = document.createElement('style'); st.textContent = ${JSON.stringify(css)};
      document.head.appendChild(st);
      fix(document.body);
      new MutationObserver(ms => { for (const m of ms) fix(m.target.nodeType === 1 ? m.target : m.target.parentNode); })
        .observe(document.body, { subtree: true, childList: true, characterData: true });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  })();`;
}

async function newPage(browser, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.addInitScript({ content: initScript(DENY, PUBLIC_ONLY_CSS) });
  return page;
}

async function settle(page, ms = 2500) {
  // The pages poll in the background, so the network never goes fully idle.
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  await sleep(ms);
}

async function hideLeaves(page, re) {
  await page.evaluate(src => {
    const rx = new RegExp(src, 'i');
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length === 0 && rx.test(el.textContent || '')) el.style.display = 'none';
    }
  }, re.source);
}

// Absolute page coordinates of the union of some elements.
async function pageBox(page, selectors) {
  return page.evaluate(sels => {
    const rs = sels.map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect());
    if (!rs.length) return null;
    const x = Math.min(...rs.map(r => r.left)), y = Math.min(...rs.map(r => r.top));
    const r = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
    return { x: x + scrollX, y: y + scrollY, width: r - x, height: b - y };
  }, selectors);
}

async function depth(browser) {
  if (!SITE_DIR || !existsSync(join(SITE_DIR, 'depth-charts.html'))) throw new Error('SOURCE_SITE_DIR has no depth-charts.html');
  const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', SITE_DIR, join(HERE, 'stub_api.php')],
    { env: { ...process.env, SOURCE_SITE_DIR: SITE_DIR }, stdio: 'ignore' });
  try {
    await sleep(800);
    const page = await newPage(browser, 1360, 900);
    const team = process.env.DEPTH_TEAM || 'PHI';
    await page.goto(`http://127.0.0.1:${PORT}/depth-charts.html?team=${team}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#out .grid > *', { timeout: 30000 });
    await settle(page, 1500);
    // The badges are normally loaded for one account only; load them here.
    await page.addScriptTag({ url: `http://127.0.0.1:${PORT}/madden.js` });
    await settle(page, 2500);
    await page.addStyleTag({ content: `
      #out.det .rm li, #out.det .rm ol.df li { grid-template-columns:12px minmax(0,1fr) 160px 108px !important }
      #out.det .rm ol.df li { grid-template-columns:30px minmax(0,1fr) 160px 108px !important }
      .colh .lih { grid-template-columns:12px minmax(0,1fr) 160px 108px !important }
      .colh .lih > span:nth-child(3) { display:none !important }
    ` });
    await hideLeaves(page, /Team order from Sleeper|logged in as/);
    await sleep(400);
    const badges = await page.locator('.mdnb').count();
    if (badges < 20) throw new Error(`only ${badges} rating badges drew`);
    await page.locator('#out .grid > *').first().screenshot({ path: join(OUT, 'nfl-depth-charts.png') });
    await page.close();
  } finally {
    php.kill();
  }
}

// The most recent played game on the source repo's own board file.
function latestFinal() {
  try {
    const g = JSON.parse(readFileSync(join(SITE_DIR, 'data', 'odds-games.json'), 'utf8'));
    const done = Object.values(g.weeks || {}).flat()
      .filter(x => x.status === 'complete' && x.away && x.home && x.week)
      .sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
    const last = done[done.length - 1];
    return last ? `week=${last.week}&game=${last.away}-${last.home}` : '';
  } catch { return ''; }
}

async function openLive(browser, path, readySel) {
  if (!SITE_URL || SITE_URL === '/') throw new Error('SOURCE_SITE_URL is not set');
  const page = await newPage(browser, 1360, 1000);
  const res = await page.goto(SITE_URL + path, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!res || res.status() >= 400) throw new Error(`${path} answered ${res && res.status()}`);
  // The host answers new visitors with a bot check that a real browser passes
  // on its own and then redirects back; wait for the page itself.
  await page.waitForSelector(readySel, { timeout: 60000 });
  await settle(page, 4000);
  await hideLeaves(page, /logged in as|sign in to refresh/);
  return page;
}

async function lines(browser) {
  const q = latestFinal();
  const page = await openLive(browser, 'lines.html' + (q ? '?' + q : ''), '#pane-games tr');
  // A played game sits in the week's folded "final" group; open it so the
  // game the link names, and its chart, are drawn.
  await page.evaluate(() => { if (!document.querySelector('tr.chartrow') && typeof toggleDone === 'function') toggleDone(); });
  await page.waitForSelector('tr.grow.open + tr.chartrow svg', { timeout: 30000 });
  await settle(page, 1500);
  await page.evaluate(() => document.querySelector('tr.grow.open').scrollIntoView({ block: 'start' }));
  await sleep(500);
  const box = await pageBox(page, ['tr.grow.open', 'tr.grow.open + tr.chartrow']);
  if (!box || box.height < 150) throw new Error('the game chart did not draw');
  await page.screenshot({ path: join(OUT, 'nfl-lines-tracker.png'), clip: box, fullPage: true });
  await page.close();
}

async function injury(browser) {
  const page = await openLive(browser, 'injuries.html', '#out');
  const rows = await page.locator('#out tr').count();
  if (rows < 5) throw new Error(`injuries drew only ${rows} rows`);
  const box = await pageBox(page, ['#bar', '#out']);
  box.height = Math.min(box.height, 1100);
  await page.screenshot({ path: join(OUT, 'nfl-injury-tracker.png'), clip: box, fullPage: true });
  await page.close();
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
const jobs = { depth, lines, injury };
let failed = 0;
for (const name of ONLY) {
  try { await jobs[name](browser); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`skip ${name}: ${e.message.split('\n')[0]}`); }
}
await browser.close();
console.log(`${ONLY.length - failed} of ${ONLY.length} shots taken`);
