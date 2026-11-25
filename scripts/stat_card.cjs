#!/usr/bin/env node
/*
 * Draws one statistic as a branded image, for LinkedIn and for the site.
 *
 *   node scripts/stat_card.cjs --post content/posts/2026-12-01-slug.json --out site/img/insights/slug
 *   node scripts/stat_card.cjs --value "35%" --label "of advisors plan to retire within 10 years" \
 *        --source "Cerulli" --year 2026 --tag "Advisor transitions" --out /tmp/card
 *
 * --post reads the post's first "stat" block (value, label, source name and
 * year) and its category. --out is a path with no extension: the script
 * writes <out>-square.png (1200 x 1200) and <out>-portrait.png (1080 x 1350),
 * each drawn at twice that for sharp text (--scale 1 draws them at exactly
 * that, for the copy the site shows). --size square|portrait draws one.
 * --style navy|light|split picks the look (navy is the house style).
 *
 * The colours are the site's (site/css/shared.css), the fonts are the site's
 * two families kept in brand/fonts so nothing is fetched, and the mark is
 * site/img/logo-square.png. A card always names its source: with no source
 * the script stops, as the site's rule is that a number without one is not
 * published.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SIZES = { square: [1200, 1200], portrait: [1080, 1350] };
const STYLES = ['navy', 'light', 'split'];
const TAGS = { practice: 'For advisors', markets: 'Markets', business: 'Business', sports: 'Sports' };
const FONTS = [
  ['Cormorant Garamond', 400, 'normal', 'cormorant-garamond-latin-400-normal.woff2'],
  ['Cormorant Garamond', 500, 'normal', 'cormorant-garamond-latin-500-normal.woff2'],
  ['Cormorant Garamond', 600, 'normal', 'cormorant-garamond-latin-600-normal.woff2'],
  ['Cormorant Garamond', 700, 'normal', 'cormorant-garamond-latin-700-normal.woff2'],
  ['Cormorant Garamond', 500, 'italic', 'cormorant-garamond-latin-500-italic.woff2'],
  ['Cormorant Garamond', 600, 'italic', 'cormorant-garamond-latin-600-italic.woff2'],
  ['DM Sans', 400, 'normal', 'dm-sans-latin-400-normal.woff2'],
  ['DM Sans', 500, 'normal', 'dm-sans-latin-500-normal.woff2'],
  ['DM Sans', 600, 'normal', 'dm-sans-latin-600-normal.woff2'],
  ['DM Sans', 700, 'normal', 'dm-sans-latin-700-normal.woff2'],
];

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function b64(rel) { return fs.readFileSync(path.join(ROOT, rel)).toString('base64'); }

function args(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) fail('unexpected argument ' + k);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) fail(k + ' needs a value');
    a[k.slice(2)] = v; i++;
  }
  return a;
}

// What goes on the card, from a post file or from the command line.
function cardOf(a) {
  let c;
  if (a.post) {
    let p;
    try { p = JSON.parse(fs.readFileSync(a.post, 'utf8')); } catch (e) { fail(a.post + ': ' + e.message); }
    const s = (p.blocks || []).find(b => b && b.type === 'stat');
    if (!s) fail(a.post + ': the post has no stat block to draw');
    const src = s.source || {};
    c = { value: s.value, label: s.label, source: src.name, year: src.year, tag: p.card_tag || TAGS[p.category] || '' };
  } else {
    c = { value: a.value, label: a.label, source: a.source, year: a.year, tag: a.tag || '' };
  }
  if (a.tag) c.tag = a.tag;
  for (const k of ['value', 'label', 'source']) {
    if (!c[k] || !String(c[k]).trim()) fail('the card needs a ' + k + (k === 'source' ? ': a number with no source is not published' : ''));
  }
  for (const k of Object.keys(c)) c[k] = String(c[k] == null ? '' : c[k]).trim();
  if (/\u2014/.test(Object.values(c).join(' '))) fail('no em dashes on a card');
  if (c.value.length > 14) fail('the value is too long for a card (14 characters at most): ' + c.value);
  if (c.label.length > 150) fail('the label is too long for a card (150 characters at most)');
  return c;
}

function fontCss() {
  return FONTS.map(([fam, w, st, file]) =>
    `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:url(data:font/woff2;base64,${b64('brand/fonts/' + file)}) format('woff2')}`
  ).join('\n');
}

function html(c, style, size) {
  const [W, H] = SIZES[size];
  const src = 'Source: ' + c.source + (c.year ? ', ' + c.year : '');
  const logo = `data:image/png;base64,${b64('site/img/logo-square.png')}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss()}
:root{--navy:#0F1B2D;--navy-light:#162640;--navy-mid:#1C3352;--cyan:#3DD8D8;--cyan-light:#5EE4E4;--purple:#7B5CFF;--blue:#5B8DEF;--off:#F7F9FC;--slate:#64748B;--charcoal:#1E293B;--text-light:#94A3B8}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:${W}px;height:${H}px;display:flex;flex-direction:column;padding:${size === 'portrait' ? '96px 84px 76px' : '88px 92px 72px'};overflow:hidden}
.tag{font-size:25px;letter-spacing:7px;text-transform:uppercase;font-weight:600}
.rule{width:92px;height:5px;border-radius:3px;background:linear-gradient(135deg,var(--cyan),var(--purple));margin-top:26px}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}
/* lining figures: the family's default figures are old-style, which sit below the line and draw 10 as io */
.value,.label{font-variant-numeric:lining-nums;font-feature-settings:'lnum' 1,'kern' 1}
.value{font-family:'Cormorant Garamond',serif;font-weight:600;line-height:.92;letter-spacing:-.02em;white-space:nowrap}
.label{font-family:'Cormorant Garamond',serif;font-weight:500;line-height:1.14;margin-top:34px;max-width:${W - 200}px;text-wrap:balance}
.foot{display:flex;align-items:center;justify-content:space-between;gap:28px}
.src{font-size:27px;font-weight:500;letter-spacing:.3px}
.brand{display:flex;align-items:center;gap:20px;flex:none}
.brand img{width:92px;height:92px;border-radius:18px;background:#fff;display:block}
.brand b{display:block;font-size:27px;font-weight:700;letter-spacing:.2px}
.brand span{display:block;font-size:22px;margin-top:3px}

/* navy: the house style */
.navy{background:radial-gradient(1200px 900px at 88% -10%,#1C3352 0%,rgba(28,51,82,0) 60%),var(--navy);color:#fff}
.navy::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(61,216,216,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(61,216,216,.045) 1px,transparent 1px);background-size:60px 60px}
.navy::after{content:'';position:absolute;left:0;right:0;top:0;height:10px;background:linear-gradient(90deg,var(--cyan),var(--purple))}
.navy > *{position:relative}
.navy .tag{color:var(--cyan)}
.navy .value{background:linear-gradient(135deg,#fff 10%,var(--cyan-light) 60%,var(--cyan) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.06em}
.navy .label{color:#fff}
.navy .src{color:var(--text-light)}
.navy .brand b{color:#fff}.navy .brand span{color:var(--cyan)}
.navy .foot{border-top:1px solid rgba(255,255,255,.12);padding-top:34px}

/* light: for a white feed */
.light{background:var(--off);color:var(--charcoal)}
.light::after{content:'';position:absolute;left:0;top:0;bottom:0;width:16px;background:linear-gradient(180deg,var(--cyan),var(--purple))}
.light .tag{color:var(--purple)}
.light .value{color:var(--navy)}
.light .label{color:var(--charcoal)}
.light .src{color:var(--slate)}
.light .brand img{box-shadow:0 2px 14px rgba(15,27,45,.12)}
.light .brand b{color:var(--navy)}.light .brand span{color:var(--slate)}
.light .foot{border-top:1px solid #DCE3EC;padding-top:34px}

/* split: the number on navy, the words on white */
.split{padding:0;background:var(--off);color:var(--charcoal)}
.split .top{background:radial-gradient(900px 700px at 90% -20%,#1C3352 0%,rgba(28,51,82,0) 62%),var(--navy);color:#fff;padding:${size === 'portrait' ? '92px 84px 70px' : '80px 92px 62px'};flex:none;height:${size === 'portrait' ? 54 : 52}%;display:flex;flex-direction:column;position:relative}
.split .top::after{content:'';position:absolute;left:0;right:0;bottom:0;height:10px;background:linear-gradient(90deg,var(--cyan),var(--purple))}
.split .top .mid{justify-content:flex-end}
.split .tag{color:var(--cyan)}
.split .value{color:#fff}
.split .bot{flex:1;display:flex;flex-direction:column;padding:${size === 'portrait' ? '56px 84px 70px' : '50px 92px 62px'};min-height:0}
.split .label{margin-top:0;color:var(--navy);flex:1;display:flex;align-items:center}
.split .src{color:var(--slate)}
.split .brand img{box-shadow:0 2px 14px rgba(15,27,45,.12)}
.split .brand b{color:var(--navy)}.split .brand span{color:var(--slate)}
.split .foot{border-top:1px solid #DCE3EC;padding-top:30px}
</style></head><body>
${style === 'split' ? `
<div class="card split">
  <div class="top">
    <div class="tag">${esc(c.tag)}</div>
    <div class="mid"><div class="value" id="value">${esc(c.value)}</div></div>
  </div>
  <div class="bot">
    <div class="label" id="label"><span>${esc(c.label)}</span></div>
    <div class="foot"><div class="src">${esc(src)}</div>
      <div class="brand"><img src="${logo}" alt=""><div><b>Spatacco Analytics</b><span>spataccoanalytics.com</span></div></div></div>
  </div>
</div>` : `
<div class="card ${style}">
  <div><div class="tag">${esc(c.tag)}</div><div class="rule"></div></div>
  <div class="mid">
    <div class="value" id="value">${esc(c.value)}</div>
    <div class="label" id="label">${esc(c.label)}</div>
  </div>
  <div class="foot"><div class="src">${esc(src)}</div>
    <div class="brand"><img src="${logo}" alt=""><div><b>Spatacco Analytics</b><span>spataccoanalytics.com</span></div></div></div>
</div>`}
</body></html>`;
}

// Sizes the number and the words to the room they have: as large as fits.
async function fit(page, style, size) {
  await page.evaluate(({ style, size }) => {
    const value = document.getElementById('value');
    const label = document.getElementById('label');
    const card = document.querySelector('.card');
    const padX = parseFloat(getComputedStyle(style === 'split' ? document.querySelector('.top') : card).paddingLeft);
    const room = card.clientWidth - padX * 2;
    const vMax = size === 'portrait' ? 400 : 380, vMin = 120;
    let v = vMax;
    value.style.fontSize = v + 'px';
    while (v > vMin && value.scrollWidth > room) { v -= 4; value.style.fontSize = v + 'px'; }
    const mid = (style === 'split' ? document.querySelector('.bot') : document.querySelector('.mid'));
    const over = () => (style === 'split'
      ? mid.scrollHeight > mid.clientHeight + 1 || document.querySelector('.top').scrollHeight > document.querySelector('.top').clientHeight + 1
      : mid.scrollHeight > mid.clientHeight + 1 || card.scrollHeight > card.clientHeight + 1);
    let l = size === 'portrait' ? 76 : 70;
    label.style.fontSize = l + 'px';
    while (l > 34 && over()) { l -= 2; label.style.fontSize = l + 'px'; }
    while (v > vMin && over()) { v -= 6; value.style.fontSize = v + 'px'; }
  }, { style, size });
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!a.out) fail('--out PATH (no extension) says where to write the images');
  const style = a.style || 'navy';
  if (!STYLES.includes(style)) fail('--style is one of ' + STYLES.join(', '));
  const sizes = a.size ? [a.size] : Object.keys(SIZES);
  for (const s of sizes) if (!SIZES[s]) fail('--size is square or portrait');
  const scale = a.scale === undefined ? 2 : Number(a.scale);
  if (scale !== 1 && scale !== 2) fail('--scale is 1 or 2');
  const c = cardOf(a);

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    for (const size of sizes) {
      const [W, H] = SIZES[size];
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
      await page.setContent(html(c, style, size), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await fit(page, style, size);
      const out = `${a.out}-${size}.png`;
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      await page.screenshot({ path: out, type: 'png' });
      console.log('wrote ' + out);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(e => fail(e.message));
