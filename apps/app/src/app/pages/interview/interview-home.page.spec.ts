import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, type ParamMap } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { replay, type StoredEvent } from '@grasp/engine';
import { ApiError, ApiService } from '../../core/api.service';
import { LearnerService } from '../../core/learner.service';
import { mockHistoryKey } from '../../core/local-drafts';
import { ProgressService } from '../../core/progress.service';
import { StoryBankService } from '../behavioral/story-bank.service';
import { InterviewHomePage } from './interview-home.page';
import type { InterviewCatalog, InterviewSession, Scorecard } from './interview.types';
import { MockLoopService } from './mock-loop.service';
import { BehaviorSubject } from 'rxjs';

const AT = '2026-10-10T09:00:00.000Z';

const session = (
  id: string,
  track: InterviewSession['track'],
  title: string,
  at: string,
  verdict?: Scorecard['verdict'],
): InterviewSession => ({
  id,
  track,
  problem: { id: `${id}-problem`, title, track, patternIds: [] },
  messages: [],
  hintsUsed: 0,
  status: verdict ? 'scored' : 'active',
  createdAt: at,
  mode: 'offline',
  aiAccess: 'sign-in-required',
  ...(verdict
    ? {
        scoredAt: at,
        scorecard: { verdict, summary: '', dimensions: [], strengths: [], improvements: [], weakPatterns: [], mode: 'offline' as const },
      }
    : {}),
});

function setup(events: StoredEvent[] = [], sessions: InterviewSession[] = [], query: Record<string, string> = {}) {
  const learnerId = signal('learner-1');
  const queryParamMap = new BehaviorSubject<ParamMap>(convertToParamMap(query));
  const router = { navigate: vi.fn(async () => true) };
  const catalog: InterviewCatalog = { aiAccess: 'sign-in-required', problems: [] };
  const api = {
    get: vi.fn(async (path: string): Promise<InterviewCatalog | InterviewSession[]> => (path.endsWith('/problems') ? catalog : sessions)),
  };
  TestBed.configureTestingModule({
    imports: [InterviewHomePage],
    providers: [
      { provide: ApiService, useValue: api },
      { provide: LearnerService, useValue: { id: learnerId } },
      { provide: ProgressService, useValue: { state: signal(replay(events)), now: signal(new Date(AT)) } },
      { provide: StoryBankService, useValue: { load: vi.fn(async () => undefined), stories: signal([]) } },
      { provide: MockLoopService, useValue: { load: vi.fn(async () => null), loop: signal(null) } },
      { provide: ActivatedRoute, useValue: { queryParamMap } },
      { provide: Router, useValue: router },
    ],
  }).overrideComponent(InterviewHomePage, { set: { template: '', imports: [] } });
  const page = TestBed.createComponent(InterviewHomePage).componentInstance;
  page.reload = vi.fn();
  return { page, api, catalog, learnerId, router };
}

beforeEach(async () => {
  await Preferences.remove({ key: mockHistoryKey('learner-1') });
});

describe('InterviewHomePage', () => {
  it('has one Single round card per round in the Target, with the last verdict, then readiness once it loads', async () => {
    const { page } = setup([
      { id: 't', at: AT, type: 'target.set', target: { level: 'senior', rounds: { coding: 2, design: 0, behavioral: 1 } } },
      {
        id: 'i',
        at: AT,
        type: 'interview.scored',
        sessionId: 's',
        track: 'behavioral',
        verdict: 'lean-hire',
        weakPatterns: [],
        competencyId: 'conflict',
        weakCompetencies: [],
      },
    ]);
    expect(page.rounds().map((r) => [r.track, r.minutes, r.hub, r.last])).toEqual([
      ['coding', 45, '/coding', 'No rounds yet'],
      ['behavioral', 20, '/behavioral', 'Last round: Lean hire, Oct 10'],
    ]);
    expect(page.rounds().map((r) => r.readiness)).toEqual(['Readiness …', 'Readiness …']);
    await page.loadReadiness();
    expect(page.rounds().map((r) => r.readiness)).toEqual(['Readiness 0 · Building', 'Readiness 6 · Building']);
    expect(page.loopRounds()).toBe('Coding 45 · Behavioral 20 min');
    expect(page.level()).toBe('senior');
    expect(page.loopName()).toBe('Senior loop');
    expect(page.scoredLine()).toBe('1 round scored');
  });

  it('assumes a Mid-level loop of all three rounds without a Target, and says so', () => {
    const { page } = setup();
    expect(page.rounds().map((r) => r.track)).toEqual(['coding', 'system-design', 'behavioral']);
    expect(page.loopName()).toBe('Mid-level loop (assumed)');
    expect(page.loopRounds()).toBe('Coding 45 · System design 45 · Behavioral 20 min');
  });

  it('groups History by round, newest first, and keeps the last five scorecards on the device', async () => {
    const sessions = [
      session('c1', 'coding', 'Days Until Warmer', '2026-10-01T00:00:00Z', 'hire'),
      session('b1', 'behavioral', 'Conflict & Disagreement', '2026-10-02T00:00:00Z', 'lean-hire'),
      session('c2', 'coding', 'Rate Limiter', '2026-10-03T00:00:00Z'),
      ...['d1', 'd2', 'd3', 'd4', 'd5'].map((id, i) => session(id, 'system-design', 'News Feed', `2026-10-0${4 + i}T00:00:00Z`, 'no-hire')),
    ];
    const { page } = setup([], sessions);
    await page.ionViewWillEnter();
    expect(page.history().map((g) => [g.name, g.entries.map((e) => e.id)])).toEqual([
      ['Coding', ['c2', 'c1']],
      ['System design', ['d5', 'd4', 'd3', 'd2', 'd1']],
      ['Behavioral', ['b1']],
    ]);
    const { value } = await Preferences.get({ key: mockHistoryKey('learner-1') });
    expect((JSON.parse(value!) as { id: string }[]).map((e) => e.id)).toEqual(['d5', 'd4', 'd3', 'd2', 'd1']);
  });

  it('without a connection says so and shows the scorecards this device kept, grouped by round', async () => {
    const { page, api } = setup([], [session('c1', 'coding', 'Days Until Warmer', AT, 'hire')]);
    await page.ionViewWillEnter();
    api.get.mockRejectedValue(new ApiError(0, 'Cannot reach the Grasp server. Check your connection.'));
    await page.load();
    expect(page.offline()).toBe(true);
    expect(page.error()).toBeNull();
    expect(page.history().map((g) => [g.name, g.entries.map((e) => [e.title, e.verdict])])).toEqual([
      ['Coding', [['Days Until Warmer', 'hire']]],
    ]);
    expect(page.rounds()).toHaveLength(3);
  });

  it('shows a server failure with Try again, not the offline state, and recovers on retry', async () => {
    const { page, api } = setup();
    api.get.mockRejectedValueOnce(new ApiError(503, 'Try again shortly.'));
    await page.ionViewWillEnter();
    expect(page.offline()).toBe(false);
    expect(page.error()).toBe('Try again shortly.');
    expect(page.catalog()).toBeNull();
    await page.load();
    expect(page.error()).toBeNull();
    expect(page.catalog()).toEqual({ aiAccess: 'sign-in-required', problems: [] });
  });

  it('reads access and the sessions again after sign-in, without starting anything', async () => {
    const { page, api, catalog } = setup();
    await page.ionViewWillEnter();
    catalog.aiAccess = 'available';
    catalog.aiRounds = { limit: 3, used: 0 };
    api.get.mockClear();
    await page.load();
    expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/interview/problems', '/interview/sessions']);
    expect(page.catalog()?.aiRounds).toEqual({ limit: 3, used: 0 });
  });

  it('opens the start sheet on the chosen round', () => {
    const { page } = setup();
    page.openSheet('behavioral');
    expect(page.sheetTrack()).toBe('behavioral');
    expect(page.sheetPick()).toBeNull();
    expect(page.sheetOpen()).toBe(true);
  });

  it("opens a search result's round with its question picked, then drops the parameter so back does not reopen it", () => {
    const { page, router } = setup([], [], { round: 'rate-limiter' });
    expect(page.sheetTrack()).toBe('system-design');
    expect(page.sheetPick()).toBe('rate-limiter');
    expect(page.sheetOpen()).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { round: null }, replaceUrl: true }));
  });

  it('drops an unknown round without opening a sheet', () => {
    const { page, router } = setup([], [], { round: 'nope' });
    expect(page.sheetOpen()).toBe(false);
    expect(router.navigate).toHaveBeenCalled();
  });

  it('says so when the start sheet fails to load, offers Reload, and loads it again on the next tap', async () => {
    const { page } = setup();
    page.importSheet = vi.fn(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
    page.openSheet('coding');
    expect(page.opening()).toBe('coding');
    await page.loadSheet();
    expect(page.partFailed()).toBe(true);
    expect(page.sheetOpen()).toBe(false);
    expect(page.opening()).toBeNull();
    page.openSheet('coding');
    expect(page.importSheet).toHaveBeenCalledTimes(2);
  });

  it('says readiness is unavailable when its code fails to load', async () => {
    const { page } = setup();
    page.importReadiness = vi.fn(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
    await page.loadReadiness();
    expect(page.partFailed()).toBe(true);
    expect(page.rounds().map((r) => r.readiness)).toEqual(['Readiness unavailable', 'Readiness unavailable', 'Readiness unavailable']);
  });

  it('runs a reload asked for during a load once it ends, so a sign-in during the first load still reads the new access', async () => {
    const { page, api, catalog } = setup();
    let release!: () => void;
    api.get.mockImplementationOnce(() => new Promise((done) => (release = () => done(catalog))));
    const first = page.load();
    catalog.aiAccess = 'available';
    await page.load();
    release();
    await first;
    expect(api.get.mock.calls.filter(([path]) => path === '/interview/problems')).toHaveLength(2);
    expect(page.catalog()?.aiAccess).toBe('available');
  });

  it('drops a load that outlives its learner, leaving the next learner view and device cache alone', async () => {
    const { page, api, learnerId } = setup([], [session('c1', 'coding', 'Days Until Warmer', AT, 'hire')]);
    let release!: () => void;
    api.get.mockImplementationOnce(() => new Promise((done) => (release = () => done({ aiAccess: 'available', problems: [] }))));
    const loading = page.load();
    learnerId.set('learner-2');
    release();
    await loading;
    expect(page.catalog()).toBeNull();
    expect(page.sessions()).toEqual([]);
    expect((await Preferences.get({ key: mockHistoryKey('learner-1') })).value).toBeNull();
  });
});
