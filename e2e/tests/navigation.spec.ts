import type { Page } from '@playwright/test';
import { CODING_CATALOG, PATTERN_CATALOG, getScenarioSummary } from '@grasp/engine';
import { TODAY_HEADING as TODAY, expect, expectSectionLit, pressAndroidBack, section, shownPage, test } from './fixtures';

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
/** A case study started on this device: Up next's rule 4 then offers "Continue URL Shortener", Today's link into a case. */
const startedCase = (page: Page) =>
  page.addInitScript(() =>
    localStorage.setItem('CapacitorStorage.grasp.case.url-shortener', JSON.stringify({ attempt: 'nav-case', reached: 2, stages: [] })),
  );
const upNextStart = (page: Page) => page.locator('app-today app-up-next-card .start');
const segment = (page: Page, name: string) => page.locator('app-hub:not(.ion-page-hidden)').getByRole('link', { name, exact: true });

test('five sections, each lit on its own section, with one Main navigation at every width', { tag: '@nav' }, async ({ page }) => {
  for (const width of [320, 1023, 1024, 1280]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/today');
    const main = page.getByRole('navigation', { name: 'Main' });
    await expect(main).toHaveCount(1);
    // From 1024px the rail replaces the tab bar (REDESIGN.md 2.6).
    const sections = width < 1024 ? main.locator('ion-tab-button ion-label') : main.locator('a.section .label');
    await expect(sections).toHaveText(['Today', 'Coding', 'Design', 'Behavioral', 'Mock']);
  }
  for (const [name, h1] of <[string, string | RegExp][]>[
    ['Coding', 'Master the cue, and the problem names itself.'],
    ['Design', 'System design'],
    ['Behavioral', 'Behavioral interviews'],
    ['Mock', 'Say it out loud.'],
    ['Today', TODAY],
  ]) {
    await section(page, name).click();
    await expect(heading(page)).toHaveText(h1);
    await expectSectionLit(page, name);
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
  await section(page, 'Coding').click();
  await expect(page).toHaveURL(/\/coding$/);
  await segment(page, 'Problems').click();
  await expect(segment(page, 'Problems')).toHaveAttribute('aria-current', 'page');
  await expect(heading(page)).toHaveText('Problems');
  await segment(page, 'Visualizers').click();
  await expect(page).toHaveURL(/\/coding\/visualizers$/);
  await expect(page.locator('app-hub')).toHaveCount(1);

  await section(page, 'Today').click();
  await section(page, 'Coding').click();
  await expect(page).toHaveURL(/\/coding\/visualizers$/);
  await expect(heading(page)).toHaveText('Watch the algorithm think.');

  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await expectSectionLit(page, 'Today');
});

test('the workspace returns to the hub segment it was opened from', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems');
  await page.locator('app-problem-library a[href="/coding/problems/two-sum"]').click();
  await expect(page.locator('app-code-workspace h1')).toHaveText('Two Sum');
  await page.locator('app-code-workspace ion-back-button').click();
  await expect(page).toHaveURL(/\/coding\/problems$/);
  await expect(page.locator('app-problem-library')).toBeVisible();
});

test.describe('back from a cross-section link', () => {
  const mission = getScenarioSummary('first-scale-up')!.title;
  const study = 'URL Shortener';
  test.beforeEach(({ page }) => startedCase(page));

  for (const how of ['the back button', "the device's back button"]) {
    test(`returns to Today with ${how}, and Design keeps its own page`, { tag: '@nav' }, async ({ page }) => {
      await page.goto('/design/cases');
      await expect(heading(page)).toHaveText('Cases');
      await section(page, 'Today').click();
      await expect(upNextStart(page)).toHaveText('Continue');
      await upNextStart(page).click();
      await expect(page).toHaveURL(/\/design\/cases\/url-shortener$/);
      await expect(heading(page)).toHaveText(study);

      if (how === 'the back button') await back(page);
      // Capacitor's App plugin fires this event for Android's back button; with hardwareBackButton the web build listens too.
      else await pressAndroidBack(page);
      await expect(page).toHaveURL(/\/today$/);
      await expect(heading(page)).toHaveText(TODAY);
      await expectSectionLit(page, 'Today');

      await section(page, 'Design').click();
      await expect(page).toHaveURL(/\/design\/cases$/);
      await expect(heading(page)).toHaveText('Cases');
    });
  }

  test.describe('with page transitions on, as Ionic then enables swipe-back', () => {
    test.use({ motionOff: false });

    test('iOS swipe-back is off only while the cross-section view shows', { tag: '@nav' }, async ({ page }) => {
      await page.goto('/today');
      await expect.poll(() => swipeBack(page)).toBe(true);
      await upNextStart(page).click();
      await expect(heading(page)).toHaveText(study);
      // It would pop the Design stack, not return to Today as the back button does.
      await expect.poll(() => swipeBack(page)).toBe(false);
      await back(page);
      await expect(heading(page)).toHaveText(TODAY);
      await expect.poll(() => swipeBack(page)).toBe(true);
    });
  });

  test('a view shown in its own tab and then opened from another returns to the other', { tag: '@nav' }, async ({ page }) => {
    // A focus route would hide the tab bar under 1024px, and Today is reached through the bar.
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/design/cases');
    await page.locator('app-case-library a[href="/design/cases/url-shortener"]').click();
    await expect(heading(page)).toHaveText(study);
    await section(page, 'Today').click();
    // Ionic shows the view it already holds for this URL.
    await upNextStart(page).click();
    await expect(heading(page)).toHaveText(study);
    await back(page);
    await expect(page).toHaveURL(/\/today$/);
    await expectSectionLit(page, 'Today');
  });

  test.describe('with page transitions on', () => {
    test.use({ motionOff: false });

    test(
      'a page opened above a cross-section view returns to it, which still returns to its own tab',
      { tag: '@nav' },
      async ({ page }) => {
        await page.goto('/coding');
        await expect(heading(page)).toHaveText('Master the cue, and the problem names itself.');
        await section(page, 'Today').click();
        const today = page.locator('app-today');
        await today.getByText('Other rounds').click();
        await today.getByRole('link', { name: 'Learn Arrays & Hashing' }).click();
        await expect(heading(page)).toHaveText('Arrays & Hashing');
        await expect.poll(() => swipeBack(page)).toBe(false);

        await page.getByRole('link', { name: 'Code: Two Sum' }).click();
        await expect(heading(page)).toHaveText('Two Sum');
        await expect.poll(() => swipeBack(page)).toBe(true);
        await back(page);
        await expect(heading(page)).toHaveText('Arrays & Hashing');
        await expect.poll(() => swipeBack(page)).toBe(false);

        await back(page);
        await expect(page).toHaveURL(/\/today$/);
        // Coding opens where the learner left it, not on the view Today's Up next opened.
        await section(page, 'Coding').click();
        await expect(page).toHaveURL(/\/coding$/);
        await expect(heading(page)).toHaveText('Master the cue, and the problem names itself.');
      },
    );
  });

  test("a view in the tab's own stack still pops it", { tag: '@nav' }, async ({ page }) => {
    await page.goto('/design/missions');
    await page.locator('app-design-missions a[href="/design/missions/first-scale-up"]').click();
    await expect(heading(page)).toHaveText(mission);
    await pressAndroidBack(page);
    await expect(page).toHaveURL(/\/design\/missions$/);
    await expectSectionLit(page, 'Design');
  });
});

test("the device's back button goes from a hub to Today", { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems');
  await expect(heading(page)).toHaveText('Problems');
  await pressAndroidBack(page);
  await expect(page).toHaveURL(/\/today$/);
  await expectSectionLit(page, 'Today');
});

test("the device's back button returns a hub a link from another tab opened to that tab", { tag: '@nav' }, async ({ page }) => {
  await page.goto('/mock');
  await page.getByRole('link', { name: /Guides, story bank and rehearsal/ }).click();
  await expect(heading(page)).toHaveText('Behavioral interviews');
  await pressAndroidBack(page);
  await expect(page).toHaveURL(/\/mock$/);
  await expectSectionLit(page, 'Mock');
});

test(
  'journey 2: the graph problems are three taps from a cold start: Coding, Problems, Graphs & trees',
  { tag: '@nav' },
  async ({ page }) => {
    const graphs = PATTERN_CATALOG.filter((p) => p.track === 'graphs');
    const problems = CODING_CATALOG.filter((p) => p.patternIds.some((id) => graphs.some((g) => g.id === id)));
    expect(problems).toHaveLength(51);

    await page.goto('/today');
    await section(page, 'Coding').click();
    await segment(page, 'Problems').click();
    const library = page.locator('app-problem-library');
    await library
      .getByRole('group', { name: 'Track' })
      .getByRole('button', { name: /^Graphs & trees/ })
      .click();
    await expect(page).toHaveURL(/\/coding\/problems\?track=graphs$/);
    await expect(library.getByRole('status')).toHaveText('51 problems of 164');
    // 57 rows under 7 pattern headers: 6 problems sit under two graph patterns.
    await expect(library.locator('.group-head')).toHaveText(graphs.map((g) => new RegExp(`^${g.name.replace(/[()]/g, '\\$&')}`)));
    await expect(library.locator('.rows a[g-entry-row]')).toHaveCount(57);
    for (const problem of problems) await expect(library.locator(`a[href="/coding/problems/${problem.id}"]`).first()).toBeVisible();
  },
);

test("a competency's questions are two taps from a cold start", { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await section(page, 'Behavioral').click();
  await page.getByRole('link', { name: /Conflict & Disagreement/ }).click();
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
      .locator('app-today')
      .getByRole('link', { name: /^Review/ })
      .click();
    await page.locator('g-question-card .choice').first().click();
    await page.goto('/today');
    await expect(heading(page)).toHaveText(TODAY);
    await expect(page.getByRole('complementary', NOTE)).toHaveCount(0);
  });
});
