# The stat bank and the weekly statistic

The owner collects things worth posting: a number, a study, a chart, a quote.
Once a week one of them becomes a short sourced post on the site and a branded
picture for LinkedIn. This page is the whole routine. Follow it in order.

## The pieces

| Piece | Where | What it is |
|---|---|---|
| The bank | `https://spataccoanalytics.com/bank/` (`site/bank/`, `site/lib/bank.php`) | The owner's private page: paste, drop or upload. Items, files and sign-ins are kept beside the web root in `sa-bank/`, never in this repository. |
| Email drop-off | The owner's own mailbox | Anything he sends himself with a subject that starts `STAT`. The routine files these into the bank. |
| The card | `scripts/stat_card.cjs`, fonts in `brand/fonts/` | One statistic as a picture in the site's colours and fonts, square and portrait. |
| The post | `content/posts/YYYY-MM-DD-slug.json` | The same statistic on the site, with its source card. Format at the top of `scripts/build_insights.py`. |

Access to the bank: the owner signs in with a password; a session reads it
with a token that the environment adds to every request to the site as the
`X-Bank-Token` header. Both live in repository secrets (`BANK_PASSWORD`,
`BANK_TOKEN`) and on the host. Never print, log, commit or ask for either.

```bash
curl -s 'https://spataccoanalytics.com/bank/api.php?a=list'
```

If that answers 401, the token is not set on this environment: stop and tell
the owner (he saves it once through the credential form for the host
`spataccoanalytics.com`, header `X-Bank-Token`). If it answers 503, the bank
is not set up on the host (`BANK_PASSWORD` is not in the repository's secrets).

## Rules that do not bend

- **Nothing goes public until the owner says so.** Not the post, not the
  picture, not a LinkedIn update. Prepare, show him, wait for "post".
- **Every number is traced to its original publisher.** A screenshot, a news
  story or a social post is a lead, not a source. Find who measured it, when,
  on whom, and link to it. Search the web to do this; do not rely on memory.
  If the original cannot be found, or the number in the item does not match
  the source, mark the item `needs_source` with a note saying what is missing
  and take the next item. Never round, sharpen or restate a finding beyond
  what the source says, and never make one up.
- **The bank is private.** Items, files and the owner's notes stay out of this
  repository, commits and pull requests. Only the finished post and card go in.
- No em dashes. Times to the owner in Eastern.

## The weekly run (Monday evening, for Tuesday morning)

1. **File the email drop-offs.** Search the owner's mailbox for messages whose
   subject starts `STAT`. For each one not yet in the bank, add it:

   ```bash
   curl -s -X POST 'https://spataccoanalytics.com/bank/api.php?a=add' \
     -H 'Content-Type: application/json' \
     --data-binary '{"text":"<subject and body, links kept>","by":"email","ref":"<the message id>"}'
   ```

   The `ref` makes a second filing of the same email a no-op. An attachment
   the mail connector cannot hand over is named in the text ("has a picture:
   open the email"), and read from the mailbox when the item is worked.
2. **Read the bank**: `?a=list`. Items come newest first.
3. **Pick the item.** In this order: the one marked `next`; else the oldest
   `checked`; else the oldest `new`. Skip `skipped`, `posted`, `scheduled`
   and `needs_source`. If nothing is left, tell the owner the bank is empty,
   offer two or three sourced candidates on his topics (advisor transitions,
   markets, why data matters), and stop.
4. **Read it.** An uploaded picture or PDF: `?a=file&id=<file id>`, saved to
   the scratchpad, never to the repository.
5. **Trace it** (see the rules). Record what was found on the item:

   ```bash
   curl -s -X POST 'https://spataccoanalytics.com/bank/api.php?a=update' \
     -H 'Content-Type: application/json' \
     --data-binary '{"id":"<id>","status":"checked","found":{"value":"35%","label":"of advisors plan to retire within 10 years","source":{"name":"Cerulli","year":"2026","finding":"<the finding in the source'"'"'s terms>","sample":"<who was measured>","url":"https://..."},"note":"<anything the owner should know>"}}'
   ```

6. **Write the post** as `content/posts/<Tuesday's date>-<slug>.json`:
   a title, a two-sentence summary, one `stat` block with the full source,
   one or two short paragraphs on why it matters to an advisory firm, and a
   closing `link` block. Category: `practice` for advisor topics (these show
   on the homepage), `markets` or `business` otherwise. Set
   `"card": "/img/insights/<slug>.png"` and `"linkedin"` to the words for
   LinkedIn: two or three plain sentences, the number with its source and
   year, no hashtag wall, ending with the post's address.
7. **Draw the cards.**

   ```bash
   node scripts/stat_card.cjs --post content/posts/<file>.json --size square --scale 1 --out site/img/insights/<slug>
   mv site/img/insights/<slug>-square.png site/img/insights/<slug>.png
   node scripts/stat_card.cjs --post content/posts/<file>.json --out <scratchpad>/<slug>
   ```

   The first is the site's copy. The second pair (square and portrait, double
   size) is for LinkedIn and is sent to the owner, not committed. Look at
   every picture before sending it. The house style is `navy` unless the
   owner has chosen another.
8. **Check and open the pull request.** Run the checks in `CLAUDE.md`, push
   the branch, open the pull request as a draft. Do not merge.
9. **Mark the item** `scheduled` with `post` (the slug) and `scheduled_for`
   (Tuesday's date), and clear `next`.
10. **Show the owner**: both LinkedIn pictures, the LinkedIn words, the source
    with its link, and one line on what the post says. Then wait.
11. **When he says "post"**: mark the pull request ready, merge it once CI
    passes, confirm the post is live at `/insights/<slug>/`, set the item to
    `posted` with `posted_on`, and give him the words and pictures again with
    the live address so he can post or schedule it on LinkedIn for Tuesday
    8:40 AM Eastern. If he asks for changes, make them and show him again.
    If he says "skip", close the pull request, set the item to `skipped`.

An item the owner marks "Post this next" outside the weekly slot is handled
the same way whenever he asks.

## Once a quarter: the RIA deal count on the market strip

The market strip on the tools page carries the year's RIA deal count against the
record. The count is DeVoe & Company's, from its RIA Deal Book, which comes
out about a month after each quarter ends (late January, April, July and
October). The strip is the one place the count shows: the homepage's stat
row gave its place to a figure on advisors' data in November 2026.

When the weekly run falls after a new Deal Book is out:

1. Read the count in DeVoe's own book or in two independent reports of it
   (InvestmentNews and WealthManagement both cover each one). The number has
   to agree. A preliminary count published before the quarter closes is not
   the count.
2. Change `MARKET_DEALS` in `site/lib/market.php`: `count`, `through` (the
   last day the count covers), `pace` (DeVoe's own words on how the year
   compares, or empty), `book` and `url`. In January the full-year count goes
   in with `through` set to December 31; if it is a new record, `record`,
   `record_year` and `record_quarters` change with it.
3. The card draws the year beside the record year, so bring these up to date
   in the same place: `quarters` (the year so far, a number a quarter, which
   must add up to `count`), `record_quarters` (the record year's four
   quarters, which must add up to `record`; they change only when a year sets
   a new record) and `notes` (one or two plain sentences of what else the
   book says, each a fact in the book with its number). The check fails when
   the quarters do not add up. With three quarters in, the card works out by
   itself what the fourth needs and what a repeat of the record year's fourth
   would do.
4. Change the expected figures in `tests/market_test.sh` and
   `tests/ticker_browser.cjs`, run the checks, and open the pull request.
   This one needs no approval to merge: it is a number from an agreed source.

If it is not brought up to date the count leaves the strip by itself, 150 days
after the last day it covers.
