/* ===== SPATACCO ANALYTICS — SHARED JS ===== */
/* shared.js — nav, scroll reveal, email obfuscation */

document.addEventListener('DOMContentLoaded', function() {
  // Nav load animation
  setTimeout(function() {
    var nav = document.getElementById('main-nav');
    if (nav) nav.classList.add('loaded');
  }, 100);

  // Scroll reveal observer
  var reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function(el) { observer.observe(el); });
  }

  // Email obfuscation — builds mailto from split parts
  // Usage: add class="sa-email-link" and it will get wired up
  var u = 'mike', d = 'spataccoanalytics.com';
  var emailLinks = document.querySelectorAll('.sa-email-link');
  emailLinks.forEach(function(el) {
    el.href = 'mailto:' + u + '@' + d;
  });
  var emailDisplays = document.querySelectorAll('.sa-email-display');
  emailDisplays.forEach(function(el) {
    el.textContent = u + '@' + d;
  });

  // CTA email button — the homepage-style "Start a Conversation" button
  var ctaEmail = document.getElementById('cta-email');
  if (ctaEmail) {
    ctaEmail.href = 'mailto:' + u + '@' + d;
    ctaEmail.onclick = null;
  }
  var emailDisplay = document.getElementById('email-display');
  if (emailDisplay) {
    emailDisplay.textContent = u + '@' + d;
  }
});
