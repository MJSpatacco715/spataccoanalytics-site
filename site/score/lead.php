<?php
/*
 * Records a Website Scorer lead.
 *
 * The scorer (tools/website-scorer/index.html) shows the overall score, then asks
 * for a name and an email before it opens the full breakdown. That form posts
 * here. The lead goes to sa-leads/scorer.jsonl and a notice is mailed; the
 * checks and the storage are in lib/leads.php.
 */
declare(strict_types=1);

require __DIR__ . '/../lib/leads.php';

$in = lead_request();
$who = lead_person($in);

$scores = [];
if (is_array($in['scores'] ?? null)) {
    foreach (array_slice($in['scores'], 0, 12, true) as $k => $v) {
        if (is_string($k) && preg_match('/^[a-z_]{1,40}$/', $k) && is_numeric($v)) {
            $scores[$k] = max(0, min(100, (int)$v));
        }
    }
}
$scope = lead_text($in['scope'] ?? '', 12);
// which visit to the form this was: the scorer's own record of its runs
// (score/run.php) carries the same, so the two can be read together
$run = strtolower(lead_text($in['run'] ?? '', 40));
$lead = [
    'id' => bin2hex(random_bytes(8)),
    'run' => preg_match('/^[a-f0-9]{16,32}$/', $run) ? $run : '',
    'at' => $who['at'],
    'name' => $who['name'],
    'email' => $who['email'],
    'firm' => $who['firm'],
    'website' => lead_url($in['website'] ?? ''),
    'linkedin' => lead_url($in['linkedin'] ?? ''),
    'scope' => in_array($scope, ['both', 'website', 'linkedin'], true) ? $scope : '',
    'firm_scored' => lead_text($in['firm_scored'] ?? '', 160),
    'score' => is_numeric($in['score'] ?? null) ? max(0, min(100, (int)$in['score'])) : null,
    'score_max' => is_numeric($in['score_max'] ?? null) ? max(0, min(100, (int)$in['score_max'])) : null,
    'tier' => lead_text($in['tier'] ?? '', 40),
    'scores' => $scores,
    'utm_source' => $who['utm_source'],
    'utm_medium' => $who['utm_medium'],
    'utm_campaign' => $who['utm_campaign'],
];
lead_keep('scorer.jsonl', $lead);

$score = $lead['score'] === null ? 'no score' : $lead['score'] . '/' . ($lead['score_max'] ?? '?') . ' ' . $lead['tier'];
$via = trim($lead['utm_source'] . ' ' . $lead['utm_medium']);
lead_notice(
    'Website Scorer lead: ' . ($lead['firm'] !== '' ? $lead['firm'] : $lead['name']) . ' (' . $score . ')',
    [
        'Name:     ' . $lead['name'],
        'Email:    ' . $lead['email'],
        'Firm:     ' . ($lead['firm'] !== '' ? $lead['firm'] : '(not given)'),
        'Scored:   ' . ($lead['website'] !== '' ? $lead['website'] : $lead['linkedin']) . ' (' . $lead['scope'] . ')',
        'Score:    ' . $score,
        'Arrived:  ' . ($via !== '' ? $via : 'direct'),
        'When:     ' . $lead['at'],
        '',
        'Category scores:',
        ...array_map(static fn(string $k, int $v): string => '  ' . $k . ': ' . $v, array_keys($scores), $scores),
        '',
        'Every lead is also kept on the host in sa-leads/scorer.jsonl.',
    ],
    $lead['email']
);

lead_out(200, ['ok' => true]);
