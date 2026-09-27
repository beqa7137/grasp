import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { InterviewHomePage } from './interview-home.page';
import type { AiAccess, InterviewCatalog, InterviewSession } from './interview.types';

function setup(access: AiAccess = 'sign-in-required') {
  const catalog: InterviewCatalog = {
    aiAccess: access,
    problems: [{ id: 'problem', title: 'Practice', track: 'coding', patternIds: [] }],
  };
  const api = {
    get: vi.fn(async (path: string): Promise<InterviewCatalog | InterviewSession[]> => (path.endsWith('/problems') ? catalog : [])),
    post: vi.fn(async () => ({ id: 'session' })),
  };
  const router = { navigate: vi.fn(async () => true) };
  TestBed.configureTestingModule({
    imports: [InterviewHomePage],
    providers: [
      { provide: ApiService, useValue: api },
      { provide: Router, useValue: router },
    ],
  }).overrideComponent(InterviewHomePage, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(InterviewHomePage);
  return { page: fixture.componentInstance, api, router, catalog };
}

describe('InterviewHomePage access choice', () => {
  it('starts scripted practice by default on an AI-enabled host', async () => {
    const { page, api } = setup();
    await page.ionViewWillEnter();
    expect(page.mode()).toBe('offline');
    await page.start('problem');
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/interview/sessions', { track: 'coding', problemId: 'problem', mode: 'offline' });
  });

  it('requires explicit AI selection after in-place sign-in and never starts automatically', async () => {
    const { page, api, catalog } = setup();
    await page.ionViewWillEnter();
    page.track.set('system-design');
    page.chooseMode('ai');
    expect(page.signInOpen()).toBe(true);
    expect(page.mode()).toBe('offline');
    await page.start('problem');
    expect(api.post).not.toHaveBeenCalled();
    catalog.aiAccess = 'available';
    await page.signedIn();
    expect(page.mode()).toBe('offline');
    expect(page.track()).toBe('system-design');
    expect(api.post).not.toHaveBeenCalled();
    page.chooseMode('ai');
    await page.start('problem');
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/interview/sessions', { track: 'system-design', problemId: 'problem', mode: 'ai' });
  });

  it('keeps scripted practice available when AI is unavailable', async () => {
    const { page, api } = setup('unavailable');
    await page.ionViewWillEnter();
    page.chooseMode('ai');
    expect(page.mode()).toBe('offline');
    expect(page.signInOpen()).toBe(false);
    await page.start('problem');
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/interview/sessions', { track: 'coding', problemId: 'problem', mode: 'offline' });
  });

  it.each([429, 503])('retries a failed %s access check with only a read and preserves the selected track', async (status) => {
    const { page, api, catalog } = setup();
    await page.ionViewWillEnter();
    page.track.set('system-design');
    page.chooseMode('ai');
    api.get.mockRejectedValueOnce(new ApiError(status, 'Try again shortly.'));
    await page.signedIn();
    expect(page.accessCheckFailed()).toBe(true);
    page.chooseMode('ai');
    expect(page.signInOpen()).toBe(false);
    catalog.aiAccess = 'available';
    await page.checkAccess();
    expect(page.accessCheckFailed()).toBe(false);
    expect(page.track()).toBe('system-design');
    expect(page.mode()).toBe('offline');
    expect(api.post).not.toHaveBeenCalled();
    page.chooseMode('ai');
    expect(page.mode()).toBe('ai');
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each(['token_invalid', 'sign_in_required'])(
    'reopens in-place sign-in when the access check rejects genuinely expired credentials with %s',
    async (code) => {
      const { page, api, router } = setup('available');
      await page.ionViewWillEnter();
      page.track.set('system-design');
      page.chooseMode('ai');
      api.get.mockRejectedValueOnce(new ApiError(401, 'Sign in again.', code));
      await page.checkAccess();
      expect(page.signInOpen()).toBe(true);
      expect(page.aiAccess()).toBe('sign-in-required');
      expect(page.accessCheckFailed()).toBe(false);
      expect(page.mode()).toBe('ai');
      expect(page.track()).toBe('system-design');
      expect(api.post).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    },
  );

  it.each([429, 503])('clears a previous %s access failure after successful page re-entry', async (status) => {
    const { page, api, catalog } = setup('available');
    await page.ionViewWillEnter();
    page.track.set('system-design');
    page.chooseMode('ai');
    api.get.mockRejectedValueOnce(new ApiError(status, 'Try again shortly.'));
    await page.checkAccess();
    expect(page.accessCheckFailed()).toBe(true);
    await page.ionViewWillEnter();
    expect(page.accessCheckFailed()).toBe(false);
    expect(page.error()).toBeNull();
    expect(page.notice()).toBeNull();
    expect(page.aiAccess()).toBe(catalog.aiAccess);
    expect(page.track()).toBe('system-design');
    expect(page.mode()).toBe('ai');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('loads merged account interviews after sign-in without changing the selection or creating an interview', async () => {
    const { page, api, catalog, router } = setup();
    const guest: InterviewSession = {
      id: 'guest-session',
      track: 'coding',
      problem: catalog.problems[0]!,
      messages: [],
      hintsUsed: 0,
      status: 'active',
      createdAt: '2026-09-27T00:00:00Z',
      mode: 'offline',
      aiAccess: 'sign-in-required',
    };
    api.get.mockImplementation(async (path) => (path.endsWith('/problems') ? catalog : [guest]));
    await page.ionViewWillEnter();
    expect(page.recent()).toEqual([guest]);
    page.track.set('system-design');
    page.chooseMode('ai');
    const merged = [
      { ...guest, aiAccess: 'available' as const },
      { ...guest, id: 'account-session', mode: 'ai' as const },
    ];
    catalog.aiAccess = 'available';
    api.get.mockImplementation(async (path) => (path.endsWith('/problems') ? catalog : merged));
    api.get.mockClear();
    await page.signedIn();
    expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/interview/problems', '/interview/sessions']);
    expect(page.recent()).toEqual(merged);
    expect(page.signInOpen()).toBe(false);
    expect(page.notice()).not.toBeNull();
    expect(page.track()).toBe('system-design');
    expect(page.mode()).toBe('offline');
    expect(api.post).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('opens sign-in after server denial without retrying the start', async () => {
    const { page, api, router } = setup('available');
    await page.ionViewWillEnter();
    page.chooseMode('ai');
    api.post.mockRejectedValue(new ApiError(403, 'Sign in to use AI.', 'ai_sign_in_required'));
    await page.start('problem');
    expect(page.signInOpen()).toBe(true);
    expect(page.starting()).toBeNull();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('ignores a repeated start while the first request is pending', async () => {
    const { page, api, router } = setup('available');
    let resolve!: (value: { id: string }) => void;
    api.post.mockImplementation(() => new Promise((done) => (resolve = done)));
    const first = page.start('problem');
    await page.start('another');
    expect(api.post).toHaveBeenCalledTimes(1);
    resolve({ id: 'session' });
    await first;
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/interview', 'session']);
  });
});
