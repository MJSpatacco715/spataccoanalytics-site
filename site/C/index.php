<?php
/*
 * The page the business card's QR code opens. One screen on a phone, no site menu: connect, save the contact, write,
 * score a website. It counts the scan, then draws. Every press is counted by C/log.php before it goes anywhere.
 * The owner's brief, 2026-11-27. Never cached: a scan that does not reach this file is not counted.
 */
declare(strict_types=1);
require dirname(__DIR__) . '/lib/qr.php';
qr_no_store();
$source = qr_source($_GET['s'] ?? null);
qr_keep('scan', $source);
$src = htmlspecialchars($source, ENT_QUOTES, 'UTF-8');
// A booking page, when the owner has one (Microsoft Bookings): then the third button opens to Book a Call and Email Me.
const QR_BOOKING_URL = '';
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Michael J. Spatacco | Spatacco Analytics</title>
<link rel="icon" type="image/x-icon" href="/favicon.ico?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--navy:#0F1B2D;--cyan:#3DD8D8}
body{font-family:'DM Sans',sans-serif;color:var(--navy);background:#FFFFFF;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column;align-items:center}
main{width:100%;max-width:26rem;padding:2rem 1.25rem 1rem;display:flex;flex-direction:column;align-items:center;flex:1}
.mark{width:4rem;height:4rem;border-radius:0.75rem}
h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:2rem;line-height:1.15;margin-top:1rem;text-align:center}
.role{font-size:1rem;margin-top:0.375rem;text-align:center}
.firm{font-size:0.9375rem;letter-spacing:0.125rem;text-transform:uppercase;font-weight:600;color:#00707E;margin-top:0.25rem;text-align:center}
.acts{width:100%;margin-top:1.75rem;display:grid;gap:0.75rem}
.act{display:flex;align-items:center;justify-content:center;width:100%;min-height:3.25rem;padding:0.75rem 1rem;font:inherit;font-size:1.0625rem;font-weight:600;color:var(--navy);background:#FFFFFF;border:0.125rem solid var(--navy);border-radius:0.375rem;text-decoration:none;cursor:pointer;text-align:center}
.act.first{min-height:4rem;font-size:1.1875rem;color:#FFFFFF;background:var(--navy)}
.act:focus-visible{outline:0.1875rem solid var(--cyan);outline-offset:0.125rem}
.act[data-open]::after{content:"";margin-left:0.625rem;width:0.5rem;height:0.5rem;border:solid currentColor;border-width:0 0.125rem 0.125rem 0;transform:translateY(-0.125rem) rotate(45deg)}
.act[data-open][aria-expanded="true"]::after{transform:translateY(0.125rem) rotate(225deg)}
.more{display:grid;gap:0.625rem;padding:0.125rem 0 0.25rem 1rem;border-left:0.1875rem solid var(--cyan)}
.more[hidden]{display:none}
.more .act{min-height:3rem;font-size:1rem;border-width:1px}
footer{width:100%;padding:1.25rem;text-align:center;font-size:0.875rem;color:#475569}
footer a{color:inherit;text-underline-offset:0.1875rem}
</style>
</head>
<body>
<main>
  <img class="mark" src="/img/logo-square.png" alt="" width="512" height="512">
  <h1>Michael J. Spatacco</h1>
  <p class="role">Founder &amp; CEO</p>
  <p class="firm">Spatacco Analytics</p>
  <div class="acts" data-source="<?= $src ?>">
    <a class="act first" data-event="linkedin" href="https://www.linkedin.com/in/mjspatacco/" rel="noopener">Connect on LinkedIn</a>
    <a class="act" data-event="vcard" href="/C/mike.vcf">Save Contact</a>
<?php if (QR_BOOKING_URL !== '') { ?>
    <button class="act" type="button" data-open="more" aria-expanded="false" aria-controls="more">Book a Call / Email Me</button>
    <div class="more" id="more" hidden>
      <a class="act" data-event="book" href="<?= htmlspecialchars(QR_BOOKING_URL, ENT_QUOTES, 'UTF-8') ?>" rel="noopener">Book a Call</a>
      <a class="act" data-event="email" data-mail href="#">Email Me</a>
    </div>
<?php } else { ?>
    <a class="act" data-event="email" data-mail href="#">Email Me</a>
<?php } ?>
    <a class="act" data-event="scorer" href="/tools/website-scorer/?src=qr-<?= $src ?>">Score Your Firm&rsquo;s Website</a>
    <button class="act" type="button" data-open="tools" data-opens="tools" aria-expanded="false" aria-controls="tools">Other Tools</button>
    <div class="more" id="tools" hidden>
      <a class="act" data-event="lines" href="/tools/football/nfl-lines-tracker/">NFL Lines Tracker</a>
      <a class="act" data-event="resume" href="/tools/resume-parser/">Resume Parser</a>
      <a class="act" data-event="alltools" href="/tools/">All Tools</a>
    </div>
  </div>
</main>
<footer>Bala Cynwyd, PA &middot; <a href="/privacy/">Privacy</a></footer>
<script>
(function () {
  var box = document.querySelector('.acts'), source = box.getAttribute('data-source');
  // the address is put together here, never written in the page
  var u = 'Mike', d = 'SpataccoAnalytics.com';
  [].forEach.call(document.querySelectorAll('[data-mail]'), function (a) { a.href = 'mai' + 'lto:' + u + '@' + d; });
  function count(ev) {
    try { navigator.sendBeacon('/C/log.php', new Blob([JSON.stringify({ event: ev, source: source })], { type: 'application/json' })); } catch (x) {}
  }
  // each press is counted before it goes anywhere; a count that fails never stops the press
  box.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : null; if (!t) return;
    var b = t.closest('[data-open]');
    if (b) {                                   // a button that opens what is under it: the tools are counted when opened
      var more = document.getElementById(b.getAttribute('data-open')), open = more.hidden;
      more.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && b.getAttribute('data-opens')) count(b.getAttribute('data-opens'));
      return;
    }
    var a = t.closest('[data-event]'); if (a) count(a.getAttribute('data-event'));
  });
})();
</script>
</body>
</html>
