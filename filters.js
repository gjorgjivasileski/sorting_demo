export const FILTER_STORAGE_KEY = 'archie.filters.v1';
export const CATEGORIES = ['Satire', 'IT', 'Politics', 'Sport', 'Art', 'Space', ''];
export const NETWORKS = ['x', 'mastodon', 'bluesky', 'threads'];

function normalizeFilters(filters) {
  return {
    categories: CATEGORIES.filter(value => !Array.isArray(filters?.categories) || filters.categories.includes(value)),
    networks: NETWORKS.filter(value => !Array.isArray(filters?.networks) || filters.networks.includes(value)),
  };
}

export function readFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY));
    return normalizeFilters(saved?.version === 1 ? saved : null);
  } catch {
    return normalizeFilters(null);
  }
}

export function saveFilters(filters) {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ version: 1, ...normalizeFilters(filters) }));
    return true;
  } catch {
    return false;
  }
}

export function filterPosts(posts, filters) {
  const categories = new Set(filters.categories);
  const networks = new Set(filters.networks);
  return posts.filter(post => categories.has(post.category) && networks.has(post.network));
}
