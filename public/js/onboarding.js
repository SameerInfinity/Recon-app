/* ═══════════════════════════════════════════════════════════════
   ARCONZA · ONBOARDING.JS  (Aura redesign)
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

  // After the progress ring fills (~2s), add the "is-filled" class so the
  // gentle idle scale-pulse animation kicks in. This keeps the ring visually
  // alive without distracting from the logo while the app boots.
  (function _primeSplashRing() {
    var ringWrap = document.getElementById('splash-ring-wrap');
    if (!ringWrap) return;
    setTimeout(function () { ringWrap.classList.add('is-filled'); }, 2000);
  })();

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
      // On the last slide (slide 3 — "Want a walkthrough?"), we hide the
      // Next button entirely because the Yes/No choice buttons replace it.
      var isLast = (i === total - 1);
      if (isLast) {
        nextBtn.style.display = 'none';
        // Show the Yes/No choice buttons (they live inside slide 3)
        var choiceRow = onb.querySelector('.onb-choice-row');
        if (choiceRow) choiceRow.style.display = '';
        return;
      }
      // Non-last slides: show Next button, hide choice row
      nextBtn.style.display = '';
      var label = 'Next';
      if (nextLabel.textContent === label) return;
      nextLabel.classList.remove('onb-label-swap');
      void nextLabel.offsetWidth;
      nextLabel.textContent = label;
      nextLabel.classList.add('onb-label-swap');
      nextBtn.classList.remove('is-morph');
      var choiceRow2 = onb.querySelector('.onb-choice-row');
      if (choiceRow2) choiceRow2.style.display = 'none';
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

      // ── Slide 3 Yes/No choice buttons ──
      // "Yes, show me around" → finish onboarding + start the in-app walkthrough
      // "I'll explore on my own" → finish onboarding (no walkthrough)
      var yesBtn = document.getElementById('onb-walkthrough-yes');
      var noBtn  = document.getElementById('onb-walkthrough-no');
      if (yesBtn && !yesBtn._wtWired) {
        yesBtn._wtWired = true;
        yesBtn.addEventListener('click', function () {
          finishWithWalkthrough(true);
        });
      }
      if (noBtn && !noBtn._wtWired) {
        noBtn._wtWired = true;
        noBtn.addEventListener('click', function () {
          finish(false);
        });
      }
    }

    setActiveInitial(0);
  }

  // ── Finish onboarding and optionally start the in-app walkthrough ──
  // If startTour=true, hides onboarding, marks onboarded, then triggers
  // App.startWalkthrough() once the app shell is visible.
  function finishWithWalkthrough(startTour) {
    if (!_tutorialMode) markOnboarded();
    var wasTutorial = _tutorialMode;
    _tutorialMode = false;
    if (!onb) {
      if (startTour) _triggerWalkthrough();
      return;
    }
    onb.classList.add('onb-hide');
    setTimeout(function () {
      onb.style.display = 'none';
      if (startTour) {
        _triggerWalkthrough();
      } else if (!wasTutorial && !isAuthed()) {
        window.location.href = '/auth.html';
      }
    }, 480);
  }

  // Trigger the walkthrough via the App module if available.
  // Falls back to a direct call if App hasn't bootstrapped yet (retry up to 20×).
  // M-12: surface a toast after retries are exhausted so failures aren't silent.
  function _triggerWalkthrough() {
    var attempts = 0;
    function tryStart() {
      attempts++;
      if (typeof App !== 'undefined' && typeof App.startWalkthrough === 'function') {
        App.startWalkthrough();
      } else if (attempts < 20) {
        setTimeout(tryStart, 150);
      } else {
        if (typeof App !== 'undefined' && App.toast) {
          App.toast('Walkthrough could not start. Try again from More → App Tutorial.', 'info');
        }
      }
    }
    tryStart();
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

  // "App Tutorial" from the More hub — now triggers the in-app walkthrough
  // directly (instead of re-playing the 3-slide intro). The 3-slide intro
  // is only shown to first-time users.
  // M-11: bound the retry count so a missing App module doesn't spin forever.
  window.showTutorial = function () {
    if (typeof App !== 'undefined' && typeof App.startWalkthrough === 'function') {
      window._showTutorialRetries = 0;
      App.startWalkthrough();
    } else {
      if (!window._showTutorialRetries) window._showTutorialRetries = 0;
      if (window._showTutorialRetries < 20) {
        window._showTutorialRetries++;
        setTimeout(window.showTutorial, 200);
      } else {
        window._showTutorialRetries = 0;
        if (typeof App !== 'undefined' && App.toast) {
          App.toast('Walkthrough could not start. Try again from More → App Tutorial.', 'info');
        }
      }
    }
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
