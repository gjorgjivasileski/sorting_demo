// All pages share the same mobile header behavior.
const toolbar = document.querySelector('#toolbar');
const feed = document.querySelector('#feed');
const mobile = matchMedia('(max-width: 700px)');
let previousScroll = window.scrollY;
let scrollScheduled = false;

window.addEventListener('scroll', () => {
  if (scrollScheduled) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    const current = Math.max(0, window.scrollY);
    if (mobile.matches && feed?.getAttribute('aria-busy') !== 'true') {
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

for (const link of document.querySelectorAll('.control-panel-button')) {
  const isCurrentPage = link.getAttribute('aria-current') === 'page';
  let clicked = false;

  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    clicked = true;
    if (isCurrentPage) event.preventDefault();
    link.classList.toggle('tools-swapped');
  });

  if (isCurrentPage) {
    // Replay on arrival so navigation does not cut off the swap from another page.
    requestAnimationFrame(() => {
      if (clicked) return;
      const hammer = link.querySelector('.tool-hammer');
      if (!hammer) return;
      // Establish the starting position before applying the CSS transition.
      void getComputedStyle(hammer).transform;
      link.classList.add('tools-swapped');
    });
  }
}
