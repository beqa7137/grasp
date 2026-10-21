/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'src/app';
const ION_ICON = /<ion-icon\b((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g;
const NAMED_OR_HIDDEN = /\s(?:aria-hidden="true"|aria-label=|\[attr\.aria-label\]=)/;
const ROVING_ROLE = /role="(?:radiogroup|tablist)"/;
const USES_ROVING = /imports:\s*\[[^\]]*\bRovingSelectDirective\b/;
/** Ionic's padding, flex and display utilities, whose stylesheets the app does not load (`ion-hide` with or without a suffix). */
const ION_UTILITY =
  /^ion-(?:hide|padding|margin|no-padding|no-margin|display|justify-content|align-self|align-items|align-content|flex|wrap|nowrap|wrap-reverse|float|text)(?:-|$)/;

/** Every class a template can set: `class` attributes, `[class.x]` bindings, `[ngClass]` strings and keys, and a host `class`. */
function classTokens(source: string): string[] {
  const words = (text: string) => text.split(/\s+/).filter(Boolean);
  return [
    ...[...source.matchAll(/(?<![\w.[-])class\s*=\s*(["'])(.*?)\1/gs)].flatMap(([, , value]) =>
      words(value.replace(/\{\{[^}]*\}\}/g, ' ')),
    ),
    ...[...source.matchAll(/\[class\.([\w-]+)\]/g)].map(([, name]) => name),
    ...[...source.matchAll(/\[ngClass\]\s*=\s*(["'])(.*?)\1/gs)].flatMap(([, , value]) =>
      [...value.matchAll(/'([^']*)'|"([^"]*)"|([\w-]+)\s*:/g)].flatMap(([, a, b, key]) => words(a ?? b ?? key)),
    ),
    ...[...source.matchAll(/(?<![\w-])['"]?class['"]?\s*:\s*(['"])(.*?)\1/g)].flatMap(([, , value]) => words(value)),
  ];
}

const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/**
 * Nested panels the walk finds today (REDESIGN.md 3.2 says no panel in a panel), each named with the iteration that rebuilds
 * its page. Fixing one fails this list until it is removed here.
 */
const KNOWN_NESTED_PANELS = [
  // R30, the design topic page: the quick check's question card inside the lesson's section panel.
  'pages/design-lesson/design-lesson.page.ts: app-quick-check',
  // Never rendered: the walk does not evaluate `@if`, and the answer panel sets `[coached]="false"`, which hides the STAR
  // editor's checks panel. It stays until R37 rebuilds the editor, so that iteration need not look for a nesting.
  'pages/interview/behavioral-answer.component.ts: app-star-editor',
];

interface Template {
  file: string;
  html: string;
  /** The source of the component the template belongs to. */
  component: string;
}

const read = (file: string) => readFileSync(join(APP, file), 'utf8');
/** The app's `.ts` and `.html` files, specs aside. */
const sourceFiles = () =>
  (readdirSync(APP, { recursive: true }) as string[]).filter((f) => /\.(ts|html)$/.test(f) && !f.endsWith('.spec.ts'));

function templates(): Template[] {
  return sourceFiles().flatMap((file): Template[] => {
    if (file.endsWith('.html')) return [{ file, html: read(file), component: read(file.replace(/\.html$/, '.ts')) }];
    const source = read(file);
    return [...source.matchAll(/template:\s*`([^`]*)`/g)].map(([, html]) => ({ file, html, component: source }));
  });
}

interface Source {
  name: string;
  html: string;
  selector?: string;
  hostClass?: string;
}

/**
 * Each place a template puts a `.panel`, or a component whose element or template holds one, inside a `.panel` of its own
 * markup, following component selectors across templates.
 */
function nestedPanels(sources: Source[]): string[] {
  const markup = (html: string) => [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(TAG)];
  const bySelector = new Map(sources.filter((s) => s.selector).map((s) => [s.selector, s]));
  const isPanel = (tag: string, attributes: string) =>
    classTokens(attributes).includes('panel') || (bySelector.get(tag)?.hostClass ?? '').split(/\s+/).includes('panel');
  const holding = new Map<string, boolean>();
  const holds = (tag: string): boolean => {
    const source = bySelector.get(tag);
    if (!source) return false;
    if (!holding.has(tag)) {
      holding.set(tag, false);
      holding.set(
        tag,
        (source.hostClass ?? '').split(/\s+/).includes('panel') ||
          markup(source.html).some(([, close, inner, attributes]) => !close && (isPanel(inner, attributes) || holds(inner))),
      );
    }
    return holding.get(tag)!;
  };
  return sources.flatMap(({ name, html }) => {
    const open: { tag: string; panel: boolean }[] = [];
    const found: string[] = [];
    for (const [, close, tag, attributes, selfClosing] of markup(html)) {
      if (close) {
        const at = open.map((e) => e.tag).lastIndexOf(tag);
        if (at >= 0) open.length = at;
        continue;
      }
      const panel = isPanel(tag, attributes);
      if (open.some((e) => e.panel) && (panel || holds(tag))) found.push(`${name}: ${tag}`);
      if (!selfClosing && !VOID.has(tag.toLowerCase())) open.push({ tag, panel });
    }
    return found;
  });
}

describe('templates', () => {
  const all = templates();

  it('are found, inline and in their own files', () => {
    expect(all.some((t) => t.file.endsWith('.html'))).toBe(true);
    expect(all.some((t) => t.file.endsWith('.ts'))).toBe(true);
  });

  it('never send learners to a Feedback tab or the right edge of the screen', () => {
    const stale = all.filter(({ html }) => /Feedback(<\/strong>)? tab|on the right edge/i.test(html)).map(({ file }) => file);
    expect(stale).toEqual([]);
  });

  it('name every icon or hide it from screen readers', () => {
    const unnamed = all.flatMap(({ file, html }) =>
      [...html.matchAll(ION_ICON)].filter(([, attributes]) => !NAMED_OR_HIDDEN.test(attributes)).map(([tag]) => `${file}: ${tag}`),
    );
    expect(unnamed).toEqual([]);
  });

  it("use no Ionic utility class, since the app loads none of Ionic's padding, flex and display stylesheets", () => {
    const fixture = `<p class="a ion-hide b" [class.ion-padding]="x" [ngClass]="{ 'ion-text-center': y, z: w }"></p>
      <i [ngClass]="'ion-hide-md-up q'"></i> host: { class: 'ion-margin-top' } <b class="{{ c }} ion-wrap">`;
    expect(classTokens(fixture).filter((c) => ION_UTILITY.test(c))).toEqual([
      'ion-hide',
      'ion-wrap',
      'ion-padding',
      'ion-text-center',
      'ion-hide-md-up',
      'ion-margin-top',
    ]);
    expect(['ion-page', 'ion-palette-dark', 'ion-focused', 'ion-activatable', 'ion-hidden'].filter((c) => ION_UTILITY.test(c))).toEqual([]);
    // Whole sources, so a host `class` counts on a component with a template file and on a directive, which has none.
    const used = sourceFiles().flatMap((file) =>
      classTokens(read(file))
        .filter((c) => ION_UTILITY.test(c))
        .map((c) => `${file}: ${c}`),
    );
    expect([...new Set(used)]).toEqual([]);
  });

  it('find a panel nested in a panel, in one template or through a component, and nothing else', () => {
    const fixtures: Source[] = [
      { name: 'one', html: '<section class="panel a"><div><p class="x panel">Inner</p></div></section>' },
      { name: 'through', html: '<section class="block panel"><app-card /></section><app-card></app-card>' },
      { name: 'card', selector: 'app-card', html: '@if (x) {<article [class.panel]="true">Card</article>}' },
      { name: 'host', selector: 'app-host', hostClass: 'panel', html: '<p>Host</p>' },
      { name: 'hosted', html: '<div [ngClass]="{ panel: open }"><app-host></app-host></div>' },
      { name: 'siblings', html: '<div class="panel-col"><section class="panel"></section></div><section class="panel"></section><br>' },
    ];
    expect(nestedPanels(fixtures)).toEqual(['one: p', 'through: app-card', 'hosted: app-host']);
    const sources = all.map(({ file, html, component }) => ({
      name: file.replace(/\.html$/, '.ts'),
      html,
      selector: component.match(/selector:\s*'([a-z][\w-]*)'/)?.[1],
      hostClass: component.match(/host:\s*\{[^}]*?['"]?class['"]?\s*:\s*'([^']*)'/)?.[1],
    }));
    expect(nestedPanels(sources).sort()).toEqual(KNOWN_NESTED_PANELS);
  });

  it('give every radio group and tab list the arrow keys and one Tab stop', () => {
    const missing = all.filter(({ html, component }) => ROVING_ROLE.test(html) && !USES_ROVING.test(component)).map((t) => t.file);
    expect(missing).toEqual([]);
  });
});
