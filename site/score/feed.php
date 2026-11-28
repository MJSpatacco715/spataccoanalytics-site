<?php
/*
 * The scorer's record, handed to the owner's CRM and to nobody else.
 *
 * score/run.php keeps what goes into the Website Scorer, and score/lead.php the
 * name and email a visitor leaves. The owner's CRM (TaccoBox) reads both from
 * here, into an inbox where the owner accepts what should become a record.
 *
 * Who may read is in sa-scorer.json, one level above the web root, written by
 * the Publish workflow from the SCORER_FEED_TOKEN repository secret:
 *   token   what the CRM sends in the X-Scorer-Token header
 * With no such file this address answers 404, as if it were not here. The
 * token is never in this repository, a page or a commit.
 *
 * GET only, and it changes nothing (the CRM asks over HTTPS). It answers with what was kept
 * at or after ?since= (an ISO time; everything when left out), oldest first,
 * FEED_MAX at most of each kind, each with an id of its own. A reader asks
 * again from the "next" time it is given and drops the ids it has already
 * seen, so a line the owner deletes from the record moves nothing.
 *
 * An address that sends the wrong token FEED_TRIES times in an hour is turned
 * away for the rest of it.
 */
declare(strict_types=1);

const FEED_MAX = 500;
const FEED_TRIES = 10;

function feed_out(int $code, array $body): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$home = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__));
$cfg = json_decode((string)@file_get_contents($home . '/sa-scorer.json'), true);
$token = is_array($cfg) && is_string($cfg['token'] ?? null) ? $cfg['token'] : '';
if (strlen($token) < 24) {
    feed_out(404, ['ok' => false]);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    feed_out(405, ['ok' => false, 'error' => 'GET only']);
}

$dir = $home . '/sa-leads';
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$gate = $dir . '/feed-' . substr(hash('sha256', $ip), 0, 24) . '.txt';
$now = time();
$missed = array_values(array_filter(
    array_map('intval', (array)@file($gate, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)),
    static fn(int $t): bool => $t > $now - 3600
));
if (count($missed) >= FEED_TRIES) {
    feed_out(429, ['ok' => false, 'error' => 'slow down']);
}
$sent = (string)($_SERVER['HTTP_X_SCORER_TOKEN'] ?? '');
if ($sent === '' || !hash_equals($token, $sent)) {
    if (is_dir($dir) || @mkdir($dir, 0700, true)) {
        $missed[] = $now;
        @file_put_contents($gate, implode("\n", $missed) . "\n", LOCK_EX);
    }
    feed_out(401, ['ok' => false, 'error' => 'token']);
}

$since = (string)($_GET['since'] ?? '');
$from = $since !== '' ? strtotime($since) : 0;
if ($from === false) {
    feed_out(422, ['ok' => false, 'error' => 'since']);
}

// Every kept line at or after $from, oldest first, each with an id. A lead kept
// before leads had ids is given one made from the line itself, so it is the
// same every time it is read.
$read = static function (string $file) use ($dir, $from): array {
    $out = [];
    foreach ((array)@file($dir . '/' . $file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $row = json_decode((string)$line, true);
        if (!is_array($row)) {
            continue;
        }
        $at = strtotime((string)($row['at'] ?? ''));
        if ($at === false || $at < $from) {
            continue;
        }
        if (!is_string($row['id'] ?? null) || $row['id'] === '') {
            $row['id'] = substr(hash('sha256', (string)$line), 0, 16);
        }
        $out[] = $row;
    }
    usort($out, static fn(array $a, array $b): int => strcmp((string)$a['at'], (string)$b['at']));
    return array_slice($out, 0, FEED_MAX);
};

$runs = $read('scorer-runs.jsonl');
$leads = $read('scorer.jsonl');
// Where to ask from next: the latest time handed over, so nothing kept in the
// same second is missed (a reader drops the ids it has seen). When a kind was
// cut at FEED_MAX, the earlier of the two last times, so its rest is not skipped.
$last = static fn(array $rows): string => $rows ? (string)$rows[count($rows) - 1]['at'] : '';
$ends = array_filter([$last($runs), $last($leads)]);
$cut = array_filter([count($runs) === FEED_MAX ? $last($runs) : '', count($leads) === FEED_MAX ? $last($leads) : '']);
$next = $cut ? min($cut) : ($ends ? max($ends) : ($since !== '' ? $since : ''));

// The business card's scans and presses ride along (lib/qr.php): every line at or after ?since=, for the CRM to count.
feed_out(200, ['ok' => true, 'runs' => $runs, 'leads' => $leads, 'qr' => $read('qr-events.jsonl'), 'next' => $next, 'more' => (bool)$cut]);
