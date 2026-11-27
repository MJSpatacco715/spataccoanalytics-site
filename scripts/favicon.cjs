// The browser-tab icon: SA in white on a navy tile, drawn large enough to read at 16px.
//   node scripts/favicon.cjs <outdir>   writes 16.png ... 512.png; site/favicon.ico holds the 16, 32 and 48.
// It was the SA mark on a white square, which at tab size was a pale smudge (the owner, 2026-11-27: "icon in tab not
// good either"). When it changes, raise the ?v= on every page's icon tags: browsers keep a tab icon for a long time.
const { chromium } = require('playwright'); const path = require('path');
const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3DD8D8"/><stop offset=".55" stop-color="#5B8DEF"/><stop offset="1" stop-color="#7B5CFF"/></linearGradient></defs>
<rect width="64" height="64" rx="12" fill="#0F1B2D"/>
<text x="32" y="43" text-anchor="middle" font-family="'DejaVu Sans','Liberation Sans',Arial,sans-serif" font-weight="700" font-size="35" letter-spacing="-2.5" fill="#FFFFFF">SA</text>
<rect x="9" y="50" width="46" height="5" rx="2.5" fill="url(#g)"/></svg>`;
(async () => { const b = await chromium.launch(); const out = process.argv[2];
  for (const s of [16, 32, 48, 96, 180, 192, 512]) { const p = await b.newPage({ viewport: { width: s, height: s } }); await p.setContent(`<body style="margin:0;background:transparent">${svg(s)}</body>`); await p.screenshot({ path: path.join(out, s + '.png'), omitBackground: true }); await p.close(); }
  await b.close(); })();
