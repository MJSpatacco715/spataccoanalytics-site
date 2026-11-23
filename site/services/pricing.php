<?php
/*
 * Gives project pricing to a visitor who has left a name and an email.
 *
 * The services page shows what each service is and how long it takes, and
 * the hosting plans with their prices. Project prices are not in the page or
 * in this repository: they are in sa-pricing.json, one level above the web
 * root, written by the Publish workflow from a repository secret. The page's
 * form posts here; the lead is kept in sa-leads/pricing.jsonl, a notice is
 * mailed, and only then are the prices sent back.
 *
 * If the prices are not there or do not read as expected, the lead is still
 * kept and the answer says so, and the page tells the visitor that pricing
 * will follow by email.
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

$in = lead_request();
$who = lead_person($in);

// what the visitor had picked when they asked, for the follow-up
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
$lead = $who + ['picks' => $picks, 'known_from' => lead_text($in['known_from'] ?? '', 20) === 'scorer' ? 'scorer' : ''];
lead_keep('pricing.jsonl', $lead);

$via = trim($lead['utm_source'] . ' ' . $lead['utm_medium']);
lead_notice(
    'Pricing request: ' . ($lead['firm'] !== '' ? $lead['firm'] : $lead['name']),
    [
        'Name:     ' . $lead['name'],
        'Email:    ' . $lead['email'],
        'Firm:     ' . ($lead['firm'] !== '' ? $lead['firm'] : '(not given)'),
        'Picked:   ' . ($picks ? implode(', ', array_map(static fn(string $k, string $v): string => $k . ' ' . $v, array_keys($picks), $picks)) : 'nothing yet'),
        'Arrived:  ' . ($via !== '' ? $via : 'direct') . ($lead['known_from'] !== '' ? ' (already known from the scorer)' : ''),
        'When:     ' . $lead['at'],
        '',
        'Every pricing request is also kept on the host in sa-leads/pricing.jsonl.',
    ],
    $lead['email']
);

// The prices: whole dollars for exactly the priced tiers, or nothing.
$home = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__));
$stored = json_decode((string)@file_get_contents($home . '/sa-pricing.json'), true);
$prices = [];
foreach (PRICED as $service => $tiers) {
    foreach ($tiers as $tier) {
        $v = is_array($stored) ? ($stored[$service][$tier] ?? null) : null;
        if (!is_int($v) || $v < 1 || $v > 1000000) {
            lead_out(200, ['ok' => true, 'prices' => null]);
        }
        $prices[$service][$tier] = $v;
    }
}
lead_out(200, ['ok' => true, 'prices' => $prices]);
