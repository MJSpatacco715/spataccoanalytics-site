// The market strip opened in a browser (tests/market_test.sh runs this where
// Playwright is installed). The page is the built tools page, where the strip
// lives, served with the saved answers, so nothing here leaves the machine.
// The home page, which had the strip until November 2026, is opened once at
// the end to see that it is gone from there.
//   node tests/ticker_browser.cjs http://127.0.0.1:18746/tools/
const { chromium } = require('playwright');

const url = process.argv[2];
const fails = [];
let n = 0;
function check(name, pass) { n++; if (!pass) fails.push(name); }

async function open(browser, opts, before) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());   // not this site's
  if (before) await before(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { ctx, page, errors };
}

// The middle of a figure that is in view, by id.
function spot(page, id) {
  return page.evaluate((id) => {
    const view = document.querySelector('.sa-tk-view').getBoundingClientRect();
    for (const e of document.querySelectorAll('.sa-tk-item[data-id="' + id + '"]')) {
      const b = e.getBoundingClientRect();
      const c = b.left + b.width / 2;
      if (c > view.left + 30 && c < view.right - 30) return { x: c, y: b.top + b.height / 2 };
    }
    return null;
  }, id);
}

(async () => {
  const browser = await chromium.launch();

  // --- a desktop
  {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } });
    await page.waitForSelector('#sa-ticker.on', { timeout: 8000 });
    const s = await page.evaluate(() => {
      const r = document.getElementById('sa-ticker');
      const sets = [...r.querySelectorAll('.sa-tk-set')];
      // (the menu slides in over its first second: where it rests is its own height from the top)
      const b = r.getBoundingClientRect();
      const track = r.querySelector('.sa-tk-track');
      return {
        ids: [...sets[0].querySelectorAll('.sa-tk-item:not(.sa-tk-note)')].map((e) => e.getAttribute('data-id')).join(','),
        sets: sets.length,
        firstHidden: sets[0].getAttribute('aria-hidden'),
        copiesHidden: sets.slice(1).every((x) => x.getAttribute('aria-hidden') === 'true'),
        copiesOutOfTabs: sets.slice(1).every((x) => [...x.querySelectorAll('button')].every((q) => q.tabIndex === -1)),
        top: Math.round(b.top), navBottom: document.getElementById('main-nav').offsetHeight, height: Math.round(b.height),
        heroTop: Math.round(document.querySelector('.page-hero-tag').getBoundingClientRect().top),
        bottom: Math.round(b.bottom),
        moving: getComputedStyle(track).animationName !== 'none' && getComputedStyle(track).animationPlayState === 'running',
        trackWide: track.getBoundingClientRect().width >= 2 * r.querySelector('.sa-tk-view').clientWidth,
        text: sets[0].textContent,
        note: !!r.querySelector('.sa-tk-note'),
        notes: sets.map((x) => (x.querySelector('.sa-tk-note') ? 'n' : '-')).join(''),
        noWordTwice: !/quotes[^.]*quotes/.test((r.querySelector('.sa-tk-note') || {}).textContent || 'quotes quotes'),
        pageWide: document.documentElement.scrollWidth <= window.innerWidth,
      };
    });
    check('eight figures in order, the RIA deal count first', s.ids === 'ria,ust30,ust10,eurusd,btc,brent,wti,gas' && s.text.includes('RIA Deals 2026') && s.text.includes('78 to tie record') && s.text.includes('DeVoe, Q1-Q3'));
    check('the dollar is quoted in euros, as what one dollar buys', s.text.includes('USD/EUR') && s.text.includes('$1 = \u20AC0.9122') && !s.text.includes('EUR/USD'));
    check('the copies are hidden from assistive technology and from the Tab key', s.sets >= 2 && s.firstHidden === null && s.copiesHidden && s.copiesOutOfTabs);
    check('it sits directly under the menu and above the headline', s.top === s.navBottom && s.bottom < s.heroTop && s.height <= 36);
    check('it scrolls, with no seam', s.moving && s.trackWide);
    check('a figure shows its value, its move, who published it and for when', s.text.includes('US 10-Yr') && s.text.includes('4.91%') && s.text.includes('-1 bp') && s.text.includes('Treasury, Nov 24') && s.text.includes('EIA, Nov 17'));
    check('it says what the figures are', s.note && s.text.includes('These quotes are latest published figures and not necessarily live.'));
    check('the note rides on every other pass of the figures, not every one', /^(n-)+$/.test(s.notes) && s.sets % 4 === 0 && s.noWordTwice);
    check('the page is no wider than the window', s.pageWide);
    const where = await page.evaluate(() => { const r = document.getElementById('sa-ticker'); return { parent: r.parentNode === document.body, lit: (document.querySelector('#main-nav a.active') || {}).textContent, h1: document.querySelector('.page-hero h1').textContent.replace(/\s+/g, ' ').trim() }; });
    check('it is on the tools page, as the page\'s own child and not inside the first section', where.parent && where.lit === 'Tools' && where.h1 === 'Your site can do more than describe you.');

    // hover: the strip stops and the source card opens under the figure
    const tag = await page.evaluate(() => { const b = document.querySelector('.sa-tk-tag').getBoundingClientRect(); return { x: b.left + 20, y: b.top + 10 }; });
    await page.mouse.move(tag.x, tag.y);
    await page.waitForTimeout(250);
    const about = await page.evaluate(() => {
      const card = document.getElementById('sa-tk-card');
      const links = [...card.querySelectorAll('a')];
      return { open: !card.hidden, title: (card.querySelector('strong') || {}).textContent, text: card.textContent, names: links.map((a) => a.textContent).join('|'), https: links.every((a) => /^https:\/\//.test(a.href) && a.target === '_blank' && a.rel === 'noopener'), paused: getComputedStyle(document.querySelector('.sa-tk-track')).animationPlayState === 'paused' };
    });
    check('the Markets label opens a card about the whole strip', about.open && about.title === 'About these figures' && about.paused);
    check('with the note on what the figures are', about.text.includes('These quotes are latest published figures and not necessarily live.'));
    check('every source, each a link to its publisher', about.names === 'DeVoe & Company|U.S. Department of the Treasury|European Central Bank|CoinGecko|U.S. Energy Information Administration' && about.https);
    check('and the line that the tool runs on free public data', about.text.includes('This tool runs entirely on free public data. Yours could too.'));
    const p = (await spot(page, 'ust10')) || (await spot(page, 'eurusd'));
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(250);
    const whole = await page.evaluate(() => {
      const card = document.getElementById('sa-tk-card'), r = card.getBoundingClientRect(), hero = document.querySelector('.page-hero').getBoundingClientRect();
      const on = (x, y) => { const e = document.elementFromPoint(x, y); return !!(e && card.contains(e)); };
      return { past: r.bottom > hero.bottom, shown: on(r.left + 8, r.bottom - 8) && on(r.right - 8, r.bottom - 8) && on(r.left + r.width / 2, r.top + 8), inWindow: r.bottom <= window.innerHeight };
    });
    check('a card longer than the first section shows whole: nothing cuts it off or covers it', whole.past && whole.shown && whole.inWindow);
    const c = await page.evaluate(() => {
      const card = document.getElementById('sa-tk-card');
      const a = card.querySelector('a');
      const b = card.getBoundingClientRect();
      return { open: !card.hidden, text: card.textContent, links: card.querySelectorAll('a').length, linkText: a && a.textContent, href: a && a.href, target: a && a.target, rel: a && a.rel, inside: b.left >= 0 && b.right <= window.innerWidth, below: b.top >= document.getElementById('sa-ticker').getBoundingClientRect().bottom, paused: getComputedStyle(document.querySelector('.sa-tk-track')).animationPlayState === 'paused', kids: card.querySelectorAll('script,img,iframe').length };
    });
    check('hover opens the source card', c.open && /Treasury yield|U\.S\. dollar in euros/.test(c.text) && c.text.includes('Source: '));
    // a market figure draws itself: the value and its change, a line of its history, three tiles
    const L = await page.evaluate(() => {
      const card = document.getElementById('sa-tk-card');
      const g = card.querySelector('svg.sa-tk-line');
      const path = g && g.querySelector('.sa-tk-path');
      const b = card.getBoundingClientRect();
      const gb = g ? g.getBoundingClientRect() : { left: 0, width: 0, top: 0, height: 0 };
      return {
        big: (card.querySelector('.sa-tk-big') || {}).textContent, chip: (card.querySelector('.sa-tk-chip') || {}).textContent, vs: (card.querySelector('.sa-tk-vs') || {}).textContent,
        segs: path ? path.getAttribute('d').split('L').length : 0, says: g && g.getAttribute('aria-label'), read: (card.querySelector('.sa-tk-read') || {}).textContent,
        ticks: g ? [...g.querySelectorAll('.sa-tk-tick')].map((t) => t.textContent).join('|') : '', days: [...card.querySelectorAll('.sa-tk-days span')].map((e) => e.textContent).join('|'),
        tiles: [...card.querySelectorAll('.sa-tk-tile')].map((t) => t.querySelector('.sa-tk-tl').textContent + '=' + t.querySelector('.sa-tk-tv').textContent).join('|'),
        about: (card.querySelector('.sa-tk-about') || {}).textContent, fits: card.scrollWidth <= card.clientWidth + 1 && b.right <= window.innerWidth && b.bottom <= window.innerHeight,
        inCard: gb.left >= b.left && gb.left + gb.width <= b.right + 1, gx: gb.left, gw: gb.width, gy: gb.top + gb.height / 2,
      };
    });
    check('a market figure leads its card with the value and its change', /^(4\.91%|\u20AC0\.9122)$/.test(L.big || '') && /^[\u25B2\u25BC] [+-]/.test(L.chip || '') && /^from Nov \d+$/.test(L.vs || ''));
    check('and draws its history as a line, with the high and low marked and the days underneath', L.segs >= 37 && /^(5\.31%\|4\.84%|\u20AC0\.9142\|\u20AC0\.8763)$/.test(L.ticks) && /^(Oct 1\|Nov 24|Sep 23\|Nov 24)$/.test(L.days) && L.inCard && L.fits);
    check('the chart is described for a reader who cannot see it', /, \d+ days from .* Low .* high .* latest /.test(L.says || ''));
    check('it reads out the latest day until someone moves along it', /^Nov 24: (4\.91%|\u20AC0\.9122)$/.test(L.read || ''));
    check('three tiles: the low, the high and the change', /^Low=.+\|High=.+\|Change=[+-]/.test(L.tiles) && /set (once )?each business day\.$/.test(L.about || ''));
    await page.mouse.move(L.gx + L.gw * 0.25, L.gy, { steps: 2 });
    await page.waitForTimeout(80);
    const R = await page.evaluate(() => { const card = document.getElementById('sa-tk-card'); const g = card.querySelector('svg.sa-tk-line'); return { open: !card.hidden, read: card.querySelector('.sa-tk-read').textContent, reading: g.classList.contains('reading'), cross: getComputedStyle(g.querySelector('.sa-tk-cross')).visibility }; });
    check('moving along the line reads out that day, and the card stays open', R.open && R.reading && R.cross === 'visible' && /^(Oct|Sep|Nov) \d+: /.test(R.read) && R.read !== L.read);
    check('the source is named, and its name is the link to the publisher, in a new tab', /^https:\/\/(home\.treasury\.gov|www\.ecb\.europa\.eu)\//.test(c.href || '') && c.target === '_blank' && c.rel === 'noopener' && /Treasury|European Central Bank/.test(c.linkText || ''));
    check('it says the tool runs on free public data, and makes no pitch', c.text.includes('This tool runs entirely on free public data. Yours could too.') && c.links === 1 && !/working for you/i.test(c.text));
    check('the card is under the strip and inside the window', c.inside && c.below);
    check('the strip stands still while it is read', c.paused);
    check('the card holds text and a link, nothing else', c.kids === 0);
    await page.mouse.move(700, 600, { steps: 3 });
    await page.waitForTimeout(450);
    check('moving away closes the card and the strip moves again', await page.evaluate(() => document.getElementById('sa-tk-card').hidden && getComputedStyle(document.querySelector('.sa-tk-track')).animationPlayState === 'running'));

    // the pause button
    await page.click('.sa-tk-pause');
    await page.mouse.move(700, 600);
    check('the pause button stops it', await page.evaluate(() => document.querySelector('.sa-tk-pause').getAttribute('aria-pressed') === 'true' && getComputedStyle(document.querySelector('.sa-tk-track')).animationPlayState === 'paused'));
    await page.click('.sa-tk-pause');
    await page.mouse.move(700, 600);
    check('and starts it again', await page.evaluate(() => document.querySelector('.sa-tk-pause').getAttribute('aria-pressed') === 'false' && getComputedStyle(document.querySelector('.sa-tk-track')).animationPlayState === 'running'));

    // the keyboard
    await page.evaluate(() => { document.querySelector('nav a:last-of-type').focus(); });
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('sa-tk-item'))) break;
    }
    const k = await page.evaluate(() => ({ id: document.activeElement.getAttribute('data-id'), open: !document.getElementById('sa-tk-card').hidden, expanded: document.activeElement.getAttribute('aria-expanded'), still: getComputedStyle(document.querySelector('.sa-tk-track')).animationName === 'none', title: document.querySelector('#sa-tk-card strong').textContent }));
    check('Tab reaches the first figure and opens its card', k.id === 'ria' && k.open && k.expanded === 'true' && k.title.startsWith('RIA deals announced in 2026'));
    // the deal count draws itself: the number, a bar toward the record, two years by the quarter
    const d = await page.evaluate(() => {
      const card = document.getElementById('sa-tk-card');
      const b = card.getBoundingClientRect();
      const bar = card.querySelector('.sa-tk-bar'), fill = bar && bar.firstElementChild;
      const cols = [...card.querySelectorAll('.sa-tk-col')];
      const tall = (sel) => { const e = card.querySelector(sel + ' i'); return e ? e.getBoundingClientRect().height : 0; };
      const plot = card.querySelector('.sa-tk-plot');
      const free = card.querySelector('.sa-tk-free');
      return {
        wide: card.classList.contains('sa-tk-wide'), big: (card.querySelector('.sa-tk-big') || {}).textContent, cap: (card.querySelector('.sa-tk-cap') || {}).textContent,
        share: bar && fill ? fill.getBoundingClientRect().width / bar.getBoundingClientRect().width : 0, barSays: bar && bar.getAttribute('aria-label'),
        ends: [...card.querySelectorAll('.sa-tk-ends span')].map((e) => e.textContent).join('|'),
        cols: cols.map((c) => c.className.replace('sa-tk-col ', '') + c.querySelector('.sa-tk-n').textContent).join(','),
        key: [...card.querySelectorAll('.sa-tk-k')].map((e) => e.textContent).join('|'), quarters: [...card.querySelectorAll('.sa-tk-q')].map((e) => e.textContent).join(''),
        t93: tall('.sa-tk-col.now'), t75: tall('.sa-tk-col.then'), t78: tall('.sa-tk-col.need'),
        plotSays: plot && plot.getAttribute('aria-label'), take: (card.querySelector('.sa-tk-take') || {}).textContent, facts: card.querySelectorAll('.sa-tk-facts li').length,
        from: (card.querySelector('.sa-tk-from') || {}).textContent, links: card.querySelectorAll('a').length,
        lastLine: free && free.lastElementChild ? free.lastElementChild.textContent : '',
        inside: b.left >= 0 && b.right <= window.innerWidth && b.bottom <= window.innerHeight, fits: card.scrollWidth <= card.clientWidth + 1,
        clipped: cols.some((c) => { const n = c.querySelector('.sa-tk-n'); return n.scrollWidth > n.clientWidth + 1; }),
        freeLines: free ? Math.round((free.getBoundingClientRect().height - parseFloat(getComputedStyle(free).paddingTop) - parseFloat(getComputedStyle(free).borderTopWidth)) / parseFloat(getComputedStyle(free).lineHeight)) : 0, kids: card.querySelectorAll('script,img,iframe').length,
      };
    });
    check('the deal count card leads with the number', d.wide && d.big === '244' && d.cap === 'January through September');
    check('a bar shows how far it is to the record, and says so in words', Math.abs(d.share - 0.76) < 0.02 && d.ends === '76% of the record|322 in 2025' && /244 so far, against 322 in 2025/.test(d.barSays || ''));
    check('two years side by side by the quarter, each column with its number', d.cols === 'then75,now93,then73,now74,then93,now77,then81,need78' && d.quarters === 'Q1Q2Q3Q4' && d.key === '2025|2026|needed to tie' && !d.clipped);
    check('the columns are as tall as their numbers say', d.t93 > d.t75 && Math.abs(d.t75 / d.t93 - 75 / 93) < 0.03 && d.t78 > 0);
    check('the chart is described for a reader who cannot see it', /^Deals by quarter\. 2026: Q1 93, Q2 74, Q3 77\. 2025: Q1 75/.test(d.plotSays || ''));
    check('with the takeaway, two facts, the source and when the next count is due', /would end 2026 at 325, a new record\.$/.test(d.take || '') && d.facts === 2 && /^Source: DeVoe & Company RIA Deal Book, third quarter 2026\. Next count: the full year, early in 2027\.$/.test(d.from || '') && d.links === 1);
    check('the drawn card fits the window, and its last line is not left with one word', d.inside && d.fits && d.freeLines === 2 && d.lastLine === 'Yours could too.' && d.kids === 0);
    check('the strip stands still for the keyboard', k.still);
    await page.keyboard.press('Enter');
    check('Enter goes to the source link', await page.evaluate(() => document.activeElement.tagName === 'A' && document.activeElement.closest('#sa-tk-card') !== null));
    await page.keyboard.press('Tab');
    check('Tab goes on to the next figure', await page.evaluate(() => document.activeElement.getAttribute('data-id') === 'ust30' && document.querySelector('#sa-tk-card strong').textContent.startsWith('U.S. 30-year')));
    await page.keyboard.press('Enter');
    const K1 = await page.evaluate(() => ({ onChart: document.activeElement.matches('svg.sa-tk-line'), read: document.querySelector('#sa-tk-card .sa-tk-read').textContent }));
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const K2 = await page.evaluate(() => ({ read: document.querySelector('#sa-tk-card .sa-tk-read').textContent, open: !document.getElementById('sa-tk-card').hidden }));
    check('Enter on a market figure goes to its chart, and the arrow keys read it day by day', K1.onChart && /^Nov 24: 5\.30%$/.test(K1.read) && K2.open && /^Nov 20: /.test(K2.read));
    await page.keyboard.press('Tab');
    check('Tab goes from the chart to the source link', await page.evaluate(() => document.activeElement.tagName === 'A' && !!document.activeElement.closest('#sa-tk-card')));
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    check('and Shift+Tab from the chart goes back to the figure', await page.evaluate(() => document.activeElement.getAttribute('data-id') === 'ust30' && document.getElementById('sa-tk-card').hidden));
    await page.evaluate(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Escape');
    check('Escape closes the card', await page.evaluate(() => document.getElementById('sa-tk-card').hidden));
    await page.focus('.sa-tk-tag');
    await page.keyboard.press('Enter');
    const first = await page.evaluate(() => ({ inCard: !!document.activeElement.closest('#sa-tk-card'), text: document.activeElement.textContent }));
    await page.keyboard.press('Tab');
    const second = await page.evaluate(() => ({ inCard: !!document.activeElement.closest('#sa-tk-card'), text: document.activeElement.textContent }));
    check('from the label, Enter and Tab walk the sources', first.inCard && first.text === 'DeVoe & Company' && second.inCard && second.text === 'U.S. Department of the Treasury');
    await page.keyboard.press('Escape');
    check('and Escape goes back to the label', await page.evaluate(() => document.getElementById('sa-tk-card').hidden && document.activeElement.classList.contains('sa-tk-tag')));
    check('no script error on the page', errors.length === 0);
    await ctx.close();
  }

  // --- a phone
  {
    const { ctx, page } = await open(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.waitForSelector('#sa-ticker.on', { timeout: 8000 });
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => {
      const r = document.getElementById('sa-ticker').getBoundingClientRect();
      return { top: Math.round(r.top), navBottom: document.getElementById('main-nav').offsetHeight, heroTop: Math.round(document.querySelector('.page-hero-tag').getBoundingClientRect().top), bottom: Math.round(r.bottom), pageWide: document.documentElement.scrollWidth <= window.innerWidth };
    });
    check('on a phone it sits under the menu, above the headline, and the page is no wider', s.top === s.navBottom && s.bottom <= s.heroTop && s.pageWide);
    let p = null;
    for (const id of ['ria', 'ust30', 'ust10', 'eurusd', 'btc', 'brent', 'wti', 'gas']) { p = await spot(page, id); if (p) break; }
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(250);
    const c = await page.evaluate(() => { const card = document.getElementById('sa-tk-card'); const b = card.getBoundingClientRect(); return { open: !card.hidden, inside: b.left >= 0 && b.right <= window.innerWidth, id: (document.querySelector('.sa-tk-item.open') || document.body).getAttribute('data-id') }; });
    check('a tap opens the card, inside the screen', c.open && c.inside && !!c.id);
    const again = await page.evaluate(() => { const b = document.querySelector('.sa-tk-item.open').getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 40), y: b.top + b.height / 2 }; });
    await page.touchscreen.tap(Math.max(again.x, 130), again.y);
    await page.waitForTimeout(250);
    check('a second tap closes it', await page.evaluate(() => document.getElementById('sa-tk-card').hidden));
    await ctx.close();
  }

  // --- a narrow phone, where the menu wraps tall
  {
    const { ctx, page } = await open(browser, { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.waitForSelector('#sa-ticker.on', { timeout: 8000 });
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ strip: Math.round(document.getElementById('sa-ticker').getBoundingClientRect().bottom), first: Math.round(document.querySelector('.page-hero-tag').getBoundingClientRect().top), wide: document.documentElement.scrollWidth <= window.innerWidth }));
    check('on a narrow phone the strip does not sit on the first line of the page', s.strip < s.first && s.wide);
    const follows = await page.evaluate(async () => {
      const nav = document.getElementById('main-nav'); nav.style.paddingBottom = '31px';      // as a late font or a longer menu would
      await new Promise((r) => setTimeout(r, 300));
      const r = document.getElementById('sa-ticker').getBoundingClientRect();
      return { top: Math.round(r.top), nav: nav.offsetHeight, first: Math.round(document.querySelector('.page-hero-tag').getBoundingClientRect().top), bottom: Math.round(r.bottom) };
    });
    check('when the menu grows after the strip is up, the strip moves down with it and stays clear of the page', follows.top === follows.nav && follows.bottom < follows.first);
    await ctx.close();
  }

  // --- less motion asked for
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.waitForSelector('#sa-ticker.on', { timeout: 8000 });
    const s = await page.evaluate(() => ({ sets: document.querySelectorAll('.sa-tk-set').length, anim: getComputedStyle(document.querySelector('.sa-tk-track')).animationName, pause: getComputedStyle(document.querySelector('.sa-tk-pause')).display }));
    check('for a visitor who asked for less motion it does not move', s.sets === 1 && s.anim === 'none' && s.pause === 'none');
    await ctx.close();
  }

  // --- the feed is down, or has too little
  for (const [name, body] of [['down', null], ['two figures', 2], ['not ok', 'bad']]) {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 1440, height: 900 } }, async (page) => {
      await page.route('**/market/feed.php', async (route) => {
        if (body === null) return route.abort();
        if (body === 'bad') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"items":[]}' });
        const r = await route.fetch();
        const d = await r.json();
        d.items = d.items.slice(0, body);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
      });
    });
    await page.waitForTimeout(900);
    check('feed ' + name + ': no strip, and no error', (await page.evaluate(() => document.getElementById('sa-ticker').hidden)) && errors.length === 0);
    await ctx.close();
  }

  // --- a feed that tries markup
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 } }, async (page) => {
      await page.route('**/market/feed.php', async (route) => {
        const r = await route.fetch();
        const d = await r.json();
        d.items[0].label = '<img src=x onerror="window.__hit=1">';
        d.items[0].card.text = '<script>window.__hit=1</script>';
        const bad = '<img src=x onerror="window.__hit=1">';
        d.items[0].card.eyebrow = bad;
        d.items[0].card.hero = { value: bad, label: bad };
        d.items[0].card.meter = { pct: '50%" onmouseover="window.__hit=1', left: bad, right: bad, label: bad };
        d.items[0].card.chart = { title: bad, now: bad, then: bad, need: bad, note: bad, label: bad, rows: [{ q: bad, then: bad, now: '9;background:url(x)' }, { q: 'Q2', then: 4, now: 1e9, need: -3 }] };
        d.items[0].card.facts = [bad, { a: 1 }, 7];
        d.items[0].card.next = bad;
        d.items[1].card.eyebrow = bad;
        d.items[1].card.hero = { value: bad, label: bad, delta: bad, dir: '"><img src=x onerror="window.__hit=1">', vs: bad };
        d.items[1].card.line = { title: bad, unit: 'pct', label: bad, points: [[bad, 1], ['2026-11-01', bad], ['2026-11-02', 1], ['2026-11-03', 2], ['2026-11-04', 3], ['2026-11-05', 4], ['2026-11-06', 5]] };
        d.items[1].card.tiles = [{ label: bad, value: bad, note: bad, dir: bad }, bad, 7];
        d.items[1].card.about = bad;
        d.items[2].card.line = { title: 'x', unit: bad, points: d.items[2].card.line.points };
        d.items[0].card.url = 'javascript:window.__hit=1';
        d.sources[0] = { name: '<img src=x onerror="window.__hit=1">', url: 'javascript:window.__hit=1' };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
      });
    });
    await page.waitForSelector('#sa-ticker.on', { timeout: 8000 });
    await page.evaluate(() => { document.querySelector('.sa-tk-item').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); });
    const s = await page.evaluate(() => ({ hit: window.__hit === 1, imgs: document.querySelectorAll('#sa-ticker img, #sa-ticker script').length, link: !!document.querySelector('#sa-tk-card a'), open: !document.getElementById('sa-tk-card').hidden }));
    check('markup in the feed is shown as text and a link that is not https is dropped', !s.hit && s.imgs === 0 && s.open && !s.link);
    const u = await page.evaluate(() => { const card = document.getElementById('sa-tk-card'); return { cols: card.querySelectorAll('.sa-tk-col').length, bar: card.querySelectorAll('.sa-tk-bar').length, shown: card.textContent.includes('<img src=x'), styled: [...card.querySelectorAll('[style]')].every((e) => /^(width|height): \d+(px|%);$/.test(e.getAttribute('style'))) }; });
    check('a drawn card takes only whole numbers as sizes: a bad one draws nothing', u.cols === 1 && u.bar === 0 && u.shown && u.styled);
    const draw = (i) => page.evaluate((i) => { document.querySelectorAll('.sa-tk-item')[i].dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); const card = document.getElementById('sa-tk-card'); const p = card.querySelector('.sa-tk-path'); return { hit: window.__hit === 1, imgs: card.querySelectorAll('img,script,iframe').length, line: !!card.querySelector('svg.sa-tk-line'), segs: p ? p.getAttribute('d').split('L').length : 0, chip: (card.querySelector('.sa-tk-chip') || {}).className, tiles: card.querySelectorAll('.sa-tk-tile').length, shown: card.textContent.includes('<img src=x') }; }, i);
    const v = await draw(1);
    check('a market figure with markup in it: shown as text, and only real days with real values are drawn', !v.hit && v.imgs === 0 && v.line && v.segs === 5 && v.chip === 'sa-tk-chip flat' && v.tiles === 1 && v.shown);
    const fxCard = await page.evaluate(() => { const i = [...document.querySelectorAll('.sa-tk-item')].findIndex((e) => e.getAttribute('data-id') === 'eurusd'); document.querySelectorAll('.sa-tk-item')[i].dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); const card = document.getElementById('sa-tk-card'); return { pair: [...card.querySelectorAll('.sa-tk-pair span')].map((e) => e.textContent).join('|'), verdict: (card.querySelector('.sa-tk-verdict') || {}).textContent, big: (card.querySelector('.sa-tk-big') || {}).textContent, fits: card.scrollWidth <= card.clientWidth + 1 && [...card.querySelectorAll('.sa-tk-pair span')].every((e) => e.scrollWidth <= e.clientWidth + 1) }; });
    check('the dollar card gives the rate both ways round and says which is worth more', fxCard.pair === '$1 = \u20AC0.9122|\u20AC1 = $1.0963' && fxCard.verdict === 'The euro is worth more: one euro buys $1.10.' && fxCard.big === '\u20AC0.9122' && fxCard.fits);
    const w = await draw(2);
    check('a unit the strip does not know draws no chart', !w.hit && w.imgs === 0 && !w.line);
    await page.evaluate(() => { document.querySelector('.sa-tk-tag').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); });
    const t = await page.evaluate(() => ({ hit: window.__hit === 1, imgs: document.querySelectorAll('#sa-ticker img, #sa-ticker script').length, links: document.querySelectorAll('#sa-tk-card a').length, items: document.querySelectorAll('#sa-tk-card li').length, bad: [...document.querySelectorAll('#sa-tk-card a')].some((a) => !/^https:/.test(a.href)) }));
    check('and the same holds for the list of sources', !t.hit && t.imgs === 0 && t.items === t.links + 1 && !t.bad);
    await ctx.close();
  }

  // --- the home page, which gave the strip up
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const asked = [];
    page.on('request', (r) => { if (/ticker\.(js|css)|market\/feed/.test(r.url())) asked.push(r.url()); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(new URL('/', url).href, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const h = await page.evaluate(() => { const m = document.querySelector('.hero h1 .h1-main').getBoundingClientRect(), e = document.querySelector('.hero h1 em').getBoundingClientRect(); return { strip: !!document.querySelector('#sa-ticker, .sa-tk'), pad: document.querySelector('.hero').style.paddingTop, below: e.top >= m.bottom - 2, left: Math.abs(e.left - m.left) < 2, text: document.querySelector('.hero h1').textContent }; });
    check('the home page has no strip, asks for none of its files, and its first screen is as it was', !h.strip && asked.length === 0 && h.pad === '');
    check('the home page headline is two lines: the statement, then the ask beneath it', h.below && h.left && h.text === 'Buyers will look at your data. Make sure it is ready.');
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' browser checks failed'); process.exit(1); }
  console.log('ok, ' + n + ' browser checks');
})().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
