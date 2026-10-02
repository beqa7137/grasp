/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'src/app';
const ION_ICON = /<ion-icon\b((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g;
const NAMED_OR_HIDDEN = /\s(?:aria-hidden="true"|aria-label=|\[attr\.aria-label\]=)/;
const ROVING_ROLE = /role="(?:radiogroup|tablist)"/;
const USES_ROVING = /imports:\s*\[[^\]]*\bRovingSelectDirective\b/;

interface Template {
  file: string;
  html: string;
  /** The source of the component the template belongs to. */
  component: string;
}

function templates(): Template[] {
  const files = (readdirSync(APP, { recursive: true }) as string[]).filter((f) => !f.endsWith('.spec.ts'));
  const read = (file: string) => readFileSync(join(APP, file), 'utf8');
  return files.flatMap((file): Template[] => {
    if (file.endsWith('.html')) return [{ file, html: read(file), component: read(file.replace(/\.html$/, '.ts')) }];
    if (!file.endsWith('.ts')) return [];
    const source = read(file);
    return [...source.matchAll(/template:\s*`([^`]*)`/g)].map(([, html]) => ({ file, html, component: source }));
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

  it('give every radio group and tab list the arrow keys and one Tab stop', () => {
    const missing = all.filter(({ html, component }) => ROVING_ROLE.test(html) && !USES_ROVING.test(component)).map((t) => t.file);
    expect(missing).toEqual([]);
  });
});
