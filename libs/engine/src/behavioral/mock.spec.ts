import { describe, expect, it } from 'vitest';
import { seeded } from '../review/random.js';
import { FOLLOW_UP_MIN_WORDS, MOCK_FOLLOW_UPS, MOCK_QUESTIONS, debriefMock, planMock } from './mock.js';
import { EMPTY_STAR_DRAFT, type StarDraft } from './star-check.js';

const words = (n: number) => Array.from({ length: n }, () => 'detail').join(' ');
const strong: StarDraft = {
  situation: 'Our checkout service timed out for one in fifty orders during the spring sale last year.',
  task: 'I owned the payment client and had two days to stop the timeouts before the next sale.',
  action: `I traced the slow calls to a retry loop, I capped the retries, I added a circuit breaker and I load tested it. ${words(160)}`,
  result: 'Timeouts fell from 2% to 0.1% and the next sale took 40% more orders without an incident.',
  reflection: 'I learned to load test the client, not only the server, before every sale since then.',
};
const followUp = 'I would have load tested the client earlier, because the retry storm only showed up under real traffic.';

describe('behavioral mock interview', () => {
  it('asks three questions from different competencies, each with two of its own follow-ups', () => {
    for (let seed = 1; seed < 40; seed++) {
      const plan = planMock(seeded(seed));
      expect(plan).toHaveLength(MOCK_QUESTIONS);
      expect(new Set(plan.map((q) => q.question.competencyId)).size).toBe(MOCK_QUESTIONS);
      for (const { question, followUps } of plan) {
        expect(followUps).toHaveLength(MOCK_FOLLOW_UPS);
        expect(new Set(followUps).size).toBe(MOCK_FOLLOW_UPS);
        for (const f of followUps) expect(question.followUps).toContain(f);
      }
    }
  });

  it('is the same interview for the same seed', () => {
    expect(planMock(seeded(7))).toEqual(planMock(seeded(7)));
  });

  it('passes strong answers with full follow-ups, and names the habit missed most often', () => {
    const plan = planMock(seeded(3));
    const good = debriefMock(
      plan,
      plan.map(() => ({ answer: strong, followUps: [followUp, followUp] })),
    );
    expect(good.passing).toBe(good.total);
    expect(good.focus).toBeNull();

    const unmeasured = { ...strong, result: 'It went well and everyone was happy with it afterward.' };
    const weak = debriefMock(plan, [
      { answer: unmeasured, followUps: ['Not sure.', followUp] },
      { answer: unmeasured, followUps: [followUp, followUp] },
      { answer: EMPTY_STAR_DRAFT, followUps: [] },
    ]);
    expect(weak.focus).toContain('Add a number');
    expect(weak.answers[0].followUps.map((f) => f.ok)).toEqual([false, true]);
    expect(weak.answers[2].followUps.every((f) => !f.ok && f.answer === '')).toBe(true);
    expect(weak.passing).toBeLessThan(weak.total);
  });

  it(`counts a follow-up of ${FOLLOW_UP_MIN_WORDS} words as answered, and one word fewer as a fragment`, () => {
    const plan = planMock(seeded(5)).slice(0, 1);
    const [row] = debriefMock(plan, [{ answer: strong, followUps: [words(FOLLOW_UP_MIN_WORDS), words(FOLLOW_UP_MIN_WORDS - 1)] }]).answers;
    expect(row.followUps.map((f) => f.ok)).toEqual([true, false]);
  });
});
