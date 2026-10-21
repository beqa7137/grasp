import { describe, expect, it } from 'vitest';
import { ALGORITHMS, getAlgorithm } from '../algorithms/index.js';
import { mulberry32 } from '../algorithms/random.js';
import { describedNote, describeEvents, describeFrame } from './describe.js';
import { diffFrames } from './diff.js';
import { valueHistory } from './history.js';
import { traceKeys } from './keys.js';
import { pace } from './pace.js';

const binarySearch = () => {
  const algo = getAlgorithm('binary-search')!;
  return algo.trace(algo.defaultInput);
};

describe('describeFrame', () => {
  it("lists the frame's values: each array cell with its pointers and marks, then the variables", () => {
    const frame = binarySearch()[4];
    const [array, vars] = describeFrame(frame);
    expect(array.title).toBe('Array');
    expect(array.rows.map((row) => row[1])).toEqual(frame.array!.values.map(String));
    expect(array.rows[4]).toEqual(['4', '16', 'done with']);
    expect(array.rows[5]).toEqual(['5', '23', 'lo, in window']);
    expect(vars).toEqual({
      title: 'Variables',
      columns: ['Name', 'Value'],
      rows: Object.entries(frame.vars).map(([k, v]) => [k, v === null ? '–' : String(v)]),
    });
  });

  it('gives every view of every tracer a table with a row per element and a cell per column', () => {
    for (const algo of ALGORITHMS) {
      for (const frame of algo.trace(algo.defaultInput)) {
        const tables = describeFrame(frame);
        expect(tables.length, algo.id).toBeGreaterThan(0);
        for (const table of tables)
          for (const row of table.rows) expect(row, `${algo.id} ${table.title}`).toHaveLength(table.columns.length);
      }
    }
  });

  it('names a queue in order and a stack with its top', () => {
    const lists = (f: Parameters<typeof describeFrame>[0]) => describeFrame(f).find((t) => t.title === 'Lists')!.rows;
    expect(lists({ line: 1, vars: {}, note: '', queue: { label: 'queue', items: ['a', 'b'] } })).toEqual([['queue', 'a, b']]);
    expect(lists({ line: 1, vars: {}, note: '', stack: { label: 'stack', items: ['x', 'y'] } })).toEqual([['stack', 'x, y; top y']]);
    expect(lists({ line: 1, vars: {}, note: '', stack: { label: 'stack', items: [] } })).toEqual([['stack', 'empty']]);
  });
});

describe('describeEvents', () => {
  it('says what a step changed: the comparison, what moved, then states, then variables', () => {
    const frames = binarySearch();
    expect(describeEvents(diffFrames(frames[3], frames[4]), frames[4])).toEqual([
      'Compare 16 < 23.',
      'lo moves from 0 to 5.',
      'mid leaves 4.',
      'The window is 5 to 9.',
      'cell 4: current → done with.',
      'cells 0 to 3: done with.',
      'lo: 0 → 5.',
      'mid: 4 → –.',
      'nums[mid]: 16 → –.',
    ]);
  });

  it('reads a grid step by cell and a queue by item', () => {
    const algo = getAlgorithm('grid-bfs')!;
    const frames = algo.trace(algo.defaultInput);
    const keys = traceKeys(frames);
    const said = describeEvents(diffFrames(frames[3], frames[4], [keys[3], keys[4]]), frames[4]);
    expect(said).toContain('(0,1) leaves the queue.');
    expect(said).toContain('cell (0, 1): in queue → current.');
  });
});

describe('pace', () => {
  it('dwells 600ms plus 200ms an event, counting four, plus 180ms for a write, over the speed', () => {
    const frames = binarySearch();
    const events = diffFrames(frames[3], frames[4]);
    expect(pace([], 1)).toEqual({ dwell: 600, scale: 1 });
    expect(pace(events, 1).dwell).toBe(1400);
    expect(pace(events, 2)).toEqual({ dwell: 700, scale: 0.5 });
    const write = [{ view: 'array', kind: 'write', at: 0, from: 1, to: 2 }] as const;
    expect(pace(write, 1).dwell).toBe(980);
  });

  it('never runs a step’s motion under 140ms, and Instant dwells as 4× does with none', () => {
    expect(pace([], 4).scale * 640).toBe(160);
    expect(pace([], 8).scale * 640).toBe(140);
    expect(pace([], 'instant')).toEqual({ dwell: 150, scale: 0 });
    expect(pace([], 0.75).scale).toBeCloseTo(4 / 3);
  });
});

describe('valueHistory', () => {
  it('gives each value a variable took, with the step and line that set it', () => {
    const frames = binarySearch();
    expect(valueHistory(frames, 'lo', frames.length - 1)).toEqual([
      { step: 0, value: 0, line: 2 },
      { step: 4, value: 5, line: 6 },
    ]);
    expect(valueHistory(frames, 'mid', frames.length - 1).map((e) => e.value)).toEqual([null, 4, null, 7, null, 5]);
    expect(valueHistory(frames, 'lo', 3)).toEqual([{ step: 0, value: 0, line: 2 }]);
  });

  it('never reaches past the frame on show, so no frame that asks can see a later value', () => {
    for (const algo of ALGORITHMS) {
      const rand = mulberry32(algo.id.length * 4099);
      const inputs = [algo.defaultInput, ...algo.presets.map((p) => p.input), ...Array.from({ length: 20 }, () => algo.randomInput(rand))];
      for (const input of inputs) {
        const frames = algo.trace(algo.validate(input));
        frames.forEach((frame, at) => {
          if (!frame.predict) return;
          for (const name of new Set(frames.flatMap((f) => Object.keys(f.vars))))
            for (const entry of valueHistory(frames, name, at)) expect(entry.step, `${algo.id} ${name} at ${at}`).toBeLessThanOrEqual(at);
        });
      }
    }
  });
});

describe('describedNote', () => {
  it("gives a frame that asks its caption, not its note, which can hold the answer (Dijkstra's first ask)", () => {
    const algo = getAlgorithm('dijkstra')!;
    const frames = algo.trace(algo.defaultInput);
    const asking = frames.find((f) => f.predict)!;
    expect(asking.note).toContain('0 + 7 = 7');
    expect(describedNote(asking, true)).toBe(asking.caption);
    expect(describedNote(asking, true)).not.toContain('0 + 7 = 7');
    expect(describedNote(asking, false)).toBe(asking.note);
  });
});
