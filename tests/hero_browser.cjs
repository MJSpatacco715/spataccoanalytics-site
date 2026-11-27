// The first screen of the inner pages, opened in a real browser. Run by
// tests/pages_test.sh (where Playwright is installed) against the built site:
//   node tests/hero_browser.cjs http://127.0.0.1:PORT
// Two things the owner asked for on 2026-11-26:
//   - "services page is all talk and no service options on first screen": the four
//     services are on the Services page's first screen, each going to its own part;
//   - "as a standard I'd like the blue response hero text to be on its own line"
//     (the Tools page's headline was one sentence then and stayed on one line; it puts
//     a question in blue now, the owner's choice, and follows the standard);
//   - "on the tools page the meat is too buried. I need tiles or chips that fit with
//     the overall scheme to pull to the top (visible on first glance) the tools that
//     meet the criteria. Sports Movies Business, etc";
//   - and of the first cut of that, on a phone: "This is too many
//     categories/tiles/chips And I want the scroll to show bottom of first visible
//     screen". Three kinds, the chosen kind's tools only, and the market strip along
//     the bottom of the first screen.
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

// What the market feed answers here (the site is served as plain files, with no feed):
// made-up figures, enough of them for the strip to come up.
const FEED = { ok: true, at: '2026-11-25T14:25:00Z', items: ['US 30-Yr', 'US 10-Yr', 'USD/EUR', 'Bitcoin', 'Brent'].map((label, i) => ({ id: 't' + i, label, value: '1.00', delta: '', dir: '', by: 'Test', when: 'Nov 24', card: { title: label, text: 'A made-up answer for the first-screen checks.', source: 'Test', url: 'https://example.com/' } })) };

(async () => {
  const browser = await chromium.launch();

  // --- the blue line is its own line, on every page with a headline of this kind
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    for (const path of ['/services/', '/approach/', '/tools/', '/about/', '/contact/', '/insights/']) {
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForTimeout(150);
      const b = await blueLine(page);
      check(path + ' at ' + w + 'px: the blue part of the headline is on its own line, from the left edge', !!b && b.below && b.atLeft && b.blue === 'rgb(61, 216, 216)');
      if (path === '/tools/') {
        // the white line as the owner chose it, the question in blue; each on one line where there is the width
        const t = await page.evaluate(() => { const h1 = document.querySelector('.page-hero h1'); return { white: h1.firstChild.textContent.trim(), lines: Math.round(h1.getBoundingClientRect().height / parseFloat(getComputedStyle(h1).lineHeight)) }; });
        check('/tools/ at ' + w + 'px: its headline says the site can do more, then asks what it should do, two lines where there is the width', t.white === 'Your website can do more than describe you.' && b.text === 'What should it do for you?' && (w < 1000 || t.lines === 2));
      }
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

  // --- the free Website Score on the Services page: a tap opens the scorer, one button bundles it
  // The owner, in three asks: "This should (obviously) link to the web scorer"; "Add it to the
  // builder. Essentially will be auto-checked on all paid engagements"; "Maybe an option to
  // add/bundle with other services or other option to go to the scorer" (two buttons, the
  // owner chose, with a tap anywhere else opening the scorer).
  for (const [w, h, mobile] of [[1255, 607, false], [430, 744, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    // Press the middle of a thing as a finger or a pointer does: whatever is on top there takes it.
    const press = async (sel) => {
      const at = await page.evaluate((sel) => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2 }; }, sel);
      await page.waitForTimeout(250);
      if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
    };
    const open = async () => { await page.goto(base + '/services/', { waitUntil: 'load' }); await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; }); await page.waitForTimeout(500); };
    const went = [];
    for (const part of ['.sv-name', '.sv-desc', '.sv-price', '.sv-go', '.sv-time']) {
      await open();
      await Promise.all([page.waitForURL(/\/tools\/website-scorer\.html/, { timeout: 8000 }).catch(() => {}), press('.sv-opt-go ' + part)]);
      const u = new URL(page.url());
      if (u.pathname === '/tools/website-scorer.html' && u.searchParams.get('scope') === 'website' && u.searchParams.get('utm_source') === 'services') went.push(part);
    }
    check('/services/ at ' + w + ' by ' + h + ': the free Website Score opens the scorer wherever it is pressed but on its bundle button (' + went.length + ' of 5)', went.length === 5);
    check('and the scorer is what opens', /Website Score/.test(await page.title()) && (await page.locator('input').count()) > 0);

    const plan = () => page.evaluate(() => {
      const o = document.querySelector('.sv-opt-go'), a = document.getElementById('sv-score-add'), t = getComputedStyle(o.querySelector('.sv-tick'));
      return { ticked: o.classList.contains('inc') && t.backgroundColor === 'rgb(123, 92, 255)', said: !o.querySelector('.sv-in').hidden, btn: a.textContent, pressed: a.getAttribute('aria-pressed') === 'true', off: a.disabled,
        lines: [...document.querySelectorAll('#sv-lines .sv-line')].map((l) => l.children[0].textContent + '=' + l.children[1].textContent), empty: !!document.querySelector('#sv-lines .sv-empty'), path: location.pathname,
        picked: (document.querySelector('input[name="audit"]:checked') || {}).value || '' };
    });
    await open();
    const start = await plan();
    check('/services/ at ' + w + ' by ' + h + ': to begin with it is not in the plan, and its button offers to bundle it', !start.ticked && !start.said && start.btn === 'Bundle with other services' && !start.pressed && !start.off && start.empty);
    await press('#sv-score-add'); await page.waitForTimeout(200);
    const bundled = await plan();
    check('/services/ at ' + w + ' by ' + h + ': its button bundles it: ticked, in the plan free, and the page stays put', bundled.ticked && bundled.said && bundled.pressed && bundled.btn === 'In your plan: remove' && bundled.lines.join('|') === 'Website Score=Free' && bundled.path === '/services/');
    await press('#sv-score-add'); await page.waitForTimeout(200);
    const out = await plan();
    check('/services/ at ' + w + ' by ' + h + ': and takes it out again', !out.ticked && !out.pressed && out.btn === 'Bundle with other services' && out.empty);
    // with a paid level it is in by itself, and its button only says so
    await press('#audit .sv-opt.rec .sv-desc'); await page.waitForTimeout(200);
    const paid = await plan();
    check('/services/ at ' + w + ' by ' + h + ': the audit levels beside it still tick into the plan and stay on the page', paid.picked === 'professional' && paid.lines.some((l) => /Audit Report/.test(l)) && paid.path === '/services/');
    check('/services/ at ' + w + ' by ' + h + ': with a paid level picked the Website Score is in the plan by itself, first and free, and its button only says so', paid.ticked && paid.said && paid.lines[0] === 'Website Score (included)=Free' && paid.btn === 'Included in your plan' && paid.off);
    await press('#sv-score-add'); await page.waitForTimeout(200);
    const still = await plan();
    check('/services/ at ' + w + ' by ' + h + ': pressing its button then changes nothing and goes nowhere', still.ticked && still.lines[0] === 'Website Score (included)=Free' && still.path === '/services/');
    await press('[data-clear="audit"]'); await page.waitForTimeout(200);
    const none = await plan();
    check('/services/ at ' + w + ' by ' + h + ': with the paid level removed it is out of the plan again', !none.ticked && !none.said && none.empty && none.btn === 'Bundle with other services' && !none.off);
    await press('label.sv-plan.rec .sv-desc'); await page.waitForTimeout(200);
    const host = await plan();
    check('/services/ at ' + w + ' by ' + h + ': hosting alone is a paid engagement too: the Website Score is ticked and in the plan', host.ticked && host.lines[0] === 'Website Score (included)=Free' && host.lines.some((l) => /^Managed Hosting/.test(l)));
    // ticked, the card still opens the scorer
    await Promise.all([page.waitForURL(/\/tools\/website-scorer\.html/, { timeout: 8000 }).catch(() => {}), press('.sv-opt-go .sv-desc')]);
    check('/services/ at ' + w + ' by ' + h + ': ticked, a tap on it still opens the scorer', new URL(page.url()).pathname === '/tools/website-scorer.html');
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

  // --- the Tools page: three kinds, the chosen kind's tools on the first screen, the strip along its bottom
  const tools = (page) => page.evaluate(() => {
    const every = [...document.querySelectorAll('.page-hero .tl-tile')];
    const tiles = every.filter((t) => !t.hidden).map((t) => { const r = t.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, name: t.querySelector('.tl-name').textContent, kind: t.getAttribute('data-kind') }; });
    const chips = [...document.querySelectorAll('.page-hero .tl-chip')].map((c) => ({ kind: c.getAttribute('data-kind'), says: Number(c.querySelector('span').textContent), on: c.getAttribute('aria-pressed') === 'true' && c.classList.contains('on'), r: c.getBoundingClientRect() }));
    const count = (k) => every.filter((t) => t.getAttribute('data-kind') === k).length;
    const strip = document.getElementById('sa-ticker').getBoundingClientRect(), stat = document.querySelector('.page-hero .hero-stat').getBoundingClientRect();
    return { tiles, all: every.length, chips: chips.map((c) => Object.assign(c, { has: count(c.kind), inView: c.r.top >= 0 && c.r.bottom <= window.innerHeight, top: Math.round(c.r.top) })), navBottom: document.getElementById('main-nav').getBoundingClientRect().bottom, vh: window.innerHeight, vw: window.innerWidth, pageWide: document.documentElement.scrollWidth <= window.innerWidth,
      strip: { top: Math.round(strip.top), bottom: Math.round(strip.bottom), h: Math.round(strip.height) }, heroBottom: Math.round(document.querySelector('.page-hero').getBoundingClientRect().bottom), statBottom: stat.bottom, scrolled: window.scrollY };
  });
  const whole = (t, f) => t.top >= f.navBottom && t.bottom <= f.strip.top && t.left >= 0 && t.right <= f.vw;
  // (430 by 744 is the owner's phone as it showed the page: a tall phone with the browser's own bars up.
  //  390 by 664 is the commonest one the same way.)
  for (const [w, h, mobile] of [[1255, 607, false], [1366, 657, false], [1440, 900, false], [1920, 1080, false], [430, 744, true], [390, 664, true], [390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    await page.route(/\/market\/feed\.php/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(FEED) }));   // the strip, with something on it
    await page.goto(base + '/tools/', { waitUntil: 'load' });
    await page.waitForSelector('#sa-ticker.on', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1800);        // the opening animation
    const f = await tools(page);
    check('/tools/ at ' + w + ' by ' + h + ': three kinds to choose from, Business chosen, each saying how many tools it has, all thirteen between them', f.chips.map((c) => c.kind).join(',') === 'business,sports,movies' && f.chips.every((c) => c.inView && c.says === c.has) && f.chips[0].on && f.chips.slice(1).every((c) => !c.on) && f.chips.reduce((a, c) => a + c.says, 0) === 13 && f.all === 13);
    check('/tools/ at ' + w + ' by ' + h + ': only the Business tools show, whole, under the kinds and the menu (' + f.tiles.length + ' showing)', f.tiles.length === 3 && f.tiles.every((t) => t.kind === 'business' && whole(t, f)) && f.chips.every((c) => c.r.bottom <= f.tiles[0].top) && f.pageWide);
    check('/tools/ at ' + w + ' by ' + h + ': the market strip lies along the bottom of the first screen, all of it showing, straight after the opening section (strip ' + f.strip.top + ' to ' + f.strip.bottom + ' of ' + f.vh + ')', f.strip.bottom === f.vh && f.strip.h >= 30 && f.strip.top === f.heroBottom && f.scrolled === 0);
    check('/tools/ at ' + w + ' by ' + h + ': the figure and its source are on that first screen too, above the strip', f.statBottom <= f.strip.top);
    {
      const press = (kind) => (mobile ? page.tap('.tl-chip[data-kind="' + kind + '"]') : page.click('.tl-chip[data-kind="' + kind + '"]'));
      let last = f;
      for (const [kind, n, has] of [['sports', 8, 'NFL Lines Tracker'], ['movies', 2, 'AFI 100 Tracker'], ['business', 3, 'Resume Parser'], ['sports', 8, 'Golf Pick’em']]) {
        await press(kind);
        await page.waitForTimeout(150);
        const g = await tools(page);
        check('/tools/ at ' + w + ' by ' + h + ': choosing ' + kind + ' leaves its ' + n + ' tools and no others, all on the first screen above the strip, and marks that kind as chosen', g.tiles.length === n && g.tiles.every((t) => t.kind === kind) && g.tiles.some((t) => t.name === has) && g.tiles.every((t) => whole(t, g)) && g.chips.filter((c) => c.on).map((c) => c.kind).join() === kind);
        check('/tools/ at ' + w + ' by ' + h + ': with ' + kind + ' chosen the strip is still along the bottom of the first screen', g.strip.bottom === g.vh && g.scrolled === 0);
        // the row just pressed stays where it was, unless a longer list needs the room (and then it moves once, upward)
        const moved = g.chips[0].top - last.chips[0].top;
        check('/tools/ at ' + w + ' by ' + h + ': choosing ' + kind + ' does not move the kinds out from under the pointer (moved ' + moved + 'px)', mobile ? moved <= 0 && (n <= last.tiles.length ? moved === 0 : true) : moved === 0);
        last = g;
      }
      await press('business');
      await page.waitForTimeout(150);
    }
    if (w === 1255) {
      await page.click('.tl-chip[data-kind="sports"]');
      await page.waitForTimeout(150);
      await page.click('.tl-tile[href="#built-golf"]');
      await page.waitForTimeout(400);
      const at = await page.evaluate(() => { const r = document.getElementById('built-golf').getBoundingClientRect(), s = document.getElementById('sa-ticker').getBoundingClientRect(); return { top: r.top, strip: s.bottom, nav: document.getElementById('main-nav').getBoundingClientRect().bottom, vh: window.innerHeight }; });
      check('a platform\'s tile goes to where it is described, clear of the menu and the strip under it', at.top >= Math.max(at.nav, at.strip) - 1 && at.top < at.vh * 0.6);
    }
    await ctx.close();
  }

  // --- a small phone with its bars up: what the page opens on still ends on the strip
  // (the eight Sports tools do not fit there with the figure, and push the strip just under)
  for (const [w, h] of [[375, 629], [360, 640], [375, 548]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.route(/\/market\/feed\.php/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(FEED) }));
    await page.goto(base + '/tools/', { waitUntil: 'load' });
    await page.waitForSelector('#sa-ticker.on', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const f = await tools(page);
    check('/tools/ at ' + w + ' by ' + h + ', a small phone: the three kinds, the Business tools and the figure are on the first screen and the strip closes it (strip ' + f.strip.top + ' to ' + f.strip.bottom + ' of ' + f.vh + ')', f.tiles.length === 3 && f.tiles.every((t) => whole(t, f)) && f.chips.every((c) => c.inView && c.r.top >= f.navBottom) && f.statBottom <= f.strip.top && f.strip.bottom === f.vh && f.pageWide);
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' first-screen checks failed'); process.exit(1); }
  console.log('ok: ' + n + ' first-screen checks');
})().catch((e) => { if (fails.length) console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.error(String(e && e.stack || e)); process.exit(1); });
