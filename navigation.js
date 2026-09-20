(() => {
  const viewport = document.getElementById('posts-viewport');
  const grid = document.getElementById('posts-grid');
  const status = document.getElementById('pan-status');
  const interactionToggle = document.getElementById('interaction-toggle');
  const platformNames = { x: 'X', bluesky: 'Bluesky', mastodon: 'Mastodon', threads: 'Threads' };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const postLinks = new Map();
  let gesture = null;
  let suppressClick = false;
  let interactive = false;

  for (const card of grid.children) {
    // The saved permalink is the last fallback link, after the post's content.
    const original = [...card.querySelectorAll('.post-fallback a')].at(-1);
    if (!original) continue;
    const url = new URL(original.href);
    // Mastodon permalinks live on each author's home instance.
    if (url.protocol !== 'https:') continue;
    if (card.dataset.platform !== 'mastodon'
      && !['x.com', 'twitter.com', 'bsky.app', 'www.threads.com', 'www.threads.net'].includes(url.hostname)) continue;
    url.search = '';
    postLinks.set(card, url.href);
    const surface = document.createElement('a');
    surface.className = 'card-surface';
    surface.href = url.href;
    surface.target = '_blank';
    surface.rel = 'noopener noreferrer';
    const excerpt = card.querySelector('.post-fallback p')?.textContent.trim().slice(0, 100) || 'post';
    surface.setAttribute('aria-label', `Open ${platformNames[card.dataset.platform]} post in a new tab: ${excerpt}`);
    card.querySelector('.card-front').append(surface);
  }

  const maximum = () => Math.max(0, grid.offsetWidth - viewport.clientWidth);
  const maximumY = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const step = () => parseFloat(grid.style.getPropertyValue('--column-step')) || viewport.clientWidth;

  grid.addEventListener('posts:remove', event => {
    postLinks.delete(event.detail.element);
  });

  function scrollTo(left, top = viewport.scrollTop) {
    viewport.scrollTo({
      left: Math.max(0, Math.min(maximum(), left)),
      top: Math.max(0, Math.min(maximumY(), top)),
      behavior: reducedMotion.matches ? 'instant' : 'smooth',
    });
  }
  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport && !event.target.classList.contains('card-surface')) return;
    const positions = {
      ArrowLeft: [viewport.scrollLeft - step(), viewport.scrollTop],
      ArrowRight: [viewport.scrollLeft + step(), viewport.scrollTop],
      ArrowUp: [viewport.scrollLeft, viewport.scrollTop - 80],
      ArrowDown: [viewport.scrollLeft, viewport.scrollTop + 80],
      PageUp: [viewport.scrollLeft, viewport.scrollTop - viewport.clientHeight],
      PageDown: [viewport.scrollLeft, viewport.scrollTop + viewport.clientHeight],
      Home: [0, viewport.scrollTop],
      End: [maximum(), viewport.scrollTop],
    };
    if (!positions[event.key]) return;
    event.preventDefault();
    scrollTo(...positions[event.key]);
  });

  function endGesture() {
    if (!gesture) return;
    const { pointerId, moved } = gesture;
    gesture = null;
    viewport.classList.remove('is-dragging');
    if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
    status.textContent = 'Released the board.';
    if (moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
    }
  }
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || (maximum() <= 0 && maximumY() <= 0)) return;
    if (interactive && event.target.closest('.post-card')) return;
    if (event.target.closest('a:not(.card-surface), button, select, input, textarea, video, iframe')) return;
    endGesture();
    event.preventDefault();
    viewport.focus({ preventScroll: true });
    gesture = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop, moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-dragging');
    window.getSelection()?.removeAllRanges();
    status.textContent = 'Board grabbed. Drag to scroll; release the mouse or press Escape to stop.';
  });
  viewport.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    const dx = gesture.startX - event.clientX;
    const dy = gesture.startY - event.clientY;
    if (Math.hypot(dx, dy) > 2) gesture.moved = true;
    viewport.scrollLeft = Math.max(0, Math.min(maximum(), gesture.scrollLeft + dx));
    viewport.scrollTop = Math.max(0, Math.min(maximumY(), gesture.scrollTop + dy));
  });
  window.addEventListener('pointerup', endGesture);
  window.addEventListener('pointercancel', endGesture);
  viewport.addEventListener('lostpointercapture', endGesture);
  window.addEventListener('blur', endGesture);
  document.addEventListener('visibilitychange', () => { if (document.hidden) endGesture(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') endGesture(); });
  viewport.addEventListener('click', event => {
    // Mouse clicks are reserved for grabbing. Keyboard Enter and touch taps on
    // the accessible permalink can still open a post without a context menu.
    if (suppressClick || (event.target.closest('.card-surface') && event.detail > 0 && event.pointerType !== 'touch')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  viewport.addEventListener('contextmenu', event => {
    if (interactive) return;
    const card = event.target.closest('.post-card');
    if (card?.classList.contains('is-face-down')) return;
    const url = postLinks.get(card);
    if (!url) return;
    event.preventDefault();
    endGesture();
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  interactionToggle.addEventListener('click', () => {
    endGesture();
    interactive = !interactive;
    viewport.classList.toggle('is-interactive', interactive);
    interactionToggle.setAttribute('aria-pressed', String(interactive));
    grid.querySelectorAll('.embed-mount').forEach(mount => { mount.inert = !interactive; });
    status.textContent = interactive ? 'Native post interactions enabled.' : 'Card dragging enabled.';
  });
  interactionToggle.disabled = false;
})();
