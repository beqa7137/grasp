import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SRC = fileURLToPath(new URL('../src/', import.meta.url));
export const BASELINE = fileURLToPath(new URL('style-tokens.baseline.json', import.meta.url));

/** The redesign's viewport breakpoints (2.6), with the max-width forms just under them. */
const BREAKPOINTS = new Set(['560px', '1024px', '1280px', '559.98px', '1023.98px', '1279.98px']);
const RAW_LENGTH = /(?<![\w.$-])(?!0*\.?0+(?:px|rem)\b)\d*\.?\d+(?:px|rem)\b/;
const TOKEN = /var\(\s*--(?:g|ion)-[\w-]*(?:[^()]|\([^()]*\))*\)/g;
const SIZE_TOKEN = /var\(\s*--g-[\w-]*(?:[^()]|\([^()]*\))*\)/g;
const COLOR_PROPERTY =
  /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|(?:box|text)-shadow|fill|stroke|(?:caret|accent|stop|flood|lighting|scrollbar|text-decoration|column-rule|-webkit-text-fill|-webkit-tap-highlight)-color|text-decoration|column-rule)$/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(((?:[^()]|\([^()]*\))*)\)/g;
const HEX = /#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})\b/i;
const NAMED_COLORS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse
  chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
  darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
  deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green
  greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
  lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple
  mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite
  navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink
  plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
  yellowgreen`.split(/\s+/),
);

const isToken = (name) => /^--(?:g|ion)-/.test(name);
const blank = (match) => match.replace(/[^\n]/g, ' ');

/** Comments emptied in place, so line numbers still point at the source. */
function uncommented(text, file) {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (file.endsWith('.html')) out = out.replace(/<!--[\s\S]*?-->/g, blank);
  if (file.endsWith('.scss')) out = out.replace(/(?<![:'"])\/\/.*$/gm, blank);
  if (file.endsWith('.ts')) out = out.replace(/^\s*\/\/.*$/gm, blank);
  return out;
}

function literalColor(value) {
  const tokensOut = value
    .replace(/url\([^)]*\)/g, '')
    .replace(TOKEN, 'token')
    .replace(/var\(\s*--[\w-]+/g, 'var(');
  if (HEX.test(tokensOut)) return true;
  if ([...tokensOut.matchAll(COLOR_FUNCTION)].some(([, args]) => !/\btoken\b|var\(/.test(args))) return true;
  return (tokensOut.toLowerCase().match(/[a-z]+/g) ?? []).some((word) => NAMED_COLORS.has(word));
}

function category(property) {
  if (property === 'font-size' || property === 'font') return 'font-size';
  if (/^border(?:-[a-z]+)*-radius$/.test(property) || (/^--[\w-]*radius$/.test(property) && !isToken(property))) return 'border-radius';
  if (COLOR_PROPERTY.test(property) || (property.startsWith('--') && !isToken(property))) return 'color';
  return null;
}

/**
 * Raw values in one file: font sizes, radii and colors not taken from `--g-` tokens, and `@media` widths other than the
 * redesign's breakpoints. A size laundered through a local custom property defined with a raw value counts too.
 */
export function scan(source, file) {
  const text = uncommented(source, file);
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  const rawLocals = new Set(
    [...text.matchAll(/(?<![\w-])(--[\w-]+)\s*:\s*([^;{}"`]*)/g)]
      .filter(([, name, value]) => !isToken(name) && RAW_LENGTH.test(value))
      .map(([, name]) => name),
  );
  const findings = [];
  const add = (kind, index, snippet) => findings.push({ category: kind, line: lineOf(index), text: snippet.trim().replace(/\s+/g, ' ') });

  for (const match of text.matchAll(/(?<![\w-])(--[\w-]+|-?[a-z][a-z-]*)\s*:\s*([^;{}"`]*)/g)) {
    const [declaration, property, value] = match;
    const kind = category(property);
    if (kind === 'color') {
      if (literalColor(value)) add(kind, match.index, declaration);
    } else if (kind) {
      const sized = value.replace(/chrome-font-size\([^)]*\)/g, '').replace(SIZE_TOKEN, '');
      const laundered = [...sized.matchAll(/var\(\s*(--[\w-]+)/g)].some(([, name]) => rawLocals.has(name));
      if (RAW_LENGTH.test(sized) || laundered) add(kind, match.index, declaration);
    }
  }
  for (const match of text.matchAll(/(?<![\w-])(fill|stroke|stop-color|flood-color|color)="([^"]*)"/g)) {
    if (literalColor(match[2])) add('color', match.index, match[0]);
  }
  for (const match of text.matchAll(/@media([^{;]*)/g)) {
    const lengths = match[1].match(/\d*\.?\d+(?:px|rem|em)\b/g) ?? [];
    if (/width/.test(match[1]) && lengths.some((length) => !BREAKPOINTS.has(length))) add('media', match.index, match[0]);
  }
  return findings.sort((a, b) => a.line - b.line);
}

/** Every stylesheet, component and template under `src`, by path relative to it. Specs are not shipped, so they are skipped. */
export function scanTree(src = SRC) {
  const files = readdirSync(src, { recursive: true })
    .filter((file) => /\.(scss|ts|html)$/.test(file) && !file.endsWith('.spec.ts'))
    .sort();
  return Object.fromEntries(
    files.map((file) => [file, scan(readFileSync(src + file, 'utf8'), file)]).filter(([, findings]) => findings.length),
  );
}

export function counts(tree) {
  return Object.fromEntries(
    Object.entries(tree).map(([file, findings]) => [
      file,
      Object.fromEntries(
        [...new Set(findings.map((f) => f.category))].sort().map((kind) => [kind, findings.filter((f) => f.category === kind).length]),
      ),
    ]),
  );
}

/** Counts may only fall: a rise names each offending line, and a fall asks for the baseline to be lowered. */
export function ratchet(tree, baseline) {
  const current = counts(tree);
  const problems = [];
  for (const file of [...new Set([...Object.keys(current), ...Object.keys(baseline)])].sort()) {
    for (const kind of [...new Set([...Object.keys(current[file] ?? {}), ...Object.keys(baseline[file] ?? {})])].sort()) {
      const now = current[file]?.[kind] ?? 0;
      const allowed = baseline[file]?.[kind] ?? 0;
      if (now > allowed) {
        const lines = tree[file].filter((f) => f.category === kind).map((f) => `    ${file}:${f.line}  ${f.text}`);
        problems.push(`${file}: ${now} raw ${kind} values, baseline ${allowed}. Use the --g- tokens:\n${lines.join('\n')}`);
      } else if (now < allowed) {
        problems.push(
          `${file}: ${now} raw ${kind} values, baseline ${allowed}. Lower the baseline: node scripts/style-tokens.mjs --update`,
        );
      }
    }
  }
  return problems;
}

/** Lowers the baseline to the current counts and never raises one. With no baseline file it records the current counts. */
export function lowered(current, baseline) {
  if (!baseline) return current;
  return Object.fromEntries(
    Object.entries(baseline)
      .map(([file, kinds]) => [
        file,
        Object.fromEntries(
          Object.entries(kinds)
            .map(([kind, n]) => [kind, Math.min(n, current[file]?.[kind] ?? 0)])
            .filter(([, n]) => n > 0),
        ),
      ])
      .filter(([, kinds]) => Object.keys(kinds).length),
  );
}

if (import.meta.main) {
  if (!process.argv.includes('--update')) {
    console.log('Usage: node scripts/style-tokens.mjs --update (delete the baseline first to record moved or renamed files)');
    process.exit(1);
  }
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  const next = lowered(counts(scanTree()), baseline);
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  const total = (b) => Object.values(b ?? {}).reduce((sum, kinds) => sum + Object.values(kinds).reduce((a, n) => a + n, 0), 0);
  console.log(
    `Style baseline: ${baseline ? `${total(baseline)} →` : 'new,'} ${total(next)} raw values in ${Object.keys(next).length} files`,
  );
}
