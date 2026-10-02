import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SRC = fileURLToPath(new URL('../src/', import.meta.url));
export const BASELINE = fileURLToPath(new URL('style-tokens.baseline.json', import.meta.url));

/** The redesign's viewport and container breakpoints (2.6, 3.2), with the max-width forms just under them. */
const BREAKPOINTS = {
  media: new Set(['560px', '1024px', '1280px', '559.98px', '1023.98px', '1279.98px']),
  container: new Set(['640px', '900px', '639.98px', '899.98px']),
};
/** The files 3.2 defines the tokens in; a `--g-` or `--ion-` property defined anywhere else is a local value like any other. */
const THEME = new Set(['_theme.scss', 'styles.scss']);
const RAW_LENGTH = /(?<![\w.$-])(?!0*\.?0+(?:px|rem|pt)\b)\d*\.?\d+(?:px|rem|pt)\b/;
const TOKEN = /var\(\s*--(?:g|ion)-[\w-]*(?:[^()]|\([^()]*\))*\)/g;
const SIZE_TOKEN = /var\(\s*--g-[\w-]*(?:[^()]|\([^()]*\))*\)/g;
const DECLARATION = /(?<![\w-])(--[\w-]+|\$[\w-]+|-?[a-z][a-z-]*)\s*:\s*((?:url\([^)]*\)|[^;{}"`])*)/g;
const BINDING = /\[(style|attr)\.([\w-]+)(?:\.([\w%]+))?\]['"]?\s*[=:]\s*(["'])(.*?)\4/g;
const COLOR_PROPERTY =
  /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|(?:box|text)-shadow|fill|stroke|(?:backdrop-)?filter|(?:caret|accent|stop|flood|lighting|scrollbar|text-decoration|column-rule|-webkit-text-fill|-webkit-tap-highlight)-color|text-decoration|column-rule)$/;
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

const isToken = (name, file) => THEME.has(file) && /^--(?:g|ion)-/.test(name);
const isLocal = (name, file) => (name.startsWith('--') && !isToken(name, file)) || (name.startsWith('$') && file.endsWith('.scss'));
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const blank = (match) => match.replace(/[^\n]/g, ' ');

/** Comments emptied in place, so line numbers still point at the source. A `//` inside `url()` is no comment. */
function uncommented(text, file) {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (file.endsWith('.html')) out = out.replace(/<!--[\s\S]*?-->/g, blank);
  if (file.endsWith('.scss'))
    out = out.replace(/url\([^)]*\)|(?<![:'"])\/\/.*$/gm, (match) => (match.startsWith('url(') ? match : blank(match)));
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

function category(property, file) {
  if (property === 'font-size' || property === 'font') return 'font-size';
  if (/^border(?:-[a-z]+)*-radius$/.test(property) || (property.endsWith('radius') && isLocal(property, file))) return 'border-radius';
  if (COLOR_PROPERTY.test(property) || isLocal(property, file)) return 'color';
  return null;
}

/** Custom properties and SCSS variables a file defines with a raw length, outside the theme's tokens. */
export function rawDefinitions(source, file) {
  return new Map(
    [...uncommented(source, file).matchAll(DECLARATION)]
      .filter(([, name, value]) => isLocal(name, file) && RAW_LENGTH.test(value))
      .map(([, name, value]) => [name, value.trim()]),
  );
}

/** The value a style binding's expression can produce: its string literals, or a number with the binding's unit. */
function bound(expression, unit) {
  const literals = [...expression.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)].map(([, a, b, c]) =>
    (a ?? b ?? c).replace(/\$\{[^}]*\}/g, ''),
  );
  if (literals.length) return literals.join(' ');
  return unit && /^\s*-?\d*\.?\d+\s*$/.test(expression) ? `${expression.trim()}${unit}` : '';
}

/**
 * Raw values in one file: font sizes, radii and colors not taken from the theme's `--g-` tokens, and `@media` or
 * `@container` widths other than the redesign's breakpoints. It reads declarations, SCSS variables, template style
 * bindings, `ngStyle` and `.style` assignments. A size laundered through a custom property or SCSS variable defined with
 * a raw value counts too, whether this file defines it or `elsewhere` (property names other files define raw) does.
 */
export function scan(source, file, elsewhere = new Set()) {
  const text = uncommented(source, file);
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  const locals = rawDefinitions(source, file);
  const findings = [];
  const seen = new Set();
  const add = (kind, index, snippet) => {
    if (seen.has(`${kind}@${index}`)) return;
    seen.add(`${kind}@${index}`);
    findings.push({ category: kind, line: lineOf(index), text: snippet.trim().replace(/\s+/g, ' ') });
  };
  const check = (property, value, index, snippet) => {
    const kind = category(property, file);
    if (kind === 'color') {
      if (literalColor(value)) add(kind, index, snippet);
    } else if (kind) {
      const laundered = [...value.matchAll(/var\(\s*(--[\w-]+)|(\$[\w-]+)/g)].some(
        ([, name = '', variable = '']) => locals.has(name || variable) || elsewhere.has(name || variable),
      );
      const sized = value.replace(/chrome-font-size\([^)]*\)/g, '').replace(SIZE_TOKEN, '');
      if (RAW_LENGTH.test(sized) || laundered) add(kind, index, snippet);
    }
  };

  for (const match of text.matchAll(DECLARATION)) check(match[1], match[2], match.index, match[0]);
  for (const match of text.matchAll(/(?<![\w-])(fill|stroke|stop-color|flood-color|color)="([^"]*)"/g)) {
    check(match[1], match[2], match.index, match[0]);
  }
  for (const match of text.matchAll(BINDING)) check(match[2], bound(match[5], match[3]), match.index, match[0]);
  for (const style of text.matchAll(/\[ngStyle\]\s*=\s*"([^"]*)"/dg)) {
    for (const pair of style[1].matchAll(/['"]?([\w-]+)(?:\.([\w%]+))?['"]?\s*:\s*([^,}]*)/dg)) {
      check(kebab(pair[1]), bound(pair[3], pair[2]), style.indices[1][0] + pair.indices[1][0], pair[0]);
    }
  }
  for (const match of text.matchAll(/\.style\.(?:setProperty\(\s*['"]([\w-]+)['"]\s*,([^)]*)\)|([a-zA-Z]+)\s*=([^;\n]*))/g)) {
    check(match[1] ?? kebab(match[3]), bound(match[2] ?? match[4]), match.index, match[0]);
  }
  for (const match of text.matchAll(/@(media|container)([^{;]*)/g)) {
    const query = match[2].replace(/\$[\w-]+/g, (name) => locals.get(name) ?? name);
    const lengths = query.match(/\d*\.?\d+(?:px|rem|em|pt)\b/g) ?? [];
    const unknown = lengths.some((length) => !BREAKPOINTS[match[1]].has(length)) || /\$/.test(query);
    if (/width|inline-size/.test(query) && unknown) add(match[1], match.index, match[0]);
  }
  return findings.sort((a, b) => a.line - b.line);
}

/**
 * Every stylesheet, component and template under `src`, by path relative to it. Specs are not shipped, so they are
 * skipped. A raw property one file defines and another uses counts in the user, unless it is a theme token's name.
 */
export function scanTree(src = SRC) {
  const sources = readdirSync(src, { recursive: true })
    .filter((file) => /\.(scss|ts|html)$/.test(file) && !file.endsWith('.spec.ts'))
    .sort()
    .map((file) => [file, readFileSync(src + file, 'utf8')]);
  const tokens = new Set(
    sources.filter(([file]) => THEME.has(file)).flatMap(([, source]) => [...source.matchAll(DECLARATION)].map(([, name]) => name)),
  );
  const elsewhere = new Set(
    sources.flatMap(([file, source]) => [...rawDefinitions(source, file).keys()]).filter((name) => !tokens.has(name)),
  );
  return Object.fromEntries(
    sources.map(([file, source]) => [file, scan(source, file, elsewhere)]).filter(([, findings]) => findings.length),
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
