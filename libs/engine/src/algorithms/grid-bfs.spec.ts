import { describe, expect, it } from 'vitest';
import { gridBfs as algo } from './grid-bfs.js';
import { tracerFixture } from './tracer.fixture.js';

const { traceOf, randomInputs } = tracerFixture(algo);

describe('grid-bfs', () => {
  it('answers each "how many new cells" ask with the cells the next expansion adds', () => {
    const inputs = [
      algo.defaultInput,
      { grid: ['S...#.', '##....', '....#.', '....#.', '.###..', '...#.G'] },
      ...algo.presets.map((p) => p.input),
      ...randomInputs(18, 500),
    ];
    let asked = 0;
    for (const input of inputs) {
      const frames = traceOf(input);
      frames.forEach((f, k) => {
        if (!f.predict?.prompt.includes('How many new cells')) return;
        asked++;
        const [taken, expanded] = [frames[k + 1], frames[k + 2]];
        expect(expanded.line, JSON.stringify(input)).toBe(10);
        const added = expanded.queue!.items.length - taken.queue!.items.length;
        expect(f.predict.choices[f.predict.answer], JSON.stringify(input)).toBe(String(added));
      });
    }
    expect(asked).toBeGreaterThan(100);
  });
});
