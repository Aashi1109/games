/** A document navigation does not run React's component cleanup. */
export function bindGameDocument(dispose: () => void) {
  const restore = (event: PageTransitionEvent) => {
    // Cached documents contain a disposed engine; boot a fresh page on Back.
    if (event.persisted) window.location.reload();
  };
  window.addEventListener('pagehide', dispose);
  window.addEventListener('pageshow', restore);
  return () => {
    window.removeEventListener('pagehide', dispose);
    window.removeEventListener('pageshow', restore);
  };
}
