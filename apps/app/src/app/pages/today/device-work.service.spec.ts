import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';
import { emptyProgress, type ProgressState } from '@grasp/engine';
import { ApiService } from '../../core/api.service';
import { CaseDraftsService, newCaseDraft } from '../design/case/case-drafts.service';
import { MockLoopService, type MockLoop } from '../interview/mock-loop.service';
import { DeviceWorkService } from './device-work.service';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    keys: vi.fn(async () => ({ keys: [] })),
  },
}));

const KEYS = [
  'grasp.code.draft.two-sum.python',
  'grasp.code.draft.two-sum.typescript',
  'grasp.code.draft.trapping-rain-water.python',
  'grasp.code.draft.group-anagrams.python',
  'grasp.behavioral.draft.conflict-3',
  'grasp.behavioral.draft.conflict-4',
  'grasp.behavioral.draft.conflict-0',
  'grasp.case.url-shortener',
];

describe('DeviceWorkService', () => {
  // conflict-3 misses its result, conflict-4 has every STAR part (a finished answer, not work), conflict-0 is no question.
  const loop = signal<MockLoop | null>(null);

  async function load(state: ProgressState) {
    vi.mocked(Preferences.keys).mockResolvedValue({ keys: KEYS });
    const told = { situation: 'S', task: 'T', action: 'A', result: 'R', reflection: '' };
    vi.mocked(Preferences.get).mockImplementation(async ({ key }) => ({
      value: key.endsWith('conflict-4')
        ? JSON.stringify(told)
        : key.endsWith('conflict-3')
          ? JSON.stringify({ ...told, result: ' ' })
          : null,
    }));
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: {} },
        {
          provide: CaseDraftsService,
          useValue: {
            load: async () => undefined,
            draft: (id: string) => (id === 'url-shortener' ? { ...newCaseDraft(), reached: 2 } : undefined),
          },
        },
        { provide: MockLoopService, useValue: { load: async () => loop(), loop } },
      ],
    });
    const work = TestBed.inject(DeviceWorkService);
    await work.load();
    return { work, items: work.items(state), rule4: work.upNextWork(state) };
  }

  it('lists the mock loop, case studies, code and answer drafts on this device, then attempted problems from the log', async () => {
    loop.set({
      id: 'l',
      mode: 'offline',
      level: 'mid',
      createdAt: '2026-10-01T00:00:00Z',
      completedAt: null,
      rounds: [
        { track: 'coding', problemId: 'x', sessionId: 's1' },
        { track: 'behavioral', problemId: 'y', sessionId: null },
      ],
    } as MockLoop);
    const state = emptyProgress();
    state.coding['trapping-rain-water'] = { attempts: 2, solvedAt: null, bestPassed: 2, total: 5, lastAt: '2026-10-10T00:00:00Z' };
    state.coding['group-anagrams'] = {
      attempts: 1,
      solvedAt: '2026-10-10T00:00:00Z',
      bestPassed: 4,
      total: 4,
      lastAt: '2026-10-10T00:00:00Z',
    };
    const { items } = await load(state);
    expect(items.map((w) => [w.name, w.detail, w.device, w.link.join('/')])).toEqual([
      ['Mock loop', '1 of 2 rounds started', true, '/mock/loop'],
      ['URL Shortener', 'stage 3 of 9', true, '/design/cases/url-shortener'],
      ['Two Sum', 'code draft', true, '/coding/problems/two-sum'],
      ['Conflict & Disagreement', 'answer draft', true, '/behavioral/question/conflict-3'],
      ['Trapping Rain Water', 'best 2 of 5 tests', false, '/coding/problems/trapping-rain-water'],
    ]);
  });

  it('offers Up next only this device’s work in a round', async () => {
    loop.set({
      id: 'l',
      mode: 'offline',
      level: 'mid',
      createdAt: '2026-10-01T00:00:00Z',
      completedAt: null,
      rounds: [{ track: 'coding', problemId: 'x', sessionId: null }],
    } as MockLoop);
    const { rule4, items } = await load(emptyProgress());
    expect(items[0].detail, 'a loop with no round started').toBe('1 round, not started');
    expect(rule4.map((w) => [w.round, w.title, w.detail])).toEqual([
      ['design', 'Continue URL Shortener', 'you stopped at stage 3 of 9'],
      ['coding', 'Continue Two Sum', 'your code draft is waiting'],
      ['coding', 'Continue Trapping Rain Water', 'your code draft is waiting'],
      ['coding', 'Continue Group Anagrams', 'your code draft is waiting'],
      ['behavioral', 'Finish your Conflict & Disagreement answer', 'your STAR draft is waiting'],
    ]);
  });
});
