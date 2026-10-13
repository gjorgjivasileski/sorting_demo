import { parsePosts, createCard, loadCard, disposeCard } from './embeds.js?v=batches-20261013';
import { createMasonry } from './layout.js?v=batches-20261013';
import { enableGrabScroll } from './navigation.js';

const feed = document.querySelector('#feed');
const button = document.querySelector('#shuffle');
const interactionButton = document.querySelector('#interact');
const message = document.querySelector('#feed-message');
const announcement = document.querySelector('#shuffle-status');
const quoteSection = document.querySelector('#quote');
const quoteAuthor = document.querySelector('#quote-author');
const quoteText = document.querySelector('#quote-text');
const mobile = matchMedia('(max-width: 700px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const BATCH_SIZE = 14;
let allPosts = [];
let unseenPosts = [];
let cards = [];
let shuffling = false;
let shuffleCount = 0;
let interactive = false;
const quotes = [];
let currentQuote;
const masonry = createMasonry(feed, () => cards, mobile);
const stopGrab = enableGrabScroll(document.querySelector('.demo'), target =>
  !mobile.matches && !shuffling && !(interactive && target.closest('.post-card')));
let cardsByElement = new Map();
// Observe only the current batch; offscreen cards start loading as they approach.
const cardObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const card = cardsByElement.get(entry.target);
    if (!entry.isIntersecting || !card) continue;
    cardObserver.unobserve(entry.target);
    loadCard(card);
  }
}, { rootMargin: '700px 0px' });

function shuffledCopy(posts) {
  const shuffled = [...posts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function showNextBatch() {
  const posts = unseenPosts.splice(0, BATCH_SIZE);
  if (posts.length < BATCH_SIZE) {
    // The unseen queue is now empty. Prefer posts outside the current batch.
    const selectedKeys = new Set(posts.map(post => post.key));
    // Keep the original list identity even when a federated embed resolves elsewhere.
    const currentKeys = new Set(cards.map(card => card.element.dataset.post));
    const seenPosts = shuffledCopy(allPosts.filter(post => !selectedKeys.has(post.key)));
    const otherPosts = seenPosts.filter(post => !currentKeys.has(post.key));
    const currentPosts = seenPosts.filter(post => currentKeys.has(post.key));
    // If fewer than 28 posts exist, repeat only as many as needed to fill the batch.
    posts.push(...[...otherPosts, ...currentPosts].slice(0, BATCH_SIZE - posts.length));
  }
  cardObserver.disconnect();
  cards.forEach(disposeCard);
  cards = shuffledCopy(posts).map(createCard);
  cards.forEach(card => { card.element.querySelector('.card-surface').inert = !interactive; });
  cardsByElement = new Map(cards.map(card => [card.element, card]));
  feed.replaceChildren(...cards.map(card => card.element));
  updatePositions();
  masonry.observe(cards);
  cards.forEach(card => cardObserver.observe(card.element));
}

async function init() {
  try {
    const response = await fetch('./posts.txt', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('posts-unavailable');
    const { posts, skipped } = parsePosts(await response.text());
    allPosts = posts;
    unseenPosts = shuffledCopy(allPosts);
    showNextBatch();
    button.disabled = allPosts.length < 2;
    interactionButton.disabled = !cards.length;
    if (!cards.length) message.textContent = 'No posts yet. Add post URLs to posts.txt, one per line.';
    else if (skipped) message.textContent = `${skipped} ${skipped === 1 ? 'link couldn’t' : 'links couldn’t'} be recognized. The other posts are below.`;
    else message.hidden = true;
  } catch {
    message.textContent = 'The post list couldn’t load. Check that posts.txt is next to index.html, then reload the page.';
  } finally {
    feed.setAttribute('aria-busy', 'false');
  }
}

async function initQuotes() {
  try {
    const response = await fetch('./quotes.txt', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('quotes-unavailable');
    // Each pair of non-empty lines is the quote text followed by its author.
    const lines = (await response.text()).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (let index = 0; index + 1 < lines.length; index += 2) {
      quotes.push({ text: lines[index], author: lines[index + 1] });
    }
    showRandomQuote();
  } catch {
    // Quotes are optional; a missing file must not interrupt the post feed.
  }
}

function showRandomQuote() {
  if (!quotes.length) return;
  // Avoid showing the same pair twice in a row when there is a choice.
  const choices = quotes.filter(quote => quote !== currentQuote);
  currentQuote = choices[Math.floor(Math.random() * choices.length)] || quotes[0];
  quoteAuthor.textContent = currentQuote.author;
  quoteText.textContent = currentQuote.text;
  quoteSection.hidden = false;
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
  if (shuffling || allPosts.length < 2) return;
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
    showRandomQuote();
    showNextBatch();
    if (!reducedMotion.matches) await pause(50);
    await fade(false);
    announcement.textContent = `Showing ${cards.length} posts. Shuffle ${++shuffleCount}.`;
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

initQuotes();
init();
