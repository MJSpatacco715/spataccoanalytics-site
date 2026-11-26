// The first screen of the inner pages, opened in a real browser. Run by
// tests/pages_test.sh (where Playwright is installed) against the built site:
//   node tests/hero_browser.cjs http://127.0.0.1:PORT
// Two things the owner asked for on 2026-11-26:
//   - "services page is all talk and no service options on first screen": the four
//     services are on the Services page's first screen, each going to its own part;
//   - "as a standard I'd like the blue response hero text to be on its own line".
const { chromium } = require('playwright');
const base = process.argv[2];
const fails = []; let n = 0;
function check(name, pass) { n++; if (!pass) fails.push(name); }

// Is the blue part of the headline on a line of its own, starting at the left?
function blueLine(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector('.page-hero h1'), em = h1 && h1.querySelector('em');
    if (!em) return null;
    const first = document.createRange(); first.selectNodeContents(h1.firstChild);
    const lead = first.getClientRects(), blue = em.getClientRects();
    const lastLead = lead[lead.length - 1], lh = parseFloat(getComputedStyle(h1).lineHeight);
    return { below: blue[0].top >= lastLead.top + lh * 0.6, atLeft: Math.abs(blue[0].left - h1.getBoundingClientRect().left) < 3, blue: getComputedStyle(em).color, text: em.textContent };
  });
}

(async () => {
  const browser = await chromium.launch();

  // --- the blue line is its own line, on every page with a headline of this kind
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    for (const path of ['/services/', '/approach/', '/about/', '/tools/', '/contact/', '/insights/']) {
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForTimeout(150);
      const b = await blueLine(page);
      check(path + ' at ' + w + 'px: the blue part of the headline is on its own line, from the left edge', !!b && b.below && b.atLeft && b.blue === 'rgb(61, 216, 216)');
    }
    await ctx.close();
  }

  // --- the Services page: the four services are on the first screen
  const first = (page) => page.evaluate(() => {
    const opts = [...document.querySelectorAll('.page-hero .sv-pick a')].map((a) => { const r = a.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, name: a.querySelector('.sv-pick-name').textContent, to: a.getAttribute('href') }; });
    const h1 = document.querySelector('.page-hero h1').getBoundingClientRect(), nav = document.getElementById('main-nav').getBoundingClientRect();
    return { opts, h1, navBottom: nav.bottom, vh: window.innerHeight, vw: window.innerWidth, pageWide: document.documentElement.scrollWidth <= window.innerWidth };
  });
  // 1255 x 607 is the owner's own window: a 1880px screen at 150%.
  for (const [w, h] of [[1255, 607], [1366, 657], [1440, 900], [1920, 1080]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(base + '/services/', { waitUntil: 'load' });
    await page.waitForTimeout(1700);        // the opening animation
    const f = await first(page);
    check('/services/ at ' + w + ' by ' + h + ': all four services are on the first screen, whole, under the menu', f.opts.length === 4 && f.opts.every((o) => o.top >= f.navBottom && o.bottom <= f.vh && o.left >= 0 && o.right <= f.vw));
    check('/services/ at ' + w + ' by ' + h + ': they sit beside the headline, to its right, and the headline is whole too', f.opts.every((o) => o.left >= f.h1.right - 1) && f.h1.top >= f.navBottom && f.h1.bottom <= f.vh);
    if (w === 1255) {
      check('they are the four services, in the page\'s order', f.opts.map((o) => o.name + '>' + o.to).join('|') === 'Website & AI Audit>#audit|Website Design>#design|CRM Diagnostic & Repair>#crm|Managed Hosting>#hosting');
      for (const o of f.opts) {
        await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0); });
        await page.click('.page-hero .sv-pick a[href="' + o.to + '"]');
        await page.waitForTimeout(250);
        const at = await page.evaluate((id) => { const r = document.querySelector(id).getBoundingClientRect(); return { top: r.top, nav: document.getElementById('main-nav').getBoundingClientRect().bottom, vh: window.innerHeight }; }, o.to);
        check('choosing ' + o.name + ' brings its part of the page up, clear of the menu', at.top >= at.nav - 1 && at.top < at.vh * 0.5);
      }
    }
    await ctx.close();
  }
  for (const [w, h] of [[390, 844], [375, 667]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(base + '/services/', { waitUntil: 'load' });
    await page.waitForTimeout(1700);
    const f = await first(page);
    check('/services/ on a ' + w + ' by ' + h + ' phone: all four services are on the first screen, under the headline, and the page is no wider', f.opts.length === 4 && f.opts.every((o) => o.top >= f.h1.bottom && o.bottom <= f.vh && o.left >= 0 && o.right <= f.vw) && f.pageWide);
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' first-screen checks failed'); process.exit(1); }
  console.log('ok: ' + n + ' first-screen checks');
})().catch((e) => { if (fails.length) console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.error(String(e && e.stack || e)); process.exit(1); });
