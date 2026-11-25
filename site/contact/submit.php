<?php
/*
 * Records a message from the contact form (contact/index.html).
 *
 * The form posts its answers here as JSON. The message goes to
 * sa-leads/contact.jsonl and a notice is mailed; the checks and the storage
 * are in lib/leads.php, the same ones the Website Scorer's gate uses. The
 * form shows its thank-you only when this answers ok, so a message that was
 * not kept is never thanked for.
 */
declare(strict_types=1);

require __DIR__ . '/../lib/leads.php';

$in = lead_request();
$who = lead_person($in);

// A walkthrough link on the tools page names one of these builds.
$about = lead_text($in['about'] ?? '', 12);
$lead = [
    'at' => $who['at'],
    'name' => $who['name'],
    'email' => $who['email'],
    'firm' => $who['firm'],
    'phone' => lead_text($in['phone'] ?? '', 40),
    'role' => lead_text($in['role'] ?? '', 80),
    'data_location' => lead_text($in['dataLocation'] ?? '', 300),
    'crm' => lead_text($in['crm'] ?? '', 80),
    'pain_points' => lead_text($in['painPoints'] ?? '', 400),
    'firm_size' => lead_text($in['firmSize'] ?? '', 40),
    'about' => in_array($about, ['crm', 'league', 'golf'], true) ? $about : '',
    'notes' => lead_text($in['notes'] ?? '', 2000),
    'utm_source' => $who['utm_source'],
    'utm_medium' => $who['utm_medium'],
    'utm_campaign' => $who['utm_campaign'],
];
lead_keep('contact.jsonl', $lead);

$given = static fn(string $v): string => $v !== '' ? $v : '(not given)';
$via = trim($lead['utm_source'] . ' ' . $lead['utm_medium']);
lead_notice(
    'Contact form: ' . ($lead['firm'] !== '' ? $lead['firm'] : $lead['name']),
    [
        'Name:      ' . $lead['name'],
        'Email:     ' . $lead['email'],
        'Phone:     ' . $given($lead['phone']),
        'Firm:      ' . $given($lead['firm']),
        'Role:      ' . $given($lead['role']),
        'Firm size: ' . $given($lead['firm_size']),
        'Data in:   ' . $given($lead['data_location']),
        'CRM:       ' . $given($lead['crm']),
        'Pain:      ' . $given($lead['pain_points']),
        'Asked for: ' . ($lead['about'] !== '' ? 'a walkthrough (' . $lead['about'] . ')' : 'a conversation'),
        'Arrived:   ' . ($via !== '' ? $via : 'direct'),
        'When:      ' . $lead['at'],
        '',
        'Notes:',
        $given($lead['notes']),
        '',
        'Every message is also kept on the host in sa-leads/contact.jsonl.',
    ],
    $lead['email']
);

lead_out(200, ['ok' => true]);
