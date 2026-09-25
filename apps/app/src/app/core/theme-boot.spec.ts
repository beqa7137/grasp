/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { DARK_CLASS } from './theme-chrome';
import { FIRST_PAINT_KEY } from './theme.service';

const BOOT = readFileSync('public/theme-boot.js', 'utf8');
const TOKENS = readFileSync('src/_theme.scss', 'utf8');
/** The page shell as index.html ships it, before any script runs. */
const SHELL = new DOMParser().parseFromString(readFileSync('src/index.html', 'utf8'), 'text/html');

/** The --g-bg that one block of _theme.scss sets. */
const background = (selector: string) =>
  TOKENS.match(new RegExp(`^${selector.replaceAll('.', '\\.')} \\{[^}]*?--g-bg: (#[\\da-f]{6});`, 'm'))?.[1];
const LIGHT_BG = background(':root');
const DARK_BG = background(`:root.${DARK_CLASS}`);

const LIGHT = { dark: false, scheme: 'light', themeColor: LIGHT_BG };
const DARK = { dark: true, scheme: 'dark', themeColor: DARK_BG };

/** What decides the first paint: the palette class and the two metas. */
const look = (doc: Document) => ({
  dark: doc.documentElement.classList.contains(DARK_CLASS),
  scheme: doc.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
  themeColor: doc.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
});

/** Runs theme-boot.js on the page shell, and reports what it set. */
function boot({ saved, systemDark }: { saved?: string; systemDark?: boolean }) {
  document.documentElement.className = SHELL.documentElement.className;
  document.head.replaceChildren(...[...SHELL.head.querySelectorAll('meta')].map((meta) => meta.cloneNode()));
  if (saved !== undefined) localStorage.setItem(FIRST_PAINT_KEY, saved);
  vi.stubGlobal(
    'matchMedia',
    systemDark === undefined ? undefined : (query: string) => ({ matches: systemDark && query === '(prefers-color-scheme: dark)' }),
  );
  new Function(BOOT)();
  return look(document);
}

describe('index.html', () => {
  it('is dark before any script runs, with the dark background from the stylesheet', () => {
    expect(look(SHELL)).toEqual(DARK);
  });
});

describe('theme-boot.js', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.head.innerHTML = '';
    document.documentElement.className = '';
  });

  it('follows the device when nothing is saved', () => {
    expect(boot({ systemDark: false })).toEqual(LIGHT);
    expect(boot({ systemDark: true })).toEqual(DARK);
  });

  it('lets a saved Light or Dark override the device', () => {
    expect(boot({ saved: 'light', systemDark: true })).toEqual(LIGHT);
    expect(boot({ saved: 'dark', systemDark: false })).toEqual(DARK);
  });

  it('ignores anything else saved under the key', () => {
    expect(boot({ saved: 'sepia', systemDark: false })).toEqual(LIGHT);
  });

  it('stays dark where the browser cannot tell the device mode', () => {
    expect(boot({})).toEqual(DARK);
  });
});
