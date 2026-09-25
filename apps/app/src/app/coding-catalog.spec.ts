/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = 'src/app';
const FULL_PROBLEMS = /\b(?:CODING_PROBLEMS|getCodingProblem)\b/;

describe('coding problems', () => {
  it('load in full only in the code workspace, so the first paint carries just the catalog', () => {
    const files = (readdirSync(APP, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    expect(files.filter((f) => FULL_PROBLEMS.test(readFileSync(join(APP, f), 'utf8')))).toEqual(['pages/code/workspace.page.ts']);
  });
});
