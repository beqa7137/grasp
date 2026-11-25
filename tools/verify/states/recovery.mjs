/** The Backups & Recovery widget's audit states: each free-play state, Describe and its table, asking, revealed and the challenge. */
const PATH = '/design/topics/sd-recovery';
const stageToTop = (p) => p.locator('app-recovery-widget g-stage').evaluate((stage) => stage.scrollIntoView({ block: 'start' }));
/** Sets the widget as a learner would, by its radios, once its summary is drawn; a replay speed is named by its start, as narrow stages shorten it. */
const recoveryAt = async (p, radios = []) => {
  const widget = p.locator('app-recovery-widget');
  await widget.locator('svg.draw[aria-label^="A timeline of one disaster"]').waitFor();
  for (const name of radios)
    await widget.getByRole('radio', name.endsWith('×') ? { name: new RegExp(`^${name}`) } : { name, exact: true }).check();
  await stageToTop(p);
};
const card = async (p, title) => {
  await recoveryAt(p);
  await p.locator('app-recovery-widget .cards button', { hasText: title }).click();
};
const describe = async (p, radios) => {
  await recoveryAt(p, radios);
  await p.locator('app-recovery-widget').getByRole('button', { name: 'Describe' }).click();
  await p.locator('app-recovery-widget .describe g-data-table').scrollIntoViewIfNeeded();
};

export function recoveryStates() {
  return [
    { id: 'lesson-recovery', path: PATH, setup: (p) => recoveryAt(p) },
    { id: 'lesson-recovery-drop', path: PATH, setup: (p) => recoveryAt(p, ['Table dropped']) },
    { id: 'lesson-recovery-big', path: PATH, setup: (p) => recoveryAt(p, ['10 TB', '50 GB/min']) },
    { id: 'lesson-recovery-frequent', path: PATH, setup: (p) => recoveryAt(p, ['1 h', '10 s', '20×', 'Sync']) },
    { id: 'lesson-recovery-small', path: PATH, setup: (p) => recoveryAt(p, ['500 GB', '50 GB/min', '6 h', '5 min', '5×']) },
    {
      id: 'lesson-recovery-reduced',
      path: PATH,
      setup: async (p) => {
        await recoveryAt(p);
        await p.locator('app-recovery-widget').getByRole('button', { name: 'Play the disaster and the recovery' }).click();
        await p.locator('app-recovery-widget .caption').waitFor();
      },
    },
    { id: 'lesson-recovery-describe', path: PATH, setup: (p) => describe(p) },
    { id: 'lesson-recovery-table', path: PATH, setup: (p) => describe(p, ['Table dropped', '10 TB', 'Sync']) },
    {
      id: 'lesson-recovery-asking',
      path: PATH,
      setup: async (p) => {
        await card(p, 'A dropped table');
        await p.locator('app-widget-check legend').waitFor();
        await stageToTop(p);
      },
    },
    {
      id: 'lesson-recovery-revealed',
      path: PATH,
      setup: async (p) => {
        await card(p, 'Ten terabytes, disks lost');
        await p
          .locator('app-widget-check')
          .getByRole('button', { name: /^4\.5 h: the restore/ })
          .click();
        await p
          .locator('app-widget-check .explain')
          .filter({ hasText: /^Replay can start/ })
          .waitFor();
        await stageToTop(p);
      },
    },
    {
      id: 'lesson-recovery-challenge',
      path: PATH,
      setup: async (p) => {
        await card(p, 'One minute, one hour');
        await recoveryAt(p, ['50 GB/min', '6 h', '20×']);
        await p.locator('app-experiment-dock .reveal').waitFor();
        await stageToTop(p);
      },
    },
  ];
}
