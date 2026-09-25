/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const VIZ = 'src/app/viz';
/** A mark that shows a visualizer state: a node, a legend swatch, or a grid, table, array or list cell. Edges keep their own hues. */
const STATE_MARK =
  /(?:\.node|\bi|\.cell|\.item)(?:\[data-(?:state|role)='(?:active|current|frontier|done|path|visited)'\]|\.(?:active|found|hot)\b)/;
const PAINT = /(?<![\w-])(background|fill|stroke|border|border-color)\s*:\s*([^;]+);/g;
const STATE_TOKEN = /(?:^|\s)var\(--g-state-[\w-]+\)$/;
const VIEWS_WITH_STATES = [
  'node-styles.ts',
  'legend.component.ts',
  'grid-view.component.ts',
  'table-view.component.ts',
  'array-view.component.ts',
  'list-view.component.ts',
];

interface Rule {
  file: string;
  selector: string;
  body: string;
}

function stateRules(): Rule[] {
  const files = readdirSync(VIZ).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  return files.flatMap((file) =>
    [...readFileSync(join(VIZ, file), 'utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, selector, body]) => ({ file, selector: selector.trim().replace(/\s+/g, ' '), body }))
      .filter((rule) => STATE_MARK.test(rule.selector)),
  );
}

describe('visualizer state styles', () => {
  const rules = stateRules();

  it('are found in every view that shows a state', () => {
    expect([...new Set(rules.map((r) => r.file))]).toEqual(expect.arrayContaining(VIEWS_WITH_STATES));
  });

  it('paint each state mark with --g-state tokens, so every view and legend shows a state the same way', () => {
    const ownPaint = rules.flatMap(({ file, selector, body }) =>
      [...body.matchAll(PAINT)]
        .filter(([, , value]) => !STATE_TOKEN.test(value.trim()))
        .map(([declaration]) => `${file}: ${selector} { ${declaration.trim()} }`),
    );
    expect(ownPaint).toEqual([]);
  });

  it('dash the frontier outline, so a queued mark reads without colour', () => {
    const frontier = rules.filter((r) => r.selector.includes("[data-state='frontier']"));
    expect(frontier.length).toBeGreaterThanOrEqual(3);
    const solid = frontier
      .filter((r) => !/stroke-dasharray\s*:|border-style\s*:\s*dashed/.test(r.body))
      .map((r) => `${r.file}: ${r.selector}`);
    expect(solid).toEqual([]);
  });
});
