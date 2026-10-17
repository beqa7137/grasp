import { goto, settle } from '../lib.mjs';

/**
 * A Mid-level loop three weeks out at 45 minutes, missed predictions and a flagged pattern, a solve, an attempted problem,
 * and on this device a case study at stage 3 and a code draft: Today's readiness, Continue and Weak spots all show.
 */
async function seedLoop(p) {
  await p.evaluate(() => {
    const day = (offset) => {
      const d = new Date(Date.now() + offset * 86_400_000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const at = new Date(Date.now() - 86_400_000).toISOString();
    let n = 0;
    const event = (body) => ({ id: `r14-state-${++n}`, at, ...body });
    const events = [
      event({ type: 'target.set', target: { level: 'mid', rounds: { coding: 2, design: 1, behavioral: 1 } } }),
      event({
        type: 'plan.set',
        plan: { interviewDate: day(21), minutesPerDay: 45, rounds: ['coding', 'design', 'behavioral'], level: 'new' },
      }),
      ...[false, false, true].map((correct) =>
        event({ type: 'predict.answered', patternId: 'binary-search', algorithmId: 'binary-search', correct }),
      ),
      event({ type: 'interview.scored', sessionId: 'r14-state', track: 'coding', verdict: 'lean-no-hire', weakPatterns: ['heap'] }),
      event({ type: 'code.submitted', problemId: 'two-sum', language: 'python', passed: 5, total: 5 }),
      event({ type: 'code.submitted', problemId: 'trapping-rain-water', language: 'python', passed: 2, total: 5 }),
    ];
    localStorage.setItem('CapacitorStorage.grasp.events', JSON.stringify({ events, cursor: null }));
    localStorage.setItem('CapacitorStorage.grasp.case.url-shortener', JSON.stringify({ attempt: 'r14-state', reached: 2, stages: [] }));
    localStorage.setItem('CapacitorStorage.grasp.code.draft.valid-sudoku.python', 'def is_valid_sudoku(board):\n    pass\n');
  });
  await p.reload({ waitUntil: 'networkidle' });
}

/** R14's Today aside, Progress, the weak-spot drill, the plan page's day strip and Settings' "Your loop". */
export function todayStates() {
  return [
    {
      id: 'today-aside',
      path: '/today',
      setup: async (p) => {
        await seedLoop(p);
        await p.locator('app-today-aside app-readiness-card').waitFor();
        await p.getByRole('heading', { name: 'Weak spots' }).waitFor();
        await settle(p);
      },
    },
    { id: 'progress-fresh', path: '/today/progress', setup: (p) => p.locator('app-readiness-ring').waitFor() },
    {
      id: 'progress',
      path: '/today/progress',
      setup: async (p) => {
        await seedLoop(p);
        await p.locator('app-readiness-ring').waitFor();
        await settle(p);
      },
    },
    {
      id: 'progress-unfinished',
      path: '/today/progress',
      setup: async (p) => {
        await seedLoop(p);
        await p.getByText('Unfinished').scrollIntoViewIfNeeded();
        await settle(p);
      },
    },
    {
      id: 'drill-weak-spots',
      path: '/today',
      setup: async (p) => {
        await seedLoop(p);
        await goto(p, '/today/drill?topics=heap,binary-search');
        await p.locator('g-question-card').waitFor();
        await settle(p);
      },
    },
    {
      id: 'plan-day-strip',
      path: '/today',
      setup: async (p) => {
        await seedLoop(p);
        await goto(p, '/today/plan');
        await p.getByRole('radiogroup', { name: 'Your days' }).getByRole('radio').nth(2).click();
        await settle(p);
      },
    },
    {
      id: 'plan-by-round',
      path: '/today',
      setup: async (p) => {
        await seedLoop(p);
        await goto(p, '/today/plan');
        await p.getByRole('heading', { name: 'By round' }).scrollIntoViewIfNeeded();
        await settle(p);
      },
    },
    {
      id: 'settings-loop-edit',
      path: '/today',
      setup: async (p) => {
        await seedLoop(p);
        await goto(p, '/today/settings');
        await p.getByRole('button', { name: 'Edit your loop' }).click();
        await p.locator('app-loop-card').waitFor();
        await settle(p);
      },
    },
  ];
}
