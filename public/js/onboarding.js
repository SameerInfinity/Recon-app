/* ═══════════════════════════════════════════════════════════════
   RECON · ONBOARDING.JS  (Aura redesign)
   Stacked-slide controller · morphing background · spring feel.
   Same images, same IDs, same boot contract.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ONBOARD_KEY = 'recon_onboarded_v1';
  var SPLASH_MIN  = 1650;

  var splash = document.getElementById('splash-screen');
  var onb    = document.getElementById('onboarding-screen');
  var startedAt = Date.now();

  var _tutorialMode = false;
  var _wired = false;
  var _busy  = false;

  function isAuthed() {
    try {
      return typeof SupabaseClient !== 'undefined' &&
        SupabaseClient.isAuthenticated && SupabaseClient.isAuthenticated();
    } catch (e) { return false; }
  }
  function needsOnboarding() {
    try { return !localStorage.getItem(ONBOARD_KEY); } catch (e) { return true; }
  }
  function markOnboarded() {
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) {}
  }

  function hideSplash(then) {
    if (!splash) { then && then(); return; }
    splash.classList.add('splash-hide');
    setTimeout(function () {
      splash.style.display = 'none';
      then && then();
    }, 580);
  }

  function initOnboarding() {
    if (!onb) return;

    var stage     = onb.querySelector('#onb-stage') || onb.querySelector('.onb-stage');
    var slides    = onb.querySelectorAll('.onb-slide');
    var pills     = onb.querySelectorAll('.onb-pill');
    var nextBtn   = document.getElementById('onb-next');
    var nextLabel = document.getElementById('onb-next-label');
    var skipBtn   = document.getElementById('onb-skip');
    var bgA       = document.getElementById('onb-bg');
    var bgB       = document.getElementById('onb-bg-next');
    var total     = slides.length;
    var current   = 0;
    var activeBg  = bgA;  // currently visible bg layer
    var idleBg    = bgB;

    // Preload bg images so morph is instant
    for (var i = 1; i <= total; i++) {
      var pre = new Image(); pre.src = 'img/onboard-bg-' + i + '.jpg';
    }

    // ── Background morph: crossfade w/ blur+scale on opposite layers ──
    function morphBg(index) {
      if (!activeBg || !idleBg) return;
      var url = "url('img/onboard-bg-" + index + ".jpg')";
      if (activeBg.style.backgroundImage === url) return;

      idleBg.style.backgroundImage = url;
      // Force a reflow so the new bg image is committed before class swap.
      void idleBg.offsetHeight;

      idleBg.classList.add('is-active');
      activeBg.classList.remove('is-active');

      var tmp = activeBg; activeBg = idleBg; idleBg = tmp;
    }

    // ── Progress pills ──
    function paintProgress(i) {
      for (var p = 0; p < pills.length; p++) {
        pills[p].classList.remove('is-current', 'is-done');
        if (p < i)      pills[p].classList.add('is-done');
        else if (p === i) pills[p].classList.add('is-current');
      }
    }

    // ── CTA label morph ──
    function paintCta(i) {
      if (!nextBtn || !nextLabel) return;
      var finalLabel = _tutorialMode ? 'Done' : 'Get Started';
      var label = (i === total - 1) ? finalLabel : 'Next';
      if (nextLabel.textContent === label) return;

      nextLabel.classList.remove('onb-label-swap');
      // restart animation
      void nextLabel.offsetWidth;
      nextLabel.textContent = label;
      nextLabel.classList.add('onb-label-swap');

      nextBtn.classList.toggle('is-morph', i === total - 1);
    }

    // ── Slide swap with morphing exit/enter ──
    function goTo(target, direction) {
      target = Math.max(0, Math.min(total - 1, target));
      if (target === current || _busy) return;
      _busy = true;

      var fromEl = slides[current];
      var toEl   = slides[target];
      var dir    = direction || (target > current ? 1 : -1);

      // Mark previous as exiting
      fromEl.classList.remove('is-active');
      fromEl.classList.add(dir > 0 ? 'is-exit-left' : 'is-exit-right');

      // Activate target (animations defined in CSS replay because class re-added)
      toEl.classList.remove('is-exit-left', 'is-exit-right');
      // restart by toggling off then on inside next frame
      requestAnimationFrame(function () {
        toEl.classList.add('is-active');
      });

      morphBg(target + 1);
      paintProgress(target);
      paintCta(target);

      current = target;

      setTimeout(function () {
        fromEl.classList.remove('is-exit-left', 'is-exit-right');
        _busy = false;
      }, 420);
    }

    function setActiveInitial(i) {
      current = i;
      for (var s = 0; s < slides.length; s++) {
        slides[s].classList.toggle('is-active', s === i);
        slides[s].classList.remove('is-exit-left', 'is-exit-right');
      }
      morphBg(i + 1);
      paintProgress(i);
      paintCta(i);
    }

    // ── Swipe / drag ──
    function attachSwipe() {
      if (!stage) return;
      var startX = 0, startY = 0, dx = 0, dy = 0, tracking = false;
      stage.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        tracking = true; dx = 0; dy = 0;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      }, { passive: true });
      stage.addEventListener('touchmove', function (e) {
        if (!tracking || !e.touches[0]) return;
        dx = e.touches[0].clientX - startX;
        dy = e.touches[0].clientY - startY;
      }, { passive: true });
      stage.addEventListener('touchend', function () {
        if (!tracking) return;
        tracking = false;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) goTo(current + 1, 1);
          else        goTo(current - 1, -1);
        }
      });

      // Keyboard
      onb.tabIndex = -1;
      onb.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') goTo(current + 1, 1);
        else if (e.key === 'ArrowLeft') goTo(current - 1, -1);
        else if (e.key === 'Enter') nextBtn && nextBtn.click();
      });
    }

    if (!_wired) {
      _wired = true;
      nextBtn && nextBtn.addEventListener('click', function () {
        if (current < total - 1) goTo(current + 1, 1);
        else finish(true);
      });
      skipBtn && skipBtn.addEventListener('click', function () { finish(false); });
      attachSwipe();
    }

    setActiveInitial(0);
  }

  function finish(toAuth) {
    if (!_tutorialMode) markOnboarded();
    var wasTutorial = _tutorialMode;
    _tutorialMode = false;
    if (!onb) return;
    onb.classList.add('onb-hide');
    setTimeout(function () {
      onb.style.display = 'none';
      if (!wasTutorial && !isAuthed()) {
        window.location.href = '/auth.html';
      }
    }, 480);
  }

  window.showTutorial = function () {
    _tutorialMode = true;
    if (!onb) return;
    var skipBtn = document.getElementById('onb-skip');
    if (skipBtn) skipBtn.textContent = 'Close';
    onb.style.display = 'flex';
    initOnboarding();
    requestAnimationFrame(function () { onb.classList.add('onb-show'); });
  };

  function run() {
    var elapsed = Date.now() - startedAt;
    var wait = Math.max(0, SPLASH_MIN - elapsed);
    setTimeout(function () {
      if (needsOnboarding() && !isAuthed()) {
        if (onb) {
          onb.style.display = 'flex';
          initOnboarding();
          requestAnimationFrame(function () { onb.classList.add('onb-show'); });
        }
        hideSplash();
      } else {
        hideSplash();
      }
    }, wait);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
