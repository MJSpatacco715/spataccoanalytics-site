# spataccoanalytics-site

The source of spataccoanalytics.com's main pages, and the pipeline that keeps
the live NFL tools on [/tools/](https://spataccoanalytics.com/tools/) current.

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
| `site-edits.json` | The approved copy edits and the card markers on `tools/index.html`. They are applied at build time and are safe to re-run. |
| `scripts/build_site.py` | Builds `dist/`: site files, edits, NFL cards, tool pages, images. |
| `scripts/source_metrics.py` | Live numbers and "last improved" / "data as of" dates from the source repo. |
| `capture/` | Screenshot script and the local stand-in API used to render the depth chart page. |
| `scripts/remote_deploy.sh` | Runs on the host during a deploy. It only writes the paths it is given, with backups. |
| `reference/live/` | A read-only copy of the live pages (fetched by Site probe), used by CI and for previews before the import. |

## Setup (once)

The repository is public, which is what makes the scheduled runs free.

1. **Add four secrets** (Settings > Secrets and variables > Actions). GitHub
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
npm install --prefix live && \
  node live/build.mjs --source <source checkout> --out build/live && \
  node live/smoke.mjs --live build/live                     # the working tools, built and opened
```

CI runs the first four on every push, and the last when it has the source token.
