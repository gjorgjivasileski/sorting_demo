import { parsePosts, createCard, loadCard } from './embeds.js';
import { createMasonry } from './layout.js';
import { enableGrabScroll } from './navigation.js';

const feed = document.querySelector('#feed');
const button = document.querySelector('#shuffle');
const interactionButton = document.querySelector('#interact');
const message = document.querySelector('#feed-message');
const announcement = document.querySelector('#shuffle-status');
const toolbar = document.querySelector('#toolbar');
const mobile = matchMedia('(max-width: 700px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let cards = [];
let shuffling = false;
let shuffleCount = 0;
let interactive = false;
const masonry = createMasonry(feed, () => cards, mobile);
const stopGrab = enableGrabScroll(document.querySelector('.demo'), target =>
  !mobile.matches && !shuffling && !(interactive && target.closest('.post-card')));

async function init() {
  try {
    const response = await fetch('./posts.txt', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('posts-unavailable');
    const { posts, skipped } = parsePosts(await response.text());
    cards = posts.map(createCard);
    // Mix networks on arrival; subsequent visits can offer a new perspective.
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    feed.append(...cards.map(card => card.element));
    updatePositions();
    masonry.observe(cards);
    button.disabled = cards.length < 2;
    interactionButton.disabled = !cards.length;
    if (!cards.length) message.textContent = 'No posts yet. Add post URLs to posts.txt, one per line.';
    else if (skipped) message.textContent = `${skipped} ${skipped === 1 ? 'link couldn’t' : 'links couldn’t'} be recognized. The other posts are below.`;
    else message.hidden = true;

    // Start native widgets near the viewport; do not time out offscreen cards.
    const byElement = new Map(cards.map(card => [card.element, card]));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        loadCard(byElement.get(entry.target));
      }
    }, { rootMargin: '700px 0px' });
    cards.forEach(card => observer.observe(card.element));
  } catch {
    message.textContent = 'The post list couldn’t load. Check that posts.txt is next to index.html, then reload the page.';
  } finally {
    feed.setAttribute('aria-busy', 'false');
  }
}

function updatePositions() {
  cards.forEach((card, index) => {
    card.element.setAttribute('aria-posinset', index + 1);
    card.element.setAttribute('aria-setsize', cards.length);
  });
}

interactionButton.addEventListener('click', () => {
  if (shuffling) return;
  stopGrab();
  interactive = !interactive;
  feed.dataset.interactive = String(interactive);
  interactionButton.setAttribute('aria-pressed', String(interactive));
  cards.forEach(card => { card.element.querySelector('.card-surface').inert = !interactive; });
  document.querySelector('#interaction-hint').textContent = interactive
    ? 'Post interaction is on. Links and media are available.'
    : 'Enable “Interact with posts” in the toolbar to use post links and videos.';
  announcement.textContent = interactive ? 'Post interaction enabled.' : 'Post interaction disabled.';
});

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fade(hidden) {
  feed.classList.toggle('is-faded', hidden);
  if (reducedMotion.matches) return;
  const duration = parseFloat(getComputedStyle(feed).getPropertyValue('--fade-duration'));
  await pause(duration + 20);
}

button.addEventListener('click', async () => {
  if (shuffling || cards.length < 2) return;
  stopGrab();
  shuffling = true;
  // aria-disabled keeps keyboard focus on the same button through the effect.
  button.setAttribute('aria-disabled', 'true');
  interactionButton.setAttribute('aria-disabled', 'true');
  feed.inert = true;
  feed.setAttribute('aria-busy', 'true');
  feed.style.minHeight = `${feed.getBoundingClientRect().height}px`;
  announcement.textContent = 'Shuffling posts…';
  try {
    await fade(true);
    // A cycle shuffle guarantees every card leaves its previous position.
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * i);
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    cards.forEach((card, index) => {
      if (typeof feed.moveBefore === 'function') {
        // Moving without detaching preserves live iframes and media state.
        feed.moveBefore(card.element, null);
      }
      // Keeps the single-column mobile fallback in the same visual order.
      card.element.style.order = index;
    });
    updatePositions();
    masonry.layout();
    if (!reducedMotion.matches) await pause(50);
    await fade(false);
    announcement.textContent = `Posts shuffled. New arrangement ${++shuffleCount}.`;
  } finally {
    feed.classList.remove('is-faded');
    feed.style.removeProperty('min-height');
    feed.inert = false;
    feed.setAttribute('aria-busy', 'false');
    button.removeAttribute('aria-disabled');
    interactionButton.removeAttribute('aria-disabled');
    shuffling = false;
  }
});

let previousScroll = window.scrollY;
let scrollScheduled = false;
window.addEventListener('scroll', () => {
  if (scrollScheduled) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    const current = Math.max(0, window.scrollY);
    if (mobile.matches && !shuffling) {
      if (current < 80) toolbar.classList.remove('is-hidden');
      else if (Math.abs(current - previousScroll) > 5) toolbar.classList.toggle('is-hidden', current > previousScroll);
    }
    // Accumulate tiny trackpad movements instead of ignoring slow scrolling.
    if (Math.abs(current - previousScroll) > 5 || current < 80) previousScroll = current;
  });
}, { passive: true });
mobile.addEventListener('change', () => {
  toolbar.classList.remove('is-hidden');
  previousScroll = window.scrollY;
});

init();
