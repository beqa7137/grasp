/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { DARK_CLASS } from './core/theme-chrome';

type Theme = 'light' | 'dark';
type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

interface Check {
  /** The token in front: text, a line or a knob. */
  fore: string;
  /** The tokens it is painted over, bottom first. */
  over: string[];
  min: number;
}

const SOURCE = readFileSync('src/_theme.scss', 'utf8');
const THEMES: Theme[] = ['light', 'dark'];
const TEXT = 4.5;
const GRAPHIC = 3;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

/** The tokens one block of _theme.scss declares, with each rgb-token's -rgb channels written out as CSS sees them. */
function declared(selector: string): Map<string, string> {
  const body = SOURCE.match(new RegExp(`^${selector.replaceAll('.', '\\.')} \\{([^}]*)\\}`, 'm'))?.[1];
  if (body === undefined) throw new Error(`_theme.scss has no ${selector} block`);
  const tokens = new Map<string, string>();
  for (const [, name, hex] of body.matchAll(/@include rgb-token\(([\w-]+), (#[\da-f]{6})\);/g)) {
    tokens.set(name, hex);
    tokens.set(`${name}-rgb`, channels(hex).join(', '));
  }
  for (const [, name, value] of body.matchAll(/^\s*--g-([\w-]+):\s*([^;]+);/gm)) tokens.set(name, value);
  return tokens;
}

const light = declared(':root');
/** Dark overrides light on the same element, so a token only light declares resolves on dark's channels. */
const TOKENS: Record<Theme, Map<string, string>> = { light, dark: new Map([...light, ...declared(`:root.${DARK_CLASS}`)]) };

function colour(theme: Theme, token: string): Rgba {
  const lookup = (name: string) => {
    const value = TOKENS[theme].get(name);
    if (value === undefined) throw new Error(`--g-${name} is not declared for ${theme}`);
    return value;
  };
  let value = lookup(token);
  while (value.includes('var(')) value = value.replace(/var\(--g-([\w-]+)\)/g, (_, name: string) => lookup(name));
  if (/^#[\da-f]{6}$/i.test(value)) return [...channels(value), 1];
  const rgba = value.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  if (!rgba) throw new Error(`--g-${token} is ${value}, which this check cannot read`);
  return rgba.slice(1).map(Number) as Rgba;
}

/** What shows where the tokens are painted one over another, bottom first. The bottom one must be opaque. */
function paint(theme: Theme, layers: string[]): Rgb {
  return layers
    .map((token) => colour(theme, token))
    .reduce<Rgb>((under, [r, g, b, a]) => [r, g, b].map((c, i) => c * a + under[i] * (1 - a)) as Rgb, [0, 0, 0]);
}

function contrast(a: Rgb, b: Rgb): number {
  const luminance = (rgb: Rgb) => {
    const [red, green, blue] = rgb.map((c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function failures(checks: Check[]): string[] {
  return THEMES.flatMap((theme) =>
    checks.flatMap(({ fore, over, min }) => {
      const ratio = contrast(paint(theme, [...over, fore]), paint(theme, over));
      return ratio < min ? [`${theme}: ${fore} on ${over.join(' + ')} is ${ratio.toFixed(2)}, under ${min}`] : [];
    }),
  );
}

const text = (fore: string, ...over: string[]): Check => ({ fore, over, min: TEXT });
const graphic = (fore: string, ...over: string[]): Check => ({ fore, over, min: GRAPHIC });

const SURFACES = ['bg', 'surface', 'raised'];
/** Where a visualizer sits: a card's surface, or the page itself on a review card. */
const BACKDROPS = ['surface', 'bg'];
const CODE_TOKENS = [
  'code-text',
  'syntax-comment',
  'syntax-keyword',
  'syntax-function',
  'syntax-string',
  'syntax-number',
  'syntax-type',
  'syntax-operator',
];
const CODE_LINES = [[], ['code-active-line'], ['code-trace-line'], ['code-error-line'], ['code-selection']];

describe('theme contrast', () => {
  it('measures as WCAG does', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(contrast([255, 255, 255], [118, 118, 118])).toBeCloseTo(4.54, 2);
  });

  it('keeps text readable on every surface', () => {
    expect(failures(['text', 'muted', 'faint'].flatMap((fore) => SURFACES.map((surface) => text(fore, surface))))).toEqual([]);
  });

  it('keeps text readable on fills and on every visualizer state', () => {
    const checks = [
      ...['accent', 'predict', 'warn', 'pointer-alt'].map((fill) => text('on-fill', fill)),
      text('state-current-ink', 'state-current'),
      ...BACKDROPS.flatMap((backdrop) => [
        ...['state-frontier-fill', 'state-done-fill', 'state-path-fill'].map((fill) => text('text', backdrop, fill)),
        text('muted', backdrop, 'state-visited-fill'),
        text('found-ink', backdrop, 'state-path-fill'),
        text('found-ink', backdrop, 'state-done-fill'),
        text('found-ink', backdrop, 'window', 'state-done-fill'),
        text('muted', backdrop, 'window'),
      ]),
    ];
    expect(failures(checks)).toEqual([]);
  });

  it('keeps code readable on every line highlight', () => {
    const checks = [
      ...CODE_TOKENS.flatMap((fore) => CODE_LINES.map((line) => text(fore, 'surface', ...line))),
      ...BACKDROPS.map((backdrop) => text('syntax-comment', backdrop, 'code-line-on')),
    ];
    expect(failures(checks)).toEqual([]);
  });

  it('keeps lines, walls, state outlines and switch knobs at 3:1', () => {
    const checks = [
      ...SURFACES.flatMap((surface) => [graphic('stroke', surface), graphic('wall', surface), graphic('accent', surface)]),
      ...BACKDROPS.flatMap((backdrop) => [
        graphic('wall', backdrop, 'state-visited-fill'),
        ...['state-frontier-line', 'state-done-line', 'state-path-line', 'state-current', 'window-line'].map((line) =>
          graphic(line, backdrop),
        ),
      ]),
      graphic('knob', 'stroke'),
      graphic('on-fill', 'accent'),
    ];
    expect(failures(checks)).toEqual([]);
  });
});
