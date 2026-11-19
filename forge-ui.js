/* FORGE mobile UI add-on. Reads existing timer DOM; does not write app/Firebase state. */
(() => {
  'use strict';
  if (window.__FORGE_UI_POLISH_READY__) return;
  window.__FORGE_UI_POLISH_READY__ = true;

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'forge-floating-rest';
  pill.setAttribute('aria-label', 'Return to the workout rest countdown');
  pill.setAttribute('aria-hidden', 'true');
  pill.tabIndex = -1;
  pill.innerHTML = '<span class="forge-floating-rest__symbol" aria-hidden="true">◷</span>' +
    '<span><span class="forge-floating-rest__label">REST REMAINING</span>' +
    '<span class="forge-floating-rest__clock">00:00</span></span>';
  document.body.appendChild(pill);
  const clock = pill.querySelector('.forge-floating-rest__clock');
  const title = pill.querySelector('.forge-floating-rest__label');
  let lastRestSeconds = null;
  let completionUntil = 0;
  let prevActive = false;
  let rafScheduled = false;

  function show(visible) {
    pill.classList.toggle('is-visible', visible);
    pill.setAttribute('aria-hidden', visible ? 'false' : 'true');
    pill.tabIndex = visible ? 0 : -1;
  }
  function parseSeconds(text) {
    const match = /^\s*(\d+):(\d{2})\s*$/.exec(text || '');
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }
  function onScreen(element) {
    const r = element.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight;
    return r.bottom > 10 && r.top < h - (window.innerWidth <= 800 ? 86 : 10);
  }
  function refresh() {
    if (!document.body.contains(pill)) document.body.appendChild(pill);
    const inWorkout = !!document.querySelector('.workout-sticky');
    const source = inWorkout ? document.querySelector('#rest-clock') : null;
    const restArea = source?.closest('.rest-area');
    const remaining = source ? parseSeconds(source.textContent) : null;
    const active = !!restArea && !restArea.classList.contains('hide') && remaining !== null && remaining > 0;
    const modalOpen = !!document.querySelector('.modal-overlay');
    if (active) {
      completionUntil = 0;
      lastRestSeconds = remaining;
      prevActive = true;
      pill.classList.remove('is-complete');
      title.textContent = 'REST REMAINING';
      clock.textContent = source.textContent.trim();
      show(!onScreen(restArea) && !modalOpen);
      return;
    }
    // Only show a short completion state after a naturally expired countdown.
    if (prevActive && inWorkout && lastRestSeconds !== null && lastRestSeconds <= 2 &&
        (remaining === 0 || !source || restArea?.classList.contains('hide'))) {
      completionUntil = Date.now() + 1500;
      pill.classList.add('is-complete');
      title.textContent = 'REST TIMER';
      clock.textContent = 'Complete!';
    }
    prevActive = false;
    if (!inWorkout) completionUntil = 0;
    show(!modalOpen && completionUntil > Date.now());
    if (completionUntil <= Date.now()) pill.classList.remove('is-complete');
    if (!source) lastRestSeconds = null;
  }
  function schedule() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      refresh();
    });
  }
  pill.addEventListener('click', () => {
    const target = document.querySelector('.rest-area:not(.hide)');
    if (target) {
      target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      schedule();
    }
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  const app = document.getElementById('app');
  if (app) new MutationObserver(schedule).observe(app, { childList: true, subtree: true, characterData: true });
  // Re-check after returning from lock screen; source clock is anchored to real time in FORGE.
  setInterval(refresh, 500);
  refresh();
})();
