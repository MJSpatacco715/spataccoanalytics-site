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
      if (text.startsWith(SCORE)) return route.fulfill(says(open.scored || SCORED));
      return route.fulfill(refuses(400, 'This relay only serves the Spatacco Analytics tools.'));
    });
    // The owner's record (score/run.php) and the lead (score/lead.php) are stood in for: what the page
    // would have kept is held here, and nothing is written or mailed. `recorder` answers for the record.
    const runs = [], leads = [];
    await page.route(/\/score\/run\.php/, (r) => { try { runs.push(JSON.parse(r.request().postData() || '{}')); } catch (e) { runs.push({ kind: 'unreadable' }); } return r.fulfill(open.recorder ? open.recorder() : { status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await page.route(/\/score\/lead\.php/, (r) => { try { leads.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await page.goto(base + '/tools/website-scorer/?scope=website&utm_source=test', { waitUntil: 'load' });
    return { ctx, page, sent, errors, runs, leads };
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
  // The hundred first, then where it goes (the owner, 2026-11-27: "this 100 breakdown should have 100 at the top and
  // trickle down to the breakdown 50 / 30 / 20 with a look more like the logo"): what the opening's breakdown shows,
  // which of its two drawings is on the page, and where each trace ends beside its figure.
  const points = (page) => page.evaluate(() => {
    const r = (e) => e.getBoundingClientRect();
    const box = document.querySelector('.sc-points');
    const drawn = [...box.querySelectorAll('svg.sc-trace')].filter((v) => getComputedStyle(v).display !== 'none');
    const words = (e) => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); };
    const rows = [...box.querySelectorAll('.sc-point')].map((e) => {
      const fig = e.querySelector('b'), b = r(fig), d = words(fig), w = words(e.querySelector('span'));
      return { n: fig.textContent, word: e.querySelector('span').textContent, top: b.top, cy: b.top + b.height / 2, left: d.left, size: parseFloat(getComputedStyle(fig).fontSize), wordRight: w.right };
    });
    const nodes = drawn[0] ? [...drawn[0].querySelectorAll('.hex, .n')].map((e) => { const x = r(e); return { cx: x.left + x.width / 2, cy: x.top + x.height / 2, left: x.left, right: x.right, fill: getComputedStyle(e).fill }; }) : [];
    const trunk = drawn[0] && drawn[0].querySelector('.trunk');
    return { drawings: drawn.length, which: drawn[0] ? drawn[0].getAttribute('class').replace('sc-trace ', '') : '', rows, nodes, trunk: trunk ? getComputedStyle(trunk).stroke : '',
      label: box.getAttribute('aria-label'), wide: document.documentElement.scrollWidth <= window.innerWidth && r(box).right <= window.innerWidth + 1 };
  });
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
    const { ctx, page, sent, errors, runs, leads } = await open({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile }, () => says(FOUND));
    const at = w + ' by ' + h + ': ';
    await page.waitForTimeout(1200);
    const l0 = await look(page);
    dressed(at + 'as it opens', l0);
    check(at + 'the form starts on the first screen, under the menu (at ' + l0.formTop + ' of ' + l0.vh + ')', l0.formTop > 0 && l0.formTop < l0.vh - 40 || mobile);
    const pt = await points(page), [hundred, ...parts] = pt.rows;
    check(at + 'the breakdown says the hundred first, then the three it is made of (' + pt.rows.map((x) => x.n + ' ' + x.word).join(', ') + ')',
      pt.rows.map((x) => x.n + ' ' + x.word).join(', ') === '100 Total, 50 Website, 30 Contact, 20 LinkedIn' && parts.reduce((t, x) => t + Number(x.n), 0) === 100 && /100 points/.test(pt.label));
    check(at + 'the hundred is at the top and is the largest figure', parts.every((x) => hundred.cy < x.top && hundred.size > x.size));
    check(at + (mobile ? 'on a phone the three stand side by side under it, left to right' : 'the three stand one under another beneath it'),
      mobile ? pt.which === 'h' && Math.abs(parts[0].cy - parts[1].cy) < 1 && Math.abs(parts[1].cy - parts[2].cy) < 1 && parts[0].left < parts[1].left && parts[1].left < parts[2].left
        : pt.which === 'v' && parts[0].cy < parts[1].cy && parts[1].cy < parts[2].cy && Math.abs(parts[0].left - parts[2].left) < 1);
    check(at + 'one drawing of the traces is on the page, with a mark for each figure', pt.drawings === 1 && pt.nodes.length === 4);
    check(at + 'each trace ends level with its figure and just before it (off by ' + pt.nodes.map((n, i) => (n.cy - pt.rows[i].cy).toFixed(1)).join(', ') + ')',
      pt.nodes.length === 4 && pt.nodes.every((n, i) => Math.abs(n.cy - pt.rows[i].cy) <= 1.5 && n.right <= pt.rows[i].left + 1 && pt.rows[i].left - n.right < 40));
    check(at + 'the traces wear the logo\'s colours: cyan, blue, purple, and a line that runs through all three (' + pt.nodes.map((n) => n.fill).join(' | ') + ')',
      /url\(/.test(pt.trunk) && pt.nodes.map((n) => n.fill).join('|') === 'rgb(61, 216, 216)|rgb(61, 216, 216)|rgb(91, 141, 239)|rgb(155, 130, 255)');
    check(at + 'no word of it runs into the next figure or off the page', pt.wide && (!mobile || (parts[0].wordRight < pt.nodes[2].left - 4 && parts[1].wordRight < pt.nodes[3].left - 4)));

    // What each of the three is made of, on a card beside it (the owner, 2026-11-27: "if there is a more granular
    // underpinning to the components I wouldn't mind them being shown on a hover (without giving the secret sauce
    // away)"): the names and the points, from the scorer's own list. A pointer has to rest for it to open, as on
    // every hover card of the site; a click, a tap and the keyboard open it at once; and it always shows whole.
    const more = (i) => page.evaluate((i) => {
      const c = document.getElementById('sc-more-' + i), st = getComputedStyle(c), r = c.getBoundingClientRect(), h = document.getElementById('screen-hero').getBoundingClientRect();
      const d = [...document.querySelectorAll('svg.sc-trace')].find((v) => getComputedStyle(v).display !== 'none').getBoundingClientRect();
      return { open: st.display !== 'none' && st.visibility === 'visible' && Number(st.opacity) > 0.95, head: (c.querySelector('strong') || {}).textContent || '', text: c.textContent,
        rows: [...c.querySelectorAll('li')].map((l) => l.querySelector('span').textContent + ' ' + l.querySelector('b').textContent),
        whole: r.left >= 0 && r.right <= window.innerWidth && r.top >= Math.max(h.top, document.getElementById('main-nav').getBoundingClientRect().bottom) && r.bottom <= h.bottom,
        clear: r.right <= d.left || r.top >= d.bottom, expanded: document.querySelector('.sc-point.p' + i).getAttribute('aria-expanded') };
    }, i);
    const schema = await page.evaluate(() => [WEBSITE_CATS.filter((c) => c.group === 'website'), WEBSITE_CATS.filter((c) => c.group === 'contact'), [LINKEDIN_CAT]].map((g) => g.map((c) => c.label + ' ' + c.max)));
    const m0 = [await more(1), await more(2), await more(3)];
    check(at + 'each of the three says what it is made of, from the scorer\'s own list, and its parts add up to it (' + m0.map((m) => m.rows.join(', ')).join(' / ') + ')',
      m0.every((m, i) => m.rows.join('|') === schema[i].join('|') && m.rows.reduce((t, x) => t + Number(x.split(' ').pop()), 0) === [50, 30, 20][i] && new RegExp(': ' + [50, 30, 20][i] + ' of the 100$').test(m.head)));
    check(at + 'the cards give names and points only: nothing of how each is judged', m0.every((m) => m.text.length < 190 && !/rubric|criteria|prompt|instruction|deduct|penal/i.test(m.text)));
    check(at + 'no card is open until one is asked for', m0.every((m) => !m.open && m.expanded === 'false'));
    if (!mobile) {
      await page.waitForTimeout(700);          // the opening has finished arriving
      const mid = async (i) => { const b = await page.locator('.sc-point.p' + i).boundingBox(); return [b.x + 12, b.y + b.height / 2]; };
      await page.mouse.move(...await mid(1));
      await page.waitForTimeout(120);
      const glance = await more(1);
      await page.waitForTimeout(520);
      const rest = await more(1);
      check(at + 'a pointer passing over a figure opens nothing; resting on it opens its card', !glance.open && rest.open);
      check(at + 'the card shows whole inside the opening, and stands clear of the traces', rest.whole && rest.clear);
      await page.mouse.move(...await mid(3));
      await page.waitForTimeout(700);
      const [left1, on3] = [await more(1), await more(3)];
      check(at + 'moving on to another figure closes the first card and opens the other, whole', !left1.open && on3.open && on3.whole && on3.clear);
      await page.mouse.move(5, 5);
      await page.waitForTimeout(400);
      check(at + 'and it closes when the pointer leaves', !(await more(3)).open);
      await page.click('.sc-point.p2');
      await page.waitForTimeout(260);          // its fade; a hover alone would still be waiting
      const clicked = await more(2);
      check(at + 'a click opens a card at once, whole, and says so to assistive technology', clicked.open && clicked.whole && clicked.expanded === 'true');
      await page.keyboard.press('Escape');
      await page.mouse.move(5, 5);
      await page.waitForTimeout(400);
      const shut2 = await more(2);
      check(at + 'Escape closes it', !shut2.open && shut2.expanded === 'false');
      await page.focus('.sc-point.p3');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(260);
      const keyed = await more(3);
      check(at + 'the keyboard opens one at once too', keyed.open && keyed.expanded === 'true' && keyed.whole);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } else {
      await page.tap('.sc-point.p1');
      await page.waitForTimeout(200);
      const tapped = await more(1);
      check(at + 'on a phone a tap opens the card in place, under the three, whole and inside the page', tapped.open && tapped.expanded === 'true' && tapped.whole && tapped.clear && await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.tap('.sc-point.p2');
      await page.waitForTimeout(200);
      check(at + 'a tap on another opens that one and closes the first', !(await more(1)).open && (await more(2)).open);
      await page.tap('.sc-point.p2');
      await page.waitForTimeout(200);
      check(at + 'and a second tap closes it', !(await more(2)).open && (await more(2)).expanded === 'false');
    }

    // The five ratings, and the page's two marks (the owner, 2026-11-27: "I don't love the category titles
    // Distinction ...Poor", naming "Excellent, Strong, Adequate, Needs Work, Red Flags and Violations"; and "use the
    // Linkedin Logo on the page where appropriate instead of a briefcase").
    const named = await page.evaluate(() => ({
      legend: [...document.querySelectorAll('#legend-bar .legend-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      tiers: [100, 85, 84, 70, 69, 55, 54, 40, 39, 0].map((n) => getTier(n, 100).label),
      emoji: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.getElementById('screen-hero').innerText + document.querySelector('.main').innerText),
      marks: [...document.querySelectorAll('.scope-option label')].map((l) => [...l.querySelectorAll('use')].map((u) => u.getAttribute('href')).join('+')),
      drawn: [...document.querySelectorAll('.scope-icon svg')].every((v) => { const r = v.getBoundingClientRect(); return r.width >= 20 && r.height >= 20; }),
      blue: (document.querySelector('#i-linkedin path') || document.body).getAttribute('fill'), onField: !!document.querySelector('label[for="inp-linkedin"] use[href="#i-linkedin"]'),
    }));
    check(at + 'the five ratings are named as the owner named them (' + named.legend.join(' | ') + ')',
      named.legend.join(' | ') === '85–100 Excellent | 70–84 Strong | 55–69 Adequate | 40–54 Needs Work | <40 Red Flags and Violations'
      && named.tiers.join(',') === 'Excellent,Excellent,Strong,Strong,Adequate,Adequate,Needs Work,Needs Work,Red Flags and Violations,Red Flags and Violations');
    check(at + 'a website is a drawn globe and LinkedIn wears LinkedIn\'s own mark, in its blue; no emoji stands in for either (' + named.marks.join(' | ') + ')',
      !named.emoji && named.drawn && named.marks.join(' | ') === '#i-web+#i-linkedin | #i-web | #i-linkedin' && named.blue === '#0A66C2' && named.onField);
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
    // The owner's own record of it. The owner, 2026-11-27: "the scorer should also keep a record for me and
    // only me to see what has gone into the mechanism".
    const kinds = runs.map((r) => r.kind).join(',');
    const [lk, ch, sc] = runs;
    check(at + 'the record is told each step, in order: the lookup, the choice, the score (' + kinds + ')', kinds === 'lookup,choose,score');
    check(at + 'the lookup: what was typed, and the firms offered with how sure', !!lk && lk.typed === 'Smith Wealth b Management /b' && lk.outcome === 'offered' && lk.matches.length === 2 && lk.matches[0].website === 'https://www.smithwealth.example' && lk.matches[0].confidence === 88 && lk.matches[0].place === 'Austin, TX' && lk.utm_source === 'test');
    check(at + 'the choice: which firm, and how sure the search was of it', !!ch && ch.chose === 'match' && ch.website === 'https://www.smithwealth.example' && ch.confidence === 88 && ch.name === 'Smith Wealth Management');
    check(at + 'the score: the site, that it was found by lookup, the score and its parts, and that nobody is known yet', !!sc && sc.website === 'https://www.smithwealth.example' && sc.found === 'lookup' && sc.typed === 'Smith Wealth b Management /b' && sc.firm_scored === 'Smith Wealth Management' && sc.score === 47 && sc.score_max === 80 && sc.tier === 'Adequate' && sc.scores.visual_design === 9 && sc.known === false);
    check(at + 'the three are one run, and the lead left afterwards carries the same', !!sc && /^[a-f0-9]{24}$/.test(sc.run) && runs.every((r) => r.run === sc.run) && leads.length === 1 && leads[0].run === sc.run && leads[0].email === 'visitor@example.com');
    check(at + 'no script error', errors.length === 0);
    await ctx.close();
  }

  // --- none of these; one match; changing the field
  {
    const one = JSON.stringify({ candidates: [{ name: 'Harbor Planning', website: 'harborplanning.example', location: '', confidence: 71, why: [] }] });
    let reply = FOUND;
    const { ctx, page, sent, runs } = await open({ viewport: { width: 1255, height: 607 } }, () => says(reply));
    await type(page, 'smith wealth');
    await page.waitForSelector('#firm-matches .match-card', { timeout: 8000 });
    await page.click('#firm-matches .match-none');
    check('the record is told when none of the firms offered was the one', runs.map((r) => r.kind).join(',') === 'lookup,choose' && runs[1].chose === 'none' && runs[1].typed === 'smith wealth');
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
    await page.goto(base + '/tools/website-scorer/?scope=website', { waitUntil: 'load' });
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
    await b.page.goto(base + '/tools/website-scorer/', { waitUntil: 'load' });
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
    const { ctx, page, sent, runs } = await open({ viewport: { width: 1255, height: 607 } }, () => reply());
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
    check('the record has each of the three: nothing found, and two lookups that could not run (' + runs.map((r) => r.outcome).join(',') + ')', runs.map((r) => r.kind + ':' + r.outcome).join(',') === 'lookup:none,lookup:failed,lookup:failed' && runs[0].typed === 'Zzyzx Nowhere Partners');
    await ctx.close();
  }

  // --- an address is still an address, and what is neither is still turned away
  {
    // (here the record cannot be kept at all: the visitor is not held up and sees nothing of it)
    open.recorder = () => ({ status: 500, contentType: 'text/plain', body: 'no' });
    const { ctx, page, sent, runs, errors } = await open({ viewport: { width: 1255, height: 607 } }, () => says(FOUND));
    open.recorder = null;
    await type(page, 'www.Example-Advisors.com');
    await page.waitForSelector('#screen-results:not(.hidden)', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    check('an address that is scored is recorded as typed, with no lookup before it', runs.length === 1 && runs[0].kind === 'score' && runs[0].found === 'typed' && runs[0].typed === 'www.Example-Advisors.com' && runs[0].website === 'https://www.example-advisors.com');
    check('a record that cannot be kept changes nothing for the visitor: the score still shows, with no error', await page.evaluate(() => !document.getElementById('screen-results').classList.contains('hidden') && getComputedStyle(document.getElementById('input-error')).display === 'none') && errors.length === 0);
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

  // --- Compliance Red Flags. The owner, 2026-11-27, of the breakdown's card: "this should have compliance red flags (or
  // something like it in the scoring rubric)". A fifth website category worth 10; asked whether a serious flag should
  // hold the rating down by itself: "Yes Cap at adequate, and tell as much".
  {
    const NOTES = { visual_design: 'x', content_messaging: 'x', navigation_ux: 'x', credibility_signals: 'x', team_leadership: 'x', contact_availability: 'x' };
    const HIGH = { visual_design: 9, content_messaging: 9, navigation_ux: 9, credibility_signals: 9, team_leadership: 14, contact_availability: 14 };
    const a = await open({ viewport: { width: 1255, height: 900 } }, () => says(FOUND));
    const said = await a.page.evaluate(() => ({
      head: document.querySelector('#sc-more-1 strong').textContent,
      rows: [...document.querySelectorAll('#sc-more-1 li')].map((li) => li.querySelector('span').textContent + ':' + li.querySelector('b').textContent),
      rule: (document.querySelector('#sc-more-1 p') || {}).textContent || '',
      legend: (document.querySelector('#legend-bar .legend-note') || {}).textContent || '',
    }));
    check('the Website fifty is five tens, the fifth of them Compliance Red Flags (' + said.rows.join(', ') + ')', said.head === 'Website: 50 of the 100' && said.rows.join('|') === 'Visual Design:10|Content & Messaging:10|Navigation & UX:10|Credibility Signals:10|Compliance Red Flags:10');
    check('the card and the line under the ratings both say a serious red flag holds a rating at Adequate', /serious compliance red flag holds a rating at Adequate/.test(said.rule) && /serious compliance red flag is rated no higher than Adequate/.test(said.legend));

    // a polished site showing testimonials with no disclosure: Excellent on points, held at Adequate
    open.scored = JSON.stringify({ firm_name: 'Polished Advisors', summary: 'Strong site.', pros: ['a'], cons: ['b'],
      scores: Object.assign({ compliance_red_flags: 9 }, HIGH), notes: Object.assign({ compliance_red_flags: 'Client quotes appear with no disclosure.' }, NOTES),
      compliance_flags: [{ kind: 'testimonials', text: 'The home page shows client quotes <img src=x onerror="window.__hit=1"> with no disclosure.' },
        { kind: 'footer_year', text: 'The footer reads 2023.' }, { kind: 'something_new', text: 'A thing this page has no name for.' }, { kind: 'adv', text: '   ' }] });
    await type(a.page, 'polished.example');
    await a.page.waitForSelector('#screen-results:not(.hidden)', { timeout: 15000 }).catch(() => {});
    await a.page.waitForTimeout(300);
    const r = await a.page.evaluate(() => { const h = document.getElementById('score-held'), hb = h.getBoundingClientRect(); return {
      num: document.getElementById('score-big-num').textContent, denom: document.getElementById('score-big-denom').textContent,
      tier: document.getElementById('score-big-tier').textContent.trim(), held: h.textContent, heldShown: !h.hidden && hb.width > 0 && hb.height > 0,
      locked: document.getElementById('screen-results').classList.contains('locked'), heldSize: parseFloat(getComputedStyle(h).fontSize) }; });
    // 9 + 9 + 9 + 9, the category brought down from 9 to 4 by the serious flag, 14 + 14: 68 of 80, which is Excellent on points
    check('a site with a serious red flag is rated Adequate, whatever its points (' + r.num + r.denom + ' ' + r.tier + ')', r.num === '68' && r.denom === '/80' && r.tier === 'Adequate');
    check('and it is told so beside the score, before anything is unlocked: what it would have rated, and why', r.locked && r.heldShown && r.heldSize >= 13 && /^Held at Adequate\. On points alone this site would rate Excellent, but a possible compliance red flag was found/.test(r.held));
    const sc = a.runs.filter((x) => x.kind === 'score')[0] || {};
    check('the record has the rating given, the one it was held from, the flags by kind, and the category at what was reported', sc.tier === 'Adequate' && sc.held_from === 'Excellent' && sc.score === 68 && sc.scores && sc.scores.compliance_red_flags === 4
      && Array.isArray(sc.flags) && sc.flags.map((f) => f.kind).join(',') === 'testimonials,footer_year,other' && /client quotes/.test(sc.flags[0].text));
    await a.page.fill('#gate-name', 'Test Visitor'); await a.page.fill('#gate-email', 'visitor@example.com');
    await a.page.click('#btn-gate-submit');
    await a.page.waitForSelector('#screen-results:not(.locked)', { timeout: 15000 }).catch(() => {});
    await a.page.waitForTimeout(300);
    const card = await a.page.evaluate(() => {
      const c = [...document.querySelectorAll('.cat-card')].find((x) => x.querySelector('.cat-card-name').textContent === 'Compliance Red Flags');
      if (!c) return null;
      const lis = [...c.querySelectorAll('.flag-list li')];
      const light = (e) => { const m = getComputedStyle(e).color.match(/[\d.]+/g).map(Number); return (m[0] + m[1] + m[2]) / 3; };
      return { score: c.querySelector('.cat-card-score').textContent, kinds: lis.map((li) => li.className + ':' + li.querySelector('b').textContent), text: lis.map((li) => li.textContent).join(' | '),
        imgs: c.querySelectorAll('img').length, hit: window.__hit === 1, caveat: (c.querySelector('.flag-caveat') || {}).textContent || '',
        readable: lis.every((li) => light(li) > 150 && parseFloat(getComputedStyle(li).fontSize) >= 13), wide: document.documentElement.scrollWidth <= window.innerWidth };
    });
    check('its card lists each flag by kind, the serious one marked apart, and an empty one is left out (' + (card ? card.kinds.join(', ') : 'no card') + ')', !!card && card.score === '4/10'
      && card.kinds.join('|') === 'flag-serious:Testimonials and endorsements|flag-minor:Footer year|flag-minor:Other');
    check('what the search wrote about a flag is shown as text, never as markup', !!card && card.imgs === 0 && !card.hit && card.text.includes('<img src=x onerror="window.__hit=1">'));
    check('the card says what the flags are: possible, read from public pages, not advice, for a compliance officer', !!card && /Possible red flags, read from the public pages\. Not legal or compliance advice: review each with your compliance officer\./.test(card.caveat) && card.readable && card.wide);
    const lead = a.leads[0] || {};
    check('the lead carries the same: the rating, what it was held from and the flags', lead.tier === 'Adequate' && lead.held_from === 'Excellent' && Array.isArray(lead.flags) && lead.flags.length === 3);
    const told = (a.sent.find((x) => x.text.startsWith(SCORE)) || { text: '' }).text;
    check('the scorer is told the six things to look for, to word each as a possible flag, and to name them by kind, inside the relay\'s size (' + told.length + ' characters)',
      ['testimonials:', 'form_crs:', 'adv:', 'disclosures:', 'footer_year:', 'stale_info:'].every((k) => told.includes('- ' + k)) && told.includes('"compliance_flags":[') && told.includes('"compliance_red_flags":<0-10>')
      && told.includes('never a finding of a violation') && told.includes('earlier than ' + new Date().getFullYear() + '.') && told.length < 12000 && !told.includes('\u2014'));
    await a.ctx.close();

    // only small things found: the rating is the points' own, and nothing says held
    open.scored = JSON.stringify({ firm_name: 'Tidy Advisors', summary: 'Strong site.', pros: ['a'], cons: ['b'],
      scores: Object.assign({ compliance_red_flags: 8 }, HIGH), notes: Object.assign({ compliance_red_flags: 'One dated detail.' }, NOTES),
      compliance_flags: [{ kind: 'footer_year', text: 'The footer reads 2024.' }, { kind: 'adv', text: 'No link to the Form ADV brochure was found.' }] });
    const b = await open({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true }, () => says(FOUND));
    await type(b.page, 'tidy.example');
    await b.page.waitForSelector('#screen-results:not(.hidden)', { timeout: 15000 }).catch(() => {});
    await b.page.waitForTimeout(300);
    const t = await b.page.evaluate(() => ({ num: document.getElementById('score-big-num').textContent, tier: document.getElementById('score-big-tier').textContent.trim(), heldHidden: document.getElementById('score-held').hidden, wide: document.documentElement.scrollWidth <= window.innerWidth }));
    const sb = b.runs.filter((x) => x.kind === 'score')[0] || {};
    // 36 + 8 + 28: 72 of 80
    check('small things found do not hold a rating: ' + t.num + ' is ' + t.tier + ', and nothing says held', t.num === '72' && t.tier === 'Excellent' && t.heldHidden && t.wide && sb.tier === 'Excellent' && sb.held_from === '' && sb.scores.compliance_red_flags === 8 && sb.flags.length === 2);
    await b.ctx.close();
    open.scored = null;
  }

  // --- The top of the results, and the scorecard on paper. The owner, 2026-11-27: "assessment results should show firm
  // logo, website should be a link, some small info about discerned ... qualities and specialties the firm holds"; "the
  // what to do about it and call to action are too low ... put it above exec summary and beneath scorer"; and of the
  // PDF: "the PDF output from the scorer SUCKS" (wrong characters for its markers, its label over the firm's name, each
  // bar over its own note, no footer on its first page).
  {
    const fs = require('fs'), path = require('path');
    const LOGO = fs.readFileSync(path.join(__dirname, '..', 'site', 'img', 'logo-square.png'));
    const answer = (logo) => JSON.stringify({ firm_name: 'Polished & Sons Advisors', summary: 'A \u201cpolished\u201d site \u2014 with clear contact paths.', pros: ['Distinctive design \u2192 memorable', 'Full bios'], cons: ['Testimonials carry no disclosure', 'No Form ADV link', 'A third thing to improve'],
      scores: { visual_design: 9, content_messaging: 9, navigation_ux: 9, credibility_signals: 9, compliance_red_flags: 9, team_leadership: 14, contact_availability: 14 },
      notes: { visual_design: 'Distinctive.', content_messaging: 'Sharp.', navigation_ux: 'Seamless.', credibility_signals: 'Strong.', compliance_red_flags: 'Client quotes appear with no disclosure.', team_leadership: 'Rich bios.', contact_availability: 'Many options.' },
      compliance_flags: [{ kind: 'testimonials', text: 'Three client quotes \u2014 \u201cthey changed our retirement\u201d \u2014 with no disclosure.' }],
      profile: { location: 'Wayne, PA <b>', founded: '1987', specialties: ['Retirement income planning for physicians and dentists', 'Business owners', '$2 billion in AUM', 'Families', 'A fifth', 'A sixth'] },
      logo_url: logo, pages: { team: 'https://www.polished.example/team', contact: 'https://elsewhere.example/contact', disclosures: 'javascript:alert(1)', services: 'https://www.polished.example/services' } });
    const openTop = async (vp, logo, logoOk) => {
      open.scored = answer(logo);
      const a = await open(vp, () => says(FOUND));
      await a.page.route(/polished\.example\/logo\.png/, (r) => logoOk ? r.fulfill({ status: 200, contentType: 'image/png', body: LOGO }) : r.abort());
      await a.page.route(/google\.com\/s2\/favicons/, (r) => r.abort());
      await type(a.page, 'www.polished.example');
      await a.page.waitForSelector('#screen-results:not(.hidden)', { timeout: 15000 }).catch(() => {});
      await a.page.waitForTimeout(500);
      return a;
    };
    const a = await openTop({ viewport: { width: 1255, height: 607 } }, 'https://www.polished.example/logo.png', true);
    const h = await a.page.evaluate(() => {
      const link = document.getElementById('res-firm-url'), logo = document.getElementById('res-logo'), img = logo.querySelector('img');
      const band = document.getElementById('next-band'), unlock = document.getElementById('unlock-card'), score = document.querySelector('.score-card'), sum = document.querySelector('.summary-block');
      const r = (e) => e.getBoundingClientRect();
      return { href: link.getAttribute('href'), text: link.textContent, target: link.target, rel: link.rel, facts: document.getElementById('res-firm-facts').textContent,
        chips: [...document.querySelectorAll('#res-chips span')].map((c) => c.textContent), bolds: document.querySelectorAll('.res-header b').length,
        logo: !!img && img.naturalWidth > 0 && r(logo).width >= 48 && img.getAttribute('src'), scripts: document.querySelectorAll('head script[src*="jspdf"], head script[src*="cdnjs"]').length,
        bandTop: r(band).top, bandBottom: r(band).bottom, scoreBottom: r(score).bottom, unlockTop: r(unlock).top, vh: window.innerHeight, scoreH: r(score).height,
        locked: document.getElementById('screen-results').classList.contains('locked'), go: [...band.querySelectorAll('a')].map((x) => x.getAttribute('href')),
        gatedBand: band.classList.contains('gated'), oldCard: [...document.querySelectorAll('#screen-results .card .card-label')].filter((x) => x.textContent === 'What to do about it').length,
        sumOrder: !!(band.compareDocumentPosition(sum) & Node.DOCUMENT_POSITION_FOLLOWING), wide: document.documentElement.scrollWidth <= window.innerWidth };
    });
    check('the results name the site as a link to it, opened beside this page (' + h.text + ')', String(h.href).replace(/\/$/, '') === 'https://www.polished.example' && h.text === 'polished.example' && h.target === '_blank' && /noopener/.test(h.rel));
    check('under the name: where the firm is and when it was founded, as text, never as markup (' + h.facts + ')', h.facts === ' · Wayne, PA <b> · Founded 1987' && h.bolds === 0);
    check('and what it is known for: four phrases at most, a long one cut at a word, and never its assets (' + h.chips.join(' | ') + ')', h.chips.join('|') === 'Retirement income planning for|Business owners|Families|A fifth');
    check('the firm\'s own logo stands beside its name', h.logo === 'https://www.polished.example/logo.png');
    check('what to do about it is straight under the score and above the unlock and the summary, locked or not, with both ways on', h.locked && !h.gatedBand && h.bandTop >= h.scoreBottom && h.bandBottom <= h.unlockTop && h.sumOrder && h.oldCard === 0 && h.go.join(',') === '/services/?utm_source=scorer,/contact/?utm_source=scorer');
    check('at the owner\'s window the score and the call to action are both on the first screen (the band ends at ' + Math.round(h.bandBottom) + ' of ' + h.vh + ', the score card is ' + Math.round(h.scoreH) + ' tall)', h.bandBottom <= h.vh && h.wide);
    check('the page loads no PDF library until a PDF is asked for, and none from another site\'s server', h.scripts === 0 && !a.sent.some(() => false) && await a.page.evaluate(() => typeof window.jspdf === 'undefined' && !document.querySelector('script[src*="cdnjs"]')));
    const rec = (a.runs.filter((x) => x.kind === 'score')[0] || {}).profile || {};
    check('the record carries what was discerned about the firm', rec.location === 'Wayne, PA <b>' && rec.founded === '1987' && Array.isArray(rec.specialties) && rec.specialties.length === 4);

    // the scorecard on paper: every word it sets, where, and every bar and link, read off the library as it is drawn
    await a.page.fill('#gate-name', 'Test Visitor'); await a.page.fill('#gate-email', 'visitor@example.com');
    await a.page.click('#btn-gate-submit');
    await a.page.waitForSelector('#screen-results:not(.locked)', { timeout: 15000 }).catch(() => {});
    await a.page.addScriptTag({ url: '/js/vendor/jspdf-4.2.1.umd.min.js' });
    await a.page.evaluate(() => {
      const Real = window.jspdf.jsPDF, log = window.__pdf = { text: [], bars: [], links: [], images: 0, name: '', pages: 0 };
      window.jspdf.jsPDF = function (o) {
        const d = new Real(o), page = () => d.getCurrentPageInfo().pageNumber;
        const text = d.text.bind(d), rr = d.roundedRect.bind(d), link = d.link.bind(d), twl = d.textWithLink.bind(d), img = d.addImage.bind(d);
        d.text = (t, x, y, opt) => { [].concat(t).forEach((ln, i) => { const w = d.getTextWidth(String(ln)), al = opt && opt.align, size = d.getFontSize(), lh = size * ((opt && opt.lineHeightFactor) || 1.15);
          log.text.push({ s: String(ln), page: page(), x: al === 'right' ? x - w : al === 'center' ? x - w / 2 : x, y: y + i * lh, w, size }); }); return text(t, x, y, opt); };
        d.roundedRect = (x, y, w, h, a, b, st) => { if (h <= 6) log.bars.push({ page: page(), x, y, w, h }); return rr(x, y, w, h, a, b, st); };
        d.link = (x, y, w, h, o2) => { log.links.push(o2.url); return link(x, y, w, h, o2); };
        d.textWithLink = (t, x, y, o2) => { log.links.push(o2.url); return twl(t, x, y, o2); };
        d.addImage = (...args) => { log.images++; return img(...args); };
        d.save = (fn) => { log.name = fn; log.pages = d.getNumberOfPages(); log.bytes = d.output('arraybuffer').byteLength; };
        return d;
      };
    });
    await a.page.click('#btn-pdf');
    await a.page.waitForFunction(() => window.__pdf && window.__pdf.name, null, { timeout: 20000 }).catch(() => {});
    const pdf = await a.page.evaluate(() => window.__pdf);
    const words = pdf.text.map((t) => t.s), has = (w) => words.some((x) => x.includes(w)), at = (w, pg) => pdf.text.find((t) => t.s.includes(w) && (!pg || t.page === pg));
    check('the PDF is made, by the site\'s own copy of the library, named for the firm (' + pdf.name + ', ' + pdf.pages + ' pages, ' + pdf.bytes + ' bytes)', /^Polished-Sons-Advisors_Scorecard_\d{4}-\d\d-\d\d\.pdf$/.test(pdf.name) && pdf.pages >= 1 && pdf.bytes > 20000);
    check('every word on it is one its typeface can draw: no wrong characters where a marker or a curly quote was meant', words.length > 30 && words.every((w) => /^[\x20-\x7E¡-ÿ]*$/.test(w)) && has('Three client quotes - "they changed our retirement" - with no disclosure.') && has('A "polished" site - with clear contact paths.'));
    check('it opens on the site\'s wordmark, who it is for, the site as a link, where the firm is and what it is known for', pdf.images === 1 && has('PREPARED FOR') && has('Polished & Sons Advisors') && has('polished.example') && has('Wayne, PA') && has('Founded 1987') && has('Business owners') && pdf.links.some((u) => u.replace(/\/$/, '') === 'https://www.polished.example'));
    const ctaY = (at('WHAT TO DO ABOUT IT', 1) || {}).y, sumY = (at('EXECUTIVE SUMMARY') || {}), heldY = (at('Held at Adequate', 1) || {}).y;
    check('what to do about it is on the first page, under the score and above the summary, with a link to the services', ctaY > 0 && has('SEE SERVICES AND PRICING') && pdf.links.some((u) => u.startsWith('https://spataccoanalytics.com/services/')) && (sumY.page > 1 || sumY.y > ctaY) && heldY > 0 && heldY < ctaY);
    check('it lists the red flag by kind with what it is, and says the rating was held', has('TESTIMONIALS AND ENDORSEMENTS') && has('Possible red flags, read from the public pages.') && has('Not legal or compliance advice'));
    const foot = (t) => t.y > 745;
    const pagesWithFoot = new Set(pdf.text.filter((t) => foot(t) && /^Page \d+ of \d+$/.test(t.s)).map((t) => t.page));
    check('every page has its foot, and nothing else is set that low', pagesWithFoot.size === pdf.pages && pdf.text.filter(foot).every((t) => /^(Spatacco Analytics LLC|spataccoanalytics\.com|Page \d+ of \d+|For informational purposes only\. Not legal or compliance advice\.)$/.test(t.s)));
    // nothing is set over anything: no two lines of words share ground, and no bar runs through a line
    const box = (t) => ({ page: t.page, l: t.x, r: t.x + t.w, t: t.y - t.size * 0.72, b: t.y + t.size * 0.18 });
    const hit = (p, q) => p.page === q.page && p.l < q.r - 1 && q.l < p.r - 1 && p.t < q.b - 1 && q.t < p.b - 1;
    const boxes = pdf.text.filter((t) => t.s.trim()).map(box);
    let over = 0, which = ''; const lines = pdf.text.filter((t) => t.s.trim()); for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (hit(boxes[i], boxes[j])) { over++; which = which || (lines[i].s + ' / ' + lines[j].s); }
    const barred = pdf.bars.filter((bb) => boxes.some((t) => hit(t, { page: bb.page, l: bb.x, r: bb.x + bb.w, t: bb.y, b: bb.y + bb.h }))).length;
    check('no words are set over other words, and no bar is drawn through a line (' + over + ' and ' + barred + ', of ' + boxes.length + ' lines and ' + pdf.bars.length + ' bars' + (which ? ': ' + which : '') + ')', over === 0 && barred === 0 && pdf.bars.length >= 8);
    await a.ctx.close();

    // a logo that will not load, on a phone: the firm's initials stand in, and the header keeps to the screen
    const b = await openTop({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true }, 'https://www.polished.example/logo.png', false);
    const m = await b.page.evaluate(() => { const logo = document.getElementById('res-logo'), band = document.getElementById('next-band'); const fs = (e) => parseFloat(getComputedStyle(e).fontSize);
      return { mono: logo.classList.contains('mono') && !logo.querySelector('img'), letters: logo.textContent, wide: document.documentElement.scrollWidth <= window.innerWidth,
        small: [...document.querySelectorAll('.res-firm-line, .res-firm-line a, #res-chips span, #next-band p, #next-band a')].filter((e) => fs(e) < 13).length, bandIn: band.getBoundingClientRect().right <= window.innerWidth }; });
    check('a logo that will not load leaves the firm\'s initials in its place (' + m.letters + '), and on a phone the header and the call to action keep to the screen with nothing under 13px', m.mono && m.letters === 'PS' && m.wide && m.bandIn && m.small === 0);
    await b.ctx.close();
    open.scored = null;
  }

  await browser.close();
  if (fails.length) { console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.log(fails.length + ' of ' + n + ' scorer checks failed'); process.exit(1); }
  console.log('ok: ' + n + ' scorer checks');
})().catch((e) => { if (fails.length) console.log(fails.map((f) => 'FAIL ' + f).join('\n')); console.error(String(e && e.stack || e)); process.exit(1); });
