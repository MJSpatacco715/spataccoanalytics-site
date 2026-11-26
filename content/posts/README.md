# Insights posts

One JSON file per post, named `YYYY-MM-DD-slug.json`. The format, the block
types and the categories are described at the top of
`scripts/build_insights.py`. A post with `"draft": true` is not published.

Merging a post to `main` publishes it. To get the words for LinkedIn:

```
python3 scripts/build_insights.py --linkedin SLUG
```

The section went live with its first post on 2026-11-25. A post in the
`practice` category also puts a teaser on the homepage; the other categories
do not. Every page's last line links to the section.
