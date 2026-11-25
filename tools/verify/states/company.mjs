import { goto, settle } from '../lib.mjs';

/** A Microsoft Target (Mid-level unless named) with a dated plan, as if a sync had brought it. */
async function seedMicrosoft(p, targetLevel = 'mid') {
  await p.evaluate((level) => {
    const d = new Date(Date.now() + 21 * 86_400_000);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const at = new Date(Date.now() - 86_400_000).toISOString();
    const events = [
      {
        id: 'r51-state-1',
        at,
        type: 'target.set',
        target: { level, rounds: { coding: 2, design: 1, behavioral: 1 }, company: 'microsoft' },
      },
      {
        id: 'r51-state-2',
        at,
        type: 'plan.set',
        plan: { interviewDate: date, minutesPerDay: 45, rounds: ['coding', 'design', 'behavioral'], level: 'new' },
      },
    ];
    localStorage.setItem('CapacitorStorage.grasp.events', JSON.stringify({ events, cursor: null }));
  }, targetLevel);
  await p.reload({ waitUntil: 'networkidle' });
}

const seeded =
  (path, then = async () => {}, level = 'mid') =>
  async (p) => {
    await seedMicrosoft(p, level);
    if (path) await goto(p, path);
    await then(p);
    await settle(p);
  };

/** R51's Microsoft target: the loop card with Microsoft pressed, Today, Settings and the plan at it, culture and reports. */
export function companyStates() {
  return [
    {
      id: 'today-loop-microsoft',
      path: '/today',
      setup: async (p) => {
        const card = p.locator('app-loop-card');
        await card.getByRole('button', { name: 'Mid-level' }).click();
        await card.getByRole('button', { name: '3 weeks' }).click();
        await card.getByRole('button', { name: 'Microsoft' }).click();
        await settle(p);
      },
    },
    {
      id: 'today-microsoft',
      path: '/today',
      // Early career, so Up next's first card solves Two Sum and gives the "Reported in a Microsoft interview write-up." reason.
      setup: seeded(null, (p) => p.locator('app-up-next-card').getByText('Reported in a Microsoft interview write-up.').waitFor(), 'early'),
    },
    {
      id: 'settings-loop-microsoft',
      path: '/today',
      setup: seeded('/today/settings', async (p) => {
        await p.getByRole('button', { name: 'Edit your loop' }).click();
        await p.locator('app-loop-card app-company-loop').waitFor();
      }),
    },
    {
      id: 'plan-microsoft',
      path: '/today',
      setup: seeded('/today/plan', async (p) => {
        await p.getByText('How Microsoft loops usually run').click();
      }),
    },
    {
      id: 'behavioral-competencies-microsoft',
      path: '/today',
      setup: seeded('/behavioral', (p) => p.locator('.culture').scrollIntoViewIfNeeded()),
    },
    {
      id: 'behavioral-questions-culture',
      path: '/today',
      setup: seeded('/behavioral/questions?culture=growth-mindset', (p) => p.locator('.rows a').first().waitFor()),
    },
    {
      id: 'coding-problems-reported',
      path: '/today',
      setup: seeded('/coding/problems?reported=microsoft', (p) =>
        p.getByRole('button', { name: 'Remove Reported at Microsoft' }).waitFor(),
      ),
    },
    {
      id: 'design-cases-reported',
      path: '/today',
      setup: seeded('/design/cases?reported=microsoft', (p) => p.getByRole('button', { name: 'Remove Reported at Microsoft' }).waitFor()),
    },
  ];
}
