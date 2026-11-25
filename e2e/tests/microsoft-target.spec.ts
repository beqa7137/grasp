import type { Page } from '@playwright/test';
import { expect, synced, test } from './fixtures';

const EVENTS = 'CapacitorStorage.grasp.events';
/** A day the shipped Microsoft reports were checked for, so the filters hold whatever the real date. */
const CHECKED = new Date('2026-11-24T12:00:00');
const today = (page: Page) => page.locator('app-today');
const loopHeading = (page: Page) => today(page).getByRole('heading', { level: 1 });
const rounds = { coding: 2, design: 1, behavioral: 1 };

/** Starts the device with this Target, as if a sync had brought it. */
async function seedTarget(page: Page, target: Record<string, unknown>) {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key)) return;
      const event = { id: 'seed-target', at: new Date(Date.now() - 86_400_000).toISOString(), type: 'target.set', target: value };
      localStorage.setItem(key, JSON.stringify({ events: [event], cursor: null }));
    },
    { key: EVENTS, value: target },
  );
}

const recorded = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).events as { type: string; target?: unknown }[], EVENTS);

test('the Microsoft journey: level, 3 weeks, Microsoft and Build my plan, four taps from Today', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await expect(loopHeading(page)).toHaveText('What is your loop?');
  const card = today(page).locator('app-loop-card');
  await expect(card.getByRole('group', { name: 'Company' }).getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'Mid-level' }).click();
  await card.getByRole('button', { name: '3 weeks' }).click();
  await card.getByRole('button', { name: 'Microsoft' }).click();
  await expect(card.getByRole('button', { name: 'Microsoft' })).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('app-company-loop')).toHaveCount(0);
  const saving = Promise.all([synced(page, 'target.set'), synced(page, 'plan.set')]);
  await card.getByRole('button', { name: 'Build my plan' }).click();
  await saving;

  const line = /^Mid-level Microsoft loop · \w{3} \d{1,2} · 21 days left · 45 min a day$/;
  await expect(loopHeading(page)).toHaveText(line);
  const events = await recorded(page);
  expect(events.filter((e) => e.type === 'target.set').map((e) => e.target)).toEqual([{ level: 'mid', rounds, company: 'microsoft' }]);
  await page.reload();
  await expect(loopHeading(page)).toHaveText(line);
});

test('at 320 by 700 Build my plan stays above the tab bar before any choice and after Microsoft', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/today');
  const card = today(page).locator('app-loop-card');
  const build = card.getByRole('button', { name: 'Build my plan' });
  const tabs = page.locator('ion-tab-bar');
  const clear = async () => {
    const bar = await tabs.boundingBox();
    const box = (await build.boundingBox())!;
    expect(box.y + box.height, 'Build my plan ends above the tab bar').toBeLessThanOrEqual(bar && bar.height ? bar.y : 700);
  };
  await expect(build).toBeVisible();
  await clear();
  await card.getByRole('button', { name: 'Mid-level' }).click();
  await card.getByRole('button', { name: '3 weeks' }).click();
  await card.getByRole('button', { name: 'Microsoft' }).click();
  await expect(card.getByRole('button', { name: 'Microsoft' })).toHaveAttribute('aria-pressed', 'true');
  await clear();
});

test('choosing Microsoft later changes no totals: the plan and readiness read the same', async ({ page }) => {
  await page.goto('/today');
  const card = today(page).locator('app-loop-card');
  await card.getByRole('button', { name: 'Mid-level' }).click();
  await card.getByRole('button', { name: '3 weeks' }).click();
  await card.getByRole('button', { name: 'Build my plan' }).click();
  await expect(loopHeading(page)).toHaveText(/^Mid-level loop · /);
  await page.goto('/today/plan');
  const plan = page.locator('app-plan');
  await expect(plan.getByRole('heading', { level: 1 })).toHaveText(/^21 days to /);
  const before = { title: await plan.locator('h1').textContent(), status: await plan.locator('.status').textContent() };
  await expect(plan.locator('app-company-loop')).toHaveCount(0);
  await page.goto('/today');
  const ring = page.locator('app-readiness-ring').first();
  const readiness = await ring.getAttribute('aria-valuenow');

  await today(page).getByRole('button', { name: 'Edit' }).click();
  const edit = today(page).locator('app-loop-card');
  await edit.getByRole('button', { name: 'Microsoft' }).click();
  const title = edit.getByText('Mid-level at Microsoft is usually Software Engineer II (SDE II), levels 61 to 62.');
  const how = edit.getByText('How Microsoft loops usually run');
  await expect(how).toBeVisible();
  await expect(title).toBeHidden();
  await expect(edit.getByText(/^Loops vary by team/)).toBeHidden();
  await how.click();
  await expect(title).toBeVisible();
  await expect(edit.getByText(/^Loops vary by team/)).toBeVisible();
  const saved = synced(page, 'target.set');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await saved;
  await expect(loopHeading(page)).toHaveText(/^Mid-level Microsoft loop · /);
  const events = await recorded(page);
  expect(events.map((e) => e.type).filter((t) => t === 'plan.set')).toHaveLength(1);
  expect(events.filter((e) => e.type === 'target.set').at(-1)!.target).toEqual({ level: 'mid', rounds, company: 'microsoft' });
  await expect(ring).toHaveAttribute('aria-valuenow', readiness!);

  await page.goto('/today/plan');
  await expect(plan.locator('h1')).toHaveText(before.title!);
  await expect(plan.locator('.status')).toHaveText(before.status!);
  await expect(plan.getByText('Mid-level at Microsoft is usually Software Engineer II (SDE II), levels 61 to 62.')).toBeVisible();
  await expect(plan.getByText('How Microsoft loops usually run')).toBeVisible();

  await page.goto('/today/progress');
  await expect(page.locator('app-progress').getByText('Mid-level Microsoft loop', { exact: true })).toBeVisible();
});

test('a Target with a company this client does not offer keeps its level and rounds, and saving keeps the company', async ({ page }) => {
  const target = { level: 'senior', rounds: { coding: 3, design: 2, behavioral: 1 }, company: 'amazon' };
  await seedTarget(page, target);
  await page.goto('/today');
  await expect(loopHeading(page)).toHaveText('Senior loop · no date yet');
  await today(page).getByRole('button', { name: 'Edit' }).click();
  const company = today(page).locator('app-loop-card').getByRole('group', { name: 'Company' });
  await expect(company.locator('[aria-pressed="true"]')).toHaveCount(0);
  await today(page).locator('app-loop-card').getByRole('button', { name: 'Details' }).click();
  await today(page).locator('app-loop-card').getByRole('button', { name: 'Fewer Coding rounds' }).click();
  const saved = synced(page, 'target.set');
  await today(page).getByRole('button', { name: 'Save', exact: true }).click();
  await saved;
  expect((await recorded(page)).filter((e) => e.type === 'target.set').at(-1)!.target).toEqual({
    ...target,
    rounds: { coding: 2, design: 2, behavioral: 1 },
  });
});

test.describe('at a Microsoft target', () => {
  test.beforeEach(async ({ page }) => {
    await seedTarget(page, { level: 'mid', rounds, company: 'microsoft' });
    await page.clock.setFixedTime(CHECKED);
  });

  test('the Behavioral hub maps every culture attribute with its reasons, and Questions filter by one', async ({ page }) => {
    await page.goto('/behavioral');
    const hub = page.locator('app-behavioral-list');
    const row = hub.locator('.rows a').filter({ hasText: 'Learning Quickly' });
    await expect(row.locator('.marks')).toHaveText('Growth mindset');
    const culture = hub.locator('.culture');
    await expect(culture.getByRole('heading', { level: 2 })).toHaveText('Microsoft culture');
    await expect(culture.getByRole('heading', { level: 3 })).toHaveText([
      'Growth mindset',
      'Customer obsessed',
      'Diverse and inclusive',
      'One Microsoft',
      'Making a difference',
    ]);
    await expect(culture.getByText('Not covered yet by a competency. These questions touch it:')).toBeVisible();
    await expect(culture.locator('.reason')).toHaveCount(15);

    await culture.getByRole('link', { name: 'Filter questions by culture →' }).click();
    await expect(page).toHaveURL(/\/behavioral\/questions\?culture=growth-mindset$/);
    const questions = page.locator('app-question-library');
    await expect(questions.getByRole('status')).toHaveText('18 questions of 91');
    await questions
      .getByRole('group', { name: 'Culture' })
      .getByRole('button', { name: /^Growth mindset/ })
      .click();
    await questions
      .getByRole('group', { name: 'Culture' })
      .getByRole('button', { name: /^Diverse and inclusive/ })
      .click();
    await expect(page).toHaveURL(/culture=diverse-inclusive$/);
    await expect(questions.locator('.rows a')).toHaveCount(2);
  });

  test('at 320 the culture chips sit under each row title, which keeps the row width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    const narrowest = (rows: ReturnType<Page['locator']>) =>
      rows.evaluateAll((els) =>
        Math.min(...els.map((el) => el.querySelector('.title')!.getBoundingClientRect().width / el.getBoundingClientRect().width)),
      );
    await page.goto('/behavioral');
    const hub = page.locator('app-behavioral-list .rows a');
    await expect(hub.filter({ hasText: 'Ownership' }).locator('.marks')).toHaveText('Making a difference');
    expect(await narrowest(hub)).toBeGreaterThan(0.6);
    await page.goto('/behavioral/questions?competency=ownership');
    const questions = page.locator('app-question-library .rows a');
    await expect(questions.first().locator('.marks')).toHaveText('Making a difference');
    expect(await narrowest(questions)).toBeGreaterThan(0.6);
  });

  test('the Problem library and the Cases library filter by what Microsoft interview reports name', async ({ page }) => {
    await page.goto('/coding/problems');
    const library = page.locator('app-problem-library');
    const reported = library.locator('.side').getByRole('button', { name: /^Reported at Microsoft/ });
    await expect(library.getByRole('heading', { name: 'Problems', level: 1 })).toBeVisible();
    await expect(library.locator('.main a[href^="/coding/problems/"]').first()).toBeVisible();
    if (await reported.isVisible()) await reported.click();
    else {
      await library.getByRole('button', { name: /^Filters/ }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^Reported at Microsoft/ })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^Show 5 problems$/ })
        .click();
    }
    await expect(page).toHaveURL(/[?&]reported=microsoft/);
    await expect(library.getByRole('button', { name: 'Remove Reported at Microsoft' })).toBeVisible();
    await expect(library.getByText('5 problems of 164', { exact: true }).first()).toBeVisible();

    await page.goto('/design/cases?reported=microsoft');
    const cases = page.locator('app-case-library');
    await expect(cases.getByRole('button', { name: 'Remove Reported at Microsoft' })).toBeVisible();
    await expect(cases.locator('a.row')).toHaveCount(4);
  });
});

test('without a company target the libraries offer no reports facet', async ({ page }) => {
  await page.clock.setFixedTime(CHECKED);
  await page.goto('/coding/problems');
  await expect(page.locator('app-problem-library .side')).toBeAttached();
  await expect(page.getByRole('button', { name: /^Reported at Microsoft/ })).toHaveCount(0);
  await page.goto('/behavioral');
  await expect(page.locator('app-behavioral-list .rows a').first()).toBeVisible();
  await expect(page.locator('app-behavioral-list .culture')).toHaveCount(0);
});

test('Up next names a Microsoft-reported problem it chooses, and says why', async ({ page }) => {
  await page.addInitScript((key) => {
    if (localStorage.getItem(key)) return;
    const at = '2026-11-23T09:00:00.000Z';
    const target = { level: 'early', rounds: { coding: 2, design: 1, behavioral: 1 }, company: 'microsoft' };
    const plan = { interviewDate: '2026-12-15', minutesPerDay: 45, rounds: ['coding', 'design', 'behavioral'], level: 'new' };
    const events = [
      { id: 'seed-target', at, type: 'target.set', target },
      { id: 'seed-plan', at, type: 'plan.set', plan },
    ];
    localStorage.setItem(key, JSON.stringify({ events, cursor: null }));
  }, EVENTS);
  await page.clock.setFixedTime(CHECKED);
  await page.goto('/today');
  const card = page.locator('app-up-next-card').first();
  await expect(card).toContainText('solve Two Sum');
  await expect(card).toContainText('Reported in a Microsoft interview write-up.');
});
