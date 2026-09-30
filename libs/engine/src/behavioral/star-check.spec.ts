import { describe, expect, it } from 'vitest';
import { starFlaws } from './flaws.js';
import { STAR_ANSWER_LIMIT, countWords, reviewStar, starLength, type StarDraft } from './star-check.js';

const words = (n: number, word = 'detail') => Array.from({ length: n }, () => word).join(' ');

const strong: StarDraft = {
  situation: 'Our checkout service timed out for one in fifty orders during the spring sale last year.',
  task: 'I owned the payment client and had two days to stop the timeouts before the next sale.',
  action: `I traced the slow calls to a retry loop, I capped the retries, I added a circuit breaker and I load tested it. ${words(160)}`,
  result: 'Timeouts fell from 2% to 0.1% and the next sale took 40% more orders without an incident.',
  reflection: 'I learned to load test the client, not only the server, before every sale since then.',
};

const check = (draft: StarDraft, id: string) => reviewStar(draft).checks.find((c) => c.id === id)!;

describe('reviewStar', () => {
  it('passes a complete, measured, first-person story of about two minutes', () => {
    const review = reviewStar(strong);
    expect(review.checks.filter((c) => !c.ok)).toEqual([]);
    expect(review.seconds).toBeGreaterThanOrEqual(90);
    expect(review.seconds).toBeLessThanOrEqual(180);
  });

  it('names every part that is too thin', () => {
    expect(check({ ...strong, task: 'Fix it.', result: '' }, 'complete')).toMatchObject({
      ok: false,
      message: expect.stringContaining('Task, Result'),
    });
  });

  it('flags a story whose setup outweighs what the candidate did', () => {
    expect(
      check({ ...strong, situation: words(200), action: 'I fixed the retry loop and shipped it the same afternoon.' }, 'action-weight').ok,
    ).toBe(false);
  });

  it('flags an Action told as "we", but not a word that merely contains it', () => {
    expect(check({ ...strong, action: 'We found the loop, we capped it and we shipped it. I reviewed.' }, 'ownership').ok).toBe(false);
    expect(check({ ...strong, action: 'I weighed two fixes and I went with the circuit breaker.' }, 'ownership').ok).toBe(true);
  });

  it('asks for a number in the Result, written as digits or words', () => {
    expect(check({ ...strong, result: 'Things got much better and everyone was happy with it.' }, 'measured').ok).toBe(false);
    expect(check({ ...strong, result: 'Build times halved and the team shipped twice as often.' }, 'measured').ok).toBe(true);
  });

  it('asks for "I" when the Action names no one', () => {
    expect(check({ ...strong, action: 'Traced the calls, capped the retries and added a breaker.' }, 'ownership').message).toContain(
      'Say "I"',
    );
  });

  it('asks for a reflection', () => {
    expect(check({ ...strong, reflection: '' }, 'reflection').ok).toBe(false);
  });

  it('estimates speaking time at 150 words a minute and flags too short and too long', () => {
    const short = { situation: '', task: '', action: words(150), result: '', reflection: '' };
    expect(reviewStar(short).seconds).toBe(60);
    expect(check(short, 'length').message).toContain('Under a minute and a half');
    expect(check({ ...short, action: words(600) }, 'length').message).toContain('Over three minutes');
  });
});

describe('starFlaws', () => {
  it('names the flaw behind each failed check, and none for a story that passes', () => {
    expect(starFlaws(reviewStar(strong))).toEqual([]);
    const weak = { ...strong, action: 'We capped the retries and we shipped it.', result: 'It went well.', reflection: '' };
    expect(starFlaws(reviewStar(weak))).toEqual(['we-not-i', 'no-result', 'long-setup', 'no-reflection']);
  });

  it('has no flaw for a check that catches none, such as length', () => {
    const long = { ...strong, action: `${strong.action} ${words(600)}` };
    expect(reviewStar(long).checks.find((c) => c.id === 'length')!.ok).toBe(false);
    expect(starFlaws(reviewStar(long))).toEqual([]);
  });
});

describe('countWords', () => {
  it('counts words, numbers and contractions, not punctuation', () => {
    expect(countWords("I didn't ship v2 until 3 p.m. - on time.")).toBe(10);
    expect(countWords('   ')).toBe(0);
  });
});

describe('STAR answer length', () => {
  it('counts every character of the five parts against the limit', () => {
    const draft: StarDraft = { situation: 'ab', task: 'c', action: ' d ', result: '', reflection: 'e' };
    expect(starLength(draft)).toBe(7);
    expect(STAR_ANSWER_LIMIT).toBe(12_000);
  });
});
