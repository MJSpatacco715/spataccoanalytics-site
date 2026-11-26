# spataccoanalytics-site

This repository is the single source for spataccoanalytics.com. Read
"Where everything lives" in `README.md` before changing anything: it maps
every piece (site, scorer, `/score/`, lead endpoint, menu, relay) to where it
lives and says which pieces are not in this repo yet.

## Working rules

- One branch and one open pull request at a time. Before starting, list open
  pull requests and build on or supersede what is there; do not open a
  parallel one for the same pages.
- Merging to `main` publishes (`.github/workflows/publish.yml`). Nothing is
  live until then, so say "merged" and "live" separately.
- Site copy and pages are edited in `site/` only. Never on the host.
- The home page is short on purpose: five screens (buyers and your data,
  prospects and your website, the three pillars, how we work, contact), each
  sending a visitor on to a page of its own. The owner asked for this after
  the page had grown to seven long sections. Long copy goes on `/approach/`,
  `/about/` or `/services/`, not back onto the home page.
  `tests/pages_test.sh` holds the shape, a word limit, that each pillar links
  to a real service, and that every menu reaches every page.
  It is short in height too (the owner again, in November 2026: "main page
  still too scrolley"): from 1080px wide the first screen, the website screen,
  How We Work and the closing band are laid out side by side (copy on the
  left; figures, steps or the button on the right), and no section is padded
  more than it needs. On a phone everything is one vertical stack, section by
  section: nothing sits side by side there. A change that adds a section or a tall block has to take as
  much height out somewhere else.
- The menu reads Services, Approach, Tools, About, Contact, on every page, in
  the posts' shell (`scripts/build_insights.py`) and so on every tool page. The
  owner set that order on 2026-11-26. `tests/pages_test.sh` holds it.
- The logo. The owner, 2026-11-26: "the logo is small and near invisible on the
  site". The menu had shown the logo file whole (`site/img/logo.jpg`: the
  wordmark small in the middle of a white square), 36px tall, which left the
  name about 8px tall. Shown four fixes and asked which, the owner answered "A
  with C where appropriate". So: the menu on every page shows the wordmark
  alone, cut out of its square, lettering white (`site/img/wordmark-on-dark.png`,
  made by `scripts/logo_cutout.py`), 48px tall on a desktop and never under
  36px; and both logos together, the SA mark on its white tile and then the
  wordmark, go where there is room for both, which is the footer. The two are
  not put side by side in the menu, and `logo.jpg` is never shown directly on a
  dark page. The SA mark (`site/img/logo-square.png`) stays the picture for the
  browser tab, search and profiles. `tests/pages_test.sh` and
  `tests/logo_browser.cjs` hold all of it.
  The wordmark's tags and the `shared.css` link carry `?v=` and the first eight
  characters of the file's SHA-1, because the host keeps both for a year: change
  `site/css/shared.css` and the link on every page (and in
  `scripts/build_insights.py`) must change with it.
  Off the site the wordmark leads too (the owner, the same day: "can i make
  sure the new logo is front and center for linkedin / google search, etc?"):
  the share picture every page names (`site/img/social-card.png`, with a `?v=`),
  and the LinkedIn banner and Google cover in `brand/profile/`, all drawn by
  `scripts/brand_images.cjs`. Three places stay the SA mark because they are
  small squares where the wordmark cannot be read: the browser-tab icon, the
  logo search engines are given in the home page's structured data (Google
  asks that it look right on white, where white lettering would vanish), and a profile
  picture unless the owner chooses the wordmark square. The profiles are the
  owner's accounts: the files are made here, the owner uploads them.
- Pages are never kept by the host's page cache (`site/.htaccess` marks
  every `.html` file `private, no-cache`), so a publish shows without anyone
  clearing a cache. Scripts, styles and images are kept for a year: when one
  changes, its address must change (a `?v=`), or returning visitors never get
  it.
  The site is behind Cloudflare, which keeps a script, style or image for that
  year under its full address, `?v=` included, at each of its locations. So a
  new address must never be asked for before the publish that brings the file
  has finished: asked early, Cloudflare is handed the old file and serves it
  under the new address from then on. On 2026-11-26 a check of
  `ticker.css?v=...` made a minute before the publish landed left the Newark
  location serving the old stylesheet, and the owner saw the strip unpinned
  ("ticker not sticking to the right place"). To check a publish: read the
  page, which is never kept, until it names the new address, and only then
  fetch the file and compare its SHA-1 with the tag, several times so that more
  than one location answers. A count of some word in the file proves nothing.
  If a wrong copy is kept anyway, change the file so its address changes; the
  owner can also purge that address in Cloudflare.
  A visitor cannot cause it either: the publish unpacks everything a page
  loads first and the pages last (`scripts/remote_deploy.sh`,
  `tests/remote_deploy_test.sh`), so no page names an address before its file
  is there. Keep that order.
- No em dashes in anything written to the site, the docs or commit messages.
- Private names stay private: the denylist in `config/hosting.json` applies
  to every built file.
- Project prices never go in this repository: not in a page, a test, a
  commit message or a pull request. The repository is public. They live in
  the `SERVICE_PRICING` secret only. Hosting prices are public and are in
  `site/services/index.html`.
- Every statistic on the site carries its source: the publisher and year in
  view, and a source card (`site/css/cite.css`, `site/js/cite.js`) with the
  finding, who was surveyed and a link. A number with no checkable source
  does not go on the site.
- A post is a file in `content/posts/` (format at the top of
  `scripts/build_insights.py`). The site is where a piece is published;
  LinkedIn gets its words from `build_insights.py --linkedin SLUG` and a
  link back. Only the `practice` category appears on the homepage.
- The weekly statistic follows `docs/stat-bank.md`: the next item from the
  private stat bank (`/bank/`), traced to its real source, drawn as a card
  (`scripts/stat_card.cjs`) and written as a post. Nothing from the bank is
  published, on the site or anywhere else, until the owner says so. What is
  in the bank is private: never copy an item, a file or the bank's password
  or token into this repository, a commit or a pull request.
- The market strip is on the tools page. The owner moved it there from the
  home page on 2026-11-26 ("i want the ticker to be on the tools page instead
  of the home page"), and the same day set its place: "lets have the copy lead
  and have the scroll between tools & projects and financial services section.
  when user scrolls down on the tools page the ticker should go with them and
  stay up top pinned to menu". So the opening copy comes first, the strip sits
  between it and the Financial Services section, and once the page is scrolled
  past it the strip stays pinned under the menu (`position: sticky`, its top
  set to the menu's height by `site/js/ticker.js`). The home page does not
  carry it. In `site/tools/index.html` it is the page's own child, between
  those two sections, never inside one: inside a section it would stop being
  pinned when that section scrolled away, and its cards would be cut off. Its
  stylesheet and script tags sit beside it, not in the head or after the
  footer, because the build reuses that page's head, menu and footer for each
  tool's own page.
  A card always shows whole. Pinned, it opens below the strip. Where the strip
  still sits low on the screen it opens above it, and where neither side has
  the height it is laid out wide, in two halves side by side (`wide()` and
  `under()` in `site/js/ticker.js`). A change to a card's contents has to be
  checked at the start position as well as pinned.
  The strip (`site/js/ticker.js`, `site/market/feed.php`,
  `site/lib/market.php`) shows only figures the site may show: each comes
  from its publisher's own free feed and says in view who published it and
  for when. The S&P 500, the Dow and gold are licensed data. They do not go
  on the strip from a free or scraped feed: only from a source the owner has
  a licence for. The energy key is the `EIA_API_KEY` secret and is never in
  this repository.
  Brent and WTI are not the energy publisher's own figures: it buys them from
  Refinitiv and republishes them with permission. The owner was told this and
  ruled on 2026-11-25 to keep both on the strip, so do not take them off or
  raise it again. Its weekly gasoline price is its own survey.
  The RIA deal count on it is DeVoe & Company's, typed into `MARKET_DEALS`
  each quarter
  (`docs/stat-bank.md`). Every card is drawn, not written out. The deal
  count: the count, a bar toward the record, and the year beside the record
  year quarter by quarter, all from numbers in that same place. A market
  figure: its value and change, a line of its recent history, the low, the
  high and the change. The history comes from the same publisher's feed as
  the figure and is kept with it; a chart needs five days of it. The energy figures are asked for
  hourly, because their publisher releases the daily oil prices once a week.
  Its hover cards name the source with a link and end on the owner's line:
  "This tool runs entirely on free public data. Yours could too." That is as
  far as the hover sells: no link and no direct pitch. The owner wants the
  question ("why don't you have tools like this working for you") asked where
  the strip is referenced elsewhere on the site. The host keeps scripts
  and styles for a year, so the strip's two tags in `site/tools/index.html` carry
  `?v=` and the first eight characters of each file's SHA-1.
  `tests/market_test.sh` fails until they match.
- Search: a page's title says what the page sells or does, not its menu name
  ("Services" alone told a search engine nothing). Every page in the sitemap
  has a description of 80 to 160 characters and is not `noindex`; a delisted or
  private page is `noindex` and not in the sitemap. After a merge, the publish
  sends the pages that merge changed to IndexNow (`scripts/indexnow.py`), for
  Bing. Its key is the 32-character `.txt` file in `site/`, public by design:
  do not treat it as a secret or delete it. Google is reached through Search
  Console and the sitemap, which only the owner's account can do.
- Printed material points at `/score/`, never at the scorer's own address.
  If the scorer moves, change `site/score/index.html`, not the print.
- A field for a web address takes what people type. The owner, after the scorer
  turned away `www.` and a domain with no `https://`: "This cannot require https
  etc. too rigid". `tidyAddress` in `site/tools/website-scorer.html` makes a
  typed address whole, and `lead_url` in `site/lib/leads.php` reads it the same
  way. No field asks for `https://`, in its hint or in its message.
- The scorer and the resume parser talk to the `ria-scorer` Cloudflare
  Worker. Its source is `worker/ria-scorer.js`, and it refuses any request
  it does not recognise. Change a tool's instructions, reader, tools or
  sizes and the relay must change with it: `tests/worker_test.mjs` fails
  until it does. The Worker is deployed by hand (`worker/README.md`), so a
  relay change is not live until the owner has pasted it in. Say so.

## Checks before a push

```
python3 scripts/validate_showcase.py showcase/tools.json
python3 scripts/build_site.py --site site --out dist
bash tests/remote_deploy_test.sh
bash tests/feed_test.sh
bash tests/lead_test.sh
bash tests/contact_test.sh
bash tests/notice_test.sh
bash tests/bank_test.sh
bash tests/card_test.sh
bash tests/market_test.sh
bash tests/pages_test.sh
bash tests/pricing_test.sh
node tests/worker_test.mjs
bash tests/insights_test.sh
for f in site/score/lead.php site/contact/submit.php site/lib/leads.php site/services/pricing.php site/bank/api.php site/lib/bank.php site/market/feed.php site/lib/market.php; do php -l "$f"; done
```
