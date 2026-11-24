# Insights posts

One JSON file per post, named `YYYY-MM-DD-slug.json`. The format, the block
types and the categories are described at the top of
`scripts/build_insights.py`. A post with `"draft": true` is not published.

Merging a post to `main` publishes it. To get the words for LinkedIn:

```
python3 scripts/build_insights.py --linkedin SLUG
```

There are no posts yet. Until the first one is merged, the site has no
Insights section and the homepage shows no teaser.
