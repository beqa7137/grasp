import { hexChannels, themeTokens } from './core/theme.testing';

type Theme = 'light' | 'dark';
type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

interface Check {
  fore: string;
  /** Bottom first; the bottom one must be opaque. */
  over: string[];
  min: number;
}

const THEMES: Theme[] = ['light', 'dark'];
const TEXT = 4.5;
const GRAPHIC = 3;

const light = themeTokens(false);
/** Dark overrides light on the same element, so a token only light declares resolves on dark's channels. */
const TOKENS: Record<Theme, Map<string, string>> = { light, dark: new Map([...light, ...themeTokens(true)]) };

function colour(theme: Theme, token: string): Rgba {
  const lookup = (name: string) => {
    const value = TOKENS[theme].get(name);
    if (value === undefined) throw new Error(`--g-${name} is not declared for ${theme}`);
    return value;
  };
  let value = lookup(token);
  while (value.includes('var(')) value = value.replace(/var\(--g-([\w-]+)\)/g, (_, name: string) => lookup(name));
  if (/^#[\da-f]{6}$/i.test(value)) return [...hexChannels(value), 1];
  const rgba = value.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  if (!rgba) throw new Error(`--g-${token} is ${value}, which this check cannot read`);
  return rgba.slice(1).map(Number) as Rgba;
}

function paint(theme: Theme, layers: string[]): Rgb {
  return layers
    .map((token) => colour(theme, token))
    .reduce<Rgb>((under, [r, g, b, a]) => [r, g, b].map((c, i) => c * a + under[i] * (1 - a)) as Rgb, [0, 0, 0]);
}

function luminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(a: Rgb, b: Rgb): number {
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

const SURFACES = ['bg', 'surface', 'raised', 'sunken'];
/** The status tones and their roles (REDESIGN.md 3.2): ink for text, line for borders, soft for a wash, fill for small marks. */
const TONES = ['success', 'warn', 'danger', 'info', 'predict'];
const ROLES = ['ink', 'line', 'soft', 'fill'];
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

/** Where a diagram draws: the player's stage, a card's surface, or the page itself on a review card. */
const VIZ_BACKDROPS = ['viz-stage', 'surface', 'bg'];
/** The checkpoint ticks' colours: pending, right, missed and skipped. */
const TICKS = ['text', 'viz-final-ink', 'viz-critical', 'viz-discarded-ink'];

/**
 * Every diagram role token (REDESIGN.md 3.6) and how it is checked, so a new one cannot ship unchecked. Exempt, by design:
 * `viz-dim`, an opacity whose dimmed text takes the discarded ink instead, and the discarded marks' 40% fade, whose
 * mandatory second encoding is the hatch, checked here at full opacity.
 */
const VIZ: Record<string, 'backdrop' | 'mark and label' | 'ink' | 'soft fill' | 'text' | 'text and mark' | 'mark' | 'track' | 'exempt'> = {
  'viz-stage': 'backdrop',
  'viz-current': 'mark and label',
  'viz-current-ink': 'ink',
  'viz-current-soft': 'soft fill',
  'viz-considering': 'mark',
  'viz-considering-soft': 'soft fill',
  'viz-final': 'mark',
  'viz-final-soft': 'soft fill',
  'viz-final-ink': 'text',
  'viz-discarded-ink': 'text and mark',
  'viz-critical': 'text and mark',
  'viz-guess': 'text and mark',
  'viz-track': 'track',
  'viz-heat-1': 'mark',
  'viz-heat-2': 'mark',
  'viz-heat-3': 'mark',
  'viz-dim': 'exempt',
};
const vizOf = (kinds: string[]) => Object.keys(VIZ).filter((token) => kinds.includes(VIZ[token]));

describe('theme contrast', () => {
  it('measures as WCAG does', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(contrast([255, 255, 255], [118, 118, 118])).toBeCloseTo(4.54, 2);
  });

  it('keeps text readable on every surface', () => {
    expect(failures(['text', 'muted', 'faint'].flatMap((fore) => SURFACES.map((surface) => text(fore, surface))))).toEqual([]);
  });

  it('steps the surfaces: light raises controls to white and sinks wells under the card, dark lightens each step', () => {
    const lightness = (theme: Theme, token: string) => luminance(paint(theme, [token]));
    expect(lightness('light', 'raised')).toBeGreaterThanOrEqual(lightness('light', 'surface'));
    expect(lightness('light', 'sunken')).toBeLessThan(lightness('light', 'surface'));
    expect(lightness('light', 'bg')).toBeLessThan(lightness('light', 'surface'));
    expect(lightness('dark', 'bg')).toBeLessThan(lightness('dark', 'surface'));
    expect(lightness('dark', 'surface')).toBeLessThan(lightness('dark', 'raised'));
    expect(lightness('dark', 'sunken')).toBeLessThan(lightness('dark', 'surface'));
  });

  it('declares the four roles of every status tone in both themes, and no other', () => {
    for (const theme of THEMES) {
      for (const tone of TONES) {
        const roles = [...TOKENS[theme].keys()].filter((name) => name.startsWith(`${tone}-`) && !name.endsWith('-rgb'));
        expect(roles.sort(), `${theme} ${tone}`).toEqual(ROLES.map((role) => `${tone}-${role}`).sort());
      }
    }
  });

  it('keeps status ink readable on every surface and on its own wash, and text on every wash', () => {
    const checks = TONES.flatMap((tone) =>
      SURFACES.flatMap((surface) => [
        text(`${tone}-ink`, surface),
        text(`${tone}-ink`, surface, `${tone}-soft`),
        text('text', surface, `${tone}-soft`),
      ]),
    );
    expect(failures(checks)).toEqual([]);
  });

  it('keeps status lines and fills at 3:1 on every surface, lines on their own wash too, and text on a fill at 4.5:1', () => {
    const checks = TONES.flatMap((tone) => [
      ...SURFACES.flatMap((surface) => [
        graphic(`${tone}-line`, surface),
        graphic(`${tone}-line`, surface, `${tone}-soft`),
        graphic(`${tone}-fill`, surface),
      ]),
      text('on-fill', `${tone}-fill`),
    ]);
    expect(failures(checks)).toEqual([]);
  });

  it('keeps text readable on fills and on every visualizer state', () => {
    const checks = [
      ...['accent', 'predict', 'warn', 'pointer-alt'].map((fill) => text('on-fill', fill)),
      text('state-current-ink', 'state-current'),
      text('state-current', 'raised'),
      ...BACKDROPS.flatMap((backdrop) => [
        ...['state-frontier-fill', 'state-done-fill', 'state-path-fill'].map((fill) => text('text', backdrop, fill)),
        text('muted', backdrop, 'state-visited-fill'),
        text('found-ink', backdrop, 'state-path-fill'),
        text('found-ink', backdrop, 'state-done-fill'),
      ]),
    ];
    expect(failures(checks)).toEqual([]);
  });

  it('keeps code readable on every line highlight', () => {
    const checks = [
      ...CODE_TOKENS.flatMap((fore) => CODE_LINES.map((line) => text(fore, 'surface', ...line))),
      ...BACKDROPS.flatMap((backdrop) =>
        ['text', 'muted', 'syntax-keyword', 'syntax-function', 'syntax-number', 'syntax-comment'].map((fore) =>
          text(fore, backdrop, 'code-line-on'),
        ),
      ),
    ];
    expect(failures(checks)).toEqual([]);
  });

  it('keeps lines, walls, state outlines and switch knobs at 3:1', () => {
    const checks = [
      ...SURFACES.flatMap((surface) => [graphic('stroke', surface), graphic('wall', surface), graphic('accent', surface)]),
      ...BACKDROPS.flatMap((backdrop) => [
        graphic('wall', backdrop, 'state-visited-fill'),
        ...['state-frontier-line', 'state-done-line', 'state-path-line', 'state-current'].map((line) => graphic(line, backdrop)),
      ]),
      graphic('knob', 'stroke'),
      graphic('on-fill', 'accent'),
    ];
    expect(failures(checks)).toEqual([]);
  });

  it('classifies every diagram token in both themes', () => {
    const declared = (theme: Theme) => [...TOKENS[theme].keys()].filter((name) => name.startsWith('viz-') && !name.endsWith('-rgb')).sort();
    expect(declared('light')).toEqual(Object.keys(VIZ).sort());
    expect(declared('dark')).toEqual(Object.keys(VIZ).sort());
  });

  it('keeps diagram text at 4.5:1 and marks at 3:1 wherever a diagram draws', () => {
    const checks = VIZ_BACKDROPS.flatMap((backdrop) => [
      ...vizOf(['text', 'text and mark', 'mark and label']).map((fore) => text(fore, backdrop)),
      ...vizOf(['soft fill']).map((fill) => text('text', backdrop, fill)),
      text('viz-final-ink', backdrop, 'viz-final-soft'),
      text('viz-final-ink', backdrop, 'state-path-fill'),
      ...vizOf(['mark', 'mark and label', 'text and mark']).map((mark) => graphic(mark, backdrop)),
    ]);
    expect(failures([...checks, text('viz-current-ink', 'viz-current')])).toEqual([]);
  });

  it('keeps checkpoint ticks and the thumb at 3:1 on the track, and ticks on their halo', () => {
    const checks = [...TICKS.flatMap((tick) => [graphic(tick, 'viz-track'), graphic(tick, 'bg')]), graphic('accent', 'viz-track')];
    expect(failures(checks)).toEqual([]);
  });
});
