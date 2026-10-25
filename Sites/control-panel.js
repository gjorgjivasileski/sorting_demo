import { CATEGORIES, FILTER_STORAGE_KEY, readFilters, saveFilters } from '../filters.js?v=controls-20261025';

const buttons = [...document.querySelectorAll('[data-filter-group]')];
const categoryShortcuts = [...document.querySelectorAll('[data-category-selection]')];
const status = document.querySelector('#filter-status');
let filters = readFilters();

function render(saved = true) {
  categoryShortcuts.forEach(button => { button.disabled = false; });
  for (const button of buttons) {
    button.disabled = false;
    button.setAttribute('aria-pressed', String(filters[button.dataset.filterGroup].includes(button.dataset.value)));
  }
  const categories = filters.categories.length;
  const networks = filters.networks.length;
  const summary = `${categories} ${categories === 1 ? 'category' : 'categories'} and ${networks} ${networks === 1 ? 'network' : 'networks'} selected.`;
  status.textContent = saved
    ? `${summary} ${categories && networks ? 'Selections are remembered in this browser.' : 'Select at least one of each to see posts.'}`
    : `${summary} Your browser couldn’t save these filters. Allow site storage to keep them when returning to the feed.`;
}

for (const button of categoryShortcuts) {
  button.addEventListener('click', () => {
    filters.categories = button.dataset.categorySelection === 'all' ? [...CATEGORIES] : [];
    render(saveFilters(filters));
  });
}

for (const button of buttons) {
  button.addEventListener('click', () => {
    const { filterGroup, value } = button.dataset;
    const selected = filters[filterGroup];
    filters[filterGroup] = selected.includes(value)
      ? selected.filter(item => item !== value)
      : [...selected, value];
    render(saveFilters(filters));
  });
}

window.addEventListener('pageshow', () => {
  filters = readFilters();
  render();
});
window.addEventListener('storage', event => {
  if (event.key !== null && event.key !== FILTER_STORAGE_KEY) return;
  filters = readFilters();
  render();
});

render();
