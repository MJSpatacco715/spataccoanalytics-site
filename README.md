# spataccoanalytics-site

The source of spataccoanalytics.com's main pages, and the pipeline that keeps
the live NFL tools on [/tools/](https://spataccoanalytics.com/tools/) current.

## Where everything lives

This repository is the one place the site is changed. Work goes on one branch
and one pull request at a time; merging to `main` is what publishes.

| Piece | Where it lives | Notes |
|---|---|---|
| Site pages, styles, scripts | `site/` here | The only source. A hand edit on the host is overwritten on the next Publish. |
| Website Scorer | `site/tools/website-scorer.html` | Public at `/tools/website-scorer.html`. |
| Short address for print | `site/score/index.html` | `/score/` forwards to the scorer, website-only, tagged `utm_source=leave-behind&utm_medium=qr`. Printed codes point here, so the scorer can move without a reprint. |
| Scorer leads | `site/score/lead.php` | Appends each lead to `sa-leads/scorer.jsonl` beside the web root on the host and mails a notice. The file is the record. |
| Services page | `site/services/index.html` | Public at `/services/`. Shows every service, level and timeline, and the hosting plans with their prices. Project prices are not in the page. |
| Project prices | The `SERVICE_PRICING` secret | **Never in this repo, which is public.** Publish writes them to `sa-pricing.json` beside the web root. `site/services/pricing.php` gives them out only after it has kept the visitor's name and email in `sa-leads/pricing.jsonl`. |
| What both lead forms share | `site/lib/leads.php` | The checks, the storage and the notice mail. |
| How the site appears in search and AI answers | `site/favicon*`, `site/img/logo-square.png`, `site/img/social-card.png`, the head tags and JSON-LD on each page, `site/sitemap.xml`, `site/robots.txt`, `site/llms.txt` | The favicon and square logo are the SA mark (`site/img/sa-mark.png`). The canonical address is `https://spataccoanalytics.com` without `www`. Search engines decide what they show and can take weeks to pick up a change. |
| QR code for the menu | `menu/qr-score.svg`, `menu/qr-score.png` | Encodes `https://spataccoanalytics.com/score/`. Regenerate only if that address changes. |
| Service menu (one page, print and PDF) | Claude Design canvas "Service Menu" | Not in this repo: it is edited on the canvas. Its QR code and its link both go to `/score/`. |
| Scoring relay (`ria-scorer` Cloudflare Worker) | Cloudflare account | **Not in this repo yet.** Holds the API key and passes the scorer's and resume parser's requests through. |
| Contact form handler (`/contact/submit.php`) | Host only | **Not in this repo yet.** The import skipped it; the deploy leaves it alone. |
| NFL tools | Source platform's repository, built here by `live/` | Read-only. See below. |
| Plan and decisions | Roadmap and Business Plan docs, Notion Session Log | Reference, not source. Where they disagree with this repo, this repo is what is live. |

How a visitor moves: printed menu (QR) or PDF menu (link) > `/score/` >
scorer, website-only > overall score > name and email > full breakdown and
PDF > `/services/`. The lead is recorded when the email is given. On
`/services/` a visitor builds a plan, and a name and email bring the project
prices onto the page. Someone who has given an email on either page is not
asked again on the other for 30 days.

## What it does

```
 source platform (private repo + live site)        this repo                         spataccoanalytics.com
 ──────────────────────────────────────────        ─────────                         ─────────────────────
 code and data files ── read-only token ──────►    Publish workflow                  /tools/  (Sports Desk:
                                                    1. live numbers and dates         three NFL cards on top)
                                                    2. the working tools, built       /tools/football/<tool>.html
                                                       and opened in a browser          (the tool, running, framed
                                                    3. build site/ + generated  ──►     by what it is and how it
                                                    4. deploy over SSH                  is built)
 public data calls  ◄──── server to server ─────────────────────────────────────────   /tools/football/live/feed.php
```

- **The tools work, they are not pictures.** Each tool page carries the
  platform's own page for it, running, with an "Open full screen" view. The
  build (`live/build.mjs`) copies the pages and the scripts they load, strips
  comments, renames the platform, swaps its site script for the few drawing
  helpers the tools use, and writes the depth chart and Madden ratings beside
  them. Game lines, the line's path, the injury report and referee
  assignments come live through `live/feed.php`, which asks the source at
  most once a minute per call and serves the last good answer if the source
  cannot be read. Sign-in, league rosters and alerts stay on the platform.
- **Nothing is written to the source platform.** Its repository is read with a
  read-only token, and the relay makes only the four public read calls the
  pages make for a signed-out visitor.
- **Free.** No AI runs on a schedule. The repository is public, so GitHub
  Actions minutes cost nothing.
- **As current as the source.** The live data is a minute behind it at most.
  Publish rebuilds the rest hourly, and every 15 minutes through Sunday
  afternoons and evenings and the Monday and Thursday night games.
- **Private names stay private.** Every built file is checked against the
  denylist in `config/hosting.json` plus the source site's host name (taken
  from its secret at run time), and the build fails on a hit. The relay drops
  the fields that name a league member and refuses an answer carrying a
  denylisted word. Screenshots cut the same words.
- **Checked before it ships.** Each Publish run opens every tool in a browser,
  full screen and framed, and fails it on any error or empty page; a failed
  build or check falls back to fresh screenshots for that run.
- **Safe to deploy.** It writes only the files this repo manages. It backs up
  anything it replaces, and never touches `saratoga/` or other directories
  listed in `config/hosting.json`.

## Layout

| Path | What it is |
|---|---|
| `site/` | The main site's files, imported from the host (see setup step 3). This is where the site is edited from now on. |
| `showcase/tools.json` | Each NFL tool's copy: name, tagline, summary, highlights, stack. Metrics with a `key` are filled with live numbers at build time. |
| `showcase/img/` | Baseline screenshots, used when the live tools and a fresh capture both fail. |
| `live/` | The working tools: `build.mjs` (public editions from the source), `shim.js` (stands in for the platform behind the pages), `feed.php` (the live data relay), `smoke.mjs` (the browser check). |
| `site/score/` | The short address a printed QR code points at (`index.html`) and the scorer's lead endpoint (`lead.php`). |
| `menu/` | The QR code used on the service menu. |
| `site-edits.json` | The approved copy edits and the card markers on `tools/index.html`. They are applied at build time and are safe to re-run. |
| `scripts/build_site.py` | Builds `dist/`: site files, edits, NFL cards, tool pages, images. |
| `scripts/source_metrics.py` | Live numbers and "last improved" / "data as of" dates from the source repo. |
| `capture/` | Screenshot script and the local stand-in API used to render the depth chart page. |
| `scripts/remote_deploy.sh` | Runs on the host during a deploy. It only writes the paths it is given, with backups. |
| `reference/live/` | A read-only copy of the live pages (fetched by Site probe), used by CI and for previews before the import. |

## Setup (once)

The repository is public, which is what makes the scheduled runs free.

1. **Add five secrets** (Settings > Secrets and variables > Actions). GitHub
   never lets one repository read another's secrets, so the SSH key is pasted
   here once even though the Saratoga repository already holds it. Everything
   else (SSH host, user and port, the source repository's name, the denylist)
   is plain configuration in `config/hosting.json`, as in the Saratoga and
   family-site repositories.

   | Secret | Value |
   |---|---|
   | `DEPLOY_SSH_KEY` | The same private key the Saratoga dashboard deploys with (SiteGround Site Tools > Devs > SSH Keys Manager) |
   | `DEPLOY_SSH_PASSPHRASE` | That key's passphrase |
   | `SOURCE_REPO_TOKEN` | Fine-grained token: the source repository only, Contents read-only (the token the source server already pulls with works) |
   | `SOURCE_SITE_URL` | The source platform's public address, ending in `/`. A secret only so the address is not published here |
| `SERVICE_PRICING` | The project prices as JSON, whole dollars: `{"audit":{"professional":0,"complete":0},"design":{"essential":0,"professional":0,"complete":0},"crm":{"essential":0,"professional":0,"complete":0}}`. Without it the services page still takes pricing requests and says pricing follows by email |

2. **Import the live site.** Actions > Import live site > Run workflow. It
   copies the main site's pages, styles, scripts and images into `site/`,
   scans them for credentials, and opens a pull request. It does not change
   the live site. Merge that pull request.
3. **Publish.** The next scheduled run deploys. You can also start one by hand:
   Actions > Publish > Run workflow.

Until steps 1 and 2 are done, Publish skips itself with a notice. It does not fail.

## Changing things

- **Site copy or layout:** edit the files in `site/` and merge to `main`.
  Publish deploys it. A file changed on the host by hand is overwritten on
  the next run, and the replaced copy is kept in the host's backups.
- **A tool's copy:** edit `showcase/tools.json`.
- **Adding a tool:** add an entry to `showcase/tools.json`, a capture in
  `capture/capture.mjs`, and its paths in `scripts/source_metrics.py`. To run
  it live, add its page to `PAGES` in `live/build.mjs` (and `shim.js`), name
  it in the entry's `live`, and give `live/smoke.mjs` a check for it.
- **When the source changes shape:** the live build fails on anything it
  expected and did not find (a text it rewrites, a script it does not know,
  a helper it lifts from the site script), and Publish shows screenshots until
  it is fixed. The run's warning names what moved.

## Checks

```
python3 scripts/validate_showcase.py                        # schema + house rules (no em dashes, no denylisted names)
python3 scripts/build_site.py --site reference/live --out dist && \
  python3 scripts/validate_showcase.py --html dist/tools/football
bash tests/remote_deploy_test.sh                            # the deploy never leaves its lane
bash tests/feed_test.sh                                     # the relay passes on only what it should
bash tests/lead_test.sh                                     # the lead endpoint keeps real leads and nothing else
bash tests/pricing_test.sh                                  # project prices go only to a visitor who left an email
npm install --prefix live && \
  node live/build.mjs --source <source checkout> --out build/live && \
  node live/smoke.mjs --live build/live                     # the working tools, built and opened
```

CI runs the first six on every push, and the last when it has the source token.
