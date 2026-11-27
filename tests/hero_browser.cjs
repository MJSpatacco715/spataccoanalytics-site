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

  // --- the home page is navy from top to bottom. Its pillars were the one light section; the owner,
  // 2026-11-27: "weirdly all white in a sea of blue", and, shown it in navy: "Yes, make it navy".
  for (const [w, h, mobile] of [[1255, 607, false], [390, 664, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.addStyleTag({ content: '.reveal{opacity:1 !important;transform:none !important}' });
    await page.waitForTimeout(400);
    const g = await page.evaluate(() => {
      const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
      const solid = (c) => c.length >= 3 && (c.length < 4 || c[3] > 0.5);
      const light = [];
      for (const e of document.querySelectorAll('body *')) {
        if (e.closest('.sa-cite-card, footer')) continue;          // a source card is a card of paper, shown on asking; the SA mark sits on its white tile
        const r = e.getBoundingClientRect(), st = getComputedStyle(e), bg = rgb(st.backgroundColor);
        if (r.width * r.height > 1500 && st.display !== 'none' && solid(bg) && lum(bg) > 0.75) light.push(e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]);
      }
      const cards = [...document.querySelectorAll('.service-card')].map((c) => ({ ground: lum(rgb(getComputedStyle(c).backgroundColor).slice(0, 3)) * (rgb(getComputedStyle(c).backgroundColor)[3] ?? 1), name: lum(rgb(getComputedStyle(c.querySelector('h3')).color)), words: lum(rgb(getComputedStyle(c.querySelector('p')).color)), go: lum(rgb(getComputedStyle(c.querySelector('.service-go')).color)) }));
      const sec = document.getElementById('services'), head = sec.querySelector('h2');
      return { light: [...new Set(light)], cards, head: lum(rgb(getComputedStyle(head).color)), sections: [...document.querySelectorAll('body > section')].length, wide: document.documentElement.scrollWidth <= window.innerWidth };
    });
    check('/ at ' + w + 'px: no light section or panel anywhere on the home page (not: ' + g.light.join(', ') + ')', g.light.length === 0 && g.sections >= 5 && g.wide);
    check('/ at ' + w + 'px: the three pillars are panels on the navy, their names white and their words light enough to read', g.cards.length === 3 && g.cards.every((c) => c.ground < 0.1 && c.name > 0.95 && c.words > 0.6 && c.go > 0.7) && g.head > 0.95);
    await ctx.close();
  }

  // --- the blue line is its own line, on every page with a headline of this kind
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    for (const path of ['/services/', '/approach/', '/tools/', '/about/', '/contact/', '/insights/', '/tools/website-scorer.html']) {
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
    check('/services/ at ' + w + ' by ' + h + ': with a project level picked the Website Score is in the plan by itself, first and free, and its button only says so', paid.ticked && paid.said && paid.lines[0] === 'Website Score (included)=Free' && paid.btn === 'Included in your plan' && paid.off);
    await press('#sv-score-add'); await page.waitForTimeout(200);
    const still = await plan();
    check('/services/ at ' + w + ' by ' + h + ': pressing its button then changes nothing and goes nowhere', still.ticked && still.lines[0] === 'Website Score (included)=Free' && still.path === '/services/');
    await press('[data-clear="audit"]'); await page.waitForTimeout(200);
    const none = await plan();
    check('/services/ at ' + w + ' by ' + h + ': with the project level removed it is out of the plan again', !none.ticked && !none.said && none.empty && none.btn === 'Bundle with other services' && !none.off);
    await press('label.sv-plan.rec .sv-desc'); await page.waitForTimeout(200);
    // A hosting plan alone does not bring it in (the owner, asked: "Project work only"): the plan
    // is the hosting, and its button still offers to bundle it.
    const host = await plan();
    check('/services/ at ' + w + ' by ' + h + ': hosting alone does not put the Website Score in the plan, and its button still offers to bundle it', !host.ticked && !host.said && !host.off && host.btn === 'Bundle with other services' && host.lines.length >= 1 && host.lines.every((l) => !/Website Score/.test(l)) && host.lines.some((l) => /^Managed Hosting/.test(l)));
    await press('#sv-score-add'); await page.waitForTimeout(200);
    const both = await plan();
    check('/services/ at ' + w + ' by ' + h + ': bundled with a hosting plan it leads the plan, free, and can be taken out again', both.ticked && both.lines[0] === 'Website Score=Free' && both.lines.some((l) => /^Managed Hosting/.test(l)) && both.btn === 'In your plan: remove' && !both.off);
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
      // A glance across it opens nothing; resting on it does. The owner, 2026-11-27: "the hover cards are
      // very sensitive. if i even glance over it (and people are likely to) it is BOOM taking up screen
      // space. Someone should have to linger on the link for just a split second for it to pop."
      const seen = () => page.evaluate(() => { const st = getComputedStyle(document.querySelector('.page-hero .hero-stat .sa-cite-card')); return st.visibility === 'visible' && Number(st.opacity) > 0.05; });
      await page.mouse.move(at.x, at.y, { steps: 2 });
      await page.waitForTimeout(140);
      const early = await seen();
      await page.mouse.move(5, at.vh - 5);
      await page.waitForTimeout(450);
      check(path + ': a pointer passing over the figure does not open its source card', !early && !(await seen()));
      await page.mouse.move(at.x, at.y, { steps: 2 });
      await page.waitForTimeout(750);
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

  // --- a tile says what it is, and its icon is drawn. The owner, 2026-11-27, of the Business tools on a
  // phone: "RIA digital presence scorecard and Resume parser should be bigger/stand alone there as
  // interactive tools or named as interactive versus merely descriptive ... Icons could be MUCH better".
  for (const [w, h, mobile] of [[1255, 607, false], [430, 744, true], [390, 664, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    const page = await ctx.newPage();
    await page.route(/\/market\/feed\.php/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(FEED) }));
    await page.goto(base + '/tools/', { waitUntil: 'load' });
    await page.waitForTimeout(1800);
    const seen = () => page.evaluate(() => [...document.querySelectorAll('.page-hero .tl-tile')].filter((x) => !x.hidden).map((x) => {
      const r = x.getBoundingClientRect(), tag = x.querySelector('.tl-tag'), ico = x.querySelector('.tl-ico'), name = x.querySelector('.tl-name'), use = ico.querySelector('use');
      const tr = tag.getBoundingClientRect(), ir = ico.getBoundingClientRect(), nr = name.getBoundingClientRect();
      return { live: x.classList.contains('tl-live'), area: r.width * r.height, tag: tr.width > 0 && tr.height > 0 ? tag.innerText.replace(/\s+/g, ' ').trim() : '', tagPx: parseFloat(getComputedStyle(tag).fontSize),
        tagLines: tr.height > 0 ? Math.round(tr.height / parseFloat(getComputedStyle(tag).lineHeight)) : 0,
        ico: Math.round(ir.width), square: Math.abs(ir.width - ir.height) < 1, filled: getComputedStyle(ico).backgroundImage.includes('gradient'),
        drawn: !!use && !!document.querySelector(use.getAttribute('href')) && ico.getBBox().width > 4 && getComputedStyle(ico).fill === 'none' && getComputedStyle(ico).stroke !== 'none',
        nameIn: nr.left >= ir.right && nr.right <= r.right + 1 && name.scrollWidth <= name.clientWidth + 1, text: x.textContent,
        // the group the tile stands in, and what is written over it (nothing, where a phone leaves the line out)
        group: (() => { const g = x.closest('.tl-group'), l = g && g.querySelector('.tl-group-label'), lr = l ? l.getBoundingClientRect() : { width: 0, height: 0 }; return { live: !!g && g.classList.contains('tl-group-live'), said: lr.width > 0 && lr.height > 0 ? l.innerText.replace(/\s+/g, ' ').trim() : '', left: g ? Math.round(g.getBoundingClientRect().left) : -1, top: g ? Math.round(g.getBoundingClientRect().top) : -1, px: l ? parseFloat(getComputedStyle(l).fontSize) : 0 }; })(),
        dashed: getComputedStyle(x).borderTopStyle === 'dashed', name: name.childNodes[0] ? name.childNodes[0].textContent.trim() : '' };
    }));
    // The owner, 2026-11-27, of this first screen: "this needs better / greater definition of the three up top are
    // categories and some sort of greater interactive/non delineation beyond just the blue logo/icon".
    const cats = await page.evaluate(() => { const l = document.querySelector('.tl-chips-label'), r = l.getBoundingClientRect(), c = document.querySelector('.tl-chip').getBoundingClientRect();
      return { said: r.width > 0 ? l.innerText.replace(/\s+/g, ' ').trim() : '', before: r.right <= c.left && Math.abs((r.top + r.bottom) / 2 - (c.top + c.bottom) / 2) < 6,
        counts: [...document.querySelectorAll('.tl-chip')].map((x) => x.textContent.replace(/\s+/g, ' ').trim() + getComputedStyle(x.querySelector('span'), '::after').content.replace(/^none$|"/g, '')), label: document.querySelector('.tl-chips').getAttribute('aria-label') }; });
    check('/tools/ at ' + w + ' by ' + h + (mobile ? ': on a phone the three chips fill the row and are named as categories to assistive technology' : ': the three are under the words "Browse by category", and each says how many tools it holds (' + cats.counts.join(' | ') + ')'),
      cats.label === 'Show tools by category' && (mobile ? cats.said === '' : cats.said === 'BROWSE BY CATEGORY' && cats.before && cats.counts.join(' | ') === 'Business 3 tools | Sports 8 tools | Movies 2 tools'));
    const b = await seen();
    check('/tools/ at ' + w + ' by ' + h + ': the two Business tools to use say so in words, each on one line (' + b.map((x) => x.tag).join(' | ') + ')', b.length === 3 && b[0].live && b[1].live && b[0].tag === 'INTERACTIVE · TRY IT NOW' && b[1].tag === 'INTERACTIVE · TRY IT NOW' && b[0].tagLines === 1 && b[1].tagLines === 1 && (!mobile || b[0].tagPx >= 13));
    check('/tools/ at ' + w + ' by ' + h + ': they are the larger tiles, their icons filled; the platform described below is quieter and says it is built to order', b[0].area > b[2].area * 1.25 && b[1].area > b[2].area * 1.25 && b[0].filled && b[1].filled && !b[2].live && !b[2].filled && (b[2].tag.startsWith('BUILT TO ORDER') ? b[2].tagLines === 1 : b[2].group.said.startsWith('BUILT TO ORDER')) && b[0].ico > b[2].ico);
    check('/tools/ at ' + w + ' by ' + h + ': the tools to use and the platform stand in two groups, the platform under the words "Built to order" and in a dashed line' + (mobile ? '' : ', side by side, the tools under "Interactive"') + ' (' + b[0].group.said + ' | ' + b[2].group.said + ')',
      b[0].group.live && b[1].group.live && !b[2].group.live && b[2].group.said.startsWith('BUILT TO ORDER') && b[2].dashed && !b[0].dashed && (!mobile || b[2].group.px >= 13)
      && (mobile ? b[2].group.top > b[0].group.top : b[0].group.said.startsWith('INTERACTIVE') && b[2].group.left > b[0].group.left && Math.abs(b[2].group.top - b[0].group.top) < 2));
    check('/tools/ at ' + w + ' by ' + h + ': the scorecard is named as the rest of the site names it, the free website score, and says which scorecard it is (' + b[0].name + ')', b[0].name === 'Free Website Score' && /RIA Digital Presence Scorecard/.test(b[0].text));
    check('/tools/ at ' + w + ' by ' + h + ': each icon is drawn, square and in its badge, with the name beside it and not cut', b.every((x) => x.drawn && x.square && x.ico >= 24 && x.nameIn && !/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/u.test(x.text)));
    if (mobile) await page.tap('.tl-chip[data-kind="sports"]'); else await page.click('.tl-chip[data-kind="sports"]');
    await page.waitForTimeout(250);
    const s = await seen();
    check('/tools/ at ' + w + ' by ' + h + ': of the eight Sports tools the six to use come first with filled icons, the two described after them without', s.length === 8 && s.slice(0, 6).every((x) => x.live && x.filled && x.group.live && !x.dashed) && s.slice(6).every((x) => !x.live && !x.filled && !x.group.live && x.dashed && x.group.said.startsWith('BUILT TO ORDER')) && s.every((x) => x.drawn && x.square && x.ico >= 22 && x.nameIn));
    if (mobile) await page.tap('.tl-chip[data-kind="movies"]'); else await page.click('.tl-chip[data-kind="movies"]');
    await page.waitForTimeout(250);
    const mv = await seen();
    check('/tools/ at ' + w + ' by ' + h + ': Movies has no platform, so no "Built to order" group shows and its two tools take the row', mv.length === 2 && mv.every((x) => x.live) && await page.evaluate(() => { const g = document.querySelector('.tl-group-see'); return g.hidden && g.getBoundingClientRect().height === 0 && document.getElementById('tl-tiles').classList.contains('solo'); }));
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
