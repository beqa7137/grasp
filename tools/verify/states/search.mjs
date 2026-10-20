import { settle } from '../lib.mjs';

/** Opens the palette (REDESIGN.md 2.9) and searches, from 1024px where the rail is; a phone searches on its own page. */
async function palette(p, query) {
  const launcher = p.locator('app-rail').getByRole('button', { name: 'Search' });
  if (!(await launcher.isVisible())) return 'no rail';
  await launcher.click();
  await p.getByRole('dialog', { name: 'Search' }).waitFor();
  await p.keyboard.type(query);
  await settle(p);
}

/** R15's search: the palette, the search page, and a mock round opened from a result. */
export function searchStates() {
  return [
    { id: 'search-palette', path: '/coding', setup: (p) => palette(p, 'rate') },
    { id: 'search-palette-more', path: '/coding', setup: (p) => palette(p, 'binary search') },
    { id: 'search-palette-none', path: '/coding', setup: (p) => palette(p, 'rate limter') },
    { id: 'search-blank', path: '/today/search' },
    { id: 'search-rate', path: '/today/search?q=rate' },
    { id: 'search-kind', path: '/today/search?q=binary%20search&kind=problem' },
    { id: 'search-none', path: '/today/search?q=rate%20limter' },
    {
      id: 'mock-round-from-search',
      path: '/mock?round=rate-limiter',
      setup: async (p) => {
        await p.getByRole('dialog', { name: 'System design round' }).waitFor();
        await settle(p);
      },
    },
  ];
}
