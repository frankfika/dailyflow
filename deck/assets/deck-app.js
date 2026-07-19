/* deck-app.js — runtime for the DailyFlow deck
 * Features:
 *  - responsive --scale so the 1600x900 stage fits any viewport
 *  - keyboard / pointer / hash navigation
 *  - overview mode (o)
 *  - fullscreen (f)
 *  - print to PDF (p) via window.print()
 *  - language toggle (1 = zh-CN, 2 = en-US) with real translation keys
 */
(function () {
  'use strict';

  var stage = document.querySelector('.deck-stage');
  var frame = document.querySelector('.deck-frame');
  var wraps = Array.prototype.slice.call(document.querySelectorAll('.slide-wrap'));
  var slides = wraps.map(function (w) { return w.querySelector('.slide'); });
  var total = wraps.length;
  var idx = 0;

  // --- responsive scaling ------------------------------------------------
  function fit() {
    if (!frame) return;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var sx = vw / 1600;
    var sy = vh / 900;
    var s = Math.min(sx, sy) * 0.96; // tiny breathing room
    frame.style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', fit);

  // --- navigation --------------------------------------------------------
  function show(n, opts) {
    if (n < 0) n = 0;
    if (n >= total) n = total - 1;
    if (!opts || opts.fromUser !== false) {
      if (history && history.replaceState) {
        history.replaceState(null, '', '#slide-' + String(n + 1).padStart(2, '0'));
      }
    }
    idx = n;
    wraps.forEach(function (w, i) {
      w.classList.toggle('is-active', i === n);
    });
    updateCount();
  }
  function next() { show(idx + 1); }
  function prev() { show(idx - 1); }
  function first() { show(0); }
  function last() { show(total - 1); }

  function updateCount() {
    var el = document.querySelector('.deck-toolbar .count');
    if (el) el.textContent = String(idx + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
  }

  // --- keyboard ----------------------------------------------------------
  window.addEventListener('keydown', function (ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    var k = ev.key;
    if (k === 'ArrowRight' || k === ' ' || k === 'PageDown') { ev.preventDefault(); next(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { ev.preventDefault(); prev(); }
    else if (k === 'Home') { first(); }
    else if (k === 'End') { last(); }
    else if (k === 'o' || k === 'O') { toggleOverview(); }
    else if (k === 'f' || k === 'F') { toggleFullscreen(); }
    else if (k === 'p' || k === 'P') { window.print(); }
    else if (k === '1') { setLang('zh-CN'); }
    else if (k === '2') { setLang('en-US'); }
  });

  // --- toolbar clicks ----------------------------------------------------
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-action]');
    if (!t) return;
    var act = t.getAttribute('data-action');
    if (act === 'next') next();
    else if (act === 'prev') prev();
    else if (act === 'first') first();
    else if (act === 'last') last();
    else if (act === 'overview') toggleOverview();
    else if (act === 'fullscreen') toggleFullscreen();
    else if (act === 'print') window.print();
    else if (act === 'lang-zh') setLang('zh-CN');
    else if (act === 'lang-en') setLang('en-US');
    else if (act === 'tile') {
      var n = Number(t.getAttribute('data-slide'));
      if (!isNaN(n)) { show(n); closeOverview(); }
    }
  });

  // --- overview ----------------------------------------------------------
  function toggleOverview() {
    var ov = document.querySelector('.deck-overview');
    if (!ov) return;
    ov.classList.toggle('is-open');
  }
  function closeOverview() {
    var ov = document.querySelector('.deck-overview');
    if (ov) ov.classList.remove('is-open');
  }

  // --- fullscreen --------------------------------------------------------
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else {
      (document.exitFullscreen || function () {}).call(document);
    }
  }

  // --- language ----------------------------------------------------------
  function setLang(lang) {
    document.documentElement.setAttribute('data-lang', lang);
    document.querySelectorAll('.deck-toolbar .lang-pill').forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-lang') === lang);
    });
  }

  // --- init --------------------------------------------------------------
  function init() {
    fit();
    // hash routing
    var m = (location.hash || '').match(/slide-(\d+)/);
    if (m) {
      var n = parseInt(m[1], 10) - 1;
      if (!isNaN(n)) show(n, { fromUser: false });
      else show(0, { fromUser: false });
    } else {
      show(0, { fromUser: false });
    }
    setLang('zh-CN');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
