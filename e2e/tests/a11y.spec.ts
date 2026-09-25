import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, recordedEvents, stepToCheckpoint, test } from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = new Set(['serious', 'critical']);

// A half-faded element fails the contrast check, so animations run at no length and scans wait for them to end.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

/** Waits for every finite animation to end, including Ionic's, which run inside its components' shadow roots. */
async function animationsDone(page: Page) {
  await page.waitForFunction(() => {
    const roots: (Document | ShadowRoot)[] = [document];
    for (let i = 0; i < roots.length; i++) for (const el of roots[i].querySelectorAll('*')) if (el.shadowRoot) roots.push(el.shadowRoot);
    return roots
      .flatMap((root) => root.getAnimations())
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity);
  });
}

/** Serious and critical violations, one line per rule with the elements that break it. */
async function blockingViolations(page: Page, { contrastOnly = false } = {}): Promise<string[]> {
  await animationsDone(page);
  const axe = new AxeBuilder({ page });
  const { violations } = await (contrastOnly ? axe.withRules(['color-contrast']) : axe.withTags(TAGS)).analyze();
  return violations
    .filter((v) => BLOCKING.has(v.impact ?? ''))
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const PAGES: { name: string; path: string; ready: (page: Page) => Promise<unknown> }[] = [
  { name: 'Learn', path: '/learn', ready: (page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible() },
  {
    name: 'a pattern page',
    path: '/learn/pattern/binary-search',
    ready: (page) => expect(page.getByRole('heading', { name: 'Binary Search', level: 1 })).toBeVisible(),
  },
  { name: 'the LCS visualizer and its table', path: '/visualize/lcs', ready: (page) => expect(page.getByRole('table')).toBeVisible() },
  { name: 'a visualizer checkpoint', path: '/visualize/binary-search', ready: (page) => stepToCheckpoint(page) },
  {
    name: 'an answered review card',
    path: '/drill',
    ready: async (page) => {
      await page.locator('g-question-card .choice').first().click();
      await expect(page.locator('g-question-card .reveal')).toBeVisible();
    },
  },
  {
    name: 'a Design Lab mission',
    path: '/design/first-scale-up',
    ready: (page) => expect(page.getByRole('button', { name: /^Users, / })).toBeVisible(),
  },
  { name: 'Settings', path: '/settings', ready: (page) => expect(page.getByRole('radiogroup', { name: 'Daily session' })).toBeVisible() },
  {
    name: 'the code workspace',
    path: '/code/two-sum',
    ready: (page) => expect(page.getByRole('textbox', { name: 'Two Sum solution' })).toBeVisible(),
  },
  {
    name: 'a mock interview with its code drawer open',
    path: '/interview',
    ready: async (page) => {
      await page.getByRole('button', { name: /Days Until Warmer/ }).click();
      await expect(page.getByText(/daily temperatures/)).toBeVisible();
      await page.getByRole('button', { name: 'Code', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Interview code' })).toBeVisible();
    },
  },
];

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });
    // Only colour contrast depends on the theme; the dark pass covers every other rule.
    const contrastOnly = theme === 'light';

    for (const { name, path, ready } of PAGES) {
      test(`${name} has no serious or critical accessibility violations`, async ({ page }) => {
        await page.goto(path);
        await ready(page);
        expect(await blockingViolations(page, { contrastOnly })).toEqual([]);
      });
    }

    test.describe('on a first visit', () => {
      test.use({ pilotNoticeSeen: false });

      test('the pilot welcome has no serious or critical accessibility violations', async ({ page }) => {
        await page.goto('/learn');
        await expect(page.getByRole('dialog', { name: 'Welcome to the Grasp pilot' })).toBeVisible();
        expect(await blockingViolations(page, { contrastOnly })).toEqual([]);
      });
    });
  });
}

test.describe('on a first visit', () => {
  test.use({ pilotNoticeSeen: false });

  test('the pilot welcome keeps its button on screen at twice the text size', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/learn');
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const dialog = page.getByRole('dialog', { name: 'Welcome to the Grasp pilot' });
    // The dialog box is in the modal's shadow DOM and its content is slotted, so the button is not its DOM descendant.
    const button = page.getByRole('button', { name: /Got it/ });
    await expect(button).toBeVisible();
    await animationsDone(page);

    const within = async (inner: Locator, outer: { x: number; y: number; width: number; height: number }) => {
      const box = (await inner.boundingBox())!;
      return (
        box.y >= outer.y && box.y + box.height <= outer.y + outer.height && box.x >= outer.x && box.x + box.width <= outer.x + outer.width
      );
    };
    const dialogBox = (await dialog.boundingBox())!;
    expect(await within(dialog, { x: 0, y: 0, width: 390, height: 844 }), 'the dialog fits the screen').toBe(true);
    expect(await within(button, dialogBox), 'the button shows inside the dialog').toBe(true);
    await button.click();
    await expect(dialog).toBeHidden();
  });
});

test('a visualizer checkpoint can be answered from the keyboard, with focus always in view', async ({ page }) => {
  await page.goto('/visualize/binary-search');
  await page.getByRole('button', { name: 'Step forward' }).focus();
  await stepToCheckpoint(page, () => page.keyboard.press('Enter'));
  const prompt = page.getByText('Your call');

  // The step button is disabled at a checkpoint, so focus moves to the question instead of the top of the page.
  await expect(page.locator('.predict .prompt')).toBeFocused();
  await page.keyboard.press('Tab');
  const choice = page.locator('.predict .choice').first();
  await expect(choice).toBeFocused();
  const ring = await choice.evaluate((el) => {
    const style = getComputedStyle(el);
    return el.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  });
  expect(ring, 'the focused choice shows a focus ring').toBe(true);

  await page.keyboard.press('Space');
  await expect(page.locator('.predict .verdict')).toBeFocused();
  await expect(page.locator('.predict .choice .g-answer-mark[aria-label*="correct"]')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Continue →' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(prompt).toBeHidden();
  await expect(page.locator('.narration')).toBeFocused();
});

test('Enter on the link under a reviewed card opens it instead of grading the card', async ({ page }) => {
  await page.goto('/drill');
  await page.locator('g-question-card .choice').first().click();
  const link = page.locator('g-question-card .reveal a');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/(learn\/pattern|visualize)\//);

  expect((await recordedEvents(page)).map((e) => e.type)).not.toContain('review.graded');
});
