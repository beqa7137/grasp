import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from '../../core/api.service';
import { ProgressService } from '../../core/progress.service';
import { InterviewSessionPage } from './interview-session.page';
import type { InterviewSession } from './interview.types';

async function setup(changes: Partial<InterviewSession> = {}, initialError?: ApiError) {
  localStorage.clear();
  const stored: InterviewSession = {
    id: 'session',
    track: 'coding',
    problem: { id: 'problem', title: 'Practice', track: 'coding', patternIds: [] },
    messages: [
      { role: 'candidate', content: 'Shared code', at: '2026-09-27T00:00:00Z', code: { language: 'python', source: 'print("shared")' } },
    ],
    hintsUsed: 0,
    status: 'active',
    createdAt: '2026-09-27T00:00:00Z',
    mode: 'offline',
    aiAccess: 'sign-in-required',
    ...changes,
  };
  const reply = { role: 'interviewer' as const, content: 'Explain your approach.', at: '2026-09-27T00:01:00Z' };
  const requestIdentity = signal('guest');
  const api = {
    get: vi.fn(async (_path: string) => {
      requestIdentity();
      return { ...stored };
    }),
    post: vi.fn(async (_path: string, body?: unknown) => ({ ...stored, ...(body as object) })),
    stream: vi.fn(async (_path: string, _body: unknown) => ({ message: reply })),
  };
  if (initialError) api.get.mockRejectedValueOnce(initialError);
  const progress = { record: vi.fn(async () => undefined) };
  TestBed.configureTestingModule({
    imports: [InterviewSessionPage],
    providers: [
      { provide: ApiService, useValue: api },
      { provide: ProgressService, useValue: progress },
    ],
  }).overrideComponent(InterviewSessionPage, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(InterviewSessionPage);
  fixture.componentRef.setInput('id', stored.id);
  fixture.detectChanges();
  await fixture.whenStable();
  const page = fixture.componentInstance;
  if (page.session()) {
    page.draft.set('  My unsent answer\n');
    page.code.set('const answer: number = 42;');
    page.codeLanguage.set('typescript');
    page.codeOpen.set(true);
  }
  const buffers = () => ({
    draft: page.draft(),
    code: page.code(),
    language: page.codeLanguage(),
    open: page.codeOpen(),
    changed: page.codeChanged(),
    id: page.session()?.id,
  });
  return { page, api, progress, stored, buffers, initial: buffers(), fixture, requestIdentity };
}

describe('InterviewSessionPage access and draft preservation', () => {
  it('keeps unsent code when request identity changes and refreshes access only explicitly', async () => {
    const { page, api, stored, buffers, initial, fixture, requestIdentity } = await setup();
    await page.chooseMode('ai');
    stored.aiAccess = 'available';
    requestIdentity.set('signed-in');
    await fixture.whenStable();
    expect(buffers()).toEqual(initial);
    expect(api.get).toHaveBeenCalledTimes(1);
    await page.signedIn();
    expect(buffers()).toEqual(initial);
    expect(page.session()?.aiAccess).toBe('available');
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.stream).not.toHaveBeenCalled();
  });

  it.each(['token_invalid', 'sign_in_required'])('recovers a deep link after an initial %s rejection without a mutation', async (code) => {
    const { page, api, stored } = await setup({ mode: 'ai', aiAccess: 'available' }, new ApiError(401, 'Sign in again.', code));
    expect(page.session()).toBeNull();
    expect(page.signInOpen()).toBe(true);
    await page.signedIn();
    expect(page.session()).toEqual(stored);
    expect(page.signInOpen()).toBe(false);
    expect(page.error()).toBeNull();
    expect(page.code()).toBe('print("shared")');
    expect(page.codeLanguage()).toBe('python');
    expect(page.codeChanged()).toBe(false);
    expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/interview/sessions/session', '/interview/sessions/session']);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.stream).not.toHaveBeenCalled();
  });

  it.each([429, 503])('retries an initial temporary %s failure using only a GET', async (status) => {
    const { page, api, stored } = await setup({}, new ApiError(status, 'Try again shortly.'));
    expect(page.session()).toBeNull();
    expect(page.signInOpen()).toBe(false);
    expect(page.pending()).toBe(false);
    await page.retryLoad();
    expect(page.session()).toEqual(stored);
    expect(page.error()).toBeNull();
    expect(page.code()).toBe('print("shared")');
    expect(page.codeChanged()).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.stream).not.toHaveBeenCalled();
  });

  it('keeps every buffer when login opens, cancels, and completes without upgrading or sending', async () => {
    const { page, api, stored, buffers, initial } = await setup();
    await page.chooseMode('ai');
    expect(page.signInOpen()).toBe(true);
    expect(buffers()).toEqual(initial);
    page.closeSignIn();
    expect(buffers()).toEqual(initial);
    await page.chooseMode('ai');
    stored.aiAccess = 'available';
    await page.signedIn();
    expect(page.session()?.mode).toBe('offline');
    expect(buffers()).toEqual(initial);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.stream).not.toHaveBeenCalled();
    page.code.set('print("shared")');
    page.codeLanguage.set('python');
    expect(page.codeChanged()).toBe(false);
  });

  it('preserves drafts when refreshing access after login fails', async () => {
    const { page, api, buffers, initial } = await setup();
    api.get.mockRejectedValue(new ApiError(503, 'Please try again.'));
    await page.signedIn();
    expect(buffers()).toEqual(initial);
    expect(page.error()).toBe('Please try again.');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.stream).not.toHaveBeenCalled();
  });

  it.each([429, 503])('retries a failed %s access check without OAuth, mode changes or paid work', async (status) => {
    const { page, api, stored, buffers, initial } = await setup();
    api.get.mockRejectedValueOnce(new ApiError(status, 'Try again shortly.'));
    await page.signedIn();
    expect(page.accessCheckFailed()).toBe(true);
    await page.chooseMode('ai');
    expect(page.signInOpen()).toBe(false);
    stored.aiAccess = 'available';
    await page.checkAccess();
    expect(page.accessCheckFailed()).toBe(false);
    expect(buffers()).toEqual(initial);
    expect(page.session()?.mode).toBe('offline');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.stream).not.toHaveBeenCalled();
    await page.chooseMode('ai');
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/interview/sessions/session/mode', { mode: 'ai' });
  });

  it.each(['token_invalid', 'sign_in_required'])('opens in-place reauthentication after a genuine %s rejection', async (code) => {
    const { page, api, buffers, initial } = await setup({ mode: 'ai', aiAccess: 'available' });
    api.stream.mockRejectedValue(new ApiError(401, 'Session ended.', code));
    await page.send();
    expect(page.signInOpen()).toBe(true);
    expect(page.session()?.aiAccess).toBe('sign-in-required');
    expect(buffers()).toEqual(initial);
    await page.signedIn();
    expect(api.stream).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
    expect(buffers()).toEqual(initial);
  });

  it.each([429, 503])('keeps temporary %s renewal failures out of the sign-in flow', async (status) => {
    const { page, api, buffers, initial } = await setup({ mode: 'ai', aiAccess: 'available' });
    api.stream.mockRejectedValue(new ApiError(status, 'Try again shortly.'));
    await page.send();
    expect(page.signInOpen()).toBe(false);
    expect(page.session()?.aiAccess).toBe('available');
    expect(buffers()).toEqual(initial);
  });

  it('switches only on explicit choice and preserves buffers and the shared-code baseline', async () => {
    const { page, api, buffers, initial } = await setup({ aiAccess: 'available' });
    await page.chooseMode('ai');
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/interview/sessions/session/mode', { mode: 'ai' });
    expect(page.session()?.mode).toBe('ai');
    expect(buffers()).toEqual(initial);
    expect(api.stream).not.toHaveBeenCalled();
    await page.chooseMode('offline');
    expect(page.session()?.mode).toBe('offline');
    expect(buffers()).toEqual(initial);
    page.code.set('print("shared")');
    page.codeLanguage.set('python');
    expect(page.codeChanged()).toBe(false);
  });

  it('sends a language-only code change once on the next deliberate send', async () => {
    const { page, api } = await setup();
    page.code.set('print("shared")');
    expect(page.codeChanged()).toBe(true);
    expect(api.stream).not.toHaveBeenCalled();
    await page.send();
    expect(api.stream.mock.calls[0]?.[1]).toEqual({
      content: 'My unsent answer',
      hint: false,
      code: { source: 'print("shared")', language: 'typescript' },
    });
    expect(page.codeChanged()).toBe(false);
    page.draft.set('Now check my explanation.');
    await page.send();
    expect(api.stream.mock.calls[1]?.[1]).toEqual({ content: 'Now check my explanation.', hint: false });
  });

  it.each(['send', 'hint', 'score', 'mode'] as const)(
    'preserves buffers after %s is denied and never retries after login',
    async (action) => {
      const { page, api, stored, buffers, initial } = await setup({ mode: action === 'mode' ? 'offline' : 'ai', aiAccess: 'available' });
      const failure = new ApiError(403, 'Sign in to use AI.', 'ai_sign_in_required');
      api.post.mockRejectedValue(failure);
      api.stream.mockRejectedValue(failure);
      if (action === 'mode') await page.chooseMode('ai');
      else if (action === 'score') await page.score();
      else await page.send(action === 'hint');
      expect(page.signInOpen()).toBe(true);
      expect(buffers()).toEqual(initial);
      expect(page.pendingCandidate()).toBeNull();
      expect(page.streaming()).toBeNull();
      const calls = api.post.mock.calls.length + api.stream.mock.calls.length;
      expect(calls).toBe(1);
      await page.signedIn();
      expect(buffers()).toEqual(initial);
      expect(page.session()?.mode).toBe(stored.mode);
      expect(api.post.mock.calls.length + api.stream.mock.calls.length).toBe(calls);
    },
  );

  it('lets an unavailable AI session switch to scripted practice without losing its draft', async () => {
    const { page, api, buffers, initial } = await setup({ mode: 'ai', aiAccess: 'unavailable' });
    await page.send();
    expect(api.stream).not.toHaveBeenCalled();
    expect(buffers()).toEqual(initial);
    await page.chooseMode('offline');
    expect(page.session()?.mode).toBe('offline');
    expect(buffers()).toEqual(initial);
    await page.send();
    expect(api.stream).toHaveBeenCalledTimes(1);
  });

  it('keeps failed mode changes explicit and does not silently downgrade an AI session', async () => {
    const { page, api, buffers, initial } = await setup({ mode: 'ai', aiAccess: 'available' });
    api.post.mockRejectedValue(new ApiError(503, 'AI unavailable.', 'ai_unavailable'));
    await page.chooseMode('offline');
    expect(page.session()?.mode).toBe('ai');
    expect(buffers()).toEqual(initial);
    expect(page.error()).toBe('AI unavailable.');
  });

  it('admits only one mutation while switching modes', async () => {
    const { page, api, stored } = await setup({ aiAccess: 'available' });
    let resolve!: (value: InterviewSession) => void;
    api.post.mockImplementation(() => new Promise((done) => (resolve = done)));
    const changing = page.chooseMode('ai');
    await page.chooseMode('ai');
    await page.send();
    await page.send(true);
    await page.score();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.stream).not.toHaveBeenCalled();
    resolve({ ...stored, mode: 'ai' });
    await changing;
  });

  it('blocks another send, score, or mode change while a reply streams', async () => {
    const { page, api } = await setup({ aiAccess: 'available' });
    let resolve!: (value: { message: { role: 'interviewer'; content: string; at: string } }) => void;
    api.stream.mockImplementation(() => new Promise((done) => (resolve = done)));
    const sending = page.send();
    await page.send();
    await page.score();
    await page.chooseMode('ai');
    expect(api.stream).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
    resolve({ message: { role: 'interviewer', content: 'Continue.', at: '2026-09-27T00:01:00Z' } });
    await sending;
  });

  it('leaves an existing scorecard readable and never mutates a completed session', async () => {
    const scorecard = {
      mode: 'ai' as const,
      verdict: 'hire' as const,
      summary: 'Saved feedback.',
      dimensions: [],
      strengths: [],
      improvements: [],
      weakPatterns: [],
    };
    const { page, api } = await setup({ status: 'scored', scorecard, aiAccess: 'sign-in-required' });
    await page.chooseMode('ai');
    await page.send();
    await page.score();
    expect(page.session()?.scorecard).toEqual(scorecard);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.stream).not.toHaveBeenCalled();
    expect(page.signInOpen()).toBe(false);
  });
});

describe('InterviewSessionPage behavioral track', () => {
  const opening = { role: 'interviewer' as const, content: 'Tell me about a disagreement.', at: '2026-09-27T00:00:00Z' };
  const star = {
    situation: 'The launch slipped.',
    task: 'I owned the date.',
    action: 'I brought the data.',
    result: 'We shipped.',
    reflection: '',
  };
  const behavioral = {
    track: 'behavioral' as const,
    problem: { id: 'conflict-1', title: 'Conflict & Disagreement', track: 'behavioral' as const, patternIds: [], competencyId: 'conflict' },
    messages: [opening],
    mode: 'ai' as const,
    aiAccess: 'available' as const,
  };

  it('sends the STAR answer alone, only on Give answer, and then takes follow-ups in the chat composer', async () => {
    const { page, api } = await setup(behavioral);
    expect(page.answering()).toBe(true);
    page.starDraft.set(star);
    expect(api.stream).not.toHaveBeenCalled();
    await page.giveAnswer();
    expect(api.stream).toHaveBeenCalledExactlyOnceWith(
      '/interview/sessions/session/messages',
      { star },
      expect.anything(),
      expect.anything(),
    );
    expect(page.answering()).toBe(false);
    expect(page.session()?.messages[1]?.star).toEqual(star);
    await page.giveAnswer();
    expect(api.stream).toHaveBeenCalledTimes(1);
  });

  it('keeps the STAR answer when giving it fails', async () => {
    const { page, api } = await setup(behavioral);
    page.starDraft.set(star);
    api.stream.mockRejectedValueOnce(new ApiError(503, 'Try again.'));
    await page.giveAnswer();
    expect(page.answering()).toBe(true);
    expect(page.starDraft()).toEqual(star);
  });

  it('closes the composer after the answer to the third follow-up', async () => {
    const answer = (content: string) => ({ role: 'candidate' as const, content, at: '2026-09-27T00:01:00Z' });
    const reply = { ...opening, content: 'Thanks, that gives me what I need. Press End & score when you are ready.' };
    const messages = [
      opening,
      { ...answer('[STAR ANSWER]'), star },
      opening,
      answer('one'),
      opening,
      answer('two'),
      opening,
      answer('three'),
      reply,
    ];
    const { page, api } = await setup({ ...behavioral, messages });
    expect(page.closed()).toBe(true);
    page.draft.set('One more thing.');
    await page.send();
    expect(api.stream).not.toHaveBeenCalled();
  });

  it('records the scored event with the competency and the weak competencies, as the server does', async () => {
    const scorecard = {
      mode: 'ai' as const,
      verdict: 'lean-no-hire' as const,
      summary: 'Say what you did.',
      dimensions: [],
      strengths: [],
      improvements: [],
      weakPatterns: [],
      flaws: [],
      weakCompetencies: ['conflict'],
    };
    const { page, api, progress } = await setup(behavioral);
    api.post.mockResolvedValueOnce({ ...page.session()!, status: 'scored', scorecard, scoredAt: '2026-09-27T00:05:00Z' });
    await page.score();
    expect(progress.record).toHaveBeenCalledExactlyOnceWith({
      id: 'interview-session',
      at: '2026-09-27T00:05:00Z',
      type: 'interview.scored',
      sessionId: 'session',
      track: 'behavioral',
      verdict: 'lean-no-hire',
      weakPatterns: [],
      competencyId: 'conflict',
      weakCompetencies: ['conflict'],
    });
  });
});
