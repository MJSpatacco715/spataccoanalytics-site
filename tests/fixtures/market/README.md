# Saved answers for tests/market_test.sh

What each source of the market strip (`site/lib/market.php`) really sent on
November 25, 2026, cut down to the last few days:

- `treasury.xml`: the U.S. Treasury's daily par yield curve feed, three days.
- `ecb.xml`: the European Central Bank's reference rates, three days.
- `coingecko.json`: CoinGecko's simple price for bitcoin.
- `eia_spot.json`, `eia_gas.json`: the Energy Information Administration's
  spot prices for Brent and WTI and its weekly regular gasoline price.

`treasury-december.xml` is made up from the same feed: one day, December 1,
for the first business day of a month, when the day before is in last
month's feed.

No key is in any of them.
