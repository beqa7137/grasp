import { MOCK_PROBLEMS } from '@grasp/engine';
import { PROBLEMS, PROMPTS } from './problems.js';

describe('interview problems', () => {
  it('has prompts for exactly the problems in the engine index', () => {
    expect(Object.keys(PROMPTS).sort()).toEqual(MOCK_PROBLEMS.map((p) => p.id).sort());
    for (const problem of PROBLEMS) {
      expect(
        MOCK_PROBLEMS.some((p) => p.id === problem.id && p.track === problem.track),
        problem.id,
      ).toBe(true);
      expect(problem.opening && problem.referenceNotes && problem.hints.length, problem.id).toBeTruthy();
    }
  });
});
