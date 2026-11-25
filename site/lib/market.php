<?php
/*
 * The market strip's figures (market/feed.php, js/ticker.js).
 *
 * Eight figures, each from the body that publishes it, each free to show:
 *   RIA deals announced this year              DeVoe & Company (typed in, quarterly)
 *   U.S. 30-year and 10-year Treasury yields   U.S. Department of the Treasury
 *   The U.S. dollar in euros (USD/EUR)         European Central Bank (its euro rate, turned round)
 *   Bitcoin                                    CoinGecko (asks for a credit)
 *   Brent, WTI, U.S. regular gasoline          U.S. Energy Information Administration
 * The S&P 500, the Dow and gold are licensed data and are not here.
 *
 * A source is asked only when its last answer is older than its own interval,
 * and one visitor at a time does the asking. Everyone else is given what is
 * already held, so a slow or silent source never holds up a page. What a
 * source last said is kept one level above the web root in sa-market/, and a
 * figure is dropped, not shown stale, once it is older than it should be.
 *
 * The Energy Information Administration takes fifteen to twenty seconds to
 * answer a question it has not been asked lately (measured), and half a
 * second after that. Nobody waits for it: a source marked slow is asked only
 * after the visitor has been answered (market_after), with time to finish.
 *
 * The energy figures need a free key from the Energy Information
 * Administration. It is not in this repository: Publish writes it beside the
 * web root as sa-market.json from the EIA_API_KEY secret. Without it the
 * strip shows the other four.
 *
 * Each figure also carries its recent history, from the same feed that gives
 * the figure, for the chart on its card: about two months of days (half a
 * year of weeks for gasoline). The days a source sends are added to the days
 * already held, so a feed that carries only this month still builds a longer
 * line. Two requests exist only for history: last month's Treasury feed,
 * asked for until enough days are held, and CoinGecko's day-by-day prices,
 * asked for a few times a day.
 *
 * Brent and WTI are prices the Energy Information Administration buys from
 * Refinitiv and republishes with permission. The owner was told and chose to
 * keep them (CLAUDE.md).
 *
 * Every figure goes out with the words for its source card, and the feed
 * names each publisher once for the strip's own "about" card, so the page
 * prints text only and nothing a source sends is ever treated as markup.
 *
 * Opened directly, this file does nothing: it only defines functions.
 */
declare(strict_types=1);

const MARKET_TIMEOUT = 5;            // seconds one source may take, unless it says otherwise
const MARKET_BUDGET = 14;            // seconds a visitor's request may spend asking
const MARKET_BUDGET_SLOW = 110;      // seconds the asking after the answer may take
const MARKET_RETRY = 300;            // a source that failed is left alone this long, unless it says otherwise
const MARKET_MAX_BYTES = 3145728;    // the most one answer may be
const MARKET_AGENT = 'spataccoanalytics.com market strip';

// how often each source is asked, and what its card says about it
const MARKET_SOURCES = [
    'treasury' => [
        'ttl' => 1800,
        'short' => 'Treasury',
        'publisher' => 'U.S. Department of the Treasury',
        'home' => 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve',
        'name' => 'U.S. Department of the Treasury, Daily Treasury Par Yield Curve Rates',
        'url' => 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve',
    ],
    'ecb' => [
        'ttl' => 1800,
        'short' => 'ECB',
        'publisher' => 'European Central Bank',
        'home' => 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
        'name' => 'European Central Bank, euro foreign exchange reference rates',
        'url' => 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-usd.en.html',
    ],
    'coingecko' => [
        'ttl' => 300,
        'short' => 'CoinGecko',
        'publisher' => 'CoinGecko',
        'home' => 'https://www.coingecko.com/en/coins/bitcoin',
        'name' => 'CoinGecko',
        'url' => 'https://www.coingecko.com/en/coins/bitcoin',
    ],
    // bitcoin day by day, for the chart on its card: asked a few times a day
    'coingecko_days' => [
        'ttl' => 21600,
        'short' => 'CoinGecko',
        'publisher' => 'CoinGecko',
        'home' => 'https://www.coingecko.com/en/coins/bitcoin',
        'name' => 'CoinGecko',
        'url' => 'https://www.coingecko.com/en/coins/bitcoin',
    ],
    'eia_spot' => [
        'ttl' => 3600,
        'slow' => true,             // asked after the visitor has been answered
        'timeout' => 50,
        'retry' => 900,
        'short' => 'EIA',
        'publisher' => 'U.S. Energy Information Administration',
        'home' => 'https://www.eia.gov/petroleum/',
        'name' => 'U.S. Energy Information Administration, spot prices for crude oil',
        'url' => 'https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm',
    ],
    'eia_gas' => [
        'ttl' => 3600,
        'slow' => true,
        'timeout' => 50,
        'retry' => 900,
        'short' => 'EIA',
        'publisher' => 'U.S. Energy Information Administration',
        'home' => 'https://www.eia.gov/petroleum/',
        'name' => 'U.S. Energy Information Administration, Gasoline and Diesel Fuel Update',
        'url' => 'https://www.eia.gov/petroleum/gasdiesel/',
    ],
];

// the figures, in the order they scroll. fresh is how old (in days) a figure
// may be and still be shown; lo and hi are the range a real value sits in.
const MARKET_ITEMS = [
    'ust30' => ['src' => 'treasury', 'label' => 'US 30-Yr', 'name' => 'U.S. 30-year Treasury yield', 'unit' => 'pct', 'fresh' => 10, 'lo' => 0.01, 'hi' => 25,
        'span' => 45, 'what' => 'Daily par yield curve rate, set each business day.'],
    'ust10' => ['src' => 'treasury', 'label' => 'US 10-Yr', 'name' => 'U.S. 10-year Treasury yield', 'unit' => 'pct', 'fresh' => 10, 'lo' => 0.01, 'hi' => 25,
        'span' => 45, 'what' => 'Daily par yield curve rate, set each business day.'],
    // The ECB publishes U.S. dollars to one euro, and that is what is kept
    // (lo and hi are its range). The strip shows it turned round, what one
    // dollar buys in euros, because the owner asked for the dollar first and
    // for it to be plain which of the two is worth more.
    'eurusd' => ['src' => 'ecb', 'label' => 'USD/EUR', 'name' => 'U.S. dollar in euros', 'unit' => 'eur4', 'turned' => true, 'fresh' => 10, 'lo' => 0.3, 'hi' => 3,
        'span' => 45, 'what' => 'Worked out from the European Central Bank\'s euro reference rate, set once each business day.'],
    'btc' => ['src' => 'coingecko', 'label' => 'Bitcoin', 'name' => 'Bitcoin', 'unit' => 'usd0', 'fresh' => 0.25, 'lo' => 1, 'hi' => 100000000,
        'span' => 61, 'days' => 'coingecko_days', 'what' => 'Price in U.S. dollars: one point a day, then the latest. Data provided by CoinGecko.'],
    'brent' => ['src' => 'eia_spot', 'label' => 'Brent', 'name' => 'Brent crude oil', 'unit' => 'usd2', 'fresh' => 21, 'lo' => 1, 'hi' => 1000,
        'span' => 45, 'what' => 'Europe Brent spot price, in dollars a barrel. The daily prices are released once a week, usually on Wednesday.'],
    'wti' => ['src' => 'eia_spot', 'label' => 'WTI', 'name' => 'WTI crude oil', 'unit' => 'usd2', 'fresh' => 21, 'lo' => 1, 'hi' => 1000,
        'span' => 45, 'what' => 'West Texas Intermediate spot price at Cushing, Oklahoma, in dollars a barrel. The daily prices are released once a week, usually on Wednesday.'],
    'gas' => ['src' => 'eia_gas', 'label' => 'US Regular Gas', 'name' => 'U.S. regular gasoline', 'unit' => 'usd3', 'fresh' => 21, 'lo' => 0.2, 'hi' => 50,
        'span' => 26, 'what' => 'U.S. average retail price of regular gasoline, all formulations, in dollars a gallon. One survey a week.'],
];

// The RIA deal count comes out once a quarter, in DeVoe & Company's RIA Deal
// Book, so it is typed in here when a new book is published
// (docs/stat-bank.md). Left alone, it drops off the strip by itself:
// MARKET_DEALS_FRESH days after the last day it covers.
const MARKET_DEALS = [
    'year' => 2026,
    'count' => 244,                 // announced RIA transactions, January through 'through'
    'through' => '2026-09-30',
    'quarters' => [93, 74, 77],     // the same count quarter by quarter: they add up to 'count'
    'pace' => 'slightly ahead of the pace of 2025',
    'record' => 322,
    'record_year' => 2025,
    'record_quarters' => [75, 73, 93, 81],   // the record year quarter by quarter: they add up to 'record'
    // what else the Deal Book says, a plain sentence each: a short list on the card
    'notes' => [
        'Q3 fell 17% from a year earlier, ending a run of seven record quarters.',
        'Consolidators made 129 of the 244 deals (53%), their largest share since 2021.',
    ],
    'book' => 'DeVoe & Company RIA Deal Book, third quarter 2026',
    'url' => 'https://www.devoeandcompany.com/deal-books/devoe-ria-deal-book-tm---q3-2026',
    'publisher' => 'DeVoe & Company',
    'home' => 'https://www.devoeandcompany.com/ria-ma-deal-books',
];
const MARKET_DEALS_FRESH = 150;

// history for the charts on the cards: how many days of a figure are kept,
// how many are enough to stop asking Treasury for last month, and the fewest
// a chart is drawn from
const MARKET_DAYS_KEEP = 70;
const MARKET_DAYS_ENOUGH = 30;
const MARKET_DAYS_CHART = 5;

const MARKET_EIA_SERIES = ['RBRTE' => 'brent', 'RWTC' => 'wti', 'EMM_EPMR_PTE_NUS_DPG' => 'gas'];

// Answer the visitor and let him go, without ending the request: what is
// slow to fetch is fetched after this.
function market_send(int $code, array $body, int $keep = 0): void
{
    $json = (string)json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: ' . ($keep > 0 ? 'public, max-age=' . $keep : 'no-store'));
    header('Content-Length: ' . strlen($json));
    echo $json;
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        while (ob_get_level() > 0) {
            ob_end_flush();
        }
        flush();
    }
}

function market_out(int $code, array $body, int $keep = 0): void
{
    market_send($code, $body, $keep);
    exit;
}

function market_home(): string
{
    return dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__));
}

// The time, which a test may set.
function market_now(): int
{
    $t = getenv('SA_MARKET_NOW');
    return is_string($t) && ctype_digit($t) ? (int)$t : time();
}

// Where the last answers are kept, or '' when the folder cannot be made.
function market_dir(): string
{
    $dir = market_home() . '/sa-market';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        return '';
    }
    return $dir;
}

// The energy key, or '' when there is none.
function market_eia_key(): string
{
    $raw = @file_get_contents(market_home() . '/sa-market.json');
    $s = is_string($raw) ? json_decode($raw, true) : null;
    $k = is_array($s) && is_string($s['eia_key'] ?? null) ? $s['eia_key'] : '';
    return preg_match('/^[A-Za-z0-9]{20,80}$/', $k) ? $k : '';
}

// ---------------------------------------------------------------- reading

// A number a source sent, or null when it is not one inside the figure's range.
function market_num($v, string $id): ?float
{
    if (is_string($v)) {
        $v = trim($v);
    }
    if (!is_numeric($v)) {
        return null;
    }
    $f = (float)$v;
    $spec = MARKET_ITEMS[$id];
    return is_finite($f) && $f >= $spec['lo'] && $f <= $spec['hi'] ? $f : null;
}

function market_is_day($d): bool
{
    if (!is_string($d) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m)) {
        return false;
    }
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

// From day => value, the latest two as one figure.
function market_latest(array $byDay): ?array
{
    if ($byDay === []) {
        return null;
    }
    krsort($byDay, SORT_STRING);
    $days = array_keys($byDay);
    $out = ['value' => $byDay[$days[0]], 'as_of' => $days[0]];
    if (isset($days[1])) {
        $out['prev'] = $byDay[$days[1]];
        $out['prev_as_of'] = $days[1];
    }
    return $out;
}

// A figure's history as day => value, oldest first: only real days and real
// values, and no more than are kept.
function market_days($byDay, string $id, int $keep = MARKET_DAYS_KEEP): array
{
    $out = [];
    foreach (is_array($byDay) ? $byDay : [] as $day => $v) {
        $n = market_num($v, $id);
        if ($n !== null && market_is_day((string)$day)) {
            $out[(string)$day] = $n;
        }
    }
    ksort($out, SORT_STRING);
    return count($out) > $keep ? array_slice($out, -$keep, null, true) : $out;
}

// Treasury's daily yield curve feed: day => [ust10, ust30].
function market_treasury_rows(string $xml): array
{
    $rows = [];
    foreach (explode('<entry', $xml) as $i => $entry) {
        if ($i === 0 || !preg_match('/<d:NEW_DATE[^>]*>(\d{4}-\d{2}-\d{2})T/', $entry, $d) || !market_is_day($d[1])) {
            continue;
        }
        foreach (['ust10' => 'BC_10YEAR', 'ust30' => 'BC_30YEAR'] as $id => $tag) {
            if (preg_match('/<d:' . $tag . '\b[^>]*>\s*([0-9.]+)\s*</', $entry, $v)) {
                $n = market_num($v[1], $id);
                if ($n !== null) {
                    $rows[$d[1]][$id] = $n;
                }
            }
        }
    }
    return $rows;
}

function market_treasury_items(array $rows): array
{
    $items = [];
    foreach (['ust30', 'ust10'] as $id) {
        $byDay = [];
        foreach ($rows as $day => $r) {
            if (isset($r[$id])) {
                $byDay[$day] = $r[$id];
            }
        }
        $one = market_latest($byDay);
        if ($one !== null) {
            $one['days'] = market_days($byDay, $id);
            $items[$id] = $one;
        }
    }
    return $items;
}

// The ECB's reference rates, ninety days of them: U.S. dollars to one euro.
function market_parse_ecb(string $xml): array
{
    $byDay = [];
    if (preg_match_all('/<Cube\s+time=["\'](\d{4}-\d{2}-\d{2})["\']\s*>(.*?)<\/Cube>/s', $xml, $m, PREG_SET_ORDER)) {
        foreach ($m as $day) {
            if (market_is_day($day[1]) && preg_match('/<Cube\s+currency=["\']USD["\']\s+rate=["\']([0-9.]+)["\']/', $day[2], $r)) {
                $n = market_num($r[1], 'eurusd');
                if ($n !== null) {
                    $byDay[$day[1]] = $n;
                }
            }
        }
    }
    $one = market_latest($byDay);
    if ($one === null) {
        return [];
    }
    $one['days'] = market_days($byDay, 'eurusd');
    return ['eurusd' => $one];
}

// CoinGecko's simple price: bitcoin in dollars, its change over a day, and when.
function market_parse_coingecko(string $json): array
{
    $d = json_decode($json, true);
    $b = is_array($d) && is_array($d['bitcoin'] ?? null) ? $d['bitcoin'] : null;
    if ($b === null) {
        return [];
    }
    $n = market_num($b['usd'] ?? null, 'btc');
    $at = $b['last_updated_at'] ?? null;
    if ($n === null || !is_int($at) || $at < 1000000000) {
        return [];
    }
    $one = ['value' => $n, 'as_of' => gmdate('Y-m-d\TH:i:s\Z', $at)];
    $chg = $b['usd_24h_change'] ?? null;
    if ((is_int($chg) || is_float($chg)) && is_finite((float)$chg) && abs((float)$chg) < 100) {
        $one['change_pct'] = round((float)$chg, 2);
    }
    return ['btc' => $one];
}

// CoinGecko's market chart: bitcoin in dollars, a price a day (at midnight
// UTC) for the last two months. Only the days: the price now is asked for
// apart, and far more often.
function market_parse_coingecko_days(string $json): array
{
    $d = json_decode($json, true);
    $byDay = [];
    foreach (is_array($d) && is_array($d['prices'] ?? null) ? $d['prices'] : [] as $p) {
        if (is_array($p) && isset($p[0], $p[1]) && is_numeric($p[0]) && $p[0] > 1000000000000) {
            $byDay[gmdate('Y-m-d', (int)($p[0] / 1000))] = $p[1];
        }
    }
    $days = market_days($byDay, 'btc');
    return count($days) < 2 ? [] : ['btc' => ['days' => $days]];
}

// The Energy Information Administration's answer: rows of period, series, value.
function market_parse_eia(string $json): array
{
    $d = json_decode($json, true);
    $rows = is_array($d) && is_array($d['response']['data'] ?? null) ? $d['response']['data'] : [];
    $by = [];
    foreach ($rows as $r) {
        if (!is_array($r)) {
            continue;
        }
        $id = MARKET_EIA_SERIES[(string)($r['series'] ?? '')] ?? '';
        $day = $r['period'] ?? null;
        if ($id === '' || !market_is_day($day)) {
            continue;
        }
        $n = market_num($r['value'] ?? null, $id);
        if ($n !== null) {
            $by[$id][$day] = $n;
        }
    }
    $items = [];
    foreach ($by as $id => $byDay) {
        $one = market_latest($byDay);
        if ($one !== null) {
            $one['days'] = market_days($byDay, $id);
            $items[$id] = $one;
        }
    }
    return $items;
}

// ---------------------------------------------------------------- asking

// Why the last request got nothing, in a few words with no address in them
// (an address can carry the key). Kept beside the answers so that Publish can
// say what the server sees.
function market_why(?string $set = null): string
{
    static $why = '';
    if ($set !== null) {
        $why = $set;
    }
    return $why;
}

// One page from a source, or null. A test points this at a folder of saved
// answers (SA_MARKET_FIXTURES) and nothing leaves the machine.
function market_get(string $file, string $url, int $timeout = MARKET_TIMEOUT): ?string
{
    market_why('');
    $fx = getenv('SA_MARKET_FIXTURES');
    if (is_string($fx) && $fx !== '') {
        @file_put_contents($fx . '/requests.log', $url . "\n", FILE_APPEND);
        $body = @file_get_contents($fx . '/' . $file);
        if (!is_string($body) || $body === '') {
            market_why('no answer');
            return null;
        }
        return $body;
    }
    if (!function_exists('curl_init') || strncmp($url, 'https://', 8) !== 0) {
        market_why('cannot ask');
        return null;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => min(6, $timeout),
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
        CURLOPT_MAXFILESIZE => MARKET_MAX_BYTES,
        CURLOPT_USERAGENT => MARKET_AGENT,
        CURLOPT_ENCODING => '',
        CURLOPT_HTTPHEADER => ['Accept: application/json, application/xml;q=0.9, */*;q=0.5'],
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $errno = curl_errno($ch);
    $took = round((float)curl_getinfo($ch, CURLINFO_TOTAL_TIME), 1);
    curl_close($ch);
    if (!is_string($body) || $code !== 200 || $body === '' || strlen($body) > MARKET_MAX_BYTES) {
        // the number and the time only: curl's own words can name the address
        market_why(($errno !== 0 ? 'curl error ' . $errno : 'HTTP ' . $code) . ' after ' . $took . 's');
        return null;
    }
    return $body;
}

function market_eia_url(string $route, string $frequency, array $series, int $rows, string $key): string
{
    $q = 'api_key=' . rawurlencode($key) . '&frequency=' . $frequency . '&data[0]=value';
    foreach ($series as $s) {
        $q .= '&facets[series][]=' . rawurlencode($s);
    }
    return 'https://api.eia.gov/v2/' . $route . '/data/?' . $q . '&sort[0][column]=period&sort[0][direction]=desc&length=' . $rows;
}

// Ask one source. The figures it gave, or [] when it gave none.
function market_fetch(string $source, int $now, string $eiaKey, array $held = []): array
{
    if ($source === 'treasury') {
        $ny = new DateTimeImmutable('@' . $now);
        $ny = $ny->setTimezone(new DateTimeZone('America/New_York'));
        $base = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=';
        $rows = market_treasury_rows((string)market_get('treasury.xml', $base . $ny->format('Ym')));
        // the first days of a month: the day before is in last month's feed.
        // And until enough days are held to draw a chart, last month's are
        // fetched too; after that this month's feed is all that is asked for.
        $have = is_array($held['items']['ust10']['days'] ?? null) ? $held['items']['ust10']['days'] : [];
        if (count($rows) < 2 || count($have + $rows) < MARKET_DAYS_ENOUGH) {
            $last = $ny->modify('first day of last month');
            $rows += market_treasury_rows((string)market_get('treasury-prev.xml', $base . $last->format('Ym')));
        }
        return market_treasury_items($rows);
    }
    if ($source === 'ecb') {
        return market_parse_ecb((string)market_get('ecb.xml', 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml'));
    }
    if ($source === 'coingecko') {
        return market_parse_coingecko((string)market_get('coingecko.json', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true'));
    }
    if ($source === 'coingecko_days') {
        return market_parse_coingecko_days((string)market_get('coingecko_days.json', 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=60&interval=daily'));
    }
    if ($source === 'eia_spot' && $eiaKey !== '') {
        // two series, newest first: a hundred rows is about fifty trading days of each
        $got = market_parse_eia((string)market_get('eia_spot.json', market_eia_url('petroleum/pri/spt', 'daily', ['RBRTE', 'RWTC'], 100, $eiaKey), MARKET_SOURCES[$source]['timeout']));
        return array_intersect_key($got, ['brent' => 1, 'wti' => 1]);
    }
    if ($source === 'eia_gas' && $eiaKey !== '') {
        $got = market_parse_eia((string)market_get('eia_gas.json', market_eia_url('petroleum/pri/gnd', 'weekly', ['EMM_EPMR_PTE_NUS_DPG'], 30, $eiaKey), MARKET_SOURCES[$source]['timeout']));
        return array_intersect_key($got, ['gas' => 1]);
    }
    return [];
}

// ---------------------------------------------------------------- keeping

function market_cache_read(string $dir): array
{
    $raw = @file_get_contents($dir . '/cache.json');
    $c = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($c) && is_array($c['sources'] ?? null) ? $c : ['sources' => []];
}

function market_cache_write(string $dir, array $cache): void
{
    $tmp = $dir . '/cache.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, json_encode($cache, JSON_UNESCAPED_SLASHES), LOCK_EX) !== false) {
        @chmod($tmp, 0600);
        if (!@rename($tmp, $dir . '/cache.json')) {
            @unlink($tmp);
        }
    }
}

// Put one source's answer into what is held, leaving the others as they are
// on disk now. Two requests may be asking different sources at once.
function market_cache_merge(string $dir, string $source, array $held): array
{
    $w = @fopen($dir . '/lock-write', 'c');
    if ($w !== false) {
        flock($w, LOCK_EX);
    }
    $cache = market_cache_read($dir);
    $cache['sources'][$source] = $held;
    market_cache_write($dir, $cache);
    if ($w !== false) {
        flock($w, LOCK_UN);
        fclose($w);
    }
    return $cache;
}

// The sources whose answers have run out and may be asked again: the quick
// ones, or the slow ones.
function market_due(array $cache, int $now, string $eiaKey, bool $slow = false): array
{
    $due = [];
    foreach (MARKET_SOURCES as $key => $src) {
        if ((bool)($src['slow'] ?? false) !== $slow || (strncmp($key, 'eia_', 4) === 0 && $eiaKey === '')) {
            continue;
        }
        $c = is_array($cache['sources'][$key] ?? null) ? $cache['sources'][$key] : [];
        if ($now - (int)($c['at'] ?? 0) >= $src['ttl'] && $now - (int)($c['tried'] ?? 0) >= ($src['retry'] ?? MARKET_RETRY)) {
            $due[] = $key;
        }
    }
    return $due;
}

// What is held, brought up to date where it has run out. One visitor at a
// time asks the sources; the rest take what is held. The quick sources are
// asked while the visitor waits; the slow ones only once he has his answer.
function market_refresh(string $dir, int $now, bool $slow = false): array
{
    $key = market_eia_key();
    $cache = market_cache_read($dir);
    if (market_due($cache, $now, $key, $slow) === []) {
        return $cache;
    }
    // The quick sources and the slow ones each have their own turn, so a slow
    // one that takes a minute never keeps the quick ones waiting.
    $lock = @fopen($dir . ($slow ? '/lock-slow' : '/lock'), 'c');
    if ($lock === false) {
        return $cache;
    }
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        return $cache;
    }
    $cache = market_cache_read($dir);       // someone may have just finished
    $began = microtime(true);
    foreach (market_due($cache, $now, $key, $slow) as $source) {
        if (microtime(true) - $began > ($slow ? MARKET_BUDGET_SLOW : MARKET_BUDGET)) {
            break;                           // the rest wait for the next visitor
        }
        $items = [];
        try {
            $items = market_fetch($source, $now, $key, is_array($cache['sources'][$source] ?? null) ? $cache['sources'][$source] : []);
        } catch (Throwable $e) {
            $items = [];
        }
        $held = is_array($cache['sources'][$source] ?? null) ? $cache['sources'][$source] : [];
        $held['tried'] = $now;
        // the days a source sends are added to the days already held, so a
        // feed that only carries this month still builds a longer history
        foreach ($items as $id => $one) {
            if (isset(MARKET_ITEMS[$id])) {
                $items[$id]['days'] = market_days(market_days($one['days'] ?? [], $id) + market_days($held['items'][$id]['days'] ?? [], $id), $id);
            }
        }
        if ($items !== []) {
            $held['at'] = $now;
            $held['items'] = $items;
            $held['why'] = '';
        } else {
            $held['why'] = market_why() !== '' ? market_why() : 'an answer with no figures in it';
        }
        // kept at once, and laid over whatever the other turn wrote meanwhile
        $cache = market_cache_merge($dir, $source, $held);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    return $cache;
}

// ---------------------------------------------------------------- saying

function market_show(float $v, string $unit): string
{
    switch ($unit) {
        case 'pct':
            return number_format($v, 2) . '%';
        case 'fx':
            return number_format($v, 4);
        case 'eur4':
            return "\u{20AC}" . number_format($v, 4);
        case 'usd0':
            return '$' . number_format($v, 0);
        case 'usd3':
            return '$' . number_format($v, 3);
        default:
            return '$' . number_format($v, 2);
    }
}

// 2026-11-24 as "November 24, 2026" or "Nov 24".
function market_day(string $day, bool $short = false): string
{
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $day, new DateTimeZone('UTC'));
    return $d === false ? $day : $d->format($short ? 'M j' : 'F j, Y');
}

// One held figure as the page shows it, or null when it is too old to show.
function market_item(string $id, array $held, int $now, array $days = []): ?array
{
    $spec = MARKET_ITEMS[$id];
    $src = MARKET_SOURCES[$spec['src']];
    $value = market_num($held['value'] ?? null, $id);
    $asOf = $held['as_of'] ?? null;
    if ($value === null || !is_string($asOf)) {
        return null;
    }
    $isMoment = strlen($asOf) > 10;
    $at = $isMoment ? strtotime($asOf) : (market_is_day($asOf) ? strtotime($asOf . 'T00:00:00Z') : false);
    if ($at === false || $now - $at > $spec['fresh'] * 86400 || $at - $now > 172800) {
        return null;
    }
    $prev = market_num($held['prev'] ?? null, $id);
    $rate = $value;                 // as the source gives it
    if (!empty($spec['turned'])) {
        // shown the other way round: one of the second thing in the first
        $value = 1 / $value;
        $prev = $prev === null ? null : 1 / $prev;
        $turned = [];
        foreach (market_days($days, $id) as $day => $v) {
            $turned[$day] = 1 / $v;
        }
        $days = $turned;
    }
    $shown = market_show($value, $spec['unit']);
    $prevDay = is_string($held['prev_as_of'] ?? null) && market_is_day($held['prev_as_of']) ? $held['prev_as_of'] : '';

    $delta = '';
    $dir = '';
    if ($spec['unit'] === 'pct' && $prev !== null) {
        $bp = (int)round(($value - $prev) * 100);
        $delta = $bp === 0 ? 'unch' : ($bp > 0 ? '+' : '') . $bp . ' bp';
        $dir = $bp === 0 ? 'flat' : ($bp > 0 ? 'up' : 'dn');
    } else {
        $pct = null;
        if (isset($held['change_pct']) && is_numeric($held['change_pct'])) {
            $pct = (float)$held['change_pct'];
        } elseif ($prev !== null && $prev > 0) {
            $pct = ($value / $prev - 1) * 100;
        }
        if ($pct !== null) {
            $pct = round($pct, 2);
            $delta = $pct == 0.0 ? 'unch' : ($pct > 0 ? '+' : '') . number_format($pct, 2) . '%';
            $dir = $pct == 0.0 ? 'flat' : ($pct > 0 ? 'up' : 'dn');
        }
    }

    if ($isMoment) {
        $ny = (new DateTimeImmutable('@' . $at))->setTimezone(new DateTimeZone('America/New_York'));
        $when = $ny->format('g:i A') . ' ET';
        $long = $ny->format('g:i A') . ' ET on ' . $ny->format('F j, Y');
    } else {
        $when = market_day($asOf, true);
        $long = market_day($asOf);
    }
    // "It was 4.92% on November 23, 2026, the business day before."
    $was = static function (string $what) use ($prev, $prevDay, $spec): string {
        return $prev !== null && $prevDay !== '' ? ' It was ' . market_show($prev, $spec['unit']) . ' on ' . market_day($prevDay) . ', the ' . $what . ' before.' : '';
    };

    switch ($id) {
        case 'ust30':
        case 'ust10':
            $text = 'Daily par yield curve rate for ' . $long . '.' . $was('business day');
            break;
        case 'eurusd':
            $text = 'One U.S. dollar bought ' . $shown . ' on ' . $long . ', and one euro bought $' . market_show($rate, 'fx') . '. ' . market_fx_verdict($rate) . $was('business day')
                . ' Worked out from the European Central Bank\'s euro reference rate, which is set once each business day.';
            break;
        case 'btc':
            $text = 'Price in U.S. dollars at ' . $long . '.' . ($delta !== '' && $delta !== 'unch' ? ' Change over the 24 hours before: ' . $delta . '.' : '') . ' Data provided by CoinGecko.';
            break;
        case 'brent':
            $text = 'Europe Brent spot price for ' . $long . ', in dollars a barrel.' . $was('trading day') . ' The daily prices are released once a week, usually on Wednesday.';
            break;
        case 'wti':
            $text = 'West Texas Intermediate spot price at Cushing, Oklahoma, for ' . $long . ', in dollars a barrel.' . $was('trading day') . ' The daily prices are released once a week, usually on Wednesday.';
            break;
        default:
            $text = 'U.S. average retail price of regular gasoline, all formulations, for the week of ' . $long . ', in dollars a gallon.' . $was('week');
    }

    $card = [];
    if ($id === 'eurusd') {
        // both ways round, and which of the two is worth more
        $card = ['pair' => ['$1 = ' . $shown, "\u{20AC}1 = $" . market_show($rate, 'fx')], 'verdict' => market_fx_verdict($rate)];
    }
    return [
        'id' => $id,
        'label' => $spec['label'],
        // on the strip the dollar's price says what it is the price of
        'value' => $id === 'eurusd' ? '$1 = ' . $shown : $shown,
        'delta' => $delta,
        'dir' => $dir,
        'by' => $src['short'],
        'when' => $when,
        'card' => [
            'title' => $spec['name'] . ': ' . $shown,
            'text' => $text,
            'source' => $src['name'],
            'url' => $src['url'],
        ] + $card + market_line_picture($id, $value, $asOf, $days, $shown, $delta, $dir, $long, $prevDay),
    ];
}

// Which is worth more, the euro or the dollar, from U.S. dollars to one euro.
function market_fx_verdict(float $rate): string
{
    if ($rate > 1.00005) {
        return 'The euro is worth more: one euro buys $' . number_format($rate, 2) . '.';
    }
    if ($rate < 0.99995) {
        return 'The dollar is worth more: one dollar buys ' . "\u{20AC}" . number_format(1 / $rate, 2) . '.';
    }
    return 'The dollar and the euro are worth the same.';
}

// A value rounded the way its unit is shown, for a point on a chart.
function market_point(float $v, string $unit): float
{
    return round($v, ['pct' => 2, 'fx' => 4, 'eur4' => 4, 'usd0' => 0, 'usd3' => 3][$unit] ?? 2);
}

// The same figure drawn (js/ticker.js): the value, large, with its change;
// a line of its recent history; the low, the high and the change over that
// stretch; and one plain line on what it is. The card's title and text above
// say it in words. With too few days held there is no chart, only the value.
function market_line_picture(string $id, float $value, string $asOf, array $days, string $shown, string $delta, string $dir, string $long, string $prevDay): array
{
    $spec = MARKET_ITEMS[$id];
    $unit = $spec['unit'];
    $isMoment = strlen($asOf) > 10;
    $today = substr($asOf, 0, 10);

    $hero = ['value' => $shown, 'label' => $long];
    if ($delta !== '') {
        $hero['delta'] = $delta;
        $hero['dir'] = $dir;
        $hero['vs'] = $isMoment ? 'in 24 hours' : ($prevDay !== '' ? 'from ' . market_day($prevDay, true) : '');
    }
    $out = ['eyebrow' => $spec['name'], 'hero' => $hero, 'about' => $spec['what']];

    // the days up to the figure's own, and the figure itself as the last point
    $pts = [];
    foreach (market_days($days, $id) as $day => $v) {
        if (strcmp($day, $today) < 0) {
            $pts[$day] = $v;
        }
    }
    $pts[$today] = $value;
    $pts = array_slice($pts, -$spec['span'], null, true);
    if (count($pts) < MARKET_DAYS_CHART) {
        return $out;
    }

    $first = (string)array_key_first($pts);
    $start = $pts[$first];
    $loDay = $hiDay = $first;
    foreach ($pts as $day => $v) {
        if ($v < $pts[$loDay]) {
            $loDay = (string)$day;
        }
        if ($v > $pts[$hiDay]) {
            $hiDay = (string)$day;
        }
    }
    if ($unit === 'pct') {
        $bp = (int)round(($value - $start) * 100);
        $change = $bp === 0 ? 'unch' : ($bp > 0 ? '+' : '') . $bp . ' bp';
        $way = $bp === 0 ? 'flat' : ($bp > 0 ? 'up' : 'dn');
    } else {
        $pct = round(($value / $start - 1) * 100, 2);
        $change = $pct == 0.0 ? 'unch' : ($pct > 0 ? '+' : '') . number_format($pct, 2) . '%';
        $way = $pct == 0.0 ? 'flat' : ($pct > 0 ? 'up' : 'dn');
    }
    $since = 'since ' . market_day($first, true);
    $step = $id === 'gas' ? 'Week by week' : 'Day by day';
    $points = [];
    foreach ($pts as $day => $v) {
        $points[] = [(string)$day, market_point($v, $unit)];
    }
    $out['line'] = [
        'title' => $step . ', ' . $since,
        'unit' => $unit,
        'points' => $points,
        'label' => $spec['name'] . ', ' . count($pts) . ($id === 'gas' ? ' weeks' : ' days') . ' from ' . market_day($first) . ' to ' . market_day($today)
            . '. Low ' . market_show($pts[$loDay], $unit) . ' on ' . market_day($loDay, true) . ', high ' . market_show($pts[$hiDay], $unit) . ' on ' . market_day($hiDay, true)
            . ', latest ' . $shown . '.',
    ];
    $out['tiles'] = [
        ['label' => 'Low', 'value' => market_show($pts[$loDay], $unit), 'note' => market_day($loDay, true)],
        ['label' => 'High', 'value' => market_show($pts[$hiDay], $unit), 'note' => market_day($hiDay, true)],
        ['label' => 'Change', 'value' => $change, 'note' => $since, 'dir' => $way],
    ];
    return $out;
}

// The year's RIA deal count as a figure, or null once it is too old to show.
function market_deals_item(int $now): ?array
{
    $d = MARKET_DEALS;
    $end = market_is_day($d['through']) ? strtotime($d['through'] . 'T00:00:00Z') : false;
    if ($end === false || $d['count'] < 1 || $d['record'] < 1 || $now - $end > MARKET_DEALS_FRESH * 86400 || $end - $now > 86400) {
        return null;
    }
    $count = number_format($d['count']);
    $record = number_format($d['record']);
    $whole = substr($d['through'], 5) === '12-31';
    $month = (new DateTimeImmutable('@' . $end))->setTimezone(new DateTimeZone('UTC'));
    if ($whole) {
        $title = 'RIA deals announced in ' . $d['year'] . ': ' . $count;
        $text = 'DeVoe & Company counted ' . $count . ' announced RIA transactions in ' . $d['year'] . '. '
            . ($d['count'] > $d['record'] ? 'That passes the record of ' . $record . ' set in ' . $d['record_year'] . '.' : 'The record for a year is ' . $record . ', set in ' . $d['record_year'] . '.');
        $when = (string)$d['year'];
    } else {
        $title = 'RIA deals announced in ' . $d['year'] . ': ' . $count . ' through ' . $month->format('F');
        $left = $d['record'] - $d['count'];
        $m = (int)$month->format('n');
        $next = market_deals_next($d, $m);
        $text = 'DeVoe & Company counted ' . $count . ' announced RIA transactions from January through ' . $month->format('F') . ' ' . $d['year']
            . ($d['pace'] !== '' ? ', ' . $d['pace'] : '') . '. The record for a full year is ' . $record . ', set in ' . $d['record_year'] . '. '
            . ($left > 0 ? 'Another ' . number_format($left) . ' before the year ends would match it.' : 'This year has already passed it.')
            . ($next !== '' ? ' DeVoe counts by the quarter, so the next count is ' . $next . '.' : '');
        $when = $m % 3 === 0 ? ($m === 3 ? 'Q1' : 'Q1-Q' . intdiv($m, 3)) : 'thru ' . $month->format('M');
    }
    $short = $d['record'] - $d['count'];
    $card = ['title' => $title, 'text' => $text, 'source' => $d['book'], 'url' => $d['url']];
    return [
        'id' => 'ria',
        'label' => 'RIA Deals ' . $d['year'],
        'value' => $count,
        // through the year: how many more would tie the record. Once it is beaten, or the year is in: the record itself
        'delta' => $short < 0 ? 'new record, was ' . $record : ($whole || $short === 0 ? 'record ' . $record : number_format($short) . ' to tie record'),
        'dir' => $short < 0 ? 'up' : '',
        'by' => 'DeVoe',
        'when' => $when,
        'card' => $card + market_deals_picture($d, $whole, $month->format('F'), $whole ? '' : market_deals_next($d, (int)$month->format('n'))),
    ];
}

// What DeVoe counts next and about when, after a count through month $m. Its
// books come out about a month after each quarter ends.
function market_deals_next(array $d, int $m): string
{
    switch ($m) {
        case 3:
            return 'the first half, in late July';
        case 6:
            return 'the first nine months, in late October';
        case 9:
            return 'the full year, early in ' . ($d['year'] + 1);
        default:
            return '';
    }
}

// The same count drawn: the number, how far it is to the record, and the year
// beside the record year quarter by quarter. The card's title and text above
// say it all in words; these are what js/ticker.js draws in their place. The
// chart is left out when the quarters typed in do not add up to the counts.
function market_deals_picture(array $d, bool $whole, string $month, string $next = ''): array
{
    $count = (int)$d['count'];
    $record = (int)$d['record'];
    $short = $record - $count;
    $pct = (int)round($count / $record * 100);
    $out = [
        'eyebrow' => 'RIA deals announced in ' . $d['year'],
        'hero' => ['value' => number_format($count), 'label' => $whole ? 'in the full year' : 'January through ' . $month],
        'meter' => [
            'pct' => min(100, $pct),
            'left' => $short > 0 ? $pct . '% of the record' : ($short === 0 ? 'Ties the record' : 'A new record'),
            'right' => ($short < 0 ? 'was ' : '') . number_format($record) . ' in ' . $d['record_year'],
            'label' => number_format($count) . ' so far, against ' . number_format($record) . ' in ' . $d['record_year'] . ', the record for a year.',
        ],
        'facts' => [],
        'next' => $next !== '' ? 'Next count: ' . $next . '.' : '',
    ];

    $now = array_values(array_filter((array)($d['quarters'] ?? []), 'is_int'));
    $then = array_values(array_filter((array)($d['record_quarters'] ?? []), 'is_int'));
    $done = count($now);
    if ($done >= 1 && $done <= 4 && count($then) === 4 && array_sum($now) === $count && array_sum($then) === $record) {
        $rows = [];
        $said = [];
        for ($q = 0; $q < 4; $q++) {
            $row = ['q' => 'Q' . ($q + 1), 'then' => $then[$q]];
            if ($q < $done) {
                $row['now'] = $now[$q];
                $said[] = 'Q' . ($q + 1) . ' ' . $now[$q];
            } elseif ($q === $done && $done === 3 && $short > 0) {
                $row['need'] = $short;          // one quarter left: what it has to bring to tie
            }
            $rows[] = $row;
        }
        $label = 'Deals by quarter. ' . $d['year'] . ': ' . implode(', ', $said) . '. ' . $d['record_year'] . ': Q1 ' . $then[0] . ', Q2 ' . $then[1] . ', Q3 ' . $then[2] . ', Q4 ' . $then[3] . '.';
        $chart = ['title' => 'Quarter by quarter', 'now' => (string)$d['year'], 'then' => (string)$d['record_year'], 'rows' => $rows];
        if ($done === 3 && $short > 0) {
            $chart['need'] = 'needed to tie';
            $label .= ' ' . number_format($short) . ' in the fourth quarter of ' . $d['year'] . ' would tie the record.';
            // the line under the chart: what a repeat of the record year's last quarter would do
            $end = $count + $then[3];
            $chart['note'] = 'A fourth quarter like ' . $d['record_year'] . '\'s (' . $then[3] . ') would end ' . $d['year'] . ' at ' . number_format($end)
                . ($end > $record ? ', a new record.' : ($end === $record ? ', a tie with the record.' : ', ' . number_format($record - $end) . ' short of the record.'));
        }
        $chart['label'] = $label;
        $out['chart'] = $chart;
    }
    foreach ((array)($d['notes'] ?? []) as $note) {
        if (is_string($note) && $note !== '') {
            $out['facts'][] = $note;
        }
    }
    return $out;
}

// What each source last did, for Publish to print. Never sent to the web.
function market_status(): array
{
    $dir = market_dir();
    $cache = $dir === '' ? ['sources' => []] : market_cache_read($dir);
    $now = market_now();
    $out = [];
    foreach (MARKET_SOURCES as $key => $src) {
        $c = is_array($cache['sources'][$key] ?? null) ? $cache['sources'][$key] : [];
        $at = (int)($c['at'] ?? 0);
        $tried = (int)($c['tried'] ?? 0);
        $out[$key] = [
            'figures' => count((array)($c['items'] ?? [])),
            'answered' => $at > 0 ? ($now - $at) . 's ago' : 'never',
            'tried' => $tried > 0 ? ($now - $tried) . 's ago' : 'never',
            'why' => is_string($c['why'] ?? null) ? $c['why'] : '',
        ];
    }
    $out['key'] = market_eia_key() !== '' ? 'present' : 'absent or not in the form of a key';
    return $out;
}

// Once the visitor has his answer: ask the slow sources that are due.
function market_after(): void
{
    $dir = market_dir();
    if ($dir !== '') {
        market_refresh($dir, market_now(), true);
    }
}

// What the strip is given.
function market_snapshot(): array
{
    $now = market_now();
    $dir = market_dir();
    $cache = $dir === '' ? ['sources' => []] : market_refresh($dir, $now);
    $items = [];
    $sources = [];                  // who published what is showing, once each
    $deals = market_deals_item($now);
    if ($deals !== null) {
        $items[] = $deals;
        $sources[MARKET_DEALS['publisher']] = ['name' => MARKET_DEALS['publisher'], 'url' => MARKET_DEALS['home']];
    }
    foreach (MARKET_ITEMS as $id => $spec) {
        $held = $cache['sources'][$spec['src']]['items'][$id] ?? null;
        $days = $cache['sources'][$spec['days'] ?? $spec['src']]['items'][$id]['days'] ?? [];
        $one = is_array($held) ? market_item($id, $held, $now, is_array($days) ? $days : []) : null;
        if ($one !== null) {
            $items[] = $one;
            $src = MARKET_SOURCES[$spec['src']];
            $sources[$src['publisher']] = ['name' => $src['publisher'], 'url' => $src['home']];
        }
    }
    return ['ok' => $items !== [], 'at' => gmdate('Y-m-d\TH:i:s\Z', $now), 'items' => $items, 'sources' => array_values($sources)];
}
