// The Website Scorer's field, opened in a real browser. Run by tests/pages_test.sh
// (where Playwright is installed) against the built site:
//   node tests/scorer_browser.cjs http://127.0.0.1:PORT
// The owner, 2026-11-26: "Can we soften the website score input matching a bit? If i
// type a firm name (and not website (not https not even www)) could it offer user
// option of 'is this the right one?' With logic (and shown/listed confidence per card
// shown)". The matches come from the search the scorer already runs, through its relay.
// The relay is stood in for here: nothing leaves the machine, and no score is run.
const { chromium } = require('playwright');
const base = process.argv[2];
const fails = []; let n = 0;
function check(name, pass) { n++; if (!pass) fails.push(name); }

const FIND = 'Find the official website of a financial advisory firm from the name a visitor typed.';
const SCORE = 'You are a knowledgeable digital marketing consultant helping a financial advisor or RIA';
const says = (text) => ({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) });
const refuses = (status, message) => ({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ type: 'error', error: { type: 'x', message } }) });
const SCORED = JSON.stringify({ firm_name: 'Smith Wealth Management', summary: 'Clear site. Add proof.', pros: ['a'], cons: ['b'],
  scores: { visual_design: 9, content_messaging: 8, navigation_ux: 6, credibility_signals: 5, team_leadership: 9, contact_availability: 10 },
  notes: { visual_design: 'x', content_messaging: 'x', navigation_ux: 'x', credibility_signals: 'x', team_leadership: 'x', contact_availability: 'x' } });
// What a search for a name might answer: two real candidates out of order, one with markup in
// its name, and four that must not be shown (a directory, a repeat, a weak one, no site).
const FOUND = JSON.stringify({ candidates: [
  { name: 'Smith Wealth Advisors <img src=x onerror="window.__hit=1">', website: 'smithwa.example', location: 'Tampa, FL', confidence: 54, why: ['Similar name, different city'] },
  { name: 'Smith Wealth Management', website: 'https://www.smithwealth.example/', location: 'Austin, TX', confidence: 88, why: ['Name matches exactly', 'Its own site names the firm', 'Only firm found by this name', 'a fourth reason that is one too many'] },
  { name: 'Smith Wealth on LinkedIn', website: 'https://www.linkedin.com/company/smith-wealth', location: '', confidence: 90, why: ['A directory page'] },
  { name: 'Smith Wealth Management again', website: 'smithwealth.example/about', location: 'Austin, TX', confidence: 70, why: ['The same site'] },
  { name: 'Smythe Capital', website: 'smythe.example', location: 'Reno, NV', confidence: 12, why: ['Barely alike'] },
  { name: 'No Site Partners', website: 'not a site', location: '', confidence: 80, why: ['Nothing to score'] },
] });

(async () => {
  const browser = await chromium.launch();
  // One page with the relay stood in for. `answer` decides what a lookup gets; every request is kept.
  const open = async (opts, answer) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const sent = [], errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.route(/ria-scorer\.[a-z-]+\.workers\.dev/, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
      const body = JSON.parse(req.postData() || '{}');
      const c = body.messages && body.messages[0] ? body.messages[0].content : '';
      const text = typeof c === 'string' ? c : '';
      sent.push({ text, body });
      if (text.startsWith(FIND)) return route.fulfill(answer());
      if (text.startsWith(SCORE)) return route.fulfill(says(SCORED));
      return route.fulfill(refuses(400, 'This relay only serves the Spatacco Analytics tools.'));
    });
    await page.route(/\/score\/lead\.php/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.goto(base + '/tools/website-scorer.html?scope=website', { waitUntil: 'load' });
    return { ctx, page, sent, errors };
  };
  // The scorer wears the site's look (the owner, 2026-11-27: "scorer has a bland SA logo and all white
  // screen ... feels imported, rather than in house. match the visual style of the scorer to the overall
  // site"). What a visitor sees, in whatever state the page is in: the ground, the type, the menu and
  // footer, and whether anything is still a light panel or dark words on the dark ground.
  const look = (page) => page.evaluate(() => {
    const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    const shown = (e) => { const r = e.getBoundingClientRect(), st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && !e.closest('.hidden,[hidden],.hp'); };
    const light = [], dim = [];
    for (const e of document.querySelectorAll('body *')) {
      if (!shown(e) || e.closest('#main-nav, footer')) continue;
      if (e.closest('.score-bar-track, .match-bar, .progress-track, .cat-card [style*="width"]')) continue;   // a bar's lit fill is a mark, not a ground
      const st = getComputedStyle(e), bg = rgb(st.backgroundColor), r = e.getBoundingClientRect();
      // a light panel: a pale, solid ground of any size that matters (a gradient button has no ground colour)
      if (bg.length >= 3 && (bg.length < 4 || bg[3] > 0.5) && lum(bg) > 0.75 && r.width * r.height > 1500) light.push(e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]);
      // dark words on the dark ground: text of its own, in a dark colour, with no light ground of its own behind it
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (own && st.backgroundImage === 'none' && !(bg.length >= 3 && (bg.length < 4 || bg[3] > 0.5) && lum(bg) > 0.5) && lum(rgb(st.color)) < 0.42 && !e.closest('.btn-primary,.btn-gold,.match-go')) dim.push(e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + st.color);
    }
    const nav = document.getElementById('main-nav'), foot = document.querySelector('body > footer'), h1 = document.querySelector('h1');
    const first = document.querySelector('.card:not(.hidden), #screen-results:not(.hidden)');
    return {
      ground: getComputedStyle(document.body).backgroundColor, face: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g, ''),
      headFace: h1 && h1.getBoundingClientRect().width ? getComputedStyle(h1).fontFamily.split(',')[0].replace(/['"]/g, '') : 'Cormorant Garamond',
      nav: !!nav && nav.querySelectorAll('.nav-links a').length === 5 && !!nav.querySelector('img.logo') && getComputedStyle(nav).position === 'fixed', lit: (document.querySelector('#main-nav a.active') || {}).textContent,
      footer: !!foot && !!foot.querySelector('img.footer-mark') && !!foot.querySelector('img.footer-logo') && document.querySelectorAll('footer').length === 1, footAtEnd: !!foot && foot.getBoundingClientRect().bottom >= window.innerHeight - 1,
      light: [...new Set(light)], dim: [...new Set(dim)],
      clear: !first || first.getBoundingClientRect().top >= (nav ? nav.getBoundingClientRect().bottom : 0) - 1 || window.scrollY > 0,
      formTop: first ? Math.round(first.getBoundingClientRect().top) : -1, vh: window.innerHeight,
    };
  });
  const dressed = (name, l) => {
    check(name + ': navy ground, the site\'s typefaces, its menu with Tools lit and its one footer', l.ground === 'rgb(15, 27, 45)' && l.face === 'DM Sans' && l.headFace === 'Cormorant Garamond' && l.nav && l.lit === 'Tools' && l.footer && l.footAtEnd);
    check(name + ': no light panel anywhere (not: ' + l.light.join(', ') + ')', l.light.length === 0);
    check(name + ': no dark words on the dark ground (not: ' + l.dim.slice(0, 5).join(', ') + ')', l.dim.length === 0);
  };
  const type = async (page, text) => { await page.fill('#inp-website', text); await page.click('#btn-analyze'); };
  const cards = (page) => page.evaluate(() => {
    const box = document.getElementById('firm-matches'), b = box.getBoundingClientRect();
    return {
      shown: !box.classList.contains('hidden') && !box.classList.contains('looking'),
      head: (box.querySelector('.match-head') || {}).textContent || '', sub: (box.querySelector('.match-sub') || {}).textContent || '',
      list: [...box.querySelectorAll('.match-card')].map((c) => ({ name: c.querySelector('.match-name').textContent, conf: c.querySelector('.match-conf').textContent, band: c.querySelector('.match-conf').className.replace('match-conf ', ''),
        bar: c.querySelector('.match-bar span').style.width, meta: c.querySelector('.match-meta').textContent, why: [...c.querySelectorAll('.match-why li')].map((l) => l.textContent), go: c.querySelector('.match-go').textContent })),
      none: (box.querySelector('.match-none') || {}).textContent || '', imgs: box.querySelectorAll('img, script').length, hit: !!window.__hit,
      inside: b.left >= 0 && b.right <= window.innerWidth, pageWide: document.documentElement.scrollWidth <= window.innerWidth,
      error: getComputedStyle(document.getElementById('input-error')).display !== 'none' ? document.getElementById('input-error').textContent : '',
      button: document.getElementById('btn-analyze').textContent, off: document.getElementById('btn-analyze').disabled, field: document.getElementById('inp-website').value,
    };
  });

  // --- a firm's name: the matches, each with how sure and why
  for (const [w, h, mobile] of [[1255, 607, false], [430, 744, true]]) {
    const { ctx, page, sent, errors } = await open({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile }, () => says(FOUND));
    const at = w + ' by ' + h + ': ';
    await page.waitForTimeout(1200);
    const l0 = await look(page);
    dressed(at + 'as it opens', l0);
    check(at + 'the form starts on the first screen, under the menu (at ' + l0.formTop + ' of ' + l0.vh + ')', l0.formTop > 0 && l0.formTop < l0.vh - 40 || mobile);
    await type(page, '  Smith "Wealth"\n<b>Management</b>  ');
    await page.waitForSelector('#firm-matches .match-card', { timeout: 8000 });
    const c = await cards(page);
    const ask = sent[0] || { text: '', body: {} };
    check(at + 'a name typed where the website goes is looked up, not turned away: one request, for the lookup, and nothing scored yet', sent.length === 1 && ask.text.startsWith(FIND) && c.error === '');
    check(at + 'the name is sent as a name: one line, without the quotes and marks typed round it', ask.text.includes('Name as typed: "Smith Wealth b Management /b"') && !/[<>]/.test(ask.text.split('Name as typed:')[1].split('\n')[0]));
    check(at + 'the lookup is a small request: few searches, little to write, low effort', ask.body.max_tokens === 4000 && ask.body.tools[0].max_uses === 3 && ask.body.output_config.effort === 'low' && ask.body.model === 'claude-sonnet-5-5');
    check(at + 'it asks which one, and says what the percentage means', c.shown && c.head === 'Is one of these the right one?' && c.sub.includes('Smith Wealth b Management /b') && c.sub.includes('how sure the search is') && c.sub.includes('how closely the name matches'));
    check(at + 'only firms with a site of their own are offered, once each, the likeliest first (' + c.list.map((x) => x.name.slice(0, 22)).join(' | ') + ')', c.list.length === 2 && c.list[0].name === 'Smith Wealth Management' && c.list[1].name.startsWith('Smith Wealth Advisors'));
    check(at + 'each card shows how sure, in a word, a number and a bar', c.list[0].conf === 'High match · 88%' && c.list[0].band === 'high' && c.list[0].bar === '88%' && c.list[1].conf === 'Weak match · 54%' && c.list[1].band === 'low' && c.list[1].bar === '54%');
    check(at + 'each card shows the site and the place, and why it was matched, three reasons at most', c.list[0].meta === 'smithwealth.example · Austin, TX' && c.list[0].why.join('|') === 'Name matches exactly|Its own site names the firm|Only firm found by this name' && c.list[1].meta === 'smithwa.example · Tampa, FL' && c.list[1].why.length === 1);
    check(at + 'what the search wrote is shown as text, never run', c.imgs === 0 && !c.hit && c.list[1].name.includes('<img'));
    check(at + 'the matches fit the screen, and the button is itself again', c.inside && c.pageWide && c.button.startsWith('Analyze') && !c.off);
    check(at + 'there is a way out: none of these', c.none === 'None of these. Enter the website instead.');
    dressed(at + 'with the matches up', await look(page));
    if (!mobile) await page.screenshot({ path: process.env.SCORER_SHOTS ? process.env.SCORER_SHOTS + '/matches-desk.png' : undefined }).catch(() => {});
    if (mobile && process.env.SCORER_SHOTS) await page.locator('#firm-matches').screenshot({ path: process.env.SCORER_SHOTS + '/matches-phone.png' }).catch(() => {});
    // choose the first
    await page.locator('#firm-matches .match-go').first().click();
    await page.waitForFunction(() => document.getElementById('firm-matches').classList.contains('hidden'), null, { timeout: 5000 });
    await page.waitForTimeout(400);
    const second = sent[1] || { text: '' };
    check(at + 'choosing one scores that firm\'s site, and only then', sent.length >= 2 && second.text.startsWith(SCORE) && second.text.includes('Website: https://www.smithwealth.example\n'));
    // the score, and then the full breakdown, in the same dress (the lead endpoint is stood in for: nothing is sent)
    await page.waitForSelector('#screen-results:not(.hidden)', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    dressed(at + 'with the score up', await look(page));
    await page.fill('#gate-name', 'Test Visitor'); await page.fill('#gate-email', 'visitor@example.com');
    await page.click('#btn-gate-submit');
    await page.waitForSelector('.cat-card', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    const lr = await look(page);
    dressed(at + 'with the full breakdown up', lr);
    check(at + 'the results are in view under the menu, not behind it', await page.evaluate(() => { const n = document.getElementById('main-nav').getBoundingClientRect().bottom, s = document.getElementById('res-summary').getBoundingClientRect(); return s.top >= n && s.bottom <= window.innerHeight; }));
    check(at + 'no script error', errors.length === 0);
    await ctx.close();
  }

  // --- none of these; one match; changing the field
  {
    const one = JSON.stringify({ candidates: [{ name: 'Harbor Planning', website: 'harborplanning.example', location: '', confidence: 71, why: [] }] });
    let reply = FOUND;
    const { ctx, page, sent } = await open({ viewport: { width: 1255, height: 607 } }, () => says(reply));
    await type(page, 'smith wealth');
    await page.waitForSelector('#firm-matches .match-card', { timeout: 8000 });
    await page.click('#firm-matches .match-none');
    const none = await page.evaluate(() => ({ hidden: document.getElementById('firm-matches').classList.contains('hidden'), field: document.getElementById('inp-website').value, focus: document.activeElement.id }));
    check('"None of these" puts the matches away and hands back an empty field, ready to type in', none.hidden && none.field === '' && none.focus === 'inp-website' && sent.length === 1);
    reply = one;
    await type(page, 'Harbor Planning');
    await page.waitForSelector('#firm-matches .match-card', { timeout: 8000 });
    const c = await cards(page);
    check('one match is still asked about, never assumed', c.shown && c.head === 'Is this the right one?' && c.list.length === 1 && c.list[0].conf === 'Possible match · 71%' && c.list[0].band === 'medium' && c.list[0].meta === 'harborplanning.example' && c.none === 'Not this one. Enter the website instead.' && sent.length === 2);
    await page.type('#inp-website', 's');
    check('changing what is typed puts the old matches away', await page.evaluate(() => document.getElementById('firm-matches').classList.contains('hidden')));
    await ctx.close();
  }

  // --- by keyboard alone. The owner, 2026-11-27: "when i type a firm in and hit enter nothing happens. I
  // shouldn't ask people to click confirm with mouse if they prefer keyboard entry". And of the line
  // shown while it looks: "looking for ... and will give you options to choose from (or something)".
  {
    let hold; const waited = new Promise((r) => { hold = r; });
    const ctx = await browser.newContext({ viewport: { width: 1255, height: 607 } });
    const page = await ctx.newPage();
    const sent = [];
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.route(/ria-scorer\.[a-z-]+\.workers\.dev/, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
      const c = (JSON.parse(req.postData() || '{}').messages || [{}])[0].content; const text = typeof c === 'string' ? c : '';
      sent.push(text);
      if (text.startsWith(FIND)) { await waited; return route.fulfill(says(FOUND)); }
      return route.fulfill(says(SCORED));
    });
    await page.route(/\/score\/lead\.php/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await page.goto(base + '/tools/website-scorer.html?scope=website', { waitUntil: 'load' });
    await page.focus('#inp-website');
    await page.keyboard.type('Smith Wealth');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('firm-matches').classList.contains('looking'), null, { timeout: 5000 });
    const looking = await page.evaluate(() => ({ text: document.getElementById('firm-matches').textContent, off: document.getElementById('btn-analyze').disabled }));
    check('Enter in the website field runs it, as the button does: the lookup starts', sent.length === 1 && sent[0].startsWith(FIND) && looking.off);
    check('while it looks it says choices come next (' + looking.text + ')', /^Looking for “Smith Wealth”\./.test(looking.text) && /15 seconds/.test(looking.text) && /matches for you to choose from\.$/.test(looking.text));
    await page.keyboard.press('Enter');             // a second Enter while it looks asks nothing twice
    await page.waitForTimeout(150);
    check('a second Enter while it is looking does not ask twice', sent.length === 1);
    hold();
    await page.waitForSelector('#firm-matches .match-card', { timeout: 8000 });
    const on = await page.evaluate(() => { const a = document.activeElement; return { cls: a.className, first: a === document.querySelector('#firm-matches .match-go') }; });
    check('the keyboard is on the likeliest match when the matches come', on.cls === 'match-go' && on.first);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('firm-matches').classList.contains('hidden'), null, { timeout: 5000 });
    await page.waitForTimeout(400);
    check('Enter there scores that site: typed, found, chosen and scored without the mouse', sent.length >= 2 && sent[1].startsWith(SCORE) && sent[1].includes('Website: https://www.smithwealth.example\n'));
    await ctx.close();
  }
  // an address and Enter goes straight to the score; Enter in the LinkedIn field runs it too
  {
    const { ctx, page, sent } = await open({ viewport: { width: 1255, height: 607 } }, () => says(FOUND));
    await page.focus('#inp-website');
    await page.keyboard.type('example-advisors.com');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    check('an address and Enter goes straight to the score', sent.length >= 1 && sent[0].text.startsWith(SCORE) && sent[0].text.includes('Website: https://example-advisors.com\n'));
    await ctx.close();
    const b = await open({ viewport: { width: 1255, height: 607 } }, () => says(FOUND));
    await b.page.goto(base + '/tools/website-scorer.html', { waitUntil: 'load' });
    await b.page.fill('#inp-website', 'example-advisors.com');
    await b.page.focus('#inp-linkedin');
    await b.page.keyboard.press('Enter');
    await b.page.waitForTimeout(500);
    check('Enter in the LinkedIn field runs it too', b.sent.length >= 1 && b.sent[0].text.startsWith(SCORE));
    await b.ctx.close();
  }

  // --- when the lookup has nothing, or cannot run
  {
    let reply = () => says('{"candidates":[]}');
    const { ctx, page, sent } = await open({ viewport: { width: 1255, height: 607 } }, () => reply());
    await type(page, 'Zzyzx Nowhere Partners');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('input-error')).display !== 'none', null, { timeout: 8000 });
    let c = await cards(page);
    check('nothing found says so, and asks for the address instead', !c.shown && c.error.includes('could not find a website for') && c.error.includes('Zzyzx Nowhere Partners') && c.error.includes('yourfirm.com') && !c.off);
    // the relay as it is until the new one is pasted in: it does not know the request
    reply = () => refuses(400, 'This relay only serves the Spatacco Analytics tools.');
    await type(page, 'Smith Wealth');
    await page.waitForFunction(() => /look that name up/.test(document.getElementById('input-error').textContent), null, { timeout: 8000 });
    c = await cards(page);
    check('a relay that does not know the lookup yet gets the plain way on, not its own words', !c.shown && c.error === 'We could not look that name up just now. Enter your website address instead, like yourfirm.com.' && !c.off && c.button.startsWith('Analyze'));
    reply = () => refuses(429, "You have reached today's free limit for this tool. It resets tomorrow.");
    await type(page, 'Smith Wealth');
    await page.waitForFunction(() => /free limit/.test(document.getElementById('input-error').textContent), null, { timeout: 8000 });
    c = await cards(page);
    check('a daily limit is said in the relay\'s own words', !c.shown && c.error.includes("today's free limit") && !c.off);
    check('none of those ran a score', sent.every((s) => !s.text.startsWith(SCORE)));
    await ctx.close();
  }

  // --- an address is still an address, and what is neither is still turned away
  {
    const { ctx, page, sent } = await open({ viewport: { width: 1255, height: 607 } }, () => says(FOUND));
    await type(page, 'www.Example-Advisors.com');
    await page.waitForTimeout(500);
    check('an address typed any way goes straight to the score, with no lookup', sent.length >= 1 && sent[0].text.startsWith(SCORE) && sent[0].text.includes('Website: https://www.example-advisors.com\n') && sent.every((s) => !s.text.startsWith(FIND)));
    await ctx.close();
    const b = await open({ viewport: { width: 1255, height: 607 } }, () => says(FOUND));
    await type(b.page, 'pat@examplefirm.com');
    await b.page.waitForTimeout(300);
    let c = await cards(b.page);
    check('an email address is not looked up as a firm', b.sent.length === 0 && c.error.includes('looks like an email address') && !c.shown);
    await type(b.page, '   ');
    await b.page.waitForTimeout(200);
    c = await cards(b.page);
    check('nothing typed asks for the address or the name, and no field asks for https://', b.sent.length === 0 && c.error.includes('your firm\'s name') && !/https:\/\//.test(c.error));
    const f = await b.page.evaluate(() => { const i = document.getElementById('inp-website'); return { ph: i.placeholder, mode: i.getAttribute('inputmode'), label: document.querySelector('#field-website label').textContent.replace(/\s+/g, ' ').trim() }; });
    check('the field says a name will do, and a phone gives it a keyboard with a space bar', f.ph === "yourfirm.com or your firm's name" && f.mode === null && /or your firm's name/.test(f.label) && !/https/i.test(f.ph + f.label));
    await b.ctx.close();
  }

  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' scorer checks failed'); process.exit(1); }
  console.log('ok: ' + n + ' scorer checks');
})().catch((e) => { if (fails.length) console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.error(String(e && e.stack || e)); process.exit(1); });
