<?php
/*
 * The market strip's figures (market/feed.php, js/ticker.js).
 *
 * Eight figures, each from the body that publishes it, each free to show:
 *   RIA deals announced this year              DeVoe & Company (typed in, quarterly)
 *   U.S. 30-year and 10-year Treasury yields   U.S. Department of the Treasury
 *   EUR/USD                                    European Central Bank
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
 * The energy figures need a free key from the Energy Information
 * Administration. It is not in this repository: Publish writes it beside the
 * web root as sa-market.json from the EIA_API_KEY secret. Without it the
 * strip shows the other four.
 *
 * Every figure goes out with the words for its source card, and the feed
 * names each publisher once for the strip's own "about" card, so the page
 * prints text only and nothing a source sends is ever treated as markup.
 *
 * Opened directly, this file does nothing: it only defines functions.
 */
declare(strict_types=1);

const MARKET_TIMEOUT = 5;            // seconds one source may take, unless it says otherwise
const MARKET_BUDGET = 14;            // seconds one request may spend asking
const MARKET_RETRY = 300;            // a source that failed is left alone this long
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
    'eia_spot' => [
        'ttl' => 10800,
        'timeout' => 12,            // slow to answer from the web host
        'short' => 'EIA',
        'publisher' => 'U.S. Energy Information Administration',
        'home' => 'https://www.eia.gov/petroleum/',
        'name' => 'U.S. Energy Information Administration, spot prices for crude oil',
        'url' => 'https://www.eia.gov/dnav/pet/pet_pri_spt_s1_d.htm',
    ],
    'eia_gas' => [
        'ttl' => 10800,
        'timeout' => 12,
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
    'ust30' => ['src' => 'treasury', 'label' => 'US 30-Yr', 'name' => 'U.S. 30-year Treasury yield', 'unit' => 'pct', 'fresh' => 10, 'lo' => 0.01, 'hi' => 25],
    'ust10' => ['src' => 'treasury', 'label' => 'US 10-Yr', 'name' => 'U.S. 10-year Treasury yield', 'unit' => 'pct', 'fresh' => 10, 'lo' => 0.01, 'hi' => 25],
    'eurusd' => ['src' => 'ecb', 'label' => 'EUR/USD', 'name' => 'Euro in U.S. dollars', 'unit' => 'fx', 'fresh' => 10, 'lo' => 0.3, 'hi' => 3],
    'btc' => ['src' => 'coingecko', 'label' => 'Bitcoin', 'name' => 'Bitcoin', 'unit' => 'usd0', 'fresh' => 0.25, 'lo' => 1, 'hi' => 100000000],
    'brent' => ['src' => 'eia_spot', 'label' => 'Brent', 'name' => 'Brent crude oil', 'unit' => 'usd2', 'fresh' => 21, 'lo' => 1, 'hi' => 1000],
    'wti' => ['src' => 'eia_spot', 'label' => 'WTI', 'name' => 'WTI crude oil', 'unit' => 'usd2', 'fresh' => 21, 'lo' => 1, 'hi' => 1000],
    'gas' => ['src' => 'eia_gas', 'label' => 'US Regular Gas', 'name' => 'U.S. regular gasoline', 'unit' => 'usd3', 'fresh' => 21, 'lo' => 0.2, 'hi' => 50],
];

// The RIA deal count comes out once a quarter, in DeVoe & Company's RIA Deal
// Book, so it is typed in here when a new book is published
// (docs/stat-bank.md). It is the same count as the record in the homepage's
// stat row. Left alone, it drops off the strip by itself: MARKET_DEALS_FRESH
// days after the last day it covers.
const MARKET_DEALS = [
    'year' => 2026,
    'count' => 244,                 // announced RIA transactions, January through 'through'
    'through' => '2026-09-30',
    'pace' => 'slightly ahead of the pace of 2025',
    'record' => 322,
    'record_year' => 2025,
    'book' => 'DeVoe & Company RIA Deal Book, third quarter 2026',
    'url' => 'https://www.devoeandcompany.com/deal-books/devoe-ria-deal-book-tm---q3-2026',
    'publisher' => 'DeVoe & Company',
    'home' => 'https://www.devoeandcompany.com/ria-ma-deal-books',
];
const MARKET_DEALS_FRESH = 150;

const MARKET_EIA_SERIES = ['RBRTE' => 'brent', 'RWTC' => 'wti', 'EMM_EPMR_PTE_NUS_DPG' => 'gas'];

function market_out(int $code, array $body, int $keep = 0): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: ' . ($keep > 0 ? 'public, max-age=' . $keep : 'no-store'));
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
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
    return $one === null ? [] : ['eurusd' => $one];
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
function market_fetch(string $source, int $now, string $eiaKey): array
{
    if ($source === 'treasury') {
        $ny = new DateTimeImmutable('@' . $now);
        $ny = $ny->setTimezone(new DateTimeZone('America/New_York'));
        $base = 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=';
        $rows = market_treasury_rows((string)market_get('treasury.xml', $base . $ny->format('Ym')));
        if (count($rows) < 2) {
            // the first days of a month: the day before is in last month's feed
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
    if ($source === 'eia_spot' && $eiaKey !== '') {
        $got = market_parse_eia((string)market_get('eia_spot.json', market_eia_url('petroleum/pri/spt', 'daily', ['RBRTE', 'RWTC'], 12, $eiaKey), MARKET_SOURCES[$source]['timeout']));
        return array_intersect_key($got, ['brent' => 1, 'wti' => 1]);
    }
    if ($source === 'eia_gas' && $eiaKey !== '') {
        $got = market_parse_eia((string)market_get('eia_gas.json', market_eia_url('petroleum/pri/gnd', 'weekly', ['EMM_EPMR_PTE_NUS_DPG'], 4, $eiaKey), MARKET_SOURCES[$source]['timeout']));
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

// The sources whose answers have run out and may be asked again.
function market_due(array $cache, int $now, string $eiaKey): array
{
    $due = [];
    foreach (MARKET_SOURCES as $key => $src) {
        if (strncmp($key, 'eia_', 4) === 0 && $eiaKey === '') {
            continue;
        }
        $c = is_array($cache['sources'][$key] ?? null) ? $cache['sources'][$key] : [];
        if ($now - (int)($c['at'] ?? 0) >= $src['ttl'] && $now - (int)($c['tried'] ?? 0) >= MARKET_RETRY) {
            $due[] = $key;
        }
    }
    return $due;
}

// What is held, brought up to date where it has run out. One visitor at a
// time asks the sources; the rest take what is held.
function market_refresh(string $dir, int $now): array
{
    $key = market_eia_key();
    $cache = market_cache_read($dir);
    if (market_due($cache, $now, $key) === []) {
        return $cache;
    }
    $lock = @fopen($dir . '/lock', 'c');
    if ($lock === false) {
        return $cache;
    }
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        return $cache;
    }
    $cache = market_cache_read($dir);       // someone may have just finished
    $began = microtime(true);
    $changed = false;
    foreach (market_due($cache, $now, $key) as $source) {
        if (microtime(true) - $began > MARKET_BUDGET) {
            break;                           // the rest wait for the next visitor
        }
        $items = [];
        try {
            $items = market_fetch($source, $now, $key);
        } catch (Throwable $e) {
            $items = [];
        }
        $held = is_array($cache['sources'][$source] ?? null) ? $cache['sources'][$source] : [];
        $held['tried'] = $now;
        if ($items !== []) {
            $held['at'] = $now;
            $held['items'] = $items;
            $held['why'] = '';
        } else {
            $held['why'] = market_why() !== '' ? market_why() : 'an answer with no figures in it';
        }
        $cache['sources'][$source] = $held;
        $changed = true;
    }
    if ($changed) {
        market_cache_write($dir, $cache);
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
function market_item(string $id, array $held, int $now): ?array
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
    $shown = market_show($value, $spec['unit']);
    $prev = market_num($held['prev'] ?? null, $id);
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
            $text = 'Euro reference rate for ' . $long . ': one euro bought ' . $shown . ' U.S. dollars.' . $was('business day') . ' The rate is set once each business day.';
            break;
        case 'btc':
            $text = 'Price in U.S. dollars at ' . $long . '.' . ($delta !== '' && $delta !== 'unch' ? ' Change over the 24 hours before: ' . $delta . '.' : '') . ' Data provided by CoinGecko.';
            break;
        case 'brent':
            $text = 'Europe Brent spot price for ' . $long . ', in dollars a barrel.' . $was('trading day') . ' The daily prices are released once a week.';
            break;
        case 'wti':
            $text = 'West Texas Intermediate spot price at Cushing, Oklahoma, for ' . $long . ', in dollars a barrel.' . $was('trading day') . ' The daily prices are released once a week.';
            break;
        default:
            $text = 'U.S. average retail price of regular gasoline, all formulations, for the week of ' . $long . ', in dollars a gallon.' . $was('week');
    }

    return [
        'id' => $id,
        'label' => $spec['label'],
        'value' => $shown,
        'delta' => $delta,
        'dir' => $dir,
        'by' => $src['short'],
        'when' => $when,
        'card' => [
            'title' => $spec['name'] . ': ' . $shown,
            'text' => $text,
            'source' => $src['name'],
            'url' => $src['url'],
        ],
    ];
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
        $text = 'DeVoe & Company counted ' . $count . ' announced RIA transactions from January through ' . $month->format('F') . ' ' . $d['year']
            . ($d['pace'] !== '' ? ', ' . $d['pace'] : '') . '. The record for a full year is ' . $record . ', set in ' . $d['record_year'] . '. '
            . ($left > 0 ? 'Another ' . number_format($left) . ' before the year ends would match it.' : 'This year has already passed it.');
        $when = 'thru ' . $month->format('M');
    }
    return [
        'id' => 'ria',
        'label' => 'RIA Deals ' . $d['year'],
        'value' => $count,
        'delta' => ($d['count'] > $d['record'] ? 'new record, was ' : 'record ') . $record,
        'dir' => $d['count'] > $d['record'] ? 'up' : '',
        'by' => 'DeVoe',
        'when' => $when,
        'card' => ['title' => $title, 'text' => $text, 'source' => $d['book'], 'url' => $d['url']],
    ];
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
        $one = is_array($held) ? market_item($id, $held, $now) : null;
        if ($one !== null) {
            $items[] = $one;
            $src = MARKET_SOURCES[$spec['src']];
            $sources[$src['publisher']] = ['name' => $src['publisher'], 'url' => $src['home']];
        }
    }
    return ['ok' => $items !== [], 'at' => gmdate('Y-m-d\TH:i:s\Z', $now), 'items' => $items, 'sources' => array_values($sources)];
}
