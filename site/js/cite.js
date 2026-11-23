/* Source cards (css/cite.css). Hover and keyboard focus are handled by the
   stylesheet; this adds tap to open, tap elsewhere or Escape to close, and
   tells assistive technology which card belongs to which figure. */
(function () {
  var cites = document.querySelectorAll('.sa-cite');
  function closeAll(except) {
    cites.forEach(function (c) { if (c !== except) { c.classList.remove('open'); c.setAttribute('aria-expanded', 'false'); } });
  }
  cites.forEach(function (c, i) {
    var card = c.querySelector('.sa-cite-card');
    if (!card) return;
    card.id = card.id || 'sa-cite-' + (i + 1);
    c.setAttribute('aria-describedby', card.id);
    c.setAttribute('aria-expanded', 'false');
    c.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;          // let the source link work
      var open = !c.classList.contains('open');
      closeAll(c); c.classList.toggle('open', open); c.setAttribute('aria-expanded', String(open));
    });
    c.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { if (e.target === c) { e.preventDefault(); c.click(); } }
      if (e.key === 'Escape') { closeAll(); c.blur(); }
    });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.sa-cite')) closeAll(); });
})();
