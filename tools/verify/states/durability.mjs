// The Durability lesson widget's audit states: each free-play state, a repair mid-play, the staged loss, Describe and
// its table, asking, revealed and the challenge.
const PATH = '/design/topics/sd-durability';
const widget = (p) => p.locator('app-durability-widget');
const stageToTop = (p) =>
  widget(p)
    .locator('g-stage')
    .evaluate((stage) => stage.scrollIntoView({ block: 'start' }));
const ready = (p) => widget(p).locator('svg.draw[aria-label^="One object stored as"]').waitFor({ state: 'attached' });

/** Sets the widget as a learner would, by its radios, each named in full. */
async function durabilityAt(p, { scheme, afr, repair, rack } = {}) {
  await ready(p);
  for (const name of [scheme, afr, repair, rack]) if (name) await widget(p).getByRole('radio', { name, exact: true }).check();
  await stageToTop(p);
}
const card = async (p, title) => {
  await durabilityAt(p);
  await widget(p).locator('.cards button', { hasText: title }).click();
  await widget(p).locator('app-experiment-dock .dock').waitFor();
};

export function durabilityStates() {
  return [
    { id: 'lesson-durability', path: PATH, setup: (p) => durabilityAt(p) },
    { id: 'lesson-durability-copies2', path: PATH, setup: (p) => durabilityAt(p, { scheme: '2 copies' }) },
    { id: 'lesson-durability-ec63', path: PATH, setup: (p) => durabilityAt(p, { scheme: '6 + 3 erasure coding' }) },
    { id: 'lesson-durability-ec104', path: PATH, setup: (p) => durabilityAt(p, { scheme: '10 + 4 erasure coding' }) },
    { id: 'lesson-durability-slow', path: PATH, setup: (p) => durabilityAt(p, { repair: '168 h, a week' }) },
    {
      id: 'lesson-durability-batch',
      path: PATH,
      setup: (p) => durabilityAt(p, { scheme: '10 + 4 erasure coding', afr: '10% of disks fail a year', repair: '168 h, a week' }),
    },
    { id: 'lesson-durability-rack', path: PATH, setup: (p) => durabilityAt(p, { rack: 'One rack: every copy in one rack' }) },
    {
      id: 'lesson-durability-moment',
      path: PATH,
      setup: async (p) => {
        await durabilityAt(p, { scheme: '10 + 4 erasure coding' });
        await widget(p).locator('button.play').click();
        await widget(p).locator('button.play').click();
        await stageToTop(p);
      },
    },
    {
      id: 'lesson-durability-staged',
      path: PATH,
      setup: async (p) => {
        await durabilityAt(p, { scheme: '10 + 4 erasure coding', afr: '10% of disks fail a year', repair: '168 h, a week' });
        for (let i = 0; i < 3; i++) await widget(p).locator('button.pill').click();
        await widget(p).locator('svg.draw [data-id="reads-lost"]').waitFor({ state: 'attached' });
        await stageToTop(p);
      },
    },
    {
      id: 'lesson-durability-rackevent',
      path: PATH,
      setup: async (p) => {
        await durabilityAt(p, { rack: 'One rack: every copy in one rack' });
        for (let i = 0; i < 3; i++) await widget(p).locator('button.pill').click();
        await widget(p).locator('svg.draw [data-id="rack-x"]').waitFor({ state: 'attached' });
        await stageToTop(p);
      },
    },
    {
      id: 'lesson-durability-describe',
      path: PATH,
      setup: async (p) => {
        await durabilityAt(p);
        await widget(p).getByRole('button', { name: 'Describe' }).click();
        await widget(p).locator('.describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-durability-table',
      path: PATH,
      setup: async (p) => {
        await durabilityAt(p, { scheme: '10 + 4 erasure coding', rack: 'One rack: every piece in one rack' });
        await widget(p).getByRole('button', { name: 'Describe' }).click();
        await widget(p).locator('.describe g-data-table').scrollIntoViewIfNeeded();
      },
    },
    {
      id: 'lesson-durability-asking',
      path: PATH,
      setup: async (p) => {
        await card(p, 'A week to repair');
        await stageToTop(p);
      },
    },
    {
      id: 'lesson-durability-revealed',
      path: PATH,
      setup: async (p) => {
        await card(p, 'Half the storage');
        await widget(p)
          .locator('app-widget-check')
          .getByRole('button', { name: /^About 110× less likely/ })
          .click();
        await widget(p)
          .locator('app-widget-check .explain')
          .filter({ hasText: /^About 110× less likely: 11\.8 nines/ })
          .waitFor();
        await stageToTop(p);
      },
    },
    {
      id: 'lesson-durability-challenge',
      path: PATH,
      setup: async (p) => {
        await card(p, 'Challenge');
        await durabilityAt(p, { scheme: '10 + 4 erasure coding', repair: '72 h' });
        await widget(p).locator('app-experiment-dock .reveal').waitFor();
        await stageToTop(p);
      },
    },
  ];
}
