import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  ]) {
    assert.deepEqual(flagged(css), [category], css);
  }
});

test('allows tokens, the chrome helper, relative and zero values, token tints and the sanctioned breakpoints', () => {
  for (const css of [
    '.a { font-size: var(--g-text-s); }',
    '.a { font-size: var(--g-text-s, 12px); }',
    '.a { font-size: chrome-font-size(13px); }',
    '.a { font: 500 #{chrome-font-size(11px)} / 1 var(--ion-font-family); }',
    '.a { font-size: inherit; font: inherit; font-size: 1.2em; font-size: 90%; }',
    '.a { border-radius: 0; border-radius: 0px; border-radius: 50%; border-radius: var(--g-radius-sm); }',
    ':root { --g-radius: 14px; --g-accent: #5846dc; --ion-color-primary: #5846dc; }',
    '.a { color: var(--g-text); background: rgba(var(--g-found-rgb), 0.12); border-color: transparent; fill: currentColor; }',
    '.a { background: linear-gradient(180deg, rgba(var(--g-predict-rgb), 0.08), rgba(var(--ion-text-color-rgb), 0.02)); }',
    '.a { background: url(icons/red-dot.svg); }',
    '@media (prefers-reduced-motion: reduce) { .a { transition: none; } }',
    '@media (max-width: 560px) { .a { display: none; } }',
    '@media (min-width: 1024px) and (max-width: 1279.98px) { .a { display: none; } }',
    '.a { /* font-size: 13px; */ }',
    '.a {\n  // border-radius: 12px;\n}',
  ]) {
    assert.deepEqual(flagged(css), [], css);
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

test('the app holds every file to its committed baseline', () => {
  assert.deepEqual(ratchet(scanTree(), JSON.parse(readFileSync(BASELINE, 'utf8'))), []);
});
