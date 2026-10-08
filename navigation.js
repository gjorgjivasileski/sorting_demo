export function enableGrabScroll(surface, canGrab) {
  let grab = null;

  function stop() {
    if (!grab) return;
    const { pointerId } = grab;
    grab = null;
    document.body.classList.remove('is-grabbing');
    if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
  }

  surface.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !canGrab(event.target)) return;
    if (event.target.closest('a, button, input, textarea, select, [contenteditable="true"]')) return;
    grab = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollX: window.scrollX, scrollY: window.scrollY };
    surface.setPointerCapture(event.pointerId);
    document.body.classList.add('is-grabbing');
    event.preventDefault();
  });

  surface.addEventListener('pointermove', event => {
    if (!grab || event.pointerId !== grab.pointerId) return;
    // A missed mouse-up (for example, outside the browser) must not stick.
    if (!(event.buttons & 1)) return stop();
    window.scrollTo({
      left: grab.scrollX + grab.x - event.clientX,
      top: grab.scrollY + grab.y - event.clientY,
      behavior: 'instant',
    });
    event.preventDefault();
  });

  surface.addEventListener('pointerup', stop);
  surface.addEventListener('pointercancel', stop);
  surface.addEventListener('lostpointercapture', stop);
  window.addEventListener('blur', stop);
  window.addEventListener('resize', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  return stop;
}
