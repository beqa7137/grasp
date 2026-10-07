import type { Locator, Page } from '@playwright/test';
import { expect, openPlayback, recordedEvents, stepToCheckpoint, test } from './fixtures';

const transport = (page: Page) => page.locator('app-player g-transport');
const count = (page: Page) => transport(page).locator('.count');
const timeline = (page: Page) => page.locator('app-player').getByRole('slider', { name: 'Timeline' });
const tick = (page: Page, n: number) => transport(page).locator('.tick').nth(n);
const centre = async (locator: Locator) => {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

type Pointer = {
  down(x: number, y: number): Promise<void>;
  move(x: number, y: number): Promise<void>;
  up(x: number, y: number): Promise<void>;
};

/**
 * A mouse on desktop; a finger on the phones: real touch events through the DevTools protocol in Chromium, and touch
 * pointer events in WebKit, whose Playwright driver has no touch drag. Those skip WebKit's hit-testing, so each point is
 * first checked to land on the drag layer, and the tap test below sends WebKit a real touch.
 */
async function pointerFor(page: Page, project: string): Promise<Pointer> {
  if (project === 'desktop' || project === 'tablet')
    return {
      down: async (x, y) => (await page.mouse.move(x, y), page.mouse.down()),
      move: (x, y) => page.mouse.move(x, y),
      up: () => page.mouse.up(),
    };
  if (project === 'phone') {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] }).then(() => undefined);
    return { down: (x, y) => touch('touchStart', x, y), move: (x, y) => touch('touchMove', x, y), up: (x, y) => touch('touchEnd', x, y) };
  }
  const layer = transport(page).locator('.drag');
  const send = async (type: string, x: number, y: number) => {
    expect(await landsOnDragLayer(page, x, y), `${type} at ${x},${y} lands on the drag layer`).toBe(true);
    await layer.dispatchEvent(type, {
      pointerId: 11,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y,
      bubbles: true,
    });
  };
  return { down: (x, y) => send('pointerdown', x, y), move: (x, y) => send('pointermove', x, y), up: (x, y) => send('pointerup', x, y) };
}

const landsOnDragLayer = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.matches('app-player g-transport .drag'), [x, y]);

test.describe('the transport', { tag: '@player' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/visualize/binary-search');
    await expect(count(page)).toHaveText('1 / 13');
  });

  test('a drag holds on an unanswered checkpoint, skips it 24px on, and opens the one it is let go on', async ({ page }, testInfo) => {
    await openPlayback(page);
    const pointer = await pointerFor(page, testInfo.project.name);
    const thumb = await centre(timeline(page));
    const first = await centre(tick(page, 0));
    const chip = transport(page).getByText('Answer it, or skip?');
    const start = (await timeline(page).boundingBox())!.x + 8;

    await pointer.down(start, thumb.y);
    for (const dx of [-10, 0, 6, 12]) {
      await pointer.move(first.x + dx, thumb.y);
      if (dx < -4) continue;
      await expect(count(page), `held ${dx}px past the tick`).toHaveText('4 / 13');
      await expect(timeline(page)).toHaveValue('3');
    }
    await expect(chip).toBeVisible();
    await expect(tick(page, 0)).toHaveAttribute('data-state', 'pending');
    await pointer.move(first.x + 30, thumb.y);
    await expect(tick(page, 0)).toHaveAttribute('data-state', 'skipped');
    await expect(count(page)).not.toHaveText('4 / 13');
    await expect(chip).toBeHidden();
    await pointer.up(first.x + 30, thumb.y);
    await expect(page.getByText('Your call')).toBeHidden();

    const second = await centre(tick(page, 1));
    await pointer.down(first.x + 30, thumb.y);
    await pointer.move(second.x - 6, thumb.y);
    await pointer.move(second.x + 8, thumb.y);
    await expect(count(page)).toHaveText('8 / 13');
    await expect(timeline(page)).toHaveValue('7');
    await pointer.up(second.x + 8, thumb.y);
    await expect(page.locator('.predict .prompt')).toBeFocused();
    await expect(tick(page, 1)).toHaveAttribute('data-state', 'pending');
  });

  test('a tap on an unanswered checkpoint opens it, through real input in every engine', async ({ page }, testInfo) => {
    await openPlayback(page);
    const at = await centre(tick(page, 0));
    expect(await landsOnDragLayer(page, at.x, at.y)).toBe(true);
    if (testInfo.project.use.hasTouch) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    await expect(count(page)).toHaveText('4 / 13');
    await expect(page.locator('.predict .prompt')).toBeFocused();
  });

  test('Next checkpoint opens the next one, Jump to result goes to the end, and a stepped-back skip asks again', async ({ page }) => {
    await openPlayback(page);
    await page.getByRole('button', { name: 'Next checkpoint' }).click();
    await expect(count(page)).toHaveText('4 / 13');
    await expect(page.locator('.predict .prompt')).toBeFocused();

    await page.locator('.predict').getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByText('Your call')).toBeHidden();
    await expect(count(page)).toHaveText('5 / 13');
    await expect(tick(page, 0)).toHaveAttribute('data-state', 'skipped');
    expect((await recordedEvents(page)).map((e) => e.type)).not.toContain('predict.answered');

    await page.getByRole('button', { name: 'Step back' }).click();
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(page.getByText('Your call'), 'a skipped checkpoint asks again').toBeVisible();
    await page.locator('.predict .choice').nth(1).click();
    await expect(tick(page, 0)).toHaveAttribute('data-state', 'right');
    await page.getByRole('button', { name: 'Continue →' }).click();

    await openPlayback(page);
    await page.getByRole('button', { name: 'Next checkpoint' }).click();
    await page.locator('.predict .choice').nth(0).click();
    await expect(tick(page, 1)).toHaveAttribute('data-state', 'missed');
    await expect(page.locator('.score')).toHaveText(/1\/2 predicted/);

    await openPlayback(page);
    await page.getByRole('button', { name: 'Jump to result' }).click();
    await expect(count(page)).toHaveText('13 / 13');
    await expect(page.getByText('Your call')).toBeHidden();
    await expect(tick(page, 2)).toHaveAttribute('data-state', 'pending');
  });

  test('the focused Timeline takes Shift+→ to the next checkpoint, an arrow past it, and End to the result', async ({ page }) => {
    await openPlayback(page);
    await timeline(page).focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(count(page)).toHaveText('4 / 13');
    await expect(page.locator('.predict .prompt')).toBeFocused();
    await openPlayback(page);
    await timeline(page).focus();
    await page.keyboard.press('ArrowRight');
    await expect(count(page), 'a seek past an open checkpoint closes it').toHaveText('5 / 13');
    await expect(page.getByText('Your call')).toBeHidden();
    await expect(tick(page, 0)).toHaveAttribute('data-state', 'pending');
    await page.keyboard.press('End');
    await expect(count(page)).toHaveText('13 / 13');
    await page.keyboard.press('Home');
    await expect(count(page)).toHaveText('1 / 13');
  });

  test('Instant plays with the stage motion off', async ({ page }) => {
    await page.locator('app-player').getByText('Predict mode').click();
    await openPlayback(page);
    await page.getByRole('radiogroup', { name: 'Speed' }).getByRole('radio', { name: 'Instant' }).click();
    await expect(page.locator('app-player .scene')).toHaveClass(/\binstant\b/);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(count(page)).toHaveText('13 / 13');
  });

  test('⋯ opens over region R without moving the stage, Escape closes it, and a checkpoint in play closes it', async ({ page }) => {
    const more = page.getByRole('button', { name: 'More playback controls' });
    test.skip(!(await more.isVisible()), 'The desktop bar shows everything inline.');
    const stage = page.locator('app-player .scene');
    const before = await stage.boundingBox();
    await more.click();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('group', { name: 'Playback' })).toBeVisible();
    expect(await stage.boundingBox()).toEqual(before);
    const panel = (await page.getByRole('group', { name: 'Playback' }).boundingBox())!;
    expect(panel.y, 'the panel stays below the stage').toBeGreaterThanOrEqual(before!.y + before!.height);

    await timeline(page).focus();
    await page.keyboard.press('Escape');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(more).toBeFocused();
    await expect(timeline(page)).toBeHidden();

    await more.click();
    await page.getByRole('radiogroup', { name: 'Speed' }).getByRole('radio', { name: '4×' }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.predict .prompt')).toBeFocused();
    await expect(more).toHaveAttribute('aria-expanded', 'false');
  });

  test('stepping to a checkpoint still asks it, as before', async ({ page }) => {
    await stepToCheckpoint(page);
    await expect(page.locator('.predict').getByRole('button', { name: 'Skip' })).toBeVisible();
  });
});

test.describe('a run with many checkpoints', { tag: '@player' }, () => {
  test('draws every tick whole, apart from its neighbours', async ({ page }) => {
    await page.goto('/visualize/lcs');
    await openPlayback(page);
    const centres = await transport(page)
      .locator('.tick')
      .evaluateAll((ticks) => ticks.map((t) => t.getBoundingClientRect()).map((b) => b.x + b.width / 2));
    expect(centres.length).toBeGreaterThan(1);
    const gaps = centres.slice(1).map((x, i) => x - centres[i]);
    expect(Math.min(...gaps), 'an 8px diamond turned 45° with its 2px halo needs 15px').toBeGreaterThanOrEqual(15);
  });

  test('⋯ on a 320px phone stays inside region R, under the caption, on every frame it is scrubbed to', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/visualize/lcs');
    await page.locator('app-player').getByText('Predict mode').click();
    const more = page.getByRole('button', { name: 'More playback controls' });
    await more.click();
    const panel = page.getByRole('group', { name: 'Playback' });
    const caption = page.locator('app-player .narration');
    for (const step of [0, 20, 45, 85]) {
      await timeline(page).fill(String(step));
      await expect(count(page)).toHaveText(`${step + 1} / 86`);
      const top = (await panel.boundingBox())!.y;
      const bottom = await caption.evaluate((c) => c.getBoundingClientRect().bottom);
      expect(top, `step ${step + 1}: the panel starts below the caption`).toBeGreaterThanOrEqual(bottom - 0.5);
    }
  });
});
