// The first screen of the inner pages, opened in a real browser. Run by
// tests/pages_test.sh (where Playwright is installed) against the built site:
//   node tests/hero_browser.cjs http://127.0.0.1:PORT
// Two things the owner asked for on 2026-11-26:
//   - "services page is all talk and no service options on first screen": the four
//     services are on the Services page's first screen, each going to its own part;
//   - "as a standard I'd like the blue response hero text to be on its own line"
//     (of the Tools page's one-sentence headline: "this one is okay to stay");
//   - "on the tools page the meat is too buried. I need tiles or chips that fit with
//     the overall scheme to pull to the top (visible on first glance) the tools that
//     meet the criteria. Sports Movies Business, etc".
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
    for (const path of ['/services/', '/approach/', '/about/', '/contact/', '/insights/']) {
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForTimeout(150);
      const b = await blueLine(page);
      check(path + ' at ' + w + 'px: the blue part of the headline is on its own line, from the left edge', !!b && b.below && b.atLeft && b.blue === 'rgb(61, 216, 216)');
    }
    // the one headline that stays whole: a single sentence, on one line where there is room for it
    await page.goto(base + '/tools/', { waitUntil: 'load' });
    await page.waitForTimeout(150);
    const one = await page.evaluate(() => { const h1 = document.querySelector('.page-hero h1'); return { lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)), blue: getComputedStyle(h1.querySelector('em')).color, text: h1.textContent }; });
    check('/tools/ at ' + w + 'px: its headline is one sentence, kept on one line where there is room, the blue part still blue', one.text === 'Your site can do more than describe you.' && one.blue === 'rgb(61, 216, 216)' && (w < 1000 || one.lines === 1));
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

  // --- every inner page opens on a supporting figure, and its source card opens whole
  {
    const ctx = await browser.newContext({ viewport: { width: 1255, height: 607 } });
    const page = await ctx.newPage();
    for (const [path, num] of [['/services/', '62%'], ['/approach/', '56%'], ['/about/', '244'], ['/contact/', '3%'], ['/tools/', '72%']]) {
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForTimeout(1800);
      const at = await page.evaluate(() => { const f = document.querySelector('.page-hero .hero-stat'), r = f.getBoundingClientRect(), n = f.querySelector('.stat-num'), src = f.querySelector('.sa-cite-src').getBoundingClientRect(); return { num: n.textContent, top: r.top, bottom: r.bottom, x: src.left + src.width / 2, y: src.top + src.height / 2, nav: document.getElementById('main-nav').getBoundingClientRect().bottom, vh: window.innerHeight, srcShown: src.width > 0 && src.bottom <= window.innerHeight }; });
      check(path + ': its figure (' + num + ') is on the first screen with its source in view', at.num === num && at.top >= at.nav && at.bottom <= at.vh && at.srcShown);
      await page.mouse.move(at.x, at.y, { steps: 2 });
      await page.waitForTimeout(350);
      const card = await page.evaluate(() => { const c = document.querySelector('.page-hero .hero-stat .sa-cite-card'), r = c.getBoundingClientRect(), st = getComputedStyle(c); const on = (x, y) => { const e = document.elementFromPoint(x, y); return !!(e && c.contains(e)); }; return { shown: st.visibility === 'visible' && Number(st.opacity) > 0.9, top: r.top, bottom: r.bottom, left: r.left, right: r.right, nav: document.getElementById('main-nav').getBoundingClientRect().bottom, vh: window.innerHeight, vw: window.innerWidth, clear: on(r.left + 12, r.top + 12) && on(r.right - 12, r.bottom - 12), link: (c.querySelector('a') || {}).href || '' }; });
      check(path + ': pointing at it opens its source card, whole, clear of the menu, with a link to the source', card.shown && card.top >= card.nav && card.bottom <= card.vh && card.left >= 0 && card.right <= card.vw && card.clear && /^https:\/\//.test(card.link));
      await page.mouse.move(5, card.vh - 5);
    }
    await ctx.close();
  }

  // --- the Tools page: every tool is on the first screen, and a kind keeps only its own
  const tools = (page) => page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.page-hero .tl-tile')].filter((t) => !t.hidden).map((t) => { const r = t.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, name: t.querySelector('.tl-name').textContent }; });
    const chips = [...document.querySelectorAll('.page-hero .tl-chip')].map((c) => ({ kind: c.getAttribute('data-kind'), says: Number(c.querySelector('span').textContent), on: c.getAttribute('aria-pressed') === 'true' && c.classList.contains('on'), r: c.getBoundingClientRect() }));
    const count = (k) => [...document.querySelectorAll('.page-hero .tl-tile')].filter((t) => k === 'all' || (' ' + t.getAttribute('data-kinds') + ' ').includes(' ' + k + ' ')).length;
    return { tiles, chips: chips.map((c) => Object.assign(c, { has: count(c.kind), inView: c.r.top >= 0 && c.r.bottom <= window.innerHeight })), navBottom: document.getElementById('main-nav').getBoundingClientRect().bottom, vh: window.innerHeight, vw: window.innerWidth, pageWide: document.documentElement.scrollWidth <= window.innerWidth };
  });
  const whole = (t, f) => t.top >= f.navBottom && t.bottom <= f.vh && t.left >= 0 && t.right <= f.vw;
  for (const [w, h, mobile] of [[1255, 607, false], [1366, 657, false], [1440, 900, false], [390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    await page.goto(base + '/tools/', { waitUntil: 'load' });
    await page.waitForTimeout(1800);        // the opening animation
    const f = await tools(page);
    check('/tools/ at ' + w + ' by ' + h + ': every tool is a tile on the first screen, whole, under the menu (' + f.tiles.filter((t) => whole(t, f)).length + ' of ' + f.tiles.length + ')', f.tiles.length === 13 && f.tiles.every((t) => whole(t, f)) && f.pageWide);
    check('/tools/ at ' + w + ' by ' + h + ': the kinds to choose from are in view above them, All chosen, each saying how many it has', f.chips.map((c) => c.kind).join(',') === 'all,business,sports,movies,built' && f.chips.every((c) => c.inView && c.says === c.has) && f.chips[0].on && f.chips.slice(1).every((c) => !c.on) && f.chips.every((c) => c.r.bottom <= f.tiles[0].top));
    if (w === 1255 || mobile) {
      for (const [kind, n, has] of [['sports', 8, 'NFL Lines Tracker'], ['movies', 2, 'AFI 100 Tracker'], ['business', 3, 'Resume Parser'], ['built', 3, 'Golf Pick\u2019em'], ['all', 13, 'Card Evaluator']]) {
        if (mobile) await page.tap('.tl-chip[data-kind="' + kind + '"]'); else await page.click('.tl-chip[data-kind="' + kind + '"]');
        await page.waitForTimeout(120);
        const g = await tools(page);
        check('/tools/ at ' + w + 'px: choosing ' + kind + ' leaves its ' + n + ' tools, all on the first screen, and marks that kind as chosen', g.tiles.length === n && g.tiles.some((t) => t.name === has) && g.tiles.every((t) => whole(t, g)) && g.chips.filter((c) => c.on).map((c) => c.kind).join() === kind);
      }
    }
    if (w === 1255) {
      await page.click('.tl-tile[href="#built-golf"]');
      await page.waitForTimeout(400);
      const at = await page.evaluate(() => { const r = document.getElementById('built-golf').getBoundingClientRect(), s = document.getElementById('sa-ticker').getBoundingClientRect(); return { top: r.top, strip: s.bottom, nav: document.getElementById('main-nav').getBoundingClientRect().bottom, vh: window.innerHeight }; });
      check('a platform\'s tile goes to where it is described, clear of the menu and the strip under it', at.top >= Math.max(at.nav, at.strip) - 1 && at.top < at.vh * 0.6);
    }
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' first-screen checks failed'); process.exit(1); }
  console.log('ok: ' + n + ' first-screen checks');
})().catch((e) => { if (fails.length) console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.error(String(e && e.stack || e)); process.exit(1); });
