# spataccoanalytics-site

The source of spataccoanalytics.com's main pages, and the pipeline that keeps
the live NFL tools on [/tools/](https://spataccoanalytics.com/tools/) current.

## What it does

```
 source platform (private repo + live site)        this repo                         spataccoanalytics.com
 ──────────────────────────────────────────        ─────────                         ─────────────────────
 data files, git history  ── read-only token ──►   Publish workflow                  /tools/  (Sports Desk:
 public Lines / Injuries pages ── signed out ──►     1. live numbers and dates         three NFL cards on top)
                                                    2. screenshots                    /tools/football/<tool>.html
                                                    3. build site/ + generated  ──►   (one page per tool)
                                                    4. deploy over SSH
```

- **Nothing is written to the source platform.** Its repository is read with a
  read-only token. Its depth chart page is rendered here from its own code and
  data. Its public pages are loaded signed out.
- **Free.** No AI runs on a schedule. The repository is public, so GitHub
  Actions minutes cost nothing.
- **As current as the source.** Publish runs hourly, and every 15 minutes
  through Sunday afternoons and evenings and the Monday and Thursday night games.
- **Safe to deploy.** It writes only the files this repo manages. It backs up
  anything it replaces, and never touches `saratoga/` or other directories
  listed in `config/hosting.json`.

## Layout

| Path | What it is |
|---|---|
| `site/` | The main site's files, imported from the host (see setup step 3). This is where the site is edited from now on. |
| `showcase/tools.json` | Each NFL tool's copy: name, tagline, summary, highlights, stack. Metrics with a `key` are filled with live numbers at build time. |
| `showcase/img/` | Baseline screenshots, used when a fresh capture fails. |
| `site-edits.json` | The approved copy edits and the card markers on `tools/index.html`. They are applied at build time and are safe to re-run. |
| `scripts/build_site.py` | Builds `dist/`: site files, edits, NFL cards, tool pages, images. |
| `scripts/source_metrics.py` | Live numbers and "last improved" / "data as of" dates from the source repo. |
| `capture/` | Screenshot script and the local stand-in API used to render the depth chart page. |
| `scripts/remote_deploy.sh` | Runs on the host during a deploy. It only writes the paths it is given, with backups. |
| `reference/live/` | A read-only copy of the live pages (fetched by Site probe), used by CI and for previews before the import. |

## Setup (once)

1. **Make the repository public.** Settings > General > Danger Zone > Change
   visibility. This is what makes the scheduled runs free.
2. **Add the secrets** (Settings > Secrets and variables > Actions):

   | Secret | Value |
   |---|---|
   | `DEPLOY_SSH_KEY` | Same private key the Saratoga dashboard deploys with (SiteGround Site Tools > Devs > SSH Keys Manager) |
   | `DEPLOY_SSH_PASSPHRASE` | That key's passphrase |
   | `DEPLOY_SSH_HOST` | The SSH host for the spataccoanalytics.com account |
   | `DEPLOY_SSH_USER` | The SSH username for that account |
   | `SOURCE_REPO` | `owner/name` of the source platform's repository |
   | `SOURCE_REPO_TOKEN` | Fine-grained token: that one repository, Contents read-only |
   | `SOURCE_SITE_URL` | The source platform's public address, ending in `/` |
   | `COPY_DENYLIST` | Comma-separated regular expressions for private names that must never appear in public copy or screenshots |

3. **Import the live site.** Actions > Import live site > Run workflow. It
   copies the main site's pages, styles, scripts and images into `site/`,
   scans them for credentials, and opens a pull request. It does not change
   the live site. Merge that pull request.
4. **Publish.** The next scheduled run deploys. You can also start one by hand:
   Actions > Publish > Run workflow.

Until steps 2 and 3 are done, Publish skips itself with a notice. It does not fail.

## Changing things

- **Site copy or layout:** edit the files in `site/` and merge to `main`.
  Publish deploys it. A file changed on the host by hand is overwritten on
  the next run, and the replaced copy is kept in the host's backups.
- **A tool's copy:** edit `showcase/tools.json`.
- **Adding a tool:** add an entry to `showcase/tools.json`, a capture in
  `capture/capture.mjs`, and its paths in `scripts/source_metrics.py`.

## Checks

```
python3 scripts/validate_showcase.py                        # schema + house rules (no em dashes, no denylisted names)
python3 scripts/build_site.py --site reference/live --out dist && \
  python3 scripts/validate_showcase.py --html dist/tools/football
bash tests/remote_deploy_test.sh                            # the deploy never leaves its lane
```

CI runs all three on every push.
