// The pages grow with the window. Run by tests/pages_test.sh (where Playwright is
// installed) against the built site:
//   node tests/scale_browser.cjs http://127.0.0.1:PORT
// The owner, 2026-11-27, with the site at 100% beside the same page at 150%: "the site
// looks better at 150% size than 100%, there should be some adjustment. with a target
// market of 50-80 year olds I shouldn't ask people to squint". Chosen of three: match
// the 150% view. And on a phone: no text under 13px.
// How it is done is in scripts/scale_css.py. What is held here:
//   - up to the owner's own window (1255 wide) nothing is any bigger than it was;
//   - on a bigger window everything on the page is bigger by the same amount, so the
//     page is the same page, enlarged: nothing is left behind at its old size;
//   - it stops growing at 175%, and a wide, short window follows its height;
//   - a page that has not been converted (each tool's own page) is left as it was;
//   - on a phone nothing that can be read is under 13px.
// The scorer's relay is stood in for: nothing leaves the machine and no score is run.
const { chromium } = require('playwright');
const base = process.argv[2];
const fails = []; let n = 0;
function check(name, pass) { n++; if (!pass) fails.push(name); }

const PAGES = ['/', '/services/', '/approach/', '/about/', '/contact/', '/tools/', '/insights/', '/tools/website-scorer/'];
const WAS = [1255, 607];                 // the window the pages were drawn for
const rootFor = (w, h) => Math.min(28, Math.max(16, Math.min(w / 78.4375, h / 37.9375)));

const SCORED = JSON.stringify({ firm_name: 'Smith Wealth Management', summary: 'Clear site. Add proof.', pros: ['Clear headline', 'Fast'], cons: ['No proof', 'Thin team page'],
  scores: { visual_design: 9, content_messaging: 8, navigation_ux: 6, credibility_signals: 5, team_leadership: 9, contact_availability: 10 },
  notes: { visual_design: 'x', content_messaging: 'x', navigation_ux: 'x', credibility_signals: 'x', team_leadership: 'x', contact_availability: 'x' } });
const FEED = { ok: true, at: '2026-11-25T14:25:00Z', items: ['ust30', 'ust10', 'eurusd', 'btc', 'brent', 'wti'].map((id, i) => ({ id, label: 'Figure ' + (i + 1), value: '4.' + i + '2%', delta: '+0.01', dir: 'up', by: 'Publisher', when: 'Nov 25',
  card: { title: 'Figure ' + (i + 1), text: 'A figure, and where it comes from.', source: 'Publisher', url: 'https://example.com/' } })) };

// Every piece of text on the page that a visitor could read, with the size it is drawn at.
const sizes = (page) => page.evaluate(() => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (!t.nodeValue.trim()) continue;
    const e = t.parentElement;
    if (!e || seen.has(e) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(e.tagName)) continue;
    seen.add(e);
    const st = getComputedStyle(e), r = e.getBoundingClientRect();
    out.push({ px: parseFloat(st.fontSize), shown: r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.01 && !e.closest('[hidden]'),
      what: (e.className && typeof e.className === 'string' ? e.tagName.toLowerCase() + '.' + e.className.split(' ')[0] : e.tagName.toLowerCase()) + ' "' + t.nodeValue.trim().slice(0, 24) + '"' });
  }
  return { list: out, root: parseFloat(getComputedStyle(document.documentElement).fontSize), wide: document.documentElement.scrollWidth <= window.innerWidth + 1, tall: document.documentElement.scrollHeight };
});
// Where the first things on the page sit, as shares of the window: the same page enlarged keeps them.
const places = (page) => page.evaluate(() => {
  const pick = ['#main-nav', '#main-nav .logo', 'h1', '.masthead', '.hero-stat', '.stat-bar', '.hero-cta, .btn-primary, #btn-analyze', '.tl-chips', '.sv-menu, .sv-opts'];
  const out = {};
  for (const s of pick) { const e = document.querySelector(s); if (!e) continue; const r = e.getBoundingClientRect(); if (!r.width) continue; out[s] = [r.left / innerWidth, r.top / innerWidth, r.width / innerWidth, r.height / innerWidth]; }
  return out;
});

(async () => {
  const browser = await chromium.launch();
  const open = async (w, h, path, mobile) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: !!mobile, isMobile: !!mobile });
    const page = await ctx.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.route(/\/market\/feed\.php/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(FEED) }));
    await page.route(/ria-scorer\.[a-z-]+\.workers\.dev/, (route) => route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
      : route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: SCORED }] }) }));
    await page.route(/\/score\/lead\.php|\/services\/pricing\.php/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.goto(base + path, { waitUntil: 'load' });
    await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition:none !important}.reveal{opacity:1 !important;transform:none !important}' });
    await page.waitForTimeout(250);
    return { ctx, page };
  };

  // --- the rule itself: no bigger up to the owner's window, then in step with it, to a stop
  for (const [w, h, says] of [[800, 900, 'a narrow window'], [1024, 700, 'a small laptop'], [1255, 607, 'the owner\'s window'], [1255, 1200, 'the same width, taller'], [1440, 900, 'a laptop'], [1880, 910, 'the owner\'s screen at 100%'],
    [1920, 1080, 'a full HD screen'], [2560, 1440, 'a large screen: it stops at 175%'], [3840, 2160, 'a very large one'], [1920, 700, 'wide but short: it follows the height']]) {
    const { ctx, page } = await open(w, h, '/services/');
    const got = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    check(says + ' (' + w + ' by ' + h + '): the page is drawn at ' + (rootFor(w, h) / 16 * 100).toFixed(0) + '% (it is ' + (got / 16 * 100).toFixed(0) + '%)', Math.abs(got - rootFor(w, h)) < 0.02);
    await ctx.close();
  }
  check('the owner\'s screen at 100% shows the page as the owner\'s 150% did: within half a percent', Math.abs(rootFor(1880, 910) / 16 - 1.5) < 0.0075);

  // --- every page: on a big screen it is the same page enlarged, with nothing left behind
  for (const path of PAGES) {
    const a = await open(WAS[0], WAS[1], path); const was = await sizes(a.page), wasAt = await places(a.page); await a.ctx.close();
    const b = await open(1880, 910, path); const now = await sizes(b.page), nowAt = await places(b.page); await b.ctx.close();
    const by = now.root / was.root;
    check(path + ': drawn at 100% in the owner\'s window and about 150% on the owner\'s screen (' + (was.root / 16 * 100).toFixed(0) + '%, ' + (now.root / 16 * 100).toFixed(0) + '%)', was.root === 16 && Math.abs(by - 1.498) < 0.01);
    const left = [];
    if (was.list.length === now.list.length) was.list.forEach((x, i) => { const y = now.list[i]; if (Math.abs(y.px / x.px - by) > 0.02) left.push(y.what + ' ' + x.px + ' to ' + y.px); });
    check(path + ': every piece of text is bigger by that same amount, none left at its old size (' + now.list.length + ' pieces; not: ' + left.slice(0, 4).join('; ') + ')', was.list.length === now.list.length && now.list.length > 10 && left.length === 0);
    const moved = Object.keys(wasAt).filter((k) => !nowAt[k] || wasAt[k].some((v, i) => Math.abs(v - nowAt[k][i]) > 0.012));
    check(path + ': the first screen is laid out the same, only larger (moved: ' + moved.join(', ') + ')', Object.keys(wasAt).length >= 2 && moved.length === 0);
    check(path + ': the page is no wider than the screen, and about one and a half times as long (' + was.tall + ' to ' + now.tall + ')', now.wide && Math.abs(now.tall / was.tall - by) < 0.03);
  }

  // --- the scorer's results are written by its script: they grow too
  {
    const run = async (w, h) => {
      const { ctx, page } = await open(w, h, '/tools/website-scorer/?scope=website');
      await page.fill('#inp-website', 'smithwealth.example');
      await page.click('#btn-analyze');
      await page.waitForFunction(() => { const g = document.getElementById('gate-modal') || document.querySelector('.modal-overlay'); return !!document.querySelector('.cat-card') || (g && !g.classList.contains('hidden')); }, null, { timeout: 8000 }).catch(() => {});
      // the full breakdown opens on a name and an email: given here, sent nowhere (the lead endpoint is stood in for)
      if (await page.locator('#gate-name').isVisible().catch(() => false)) {
        await page.fill('#gate-name', 'Test Visitor'); await page.fill('#gate-email', 'visitor@example.com'); await page.fill('#gate-firm', 'Example Firm').catch(() => {});
        await page.click('#btn-gate-submit');
      }
      await page.waitForSelector('.cat-card', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(300);
      const s = await sizes(page); await ctx.close(); return s;
    };
    const was = await run(WAS[0], WAS[1]), now = await run(1880, 910);
    const by = now.root / was.root, left = [];
    if (was.list.length === now.list.length) was.list.forEach((x, i) => { const y = now.list[i]; if (Math.abs(y.px / x.px - by) > 0.02) left.push(y.what + ' ' + x.px + ' to ' + y.px); });
    check('the scorer\'s results, which its script writes, grow with the rest (' + now.list.length + ' pieces; not: ' + left.slice(0, 4).join('; ') + ')', was.list.length === now.list.length && now.list.some((x) => /cat-card/.test(x.what)) && left.length === 0);
  }

  // --- a page that has not been converted is left exactly as it was
  {
    const { ctx, page } = await open(1880, 910, '/tools/football/nfl-lines-tracker/');
    const m = await page.evaluate(() => ({ root: parseFloat(getComputedStyle(document.documentElement).fontSize), nav: document.getElementById('main-nav').offsetHeight, link: parseFloat(getComputedStyle(document.querySelector('#main-nav .nav-links a')).fontSize) }));
    check('a tool\'s own page, not converted yet, is drawn as it always was: no big menu over small text (menu ' + m.nav + 'px, its links ' + m.link + 'px)', m.root === 16 && m.nav <= 80 && m.link === 14);
    await ctx.close();
  }

  // --- a phone: nothing a visitor can read is under 13px
  for (const [w, h] of [[430, 744], [390, 664], [360, 640]]) {
    for (const path of PAGES) {
      const { ctx, page } = await open(w, h, path, true);
      const s = await sizes(page);
      const small = s.list.filter((x) => x.shown && x.px < 12.99).map((x) => x.what + ' ' + x.px);
      check(path + ' at ' + w + ' by ' + h + ': no text under 13px (not: ' + small.slice(0, 5).join('; ') + ')', s.root === 16 && small.length === 0);
      check(path + ' at ' + w + ' by ' + h + ': the page is no wider than the phone', s.wide);
      await ctx.close();
    }
  }

  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' size checks failed'); process.exit(1); }
  console.log('ok: ' + n + ' size checks');
})().catch((e) => { if (fails.length) console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.error(String(e && e.stack || e)); process.exit(1); });
