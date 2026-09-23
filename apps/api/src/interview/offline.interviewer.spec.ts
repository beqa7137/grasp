import { OfflineInterviewer } from './offline.interviewer.js';
import type { InterviewSession } from './interview.types.js';
import { PROBLEMS } from './problems.js';

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
    const strong = await interviewer.score(
      session([
        'Let me clarify constraints first: input size up to 1e5, can the array be empty? I assume no negative temperatures matter.',
        'Brute force is O(n^2). A better approach is a monotonic stack of indices, which is O(n) time and O(n) space, amortized since each index is pushed and popped once. The trade-off versus scanning is extra memory.',
        'Edge cases: empty array, a single element, duplicate temperatures which should not pop because we need strictly warmer.',
      ]),
    );
    const weak = await interviewer.score(session(['not sure']));
    const avg = (s: typeof strong) => s.dimensions.reduce((a, d) => a + d.score, 0) / s.dimensions.length;
    expect(avg(strong)).toBeGreaterThan(avg(weak));
    expect(weak.verdict).toBe('no-hire');
    expect(weak.weakPatterns).toEqual(['monotonic-stack']);
  });

  it('streams the next hint rung when asked', async () => {
    const s = session([], 1);
    s.messages.push({ role: 'candidate', content: 'hint please', at: '', hint: true });
    let streamed = '';
    const text = await interviewer.reply(s, (t) => (streamed += t), new AbortController().signal);
    expect(text).toContain(PROBLEMS[0].hints[0]);
    expect(streamed).toBe(text);
  });

  it('skips questions the candidate already answered', async () => {
    const s = session(['Let me clarify constraints: can the input be empty? Brute force is O(n^2); better is a monotonic stack.']);
    const text = await interviewer.reply(s, () => {}, new AbortController().signal);
    expect(text).toContain('improved approach');
  });
});
