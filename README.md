# spataccoanalytics-site

The source of spataccoanalytics.com's main pages, and the pipeline that keeps
the live NFL tools on [/tools/](https://spataccoanalytics.com/tools/) current.

## Where everything lives

This repository is the one place the site is changed. Work goes on one branch
and one pull request at a time; merging to `main` is what publishes.

| Piece | Where it lives | Notes |
|---|---|---|
| Site pages, styles, scripts | `site/` here | The only source. A hand edit on the host is overwritten on the next Publish. |
| Home page | `site/index.html` | Five short screens: buyers and your data, prospects and your website, the three pillars (each a link to its service), how we work (headline, one line, four steps, a link to the full page), and the contact band. `tests/pages_test.sh` holds it to that shape and a word limit. |
| How We Work | `site/approach/index.html` | Public at `/approach/`. The full argument and the four steps. |
| About | `site/about/index.html` | Public at `/about/`. Who founded the firm and who it works with. |
| Website Scorer | `site/tools/website-scorer.html` | Public at `/tools/website-scorer.html`. Dressed by the site: the shared stylesheet, menu and footer, the navy ground, the same two typefaces and buttons. Its own styles are only the form, the matches and the results. The PDF it makes keeps paper colours. |
| Insights (posts) | `content/posts/*.json`, built by `scripts/build_insights.py` | One file per post. Merging a post publishes it: a page, the feed at `/insights/`, an RSS feed, and (for the advisor category only) a teaser on the homepage. Statistics must carry a source. Live since 2026-11-25 with its first post. Once it has a post, every page's last line links to it. |
| Stat bank (private) | `site/bank/`, `site/lib/bank.php` | The owner's private drop zone at `/bank/`: links, words, screenshots and files worth posting. Items and uploads are kept in `sa-bank/` beside the web root, never here. Opens with the `BANK_PASSWORD` secret; the weekly routine reads it with `BANK_TOKEN`. |
| Weekly statistic | `docs/stat-bank.md` | The routine: next item from the bank, traced to its source, a post and a card, the owner's approval, then live. |
| Statistic cards | `scripts/stat_card.cjs`, `brand/fonts/` | One statistic drawn in the site's colours and fonts, square and portrait, for LinkedIn and as a post's share image (`card` in the post file). |
| Market strip (tools page) | `site/js/ticker.js`, `site/css/ticker.css`, `site/market/feed.php`, `site/lib/market.php`, mounted in `site/tools/index.html` | A slow scroll of eight figures on the tools page (it was on the home page until 2026-11-26). It sits after the page's opening section and before the first group of tools; that section is as tall as the first screen less the strip, so the strip lies along the bottom of the first screen, and once the page is scrolled past it, it stays pinned under the menu. Its cards open below it, above it, or laid out wide in two halves, whichever shows the whole card. The figures: the year's RIA deal count against the record (DeVoe & Company, typed in each quarter), the U.S. 30-year and 10-year yields (U.S. Treasury), the U.S. dollar in euros (the European Central Bank's euro rate, turned round, with a line on which of the two is worth more), bitcoin (CoinGecko, credited as it asks), Brent, WTI and U.S. regular gasoline (Energy Information Administration). Each says in view who published it and for when, and opens a card that draws it (the value and its change, a line of its recent history, the low, the high and the change; for the deal count, the year beside the record year by the quarter) and names its source with a link. The "Markets" label opens a card about the whole strip, with every source linked. The feed asks a source only when its answer has run out, keeps the answers in `sa-market/` beside the web root, and leaves a figure off once it is too old. The oil and gasoline prices need the `EIA_API_KEY` secret, and their source takes fifteen to twenty seconds to answer a fresh question, so it is asked only after the visitor has been answered. The S&P 500, the Dow and gold are licensed data and are not on it. |
| LinkedIn page address | `content/site.json` | Once set, every page that signs off links to it and the homepage tells search engines it belongs to the firm. |
| Resume Parser | `site/tools/resume-parser/index.html` | Public tool: a resume in, structured data out, as Excel or CSV. Two free reads per browser, then an invitation to get it for the visitor's firm. Holds no client's records or field names. |
| Short address for print | `site/score/index.html` | `/score/` forwards to the scorer, website-only, tagged `utm_source=leave-behind&utm_medium=qr`. Printed codes point here, so the scorer can move without a reprint. |
| Scorer leads | `site/score/lead.php` | Appends each lead to `sa-leads/scorer.jsonl` beside the web root on the host and mails a notice. The file is the record. |
| Services page | `site/services/index.html` | The first screen shows the four services themselves (beside the headline from 1000px wide, under it on a phone), each going to its own part of the page; `tests/hero_browser.cjs` holds that all four are in view at the owner's window size and on a phone. Public at `/services/`. Shows every service, level and timeline, and the hosting plans with their prices. Project prices are not in the page: each reads "Click to unveil". A visitor's first click shows that one price; any other click opens the pricing form with both ticked, the rest a click away under "Add other services", and an email brings every price onto the page. |
| Project prices | The `SERVICE_PRICING` secret | **Never in this repo, which is public.** Publish writes them to `sa-pricing.json` beside the web root. `site/services/pricing.php` gives one free, with no email, once per browser (an HttpOnly cookie, 30 days) and at most two different ones a day per address: a soft limit that keeps a script from reading them all. It gives them all only after it has kept the visitor's name, email and the services they ticked in `sa-leads/pricing.jsonl`, and mailed the notice. |
| What the lead forms and the contact form share | `site/lib/leads.php` | The checks, the storage and the notice mail. The notice is sent by the web host, From the firm's address. Two rules at Microsoft 365 decide whether it arrives: the envelope sender must NOT be at the firm's domain (Microsoft refuses that as Direct Send), and the host's DKIM key must be in the domain's DNS (`default._domainkey` in Cloudflare) or the domain's DMARC policy quarantines the notice. |
| The logo in the menu and the footer | `site/img/wordmark-on-dark.png` (made from `site/img/logo.jpg` by `scripts/logo_cutout.py`), `site/img/logo-square.png`, the `nav .logo` and `footer .footer-*` rules in `site/css/shared.css` and in the home page's own styles | The menu on every page shows the wordmark alone, lettering white, 48px tall on a desktop (40px on a phone); the bar is no taller for it. The footer shows both logos: the SA mark on its white tile, then the wordmark. The logo file itself is the wordmark small in the middle of a white square, which is why it is not shown directly: at the menu's height the name came out about 8px tall. If `logo.jpg` is replaced, run `python3 scripts/logo_cutout.py` (it needs Pillow and numpy), then `node scripts/brand_images.cjs`, and update the `?v=` on every tag. The host keeps pictures and stylesheets for a year, so the wordmark's tags and the `shared.css` link carry `?v=` and the first eight characters of the file's SHA-1; `tests/pages_test.sh` fails until they match, and `tests/logo_browser.cjs` measures the logos in a browser. |
| How the site appears in search and AI answers | `site/favicon*`, `site/img/logo-square.png`, `site/img/social-card.png`, the head tags and JSON-LD on each page, `site/sitemap.xml`, `site/robots.txt`, `site/llms.txt` | The favicon and square logo are the SA mark (`site/img/sa-mark.png`). The canonical address is `https://spataccoanalytics.com` without `www`. Search engines decide what they show and can take weeks to pick up a change. A page's title says what the page sells or does, never just its menu name. A page that is delisted or private carries `noindex` and stays out of the sitemap; `tests/pages_test.sh` holds both. |
| How big the pages are drawn | `scripts/scale_css.py`, the `html.sa-scale` rule in `site/css/shared.css` (and on the home page and the scorer, which do not use it), `tests/scale_browser.cjs` | Every size on the main pages, the scorer and the Insights pages is in rem, and a page marked `class="sa-scale"` grows with the window: unchanged up to 1255px wide, then in step, so a 1920px screen at 100% shows what the owner's 150% did. On a phone no text is under 13px. The script rewrites px as rem and `--check` fails on one. Each tool's own page is not converted yet and is drawn as before. |
| Versions on shared stylesheets and scripts | `scripts/asset_versions.py` | Writes `?v=` and the first eight characters of each file's SHA-1 into every tag for `shared.css`, `cite.css`, `insights.css`, `ticker.css` and `ticker.js`. Run it after changing one: the host keeps each for a year under its address. |
| Telling Bing what changed | `scripts/indexnow.py`, the "Tell Bing what changed" step in `.github/workflows/publish.yml`, the 32-character `.txt` key file in `site/` | After a merge publishes, the pages that merge changed are sent to IndexNow, which Bing and the engines that share it read at once. Only pages the sitemap lists are sent. The key file is public by design: the search engine reads it from the site. Google does not take part and reads the sitemap. The step can never fail a publish. |
| The share picture and the profile pictures | `site/img/social-card.png`, `brand/profile/`, drawn by `scripts/brand_images.cjs` from `brand/wordmark-on-dark-large.png` | All lead with the wordmark (they led with the SA mark until 2026-11-26). `social-card.png` (1200 by 630) is the picture a link to the site shows on LinkedIn, in a text message or in Slack; every page names it with `?v=` and the first eight characters of its SHA-1, and `tests/pages_test.sh` fails until they match. `brand/profile/` is for the owner to upload and is not served by the site: `linkedin-cover-2256x382.png` (the banner across a LinkedIn page), `google-cover-1200x900.png` (a Google Business Profile's cover), and two squares for a profile picture, `wordmark-square-800.png` and the SA mark `google-logo-720.png`. A profile picture is shown small, where the SA mark reads and the wordmark does not, so the SA mark is the one to use there unless the owner says otherwise. After the share picture changes, LinkedIn keeps its old copy until the page is run through its Post Inspector. |
| Redirects and page freshness | `site/.htaccess` | Marks every page `private, no-cache` so the host's page cache never serves an old copy after a publish. Sends `www` to the bare domain, and the earlier site's PHP pages (still on the host, not in this repo) to the pages that replaced them. |
| QR code for the menu | `menu/qr-score.svg`, `menu/qr-score.png` | Encodes `https://spataccoanalytics.com/score/`. Regenerate only if that address changes. |
| Service menu (one page, print and PDF) | Claude Design canvas "Service Menu" | Not in this repo: it is edited on the canvas. Its QR code and its link both go to `/score/`. |
| Scoring relay (`ria-scorer` Cloudflare Worker) | `worker/ria-scorer.js` | Holds the API key. Passes on only the five requests the scorer and the resume parser make (a website score, a LinkedIn score, a firm's name looked up for its website, an answer rewritten in its shape, a resume read), counts each visitor per day and caps the day. Cloudflare runs what was last pasted into its editor: deploy steps are in `worker/README.md`. |
| Contact form | `site/contact/index.html`, `site/contact/submit.php` | Keeps every message in `sa-leads/contact.jsonl` and mails a notice, with the same checks as the scorer's gate. The form thanks the visitor only when the message was kept. A link with `?about=crm`, `league` or `golf` (the Built to Order cards on the tools page) names the build asked about. |
| NFL tools | Source platform's repository, built here by `live/` | Read-only. See below. |
| Plan and decisions | Roadmap and Business Plan docs, Notion Session Log | Reference, not source. Where they disagree with this repo, this repo is what is live. |

How a visitor moves: printed menu (QR) or PDF menu (link) > `/score/` >
scorer, website-only > overall score > name and email > full breakdown and
PDF > `/services/`. The lead is recorded when the email is given. On
`/services/` a visitor builds a plan and may see any one project price free;
a second price opens the pricing form with both ticked, and a name and email
bring every project price onto the page. Someone who has given an email on
either page is not asked again on the other for 30 days.

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
| `BANK_PASSWORD` | What the owner types to open the stat bank at `/bank/`. At least 10 characters. Without it the bank is closed to everyone |
| `BANK_TOKEN` | A long random string (24 characters or more) the weekly routine sends to read the bank. The same value is saved once on the cloud environment as the credential for `spataccoanalytics.com`, header `X-Bank-Token` |
| `EIA_API_KEY` | A free key from the U.S. Energy Information Administration (eia.gov/opendata/register.php), for the market strip's oil and gasoline prices. Letters and digits only. Without it the strip shows its other four figures |

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
bash tests/contact_test.sh                                  # the contact form keeps real messages and nothing else
bash tests/notice_test.sh                                   # the notice mail goes out as the firm, and a visitor cannot add to it
bash tests/bank_test.sh                                     # the stat bank is private, and keeps only pictures, PDFs and text
bash tests/card_test.sh                                     # a statistic card is drawn only for a number with a source
bash tests/pricing_test.sh                                  # one price free per browser, the rest only to a visitor who left an email
node tests/worker_test.mjs                                  # the relay passes on the tools' own requests and nothing else
bash tests/insights_test.sh                                 # posts build into pages, sourced and escaped
npm install --prefix live && \
  node live/build.mjs --source <source checkout> --out build/live && \
  node live/smoke.mjs --live build/live                     # the working tools, built and opened
```

CI runs the first eight on every push, and the last when it has the source token.
