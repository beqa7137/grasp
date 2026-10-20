import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { MockStartSheetComponent } from './mock-start-sheet.component';
import type { AiAccess, InterviewCatalog, InterviewTrack } from './interview.types';

function setup(track: InterviewTrack, access: AiAccess | null = 'sign-in-required', aiRounds?: InterviewCatalog['aiRounds']) {
  const api = { post: vi.fn(async (): Promise<{ id: string }> => ({ id: 'session' })) };
  const router = { navigateByUrl: vi.fn(async () => true), url: '/mock' };
  TestBed.configureTestingModule({
    imports: [MockStartSheetComponent],
    providers: [
      { provide: ApiService, useValue: api },
      { provide: Router, useValue: router },
    ],
  }).overrideComponent(MockStartSheetComponent, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(MockStartSheetComponent);
  const set = (catalog: InterviewCatalog | null, offline = false) => {
    fixture.componentRef.setInput('catalog', catalog);
    fixture.componentRef.setInput('offline', offline);
    fixture.detectChanges();
  };
  fixture.componentRef.setInput('track', track);
  fixture.componentRef.setInput('level', 'senior');
  fixture.componentRef.setInput('levelLabel', 'Senior');
  set(access ? { aiAccess: access, problems: [], ...(aiRounds ? { aiRounds } : {}) } : null);
  const sheet = fixture.componentInstance;
  sheet.open.set(true);
  const events = { signedIn: 0, changed: 0 };
  sheet.signedIn.subscribe(() => events.signedIn++);
  sheet.changed.subscribe(() => events.changed++);
  return { sheet, api, router, set, events, fixture };
}

describe('MockStartSheetComponent', () => {
  it('starts on the question a search result opened it for, and on Surprise me otherwise', () => {
    const { sheet, fixture } = setup('system-design');
    expect(sheet.choice()).toBe('');
    fixture.componentRef.setInput('pick', 'rate-limiter');
    fixture.detectChanges();
    expect(sheet.choice()).toBe('rate-limiter');
    fixture.componentRef.setInput('pick', null);
    fixture.componentRef.setInput('track', 'coding');
    fixture.detectChanges();
    expect(sheet.choice()).toBe('');
  });

  it('starts a scripted behavioral round as an API session at the Target level, never the STAR drill', async () => {
    const { sheet, api, router } = setup('behavioral');
    expect(sheet.mode()).toBe('offline');
    sheet.choice.set('conflict');
    await sheet.start();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/interview/sessions', {
      track: 'behavioral',
      problemId: 'conflict',
      mode: 'offline',
      level: 'senior',
    });
    expect(sheet.open()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith('/mock/session', { state: undefined });
  });

  it('lists catalog titles without pattern chips, with Surprise me first, and sends no problem for a surprise', async () => {
    const { sheet, api } = setup('coding');
    expect(sheet.choices().map((c) => c.title)).toEqual([
      'Surprise me',
      'Days Until Warmer',
      'Capacity To Ship Packages Within D Days',
      'Course Schedule Order',
      'Longest Repeating Character Replacement',
    ]);
    expect(sheet.choices().every((c) => !('patternIds' in c))).toBe(true);
    await sheet.start();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/interview/sessions', { track: 'coding', mode: 'offline' });
  });

  it('builds the behavioral list from the 13 competencies, and a new round starts from Surprise me', () => {
    const { sheet, fixture } = setup('behavioral');
    expect(sheet.choices()).toHaveLength(14);
    expect(sheet.choices()[1]).toMatchObject({ id: 'ownership', title: 'Ownership' });
    sheet.choice.set('conflict');
    fixture.componentRef.setInput('track', 'system-design');
    expect(sheet.choice()).toBe('');
    expect(sheet.choices().map((c) => c.title)).toEqual(['Surprise me', 'URL Shortener', 'News Feed', 'Rate Limiter', 'Chat App']);
  });

  it('shows the AI allowance and stops an AI start once this hour has none left, while scripted still starts', async () => {
    const { sheet, api, set } = setup('system-design', 'available', { limit: 3, used: 1 });
    sheet.mode.set('ai');
    expect(sheet.aiRounds()).toEqual({ limit: 3, used: 1 });
    expect(sheet.ready()).toBe(true);
    set({ aiAccess: 'available', problems: [], aiRounds: { limit: 3, used: 3 } });
    expect(sheet.ready()).toBe(false);
    await sheet.start();
    expect(api.post).not.toHaveBeenCalled();
    sheet.mode.set('offline');
    await sheet.start();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/interview/sessions', { track: 'system-design', mode: 'offline' });
  });

  it('asks a guest to sign in for AI and never starts by itself once signed in', async () => {
    const { sheet, api, set } = setup('coding');
    sheet.mode.set('ai');
    expect(sheet.signingIn()).toBe(true);
    expect(sheet.ready()).toBe(false);
    await sheet.start();
    set({ aiAccess: 'available', problems: [] });
    expect(sheet.signingIn()).toBe(false);
    expect(sheet.mode()).toBe('ai');
    expect(api.post).not.toHaveBeenCalled();
    expect(sheet.aiNote()).toContain('shared code');
  });

  it('keeps scripted rounds when AI is unavailable on the server', async () => {
    const { sheet, api } = setup('behavioral', 'unavailable');
    sheet.mode.set('ai');
    expect(sheet.ready()).toBe(false);
    sheet.mode.set('offline');
    expect(sheet.aiNote()).toContain('including any story you start from');
    await sheet.start();
    expect(api.post).toHaveBeenCalledOnce();
  });

  it('needs a connection: offline or before the hub has reached the server it starts nothing', async () => {
    const { sheet, api, set } = setup('coding', null);
    expect(sheet.ready()).toBe(false);
    set({ aiAccess: 'unavailable', problems: [] }, true);
    expect(sheet.ready()).toBe(false);
    await sheet.start();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError(403, 'Sign in to use the AI interviewer.', 'ai_sign_in_required'), 1],
    [new ApiError(429, "You have used this hour's 3 AI rounds.", 'ai_rounds_used'), 1],
    [new ApiError(503, 'AI interviews are unavailable right now.', 'ai_unavailable'), 1],
    [new ApiError(500, 'Something went wrong.'), 0],
  ])('shows a refused start, stays open, and asks the hub to read access again only when it may have changed', async (error, reloads) => {
    const { sheet, api, router, events } = setup('coding', 'available', { limit: 3, used: 0 });
    sheet.mode.set('ai');
    api.post.mockRejectedValueOnce(error);
    await sheet.start();
    expect(sheet.error()).toBe(error.message);
    expect(sheet.open()).toBe(true);
    expect(events.changed).toBe(reloads);
    expect(api.post).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('ignores a repeated start while the first request is pending', async () => {
    const { sheet, api, router } = setup('coding');
    let resolve!: (value: { id: string }) => void;
    api.post.mockImplementation(() => new Promise((done) => (resolve = done)));
    const first = sheet.start();
    await sheet.start();
    expect(api.post).toHaveBeenCalledTimes(1);
    resolve({ id: 'session' });
    await first;
    expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith('/mock/session', { state: undefined });
  });

  it('drops an AI refusal once Scripted is chosen, and says scripted rounds remain when no AI round is left', async () => {
    const { sheet, api, fixture } = setup('coding', 'available', { limit: 3, used: 2 });
    sheet.mode.set('ai');
    api.post.mockRejectedValueOnce(new ApiError(429, "You have used this hour's 3 AI rounds.", 'ai_rounds_used'));
    await sheet.start();
    expect(sheet.error()).not.toBeNull();
    sheet.mode.set('offline');
    fixture.detectChanges();
    expect(sheet.error()).toBeNull();
  });

  it('reopens with a message when the session started but did not open', async () => {
    const { sheet, router, events } = setup('coding');
    router.navigateByUrl.mockResolvedValueOnce(false);
    await sheet.start();
    expect(sheet.open()).toBe(true);
    expect(sheet.error()).toBe('The round started but did not open. Open it from History.');
    expect(events.changed).toBe(1);
  });
});
