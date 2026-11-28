<?php
/* A press on the card page: one line kept (lib/qr.php). POST only; answers 204 whatever happened, so a press is never held up. */
declare(strict_types=1);
require dirname(__DIR__) . '/lib/qr.php';
qr_no_store();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    exit;
}
$in = json_decode((string)file_get_contents('php://input', false, null, 0, 600), true);
$event = is_array($in) && is_string($in['event'] ?? null) ? $in['event'] : '';
if ($event !== 'scan' && in_array($event, QR_EVENTS, true)) {     // a scan is the page's own to count
    qr_keep($event, qr_source(is_array($in) ? ($in['source'] ?? null) : null));
}
http_response_code(204);
