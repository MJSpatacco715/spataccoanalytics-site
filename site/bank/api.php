<?php
/*
 * The stat bank's one endpoint. The page (bank/index.html) and the weekly
 * routine both talk to it; what each may do is decided here.
 *
 *   ?a=status                    is the bank set up, and is this caller signed in
 *   ?a=login    POST {password}  the owner signs in on the page
 *   ?a=logout   POST
 *   ?a=list                      every item, newest first
 *   ?a=add      POST             a new item: form fields text, url, topic, files[]
 *                                (or JSON without files); the routine may add by and ref
 *   ?a=update   POST {id, ...}   change an item (lib/bank.php bank_fields)
 *   ?a=delete   POST {id}        the owner only
 *   ?a=file&id=                  one stored upload
 *
 * Nobody but the owner (signed in on the page) and the routine (its token)
 * gets past status and login. A change from the page must carry the page's
 * own header and origin.
 */
declare(strict_types=1);

require __DIR__ . '/../lib/bank.php';

$a = (string)($_GET['a'] ?? '');
$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');

$secrets = bank_secrets();
if ($secrets === null) {
    bank_out($a === 'status' ? 200 : 503, ['ok' => $a === 'status', 'setup' => false, 'signed_in' => false, 'error' => 'not set up']);
}
$dir = bank_dir();
$who = bank_who($secrets, $dir);

if ($a === 'status') {
    bank_out(200, ['ok' => true, 'setup' => true, 'signed_in' => $who !== '']);
}

// the body of a JSON post, or [] for a form post
$json = static function (): array {
    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
        return [];
    }
    $raw = (string)file_get_contents('php://input', false, null, 0, 65537);
    if (strlen($raw) > 65536) {
        bank_out(413, ['ok' => false, 'error' => 'too large']);
    }
    $in = json_decode($raw, true);
    if (!is_array($in)) {
        bank_out(400, ['ok' => false, 'error' => 'not JSON']);
    }
    return $in;
};

if ($a === 'login') {
    if ($method !== 'POST' || !bank_from_page()) {
        bank_out(403, ['ok' => false, 'error' => 'not from the page']);
    }
    if (!bank_may_try($dir)) {
        bank_out(429, ['ok' => false, 'error' => 'slow down']);
    }
    $in = $json();
    $given = is_string($in['password'] ?? null) ? $in['password'] : '';
    if ($given === '' || !hash_equals($secrets['password'], $given)) {
        usleep(400000);
        bank_out(401, ['ok' => false, 'error' => 'wrong password']);
    }
    bank_sign_in($dir);
    bank_out(200, ['ok' => true]);
}

if ($who === '') {
    bank_out(401, ['ok' => false, 'error' => 'sign in']);
}
$change = in_array($a, ['logout', 'add', 'update', 'delete'], true);
if ($change) {
    if ($method !== 'POST') {
        header('Allow: POST');
        bank_out(405, ['ok' => false, 'error' => 'POST only']);
    }
    if ($who === 'owner' && !bank_from_page()) {
        bank_out(403, ['ok' => false, 'error' => 'not from the page']);
    }
}

if ($a === 'logout') {
    bank_sign_out($dir);
    bank_out(200, ['ok' => true]);
}

if ($a === 'list') {
    $items = array_reverse(bank_items($dir));
    bank_out(200, ['ok' => true, 'items' => $items, 'count' => count($items), 'limit' => BANK_MAX_ITEMS]);
}

if ($a === 'file') {
    bank_send_file($dir, (string)($_GET['id'] ?? ''));
}

if ($a === 'add') {
    $in = $json();
    if ($in === []) {
        $in = $_POST;
    }
    $f = bank_fields(['text' => $in['text'] ?? '', 'url' => $in['url'] ?? '', 'topic' => $in['topic'] ?? '']);
    // a link pasted alone into the text box is the link
    if ($f['url'] === '' && bank_url($f['text']) !== '') {
        $f['url'] = bank_url($f['text']);
        $f['text'] = '';
    }
    $by = 'page';
    $ref = '';
    if ($who === 'agent') {
        $by = in_array(($in['by'] ?? ''), ['email', 'chat'], true) ? (string)$in['by'] : 'routine';
        $ref = bank_text($in['ref'] ?? '', 200);
        if ($ref !== '') {
            foreach (bank_items($dir) as $it) {       // the same email is banked once
                if (($it['ref'] ?? '') === $ref) {
                    bank_out(200, ['ok' => true, 'item' => $it, 'already' => true]);
                }
            }
        }
    }
    if (count(bank_items($dir)) >= BANK_MAX_ITEMS) {
        bank_out(507, ['ok' => false, 'error' => 'bank full']);
    }
    $files = bank_take_files($dir);
    if ($f['text'] === '' && $f['url'] === '' && $files === []) {
        bank_out(422, ['ok' => false, 'error' => 'nothing to keep']);
    }
    $item = [
        'id' => bin2hex(random_bytes(6)),
        'at' => gmdate('c'),
        'by' => $by,
        'text' => $f['text'],
        'url' => $f['url'],
        'topic' => $f['topic'],
        'files' => $files,
        'status' => 'new',
        'next' => false,
    ];
    if ($ref !== '') {
        $item['ref'] = $ref;
    }
    bank_edit($dir, static function (array &$items) use ($item): void {
        $items[] = $item;
    });
    bank_out(200, ['ok' => true, 'item' => $item]);
}

if ($a === 'update' || $a === 'delete') {
    $in = $json();
    $id = bank_text($in['id'] ?? '', 12);
    if (!preg_match('/^[0-9a-f]{12}$/', $id)) {
        bank_out(422, ['ok' => false, 'error' => 'id']);
    }
    if ($a === 'delete') {
        if ($who !== 'owner') {
            bank_out(403, ['ok' => false, 'error' => 'the owner deletes']);
        }
        $gone = bank_edit($dir, static function (array &$items) use ($id, $dir): bool {
            foreach ($items as $i => $it) {
                if (($it['id'] ?? '') === $id) {
                    foreach ((array)($it['files'] ?? []) as $f) {
                        if (is_array($f) && preg_match('/^[0-9a-f]{24}$/', (string)($f['id'] ?? '')) && in_array(($f['ext'] ?? ''), BANK_EXT, true)) {
                            @unlink($dir . '/files/' . $f['id'] . '.' . $f['ext']);
                        }
                    }
                    unset($items[$i]);
                    $items = array_values($items);
                    return true;
                }
            }
            return false;
        });
        bank_out($gone ? 200 : 404, ['ok' => $gone]);
    }
    $set = bank_fields($in);
    if ($who === 'owner') {
        // the owner files and steers; what was found, and where an item is in
        // the week's run, is the routine's to record
        unset($set['found'], $set['post'], $set['scheduled_for'], $set['posted_on']);
        if (isset($set['status']) && !in_array($set['status'], ['new', 'skipped'], true)) {
            unset($set['status']);
        }
    }
    if ($set === []) {
        bank_out(422, ['ok' => false, 'error' => 'nothing to change']);
    }
    $item = bank_edit($dir, static function (array &$items) use ($id, $set): ?array {
        foreach ($items as $i => $it) {
            if (($it['id'] ?? '') === $id) {
                if (($set['next'] ?? false) === true) {       // one item is next
                    foreach ($items as $j => $other) {
                        $items[$j]['next'] = false;
                    }
                }
                $items[$i] = array_merge($items[$i], $set, ['changed' => gmdate('c')]);
                return $items[$i];
            }
        }
        return null;
    });
    if ($item === null) {
        bank_out(404, ['ok' => false, 'error' => 'not found']);
    }
    bank_out(200, ['ok' => true, 'item' => $item]);
}

bank_out(404, ['ok' => false, 'error' => 'unknown']);
