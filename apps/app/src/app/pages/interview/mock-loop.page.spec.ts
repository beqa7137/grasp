import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { replay } from '@grasp/engine';
import { ApiError, ApiService } from '../../core/api.service';
import { ProgressService } from '../../core/progress.service';
import type { InterviewCatalog } from './interview.types';
import { MockLoopPage } from './mock-loop.page';
import { MockLoopService, type MockLoop } from './mock-loop.service';

function setup(catalog: InterviewCatalog) {
  const loop = signal<MockLoop | null>({
    id: 'loop',
    mode: 'ai',
    level: 'mid',
    createdAt: '2026-10-16T10:00:00Z',
    completedAt: null,
    rounds: [
      { track: 'coding', problemId: 'warmer-days', reason: 'any', sessionId: null },
      { track: 'behavioral', problemId: 'conflict', reason: 'any', sessionId: null },
    ],
  });
  const loops = {
    loop,
    update: vi.fn(async (change: (l: MockLoop) => MockLoop) => loop.set(change(loop()!))),
    refresh: vi.fn(async () => ({ loop: loop(), sessions: {}, missing: [] })),
  };
  const api = {
    get: vi.fn(async (path: string) => (path.endsWith('/problems') ? catalog : [])),
    post: vi.fn(async (): Promise<unknown> => ({ id: 'session' })),
  };
  TestBed.configureTestingModule({
    imports: [MockLoopPage],
    providers: [
      { provide: ApiService, useValue: api },
      { provide: Router, useValue: { navigate: vi.fn(async () => true), url: '/mock/loop' } },
      { provide: ProgressService, useValue: { state: signal(replay([])) } },
      { provide: MockLoopService, useValue: loops },
    ],
  }).overrideComponent(MockLoopPage, { set: { template: '', imports: [] } });
  return { page: TestBed.createComponent(MockLoopPage).componentInstance, api, loop };
}

describe('MockLoopPage', () => {
  it('offers scripted for the remaining rounds when a round finds no AI rounds left this hour', async () => {
    const { page, api, loop } = setup({ aiAccess: 'available', problems: [] });
    await page.reload();
    api.post.mockRejectedValueOnce(new ApiError(429, "You have used this hour's 3 AI rounds.", 'ai_rounds_used'));
    await page.startRound(0);
    expect(page.aiRefused()).toBe(true);
    expect(page.error()).toBe("You have used this hour's 3 AI rounds.");
    await page.useScripted();
    expect(loop()!.mode).toBe('offline');
    await page.startRound(0);
    expect(api.post).toHaveBeenLastCalledWith('/interview/sessions', { track: 'coding', problemId: 'warmer-days', mode: 'offline' });
  });

  it('warns at setup when fewer AI rounds are left this hour than the loop has', async () => {
    const { page } = setup({ aiAccess: 'available', problems: [], aiRounds: { limit: 3, used: 2 } });
    await page.reload();
    expect(page.aiRoundsShort()).toEqual({ left: 1, needed: 3 });
  });
});
