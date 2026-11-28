<?php
/* The contact card the page's "Save Contact" hands over, at /C/mike.vcf (site/.htaccess). */
declare(strict_types=1);
header('Content-Type: text/vcard; charset=utf-8');
header('Content-Disposition: attachment; filename="mike.vcf"');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Robots-Tag: noindex, nofollow');
echo implode("\r\n", [
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
    'END:VCARD',
]) . "\r\n";
