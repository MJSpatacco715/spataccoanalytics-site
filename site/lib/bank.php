<?php
/*
 * The stat bank: the owner's private collection of things worth posting.
 *
 * The owner drops in a link, a quote, a number, a screenshot or a file
 * (bank/index.html, or an email the weekly routine files here). Each week
 * the routine takes the next item, traces it to its source and prepares the
 * post. Nothing in the bank is public.
 *
 * Everything is kept one level above the web root, where the web cannot read
 * it: the items in sa-bank/items.json, the uploads in sa-bank/files/, the
 * sign-ins in sa-bank/sessions/. Who may come in is in sa-bank.json beside
 * them, written by the Publish workflow from two repository secrets:
 *   password  what the owner types on the page
 *   token     what the weekly routine sends in the X-Bank-Token header
 * With no such file the bank is closed to everyone.
 *
 * An upload is kept only if its own bytes say it is a picture, a PDF or
 * plain text, under a name made here, and is handed back only to someone
 * signed in, marked so a browser will not run it.
 *
 * Opened directly, this file does nothing: it only defines functions.
 */
declare(strict_types=1);

const BANK_MAX_ITEMS = 500;
const BANK_MAX_FILE = 12 * 1024 * 1024;
const BANK_MAX_FILES = 5;
const BANK_MAX_STORE = 300 * 1024 * 1024;
const BANK_TEXT = 6000;
const BANK_SESSION_DAYS = 30;
const BANK_LOGIN_TRIES = 8;        // one address, fifteen minutes
const BANK_LOGIN_TRIES_ALL = 60;   // everyone, an hour
const BANK_COOKIE = 'sa_bank';
const BANK_EXT = [
    'image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif',
    'image/heic' => 'heic', 'application/pdf' => 'pdf', 'text/plain' => 'txt',
];
const BANK_STATUS = ['new', 'checked', 'needs_source', 'scheduled', 'posted', 'skipped'];
const BANK_TOPICS = ['transitions', 'markets', 'data', 'other'];

function bank_out(int $code, array $body): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function bank_home(): string
{
    return dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__));
}

// The bank's folder, made on first use. Answers and stops if it cannot be.
function bank_dir(): string
{
    $dir = bank_home() . '/sa-bank';
    foreach ([$dir, $dir . '/files', $dir . '/sessions'] as $d) {
        if (!is_dir($d) && !@mkdir($d, 0700, true) && !is_dir($d)) {
            bank_out(500, ['ok' => false, 'error' => 'storage']);
        }
    }
    return $dir;
}

// Who may come in, or null when the bank has not been set up.
function bank_secrets(): ?array
{
    $raw = @file_get_contents(bank_home() . '/sa-bank.json');
    $s = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($s) || !is_string($s['password'] ?? null) || strlen($s['password']) < 10) {
        return null;
    }
    $token = is_string($s['token'] ?? null) && strlen($s['token']) >= 24 ? $s['token'] : '';
    return ['password' => $s['password'], 'token' => $token];
}

// one line of plain text, or several when $lines, at most $max characters
function bank_text($v, int $max, bool $lines = false): string
{
    if (!is_string($v) && !is_int($v) && !is_float($v)) {
        return '';
    }
    $s = str_replace(["\r\n", "\r"], "\n", (string)$v);
    $s = preg_replace($lines ? '/[\x00-\x09\x0B-\x1F\x7F]+/u' : '/[\x00-\x1F\x7F]+/u', ' ', $s);
    if ($s === null) {
        return '';
    }
    if ($lines) {
        $s = (string)preg_replace('/\n{3,}/', "\n\n", $s);
    }
    return mb_substr(trim($s), 0, $max);
}

function bank_url($v): string
{
    $s = bank_text($v, 600);
    return preg_match('#^https?://[^\s<>"\']+$#i', $s) ? $s : '';
}

function bank_ip_key(): string
{
    return substr(hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? '')), 0, 24);
}

// True when this request may try a password. Counts the try.
function bank_may_try(string $dir): bool
{
    $now = time();
    $ok = true;
    foreach ([['try-' . bank_ip_key() . '.txt', 900, BANK_LOGIN_TRIES], ['try-all.txt', 3600, BANK_LOGIN_TRIES_ALL]] as [$name, $span, $limit]) {
        $f = $dir . '/sessions/' . $name;
        $seen = array_values(array_filter(
            array_map('intval', (array)@file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)),
            static fn(int $t): bool => $t > $now - $span
        ));
        if (count($seen) >= $limit) {
            $ok = false;
        }
        $seen[] = $now;
        @file_put_contents($f, implode("\n", array_slice($seen, -200)) . "\n", LOCK_EX);
    }
    return $ok;
}

// Signs the owner in: a random token in a cookie only this folder sees,
// remembered here by its hash.
function bank_sign_in(string $dir): void
{
    $token = bin2hex(random_bytes(32));
    $exp = time() + BANK_SESSION_DAYS * 86400;
    @file_put_contents($dir . '/sessions/s-' . hash('sha256', $token) . '.json', json_encode(['exp' => $exp]), LOCK_EX);
    foreach ((array)glob($dir . '/sessions/s-*.json') as $f) {   // sign-ins that have run out
        $s = json_decode((string)@file_get_contents($f), true);
        if (!is_array($s) || (int)($s['exp'] ?? 0) < time()) {
            @unlink($f);
        }
    }
    $https = (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    setcookie(BANK_COOKIE, $token, ['expires' => $exp, 'path' => '/bank/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
}

function bank_sign_out(string $dir): void
{
    $token = (string)($_COOKIE[BANK_COOKIE] ?? '');
    if (preg_match('/^[0-9a-f]{64}$/', $token)) {
        @unlink($dir . '/sessions/s-' . hash('sha256', $token) . '.json');
    }
    setcookie(BANK_COOKIE, '', ['expires' => 1, 'path' => '/bank/', 'httponly' => true, 'samesite' => 'Strict']);
}

// Who is asking: 'owner' (signed in on the page), 'agent' (the weekly
// routine's token) or '' (nobody).
function bank_who(array $secrets, string $dir): string
{
    $sent = (string)($_SERVER['HTTP_X_BANK_TOKEN'] ?? '');
    if ($sent !== '' && $secrets['token'] !== '' && hash_equals($secrets['token'], $sent)) {
        return 'agent';
    }
    $token = (string)($_COOKIE[BANK_COOKIE] ?? '');
    if (preg_match('/^[0-9a-f]{64}$/', $token)) {
        $s = json_decode((string)@file_get_contents($dir . '/sessions/s-' . hash('sha256', $token) . '.json'), true);
        if (is_array($s) && (int)($s['exp'] ?? 0) >= time()) {
            return 'owner';
        }
    }
    return '';
}

// A change made from the page must come from the page: the site's own origin
// and a header no other site can add.
function bank_from_page(): bool
{
    if (($_SERVER['HTTP_X_BANK'] ?? '') !== '1') {
        return false;
    }
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') {
        return true;
    }
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $from = strtolower((string)(parse_url($origin, PHP_URL_HOST) ?? ''));
    $port = parse_url($origin, PHP_URL_PORT);
    if ($port !== null && $port !== false) {
        $from .= ':' . $port;
    }
    return $from !== '' && $from === $host;
}

// What a file is, by its own bytes. '' when it is not a kind the bank keeps.
function bank_sniff(string $path): string
{
    $head = (string)@file_get_contents($path, false, null, 0, 32);
    if (strncmp($head, "\x89PNG\r\n\x1a\n", 8) === 0) {
        return 'image/png';
    }
    if (strncmp($head, "\xFF\xD8\xFF", 3) === 0) {
        return 'image/jpeg';
    }
    if (strncmp($head, 'GIF87a', 6) === 0 || strncmp($head, 'GIF89a', 6) === 0) {
        return 'image/gif';
    }
    if (strncmp($head, 'RIFF', 4) === 0 && substr($head, 8, 4) === 'WEBP') {
        return 'image/webp';
    }
    if (substr($head, 4, 4) === 'ftyp' && in_array(substr($head, 8, 4), ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heif'], true)) {
        return 'image/heic';
    }
    if (strncmp($head, '%PDF-', 5) === 0) {
        return 'application/pdf';
    }
    $size = (int)@filesize($path);
    if ($size > 0 && $size <= 1024 * 1024) {
        $all = (string)@file_get_contents($path);
        if (strpos($all, "\0") === false && mb_check_encoding($all, 'UTF-8')) {
            return 'text/plain';
        }
    }
    return '';
}

// Reads the items, lets $fn change them, and writes them back, one change at
// a time. Returns what $fn returns.
function bank_edit(string $dir, callable $fn)
{
    $lock = @fopen($dir . '/lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        bank_out(500, ['ok' => false, 'error' => 'storage']);
    }
    try {
        $items = bank_items($dir);
        $before = $items;
        $r = $fn($items);
        if ($items !== $before) {
            $json = json_encode(array_values($items), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($json === false || @file_put_contents($dir . '/items.json.tmp', $json, LOCK_EX) === false || !@rename($dir . '/items.json.tmp', $dir . '/items.json')) {
                bank_out(500, ['ok' => false, 'error' => 'storage']);
            }
        }
        return $r;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function bank_items(string $dir): array
{
    $raw = @file_get_contents($dir . '/items.json');
    $items = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($items) ? array_values(array_filter($items, 'is_array')) : [];
}

function bank_stored_bytes(string $dir): int
{
    $n = 0;
    foreach ((array)glob($dir . '/files/*') as $f) {
        $n += (int)@filesize($f);
    }
    return $n;
}

// The uploads that came with this request, checked and moved into the bank.
// Returns their records, or answers and stops on one the bank will not keep.
function bank_take_files(string $dir): array
{
    $up = $_FILES['files'] ?? null;
    if (!is_array($up) || !is_array($up['tmp_name'] ?? null)) {
        return [];
    }
    $n = count($up['tmp_name']);
    if ($n > BANK_MAX_FILES) {
        bank_out(413, ['ok' => false, 'error' => 'too many files']);
    }
    $room = BANK_MAX_STORE - bank_stored_bytes($dir);
    $kept = [];
    $undo = static function () use (&$kept, $dir): void {
        foreach ($kept as $k) {
            @unlink($dir . '/files/' . $k['id'] . '.' . $k['ext']);
        }
    };
    for ($i = 0; $i < $n; $i++) {
        $err = (int)($up['error'][$i] ?? UPLOAD_ERR_NO_FILE);
        if ($err === UPLOAD_ERR_NO_FILE) {
            continue;
        }
        $tmp = (string)($up['tmp_name'][$i] ?? '');
        $size = (int)($up['size'][$i] ?? 0);
        if ($err !== UPLOAD_ERR_OK || !is_uploaded_file($tmp) || $size < 1 || $size > BANK_MAX_FILE) {
            $undo();
            bank_out(413, ['ok' => false, 'error' => 'file too large']);
        }
        $type = bank_sniff($tmp);
        if ($type === '') {
            $undo();
            bank_out(415, ['ok' => false, 'error' => 'file type']);
        }
        if ($size > $room) {
            $undo();
            bank_out(507, ['ok' => false, 'error' => 'bank full']);
        }
        $room -= $size;
        $id = bin2hex(random_bytes(12));
        $ext = BANK_EXT[$type];
        if (!@move_uploaded_file($tmp, $dir . '/files/' . $id . '.' . $ext)) {
            $undo();
            bank_out(500, ['ok' => false, 'error' => 'storage']);
        }
        @chmod($dir . '/files/' . $id . '.' . $ext, 0600);
        $name = bank_text(basename(str_replace('\\', '/', (string)($up['name'][$i] ?? ''))), 120);
        $kept[] = ['id' => $id, 'ext' => $ext, 'type' => $type, 'size' => $size, 'name' => $name !== '' ? $name : 'file.' . $ext];
    }
    return $kept;
}

// The fields either side may set on an item, cleaned. Only keys present in
// $in are returned.
function bank_fields(array $in): array
{
    $out = [];
    if (array_key_exists('text', $in)) {
        $out['text'] = bank_text($in['text'], BANK_TEXT, true);
    }
    if (array_key_exists('url', $in)) {
        $out['url'] = bank_url($in['url']);
    }
    if (array_key_exists('topic', $in)) {
        $t = bank_text($in['topic'], 20);
        $out['topic'] = in_array($t, BANK_TOPICS, true) ? $t : '';
    }
    if (array_key_exists('note', $in)) {
        $out['note'] = bank_text($in['note'], 1000, true);
    }
    if (array_key_exists('next', $in)) {
        $out['next'] = $in['next'] === true || $in['next'] === 1 || $in['next'] === '1' || $in['next'] === 'true';
    }
    if (array_key_exists('status', $in)) {
        $s = bank_text($in['status'], 20);
        if (in_array($s, BANK_STATUS, true)) {
            $out['status'] = $s;
        }
    }
    // what the routine found when it traced the item
    if (array_key_exists('found', $in)) {
        $f = is_array($in['found']) ? $in['found'] : [];
        $src = is_array($f['source'] ?? null) ? $f['source'] : [];
        $out['found'] = [
            'value' => bank_text($f['value'] ?? '', 14),
            'label' => bank_text($f['label'] ?? '', 150),
            'source' => [
                'name' => bank_text($src['name'] ?? '', 120),
                'year' => bank_text($src['year'] ?? '', 9),
                'finding' => bank_text($src['finding'] ?? '', 400),
                'sample' => bank_text($src['sample'] ?? '', 300),
                'url' => bank_url($src['url'] ?? ''),
            ],
            'note' => bank_text($f['note'] ?? '', 1000, true),
        ];
    }
    if (array_key_exists('post', $in)) {
        $p = bank_text($in['post'], 120);
        $out['post'] = preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $p) ? $p : '';
    }
    foreach (['scheduled_for', 'posted_on'] as $k) {
        if (array_key_exists($k, $in)) {
            $d = bank_text($in[$k], 10);
            $out[$k] = preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : '';
        }
    }
    return $out;
}

// Sends one stored file to someone signed in. The type is the one read from
// its bytes; nothing in it is allowed to run.
function bank_send_file(string $dir, string $fileId): void
{
    if (!preg_match('/^[0-9a-f]{24}$/', $fileId)) {
        bank_out(404, ['ok' => false, 'error' => 'not found']);
    }
    $meta = null;
    foreach (bank_items($dir) as $it) {
        foreach ((array)($it['files'] ?? []) as $f) {
            if (is_array($f) && ($f['id'] ?? '') === $fileId) {
                $meta = $f;
            }
        }
    }
    $ext = is_array($meta) ? (string)($meta['ext'] ?? '') : '';
    $type = array_search($ext, BANK_EXT, true);
    $path = $dir . '/files/' . $fileId . '.' . $ext;
    if ($meta === null || $type === false || !is_file($path)) {
        bank_out(404, ['ok' => false, 'error' => 'not found']);
    }
    $name = preg_replace('/[^A-Za-z0-9._ -]+/', '_', (string)($meta['name'] ?? 'file')) ?: 'file';
    header('Content-Type: ' . $type . ($type === 'text/plain' ? '; charset=utf-8' : ''));
    header('Content-Length: ' . (string)filesize($path));
    header('Content-Disposition: inline; filename="' . $name . '"');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
    header('Cache-Control: private, max-age=600');
    readfile($path);
    exit;
}
