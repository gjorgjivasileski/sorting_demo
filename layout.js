// Measure only the native cards' outer boxes; their contents stay untouched.
export function createMasonry(feed, getCards, mobile) {
  let scheduled = 0;
  let observedWidth = 0;

  function schedule() {
    if (!scheduled) scheduled = requestAnimationFrame(layout);
  }

  function layout() {
    cancelAnimationFrame(scheduled);
    scheduled = 0;
    const cards = getCards();
    if (mobile.matches || !cards.length) {
      feed.classList.remove('is-masonry');
      feed.style.removeProperty('height');
      feed.style.removeProperty('--column-width');
      return;
    }

    const width = feed.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(feed).columnGap);
    const minimumWidth = 19 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const columns = Math.max(1, Math.floor((width + gap) / (minimumWidth + gap)));
    const columnWidth = (width - gap * (columns - 1)) / columns;
    feed.classList.add('is-masonry');
    feed.style.setProperty('--column-width', `${columnWidth}px`);

    // Batch height reads after assigning widths, then write positions together.
    const heights = cards.map(card => card.element.getBoundingClientRect().height);
    const bottoms = Array(columns).fill(0);
    cards.forEach((card, index) => {
      const column = bottoms.indexOf(Math.min(...bottoms));
      card.element.style.setProperty('--card-x', `${column * (columnWidth + gap)}px`);
      card.element.style.setProperty('--card-y', `${bottoms[column]}px`);
      bottoms[column] += heights[index] + gap;
    });
    feed.style.height = `${Math.max(...bottoms) - gap}px`;
  }

  const observer = new ResizeObserver(entries => {
    let changed = false;
    for (const entry of entries) {
      // A layout changes the feed's height, which must not schedule itself.
      if (entry.target !== feed) changed = true;
      else if (entry.contentRect.width !== observedWidth) {
        observedWidth = entry.contentRect.width;
        changed = true;
      }
    }
    if (changed) schedule();
  });
  observer.observe(feed);
  mobile.addEventListener('change', schedule);
  window.addEventListener('resize', schedule, { passive: true });

  return {
    layout,
    observe(cards) {
      cards.forEach(card => observer.observe(card.element));
      layout();
    },
  };
}
