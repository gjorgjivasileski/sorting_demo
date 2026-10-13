// Both pages share the same mobile header behavior.
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
