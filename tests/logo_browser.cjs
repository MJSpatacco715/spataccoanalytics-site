// The menu and footer logos, opened in a real browser. Run by tests/pages_test.sh
// (where Playwright is installed) against the built site:
//   node tests/logo_browser.cjs http://127.0.0.1:PORT
// The owner, 2026-11-26: "the logo is small and near invisible on the site". It
// was a white square 36px tall with the name about 8px tall inside it.
const { chromium } = require('playwright');
const base = process.argv[2];
const fails = []; let n = 0;
function check(name, pass) { n++; if (!pass) fails.push(name); }

function measure(page) {
  return page.evaluate(async () => {
    const nav = document.getElementById('main-nav'), img = nav.querySelector('img.logo');
    const box = (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const l = box(img), links = [...nav.querySelectorAll('.nav-links a')].map(box);
    // what the logo is made of: clear ground, light lettering
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, solid = 0, light = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 10) clear++; else if (d[i + 3] > 245) { solid++; if (d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225) light++; } }
    const px = d.length / 4;
    const fm = document.querySelector('footer img.footer-mark'), fl = document.querySelector('footer img.footer-logo');
    return {
      nav: nav.offsetHeight, logo: l, loaded: img.naturalWidth > 0, src: img.getAttribute('src'),
      // the page grows with the window where it says so (scripts/scale_css.py): sizes are judged against that
      grown: parseFloat(getComputedStyle(document.documentElement).fontSize) / 16,
      rows: new Set(links.map((x) => Math.round(x.top))).size, linkPx: parseFloat(getComputedStyle(nav.querySelector('.nav-links a')).fontSize),
      clearShare: clear / px, lightShare: light / Math.max(solid, 1),
      corner: d[3],
      linksIn: links.length === 5 && links.every((x) => x.left >= 0 && x.right <= window.innerWidth),
      apart: links.every((x) => x.left >= l.right || x.top >= l.bottom || x.bottom <= l.top),
      pageWide: document.documentElement.scrollWidth <= window.innerWidth,
      mark: fm ? Object.assign(box(fm), { loaded: fm.naturalWidth > 0 }) : null,
      word: fl ? Object.assign(box(fl), { loaded: fl.naturalWidth > 0 }) : null,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const pages = ['/', '/services/', '/approach/', '/tools/', '/about/', '/contact/', '/insights/', '/tools/football/nfl-lines-tracker.html'];

  // --- a desktop
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    for (const path of pages) {
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForTimeout(150);
      const m = await measure(page);
      check(path + ': the menu shows the wordmark, loaded, at least 44px tall and 130px wide (it is ' + m.logo.w + ' by ' + m.logo.h + ')', m.loaded && m.logo.h >= 44 && m.logo.w >= 130);
      check(path + ': it is the wordmark alone on clear ground with light lettering, not a white square', /^\/img\/wordmark-on-dark\.png\?v=[0-9a-f]{8}$/.test(m.src || '') && m.corner === 0 && m.clearShare > 0.35 && m.lightShare > 0.6 && m.logo.w > m.logo.h * 2.5);
      check(path + ': the bar is no taller for it (' + m.nav + 'px, the page drawn at ' + m.grown.toFixed(2) + ') and the five links sit clear of it', m.nav <= 80 * m.grown + 1 && m.linksIn && m.apart);
      check(path + ': the footer signs off with the SA mark and then the wordmark, both loaded', !!m.mark && !!m.word && m.mark.loaded && m.word.loaded && m.mark.w === m.mark.h && m.mark.h >= 36 && m.word.h >= 32 && m.mark.right <= m.word.left);
    }
    await ctx.close();
  }

  // --- a phone, and a narrow one
  for (const [w, h] of [[390, 844], [320, 640]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    for (const path of ['/', '/tools/', '/insights/']) {
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForTimeout(150);
      const m = await measure(page);
      check(path + ' at ' + w + 'px: the wordmark is at least 36px tall, the five links are in view under it, and the page is no wider', m.loaded && m.logo.h >= 36 && m.logo.w >= 110 && m.linksIn && m.apart && m.pageWide);
      check(path + ' at ' + w + 'px: the footer pair fits the screen', !!m.mark && !!m.word && m.mark.left >= 0 && m.word.right <= w);
      // the smallest text a phone shows is 13px; on a phone narrower than any sold now the five are set smaller, not wrapped
      check(path + ' at ' + w + 'px: the five links share one row, at ' + m.linkPx + 'px', m.rows === 1 && (w >= 360 ? m.linkPx >= 13 : m.linkPx >= 11));
    }
    await ctx.close();
  }

  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' logo checks failed'); process.exit(1); }
  console.log('ok: ' + n + ' logo checks');
})().catch((e) => { if (fails.length) console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.error(String(e && e.stack || e)); process.exit(1); });
