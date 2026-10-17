// Kleine Helfer der Website. Ohne JavaScript funktioniert alles, nur ohne
// aufklappbares Menü und ohne Umschalter für die Zahlweise.
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');

  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  if (header && toggle) {
    var setOpen = function (open) {
      header.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', function () {
      setOpen(!header.classList.contains('nav-open'));
    });
    header.querySelectorAll('.main-nav a').forEach(function (link) {
      link.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });
  }

  // Zahlweise: tauscht Preis, Einheit und Hinweis aus den data-Attributen.
  var billing = document.querySelector('.billing-toggle');
  if (billing) {
    billing.hidden = false;
    var buttons = billing.querySelectorAll('button');
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var interval = button.getAttribute('data-interval');
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
        document.querySelectorAll('.pricing [data-' + interval + ']').forEach(function (el) {
          var value = el.getAttribute('data-' + interval);
          var target = el.classList.contains('price') ? el.querySelector('.amount') : el;
          if (target) target.textContent = value;
        });
      });
    });
  }
})();
