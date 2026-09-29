import { describe, expect, it } from 'vitest';
import { COMPETENCY_CATALOG } from './catalog.js';
import type { StarDraft } from './star-check.js';
import { reviewBank, storyTitle, type Story } from './stories.js';

const words = (n: number) => Array.from({ length: n }, () => 'detail').join(' ');
const told: StarDraft = {
  situation: 'Our checkout service timed out for one in fifty orders during the spring sale last year.',
  task: 'I owned the payment client and had two days to stop the timeouts before the next sale.',
  action: `I traced the slow calls to a retry loop, I capped the retries, I added a circuit breaker and I load tested it. ${words(160)}`,
  result: 'Timeouts fell from 2% to 0.1% and the next sale took 40% more orders without an incident.',
  reflection: 'I learned to load test the client, not only the server, before every sale since then.',
};
const story = (id: string, competencyIds: string[], draft = told, title = id): Story => ({ id, title, competencyIds, draft });

describe('reviewBank', () => {
  it('lists every competency with the stories that answer it, and the ones none do', () => {
    const review = reviewBank([story('a', ['ownership', 'delivery']), story('b', ['ownership'])]);
    expect(review.coverage).toHaveLength(COMPETENCY_CATALOG.length);
    expect(review.coverage.find((c) => c.competencyId === 'ownership')?.storyIds).toEqual(['a', 'b']);
    expect(review.covered).toBe(2);
    expect(review.gaps).toHaveLength(COMPETENCY_CATALOG.length - 2);
    expect(review.gaps).toContain('Ambiguity');
  });

  it('asks for more stories below eight, and nothing more once the bank is full and finished', () => {
    expect(reviewBank([story('a', ['ownership'])]).advice[0]).toContain('You have 1');
    const full = Array.from({ length: 8 }, (_, i) => story(`s${i}`, ['ownership']));
    expect(reviewBank(full).advice).toEqual([]);
  });

  it('names an untagged story, one stretched over too many competencies, and one that fails checks', () => {
    const advice = reviewBank([
      story('a', []),
      story('b', ['ownership', 'delivery', 'conflict', 'failure']),
      story('c', ['ownership'], { ...told, result: '' }),
    ]).advice.join('\n');
    expect(advice).toContain('Tag "a"');
    expect(advice).toContain('"b" is tagged with 4');
    expect(advice).toMatch(/"c" has \d+ checks? to fix/);
  });

  it('names a story without a title', () => {
    expect(storyTitle(story('a', [], told, '  '))).toBe('Untitled story');
  });
});
