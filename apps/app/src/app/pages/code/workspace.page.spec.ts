import { describe, expect, it } from 'vitest';
import type { TestReport } from '../../code/runner.service';
import { WorkspacePage } from './workspace.page';

describe('code workspace result preview', () => {
  it('summarizes long performance strings and arrays without rendering their contents', () => {
    const page = Object.create(WorkspacePage.prototype) as WorkspacePage;
    const performance = { kind: 'performance' } as TestReport;
    expect(page.show(performance, 'x'.repeat(500))).toBe('[500 characters]');
    expect(page.show(performance, Array<number>(500).fill(1))).toBe('[500 items]');
    expect(page.show({ kind: 'example' } as TestReport, 'abc')).toBe('"abc"');
  });

  it('summarizes a performance grid without serializing its cells', () => {
    const page = Object.create(WorkspacePage.prototype) as WorkspacePage;
    Object.defineProperty(page, 'problem', { value: () => ({ params: [{ name: 'heights', type: 'int[][]' }] }) });
    const row = Array<number>(400).fill(0);
    Object.defineProperty(row, 'toJSON', {
      value: () => {
        throw new Error('grid was serialized');
      },
    });
    const grid = Array<number[]>(400).fill(row);
    expect(page.describeArgs({ kind: 'performance', args: [grid] } as TestReport)).toEqual(['heights: large input, 400 × 400 grid']);
  });
});
