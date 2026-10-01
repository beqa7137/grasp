import { describe, expect, it } from 'vitest';
import { spacedChoices } from './widget-checkpoint.js';

const label = (v: number) => String(v);

describe('spaced choices', () => {
  it('keeps the candidates a quarter apart and ascending, with the correct one marked', () => {
    const { choices, answer } = spacedChoices(100, [110, 300, 30, 200, 1_000], label);
    expect(choices).toEqual(['30', '100', '200', '300']);
    expect(choices[answer]).toBe('100');
  });

  it('pads to at least three choices when the candidates are too close or repeat', () => {
    for (const correct of [0, 1, 12.5, 667, 2e9]) {
      const { choices, answer } = spacedChoices(correct, [correct, correct * 1.01], label);
      expect(choices.length, String(correct)).toBeGreaterThanOrEqual(3);
      expect(new Set(choices).size).toBe(choices.length);
      expect(choices[answer]).toBe(label(correct));
    }
  });
});
