/* Applies the saved theme on simple pages that do not load the full UI bundle. */
(async () => {
  try {
    const { settings } = await CreatorSpot.api.storage.local.get('settings');
    const t = (settings && settings.theme) || 'system';
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch (e) {
    /* opened outside the extension */
  }
})();
