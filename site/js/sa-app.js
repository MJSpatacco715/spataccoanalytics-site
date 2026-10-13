
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() { document.getElementById('main-nav').classList.add('loaded'); }, 100);
  var reveals = document.querySelectorAll('.reveal');
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.12 });
  reveals.forEach(function(el) { observer.observe(el); });
  var u='mike',d='spataccoanalytics.com',addr=u+'@'+d;
  var cta=document.getElementById('cta-email');
  var disp=document.getElementById('email-display');
  if(cta){cta.href='mail'+'to:'+addr;cta.onclick=null;}
  if(disp){disp.textContent=addr;}
  var path = window.location.pathname.replace(/\/$/,'');
  var page = path.split('/').pop() || 'index';
  page = page.replace('.php','').replace('.html','');
  document.querySelectorAll('.nav-links a').forEach(function(a) {
    var href = a.getAttribute('href').replace('.php','').replace('.html','').replace(/^\//,'');
    if (href === page || (page === 'index' && (href === '' || href === '/'))) {
      a.classList.add('active');
    }
  });
});
