<?php
/*
 * Gives project pricing on the services page, in two ways.
 *
 * Project prices are not in the page or in this repository: they are in
 * sa-pricing.json, one level above the web root, written by the Publish
 * workflow from a repository secret.
 *
 * 1. One free look. A post of {"unveil": "design.professional"} gives that one
 *    price, with no name or email. The owner, 2026-11-26: "each visitor gets
 *    one unveil (click to unveil) and then the second click brings about a
 *    contact form". A cookie remembers which price this browser saw, and a
 *    different one is refused (the answer names the one already seen, so the
 *    page can show it again). Each address may see two different prices a
 *    day, so a shared office connection does not shut out a second person.
 *    This is a soft limit: a visitor who clears the cookie on another
 *    connection can look again. It keeps a script from reading every price.
 *
 * 2. The request. A name and an email, with the services the visitor ticked
 *    (items), the one they saw first (unveiled) and their plan (picks). The
 *    lead is kept in sa-leads/pricing.jsonl, a notice listing the services is
 *    mailed, and only then is every project price sent back.
 *
 * If the prices are not there or do not read as expected, a look gives
 * nothing and counts for nothing, a request is still kept, and the page says
 * pricing will follow by email.
 */
declare(strict_types=1);

require __DIR__ . '/../lib/leads.php';

// service => the tiers that carry a price
const PRICED = [
    'audit' => ['professional', 'complete'],
    'design' => ['essential', 'professional', 'complete'],
    'crm' => ['essential', 'professional', 'complete'],
];
const TIERS = ['essential', 'professional', 'complete'];
const HOSTING = ['hosted', 'managed', 'plus'];
// what each priced item is called on the page, for the notice
const ITEM_NAMES = [
    'audit.professional' => 'Website & AI Audit: Audit Report',
    'audit.complete' => 'Website & AI Audit: Practice Audit',
    'design.essential' => 'Website Design: Refresh',
    'design.professional' => 'Website Design: Redesign',
    'design.complete' => 'Website Design: Rebuild',
    'crm.essential' => 'CRM Diagnostic & Repair: Diagnostic',
    'crm.professional' => 'CRM Diagnostic & Repair: Repair',
    'crm.complete' => 'CRM Diagnostic & Repair: Rebuild or Migration',
];
const UNVEIL_COOKIE = 'sa_unveil';
const UNVEIL_DAYS = 30;
const UNVEIL_PER_DAY = 2;

// "design.professional" when it names a priced item, else ''
function pricing_item($v): string
{
    $s = lead_text($v, 24);
    return isset(ITEM_NAMES[$s]) ? $s : '';
}

// Every project price in whole dollars, or null when the file is missing or
// wrong in any way.
function pricing_load(): ?array
{
    $home = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__));
    $stored = json_decode((string)@file_get_contents($home . '/sa-pricing.json'), true);
    $prices = [];
    foreach (PRICED as $service => $tiers) {
        foreach ($tiers as $tier) {
            $v = is_array($stored) && is_array($stored[$service] ?? null) ? ($stored[$service][$tier] ?? null) : null;
            if (!is_int($v) || $v < 1 || $v > 1000000) {
                return null;
            }
            $prices[$service][$tier] = $v;
        }
    }
    return $prices;
}

function pricing_of(array $prices, string $item): int
{
    [$service, $tier] = explode('.', $item, 2);
    return $prices[$service][$tier];
}

// The one free look. Answers and stops.
function pricing_unveil(array $in): void
{
    $item = pricing_item($in['unveil'] ?? '');
    if ($item === '') {
        lead_out(422, ['ok' => false, 'error' => 'item']);
    }
    $prices = pricing_load();
    if ($prices === null) {
        // nothing to show, so nothing is counted or remembered
        lead_out(200, ['ok' => true, 'item' => $item, 'price' => null]);
    }

    // This browser has seen a different price: say which, and give it again.
    $held = pricing_item($_COOKIE[UNVEIL_COOKIE] ?? '');
    if ($held !== '' && $held !== $item) {
        lead_out(403, ['ok' => false, 'error' => 'used', 'item' => $held, 'price' => pricing_of($prices, $held)]);
    }

    // The different prices this address has seen in the last day, in one
    // small file named by a hash, so no address is written down.
    $home = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__));
    $dir = $home . '/sa-leads';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        lead_out(500, ['ok' => false, 'error' => 'storage']);
    }
    // The site is behind Cloudflare, so the host may see Cloudflare's address
    // for everyone; Cloudflare passes the visitor's own. A forged header only
    // buys what clearing the cookie does: one more look.
    $ip = (string)($_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '');
    $gate = $dir . '/unveil-' . substr(hash('sha256', $ip), 0, 24) . '.txt';
    $now = time();
    $seen = [];
    foreach ((array)@file($gate, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $row) {
        $parts = explode(' ', (string)$row, 2);
        $at = (int)$parts[0];
        $was = pricing_item($parts[1] ?? '');
        if ($at > $now - 86400 && $was !== '') {
            $seen[$was] = $at;
        }
    }
    if (!isset($seen[$item]) && count($seen) >= UNVEIL_PER_DAY) {
        lead_out(429, ['ok' => false, 'error' => 'used']);
    }
    $seen[$item] = $seen[$item] ?? $now;
    $rows = [];
    foreach ($seen as $was => $at) {
        $rows[] = $at . ' ' . $was;
    }
    @file_put_contents($gate, implode("\n", $rows) . "\n", LOCK_EX);

    $https = (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    setcookie(UNVEIL_COOKIE, $item, [
        'expires' => $now + UNVEIL_DAYS * 86400,
        'path' => '/services/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    lead_out(200, ['ok' => true, 'item' => $item, 'price' => pricing_of($prices, $item)]);
}

$in = lead_request();
if (array_key_exists('unveil', $in)) {
    pricing_unveil($in);
}
$who = lead_person($in);

// what the visitor had picked in the plan when they asked, for the follow-up
$picks = [];
if (is_array($in['picks'] ?? null)) {
    foreach (['audit', 'design', 'crm'] as $s) {
        $t = lead_text($in['picks'][$s] ?? '', 16);
        if (in_array($t, TIERS, true)) {
            $picks[$s] = $t;
        }
    }
    $h = lead_text($in['picks']['hosting'] ?? '', 16);
    if (in_array($h, HOSTING, true)) {
        $picks['hosting'] = $h;
    }
}
// the services they ticked on the form, and the one they saw first
$asked = [];
if (is_array($in['items'] ?? null)) {
    foreach (array_slice(array_values($in['items']), 0, count(ITEM_NAMES)) as $v) {
        $v = pricing_item($v);
        if ($v !== '' && !in_array($v, $asked, true)) {
            $asked[] = $v;
        }
    }
}
$unveiled = pricing_item($in['unveiled'] ?? '');
$lead = $who + [
    'asked' => $asked,
    'unveiled' => $unveiled,
    'picks' => $picks,
    'known_from' => lead_text($in['known_from'] ?? '', 20) === 'scorer' ? 'scorer' : '',
];
lead_keep('pricing.jsonl', $lead);

$named = static fn(string $item): string => ITEM_NAMES[$item];
$via = trim($lead['utm_source'] . ' ' . $lead['utm_medium']);
lead_notice(
    'Pricing request: ' . ($lead['firm'] !== '' ? $lead['firm'] : $lead['name']),
    array_merge(
        [
            'Name:     ' . $lead['name'],
            'Email:    ' . $lead['email'],
            'Firm:     ' . ($lead['firm'] !== '' ? $lead['firm'] : '(not given)'),
            'Asked about:',
        ],
        $asked ? array_map(static fn(string $i): string => '  - ' . $named($i), $asked) : ['  (nothing ticked)'],
        [
            'Saw first: ' . ($unveiled !== '' ? $named($unveiled) . ' (the free look)' : 'nothing'),
            'Plan:     ' . ($picks ? implode(', ', array_map(static fn(string $k, string $v): string => $k . ' ' . $v, array_keys($picks), $picks)) : 'nothing yet'),
            'Arrived:  ' . ($via !== '' ? $via : 'direct') . ($lead['known_from'] !== '' ? ' (already known from the scorer)' : ''),
            'When:     ' . $lead['at'],
            '',
            'Every pricing request is also kept on the host in sa-leads/pricing.jsonl.',
        ]
    ),
    $lead['email']
);

lead_out(200, ['ok' => true, 'prices' => pricing_load()]);
