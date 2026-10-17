import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CASE_CATALOG,
  COMPETENCY_CATALOG,
  LEVEL_PROFILES,
  PATTERN_CATALOG,
  SD_TOPICS,
  itemsForTopic,
  loopReadiness,
  skillGrids,
  skillStatus,
  type SkillKind,
  type SkillState,
} from '@grasp/engine';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ProgressService, type NewEvent } from '../../core/progress.service';
import { StoryBankService } from '../behavioral/story-bank.service';
import { ProgressPage } from './progress.page';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    keys: vi.fn(async () => ({ keys: [] })),
  },
}));

const STATES: SkillState[] = ['new', 'learning', 'practiced', 'ready'];

/** Seeded learners: nothing yet, and a Senior learner with solves, a lesson, reviews, a finished case and a flag. */
const SEEDS: Record<string, NewEvent[]> = {
  fresh: [],
  senior: [
    { type: 'target.set', target: { level: 'senior', rounds: { coding: 2, design: 2, behavioral: 1 } } },
    { type: 'code.submitted', problemId: 'two-sum', language: 'python', passed: 5, total: 5 },
    { type: 'code.submitted', problemId: 'koko-bananas', language: 'python', passed: 3, total: 12 },
    ...itemsForTopic('sd-caching')
      .slice(0, 2)
      .map((i): NewEvent => ({ type: 'review.graded', itemId: i.id, rating: 3, correct: true, durationMs: 8000 })),
    { type: 'interview.scored', sessionId: 's1', track: 'coding', verdict: 'lean-no-hire', weakPatterns: ['heap'] },
  ],
};

describe('Progress', () => {
  async function render(events: NewEvent[]) {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    TestBed.configureTestingModule({
      imports: [ProgressPage],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: { get: async () => ({ events: [] }), post: async () => ({ acknowledgedIds: [], deferredFutureIds: [] }) },
        },
        { provide: AuthService, useValue: { signedIn: signal(false) } },
        { provide: StoryBankService, useValue: { load: async () => undefined, stories: signal([]) } },
      ],
    });
    const progress = TestBed.inject(ProgressService);
    for (const event of events) await progress.record(event);
    const fixture = TestBed.createComponent(ProgressPage);
    await fixture.whenStable();
    fixture.detectChanges();
    return { progress, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => vi.unstubAllGlobals());

  it.each(Object.keys(SEEDS))('draws each skill in the state status.ts gives it, with the totals it counts (%s)', async (seed) => {
    const { progress, el } = await render(SEEDS[seed]);
    const state = progress.state();
    const ctx = { state, stories: [], now: progress.now(), profile: LEVEL_PROFILES[state.target?.level ?? 'mid'] };
    const grids = skillGrids(state, [], progress.now());
    const rows: [string, SkillKind, number][] = [
      ['Coding skills', 'pattern', 23],
      ['System design skills', 'topic', 34],
      ['System design cases', 'case', grids[1].cases.length],
      ['Behavioral skills', 'competency', 13],
    ];
    for (const [label, kind, count] of rows) {
      const squares = [...el.querySelectorAll(`ul[aria-label="${label}"] li`)];
      expect(squares, label).toHaveLength(count);
      const shown = squares.map((li) => STATES.find((s) => li.classList.contains(s)));
      const expected = squares.map((li) => skillStatus(kind, NAMES[kind].get(li.textContent!.trim().split(':')[0])!, ctx).state);
      expect(shown, label).toEqual(expected);
    }
    for (const grid of grids) {
      const name = { coding: 'Coding', design: 'System design', behavioral: 'Behavioral' }[grid.round];
      const squares = [...el.querySelectorAll(`ul[aria-label^="${name} "] li`)];
      for (const s of STATES) expect(squares.filter((li) => li.classList.contains(s)).length, `${name} ${s}`).toBe(grid.totals[s]);
    }
  });

  it('shows arithmetic whose result is the ring', async () => {
    const { progress, el } = await render(SEEDS['senior']);
    const readiness = loopReadiness(progress.state(), [], progress.now());
    const ring = el.querySelector('app-readiness-ring')!;
    expect(Number(ring.getAttribute('aria-valuenow'))).toBe(readiness.score);
    const sum = el.querySelector('.sum')!.textContent!.trim();
    expect(sum).toMatch(/^\(2 × Coding \d+ \+ 2 × System design \d+ \+ Behavioral \d+\) \/ 5 = \d+$/);
    expect(Number(sum.match(/= (\d+)$/)![1])).toBe(readiness.score);
    const lines = [...el.querySelectorAll('.line')].map((l) => Number(l.textContent!.match(/= (\d+)$/)![1]));
    expect(lines).toEqual(readiness.rounds.map((r) => r.score));
  });

  it('lists the weakest spots with a drill, problems by difficulty and the review strength', async () => {
    const { el } = await render(SEEDS['senior']);
    expect([...el.querySelectorAll('a')].find((a) => a.textContent!.startsWith('Drill this'))!.getAttribute('href')).toBe(
      '/today/drill?topics=heap',
    );
    expect(el.textContent).toContain('1 tried and not solved yet.');
    expect(el.querySelector('g-stat')!.textContent).toContain('Review strength');
    expect(el.textContent).toContain('Your stories are saved only on this device until you sign in');
  });
});

const NAMES: Record<SkillKind, Map<string, string>> = {
  pattern: new Map(PATTERN_CATALOG.map((p) => [p.name, p.id])),
  topic: new Map(SD_TOPICS.map((t) => [t.name, t.id])),
  case: new Map(CASE_CATALOG.map((c) => [c.title, c.id])),
  competency: new Map(COMPETENCY_CATALOG.map((c) => [c.name, c.id])),
};
