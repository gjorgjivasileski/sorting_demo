(() => {
  const grid = document.getElementById('posts-grid');
  const viewport = document.getElementById('posts-viewport');
  const sortControl = document.getElementById('sort-by');
  const sortStatus = document.getElementById('sort-status');
  const shuffleButton = document.getElementById('deck-toggle');
  const networkToggles = Array.from(document.querySelectorAll('.network-toggle'));
  const platformNames = { bluesky: 'Bluesky', mastodon: 'Mastodon', threads: 'Threads', x: 'X' };
  const deckStatus = document.getElementById('deck-status');
  const emptyPosts = document.getElementById('empty-posts');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const elements = Array.from(grid.children);

  // Shuffle once, before any live iframe is mounted. Keep this initial order
  // stable when returning from a metric sort or refreshing engagement counts.
  for (let i = elements.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [elements[i], elements[j]] = [elements[j], elements[i]];
  }
  grid.append(...elements);
  let posts = elements.map((element, index) => {
    // Build the two faces before embeds mount; live iframes never change parents.
    const front = document.createElement('div');
    front.className = 'card-front';
    front.append(...element.childNodes);
    const back = document.createElement('div');
    back.className = 'card-back';
    back.setAttribute('aria-hidden', 'true');
    const imprint = document.createElement('img');
    imprint.src = networkToggles.find(button => button.dataset.network === element.dataset.platform).querySelector('img').src;
    imprint.alt = '';
    imprint.draggable = false;
    back.append(imprint);
    const flip = document.createElement('div');
    flip.className = 'card-flip';
    flip.append(front, back);
    element.append(flip);
    return { element, front, index };
  });
  let sorted = [...posts];
  const stackedNetworks = new Set();
  let frame;
  let initialized = false;
  const animations = new Map();

  function layout(animate = false) {
    const gap = parseFloat(getComputedStyle(grid).columnGap);
    const width = viewport.clientWidth;
    // Keep card width in rem, rather than stretching a fixed column count.
    // Browser zoom can then shrink cards and gaps together and reveal more posts.
    const cardWidth = Math.min(width, 24 * parseFloat(getComputedStyle(document.documentElement).fontSize));
    const visibleColumns = Math.max(1, Math.floor((width + gap) / (cardWidth + gap)));
    const previousStep = parseFloat(grid.style.getPropertyValue('--column-step'));
    const scrollColumn = previousStep ? Math.round(viewport.scrollLeft / previousStep) : 0;
    const spread = sorted.filter(({ element }) => !stackedNetworks.has(element.dataset.platform));
    // Continue the sorted order across the whole top row, then the bottom row.
    // Only open cards determine the row length; decks follow both full rows.
    const spreadColumns = Math.ceil(spread.length / 2);
    const networks = [...stackedNetworks];
    const totalColumns = spreadColumns + networks.length;
    const spreadIndexes = new Map(spread.map((post, index) => [post, index]));
    const networkDepths = new Map(networks.map(network => [network, 0]));
    const previous = new Map(posts.map(({ element }) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return [element, matrix.toString()];
    }));
    animations.forEach(animation => animation.cancel());
    animations.clear();
    grid.classList.add('is-positioned');
    grid.style.width = `${Math.max(width, totalColumns * (cardWidth + gap) - gap + (networks.length ? 11 : 0))}px`;
    grid.dataset.visibleColumns = visibleColumns;
    grid.dataset.totalColumns = totalColumns;
    grid.style.setProperty('--column-step', `${cardWidth + gap}px`);
    // X caps content inside its iframe at 550px. Threads reports height after
    // content mutations, but not width changes, so keep its render width stable
    // and scale it to the card. This avoids clipping or reloading native media.
    posts.forEach(({ element }) => {
      const embedWidth = element.dataset.platform === 'threads' ? 384 : Math.min(cardWidth, 550);
      element.style.width = `${cardWidth}px`;
      element.style.setProperty('--embed-width', `${embedWidth}px`);
      element.style.setProperty('--embed-scale', cardWidth / embedWidth);
    });
    // Always measure the natural front, including while it faces away. Every
    // network deck follows the average of all posts as embeds load or resize.
    const heights = new Map(posts.map(post => [post, post.front.offsetHeight]));
    const deckHeight = posts.length ? posts.reduce((sum, post) => sum + heights.get(post), 0) / posts.length : 0;
    grid.style.setProperty('--deck-height', `${deckHeight}px`);
    let boardHeight = 0;

    sorted.forEach((post, index) => {
      const { element, front } = post;
      const network = element.dataset.platform;
      const faceDown = stackedNetworks.has(network);
      let x = 0;
      let y = 0;
      let height = heights.get(post);
      let zIndex = 1;
      if (faceDown) {
        const depth = networkDepths.get(network);
        networkDepths.set(network, depth + 1);
        // One compact deck per selected network, after every face-up column.
        x = (spreadColumns + networks.indexOf(network)) * (cardWidth + gap) + Math.min(depth, 7) * 1.5;
        y = 12 + Math.min(depth, 7) * 3;
        height = deckHeight;
        zIndex = sorted.length - depth;
      } else {
        const spreadIndex = spreadIndexes.get(post);
        const column = spreadIndex % spreadColumns;
        x = column * (cardWidth + gap);
        y = spreadIndex < spreadColumns ? 0 : heights.get(spread[spreadIndex - spreadColumns]) + gap;
      }
      element.classList.toggle('is-face-down', faceDown);
      front.inert = faceDown;
      boardHeight = Math.max(boardHeight, y + height);
      const transform = `translate(${x}px, ${y}px)`;
      element.style.transform = transform;
      element.style.zIndex = zIndex;
      element.inert = faceDown;
      if (animate && initialized && !reducedMotion.matches) {
        const animation = element.animate([
          { transform: previous.get(element) }, { transform },
        ], { duration: 650, delay: Math.min(index, 12) * 18, easing: 'cubic-bezier(.22,.8,.22,1)', fill: 'backwards' });
        animations.set(element, animation);
        animation.onfinish = () => animations.delete(element);
      }
    });
    grid.style.height = `${boardHeight}px`;
    if (previousStep && Math.abs(previousStep - cardWidth - gap) > 1) {
      // Keep a full column in view when switching between desktop and mobile.
      viewport.scrollLeft = scrollColumn * (cardWidth + gap);
    }
    initialized = true;
    grid.dispatchEvent(new CustomEvent('posts:layout', { bubbles: true }));
  }

  function scheduleLayout() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => layout());
  }

  function count(post, metric) {
    const value = post.element.dataset[metric];
    return value == null || value === '' ? null : Number(value);
  }

  function sortPosts(animate = true, resetScroll = true) {
    const [metric, order] = sortControl.value.split('-');
    const direction = order === 'asc' ? 1 : -1;
    // A background counts refresh must preserve an explicitly shuffled order.
    if (sortControl.value !== 'shuffled') sorted = [...posts].sort((a, b) => {
      if (sortControl.value === 'original') return a.index - b.index;
      const left = count(a, metric);
      const right = count(b, metric);
      // Unavailable counts belong at the end in either direction, not at zero.
      if (left === null || right === null) return (left === null) - (right === null) || a.index - b.index;
      return direction * (left - right) || a.index - b.index;
    });
    sorted.forEach(({ element }, index) => {
      element.dataset.sortIndex = index;
      // Preserve iframe state. Older browsers retain DOM order but still use
      // the correctly sorted visual positions, without reloading their embeds.
      if (typeof grid.moveBefore === 'function' && grid.children[index] !== element) {
        grid.moveBefore(element, grid.children[index]);
      }
    });
    if (resetScroll) viewport.scrollLeft = 0;
    layout(animate);
    sortStatus.textContent = sortControl.value === 'shuffled'
      ? 'Visible posts shuffled. Network decks kept in place.'
      : sortControl.value === 'original'
      ? 'All posts shown in their initial shuffled order.'
      : `Posts sorted by ${metric === 'replies' ? 'comments' : metric}, ${direction === 1 ? 'lowest to highest' : 'highest to lowest'}.`;
  }

  function updateButtons() {
    emptyPosts.hidden = posts.length !== 0;
    shuffleButton.disabled = posts.length < 2;
    sortControl.disabled = posts.length === 0;
    networkToggles.forEach(button => {
      const network = button.dataset.network;
      button.disabled = !posts.some(({ element }) => element.dataset.platform === network);
      const stacked = stackedNetworks.has(network);
      button.setAttribute('aria-pressed', String(stacked));
      button.setAttribute('aria-label', `${stacked ? 'Spread' : 'Stack'} ${platformNames[network]} posts`);
      button.title = button.getAttribute('aria-label');
    });
  }

  shuffleButton.addEventListener('click', () => {
    const visible = sorted.filter(({ element }) => !stackedNetworks.has(element.dataset.platform));
    if (visible.length < 2) {
      sortStatus.textContent = 'Spread a network deck to shuffle its posts.';
      return;
    }
    for (let i = visible.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [visible[i], visible[j]] = [visible[j], visible[i]];
    }
    let index = 0;
    sorted = sorted.map(post => stackedNetworks.has(post.element.dataset.platform) ? post : visible[index++]);
    sortControl.value = 'shuffled';
    sortPosts(true, false);
  });
  networkToggles.forEach(button => {
    button.addEventListener('click', () => {
      const network = button.dataset.network;
      const first = sorted.find(({ element }) => element.dataset.platform === network);
      if (!first) return;
      const stacking = !stackedNetworks.has(network);
      if (stacking) stackedNetworks.add(network);
      else stackedNetworks.delete(network);
      updateButtons();
      layout(true);
      const targetX = new DOMMatrix(first.element.style.transform).m41;
      viewport.scrollTo({ left: targetX, top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
      const count = posts.filter(({ element }) => element.dataset.platform === network).length;
      deckStatus.textContent = stacking
        ? `${count} ${platformNames[network]} posts stacked face down at the end of the board. Press Spread ${platformNames[network]} posts to restore them.`
        : `${platformNames[network]} posts restored to their sorted positions. ${stackedNetworks.size} network decks remain.`;
    });
  });
  sortControl.addEventListener('change', () => sortPosts());
  grid.addEventListener('posts:metrics', () => sortPosts(false, false));
  grid.addEventListener('posts:remove', event => {
    const element = event.detail.element;
    const post = posts.find(post => post.element === element);
    if (!post) return;
    observer.unobserve(post.front);
    sizes.delete(post.front);
    animations.get(element)?.cancel();
    animations.delete(element);
    posts = posts.filter(post => post.element !== element);
    sorted = sorted.filter(post => post.element !== element);
    if (!posts.some(post => post.element.dataset.platform === element.dataset.platform)) {
      stackedNetworks.delete(element.dataset.platform);
    }
    updateButtons();
    // Preserve the surviving shuffled order and selected decks. Sorting and
    // count refreshes must never reinsert a removed post from their old arrays.
    sortPosts(false, false);
  });
  sortPosts(false);
  updateButtons();

  const sizes = new WeakMap();
  const observer = new ResizeObserver(entries => {
    let changed = false;
    for (const entry of entries) {
      const size = entry.target === viewport ? entry.contentRect.width : entry.contentRect.height;
      if (sizes.get(entry.target) !== size) changed = true;
      sizes.set(entry.target, size);
    }
    if (changed) scheduleLayout();
  });
  observer.observe(viewport);
  posts.forEach(({ front }) => observer.observe(front));
  reducedMotion.addEventListener('change', scheduleLayout);
})();
