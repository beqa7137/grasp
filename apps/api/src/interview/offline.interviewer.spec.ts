import { EMPTY_STAR_DRAFT, FOLLOW_UP_MIN_WORDS } from '@grasp/engine';
import { behavioralSession, STRONG_STAR } from '../../test/support/behavioral-session.js';
import { questionFollowUps } from './behavioral-problems.js';
import { SAY_MORE } from './offline.behavioral.js';
import { OfflineInterviewer } from './offline.interviewer.js';
import type { InterviewSession } from './interview.types.js';
import { PROBLEMS } from './problems.js';
import { RUBRICS } from './prompts.js';

const session = (said: string[], hintsUsed = 0): InterviewSession => ({
  id: 's',
  learnerId: 'l',
  track: 'coding',
  problem: PROBLEMS[0],
  hintsUsed,
  status: 'active',
  createdAt: new Date().toISOString(),
  messages: [
    { role: 'interviewer', content: PROBLEMS[0].opening, at: '' },
    ...said.map((content) => ({ role: 'candidate' as const, content, at: '' })),
  ],
});

describe('OfflineInterviewer', () => {
  const interviewer = new OfflineInterviewer();

  it('rewards covering rubric areas', async () => {
    const { scorecard: strong } = await interviewer.score(
      session([
        'Let me clarify constraints first: input size up to 1e5, can the array be empty? I assume no negative temperatures matter.',
        'Brute force is O(n^2). A better approach is a monotonic stack of indices, which is O(n) time and O(n) space, amortized since each index is pushed and popped once. The trade-off versus scanning is extra memory.',
        'Edge cases: empty array, a single element, duplicate temperatures which should not pop because we need strictly warmer.',
      ]),
    );
    const { scorecard: weak } = await interviewer.score(session(['not sure']));
    const avg = (s: typeof strong) => s.dimensions.reduce((a, d) => a + d.score, 0) / s.dimensions.length;
    expect(avg(strong)).toBeGreaterThan(avg(weak));
    expect(weak.verdict).toBe('no-hire');
    expect(weak.weakPatterns).toEqual(['monotonic-stack']);
  });

  it('streams the next hint rung when asked', async () => {
    const s = session([], 1);
    s.messages.push({ role: 'candidate', content: 'hint please', at: '', hint: true });
    let streamed = '';
    const { text } = await interviewer.reply(s, (t) => (streamed += t), new AbortController().signal);
    expect(text).toContain(PROBLEMS[0].hints[0]);
    expect(streamed).toBe(text);
  });

  it('skips questions the candidate already answered', async () => {
    const s = session(['Let me clarify constraints: can the input be empty? Brute force is O(n^2); better is a monotonic stack.']);
    const { text } = await interviewer.reply(s, () => {}, new AbortController().signal);
    expect(text).toContain('improved approach');
  });
});

describe('OfflineInterviewer with code', () => {
  it('asks the candidate to walk through shared code', async () => {
    const s = session([]);
    s.messages.push({
      role: 'candidate',
      content: 'Here is my code.',
      at: '',
      code: { language: 'python', source: 'def f(t):\n    return t\n' },
    });
    const { text } = await new OfflineInterviewer().reply(s, () => {}, new AbortController().signal);
    expect(text).toContain('2 lines of python');
  });
});

describe('OfflineInterviewer on a behavioral interview', () => {
  const interviewer = new OfflineInterviewer();
  const reply = async (s: InterviewSession) => (await interviewer.reply(s, () => {}, new AbortController().signal)).text;
  const detailed = 'I sent the payments lead a one-page write-up that afternoon and asked for thirty minutes to walk through it.';
  const followUps = questionFollowUps(behavioralSession().problem);

  it("asks all three of the question's own follow-ups in order, and leaves the closing to the service", async () => {
    expect(await reply(behavioralSession())).toBe(followUps[0]);
    expect(await reply(behavioralSession(STRONG_STAR, [detailed], [followUps[0]]))).toBe(followUps[1]);
    expect(await reply(behavioralSession(STRONG_STAR, [detailed, detailed], [followUps[0], followUps[1]]))).toBe(followUps[2]);
  });

  it(`asks for more when an answer is under ${FOLLOW_UP_MIN_WORDS} words`, async () => {
    expect(await reply(behavioralSession(STRONG_STAR, ['I just did it.'], [followUps[0]]))).toBe(SAY_MORE);
    expect(await reply(behavioralSession({ ...EMPTY_STAR_DRAFT, action: 'I fixed it.' }))).toBe(SAY_MORE);
  });

  it('scores STAR coverage and follow-up length, capped at 3, with unquoted flaws and the competency when weak', async () => {
    const { scorecard: strong } = await interviewer.score(behavioralSession(STRONG_STAR, [detailed, detailed, detailed]));
    expect(strong.dimensions.map((d) => d.score)).toEqual([3, 3, 3, 3, 3]);
    expect(strong).toMatchObject({ verdict: 'hire', flaws: [], weakCompetencies: [], weakPatterns: [], mode: 'offline' });

    const weakStar = {
      ...STRONG_STAR,
      action: 'We capped the retries and we shipped it after a while.',
      result: 'It went well.',
      reflection: '',
    };
    const { scorecard: weak } = await interviewer.score(behavioralSession(weakStar, ['Not sure.']));
    expect(weak.dimensions.map((d) => d.score)).toEqual([2, 2, 2, 2, 1]);
    expect(weak.verdict).toBe('no-hire');
    expect(weak.flaws!.map((f) => f.id)).toEqual(['we-not-i', 'no-result', 'long-setup', 'no-reflection']);
    expect(weak.flaws!.every((f) => f.quote === null && f.fix.length > 0)).toBe(true);
    expect(weak.weakCompetencies).toEqual(['ownership']);
    expect(weak.weakPatterns).toEqual([]);
    expect(weak.improvements[0]).toBe(`Competency fit: ${RUBRICS.behavioral[0].lookFor}`);
  });
});
