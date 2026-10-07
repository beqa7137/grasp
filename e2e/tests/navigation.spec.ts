import type { Page } from '@playwright/test';
import { CODING_CATALOG, PATTERN_CATALOG, getScenarioSummary } from '@grasp/engine';
import { TODAY_HEADING as TODAY, expect, shownPage, test } from './fixtures';

const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const heading = (page: Page) => shownPage(page).locator('h1').first();
/** Clicks the shown page's back button once a transition has left one page shown. */
async function back(page: Page) {
  await expect(shownPage(page)).toHaveCount(1);
  await shownPage(page).locator('app-back ion-back-button').click();
}
const swipeBack = (page: Page) =>
  page.evaluate(
    () =>
      (document.querySelector('ion-tabs ion-router-outlet') as (HTMLElement & { swipeHandler?: unknown }) | null)?.swipeHandler !==
      undefined,
  );
const segment = (page: Page, name: string) => page.locator('app-hub:not(.ion-page-hidden)').getByRole('link', { name, exact: true });

test('five tabs, each lit on its own section, with one Main navigation at every width', { tag: '@nav' }, async ({ page }) => {
  for (const width of [320, 1024, 1280]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/today');
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(1);
    await expect(page.locator('ion-tab-button ion-label')).toHaveText(['Today', 'Coding', 'Design', 'Behavioral', 'Mock']);
  }
  for (const [name, h1] of <[string, string | RegExp][]>[
    ['Coding', 'Master the cue, and the problem names itself.'],
    ['Design', 'Learn it hands-on, then build it.'],
    ['Behavioral', 'Behavioral interviews'],
    ['Mock', 'Say it out loud.'],
    ['Today', TODAY],
  ]) {
    await tab(page, name).click();
    await expect(heading(page)).toHaveText(h1);
    await expect(tab(page, name)).toHaveAttribute('aria-selected', 'true');
  }
});

test('tab labels fit their buttons at 320px', { tag: '@nav' }, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/today');
  const labels = page.locator('ion-tab-button ion-label');
  await expect(labels).toHaveCount(5);
  const overflowing = await labels.evaluateAll((all) => all.filter((l) => l.scrollWidth > l.clientWidth).map((l) => l.textContent));
  expect(overflowing).toEqual([]);
});

test('hub segments replace the URL, so back leaves the hub, and a tab reopens at its last segment', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await tab(page, 'Coding').click();
  await expect(page).toHaveURL(/\/coding$/);
  await segment(page, 'Problems').click();
  await expect(segment(page, 'Problems')).toHaveAttribute('aria-current', 'page');
  await expect(heading(page)).toHaveText('Write it. Run it. Watch it.');
  await segment(page, 'Visualizers').click();
  await expect(page).toHaveURL(/\/coding\/visualizers$/);
  await expect(page.locator('app-hub')).toHaveCount(1);

  await tab(page, 'Today').click();
  await tab(page, 'Coding').click();
  await expect(page).toHaveURL(/\/coding\/visualizers$/);
  await expect(heading(page)).toHaveText('Watch the algorithm think.');

  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expect(tab(page, 'Today')).toHaveAttribute('aria-selected', 'true');
});

test('the workspace returns to the hub segment it was opened from', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems');
  await page.locator('app-code-list a[href="/coding/problems/two-sum"]').click();
  await expect(page.locator('app-code-workspace h1')).toHaveText('Two Sum');
  await page.locator('app-code-workspace ion-back-button').click();
  await expect(page).toHaveURL(/\/coding\/problems$/);
  await expect(page.locator('app-code-list')).toBeVisible();
});

test.describe('back from a cross-section link', () => {
  const mission = getScenarioSummary('first-scale-up')!.title;

  for (const how of ['the back button', "the device's back button"]) {
    test(`returns to Today with ${how}, and Design keeps its own page`, { tag: '@nav' }, async ({ page }) => {
      await page.goto('/design/cases');
      await expect(heading(page)).toHaveText('Run the interview, then defend it.');
      await tab(page, 'Today').click();
      await page.locator('app-learn a.tile.lab').click();
      await expect(page).toHaveURL(/\/design\/missions\/first-scale-up$/);
      await expect(heading(page)).toHaveText(mission);

      if (how === 'the back button') await back(page);
      // Capacitor's App plugin fires this event for Android's back button; with hardwareBackButton the web build listens too.
      else await page.evaluate(() => document.dispatchEvent(new Event('backbutton')));
      await expect(page).toHaveURL(/\/today$/);
      await expect(heading(page)).toHaveText(TODAY);
      await expect(tab(page, 'Today')).toHaveAttribute('aria-selected', 'true');

      await tab(page, 'Design').click();
      await expect(page).toHaveURL(/\/design\/cases$/);
      await expect(heading(page)).toHaveText('Run the interview, then defend it.');
    });
  }

  test.describe('with page transitions on, as Ionic then enables swipe-back', () => {
    test.use({ motionOff: false });

    test('iOS swipe-back is off only while the cross-section view shows', { tag: '@nav' }, async ({ page }) => {
      await page.goto('/today');
      await expect.poll(() => swipeBack(page)).toBe(true);
      await page.locator('app-learn a.tile.lab').click();
      await expect(heading(page)).toHaveText(mission);
      // It would pop the Design stack, not return to Today as the back button does.
      await expect.poll(() => swipeBack(page)).toBe(false);
      await back(page);
      await expect(heading(page)).toHaveText(TODAY);
      await expect.poll(() => swipeBack(page)).toBe(true);
    });
  });

  test('a view shown in its own tab and then opened from another returns to the other', { tag: '@nav' }, async ({ page }) => {
    // The mission hides the tab bar under 1024px, and Today is reached through the bar.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/design/missions');
    await page.locator('app-design-list a[href="/design/missions/first-scale-up"]').click();
    await expect(heading(page)).toHaveText(mission);
    await tab(page, 'Today').click();
    // Ionic shows the view it already holds for this URL.
    await page.locator('app-learn a.tile.lab').click();
    await expect(heading(page)).toHaveText(mission);
    await back(page);
    await expect(page).toHaveURL(/\/today$/);
    await expect(tab(page, 'Today')).toHaveAttribute('aria-selected', 'true');
  });

  test.describe('with page transitions on', () => {
    test.use({ motionOff: false });

    test(
      'a page opened above a cross-section view returns to it, which still returns to its own tab',
      { tag: '@nav' },
      async ({ page }) => {
        await page.goto('/coding');
        await expect(heading(page)).toHaveText('Master the cue, and the problem names itself.');
        await tab(page, 'Today').click();
        await page.locator('app-learn a.tile.code').click();
        await expect(heading(page)).toHaveText('Two Sum');
        await expect.poll(() => swipeBack(page)).toBe(false);

        await page.locator('app-code-workspace a.chip[href="/coding/patterns/hashing"]').click();
        await expect(heading(page)).toHaveText('Arrays & Hashing');
        await expect.poll(() => swipeBack(page)).toBe(true);
        await back(page);
        await expect(heading(page)).toHaveText('Two Sum');
        await expect.poll(() => swipeBack(page)).toBe(false);

        await back(page);
        await expect(page).toHaveURL(/\/today$/);
        // Coding opens where the learner left it, not on the view Today's tile opened.
        await tab(page, 'Coding').click();
        await expect(page).toHaveURL(/\/coding$/);
        await expect(heading(page)).toHaveText('Master the cue, and the problem names itself.');
      },
    );
  });

  test("a view in the tab's own stack still pops it", { tag: '@nav' }, async ({ page }) => {
    await page.goto('/design/missions');
    await page.locator('app-design-list a[href="/design/missions/first-scale-up"]').click();
    await expect(heading(page)).toHaveText(mission);
    await page.evaluate(() => document.dispatchEvent(new Event('backbutton')));
    await expect(page).toHaveURL(/\/design\/missions$/);
    await expect(tab(page, 'Design')).toHaveAttribute('aria-selected', 'true');
  });
});

test("the device's back button goes from a hub to Today", { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems');
  await expect(heading(page)).toHaveText('Write it. Run it. Watch it.');
  await page.evaluate(() => document.dispatchEvent(new Event('backbutton')));
  await expect(page).toHaveURL(/\/today$/);
  await expect(tab(page, 'Today')).toHaveAttribute('aria-selected', 'true');
});

test("the device's back button returns a hub a link from another tab opened to that tab", { tag: '@nav' }, async ({ page }) => {
  await page.goto('/mock');
  await page.getByRole('link', { name: /Guides, story bank and rehearsal/ }).click();
  await expect(heading(page)).toHaveText('Behavioral interviews');
  await page.evaluate(() => document.dispatchEvent(new Event('backbutton')));
  await expect(page).toHaveURL(/\/mock$/);
  await expect(tab(page, 'Mock')).toHaveAttribute('aria-selected', 'true');
});

test('journey 2: the graph problems are two taps from a cold start, in the problem library', { tag: '@nav' }, async ({ page }) => {
  const graphs = new Set<string>(PATTERN_CATALOG.filter((p) => p.track === 'graphs').map((p) => p.id));
  const problems = CODING_CATALOG.filter((p) => p.patternIds.some((id) => graphs.has(id)));
  expect(problems).toHaveLength(51);

  await page.goto('/today');
  await tab(page, 'Coding').click();
  await segment(page, 'Problems').click();
  const library = page.locator('app-code-list');
  for (const problem of problems) await expect(library.locator(`a[href="/coding/problems/${problem.id}"]`)).toHaveCount(1);
});

test('journey 7: questions about conflict are two taps from a cold start', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await tab(page, 'Behavioral').click();
  await page.getByRole('link', { name: /^Conflict & Disagreement/ }).click();
  await expect(page.locator('app-competency h1')).toHaveText('Conflict & Disagreement');
  await expect(page.locator('app-competency .questions a').first()).toBeVisible();
});

test.describe('Where things moved', () => {
  const NOTE = { name: 'Where things moved' };
  /** The note is decided once per device, after the first render; absence means something only once it is decided. */
  const decided = (page: Page) =>
    expect.poll(() => page.evaluate(() => localStorage.getItem('CapacitorStorage.grasp.movedNote.v1'))).not.toBeNull();

  test('shows once to a learner whose progress predates the five sections', { tag: '@nav' }, async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('e2e.seeded')) return;
      const answer = { id: crypto.randomUUID(), at: '2026-09-01T10:00:00.000Z', type: 'predict.answered', correct: true };
      localStorage.setItem(
        'CapacitorStorage.grasp.events',
        JSON.stringify([{ ...answer, algorithmId: 'binary-search', patternId: 'binary-search' }]),
      );
      localStorage.setItem('e2e.seeded', '1');
    });
    await page.goto('/today');
    const note = page.getByRole('complementary', NOTE);
    await expect(note).toContainText('five sections');
    await note.getByRole('button', { name: 'Got it' }).click();
    await expect(note).toHaveCount(0);
    await expect(heading(page)).toBeFocused();
    await page.reload();
    await expect(heading(page)).toHaveText(TODAY);
    await decided(page);
    await expect(note).toHaveCount(0);
  });

  test('never shows to a new learner, even once they have progress', { tag: '@nav' }, async ({ page }) => {
    await page.goto('/today');
    await expect(heading(page)).toHaveText(TODAY);
    await decided(page);
    await expect(page.getByRole('complementary', NOTE)).toHaveCount(0);
    await page
      .locator('app-learn')
      .getByRole('link', { name: /^Review/ })
      .click();
    await page.locator('g-question-card .choice').first().click();
    await page.goto('/today');
    await expect(heading(page)).toHaveText(TODAY);
    await expect(page.getByRole('complementary', NOTE)).toHaveCount(0);
  });
});
