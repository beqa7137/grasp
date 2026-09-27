import type { InterviewScoredEvent } from '@grasp/engine';
import type { InterviewSession, Scorecard } from '../interview/interview.types.js';
import { PROBLEMS } from '../interview/problems.js';
import { MemoryLearnerState } from './erasure.stores.js';
import { MemoryInterviewStore, MemoryProgressStore } from './memory.stores.js';

const learnerId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const scoredAt = '2026-09-27T12:00:00.000Z';

const scorecard: Scorecard = {
  verdict: 'no-hire',
  summary: 'More practice is needed.',
  dimensions: [],
  strengths: [],
  improvements: [],
  weakPatterns: ['monotonic-stack', 'binary-search'],
  mode: 'offline',
};

const active = (): InterviewSession => ({
  id: sessionId,
  learnerId,
  track: 'coding',
  problem: PROBLEMS[0],
  messages: [{ role: 'interviewer', content: PROBLEMS[0].opening, at: '2026-09-27T11:00:00.000Z' }],
  hintsUsed: 0,
  status: 'active',
  createdAt: '2026-09-27T11:00:00.000Z',
  mode: 'offline',
});

const scored = (session = active(), card = scorecard): InterviewSession => ({
  ...structuredClone(session),
  status: 'scored',
  scorecard: structuredClone(card),
  scoredAt,
});

function setup() {
  const state = new MemoryLearnerState();
  const progress = new MemoryProgressStore(state);
  const interviews = new MemoryInterviewStore(state, progress);
  return { state, progress, interviews };
}

function scoredEvent(override: Partial<InterviewScoredEvent> = {}): InterviewScoredEvent {
  return {
    id: `interview-${sessionId}`,
    at: scoredAt,
    type: 'interview.scored',
    sessionId,
    track: 'coding',
    verdict: scorecard.verdict,
    weakPatterns: scorecard.weakPatterns,
    ...override,
  };
}

describe('MemoryInterviewStore.completeScore', () => {
  it('publishes one matching card and event and returns the first scored winner', async () => {
    const { interviews, progress } = setup();
    await interviews.save(active());
    const first = scored();
    expect(await interviews.completeScore(first)).toEqual(first);
    expect(await progress.list(learnerId)).toEqual([scoredEvent()]);

    const second = scored(active(), { ...scorecard, verdict: 'hire', weakPatterns: [] });
    expect(await interviews.completeScore(second)).toEqual(first);
    expect(await interviews.get(learnerId, sessionId)).toEqual(first);
    expect(await progress.list(learnerId)).toEqual([scoredEvent()]);
    await expect(interviews.save(active())).rejects.toMatchObject({ status: 409, message: 'Interview already scored' });
    expect(await interviews.get(learnerId, sessionId)).toEqual(first);
  });

  it('keeps the stored card and event detached from candidate and returned objects', async () => {
    const { interviews, progress } = setup();
    await interviews.save(active());
    const candidate = scored();
    const returned = await interviews.completeScore(candidate);
    candidate.scorecard!.weakPatterns.push('greedy');
    returned.scorecard!.weakPatterns.push('bfs');
    returned.messages.push({ role: 'candidate', content: 'late mutation', at: scoredAt });

    expect(await interviews.get(learnerId, sessionId)).toEqual(scored());
    expect(await progress.list(learnerId)).toEqual([scoredEvent()]);
  });

  it('repairs a cached score with no event and rejects incomplete cached or active cards', async () => {
    const { interviews, progress } = setup();
    const cached = scored();
    await interviews.save(cached);
    expect(await interviews.completeScore(cached)).toEqual(cached);
    expect(await progress.list(learnerId)).toEqual([scoredEvent()]);

    const missing = setup();
    await missing.interviews.save({ ...cached, scorecard: undefined });
    await expect(missing.interviews.completeScore(cached)).rejects.toMatchObject({
      status: 409,
      message: 'Interview score is incomplete',
    });
    expect(await missing.progress.list(learnerId)).toEqual([]);

    const stillActive = setup();
    const malformed = { ...active(), scorecard };
    await stillActive.interviews.save(malformed);
    await expect(stillActive.interviews.completeScore(malformed)).rejects.toMatchObject({
      status: 409,
      message: 'Interview score is incomplete',
    });
    expect(await stillActive.progress.list(learnerId)).toEqual([]);
  });

  it.each([
    [
      'messages and code',
      (session: InterviewSession) => ({
        ...session,
        messages: [
          ...session.messages,
          { role: 'candidate' as const, content: 'new answer', at: scoredAt, code: { language: 'python' as const, source: 'print(1)' } },
        ],
      }),
    ],
    ['hints', (session: InterviewSession) => ({ ...session, hintsUsed: 1 })],
    ['mode', (session: InterviewSession) => ({ ...session, mode: 'ai' as const })],
    ['track', (session: InterviewSession) => ({ ...session, track: 'system-design' as const })],
    ['problem', (session: InterviewSession) => ({ ...session, problem: PROBLEMS[1] })],
  ])('rejects a stale score after newer active %s', async (_name, change) => {
    const { interviews, progress } = setup();
    const before = active();
    const candidate = scored(before);
    const latest = change(before);
    await interviews.save(before);
    await interviews.save(latest);

    await expect(interviews.completeScore(candidate)).rejects.toMatchObject({
      status: 409,
      message: 'Interview changed while scoring; try again',
    });
    expect(await interviews.get(learnerId, sessionId)).toEqual(latest);
    expect(await progress.list(learnerId)).toEqual([]);
  });

  it('compares structures, not key order, and treats missing mode as offline', async () => {
    const { interviews, progress } = setup();
    const before = active();
    before.mode = undefined;
    await interviews.save(before);
    const candidate = scored(before);
    candidate.mode = 'offline';
    candidate.problem = Object.fromEntries(Object.entries(candidate.problem).reverse()) as InterviewSession['problem'];
    candidate.messages = candidate.messages.map(
      (message) => Object.fromEntries(Object.entries(message).reverse()) as InterviewSession['messages'][number],
    );

    expect(await interviews.completeScore(candidate)).toMatchObject({ status: 'scored', mode: undefined });
    expect(await progress.list(learnerId)).toEqual([scoredEvent()]);
  });

  it('accepts an equivalent-offset duplicate without changing its stored payload', async () => {
    const { interviews, progress } = setup();
    const existing = scoredEvent({ at: '2026-09-27T08:00:00.000-04:00' });
    await interviews.save(active());
    await progress.append(learnerId, [existing]);

    expect(await interviews.completeScore(scored())).toMatchObject({ status: 'scored' });
    expect(await progress.list(learnerId)).toEqual([existing]);
  });

  it.each([
    ['verdict', { verdict: 'hire' }],
    ['timestamp', { at: '2026-09-27T12:00:01.000Z' }],
    ['ordered weak patterns', { weakPatterns: [...scorecard.weakPatterns].reverse() }],
    ['session', { sessionId: 'different-session' }],
  ])('rejects a conflicting %s without publishing a card', async (_name, change) => {
    const { interviews, progress } = setup();
    const existing = scoredEvent(change);
    await interviews.save(active());
    await progress.append(learnerId, [existing]);

    await expect(interviews.completeScore(scored())).rejects.toMatchObject({
      status: 409,
      message: 'Interview score conflicts with saved progress',
    });
    expect(await interviews.get(learnerId, sessionId)).toEqual(active());
    expect(await progress.list(learnerId)).toEqual([existing]);
  });

  it('rejects a different event type at the deterministic ID', async () => {
    const { interviews, progress } = setup();
    const existing = { id: `interview-${sessionId}`, at: scoredAt, type: 'settings.changed' as const, settings: { newPerDay: 5 } };
    await interviews.save(active());
    await progress.append(learnerId, [existing]);
    await expect(interviews.completeScore(scored())).rejects.toMatchObject({ status: 409 });
    expect(await interviews.get(learnerId, sessionId)).toEqual(active());
    expect(await progress.list(learnerId)).toEqual([existing]);
  });

  it('leaves an active card untouched when event insertion fails before publication', async () => {
    const { interviews, progress } = setup();
    await interviews.save(active());
    const failure = new Error('failed before event insertion');
    vi.spyOn(progress, 'insertScoreEvent').mockImplementationOnce(() => {
      throw failure;
    });

    await expect(interviews.completeScore(scored())).rejects.toBe(failure);
    expect(await interviews.get(learnerId, sessionId)).toEqual(active());
    expect(await progress.list(learnerId)).toEqual([]);
  });
});
