# The scoring relay

`ria-scorer.js` is the Cloudflare Worker behind the Website Scorer and the
Resume Parser. This file is the source. Cloudflare runs whatever was last
pasted into the Worker's editor, so after any change here it has to be
deployed again by hand.

## Deploy

1. Cloudflare > Workers & Pages > `ria-scorer` > Edit code.
2. Replace everything in the editor with the contents of `ria-scorer.js`.
3. Deploy.

## Turn on the counting (once)

Without this the request rules apply but no one is counted.

1. Cloudflare > Storage & Databases > KV > Create a namespace named
   `ria-scorer-limits`.
2. Workers & Pages > `ria-scorer` > Settings > Bindings > Add > KV namespace.
   Variable name `LIMITS`, namespace `ria-scorer-limits`. Deploy.

## Settings

Workers & Pages > `ria-scorer` > Settings > Variables and Secrets.

| Name | What it does | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Secret. The key for the reading service. | required |
| `SCORES_PER_DAY` | Per visitor: website scores, and LinkedIn scores, each. | 8 |
| `LOOKUPS_PER_DAY` | Per visitor: a firm's name looked up for its website (the scorer's "Is this the right one?"). | 8 |
| `RESUMES_PER_DAY` | Per visitor: resume reads. | 4 |
| `DAILY_TOTAL` | All visitors together, every kind. | 150 |
| `TRUSTED_IPS` | Comma-separated addresses that are not held to the per-visitor allowance. | none |

A visitor is a network address. Everyone on one office or conference
network shares an allowance, which is why the defaults are generous.

## What it refuses

Anything that is not one of the five requests the site's tools make (a
website score, a LinkedIn score, a firm's name looked up for its website, an
answer rewritten in its shape, a resume read): another
reader, other instructions, a system instruction, other tools, more output
than a tool needs, a request from a page on another site. `tests/worker_test.mjs`
checks this against the requests the pages in `site/` send today, so a change
to a tool's instructions that the relay would refuse fails CI.

The instructions are recognised by how they begin. Someone determined can
still start a request the same way and add their own words. The allowances
and the daily ceiling are what bound that, together with a spend limit on
the key itself.
