/* One Way — background ambient parallax.
   Visual-only: never intercepts inputs, clicks, login or workspace state. */
(function () {
  'use strict';
  if (window.__owAmbientParallax) return;
  var media = window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  if (!media.matches) return;
  window.__owAmbientParallax = true;

  var root = document.documentElement;
  var targetX = 0, targetY = 0, currentX = 0, currentY = 0, raf = 0;
  var enabled = true;

  function animate() {
    raf = 0;
    if (!enabled || document.hidden) return;
    currentX += (targetX - currentX) * 0.085;
    currentY += (targetY - currentY) * 0.085;
    root.style.setProperty('--ow-bg-shift-x', currentX.toFixed(2) + 'px');
    root.style.setProperty('--ow-bg-shift-y', currentY.toFixed(2) + 'px');
    if (Math.abs(targetX - currentX) > 0.07 || Math.abs(targetY - currentY) > 0.07) {
      raf = window.requestAnimationFrame(animate);
    }
  }

  function schedule() {
    if (enabled && !raf && !document.hidden) raf = window.requestAnimationFrame(animate);
  }

  function onPointerMove(event) {
    if (!enabled || !event.isPrimary) return;
    var w = Math.max(1, window.innerWidth);
    var h = Math.max(1, window.innerHeight);
    targetX = Math.max(-9, Math.min(9, (event.clientX / w - 0.5) * 18));
    targetY = Math.max(-6, Math.min(6, (event.clientY / h - 0.5) * 12));
    schedule();
  }

  function recenter() {
    targetX = 0;
    targetY = 0;
    schedule();
  }

  function disable() {
    enabled = false;
    root.classList.remove('ow-mouse-ambient');
    root.style.removeProperty('--ow-bg-shift-x');
    root.style.removeProperty('--ow-bg-shift-y');
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  root.classList.add('ow-mouse-ambient');
  window.addEventListener('pointermove', onPointerMove, {passive:true});
  document.addEventListener('pointerleave', recenter, {passive:true});
  window.addEventListener('blur', recenter, {passive:true});
  document.addEventListener('visibilitychange', function () { if (!document.hidden) recenter(); });
  if (media.addEventListener) {
    media.addEventListener('change', function () { if (!media.matches) disable(); });
  }
})();
