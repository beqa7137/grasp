import { describe, expect, it } from 'vitest';
import { rotatedChoices } from './choices.js';

const PROMPTS = 1000;

describe('rotatedChoices', () => {
  // Tracer prompts often differ only in a number the answer follows, which is where a hash with poorly mixed low bits clumps.
  it('spreads the answer over the slots across prompts that differ only in a number', () => {
    const crowded = [2, 3, 4].flatMap((length) => {
      const slots = Array<number>(length).fill(0);
      for (let x = 0; x < PROMPTS; x++) {
        slots[rotatedChoices(`\`x = ${x}\`. What is \`x + 1\`?`, String(x + 1), ['a', 'b', 'c'].slice(0, length - 1)).answer]++;
      }
      const worst = Math.max(...slots) / PROMPTS;
      return worst > 1 / length + 0.1 ? [`${length} choices: ${Math.round(worst * 100)}% in one slot`] : [];
    });
    expect(crowded).toEqual([]);
  });
});
