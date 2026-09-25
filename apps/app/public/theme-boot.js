// Sets the theme before the stylesheet paints, so a light choice never flashes dark. It is a file of its own because
// the page's Content-Security-Policy blocks inline scripts. Keep the key and the two backgrounds in step with
// ThemeService and _theme.scss (theme-boot.spec.ts checks both).
(function () {
  let saved = null;
  try {
    saved = localStorage.getItem('CapacitorStorage.grasp.theme');
  } catch {}
  const dark = saved === 'dark' || (saved !== 'light' && (!window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches));
  document.documentElement.classList.toggle('ion-palette-dark', dark);
  const scheme = document.querySelector('meta[name="color-scheme"]');
  if (scheme) scheme.setAttribute('content', dark ? 'dark' : 'light');
  const color = document.querySelector('meta[name="theme-color"]');
  if (color) color.setAttribute('content', dark ? '#0b0d12' : '#f4f5f9');
})();
