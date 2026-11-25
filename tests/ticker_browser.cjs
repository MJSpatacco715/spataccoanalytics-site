// The market strip opened in a browser (tests/market_test.sh runs this where
// Playwright is installed). The page is the built homepage, served with the
// saved answers, so nothing here leaves the machine.
//   node tests/ticker_browser.cjs http://127.0.0.1:18746/
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
        heroTop: Math.round(document.querySelector('.hero-tag').getBoundingClientRect().top),
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
    check('the copies are hidden from assistive technology and from the Tab key', s.sets >= 2 && s.firstHidden === null && s.copiesHidden && s.copiesOutOfTabs);
    check('it sits directly under the menu and above the headline', s.top === s.navBottom && s.bottom < s.heroTop && s.height <= 36);
    check('it scrolls, with no seam', s.moving && s.trackWide);
    check('a figure shows its value, its move, who published it and for when', s.text.includes('US 10-Yr') && s.text.includes('4.91%') && s.text.includes('-1 bp') && s.text.includes('Treasury, Nov 24') && s.text.includes('EIA, Nov 17'));
    check('it says what the figures are', s.note && s.text.includes('These quotes are latest published figures and not necessarily live.'));
    check('the note rides on every other pass of the figures, not every one', /^(n-)+$/.test(s.notes) && s.sets % 4 === 0 && s.noWordTwice);
    check('the page is no wider than the window', s.pageWide);
    const h = await page.evaluate(() => { const m = document.querySelector('.hero h1 .h1-main').getBoundingClientRect(), e = document.querySelector('.hero h1 em').getBoundingClientRect(); return { below: e.top >= m.bottom - 2, left: Math.abs(e.left - m.left) < 2, text: document.querySelector('.hero h1').textContent }; });
    check('the headline is two lines: the statement, then the ask beneath it', h.below && h.left && h.text === 'Buyers will look at your data. Make sure it is ready.');

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
    const c = await page.evaluate(() => {
      const card = document.getElementById('sa-tk-card');
      const a = card.querySelector('a');
      const b = card.getBoundingClientRect();
      return { open: !card.hidden, text: card.textContent, links: card.querySelectorAll('a').length, linkText: a && a.textContent, href: a && a.href, target: a && a.target, rel: a && a.rel, inside: b.left >= 0 && b.right <= window.innerWidth, below: b.top >= document.getElementById('sa-ticker').getBoundingClientRect().bottom, paused: getComputedStyle(document.querySelector('.sa-tk-track')).animationPlayState === 'paused', kids: card.querySelectorAll('script,img,iframe').length };
    });
    check('hover opens the source card', c.open && /Treasury yield: |Euro in U\.S\. dollars: /.test(c.text) && c.text.includes('Source: '));
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
      return { top: Math.round(r.top), navBottom: document.getElementById('main-nav').offsetHeight, heroTop: Math.round(document.querySelector('.hero-tag').getBoundingClientRect().top), bottom: Math.round(r.bottom), pageWide: document.documentElement.scrollWidth <= window.innerWidth };
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
    const s = await page.evaluate(() => ({ strip: Math.round(document.getElementById('sa-ticker').getBoundingClientRect().bottom), first: Math.round(document.querySelector('.hero-tag').getBoundingClientRect().top), wide: document.documentElement.scrollWidth <= window.innerWidth }));
    check('on a narrow phone the strip does not sit on the first line of the page', s.strip < s.first && s.wide);
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
    await page.evaluate(() => { document.querySelector('.sa-tk-tag').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); });
    const t = await page.evaluate(() => ({ hit: window.__hit === 1, imgs: document.querySelectorAll('#sa-ticker img, #sa-ticker script').length, links: document.querySelectorAll('#sa-tk-card a').length, items: document.querySelectorAll('#sa-tk-card li').length, bad: [...document.querySelectorAll('#sa-tk-card a')].some((a) => !/^https:/.test(a.href)) }));
    check('and the same holds for the list of sources', !t.hit && t.imgs === 0 && t.items === t.links + 1 && !t.bad);
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' browser checks failed'); process.exit(1); }
  console.log('ok, ' + n + ' browser checks');
})().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
