(() => {
  const grid = document.getElementById('posts-grid');
  const availabilityStatus = document.getElementById('availability-status');
  let removedCount = 0;
  const platformNames = { x: 'X', bluesky: 'Bluesky', mastodon: 'Mastodon', threads: 'Threads' };
  const embeds = Array.from(grid.querySelectorAll('.post-card'), element => {
    const platform = element.dataset.platform;
    const name = platformNames[platform];
    const fallback = element.querySelector('.post-fallback');
    const mount = document.createElement('div');
    mount.className = 'embed-mount';
    mount.inert = !document.getElementById('posts-viewport').classList.contains('is-interactive');
    const status = document.createElement('p');
    status.className = 'embed-status';
    status.textContent = `Loading ${name} post…`;
    fallback.hidden = true;
    element.dataset.embedState = 'loading';
    element.dataset.availability = 'checking';
    element.querySelector('.card-front').prepend(status, mount);
    if (platform === 'mastodon') {
      // Saved, locally styled cards let us omit native Hide/ALT badges while
      // retaining image descriptions and working links, even if the API fails.
      const card = element.querySelector('.mastodon-post');
      mount.append(card);
      card.hidden = false;
      status.hidden = true;
      element.dataset.embedState = 'ready';
    }
    return { element, platform, name, fallback, mount, status };
  });

  function showFallback(embed) {
    if (embed.removed || embed.element.dataset.embedState === 'ready') return;
    embed.element.dataset.embedState = 'unavailable';
    embed.status.textContent = `${embed.name} embed unavailable. Read the saved post or open the original below.`;
    embed.status.hidden = false;
    embed.fallback.hidden = false;
    embed.mount.hidden = true;
  }
  function showReady(embed) {
    if (embed.removed) return;
    embed.element.dataset.embedState = 'ready';
    embed.mount.hidden = false;
    embed.fallback.hidden = true;
    embed.status.hidden = true;
  }

  // Iframe providers share lazy loading and fallbacks, but use different
  // resize messages. Match the expected origin AND sending window for each.
  const blueskyEmbeds = embeds.filter(embed => embed.platform === 'bluesky');
  const mastodonEmbeds = embeds.filter(embed => embed.platform === 'mastodon');
  const threadsEmbeds = embeds.filter(embed => embed.platform === 'threads');
  const frames = new Map();
  const pendingFrames = new Map();
  function setAvailability(embed, state) {
    if (embed.removed) return;
    embed.element.dataset.availability = state;
    embed.element.dataset.availabilityChecked = new Date().toISOString();
  }
  function removePost(embed) {
    if (embed.removed) return;
    setAvailability(embed, 'missing');
    embed.removed = true;
    visibility.unobserve(embed.element);
    pendingFrames.delete(embed.element);
    for (const [id, item] of frames) {
      if (item.embed !== embed) continue;
      clearTimeout(item.timeout);
      frames.delete(id);
    }
    if (embed.element.contains(document.activeElement)) {
      document.getElementById('posts-viewport').focus({ preventScroll: true });
    }
    embed.element.remove();
    grid.dispatchEvent(new CustomEvent('posts:remove', { detail: { element: embed.element } }));
    removedCount++;
    availabilityStatus.textContent = `${removedCount} ${removedCount === 1 ? 'post is' : 'posts are'} no longer available and ${removedCount === 1 ? 'has' : 'have'} been removed from this board.`;
  }
  // Start loading when a card is near the screen. Offscreen native embeds may
  // defer rendering, so their timeout must not expire before they are viewed.
  const visibility = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const item = pendingFrames.get(entry.target);
      if (!item) return;
      visibility.unobserve(entry.target);
      pendingFrames.delete(entry.target);
      item.timeout = setTimeout(() => showFallback(item.embed), 30000);
      item.iframe.src = item.src;
      item.embed.mount.append(item.iframe);
    });
  }, { rootMargin: '160px 0px' });
  window.addEventListener('message', event => {
    let item;
    let height;
    if (typeof event.data === 'number') {
      // Threads sends the height itself, without an ID. Match its iframe window.
      item = [...frames.values()].find(item => item.embed.platform === 'threads'
        && event.source === item.iframe.contentWindow);
      height = event.data;
    } else if (event.data && typeof event.data === 'object') {
      item = frames.get(String(event.data.id));
      if (item?.embed.platform === 'threads') return;
      height = Number(event.data.height);
    }
    if (!item || event.origin !== item.origin || event.source !== item.iframe.contentWindow) return;
    if (!Number.isFinite(height) || height <= 0 || height > 20000) return;
    item.iframe.style.height = `${Math.ceil(height)}px`;
    if (item.embed.platform === 'threads') {
      item.embed.mount.style.setProperty('--embed-height', `${Math.ceil(height)}px`);
    }
    showReady(item.embed);
    clearTimeout(item.timeout);
  });
  function registerFrame(embed, id, src, index) {
    const iframe = document.createElement('iframe');
    iframe.className = `${embed.platform}-frame`;
    iframe.title = `${embed.name} post ${index + 1}`;
    iframe.setAttribute('scrolling', 'no');
    const origin = new URL(src).origin;
    const item = { iframe, embed, src, origin, timeout: null };
    if (embed.platform === 'threads') iframe.allow = 'fullscreen';
    iframe.addEventListener('error', () => { clearTimeout(item.timeout); showFallback(embed); });
    frames.set(id, item);
    pendingFrames.set(embed.element, item);
    visibility.observe(embed.element);
  }
  blueskyEmbeds.forEach((embed, index) => {
    const id = `post-${index}`;
    const params = new URLSearchParams({ id, colorMode: 'light' });
    registerFrame(embed, id, `https://embed.bsky.app/embed/${embed.element.dataset.uri.slice(5)}?${params}`, index);
  });
  threadsEmbeds.forEach((embed, index) => {
    registerFrame(embed, `threads-${index}`, `${embed.element.dataset.postUrl}/embed/`, index);
  });

  // Keep the existing official X embeds, including late-load fallback recovery.
  const xEmbeds = embeds.filter(embed => embed.platform === 'x');
  const xTimeout = setTimeout(() => xEmbeds.forEach(showFallback), 30000);
  window.twttr = window.twttr || { _e: [], ready(callback) { this._e.push(callback); } };
  window.twttr.ready(async twitter => {
    await Promise.allSettled(xEmbeds.map(async embed => {
      if (embed.removed) return;
      try {
        embed.mount.hidden = false;
        const card = await twitter.widgets.createTweet(embed.element.dataset.postId, embed.mount,
          { theme: 'light', conversation: 'none', cards: 'visible', dnt: true });
        if (!card) throw new Error('Post unavailable');
        showReady(embed);
      } catch { showFallback(embed); }
    }));
    clearTimeout(xTimeout);
  });
  const widgetScript = document.createElement('script');
  widgetScript.src = 'https://platform.twitter.com/widgets.js';
  widgetScript.async = true;
  widgetScript.addEventListener('error', () => { clearTimeout(xTimeout); xEmbeds.forEach(showFallback); });
  document.head.append(widgetScript);

  async function fetchPostData(url) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000), credentials: 'omit', cache: 'no-store',
    });
    // A genuine 404 may have an HTML error body (notably X oEmbed).
    const data = await response.json().catch(() => null);
    return { response, data };
  }

  function updateCounts(embed, likes, replies) {
    if (embed.removed || !Number.isFinite(likes) || !Number.isFinite(replies) || likes < 0 || replies < 0) return false;
    Object.assign(embed.element.dataset, {
      likes, replies, countsUpdated: new Date().toISOString(), countsSource: 'live',
    });
    return true;
  }

  async function checkBlueskyPost(embed) {
    const uri = embed.element.dataset.uri;
    const params = new URLSearchParams({ uri, depth: '0', parentHeight: '0' });
    try {
      const { response, data } = await fetchPostData(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?${params}`);
      const thread = data?.thread;
      // A missing entry in getPosts alone is inconclusive. Confirm the root
      // post, never a missing reply or a blocked-post response.
      if ((response.status === 400 && data?.error === 'NotFound')
        || (response.ok && thread?.$type === 'app.bsky.feed.defs#notFoundPost' && thread.uri === uri)) {
        removePost(embed);
      } else if (response.ok && thread?.post?.uri === uri) {
        setAvailability(embed, 'active');
        updateCounts(embed, thread.post.likeCount, thread.post.replyCount);
      } else {
        setAvailability(embed, 'unknown');
      }
    } catch {
      setAvailability(embed, 'unknown');
    }
  }

  // Availability checks cover offscreen/deck cards too, independently of lazy
  // iframe loading. Reuse count lookups where the providers expose both.
  async function refreshBlueskyCounts() {
    if (!blueskyEmbeds.length) return;
    // getPosts accepts at most 25 URIs. Imported collections can grow beyond
    // that; each failed batch retains its cards and saved sorting counts.
    const batches = [];
    for (let i = 0; i < blueskyEmbeds.length; i += 25) batches.push(blueskyEmbeds.slice(i, i + 25));
    await Promise.allSettled(batches.map(async batch => {
      try {
        const params = new URLSearchParams();
        batch.forEach(embed => params.append('uris', embed.element.dataset.uri));
        const { response, data } = await fetchPostData(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?${params}`);
        if (!response.ok || !Array.isArray(data?.posts)) throw new Error('Invalid posts response');
        const byUri = new Map(data.posts.map(post => [post.uri, post]));
        await Promise.allSettled(batch.map(async embed => {
          const post = byUri.get(embed.element.dataset.uri);
          if (post) {
            setAvailability(embed, 'active');
            updateCounts(embed, post.likeCount, post.replyCount);
          } else {
            await checkBlueskyPost(embed);
          }
        }));
      } catch {
        // A failed batch says nothing about any individual post's existence.
        batch.forEach(embed => setAvailability(embed, 'unknown'));
      }
    }));
    grid.dispatchEvent(new CustomEvent('posts:metrics'));
  }

  async function refreshMastodonCounts() {
    if (!mastodonEmbeds.length) return;
    // Instances can fail independently. Preserve saved values for failed posts
    // and apply the successful results before re-sorting the board once.
    await Promise.allSettled(mastodonEmbeds.map(async embed => {
      setAvailability(embed, 'unknown');
      const { postUrl, postId } = embed.element.dataset;
      const url = new URL(`/api/v1/statuses/${postId}`, postUrl);
      const { response, data: post } = await fetchPostData(url);
      if (response.status === 404 || response.status === 410) {
        removePost(embed);
        return;
      }
      if (!response.ok || post?.id !== postId) return;
      setAvailability(embed, 'active');
      if (!updateCounts(embed, post.favourites_count, post.replies_count)) return;
      for (const [metric, value, label] of [
        ['likes', post.favourites_count, 'likes'],
        ['replies', post.replies_count, 'comments'],
        ['reblogs', post.reblogs_count, 'boosts'],
      ]) {
        if (!Number.isFinite(value) || value < 0) continue;
        const count = embed.mount.querySelector(`[data-mastodon-count="${metric}"]`);
        if (!count) continue;
        count.textContent = value.toLocaleString();
        count.closest('a').setAttribute('aria-label', `${value.toLocaleString()} ${label}. Open original Mastodon post`);
      }
    }));
    grid.dispatchEvent(new CustomEvent('posts:metrics'));
  }

  async function checkOEmbedPosts(posts, endpoint) {
    await Promise.allSettled(posts.map(async embed => {
      setAvailability(embed, 'unknown');
      const permalink = [...embed.fallback.querySelectorAll('a')].at(-1).href;
      const url = new URL(endpoint);
      url.searchParams.set('url', permalink.split('?')[0]);
      url.searchParams.set('omit_script', 'true');
      const { response, data } = await fetchPostData(url);
      if (response.status === 404 || response.status === 410) {
        removePost(embed);
      } else if (response.ok && typeof data?.html === 'string' && data.html.trim()) {
        setAvailability(embed, 'active');
      }
      // Threads' 400 / Media Not Found also covers legal/privacy restrictions.
      // Keep that ambiguous case, as well as 401/403/429/5xx and network errors.
    }));
  }
  refreshBlueskyCounts();
  refreshMastodonCounts();
  checkOEmbedPosts(xEmbeds, 'https://publish.x.com/oembed');
  checkOEmbedPosts(threadsEmbeds, 'https://graph.threads.com/oembed');
  // Threads sorting uses saved public-page counts. Its cross-origin embed
  // reports height only; live engagement API access requires authentication.
})();
