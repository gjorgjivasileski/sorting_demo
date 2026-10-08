// Only the URL, network, and native embed container are managed here.
// Post bodies, media, links, and counts stay inside the networks' own views.
const NETWORKS = {
  x: { name: 'X' },
  bluesky: { name: 'Bluesky' },
  mastodon: { name: 'Mastodon' },
  threads: { name: 'Threads' },
};

const frameRecords = new Set();
const handleRequests = new Map();
const EMBED_TIMEOUT = 25000;
const THREADS_WIDTH = 384;
let twitterRequest;
let nextId = 0;

export function parsePosts(text) {
  const posts = new Map();
  let skipped = 0;
  let duplicates = 0;
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    const post = parsePost(value);
    if (!post) skipped++;
    else if (posts.has(post.key)) duplicates++;
    else posts.set(post.key, post);
  }
  return { posts: [...posts.values()], skipped, duplicates };
}

function parsePost(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/$/, '');
    const host = url.hostname.replace(/^www\./, '');
    let match;
    if (['x.com', 'twitter.com', 'mobile.twitter.com'].includes(host)
      && (match = url.pathname.match(/\/(?:status|statuses)\/(\d+)$/))) {
      return { network: 'x', id: match[1], key: `x:${match[1]}`, url: `https://x.com/i/status/${match[1]}` };
    }
    if (host === 'bsky.app' && (match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([a-z0-9]+)$/))) {
      return { network: 'bluesky', handle: match[1], id: match[2], key: `bluesky:${match[1]}/${match[2]}`, url: url.href };
    }
    if (['threads.com', 'threads.net'].includes(host)
      && (match = url.pathname.match(/^\/(@[^/]+)\/post\/([\w-]+)$/))) {
      return { network: 'threads', id: match[2], key: `threads:${match[2]}`, url: `https://www.threads.com/${match[1]}/post/${match[2]}` };
    }
    if ((match = url.pathname.match(/^\/@[^/]+\/(\d+)$/))
      || (match = url.pathname.match(/^\/users\/[^/]+\/statuses\/(\d+)$/))) {
      return { network: 'mastodon', id: match[1], key: `mastodon:${host}/${match[1]}`, url: url.href };
    }
  } catch { /* An invalid line should not stop the rest of the feed. */ }
  return null;
}

export function createCard(post) {
  const network = NETWORKS[post.network];
  const element = document.createElement('li');
  element.className = 'post-card';
  element.dataset.network = post.network;
  element.dataset.state = 'waiting';
  element.dataset.post = post.key;
  element.setAttribute('aria-label', `${network.name} post`);
  // Everything interpolated here is a local constant, never post content.
  element.innerHTML = `
    <div class="card-shell"><div class="card-surface" inert>
      <div class="embed-mount" aria-hidden="true" inert></div>
      <div class="embed-placeholder">
        <span class="placeholder-network">${network.name}</span>
        <span class="placeholder-lines" aria-hidden="true"></span>
        <p class="placeholder-message">Waiting to load…</p>
        <a class="original-link" target="_blank" rel="noopener noreferrer">Open on ${network.name} ↗</a>
      </div>
    </div></div>`;
  element.querySelector('.original-link').href = post.url;
  return { post, element, mount: element.querySelector('.embed-mount'), id: ++nextId, started: false };
}

function markReady(card) {
  clearTimeout(card.timeout);
  clearInterval(card.handshake);
  card.element.dataset.state = 'ready';
  card.mount.removeAttribute('aria-hidden');
  card.mount.inert = false;
}

function markUnavailable(card) {
  if (card.element.dataset.state === 'ready') return;
  clearTimeout(card.timeout);
  clearInterval(card.handshake);
  card.element.dataset.state = 'unavailable';
  card.element.querySelector('.placeholder-message').textContent = 'The preview couldn’t load. You can still open the original post.';
}

export async function loadCard(card) {
  if (card.started) return;
  card.started = true;
  card.element.dataset.state = 'loading';
  card.element.querySelector('.placeholder-message').textContent = 'Loading the original post…';
  card.timeout = setTimeout(() => markUnavailable(card), EMBED_TIMEOUT);
  try {
    let { post } = card;
    if (post.network === 'mastodon' && /^\/@[^/]+@[^/]+\//.test(new URL(post.url).pathname)) {
      // A Mastodon instance redirects remote embeds instead of rendering them.
      // Resolve the original, including Bluesky posts shared through Bridgy.
      post = await resolveFederatedPost(post);
      card.post = post;
      const network = NETWORKS[post.network];
      card.element.dataset.network = post.network;
      card.element.setAttribute('aria-label', `${network.name} post`);
      card.element.querySelector('.placeholder-network').textContent = network.name;
      const original = card.element.querySelector('.original-link');
      original.href = post.url;
      original.textContent = `Open on ${network.name} ↗`;
    }
    if (post.network === 'x') {
      const twitter = await loadTwitter();
      const iframe = await twitter.widgets.createTweet(post.id, card.mount, {
        theme: 'light', conversation: 'none', dnt: true, align: 'center',
        width: Math.min(550, Math.round(card.mount.getBoundingClientRect().width)),
      });
      if (!iframe) throw new Error('No X embed returned');
      iframe.title = 'X post';
      markReady(card);
      return;
    }

    let src = `${post.url}/embed`;
    if (post.network === 'bluesky') {
      const did = post.handle.startsWith('did:') ? post.handle : await resolveHandle(post.handle);
      const identity = encodeURIComponent(did).replaceAll('%3A', ':');
      src = `https://embed.bsky.app/embed/${identity}/app.bsky.feed.post/${post.id}?id=${card.id}&colorMode=light`;
    } else if (post.network === 'threads') {
      src += '/';
    }
    const frame = document.createElement('iframe');
    frame.title = `${NETWORKS[post.network].name} post`;
    frame.src = src;
    frame.height = '400';
    frame.setAttribute('scrolling', 'no');
    frame.allow = 'fullscreen';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    card.frame = frame;
    card.origin = new URL(src).origin;
    frameRecords.add(card);
    frame.addEventListener('error', () => markUnavailable(card));
    if (post.network === 'mastodon') {
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
      frame.addEventListener('load', () => requestMastodonHeight(card));
    }
    if (post.network === 'threads') {
      card.resizeObserver = new ResizeObserver(() => scaleThreads(card));
      card.resizeObserver.observe(card.mount);
      scaleThreads(card);
    }
    card.mount.append(frame);
    if (post.network === 'mastodon') {
      // Images can delay iframe.onload even after its message listener is ready.
      card.handshake = setInterval(() => requestMastodonHeight(card), 1000);
      // Re-request after width changes, even on older Mastodon instances.
      card.resizeObserver = new ResizeObserver(() => requestMastodonHeight(card));
      card.resizeObserver.observe(card.mount);
    }
  } catch {
    markUnavailable(card);
  }
}

function requestMastodonHeight(card) {
  card.frame.contentWindow?.postMessage({ type: 'setHeight', id: card.id }, card.origin);
}

function scaleThreads(card) {
  card.mount.style.setProperty('--embed-scale', card.mount.getBoundingClientRect().width / THREADS_WIDTH);
}

window.addEventListener('message', event => {
  for (const card of frameRecords) {
    if (event.source !== card.frame.contentWindow || event.origin !== card.origin) continue;
    const data = event.data;
    let height;
    if (card.post.network === 'threads') {
      if (typeof data === 'number' || (typeof data === 'string' && /^\d+(\.\d+)?$/.test(data))) height = Number(data);
    } else if (data && typeof data === 'object' && String(data.id) === String(card.id)) {
      if (card.post.network === 'bluesky' || data.type === 'setHeight') height = Number(data.height);
    }
    if (!Number.isFinite(height) || height < 50 || height > 20000) return;
    card.frame.height = String(Math.ceil(height));
    if (card.post.network === 'threads') card.mount.style.setProperty('--embed-height', `${Math.ceil(height)}px`);
    markReady(card);
    return;
  }
});

function resolveHandle(handle) {
  if (!handleRequests.has(handle)) {
    handleRequests.set(handle, fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`, {
      signal: AbortSignal.timeout(15000), credentials: 'omit',
    }).then(async response => {
      if (!response.ok) throw new Error('Handle lookup failed');
      const { did } = await response.json();
      if (typeof did !== 'string' || !did.startsWith('did:')) throw new Error('Invalid DID');
      return did;
    }));
  }
  return handleRequests.get(handle);
}

async function resolveFederatedPost(post) {
  const origin = new URL(post.url).origin;
  const response = await fetch(`${origin}/api/v1/statuses/${post.id}`, {
    signal: AbortSignal.timeout(15000), credentials: 'omit',
  });
  if (!response.ok) throw new Error('Federated post lookup failed');
  const status = await response.json();
  let source = new URL(status.url);
  if (source.hostname === 'fed.brid.gy' && source.pathname.startsWith('/r/https://')) {
    source = new URL(source.pathname.slice(3));
  }
  const original = parsePost(source.href);
  if (!original) throw new Error('No supported native embed for this source');
  return original;
}

function loadTwitter() {
  if (!twitterRequest) {
    twitterRequest = new Promise((resolve, reject) => {
      if (window.twttr?.widgets) return resolve(window.twttr);
      const timeout = setTimeout(() => reject(new Error('X timed out')), EMBED_TIMEOUT);
      window.twttr = window.twttr || { _e: [], ready(callback) { this._e.push(callback); } };
      window.twttr.ready(twitter => { clearTimeout(timeout); resolve(twitter); });
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('X script unavailable')); });
      document.head.append(script);
    });
  }
  return twitterRequest;
}
