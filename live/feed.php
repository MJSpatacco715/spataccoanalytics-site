<?php
/*
 * The live data behind the NFL tools on /tools/football/.
 *
 * The tools are the source platform's own pages, served from this site. Their
 * public data calls (game lines, the line's path, the injury report, the
 * referees) come here, and this asks the source for them, server to server,
 * so a visitor's browser never learns the source's address and the numbers
 * are as current as the source's own pages.
 *
 * Only the four calls below, with checked parameters, are passed on: this is
 * not an open proxy. Each answer is kept for a short time, so however many
 * people are looking, the source is asked about once a minute per call; when
 * the source cannot be read, the last good answer is served and says so in a
 * header.
 *
 * The source is a league's platform, and its answers can name the league's
 * people: the game lines say which member last pressed Refresh. Those fields
 * are taken out here, before anything is kept or served, and an answer that
 * still carries a denylisted word (the list Publish writes beside the
 * address) is refused like a failed read.
 *
 * The source's address lives in sa-feed.json one level above the web root,
 * written by the Publish workflow from a repository secret. The cache sits
 * beside it, outside the web root as well.
 */
declare(strict_types=1);

// seconds an answer is reused before the source is asked again
const FEED_TTL = ['odds_get' => 60, 'odds_ticks' => 60, 'injuries' => 60, 'referees' => 300];
// the source answers plain scripts with a refusal page, and real browsers
// with data
const FEED_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function feed_out(int $code, string $json, array $headers = []): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-cache, max-age=0');
    foreach ($headers as $k => $v) {
        header("$k: $v");
    }
    if (strpos((string)($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip') !== false && function_exists('gzencode')) {
        header('Content-Encoding: gzip');
        header('Vary: Accept-Encoding');
        $json = (string)gzencode($json, 6);
    }
    echo $json;
    exit;
}

function feed_fail(int $code, string $why): void
{
    feed_out($code, json_encode(['ok' => false, 'error' => $why]));
}

// fields that name a league member, dropped wherever they sit in an answer
const FEED_SCRUB = ['fetched_by', 'fetched_by_name', 'member_id', 'member_name'];

/** The source's answer when it is one: JSON with ok true. */
function feed_usable(?string $body): bool
{
    if ($body === null || $body === '') {
        return false;
    }
    $j = json_decode($body, true);
    return is_array($j) && ($j['ok'] ?? false) === true;
}

/** The answer with every member field taken out (a read a member asked for reads as automatic). */
function feed_scrub($v)
{
    if (is_array($v)) {
        return array_map('feed_scrub', $v);
    }
    if (!($v instanceof stdClass)) {
        return $v;
    }
    $out = new stdClass();
    foreach (get_object_vars($v) as $k => $x) {
        if (in_array((string)$k, FEED_SCRUB, true)) {
            continue;
        }
        if ((string)$k === 'read_by' && $x === 'manager') {
            $x = 'auto';
        }
        $out->$k = feed_scrub($x);
    }
    return $out;
}

/** Every key and string in an answer, for the denylist. */
function feed_words($v, array &$out): void
{
    if (is_string($v)) {
        $out[] = $v;
    } elseif (is_array($v)) {
        foreach ($v as $x) {
            feed_words($x, $out);
        }
    } elseif ($v instanceof stdClass) {
        foreach (get_object_vars($v) as $k => $x) {
            $out[] = (string)$k;
            feed_words($x, $out);
        }
    }
}

/** The answer as it may be kept and served, or null when it may not. */
function feed_clean(?string $body, array $deny): ?string
{
    if (!feed_usable($body)) {
        return null;
    }
    // decoded as objects, so an empty {} goes back out as {} and not []
    $j = feed_scrub(json_decode((string)$body));
    $words = [];
    feed_words($j, $words);
    $hay = implode("\n", $words);
    foreach ($deny as $re) {
        if (@preg_match($re, $hay) === 1) {
            return null;
        }
    }
    $out = json_encode($j, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    return is_string($out) ? $out : null;
}

function feed_fetch(string $url): ?string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_USERAGENT => FEED_UA,
        CURLOPT_HTTPHEADER => ['Accept: application/json, text/plain, */*'],
        CURLOPT_ENCODING => '',
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return is_string($body) && $code === 200 ? $body : null;
}

$action = (string)($_GET['a'] ?? '');
if (!isset(FEED_TTL[$action])) {
    feed_fail(404, 'unknown call');
}
$query = ['action' => $action];
if (isset($_GET['week']) && $_GET['week'] !== '') {
    if (!preg_match('/^\d{1,2}$/', (string)$_GET['week']) || (int)$_GET['week'] < 1 || (int)$_GET['week'] > 17) {
        feed_fail(400, 'week must be 1-17');
    }
    $query['week'] = (int)$_GET['week'];
}
if ($action === 'injuries' && isset($_GET['player']) && $_GET['player'] !== '') {
    if (!preg_match('/^\d{1,16}$/', (string)$_GET['player'])) {
        feed_fail(400, 'bad player');
    }
    $query['player'] = (string)$_GET['player'];
}

$home = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__));
$cfg = json_decode((string)@file_get_contents($home . '/sa-feed.json'), true);
$base = is_array($cfg) ? (string)($cfg['base'] ?? '') : '';
if (!preg_match('~^https?://[^\s?#]+$~', $base)) {
    feed_fail(503, 'the live feed is not set up');
}
$base = rtrim($base, '/') . '/';
// the denylist's words (a pattern on digits is for files, not live text)
$deny = [];
foreach ((is_array($cfg['deny'] ?? null) ? $cfg['deny'] : []) as $p) {
    if (is_string($p) && $p !== '' && strpos($p, '\\d') === false) {
        $deny[] = '~' . str_replace('~', '\\~', $p) . '~i';
    }
}

$dir = $home . '/sa-feed-cache';
if (!is_dir($dir)) {
    @mkdir($dir, 0700, true);
}
$file = $dir . '/' . preg_replace('/[^a-z0-9]+/', '_', http_build_query($query)) . '.json';
$ttl = FEED_TTL[$action];

$fresh = static function () use ($file, $ttl): ?string {
    clearstatcache(true, $file);
    if (is_file($file) && time() - (int)filemtime($file) < $ttl) {
        $b = @file_get_contents($file);
        return is_string($b) ? $b : null;
    }
    return null;
};

$hit = $fresh();
if ($hit !== null) {
    feed_out(200, $hit, ['X-Feed' => 'cached']);
}

// One request to the source at a time per call: whoever waits on the lock
// finds the answer the first one stored.
$lock = @fopen($file . '.lock', 'c');
if ($lock) {
    flock($lock, LOCK_EX);
}
$hit = $fresh();
if ($hit !== null) {
    feed_out(200, $hit, ['X-Feed' => 'cached']);
}
$body = feed_clean(feed_fetch($base . 'api.php?' . http_build_query($query)), $deny);
if ($body !== null) {
    $tmp = $file . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, $body) !== false) {
        @rename($tmp, $file);
    }
    feed_out(200, $body, ['X-Feed' => 'fresh']);
}
// the source could not be read: the last good answer, marked as such
$old = is_file($file) ? @file_get_contents($file) : false;
if (is_string($old) && feed_usable($old)) {
    feed_out(200, $old, ['X-Feed' => 'stale', 'X-Feed-Age' => (string)(time() - (int)filemtime($file))]);
}
feed_fail(502, 'the live data could not be read just now');
