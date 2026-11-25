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
bash tests/pricing_test.sh
node tests/worker_test.mjs
bash tests/insights_test.sh
for f in site/score/lead.php site/contact/submit.php site/lib/leads.php site/services/pricing.php site/bank/api.php site/lib/bank.php; do php -l "$f"; done
```
