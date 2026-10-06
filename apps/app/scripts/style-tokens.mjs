import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SRC = fileURLToPath(new URL('../src/', import.meta.url));
export const BASELINE = fileURLToPath(new URL('style-tokens.baseline.json', import.meta.url));

/** The redesign's viewport and container breakpoints (2.6, 3.2), with the max-width forms just under them. */
const BREAKPOINTS = {
  media: new Set(['560px', '1024px', '1280px', '559.98px', '1023.98px', '1279.98px']),
  container: new Set(['640px', '900px', '639.98px', '899.98px']),
};
/** 3.2 defines the tokens in `_theme.scss` and in the root rules of `styles.scss`, whose other rules are global component styles. */
const THEME = new Set(['_theme.scss', 'styles.scss']);
const ROOT_SELECTOR = /^(?::root|html)(?:[.:[][^\s>+~]*)?$|^\.ion-palette-dark$|^\[data-theme[^\]]*\]$/;
const RAW_LENGTH = /(?<![\w.$-])(?!0*\.?0+(?:px|rem|pt)\b)\d*\.?\d+(?:px|rem|pt)\b/i;
const QUERY_LENGTH = /\d*\.?\d+(?:px|rem|em|pt)\b/gi;
const DECLARATION = /(?<![\w-])(--[\w-]+|\$[\w-]+|-?[a-z][a-z-]*)\s*:\s*((?:#\{[^}]*\}|url\([^)]*\)|[^;{}"`])*)/g;
/** A `style` key or property holding a declaration string, as in `host: { style: '...' }`: its declarations are read, not it. */
const STYLE_KEY = /(?<![\w$.-])(['"]?)style\1\s*:(?=\s*['"`])/g;
const BINDING = /\[(style|attr)\.([\w-]+)(?:\.([\w%]+))?\]['"]?\s*[=:]\s*(["'])(.*?)\4/g;
const HOST_BINDING =
  /@HostBinding\(\s*['"](style|attr)\.([\w-]+)(?:\.([\w%]+))?['"]\s*\)\s*(?:readonly\s+)?(?:get\s+)?[\w$]+[^=;\n{]*(?:=|\{\s*return)\s*([^;\n]*)/g;
const SVG_ATTRIBUTE = /(?<![\w-])(fill|stroke|stop-color|flood-color|color|font-size|rx|ry)=(["'])(.*?)\2/g;
const STYLE_CALL =
  /\.style(?:\.setProperty\(\s*['"]([\w-]+)['"]\s*,([^)]*)\)|\[\s*['"]([\w-]+)['"]\s*\]\s*=([^;\n]*)|\.([a-zA-Z]+)\s*=([^;\n]*))|\.setStyle\(\s*[^,()]+,\s*['"]([\w-]+)['"]\s*,([^)]*)\)/g;
/** A string-valued key or field in TypeScript, such as a CodeMirror theme's `fontSize: '13px'` or a field `fill = 'red'`. */
const TS_PROPERTY = /(?<![\w$-])['"]?([a-zA-Z][\w-]*)['"]?\s*(?::|=(?![=>]))\s*(?:signal(?:<[^>]*>)?\(\s*)?(['"`])([^'"`\n]*)\2/g;
/** A field or constant holding a literal, so a binding to it by name reads its value. */
const FIELD =
  /(?<![\w$.])([\w$]+)\s*(?::\s*[\w<>|'" ]+)?=(?![=>])\s*(?:signal(?:<[^>]*>)?\(\s*)?((['"`])[^'"`\n]*\3|-?\d*\.?\d+(?![\w.]))/g;
/** A whole string that is a color name, unless it is compared or is one member of a union type. */
const NAMED_LITERAL = /(?<![=!]==?\s*|\bcase\s+|\|\s*)(['"`])([a-z]+)\1(?!\s*\|)/g;
const COLOR_LITERAL = /(['"`])\s*(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|(?:rgba?|hsla?|hwb|oklch|oklab)\([^'"`()]*\))\s*\1/gi;
/** A width query held in a string, as `matchMedia` and `BreakpointObserver` take one; an interpolated width counts. */
const QUERY_LITERAL = /(['"`])((?:\$\{[^}]*\}|[^'"`{}@\n])*\(\s*(?:min-|max-)?(?:width|inline-size)\s*:(?:\$\{[^}]*\}|[^'"`{}@\n])*)\1/g;
const MIXIN = /@mixin\s+([\w-]+)\s*\(((?:[^()]|\([^()]*\))*)\)\s*\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;
const INCLUDE = /@include\s+(?:[\w-]+\.)?([\w-]+)\(([^;{]*)\)/g;
const ARGUMENT_COMMA = /,(?![^(]*\))/;
const NUMBER = /^\s*-?\d*\.?\d+\s*$/;
/** A theme-style name that says what it sizes, so a raw length defined under it counts where it is defined. */
const FONT_NAME = /^--(?:g|ion)-(?:[\w-]*-)?(?:text|font)(?:-|$)/;
const COLOR_PROPERTY =
  /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|(?:box|text)-shadow|fill|stroke|(?:backdrop-)?filter|(?:caret|accent|stop|flood|lighting|scrollbar|text-decoration|column-rule|-webkit-text-fill|-webkit-text-stroke|text-emphasis|-webkit-tap-highlight|shadow)-color|text-decoration|column-rule|-webkit-text-stroke|text-emphasis|fill-style|stroke-style)$/;
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

const isThemeName = (name) => /^--(?:g|ion)-/.test(name);
const isLocal = (name, file, theme) =>
  (name.startsWith('--') && !(theme && isThemeName(name))) || (name.startsWith('$') && file.endsWith('.scss'));
const isOverride = (name, theme) => isThemeName(name) && !theme;
/** Text to read declarations from: a `style` key's string is read as declarations, and `@include` arguments are scored as arguments. */
const declarations = (text) =>
  text.replace(STYLE_KEY, blank).replace(/(@include\s+[\w.-]+\()([^;{]*)\)/g, (_, head, args) => `${head}${blank(args)})`);
const unitless = (value) => (NUMBER.test(value) ? `${value.trim()}px` : value);
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

/** A token's channels with a literal or token alpha, as in `rgba(var(--g-accent-rgb), 0.12)`. */
const TOKEN_CHANNELS = /^\s*var\(\s*--[\w-]+\s*\)\s*(?:[,/]\s*(?:[\d.]+%?|var\(\s*--[\w-]+\s*\)))?\s*$/;

/** A custom property's name never counts, but its fallback does: `var(--g-text, #f00)` renders red wherever the name is unset. */
function literalColor(value) {
  const plain = value.replace(/url\([^)]*\)/g, '');
  if ([...plain.matchAll(COLOR_FUNCTION)].some(([, args]) => !TOKEN_CHANNELS.test(args))) return true;
  const names = plain.replace(COLOR_FUNCTION, '').replace(/var\(\s*--[\w-]+/g, 'var(');
  if (HEX.test(names)) return true;
  return (names.toLowerCase().match(/[a-z]+/g) ?? []).some((word) => NAMED_COLORS.has(word));
}

/** Which offsets lie in a rule that defines tokens: all of `_theme.scss`, and the root rules of `styles.scss`. */
function themeScope(text, file) {
  if (!THEME.has(file)) return () => false;
  if (file === '_theme.scss') return () => true;
  const marks = [[-1, false]];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      const parent = stack.at(-1) ?? false;
      const prelude = text.slice(start, i).trim();
      const root = prelude.split(',').every((selector) => ROOT_SELECTOR.test(selector.trim()));
      stack.push(text[i - 1] === '#' || prelude.startsWith('@') ? parent : root);
      marks.push([i, stack.at(-1)]);
    } else if (text[i] === '}') {
      stack.pop();
      marks.push([i, stack.at(-1) ?? false]);
    }
    if ('{};'.includes(text[i])) start = i + 1;
  }
  return (index) => marks.findLast(([at]) => at < index)[1];
}

/** Outside the theme, a `--g-` or `--ion-` name holding a raw length counts where it is defined when its name or the theme says what it sizes. */
function category(property, file, tokens, theme = false) {
  if (property === 'font-size' || property === 'font') return 'font-size';
  if (/^border(?:-[a-z]+)*-radius$|^r[xy]$/.test(property) || (property.includes('radius') && isLocal(property, file, theme))) {
    return 'border-radius';
  }
  if (isOverride(property, theme) && FONT_NAME.test(property)) return 'font-size';
  if (isOverride(property, theme) && tokens.has(property)) return 'token-override';
  if (COLOR_PROPERTY.test(property) || isLocal(property, file, theme)) return 'color';
  return null;
}

/** Every custom property and SCSS variable a file declares (in its theme rules alone with `themeOnly`), including the names a mixin such as `rgb-token` writes. */
function declared(source, file, themeOnly = false) {
  const text = uncommented(source, file);
  const inTheme = themeOnly ? themeScope(text, file) : () => true;
  const names = new Set([...declarations(text).matchAll(DECLARATION)].filter((match) => inTheme(match.index)).map(([, name]) => name));
  for (const [, name] of text.matchAll(/(?:\[style\.|setProperty\(\s*['"])(--[\w-]+)/g)) names.add(name);
  for (const [, mixin, parameter, body] of text.matchAll(/@mixin\s+([\w-]+)\(\s*\$([\w-]+)[^)]*\)\s*\{((?:[^{}]|#\{[^}]*\})*)\}/g)) {
    const templates = [...body.matchAll(/(--[\w-]*)#\{\$([\w-]+)\}([\w-]*)\s*:/g)].filter(([, , name]) => name === parameter);
    for (const include of text.matchAll(new RegExp(`@include\\s+(?:[\\w-]+\\.)?${mixin}\\(\\s*([\\w-]+)`, 'g'))) {
      if (inTheme(include.index)) for (const [, head, , tail] of templates) names.add(`${head}${include[1]}${tail}`);
    }
  }
  return names;
}

/** Custom properties and SCSS variables a file defines with a raw length, directly or through one defined so before it. */
export function rawDefinitions(source, file) {
  const text = uncommented(source, file);
  const inTheme = themeScope(text, file);
  const raw = new Map();
  for (const match of declarations(text).matchAll(DECLARATION)) {
    const [, name, value] = match;
    if (!isLocal(name, file, inTheme(match.index))) continue;
    const via = [...value.matchAll(/var\(\s*(--[\w-]+)|(\$[\w-]+)/g)].some(([, property, variable]) => raw.has(property ?? variable));
    if (RAW_LENGTH.test(value) || via) raw.set(name, value.trim());
  }
  return raw;
}

/** Fields and constants holding a literal or `signal(literal)`, by name, as the source text of that literal. */
function fieldsOf(text) {
  return new Map([...text.matchAll(FIELD)].map(([, name, literal]) => [name, literal]));
}

/** Each mixin's parameters with what they size: a width query, a font size or a radius. */
function mixinParameters(text, file) {
  const out = new Map();
  for (const [, name, list, body] of text.matchAll(MIXIN)) {
    const parameters = list.split(ARGUMENT_COMMA).map((entry) => {
      const parameter = entry.trim().match(/^\$[\w-]+/)?.[0];
      const uses = (value) => !!parameter && new RegExp(`\\$${parameter.slice(1)}(?![\\w-])`).test(value);
      const query = [...body.matchAll(/@(media|container)([^{;]*)/g)].find(([, , condition]) => uses(condition))?.[1];
      const size = [...body.matchAll(DECLARATION)]
        .map(([, property, value]) => uses(value) && category(property, file, new Set()))
        .find((kind) => kind === 'font-size' || kind === 'border-radius');
      return { name: parameter, kind: query ?? size ?? null };
    });
    if (parameters.some(({ kind }) => kind)) out.set(name, parameters);
  }
  return out;
}

/**
 * A query condition's features without their parentheses, at any depth of grouping: `(a: 1px) and ((b: 2px) or (c: 3px))`
 * gives a, b and c, and a feature's own functions stay whole, as in `(max-width: calc(700px - 1px))`.
 */
function queryFeatures(condition) {
  const features = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < condition.length; i++) {
    if (condition[i] === '(') {
      if (depth++ === 0) start = i + 1;
    } else if (condition[i] === ')' && --depth === 0) {
      const inner = condition.slice(start, i).trim();
      features.push(...(/^(?:\(|not\b)/i.test(inner) ? queryFeatures(inner) : [inner]));
    }
  }
  return features;
}

/** The value a style binding's expression can produce: its string literals, or a number with the binding's unit, read through a field it names. */
function bound(expression, unit, fields = new Map()) {
  const source = fields.get(expression.match(/^\s*(?:this\.)?([\w$]+)(?:\(\))?\s*$/)?.[1]) ?? expression;
  const literals = [...source.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)].map(([, a, b, c]) => (a ?? b ?? c).replace(/\$\{[^}]*\}/g, ''));
  if (literals.length) return literals.join(' ');
  return unit && NUMBER.test(source) ? `${source.trim()}${unit}` : '';
}

/**
 * Raw values in one file; tools/verify/README.md lists what counts and where it is read. The tree context adds what one
 * file cannot see: `elsewhere` (names other files define raw), `tokens` (names the theme defines, so an override counts
 * where it is made), `defined` (every name declared anywhere, so `var(--g-nope, 13px)` counts), `mixins` (what each
 * mixin's parameters size, so each `@include` is scored) and, for a template, `fields` (its component's literal fields).
 */
export function scan(source, file, { elsewhere = new Set(), tokens = new Set(), defined = null, mixins = new Map(), fields = null } = {}) {
  const text = uncommented(source, file);
  const inTheme = themeScope(text, file);
  const members = fields ?? (file.endsWith('.ts') ? fieldsOf(text) : new Map());
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  const locals = rawDefinitions(source, file);
  const sized = new Map([...mixins, ...mixinParameters(text, file)]);
  const findings = [];
  const spans = [];
  const add = (kind, index, snippet) => {
    const end = index + snippet.length;
    if (spans.some((span) => span.kind === kind && index < span.end && end > span.start)) return;
    spans.push({ kind, start: index, end });
    findings.push({ index, category: kind, line: lineOf(index), text: snippet.trim().replace(/\s+/g, ' ') });
  };
  const check = (property, value, index, snippet) => {
    const theme = inTheme(index);
    const kind = category(property, file, tokens, theme);
    if (!kind) return;
    const unknown = defined && [...value.matchAll(/var\(\s*(--g-[\w-]+)/g)].some(([, name]) => !defined.has(name));
    if (kind === 'color' || isOverride(property, theme)) {
      if (literalColor(value) || (kind === 'color' && unknown)) add('color', index, snippet);
    }
    if (kind !== 'color') {
      const laundered = [...value.matchAll(/var\(\s*(--[\w-]+)|(\$[\w-]+)/g)].some(
        ([, name = '', variable = '']) => locals.has(name || variable) || elsewhere.has(name || variable),
      );
      if (RAW_LENGTH.test(value.replace(/chrome-font-size\([^)]*\)/g, '')) || laundered || unknown) add(kind, index, snippet);
    }
  };
  const binding = (type, property, unit, expression, index, snippet) => {
    const value = bound(expression, unit ?? (type === 'attr' ? 'px' : undefined), members);
    check(kebab(property), type === 'attr' ? unitless(value) : value, index, snippet);
  };
  // Only a width feature's length must be a breakpoint, so a height joined to it with `and` stays free.
  const query = (kind, condition, index, snippet) => {
    const widths = queryFeatures(condition).filter((feature) => /width|inline-size/i.test(feature));
    const unknown = (feature) =>
      /\$/.test(feature) || (feature.match(QUERY_LENGTH) ?? []).some((length) => !BREAKPOINTS[kind].has(length.toLowerCase()));
    if (widths.some(unknown)) add(kind, index, snippet);
  };
  const resolved = (value) => value.replace(/\$[\w-]+/g, (name) => locals.get(name) ?? name);

  for (const match of declarations(text).matchAll(DECLARATION)) check(match[1], match[2], match.index, match[0]);
  for (const match of text.matchAll(SVG_ATTRIBUTE)) check(match[1], unitless(match[3]), match.index, match[0]);
  for (const match of text.matchAll(BINDING)) binding(match[1], match[2], match[3], match[5], match.index, match[0]);
  for (const match of text.matchAll(HOST_BINDING)) binding(match[1], match[2], match[3], match[4], match.index, match[0]);
  for (const style of text.matchAll(/\[(?:ngStyle|style)\]\s*=\s*(["'])(.*?)\1/dgs)) {
    for (const pair of style[2].matchAll(/['"]?([\w-]+)(?:\.([\w%]+))?['"]?\s*:\s*([^,}]*)/dg)) {
      binding('style', pair[1], pair[2], pair[3], style.indices[2][0] + pair.indices[1][0], pair[0]);
    }
  }
  for (const match of text.matchAll(STYLE_CALL)) {
    binding(
      'style',
      match[1] ?? match[3] ?? match[7] ?? match[5],
      undefined,
      match[2] ?? match[4] ?? match[8] ?? match[6],
      match.index,
      match[0],
    );
  }
  for (const match of text.matchAll(/@(media|container)([^{;]*)/g)) query(match[1], resolved(match[2]), match.index, match[0]);
  for (const match of text.matchAll(INCLUDE)) {
    if (!inTheme(match.index) && literalColor(match[2])) add('color', match.index, match[0]);
    const parameters = sized.get(match[1]);
    if (!parameters) continue;
    match[2].split(ARGUMENT_COMMA).forEach((argument, position) => {
      const [, keyword, value = argument] = argument.match(/^\s*(\$[\w-]+)\s*:\s*([\s\S]*)$/) ?? [];
      const kind = (keyword ? parameters.find(({ name }) => name === keyword) : parameters[position])?.kind;
      if (kind === 'media' || kind === 'container') query(kind, `(width: ${resolved(value)})`, match.index, match[0]);
      else if (kind) check(kind, resolved(value), match.index, match[0]);
    });
  }
  if (file.endsWith('.ts')) {
    for (const match of text.matchAll(TS_PROPERTY)) check(kebab(match[1]), match[3], match.index, match[0]);
    for (const match of text.matchAll(COLOR_LITERAL)) add('color', match.index, match[0]);
    for (const match of text.matchAll(NAMED_LITERAL)) if (NAMED_COLORS.has(match[2])) add('color', match.index, match[0]);
    for (const match of text.matchAll(QUERY_LITERAL)) query('media', match[2], match.index, match[0]);
  }
  return findings.sort((a, b) => a.index - b.index).map(({ index: _index, ...finding }) => finding);
}

/**
 * Every stylesheet, component and template under `src`, by path relative to it. Specs are not shipped, so they are
 * skipped. A raw property one file defines and another uses counts in the user, unless the theme defines that name:
 * then the override counts where it is made.
 */
export function scanTree(src = SRC) {
  const sources = readdirSync(src, { recursive: true })
    .filter((file) => /\.(scss|ts|html)$/.test(file) && !file.endsWith('.spec.ts'))
    .sort()
    .map((file) => [file, readFileSync(src + file, 'utf8')]);
  const scripts = new Map(sources.filter(([file]) => file.endsWith('.ts')));
  const tokens = new Set(sources.filter(([file]) => THEME.has(file)).flatMap(([file, source]) => [...declared(source, file, true)]));
  const context = {
    tokens,
    defined: new Set(sources.flatMap(([file, source]) => [...declared(source, file)])),
    elsewhere: new Set(sources.flatMap(([file, source]) => [...rawDefinitions(source, file).keys()]).filter((name) => !tokens.has(name))),
    mixins: new Map(sources.flatMap(([file, source]) => [...mixinParameters(uncommented(source, file), file)])),
  };
  const fields = (file) => {
    const component = file.replace(/\.html$/, '.ts');
    return file.endsWith('.html') && scripts.has(component) ? fieldsOf(uncommented(scripts.get(component), component)) : null;
  };
  return Object.fromEntries(
    sources
      .map(([file, source]) => [file, scan(source, file, { ...context, fields: fields(file) })])
      .filter(([, findings]) => findings.length),
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
