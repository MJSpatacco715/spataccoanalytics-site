<?php
/*
 * The owner's own record of what goes into the Website Scorer.
 *
 * The owner, 2026-11-27: "the scorer should also keep a record for me and only
 * me to see what has gone into the mechanism. This should feed into the
 * Taccobox CRM in some fashion as well ... Though I absolutely want to maintain
 * getting an email when someone hits the button(s)".
 *
 * The scorer (tools/website-scorer/index.html) tells this file each thing a visitor
 * does with it, whether or not they ever leave a name:
 *   lookup   a firm's name was typed and looked up: the name, and the firms offered
 *   choose   one of those was chosen, or none of them
 *   score    a score finished: what was scored, how it was found, and the score
 *   failed   a score did not finish, and why
 * Each is one line of JSON in sa-leads/scorer-runs.jsonl, one level above the
 * web root where the web cannot read it. Lines that share a "run" are one visit
 * to the form. The name and email a visitor leaves afterwards are a lead
 * (score/lead.php), which carries the same run.
 *
 * Nothing here identifies a visitor: no address is written down, and what is
 * kept is what they typed into a public form about a firm.
 *
 * A finished score mails the owner a notice (asked which presses should:
 * "Each score + each unlock"), unless the visitor's details are already known,
 * when the lead's own notice follows at once and says the same and more.
 * Notices for scores stop at RUN_MAILS_PER_DAY in a day, everyone together, so
 * that nothing which finds this address can fill the owner's inbox; the record
 * is still kept. The record itself stops growing at RUN_MAX_BYTES.
 *
 * The record is read by score/feed.php, which only the owner's CRM can open.
 */
declare(strict_types=1);

require __DIR__ . '/../lib/leads.php';

const RUN_PER_HOUR = 40;         // one address: lookups, choices and scores together
const RUN_MAILS_PER_DAY = 60;    // score notices, everyone together
const RUN_MAX_BYTES = 20 * 1024 * 1024;   // the record itself: past this it keeps no more, and says nothing of it
const RUN_KINDS = ['lookup', 'choose', 'score', 'failed'];

$in = lead_request();

$kind = lead_text($in['kind'] ?? '', 12);
if (!in_array($kind, RUN_KINDS, true)) {
    lead_out(422, ['ok' => false, 'error' => 'kind']);
}
$run = strtolower(lead_text($in['run'] ?? '', 40));
if (!preg_match('/^[a-f0-9]{16,32}$/', $run)) {
    lead_out(422, ['ok' => false, 'error' => 'run']);
}
$whole = static fn($v): ?int => is_numeric($v) ? max(0, min(100, (int)$v)) : null;
$scope = lead_text($in['scope'] ?? '', 12);

$event = [
    'id' => bin2hex(random_bytes(8)),
    'at' => gmdate('c'),
    'kind' => $kind,
    'run' => $run,
    'typed' => lead_text($in['typed'] ?? '', 200),
    'scope' => in_array($scope, ['both', 'website', 'linkedin'], true) ? $scope : '',
];

if ($kind === 'lookup') {
    $offered = [];
    if (is_array($in['matches'] ?? null)) {
        foreach (array_slice(array_values($in['matches']), 0, 3) as $m) {
            if (!is_array($m)) {
                continue;
            }
            $site = lead_url($m['website'] ?? '');
            if ($site === '') {
                continue;
            }
            $offered[] = [
                'name' => lead_text($m['name'] ?? '', 160),
                'website' => $site,
                'place' => lead_text($m['place'] ?? '', 120),
                'confidence' => $whole($m['confidence'] ?? null),
            ];
        }
    }
    $outcome = lead_text($in['outcome'] ?? '', 12);
    $event['outcome'] = in_array($outcome, ['offered', 'none', 'failed'], true) ? $outcome : ($offered ? 'offered' : 'none');
    $event['matches'] = $offered;
} elseif ($kind === 'choose') {
    $event['chose'] = lead_text($in['chose'] ?? '', 8) === 'none' ? 'none' : 'match';
    $event['website'] = $event['chose'] === 'match' ? lead_url($in['website'] ?? '') : '';
    $event['name'] = lead_text($in['name'] ?? '', 160);
    $event['confidence'] = $whole($in['confidence'] ?? null);
} elseif ($kind === 'score') {
    $scores = [];
    if (is_array($in['scores'] ?? null)) {
        foreach (array_slice($in['scores'], 0, 12, true) as $k => $v) {
            if (is_string($k) && preg_match('/^[a-z_]{1,40}$/', $k) && is_numeric($v)) {
                $scores[$k] = max(0, min(100, (int)$v));
            }
        }
    }
    $event['website'] = lead_url($in['website'] ?? '');
    $event['linkedin'] = lead_url($in['linkedin'] ?? '');
    $event['found'] = lead_text($in['found'] ?? '', 8) === 'lookup' ? 'lookup' : 'typed';
    $event['firm_scored'] = lead_text($in['firm_scored'] ?? '', 160);
    $event['score'] = $whole($in['score'] ?? null);
    $event['score_max'] = $whole($in['score_max'] ?? null);
    $event['tier'] = lead_text($in['tier'] ?? '', 40);
    $event['held_from'] = lead_held($in['held_from'] ?? '');
    $event['flags'] = lead_flags($in['flags'] ?? null);
    $event['profile'] = lead_profile($in['profile'] ?? null);
    $event['scores'] = $scores;
    $event['known'] = ($in['known'] ?? false) === true;
} else {
    $event['website'] = lead_url($in['website'] ?? '');
    $event['why'] = lead_text($in['why'] ?? '', 200);
}
$event['utm_source'] = lead_text($in['utm_source'] ?? '', 60);
$event['utm_medium'] = lead_text($in['utm_medium'] ?? '', 60);
$event['utm_campaign'] = lead_text($in['utm_campaign'] ?? '', 60);

// Nothing that finds this address can fill the host's disk: a record this
// large has stopped being read by a person, and the visitor is told all is well.
$kept = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) . '/sa-leads/scorer-runs.jsonl';
if ((int)@filesize($kept) > RUN_MAX_BYTES) {
    lead_out(200, ['ok' => true]);
}
lead_keep('scorer-runs.jsonl', $event, 'runs', RUN_PER_HOUR);

// A finished score from someone not yet known: tell the owner, within the day's count.
if ($kind === 'score' && !$event['known']) {
    $dir = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) . '/sa-leads';
    $tally = $dir . '/run-mails-' . gmdate('Ymd') . '.txt';
    $sent = (int)@file_get_contents($tally);
    if ($sent < RUN_MAILS_PER_DAY) {
        @file_put_contents($tally, (string)($sent + 1), LOCK_EX);
        foreach ((array)glob($dir . '/run-mails-*.txt') as $old) {
            if ($old !== $tally) {
                @unlink($old);
            }
        }
        $score = $event['score'] === null ? 'no score' : $event['score'] . '/' . ($event['score_max'] ?? '?') . ' ' . $event['tier'];
        $scoreLine = lead_score_line($event['score'], $event['score_max'], $event['tier'], $event['held_from']);
        $what = $event['website'] !== '' ? $event['website'] : $event['linkedin'];
        $via = trim($event['utm_source'] . ' ' . $event['utm_medium']);
        lead_notice(
            'Website Scorer run: ' . ($event['firm_scored'] !== '' ? $event['firm_scored'] : $what) . ' (' . $score . ')',
            [
                'A score just finished. No name or email yet.',
                'If they unlock the full breakdown, a second notice follows with who they are.',
                '',
                'Scored:   ' . $what . ' (' . $event['scope'] . ')',
                'Firm:     ' . ($event['firm_scored'] !== '' ? $event['firm_scored'] : '(not named)'),
                ...lead_profile_lines($event['profile']),
                'Typed:    ' . ($event['typed'] !== '' ? $event['typed'] : '(the address itself)'),
                'Found by: ' . ($event['found'] === 'lookup' ? 'firm-name lookup, then chosen from the matches' : 'the address as typed'),
                'Score:    ' . $scoreLine,
                'Arrived:  ' . ($via !== '' ? $via : 'direct'),
                'When:     ' . $event['at'],
                'Run:      ' . $event['run'],
                '',
                'Category scores:',
                ...array_map(static fn(string $k, int $v): string => '  ' . $k . ': ' . $v, array_keys($event['scores']), $event['scores']),
                ...lead_flag_lines($event['flags'], $event['scores']),
                '',
                'Kept in sa-leads/scorer-runs.jsonl.',
            ],
            LEAD_NOTIFY
        );
    }
}

lead_out(200, ['ok' => true]);
