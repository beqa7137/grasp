import { ALGORITHMS } from '@grasp/engine';
import { firstSentence } from './first-sentence';

describe('firstSentence', () => {
  it('ends at the first full stop, question or exclamation mark before the next sentence', () => {
    expect(firstSentence('Heap is full. Compare 4 with the root 2.')).toBe('Heap is full.');
    expect(firstSentence('Is it in the window? Look it up.')).toBe('Is it in the window?');
    expect(firstSentence('Found it! Return the index.')).toBe('Found it!');
    expect(firstSentence('Union the two components.')).toBe('Union the two components.');
    expect(firstSentence('No terminator here')).toBe('No terminator here');
  });

  it('starts the next sentence at a code span or a number, not at a lower-case word', () => {
    expect(firstSentence('Settle 1. `dist[1]` is final.')).toBe('Settle 1.');
    expect(firstSentence('Overlap found. 2 ≤ 3 holds.')).toBe('Overlap found.');
    expect(firstSentence('Use a stack, e.g. for brackets. Then pop.')).toBe('Use a stack, e.g. for brackets.');
    expect(firstSentence('Pick one, i.e. the smaller. Then go on.')).toBe('Pick one, i.e. the smaller.');
    expect(firstSentence('Compare 3 vs. 4 here. Then move.')).toBe('Compare 3 vs. 4 here.');
  });

  it('reads code spans, decimals, ellipses and closing brackets as part of the sentence', () => {
    expect(firstSentence('Scale by `0.5. Next` now. Then stop.')).toBe('Scale by `0.5. Next` now.');
    expect(firstSentence('Is `a?` set? Yes.')).toBe('Is `a?` set?');
    expect(firstSentence('Halve 1.5 to 0.75. Then stop.')).toBe('Halve 1.5 to 0.75.');
    expect(firstSentence('Wait for it... Then go.')).toBe('Wait for it...');
    expect(firstSentence('Done (see above.) Next one.')).toBe('Done (see above.)');
    expect(firstSentence('Compare `a[0]`. Then `b[0]`.')).toBe('Compare `a[0]`.');
  });

  it('gives a non-empty prefix of every note of every tracer, with whole code spans', () => {
    for (const algo of ALGORITHMS) {
      const inputs = [algo.defaultInput, ...Array.from({ length: 5 }, () => algo.randomInput())];
      for (const input of inputs) {
        for (const { note } of algo.trace(algo.validate(input))) {
          const sentence = firstSentence(note);
          expect(sentence.length, `${algo.id}: ${note}`).toBeGreaterThan(0);
          expect(note.startsWith(sentence), `${algo.id}: ${note}`).toBe(true);
          expect((sentence.match(/`/g) ?? []).length % 2, `${algo.id}: ${sentence}`).toBe(0);
        }
      }
    }
  });
});
