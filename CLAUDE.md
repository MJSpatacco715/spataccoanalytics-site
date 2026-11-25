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
- Pages are never kept by the host's page cache (`site/.htaccess` marks
  every `.html` file `private, no-cache`), so a publish shows without anyone
  clearing a cache. Scripts, styles and images are kept for a year: when one
  changes, its address must change (a `?v=`), or returning visitors never get
  it.
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
- The market strip on the homepage (`site/js/ticker.js`, `site/market/feed.php`,
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
  The RIA deal count on it is DeVoe & Company's, the same source as the
  record in the stat row, typed into `MARKET_DEALS` each quarter
  (`docs/stat-bank.md`). Its card is drawn, not written out: the count, a bar
  toward the record, and the year beside the record year quarter by quarter,
  all from numbers in that same place. The energy figures are asked for
  hourly, because their publisher releases the daily oil prices once a week.
  Its hover cards name the source with a link and end on the owner's line:
  "This tool runs entirely on free public data. Yours could too." That is as
  far as the hover sells: no link and no direct pitch. The owner wants the
  question ("why don't you have tools like this working for you") asked where
  the strip is referenced elsewhere on the site. The host keeps scripts
  and styles for a year, so the strip's two tags in `site/index.html` carry
  `?v=` and the first eight characters of each file's SHA-1.
  `tests/market_test.sh` fails until they match.
- Printed material points at `/score/`, never at the scorer's own address.
  If the scorer moves, change `site/score/index.html`, not the print.
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
