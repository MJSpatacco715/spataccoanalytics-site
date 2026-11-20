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
- Printed material points at `/score/`, never at the scorer's own address.
  If the scorer moves, change `site/score/index.html`, not the print.
- The scorer talks to the `ria-scorer` Cloudflare Worker, which is not in
  this repo. A change to the request shape must work through a plain
  pass-through relay, and cannot be confirmed live from a cloud session
  whose network does not allow that host.

## Checks before a push

```
python3 scripts/validate_showcase.py showcase/tools.json
python3 scripts/build_site.py --site site --out dist
bash tests/remote_deploy_test.sh
bash tests/feed_test.sh
bash tests/lead_test.sh
php -l site/score/lead.php
```
