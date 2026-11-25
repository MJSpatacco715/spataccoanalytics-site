# Saved answers for tests/market_test.sh

What each source of the market strip (`site/lib/market.php`) really sent on
November 25, 2026, with its history, cut down to the fields the strip reads:

- `treasury.xml`: the U.S. Treasury's daily par yield curve feed for
  November, sixteen days. `treasury-october.xml` is October's, twenty-one
  days: the strip asks for last month until it holds enough days for a chart.
- `ecb.xml`: the European Central Bank's reference rates, sixty-three
  business days, ending November 24 (the tests are set on the morning of the
  25th, before that day's rate).
- `coingecko.json`: CoinGecko's simple price for bitcoin.
  `coingecko_days.json`: its price a day for sixty days.
- `eia_spot.json`, `eia_gas.json`: the Energy Information Administration's
  spot prices for Brent and WTI (fifty trading days, through November 17, the
  last day it had released) and its weekly regular gasoline price (thirty
  weeks). Built from the figures on its public history pages, in the shape
  its data feed answers in.

`treasury-december.xml` is made up from the same feed: one day, December 1,
for the first business day of a month, when the day before is in last
month's feed.

No key is in any of them.
