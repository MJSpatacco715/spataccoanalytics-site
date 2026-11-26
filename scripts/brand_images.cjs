#!/usr/bin/env node
/*
 * Draws the pictures that show the firm outside the site, with the wordmark
 * front and centre:
 *
 *   node scripts/brand_images.cjs            # every picture
 *   node scripts/brand_images.cjs share      # one of: share, linkedin-cover, google-cover, square
 *
 *   site/img/social-card.png                     1200 x 630   the picture a link to the site shows on
 *                                                             LinkedIn, in a text message, in Slack
 *   brand/profile/linkedin-cover-2256x382.png    2256 x 382   the banner across a LinkedIn page
 *   brand/profile/google-cover-1200x900.png      1200 x 900   the cover of a Google Business Profile
 *   brand/profile/wordmark-square-800.png         800 x 800   the wordmark for a square profile picture
 *
 * The owner, 2026-11-26, once the site's menu showed the wordmark: "can i make
 * sure the new logo is front and center for linkedin / google search, etc?"
 * Until then every one of these led with the SA mark and the name set in type.
 *
 * The wordmark is brand/wordmark-on-dark-large.png (scripts/logo_cutout.py).
 * The colours and the two type families are the site's; the fonts are in
 * brand/fonts, so nothing is fetched. Needs Playwright, as the stat cards do,
 * and Pillow (as scripts/logo_cutout.py does) to pack each file small: a browser
 * writes a picture three times the size it needs to be, and some places that
 * show a link's picture pass over a heavy one.
 *
 * Only the first is served by the site. The rest are for the owner to upload:
 * the profiles belong to the owner's accounts.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LINE = 'Websites, CRM, and data<br>for independent advisors.';
const ADDRESS = 'spataccoanalytics.com';
const FONTS = [
  ['Cormorant Garamond', 500, 'cormorant-garamond-latin-500-normal.woff2'],
  ['DM Sans', 400, 'dm-sans-latin-400-normal.woff2'],
  ['DM Sans', 500, 'dm-sans-latin-500-normal.woff2'],
  ['DM Sans', 600, 'dm-sans-latin-600-normal.woff2'],
];
const b64 = (rel) => fs.readFileSync(path.join(ROOT, rel)).toString('base64');

function page(w, h, css, body) {
  const faces = FONTS.map(([fam, wt, file]) => `@font-face{font-family:"${fam}";font-weight:${wt};src:url(data:font/woff2;base64,${b64('brand/fonts/' + file)}) format("woff2")}`).join('\n');
  return `<!doctype html><meta charset="utf-8"><style>${faces}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:linear-gradient(160deg,#0F1B2D 0%,#16243D 55%,#1C3352 100%);font-family:"DM Sans",sans-serif;color:#CBD5E1;display:flex;align-items:center;justify-content:center}
.word{display:block}
.rule{height:3px;background:linear-gradient(135deg,#3DD8D8,#7B5CFF);border-radius:2px}
.line{color:#CBD5E1;font-weight:400;text-align:center}
.at{color:#3DD8D8;font-weight:500;text-transform:uppercase}
${css}</style><body>${body}</body>`;
}
const WORD = `<img class="word" src="data:image/png;base64,${b64('brand/wordmark-on-dark-large.png')}" alt="">`;

const PICTURES = {
  // A link to the site: the wordmark, what the firm does, the address.
  share: {
    out: 'site/img/social-card.png', w: 1200, h: 630, scale: 1,
    css: `.col{display:flex;flex-direction:column;align-items:center}
.word{width:760px}.rule{width:64px;margin:44px 0 30px}
.line{font-size:31px;line-height:1.35}.at{font-size:19px;letter-spacing:.2em;margin-top:34px}`,
    body: `<div class="col">${WORD}<div class="rule"></div><div class="line">${LINE}</div><div class="at">${ADDRESS}</div></div>`,
  },
  // The banner across a LinkedIn page. The page's picture covers its lower left and a
  // phone shows only its middle, so everything sits in the middle, a little to the right.
  'linkedin-cover': {
    out: 'brand/profile/linkedin-cover-2256x382.png', w: 1128, h: 191, scale: 2,
    css: `.row{display:flex;align-items:center;gap:34px;margin-left:110px}
.word{width:330px}.rule{width:2px;height:86px;background:linear-gradient(180deg,#3DD8D8,#7B5CFF)}
.line{font-size:19px;line-height:1.4;text-align:left}.at{font-size:11.5px;letter-spacing:.2em;margin-top:9px}`,
    body: `<div class="row">${WORD}<div class="rule"></div><div><div class="line">${LINE}</div><div class="at">${ADDRESS}</div></div></div>`,
  },
  // The cover of a Google Business Profile. Google may show only the square in its middle.
  'google-cover': {
    out: 'brand/profile/google-cover-1200x900.png', w: 1200, h: 900, scale: 1,
    css: `.col{display:flex;flex-direction:column;align-items:center}
.word{width:740px}.rule{width:64px;margin:50px 0 34px}
.line{font-size:33px;line-height:1.35}.at{font-size:20px;letter-spacing:.2em;margin-top:38px}`,
    body: `<div class="col">${WORD}<div class="rule"></div><div class="line">${LINE}</div><div class="at">${ADDRESS}</div></div>`,
  },
  // The wordmark alone in a square, for a profile picture. It is shown small, and often
  // in a circle, so it carries nothing else. The SA mark reads better at that size.
  square: {
    out: 'brand/profile/wordmark-square-800.png', w: 400, h: 400, scale: 2,
    css: `body{background:#0F1B2D}.word{width:322px}`,
    body: WORD,
  },
};

(async () => {
  const want = process.argv.slice(2);
  const names = want.length ? want : Object.keys(PICTURES);
  for (const n of names) if (!PICTURES[n]) { console.error('ERROR: no picture called ' + n + ' (there is ' + Object.keys(PICTURES).join(', ') + ')'); process.exit(1); }
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('ERROR: Playwright is not installed here'); process.exit(1); }
  const browser = await chromium.launch();
  for (const n of names) {
    const p = PICTURES[n];
    const ctx = await browser.newContext({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: p.scale });
    const pg = await ctx.newPage();
    await pg.setContent(page(p.w, p.h, p.css, p.body), { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    const out = path.join(ROOT, p.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await pg.screenshot({ path: out, type: 'png' });
    await ctx.close();
    // the same picture, pixel for pixel, packed properly
    const packed = spawnSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB")\nim.save(sys.argv[1], optimize=True)', out]);
    if (packed.status !== 0) { console.error('ERROR: could not pack ' + p.out + ' (is Pillow installed?)'); process.exit(1); }
    console.log('wrote ' + p.out + ': ' + p.w * p.scale + ' x ' + p.h * p.scale + ', ' + Math.round(fs.statSync(out).size / 1024) + ' KB');
  }
  await browser.close();
})().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
