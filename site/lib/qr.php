<?php
/*
 * The business card's QR code: what is kept when it is scanned and when a button on its page is pressed.
 *
 * The card's code reads HTTPS://SPATACCOANALYTICS.COM/C, in capitals on purpose (a smaller code), and is in print:
 * that address is for good. C/index.php is the page, C/log.php hears a press, C/vcard.php is the contact card.
 *
 * One line a scan or a press goes into sa-leads/qr-events.jsonl, one level above the web root, beside the scorer's
 * record: when (UTC), the source it was printed for, what happened, the kind of device, the site it came from, and a
 * hash of the address with a salt kept in that same folder. The address itself is never written down.
 * The owner's CRM reads the lines through score/feed.php, with its token. Nothing here shows them to a visitor.
 */
declare(strict_types=1);

const QR_EVENTS = ['scan', 'linkedin', 'vcard', 'book', 'email', 'scorer', 'tools', 'lines', 'resume', 'alltools'];
const QR_FILE = 'qr-events.jsonl';
const QR_PER_HOUR = 120;   // from one address: a card passed round a table is a dozen, not hundreds

/** The source a code was printed for: the card when none is given, "unknown" when it is not a plain slug. */
function qr_source($v): string
{
    if ($v === null || $v === '') {
        return 'card';
    }
    return is_string($v) && preg_match('/^[a-z0-9-]{1,40}$/', $v) === 1 ? $v : 'unknown';
}

function qr_ua_type(string $ua): string
{
    if ($ua === '' || preg_match('/bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|headless|monitor|scan/i', $ua) === 1) {
        return 'bot';
    }
    return preg_match('/Mobi|Android|iPhone|iPad|iPod/i', $ua) === 1 ? 'mobile' : 'desktop';
}

function qr_dir(): string
{
    return dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) . '/sa-leads';
}

/** The salt the address is hashed with: made once, kept off the web, never in the repository. */
function qr_salt(string $dir): string
{
    $f = $dir . '/qr-salt';
    $s = (string)@file_get_contents($f);
    if (strlen($s) < 32) {
        $s = bin2hex(random_bytes(32));
        @file_put_contents($f, $s, LOCK_EX);
        @chmod($f, 0600);
    }
    return $s;
}

/** Keep one line. Never throws and never holds a visitor up: false when it could not be kept or was turned away. */
function qr_keep(string $event, string $source): bool
{
    if (!in_array($event, QR_EVENTS, true)) {
        return false;
    }
    $dir = qr_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        return false;
    }
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $hash = hash('sha256', $ip . qr_salt($dir));
    $gate = $dir . '/qr-' . substr($hash, 0, 24) . '.txt';
    $now = time();
    $seen = array_values(array_filter(
        array_map('intval', (array)@file($gate, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)),
        static fn(int $t): bool => $t > $now - 3600
    ));
    if (count($seen) >= QR_PER_HOUR) {
        return false;
    }
    $seen[] = $now;
    @file_put_contents($gate, implode("\n", $seen) . "\n", LOCK_EX);
    $ref = (string)parse_url((string)($_SERVER['HTTP_REFERER'] ?? ''), PHP_URL_HOST);
    $row = [
        'id' => bin2hex(random_bytes(8)),
        'at' => gmdate('Y-m-d\TH:i:s\Z', $now),
        'source' => $source,
        'event' => $event,
        'ua_type' => qr_ua_type((string)($_SERVER['HTTP_USER_AGENT'] ?? '')),
        'referrer' => substr(preg_replace('/[^a-z0-9.-]/i', '', $ref) ?? '', 0, 80),
        'ip_hash' => $hash,
    ];
    return @file_put_contents($dir . '/' . QR_FILE, json_encode($row, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX) !== false;
}

function qr_no_store(): void
{
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('X-Robots-Tag: noindex, nofollow');
}
