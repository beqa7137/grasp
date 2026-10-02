import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { BASELINE, counts, lowered, ratchet, scan, scanTree } from './style-tokens.mjs';

const flagged = (css, file = 'x.scss') => scan(css, file).map((f) => f.category);

test('flags raw font sizes, radii, colors and one-off breakpoints', () => {
  for (const [css, category] of [
    ['.a { font-size: 13px; }', 'font-size'],
    ['.a { font: 600 11px var(--g-font-mono); }', 'font-size'],
    ['.a { font-size: clamp(1.625rem, 5vw, 2.25rem); }', 'font-size'],
    ['.a { font-size: var(--size, 12px); }', 'font-size'],
    ['.a { font-size: var(--ion-safe-size, 12px); }', 'font-size'],
    ['.a { font-size: var(--g-text-s, 13px); }', 'font-size'],
    ['.a { border-radius: var(--g-radius, 12px); }', 'border-radius'],
    ['.a { color: var(--g-text, #f00); }', 'color'],
    ['.a { font-size: 13PX; }', 'font-size'],
    ['@media (max-width: 700PX) { .a { display: none; } }', 'media'],
    ['.a { -webkit-text-stroke-color: #f00; }', 'color'],
    ['.a { text-emphasis-color: #f00; }', 'color'],
    ['.a { @include tint(#f00); }', 'color'],
    ['.a { border-radius: 12px; }', 'border-radius'],
    ['.a { border-top-left-radius: 4px; }', 'border-radius'],
    ['ion-modal { --border-radius: 16px; }', 'border-radius'],
    ['.a { color: #ff0000; }', 'color'],
    ['.a { background: rgba(0, 0, 0, 0.4); }', 'color'],
    ['.a { border: 1px solid white; }', 'color'],
    ['.a { box-shadow: 0 1px 2px hsl(220 10% 10% / 0.3); }', 'color'],
    ['ion-button { --background: #222; }', 'color'],
    ['.a { --tint: #ff0000; }', 'color'],
    ['@media (max-width: 600px) { .a { display: none; } }', 'media'],
    ['@media (min-width: 60em) { .a { display: none; } }', 'media'],
    ['@container (max-width: 700px) { .a { display: none; } }', 'container'],
    ['.a { font-size: 10pt; }', 'font-size'],
    ['.a { filter: drop-shadow(0 0 2px #f00); }', 'color'],
    ['.a { background: url("x.svg") #f00; }', 'color'],
    ['.a { background: url(//x.com/a.png); color: #f00; }', 'color'],
    ['.a { background: rgba(var(--g-accent-rgb, 255, 0, 0), 0.5); }', 'color'],
    ['.a { color: rgb(var(--x, 255 0 0)); }', 'color'],
    ['.a { --o: 0.5; background: rgb(255 0 0 / var(--o)); }', 'color'],
    ['.a { @include x.tint(#f00); }', 'color'],
    ['.a { font-size: #{13px}; }', 'font-size'],
  ]) {
    assert.deepEqual(flagged(css), [category], css);
  }
});

test('allows tokens, the chrome helper, relative and zero values, token tints and the sanctioned breakpoints', () => {
  for (const css of [
    '.a { font-size: var(--g-text-s); }',
    '.a { color: var(--g-text, var(--g-accent)); opacity: var(--g-dim, 0.5); }',
    '.a { font-size: chrome-font-size(13px); }',
    '.a { font: 500 #{chrome-font-size(11px)} / 1 var(--ion-font-family); }',
    '.a { font-size: inherit; font: inherit; font-size: 1.2em; font-size: 90%; }',
    '.a { border-radius: 0; border-radius: 0px; border-radius: 50%; border-radius: var(--g-radius-sm); }',
    '.a { color: var(--g-text); background: rgba(var(--g-found-rgb), 0.12); border-color: transparent; fill: currentColor; }',
    '.a { color: rgb(var(--g-accent-rgb) / var(--g-dim)); background: rgba(var(--g-found-rgb), 12%); }',
    '.a { background: linear-gradient(180deg, rgba(var(--g-predict-rgb), 0.08), rgba(var(--ion-text-color-rgb), 0.02)); }',
    '.a { background: url(icons/red-dot.svg); }',
    '@media (prefers-reduced-motion: reduce) { .a { transition: none; } }',
    '@media (max-width: 560px) { .a { display: none; } }',
    '@media (min-width: 1024px) and (max-width: 1279.98px) { .a { display: none; } }',
    '@container (min-width: 640px) and (max-width: 899.98px) { .a { display: none; } }',
    '.a { --g-legend-gap: 14px; gap: var(--g-legend-gap); --g-switch-on: var(--g-predict); }',
    '.a { /* font-size: 13px; */ }',
    '.a {\n  // border-radius: 12px;\n}',
  ]) {
    assert.deepEqual(flagged(css), [], css);
  }
});

test('the theme and the root rules of styles.scss alone define tokens: a --g- or --ion- property elsewhere is a local value', () => {
  const theme = ':root { --g-radius: 14px; --g-accent: #5846dc; --ion-color-primary: #5846dc; }';
  assert.deepEqual(flagged(theme, '_theme.scss'), []);
  assert.deepEqual(flagged(theme, 'styles.scss'), []);
  assert.deepEqual(flagged(theme, 'app/x.scss'), ['border-radius', 'color', 'color']);
  assert.deepEqual(
    flagged('@media (prefers-color-scheme: dark) {\n  :root:not(.light), html.ion-palette-dark { --g-accent: #fff; }\n}', 'styles.scss'),
    [],
  );
  assert.deepEqual(flagged('app-tabs { --g-text-s: 9px; --g-accent: #ff0000; --g-radius: 1px; }', 'styles.scss'), [
    'font-size',
    'color',
    'border-radius',
  ]);
  assert.deepEqual(flagged(':root { --g-gap: 4px; }\n.chip { color: #f00; }', 'styles.scss'), ['color']);
  for (const [css, file, category] of [
    ['.a { --g-my-red: #ff0000; color: var(--g-my-red); }', 'x.scss', 'color'],
    [':host { --ion-color-base: #ff0000; }', 'x.scss', 'color'],
    ['styles: `.a { --g-hot: rgb(255 0 0); }`', 'x.ts', 'color'],
    ['.a { --g-my-size: 13px; font-size: var(--g-my-size); }', 'x.scss', 'font-size'],
    ['.a { --g-text-s: 13px; }', 'app/x.scss', 'font-size'],
    [':host { --g-radius-m: 2px; }', 'app/x.scss', 'border-radius'],
    [':host { --ion-font-size: 13px; }', 'app/x.scss', 'font-size'],
    ['styles: `:host { --g-text-s: 9px; }`', 'app/x.ts', 'font-size'],
  ]) {
    assert.deepEqual(flagged(css, file), [category], css);
  }
});

test('counts SCSS variables like local custom properties, and resolves them in queries', () => {
  assert.deepEqual(flagged('$danger: #ff0000;\n.a { color: $danger; }'), ['color']);
  assert.deepEqual(scan('$s: 13px;\n.a { font-size: $s; }', 'x.scss'), [{ category: 'font-size', line: 2, text: 'font-size: $s' }]);
  assert.deepEqual(flagged('$bp: 700px;\n@media (max-width: $bp) { .a { display: none; } }'), ['media']);
  assert.deepEqual(flagged('@use "bp";\n@media (max-width: bp.$wide) { .a { display: none; } }'), ['media']);
  assert.deepEqual(flagged('$bp: 1024px;\n@media (min-width: $bp) { .a { display: none; } }'), []);
});

test('reads SCSS interpolation, and mixin parameters that size a font, a radius or a width query', () => {
  for (const [css, categories] of [
    ['$s: 13px;\n.a { font-size: #{$s}; }', ['font-size']],
    ['$s: 13px;\n:host { --g-text-s: #{$s}; }', ['font-size']],
    ['$s: 9px;\n.y { --cell: #{$s}; border-radius: var(--cell); }', ['border-radius']],
    ['@mixin text($s) { font-size: $s; }\n.z { @include text(11px); }', ['font-size']],
    [
      '@mixin round($c, $r: var(--g-radius)) { color: $c; border-radius: #{$r}; }\n.z { @include round(var(--g-text), $r: 9px); }',
      ['border-radius'],
    ],
    ['@mixin mq($w) { @media (max-width: $w) { @content; } }\n$w: 700px;\n.a { @include mq($w) { display: none; } }', ['media', 'media']],
    ['@mixin mq($w) { @media (max-width: $w) { @content; } }\n.a { @include mq($w: 1024px) { display: none; } }', ['media']],
    ['@mixin text($s) { font-size: $s; }\n.z { @include text(var(--g-text-s)); }', []],
  ]) {
    assert.deepEqual(flagged(css, 'app/x.scss'), categories, css);
  }
});

test('reads string literals in style bindings, ngStyle, host bindings and .style assignments', () => {
  for (const [source, file, categories] of [
    [`<p [style.color]="'#ff0000'">`, 'x.html', ['color']],
    [`<p [style.font-size.px]="13">`, 'x.html', ['font-size']],
    [`<p [style.background]="hot ? 'red' : 'var(--g-surface)'">`, 'x.html', ['color']],
    [`<rect [attr.fill]="'#ff0000'" />`, 'x.html', ['color']],
    [`<p [ngStyle]="{ 'color': '#ff0000', 'font-size': '13px' }">`, 'x.html', ['color', 'font-size']],
    [`<p [ngStyle]="{ fontSize: '13px', color: 'var(--g-text)' }">`, 'x.html', ['font-size']],
    [`host: { '[style.color]': "'red'" }`, 'x.ts', ['color']],
    [`el.style.color = '#ff0000';\nel.style.setProperty('border-radius', '12px');`, 'x.ts', ['color', 'border-radius']],
    [`<p [style.fontSize.px]="13">`, 'x.html', ['font-size']],
    [`<p [style.backgroundColor]="'#ff0000'">`, 'x.html', ['color']],
    [`@HostBinding('style.color') c = '#ff0000';`, 'x.ts', ['color']],
    [`@HostBinding('style.font-size') s = '13px';`, 'x.ts', ['font-size']],
    [`@HostBinding('attr.fill') get fill() { return 'red'; }`, 'x.ts', ['color']],
    [`this.renderer.setStyle(el, 'border-radius', '12px');`, 'x.ts', ['border-radius']],
    [`el.style['font-size'] = '13px';`, 'x.ts', ['font-size']],
    [`red = '#ff0000';`, 'x.ts', ['color']],
    [`ctx.fillStyle = 'red';\nctx.strokeStyle = 'hsl(0 100% 50%)';`, 'x.ts', ['color', 'color']],
    [`const theme = { '&': { fontSize: '13px', backgroundColor: 'white' } };`, 'x.ts', ['font-size', 'color']],
    [`const wide = matchMedia('(min-width: 700px)');`, 'x.ts', ['media']],
    [`this.observer.observe(['(max-width: 599.98px)']);`, 'x.ts', ['media']],
    ['const wide = matchMedia(`(max-width: ${W}px)`);', 'x.ts', ['media']],
    [`<p [style]="{ 'font-size': '13px', color: 'red' }">`, 'x.html', ['font-size', 'color']],
    [`<p [style]="{ fontSize: '13px' }">`, 'x.html', ['font-size']],
    [`<p [style]="'font-size: 13px'">`, 'x.html', ['font-size']],
    [`<p [ngStyle]='{ "border-radius": "12px" }'>`, 'x.html', ['border-radius']],
    [`host: { style: 'font-size: 13px; color: red' }`, 'x.ts', ['font-size', 'color']],
    [`<rect [attr.rx]="6" [attr.font-size]="13" />\n<text [attr.font-size]="'13'">`, 'x.html', ['border-radius', 'font-size', 'font-size']],
    [`this.renderer.setStyle(el, 'fontSize', '13px');\nel.style['borderRadius'] = '12px';`, 'x.ts', ['font-size', 'border-radius']],
    [`readonly fontSize = signal('13px');`, 'x.ts', ['font-size']],
    [`const tone = { hot: 'tomato' };\nconst COLORS = ['tomato', 'gold'];`, 'x.ts', ['color', 'color', 'color']],
    [
      'readonly labelSize = \'9px\';\nreadonly corner = signal(3);\ntemplate: `<b [style.font-size]="labelSize" [style.border-radius.px]="corner()">`',
      'x.ts',
      ['font-size', 'border-radius'],
    ],
  ]) {
    assert.deepEqual(flagged(source, file), categories, source);
  }
  for (const source of [
    `<path [style.stroke]="color(a.node)" [style.--c]="color(p.name)" [style.width.%]="share * 100" [style.max-width.px]="l.width">`,
    `<p [style.color]="'var(--g-danger)'" [attr.aria-label]="'Red-black tree'">`,
  ]) {
    assert.deepEqual(flagged(source, 'x.html'), [], source);
  }
  assert.deepEqual(flagged('this.host.style.minHeight = `${height}px`;\nel.style.overflowAnchor = "none";', 'x.ts'), []);
  for (const source of [
    `const dark = matchMedia('(prefers-color-scheme: dark)');\nconst wide = matchMedia('(min-width: 1024px)');`,
    `@HostBinding('style.color') c = 'var(--g-text)';\nSystemBars.setStyle({ style: Style.Dark });`,
    `const theme = { '&': { fontSize: 'var(--g-text-s)', height: '100%' } };\nif (tone === 'red') return;`,
    `type Tone = 'red' | 'gold';\nswitch (tone) { case 'red': break; }\nreadonly size = '13px';\nhost: { style: 'display: block' }`,
    'styles: `@media (max-width: 559.98px) { .a { color: var(--g-text); } }`',
  ]) {
    assert.deepEqual(flagged(source, 'x.ts'), [], source);
  }
});

test('counts a size laundered through a local custom property', () => {
  const css = `.cell {\n  --val-size: clamp(11px, 4cqi, 16px);\n  font: 600 var(--val-size) / 1 var(--g-font-mono);\n}`;
  assert.deepEqual(scan(css, 'x.scss'), [{ category: 'font-size', line: 3, text: 'font: 600 var(--val-size) / 1 var(--g-font-mono)' }]);
  assert.deepEqual(flagged('.a { --gap: 1.5; font-size: var(--gap); }'), []);
});

test('reads inline styles in components and style attributes in templates', () => {
  const component = `@Component({\n  template: \`<p style="font-size: 13px">Hi</p>\`,\n  styles: \`\n    :host { border-radius: 10px; }\n  \`,\n})`;
  assert.deepEqual(
    scan(component, 'x.ts').map((f) => [f.category, f.line]),
    [
      ['font-size', 2],
      ['border-radius', 4],
    ],
  );
  assert.deepEqual(flagged('<svg><stop stop-color="#ff0000" /></svg>\n<div style="color: red"></div>', 'x.html'), ['color', 'color']);
  assert.deepEqual(flagged(`<rect fill='#ff0000' rx="6" />\n<text font-size="13">`, 'x.html'), ['color', 'border-radius', 'font-size']);
  assert.deepEqual(flagged('<rect rx="0" fill="var(--g-line)" />', 'x.html'), []);
  assert.deepEqual(flagged('<p data-color="red" [attr.fill]="tone()">', 'x.html'), []);
  assert.deepEqual(flagged('<!-- <p style="font-size: 13px"> -->\n<p [style.width.%]="share">', 'x.html'), []);
  assert.deepEqual(flagged('const fontSize = 12;\nconst title = { label: "Red-black tree", tone: tan(1) };', 'x.ts'), []);
});

test('fails when a component adds a literal color or a one-off breakpoint, naming the line', () => {
  const tree = {
    'app/new.component.ts': scan('styles: `\n  .a { color: #ff0000; }\n  @media (max-width: 700px) { .a { display: none; } }\n`', 'x.ts'),
  };
  assert.deepEqual(ratchet(tree, {}), [
    'app/new.component.ts: 1 raw color values, baseline 0. Use the --g- tokens:\n    app/new.component.ts:2  color: #ff0000',
    'app/new.component.ts: 1 raw media values, baseline 0. Use the --g- tokens:\n    app/new.component.ts:3  @media (max-width: 700px)',
  ]);
  assert.deepEqual(ratchet(tree, { 'app/new.component.ts': { color: 1, media: 1 } }), []);
});

test('fails when a count falls, so the baseline only goes down, and --update only lowers it', () => {
  const tree = { 'a.scss': scan('.a { font-size: 13px; }', 'a.scss') };
  assert.match(
    ratchet(tree, { 'a.scss': { 'font-size': 2 }, 'gone.scss': { media: 1 } }).join('\n'),
    /a\.scss: 1 raw font-size values, baseline 2\. Lower/,
  );
  assert.match(ratchet({}, { 'gone.scss': { media: 1 } }).join(), /gone\.scss: 0 raw media values, baseline 1\. Lower/);
  assert.deepEqual(lowered(counts(tree), { 'a.scss': { 'font-size': 2, media: 1 }, 'gone.scss': { media: 1 } }), {
    'a.scss': { 'font-size': 1 },
  });
  assert.deepEqual(lowered({ 'a.scss': { 'font-size': 3 } }, { 'a.scss': { 'font-size': 1 } }), { 'a.scss': { 'font-size': 1 } });
  assert.deepEqual(lowered(counts(tree), null), { 'a.scss': { 'font-size': 1 } });
});

test('in a tree, counts raw names where used, theme overrides where made, unknown --g- names and mixin breakpoints', () => {
  const src = mkdtempSync(`${tmpdir()}/style-tokens-`);
  try {
    mkdirSync(`${src}/app`);
    writeFileSync(
      `${src}/_theme.scss`,
      '@mixin rgb-token($name, $hex) {\n  --g-#{$name}: #{$hex};\n  --g-#{$name}-rgb: 1, 2, 3;\n}\n:root { --g-text-s: 0.8125rem; --g-switch-w: 40px; @include rgb-token(accent, #5846dc); }\n@mixin mq($w) { @media (max-width: $w) { @content; } }',
    );
    writeFileSync(`${src}/styles.scss`, ':root { --g-pad: 4px; }\napp-x { --g-text-s: 9px; --g-pad: 2px; }');
    writeFileSync(`${src}/app/c.component.ts`, "readonly size = '13px';\nreadonly tone = 'var(--g-accent)';");
    writeFileSync(`${src}/app/c.component.html`, '<p [style.font-size]="size" [style.color]="tone">');
    writeFileSync(`${src}/app/a.scss`, '.a { --cell-size: 12px; --g-text-s: 13px; --g-switch-w: 34px; --g-gap: 14px; }');
    writeFileSync(
      `${src}/app/b.scss`,
      [
        '.b { font-size: var(--cell-size); }',
        '.c { font-size: var(--g-text-s); color: var(--g-accent); background: rgba(var(--g-accent-rgb), 0.1); }',
        '.d { font-size: var(--g-nope); color: var(--g-nope); margin: var(--g-gap, 10px); }',
        '@include mq(700px) { .e { display: none; } }',
        '@include mq(1024px) { .f { display: none; } }',
        '@include t.mq(700px) { .g { display: none; } }',
      ].join('\n'),
    );
    const tree = scanTree(`${src}/`);
    assert.deepEqual(
      Object.fromEntries(Object.entries(tree).map(([file, findings]) => [file, findings.map((f) => [f.category, f.line])])),
      {
        '_theme.scss': [['media', 6]],
        'app/a.scss': [
          ['font-size', 1],
          ['token-override', 1],
        ],
        'app/b.scss': [
          ['font-size', 1],
          ['font-size', 3],
          ['color', 3],
          ['media', 4],
          ['media', 6],
        ],
        'app/c.component.html': [['font-size', 1]],
        'styles.scss': [
          ['font-size', 2],
          ['token-override', 2],
        ],
      },
    );
  } finally {
    rmSync(src, { recursive: true, force: true });
  }
});

test('the app holds every file to its committed baseline', () => {
  assert.deepEqual(ratchet(scanTree(), JSON.parse(readFileSync(BASELINE, 'utf8'))), []);
});
