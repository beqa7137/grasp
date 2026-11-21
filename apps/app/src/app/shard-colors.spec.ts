import { hexChannels, themeTokens } from './core/theme.testing';

/**
 * The Sharding widget's six node colors (REDESIGN.md 5.2, R41): dots of every owner sit side by side on the ring, so
 * every pair must stay apart to normal vision and under simulated protanopia and deuteranopia (Machado 2009 at full
 * severity), far from the critical red of the hot key and the accent purple of focus, and at 3:1 on the stage.
 */
type Rgb = [number, number, number];
const light = themeTokens(false);
const TOKENS = { light, dark: new Map([...light, ...themeTokens(true)]) };
const NODES = ['a', 'b', 'c', 'd', 'e', 'f'].map((m) => `shard-${m}`);

const linear = (hex: string): Rgb => hexChannels(hex).map((c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as Rgb;
function oklab([r, g, b]: Rgb): Rgb {
  const [l, m, s] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const PROTAN = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];
const DEUTAN = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
];
const see = (m: number[][], c: Rgb): Rgb => m.map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))) as Rgb;
const delta = (a: Rgb, b: Rgb) => 100 * Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]));
const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('the Sharding node colors', () => {
  for (const [theme, cvd] of [
    ['light', 7.45],
    ['dark', 8.5],
  ] as const) {
    const of = (token: string) => linear(TOKENS[theme].get(token)!);
    const nodes = NODES.map(of);
    const pairs = nodes.flatMap((a, i) => nodes.slice(i + 1).map((b) => [a, b] as const));

    it(`stand apart in ${theme}: 15 to normal vision, ${cvd} under protanopia and deuteranopia`, () => {
      expect(Math.min(...pairs.map(([a, b]) => delta(a, b)))).toBeGreaterThanOrEqual(15);
      for (const m of [PROTAN, DEUTAN]) expect(Math.min(...pairs.map(([a, b]) => delta(see(m, a), see(m, b))))).toBeGreaterThanOrEqual(cvd);
    });

    it(`keep 3:1 on the stage and 12 from the critical red and the focus purple in ${theme}`, () => {
      for (const n of nodes) {
        expect(contrast(n, of('viz-stage'))).toBeGreaterThanOrEqual(3);
        expect(delta(n, of('viz-critical'))).toBeGreaterThanOrEqual(12);
        expect(delta(n, of('accent'))).toBeGreaterThanOrEqual(12);
      }
    });
  }
});
