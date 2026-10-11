// Loaded in <head> (before first paint) so the saved theme never flashes.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('th-theme'); } catch (e) {}
  var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
