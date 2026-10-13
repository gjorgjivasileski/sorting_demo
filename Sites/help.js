const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

for (const link of document.querySelectorAll('#toolbar a[href^="#help-"]')) {
  const icon = document.querySelector(`${link.hash} .help-symbol`);
  if (!icon) continue;

  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    icon.classList.remove('is-pulsing');
    if (reducedMotion.matches) return;
    // Restart even when the same link is clicked before its glow has finished.
    void icon.offsetWidth;
    icon.classList.add('is-pulsing');
    // The link's normal fragment navigation still reveals the matching section.
  });

  icon.addEventListener('animationend', event => {
    if (event.animationName === 'help-highlight') icon.classList.remove('is-pulsing');
  });
}

reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    document.querySelectorAll('.help-symbol.is-pulsing').forEach(icon => icon.classList.remove('is-pulsing'));
  }
});
