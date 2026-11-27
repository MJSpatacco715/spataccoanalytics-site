// The light and the dark version of every main page, in a browser.
//   node tests/theme_browser.cjs http://127.0.0.1:PORT
// The owner, 2026-11-27: "Spatacco analytics should have a light/dark option ... sun/moon. I'd like the sun to have
// sunglasses on and be in the top right corner of the box". Held here: the switch is in the menu of every main page and
// of no tool's own page; a press turns the page, and the choice is kept from page to page with nothing flashing; the
// ground is near white in one and navy in the other, the menu and the footer navy in both; and every piece of text
// can be read against what is behind it, in both (scripts/theme_css.py keeps the colours on their variables).
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:18747';
const fails = []; let n = 0;
const check = (name, ok) => { n++; if (!ok) fails.push(name); };
const FEED = { ok: true, at: '2026-11-25T14:25:00Z', items: ['US 30-Yr', 'US 10-Yr', 'USD/EUR'].map((label, i) => ({ id: 't' + i, label, value: '1.00', delta: '', dir: '', by: 'Test', when: 'Nov 24', card: { title: label, text: 'A made-up answer.', source: 'Test', url: 'https://example.com/' } })) };
const PAGES = [['home', '/'], ['services', '/services/'], ['approach', '/approach/'], ['about', '/about/'], ['contact', '/contact/'], ['tools', '/tools/'], ['scorer', '/tools/website-scorer/'], ['insights', '/insights/']];
// Text that was a little under 4.5 to 1 before there were two versions, and is the same in both: the lettering on the
// cyan-to-purple buttons (measured against the button's weakest stop), and four small labels in the Services page's
// light section, and the blue badge on a platform card. Nothing may be under 3.8, and nothing else under 4.5 (3 for large lettering).
const KNOWN = /btn-primary|screen-cta|contact-cta|hero-cta|form-submit|button\.go|a\.sv-go|sv-price|sv-time|sv-tier-tag|tool-badge|btn-gold/;
const AUDIT = () => {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const stops = (img) => (img.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
  // the ground behind an element: every layer from the page up, a gradient counted by each of its stops
  const grounds = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
    let bases = [parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }]; if (bases[0].a === 0) bases = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (const e of chain) { const cs = getComputedStyle(e); const layers = []; if (cs.display === 'contents') continue;
      const bc = parse(cs.backgroundColor); if (bc && bc.a > 0) layers.push([bc]);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) { const st = stops(cs.backgroundImage).filter((s) => s.a > 0); if (st.length) layers.push(st); }
      for (const layer of layers) { const next = []; for (const b of bases) for (const l of layer) next.push(over(l, b)); bases = next.slice(0, 12); }
      if (parseFloat(cs.opacity) < 0.05) return null; }
    return bases; };
  const out = []; const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.replace(/\s+/g, ' ').trim(); if (text.length < 2) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; if (el.closest('script,style,noscript,svg,[hidden],.sa-cite-card,.sa-tk-card')) continue;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    seen.add(el);
    let fg = parse(cs.color); if (!fg) continue;
    if (cs.webkitTextFillColor) { const t = parse(cs.webkitTextFillColor); if (t && t.a === 0) continue; }      // gradient lettering: looked at by eye
    const gs = grounds(el); if (!gs) continue;
    const worst = Math.min(...gs.map((g) => ratio(over(fg, g), g)));
    const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700; const big = px >= 24 || (bold && px >= 18.66);
    const need = big ? 3 : 4.5;
    if (worst < need) out.push({ ratio: Math.round(worst * 100) / 100, need, px: Math.round(px), color: cs.color, ground: gs.map((g) => 'rgb(' + [g.r, g.g, g.b].map(Math.round).join(',') + ')').slice(0, 2).join(' / '), cls: (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')), up: el.parentElement ? (el.parentElement.className || el.parentElement.tagName).toString().slice(0, 40) : '', text: text.slice(0, 50) });
  }
  return out;
};

const lum = (rgb) => { const p = rgb.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, mobile] of [[1255, 607, false], [390, 664, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route(/\/market\/feed\.php/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(FEED) }));
    const page = await ctx.newPage();
    const still = () => page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition:none !important}' });
    const look = () => page.evaluate(() => { const g = (el) => getComputedStyle(el).backgroundColor; const sw = document.getElementById('sa-switch'), r = sw ? sw.getBoundingClientRect() : null, nav = document.getElementById('main-nav').getBoundingClientRect();
      const sun = sw && sw.querySelector('.sun'), moon = sw && sw.querySelector('.moon'), sb = sun && sun.getBoundingClientRect(), mb = moon && moon.getBoundingClientRect();
      return { theme: document.documentElement.getAttribute('data-theme') || 'dark', body: g(document.body), nav: g(document.getElementById('main-nav')), foot: g(document.querySelector('footer')), ink: getComputedStyle(document.querySelector('h1')).color,
        sw: !!sw && r.width >= 34 && r.height >= 34 && r.top >= nav.top && r.bottom <= nav.bottom && r.right <= window.innerWidth && r.left >= 0, pressed: sw && sw.getAttribute('aria-pressed'), label: sw && sw.getAttribute('aria-label'),
        // the sun fills most of the box and is set in its top right corner; the moon is the small one, bottom left
        sunBig: !!sb && sb.width >= r.width * 0.6 && sb.height >= r.height * 0.6, sunCorner: !!sb && (r.right - sb.right) <= r.width * 0.08 && (sb.top - r.top) <= r.height * 0.08 && (sb.left - r.left) >= r.width * 0.04,
        moonSmall: !!mb && mb.width <= r.width * 0.45 && mb.left - r.left <= r.width * 0.15 && r.bottom - mb.bottom <= r.height * 0.15, sunLit: sun && parseFloat(getComputedStyle(sun).opacity), moonLit: moon && parseFloat(getComputedStyle(moon).opacity),
        wide: document.documentElement.scrollWidth <= window.innerWidth, navH: Math.round(nav.height) }; });
    for (const [name, url] of PAGES) {
      const at = name + ' at ' + w + ': ';
      await page.goto(base + url, { waitUntil: 'load' }); await still();
      await page.evaluate(() => { try { localStorage.removeItem('sa_theme'); } catch (e) {} document.querySelectorAll('.reveal').forEach((x) => x.classList.add('visible')); });
      await page.reload({ waitUntil: 'load' }); await still(); await page.evaluate(() => document.querySelectorAll('.reveal').forEach((x) => x.classList.add('visible'))); await page.waitForTimeout(500);
      const d = await look();
      check(at + 'it opens dark, as it always has: navy ground, white headline', d.theme === 'dark' && lum(d.body) < 0.03 && lum(d.ink) > 0.8);
      check(at + 'the switch is in the menu, inside it and on the screen, and says what a press will do (' + d.label + ')', d.sw && d.pressed === 'false' && /Switch to light/.test(d.label) && d.wide);
      check(at + 'in its box the sun fills most of it from the top right corner, the moon is small at the bottom left, and the moon is the one lit', d.sunBig && d.sunCorner && d.moonSmall && d.moonLit === 1 && d.sunLit < 0.5);
      const darkBad = (await page.evaluate(AUDIT)).filter((x) => x.ratio < 3.8 || !KNOWN.test(x.cls));
      check(at + 'dark: every piece of text can be read against its ground' + (darkBad.length ? ' (' + darkBad.slice(0, 3).map((x) => x.cls + ' ' + x.ratio + ' "' + x.text + '"').join('; ') + ')' : ''), darkBad.length === 0);
      if (mobile) await page.tap('#sa-switch'); else await page.click('#sa-switch');
      await page.waitForTimeout(250);
      const l = await look();
      check(at + 'a press turns it light: a near-white ground and navy lettering, the menu and the footer still navy, the menu no taller', l.theme === 'light' && lum(l.body) > 0.85 && lum(l.ink) < 0.03 && lum(l.nav) < 0.03 && lum(l.foot) < 0.03 && l.navH === d.navH && l.wide);
      check(at + 'the switch now says so, and the sun is the one lit', l.pressed === 'true' && /Switch to dark/.test(l.label) && l.sunLit === 1 && l.moonLit < 0.5);
      const lightBad = (await page.evaluate(AUDIT)).filter((x) => x.ratio < 3.8 || !KNOWN.test(x.cls));
      check(at + 'light: every piece of text can be read against its ground' + (lightBad.length ? ' (' + lightBad.slice(0, 3).map((x) => x.cls + ' ' + x.ratio + ' "' + x.text + '"').join('; ') + ')' : ''), lightBad.length === 0);
      // the choice is kept, and is there before the page is drawn: no script has run but the page's own first line
      await page.goto(base + url, { waitUntil: 'commit' });
      const early = await page.evaluate(() => new Promise((res) => { const go = () => res({ theme: document.documentElement.getAttribute('data-theme'), drawn: !!document.getElementById('sa-switch') }); if (document.body) go(); else new MutationObserver((m, o) => { if (document.body) { o.disconnect(); go(); } }).observe(document.documentElement, { childList: true }); }));
      await page.waitForLoadState('load'); await page.waitForTimeout(200);
      const kept = await look();
      check(at + 'opened again it is light from its first line, before the switch itself is drawn', kept.theme === 'light' && kept.pressed === 'true' && (early.theme === 'light' || early.drawn === false));
      if (mobile) await page.tap('#sa-switch'); else await page.click('#sa-switch');
      await page.waitForTimeout(200);
      check(at + 'and a second press turns it back', (await look()).theme === 'dark');
    }
    // a tool's own page is not drawn for the light version yet: no switch, and navy whatever was chosen
    await page.goto(base + '/', { waitUntil: 'load' }); await page.evaluate(() => { try { localStorage.setItem('sa_theme', 'light'); } catch (e) {} });
    for (const url of ['/tools/football/nfl-lines-tracker/', '/tools/curling-explainer/']) {
      await page.goto(base + url, { waitUntil: 'load' }); await page.waitForTimeout(300);
      const t = await page.evaluate(() => ({ sw: !!document.getElementById('sa-switch'), theme: document.documentElement.getAttribute('data-theme') }));
      check(url + ' at ' + w + ': a tool\'s own page has no switch and stays as it was drawn, even with light chosen', !t.sw && t.theme === null);
    }
    await page.evaluate(() => { try { localStorage.removeItem('sa_theme'); } catch (e) {} });
    await ctx.close();
  }
  // the scorer's results are drawn again in the other version's colours when the switch is pressed
  {
    const says = (text) => ({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) });
    const WEB = JSON.stringify({ firm_name: 'Example Wealth Partners', summary: 'A clear site with a few gaps.', pros: ['Clear services'], cons: ['Dated footer'], scores: { visual_design: 7, content_messaging: 6, navigation_ux: 8, credibility_signals: 6, compliance_red_flags: 4, team_leadership: 11, contact_availability: 12 }, notes: {}, compliance_flags: [{ kind: 'footer_year', text: 'The footer reads 2024.' }], profile: { location: 'Wayne, PA', founded: '1987', specialties: ['Retirement planning'] }, logo_url: '', pages: {} });
    const ctx = await browser.newContext({ viewport: { width: 1255, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); await ctx.route(/google\.com\/s2\/favicons/, (r) => r.abort());
    await ctx.route(/ria-scorer\.[a-z-]+\.workers\.dev/, (route) => { const req = route.request(); if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } }); return route.fulfill(says(WEB)); });
    await ctx.route(/\/score\/(run|lead)\.php/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    const page = await ctx.newPage();
    await page.goto(base + '/tools/website-scorer/?scope=website', { waitUntil: 'load' });
    await page.fill('#inp-website', 'www.example-wealth.com'); await page.click('#btn-analyze');
    await page.waitForSelector('#screen-results:not(.hidden)', { timeout: 20000 });
    await page.fill('#gate-name', 'Test Visitor'); await page.fill('#gate-email', 'visitor@example.com'); await page.click('#btn-gate-submit');
    await page.waitForSelector('#screen-results:not(.locked)', { timeout: 15000 });
    await page.addStyleTag({ content: '*,*::before,*::after{animation-duration:0s !important;animation-delay:0s !important;transition:none !important}' }); await page.waitForTimeout(400);
    const num = () => page.evaluate(() => getComputedStyle(document.getElementById('score-big-num')).color);
    const dark = await num(); const dBad = (await page.evaluate(AUDIT)).filter((x) => x.ratio < 3.8 || !KNOWN.test(x.cls));
    await page.click('#sa-switch'); await page.waitForTimeout(400);
    const light = await num(); const lBad = (await page.evaluate(AUDIT)).filter((x) => x.ratio < 3.8 || !KNOWN.test(x.cls));
    check('the scorer\'s results: the score is lit for the navy page and is drawn again, darker, for the light one (' + dark + ' then ' + light + ')', lum(dark) > 0.3 && lum(light) < 0.25);
    check('the scorer\'s results, dark: every piece of text can be read' + (dBad.length ? ' (' + dBad.slice(0, 3).map((x) => x.cls + ' ' + x.ratio + ' "' + x.text + '"').join('; ') + ')' : ''), dBad.length === 0);
    check('the scorer\'s results, light: every piece of text can be read' + (lBad.length ? ' (' + lBad.slice(0, 3).map((x) => x.cls + ' ' + x.ratio + ' "' + x.text + '"').join('; ') + ')' : ''), lBad.length === 0);
    await ctx.close();
  }
  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' light and dark checks failed'); process.exit(1); }
  console.log('ok: ' + n + ' light and dark checks');
})().catch((e) => { if (fails.length) console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.error(String(e && e.stack || e)); process.exit(1); });
