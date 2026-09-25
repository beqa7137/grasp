/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
/** The only files that may write a colour out: the tokens, and index.html's metas for the look without JavaScript. */
const COLOUR_SOURCES = new Set(['_theme.scss', 'index.html']);

/** Comments, where an issue number or a colour named in prose is not styling. `://` is a URL, not a comment. */
const COMMENT = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<!:)\/\/.*/g;
/** An Angular template reference such as `<button #add>`, whose name can look like a hex colour. */
const TEMPLATE_REF = /(?<=<[a-z][\w-]*(?:\s+[^\s=>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*\s+)#[\w-]+/gi;
const HEX = /(?<![\w&./])#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})(?![\w-])/gi;
/** A colour function, unless it is built on a token's channels, as rgba(var(--g-accent-rgb), 0.5) is. */
const COLOUR_FUNCTION =
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((?!\s*var\()|\bcolor\(\s*(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65)\b/gi;
/** Where a colour keyword is a colour: the value of a colour property or attribute, and the arguments of a colour function. */
const COLOUR_CONTEXT = [
  /(?:--[\w-]+|[\w-]*(?:color|background|border|outline|fill|stroke|shadow)[\w-]*)\]?\s*[:=]\s*("[^"]*"|'[^']*'|[^;{}]*)/gi,
  /\b(?:color-mix|(?:repeating-)?(?:linear|radial|conic)-gradient|drop-shadow)\(((?:[^()]|\([^()]*\))*)\)/gi,
];
/** CSS's basic colour keywords and the extended ones most often typed. */
const NAMED_COLOURS =
  'black silver gray grey white maroon red purple fuchsia green lime olive yellow navy blue teal aqua orange pink brown ' +
  'gold cyan magenta violet indigo coral crimson salmon tomato khaki beige ivory lavender turquoise tan';
const NAMED_COLOUR = new RegExp(`(?<![\\w-])(?:${NAMED_COLOURS.replaceAll(' ', '|')})(?![\\w-])`, 'i');

/** The lines of a source that write a colour out instead of taking it from a token. */
function literalColours(source: string): string[] {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  const code = source.replace(COMMENT, blank).replace(TEMPLATE_REF, blank);
  const found = [...code.matchAll(HEX), ...code.matchAll(COLOUR_FUNCTION)].map((m) => m.index);
  for (const context of COLOUR_CONTEXT) {
    for (const m of code.matchAll(context)) if (NAMED_COLOUR.test(m[1])) found.push(m.index);
  }
  const lines = source.split('\n');
  const lineOf = (index: number) => source.slice(0, index).split('\n').length;
  return [...new Set(found.map(lineOf))].sort((a, b) => a - b).map((line) => `${line}: ${lines[line - 1].trim()}`);
}

describe('theme tokens', () => {
  it('give every colour, so the light and dark themes both reach every screen', () => {
    const files = (readdirSync(SRC, { recursive: true }) as string[]).filter(
      (f) => /\.(?:ts|scss|html)$/.test(f) && !f.endsWith('.spec.ts') && !COLOUR_SOURCES.has(f),
    );
    const literals = files.flatMap((file) => literalColours(readFileSync(join(SRC, file), 'utf8')).map((line) => `${file}:${line}`));
    expect(literals, 'add a token to src/_theme.scss instead').toEqual([]);
  });

  it('are what that check looks for: a colour written out in any syntax, and nothing else', () => {
    const written = [
      'color: #fff;',
      "{ color: '#0b0d12' }",
      'fill: #0b0d12cc;',
      'background: rgba(0, 0, 0, 0.5);',
      'color: oklch(70% 0.1 250);',
      'color: color(display-p3 1 0 0);',
      'color: white;',
      '<circle fill="black" />',
      "{ backgroundColor: 'white' }",
      'border: 1px solid red;',
      'box-shadow:\n  0 0 0 3px navy;',
      'background: color-mix(in srgb, var(--g-accent), white 20%);',
      'background: linear-gradient(var(--g-bg), black);',
    ];
    const notColours = [
      '// see #1234',
      '/* was #0b0d12 */',
      '<button #add (click)="add()">Add</button>',
      '<a href="https://example.com/#fade">',
      '&#123;',
      'color: var(--g-text);',
      'border-color: rgba(var(--g-danger-rgb), 0.45);',
      'border-color: color-mix(in srgb, var(--g-danger) 45%, transparent);',
      'white-space: nowrap;',
      'border: 1px solid CanvasText;',
      'transition: background 0.2s, border-color 0.2s;',
      '<p>Red, green and blue</p>',
      'this.color(name)',
    ];
    for (const sample of written) expect(literalColours(sample), sample).not.toEqual([]);
    for (const sample of notColours) expect(literalColours(sample), sample).toEqual([]);
  });
});
