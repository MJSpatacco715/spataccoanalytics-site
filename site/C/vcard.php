<?php
/* The contact card the page's "Save Contact" hands over, at /C/mike.vcf (site/.htaccess). */
declare(strict_types=1);
header('Content-Type: text/vcard; charset=utf-8');
header('Content-Disposition: attachment; filename="mike.vcf"');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Robots-Tag: noindex, nofollow');
/* The picture a phone shows beside his name and his texts (the owner, 2026-11-28, of the grey building an iPhone
   drew for a contact with none: "how can i make my logo show up ... as the default contact pic"). It is in the card
   itself, base64, folded at 75 characters as a vCard asks. */
$photo = '';
$jpg = @file_get_contents(__DIR__ . '/contact-photo.jpg');
if ($jpg !== false && $jpg !== '') {
    $line = 'PHOTO;ENCODING=b;TYPE=JPEG:' . base64_encode($jpg);
    $photo = substr($line, 0, 75);
    for ($i = 75; $i < strlen($line); $i += 74) {
        $photo .= "\r\n " . substr($line, $i, 74);
    }
}
echo implode("\r\n", array_filter([
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Spatacco;Michael;J.;;',
    'FN:Michael J. Spatacco',
    'ORG:Spatacco Analytics LLC',
    'TITLE:Founder & CEO',
    'TEL;TYPE=WORK,VOICE:+14842781697',
    'EMAIL;TYPE=WORK:Mike@SpataccoAnalytics.com',
    'URL:https://SpataccoAnalytics.com',
    'ADR;TYPE=WORK:;;;Bala Cynwyd;PA;;US',
    $photo,
    'END:VCARD',
], static fn ($l) => $l !== '')) . "\r\n";
