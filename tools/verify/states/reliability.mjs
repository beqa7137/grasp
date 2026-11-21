// The Reliability lesson widget's audit states: each free-play state, Describe, asking, revealed and the challenge.
const PATH = '/design/topics/sd-reliability';
const widget = (p) => p.locator('app-reliability-widget');
const stageToTop = (p) =>
  widget(p)
    .locator('g-stage')
    .evaluate((stage) => stage.scrollIntoView({ block: 'start' }));
const ready = (p) => widget(p).locator('svg.draw .capline').waitFor({ state: 'attached' });

/** Sets the copies and the conditions as a learner would, by the steppers and the toggles. */
async function reliabilityAt(p, { lb = 2, app = 3, db = 1, recs = 1, optional = false, shared = false, failover = false } = {}) {
  await ready(p);
  const w = widget(p);
  const parts = {
    lb: ['load balancers', 'Load balancer', lb],
    app: ['app servers', 'App servers', app],
    db: ['databases', 'Database', db],
    recs: ['recommendations services', 'Recommendations', recs],
  };
  for (const [many, name, n] of Object.values(parts)) {
    const output = w.locator(`output[aria-label^="${name}:"]`);
    let now = Number((await output.getAttribute('aria-label')).match(/(\d+)/)[1]);
    while (now !== n) {
      const up = now < n;
      await w.getByRole('button', { name: `${up ? 'More' : 'Fewer'} ${many}`, exact: true }).click();
      now += up ? 1 : -1;
      await w.locator(`output[aria-label^="${name}: ${now} "]`).waitFor({ state: 'attached' });
    }
  }
  await w.getByRole('checkbox', { name: /^Recs optional/ }).setChecked(optional);
  await w.getByRole('checkbox', { name: /^Shared failures/ }).setChecked(shared);
  await w.getByRole('checkbox', { name: /^Failover 5 min/ }).setChecked(failover);
  await stageToTop(p);
}
const card = async (p, title) => {
  await ready(p);
  await widget(p).locator('.cards button', { hasText: title }).click();
};

export const reliabilityStates = () => [
  { id: 'lesson-reliability', path: PATH, setup: (p) => reliabilityAt(p) },
  { id: 'lesson-reliability-series', path: PATH, setup: (p) => reliabilityAt(p, { lb: 1, app: 1 }) },
  { id: 'lesson-reliability-pairs', path: PATH, setup: (p) => reliabilityAt(p, { app: 2, db: 2, optional: true }) },
  { id: 'lesson-reliability-shared', path: PATH, setup: (p) => reliabilityAt(p, { app: 2, db: 2, optional: true, shared: true }) },
  { id: 'lesson-reliability-failover', path: PATH, setup: (p) => reliabilityAt(p, { app: 2, db: 2, optional: true, failover: true }) },
  {
    id: 'lesson-reliability-triples',
    path: PATH,
    setup: (p) => reliabilityAt(p, { lb: 3, app: 3, db: 3, recs: 3, shared: true, failover: true }),
  },
  {
    id: 'lesson-reliability-step',
    path: PATH,
    setup: async (p) => {
      await reliabilityAt(p, { app: 2, db: 2, optional: true });
      await widget(p).locator('button.play:not(.step)').focus();
      await p.keyboard.press('ArrowRight');
      await stageToTop(p);
    },
  },
  {
    id: 'lesson-reliability-describe',
    path: PATH,
    setup: async (p) => {
      await reliabilityAt(p);
      await widget(p).getByRole('button', { name: 'Describe' }).click();
      await widget(p).locator('.describe g-data-table').scrollIntoViewIfNeeded();
    },
  },
  {
    id: 'lesson-reliability-table',
    path: PATH,
    setup: async (p) => {
      await reliabilityAt(p, { lb: 3, app: 3, db: 3, recs: 3, shared: true, failover: true });
      await widget(p).getByRole('button', { name: 'Describe' }).click();
      await widget(p).locator('.describe g-data-table').scrollIntoViewIfNeeded();
    },
  },
  {
    id: 'lesson-reliability-asking',
    path: PATH,
    setup: async (p) => {
      await card(p, 'Four parts in a row');
      await widget(p).locator('app-widget-check legend').waitFor();
      await stageToTop(p);
    },
  },
  {
    id: 'lesson-reliability-revealed',
    path: PATH,
    setup: async (p) => {
      await card(p, 'A second database');
      await widget(p)
        .locator('app-widget-check')
        .getByRole('button', { name: /^32 s: only while both/ })
        .click();
      await widget(p)
        .locator('app-widget-check .explain')
        .filter({ hasText: /^32 s: the part is down/ })
        .waitFor();
      await stageToTop(p);
    },
  },
  {
    id: 'lesson-reliability-challenge',
    path: PATH,
    setup: async (p) => {
      await card(p, 'Three nines from seven copies');
      const w = widget(p);
      await w.getByRole('button', { name: 'Fewer app servers', exact: true }).click();
      await w.getByRole('button', { name: 'More databases', exact: true }).click();
      await w.getByRole('checkbox', { name: /^Recs optional/ }).check();
      await p.locator('app-experiment-dock .reveal').waitFor();
      await stageToTop(p);
    },
  },
];
