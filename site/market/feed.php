<?php
/*
 * The market strip's feed (js/ticker.js reads it; lib/market.php does the work).
 *
 *   GET /market/feed.php   the figures to show, each with its source card
 *
 * It takes nothing from the visitor: no parameter, no body, no cookie. The
 * answer is the same for everyone, so it may be kept for a minute. The answer
 * goes out first; a source that is slow to give its figures is asked after.
 */
declare(strict_types=1);

ini_set('display_errors', '0');
require __DIR__ . '/../lib/market.php';

$method = (string)($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method !== 'GET' && $method !== 'HEAD') {
    header('Allow: GET, HEAD');
    market_out(405, ['ok' => false, 'error' => 'GET only']);
}
ignore_user_abort(true);
@set_time_limit(170);
try {
    $out = market_snapshot();
} catch (Throwable $e) {
    $out = ['ok' => false, 'items' => []];
}
market_send(200, $out, $out['ok'] ? 60 : 0);

// The visitor has his answer. Now the sources that are slow to give theirs.
try {
    market_after();
} catch (Throwable $e) {
    // the next visitor's request tries again
}
