<?php
/*
 * What the site's forms share: the Website Scorer's gate (score/lead.php),
 * the pricing request on the services page (services/pricing.php) and the
 * contact form (contact/submit.php).
 *
 * A lead is one line of JSON appended to a file in sa-leads/, one level above
 * the web root where the web cannot read it, and a short notice mailed to
 * LEAD_NOTIFY. The file is the record; the mail is a convenience, and a mail
 * that fails does not fail the request.
 *
 * Only a same-site JSON POST with a name and a valid email is kept. Every
 * field is cut to a length and stripped of control characters, so nothing a
 * visitor types can reach a mail header or break the one-lead-per-line shape.
 * One address can leave ten leads an hour across all of them.
 *
 * Opened directly, this file does nothing: it only defines functions.
 */
declare(strict_types=1);

const LEAD_NOTIFY = 'mike@spataccoanalytics.com';
const LEAD_FROM = 'mike@spataccoanalytics.com';
// The envelope sender handed to the host with -f. Empty leaves it to the host.
const LEAD_ENVELOPE = '';
const LEAD_MAX_BYTES = 8192;
const LEAD_PER_HOUR = 10;

function lead_out(int $code, array $body): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    echo json_encode($body);
    exit;
}

// one line of plain text, at most $max characters
function lead_text($v, int $max): string
{
    if (!is_string($v) && !is_int($v) && !is_float($v)) {
        return '';
    }
    $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$v);
    if ($s === null) {
        return '';
    }
    return mb_substr(trim($s), 0, $max);
}

function lead_url($v): string
{
    $s = lead_text($v, 300);
    // "www.firm.com" is the same address as "https://www.firm.com".
    if (!preg_match('#^https?://#i', $s) && preg_match('#^([a-z0-9-]+\.)+[a-z0-9-]{2,}(/[^\s<>"\']*)?$#i', $s)) {
        $s = 'https://' . $s;
    }
    return preg_match('#^https?://[^\s<>"\']+$#i', $s) ? $s : '';
}

// The request, checked: a same-site JSON POST from a person. Returns the
// decoded body, or answers and stops.
function lead_request(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        lead_out(405, ['ok' => false, 'error' => 'POST only']);
    }
    // Same site only: a browser sends Origin on a cross-site POST.
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin !== '') {
        $from = strtolower((string)(parse_url($origin, PHP_URL_HOST) ?? ''));
        $port = parse_url($origin, PHP_URL_PORT);
        if ($port !== null && $port !== false) {
            $from .= ':' . $port;
        }
        if ($from === '' || $from !== $host) {
            lead_out(403, ['ok' => false, 'error' => 'wrong origin']);
        }
    }
    $raw = (string)file_get_contents('php://input', false, null, 0, LEAD_MAX_BYTES + 1);
    if (strlen($raw) > LEAD_MAX_BYTES) {
        lead_out(413, ['ok' => false, 'error' => 'too large']);
    }
    $in = json_decode($raw, true);
    if (!is_array($in)) {
        lead_out(400, ['ok' => false, 'error' => 'not JSON']);
    }
    // A field people never see. Whatever fills it in is not a person; it is
    // told all is well and nothing is kept or given.
    if (lead_text($in['company'] ?? '', 200) !== '') {
        lead_out(200, ['ok' => true]);
    }
    return $in;
}

// Who is asking: name, email, firm and how they arrived. Answers and stops
// on a missing name or a bad email.
function lead_person(array $in): array
{
    $email = lead_text($in['email'] ?? '', 254);
    if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        lead_out(422, ['ok' => false, 'error' => 'email']);
    }
    $name = lead_text($in['name'] ?? '', 120);
    if ($name === '') {
        lead_out(422, ['ok' => false, 'error' => 'name']);
    }
    return [
        'at' => gmdate('c'),
        'name' => $name,
        'email' => $email,
        'firm' => lead_text($in['firm'] ?? '', 160),
        'utm_source' => lead_text($in['utm_source'] ?? '', 60),
        'utm_medium' => lead_text($in['utm_medium'] ?? '', 60),
        'utm_campaign' => lead_text($in['utm_campaign'] ?? '', 60),
    ];
}

// Appends the lead to sa-leads/$file. Answers and stops when the address has
// left ten this hour or the file cannot be written.
function lead_keep(string $file, array $lead): void
{
    $home = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__));
    $dir = $home . '/sa-leads';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        lead_out(500, ['ok' => false, 'error' => 'storage']);
    }
    // The times of this address's recent leads, in one small file named by a
    // hash, so no address is written down beside the leads.
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $gate = $dir . '/rate-' . substr(hash('sha256', $ip), 0, 24) . '.txt';
    $now = time();
    $seen = array_values(array_filter(
        array_map('intval', (array)@file($gate, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)),
        static fn(int $t): bool => $t > $now - 3600
    ));
    if (count($seen) >= LEAD_PER_HOUR) {
        lead_out(429, ['ok' => false, 'error' => 'slow down']);
    }
    $seen[] = $now;
    @file_put_contents($gate, implode("\n", $seen) . "\n", LOCK_EX);

    $line = json_encode($lead, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($line === false || @file_put_contents($dir . '/' . $file, $line . "\n", FILE_APPEND | LOCK_EX) === false) {
        lead_out(500, ['ok' => false, 'error' => 'storage']);
    }
}

// The notice. Every value is already one line, and the reply address has
// passed validation, so none of it can add a header.
//
// How it has to be sent, learned the hard way (2026-11-25). The domain's mail
// lives at Microsoft 365, and two of its rules decide whether a notice from
// this web host arrives:
//   1. Microsoft refuses outright ("550 5.7.68 Direct Send not allowed") any
//      outside mail whose ENVELOPE sender is at the firm's own domain. So the
//      envelope sender is left to the host (LEAD_ENVELOPE empty): never pass
//      -f with an address at the firm's domain.
//   2. The domain's DMARC policy quarantines mail whose From claims the domain
//      without proof. The proof is the host's DKIM signature, whose key is
//      published in the domain's DNS as default._domainkey.
function lead_notice(string $subject, array $lines, string $replyTo): void
{
    if (getenv('SA_LEADS_NO_MAIL') === '1') {
        return;
    }
    $headers = implode("\r\n", [
        'From: Spatacco Analytics Website <' . LEAD_FROM . '>',
        'Reply-To: ' . $replyTo,
        'Content-Type: text/plain; charset=utf-8',
    ]);
    $to = LEAD_NOTIFY;
    $subject = mb_encode_mimeheader($subject, 'UTF-8');
    $body = implode("\n", $lines);
    if (LEAD_ENVELOPE !== '') {
        @mail($to, $subject, $body, $headers, '-f' . LEAD_ENVELOPE);
    } else {
        @mail($to, $subject, $body, $headers);
    }
}
