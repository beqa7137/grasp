import { ALGORITHM_CATALOG } from '@grasp/engine';
import type { Locator, Page } from '@playwright/test';
import { expect, openPlayback, recordedEvents, stepTotal, stepToCheckpoint, test } from './fixtures';

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

  test('a tap on a merged mark opens the pending checkpoint it shows', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/visualize/lcs');
    await openPlayback(page);
    for (const at of ['2 / 86', '8 / 86']) {
      await page.getByRole('button', { name: 'Next checkpoint' }).click();
      await expect(count(page)).toHaveText(at);
      await page.locator('.predict').getByRole('button', { name: 'Skip' }).click();
      await openPlayback(page);
    }
    // At 320px LCS's checkpoints at 8 and 12 are 13px apart, so they draw as one mark, pending, on 12.
    await expect(transport(page).locator('.tick[data-state="skipped"]')).toHaveCount(1);
    const at = await centre(transport(page).locator('.tick[data-state="pending"]').first());
    if (testInfo.project.use.hasTouch) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    await expect(count(page)).toHaveText('12 / 86');
    await expect(page.locator('.predict .prompt')).toBeFocused();
  });
});

// A 320px phone upright, and a 360px-tall one held sideways, whose R the grid sets rather than the caption.
for (const [width, height] of [
  [320, 700],
  [740, 360],
] as const) {
  test.describe(`⋯ on a ${width}×${height} phone`, { tag: '@player' }, () => {
    test.beforeEach(async ({ page }) => page.setViewportSize({ width, height }));

    for (const { id } of ALGORITHM_CATALOG) {
      test(`fits whole in region R, under the caption, in the frame each seek paints, on ${id}'s first and last frames`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'phone' && testInfo.project.name !== 'iphone', 'A phone layout, measured on the phones.');
        await page.goto(`/visualize/${id}`);
        await page.locator('app-player').getByText('Predict mode').click();
        await openPlayback(page);
        const total = await stepTotal(count(page));
        for (const step of [total - 1, 0]) {
          // A ResizeObserver made after the player's runs after it in the same frame, just before paint, so it sees what is painted.
          const painted = await page.evaluate(
            (to) =>
              new Promise<{ gap: number; hidden: number }[]>((resolve) => {
                const player = document.querySelector('app-player')!;
                const panel = player.querySelector<HTMLElement>('g-transport .more')!;
                const caption = player.querySelector('.narration')!;
                const seen: { gap: number; hidden: number }[] = [];
                const probe = new ResizeObserver(() =>
                  seen.push({
                    gap: panel.getBoundingClientRect().top - caption.getBoundingClientRect().bottom,
                    hidden: panel.scrollHeight - panel.clientHeight,
                  }),
                );
                probe.observe(player.querySelector('.panel-col')!);
                const range = panel.querySelector('input')!;
                range.value = String(to);
                range.dispatchEvent(new Event('input', { bubbles: true }));
                setTimeout(() => (probe.disconnect(), resolve(seen)), 400);
              }),
            step,
          );
          await expect(count(page)).toHaveText(`${step + 1} / ${total}`);
          const settled = await page.evaluate(() => {
            const panel = document.querySelector('app-player g-transport .more')!;
            const caption = document.querySelector('app-player .narration')!;
            return {
              gap: panel.getBoundingClientRect().top - caption.getBoundingClientRect().bottom,
              hidden: panel.scrollHeight - panel.clientHeight,
            };
          });
          for (const { gap, hidden } of [...painted, settled]) {
            expect(gap, `step ${step + 1}: the panel starts below the caption`).toBeGreaterThanOrEqual(-0.5);
            expect(hidden, `step ${step + 1}: nothing in the panel is scrolled out of sight`).toBeLessThanOrEqual(1);
          }
        }
      });
    }
  });
}

test.describe('⋯ on a phone', { tag: '@player' }, () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 320, height: 700 }));

  test("while a drag holds, the hold chip takes the Timeline label's row inside the panel", async ({ page }, testInfo) => {
    await page.goto('/visualize/binary-search');
    await openPlayback(page);
    const pointer = await pointerFor(page, testInfo.project.name);
    const thumb = await centre(timeline(page));
    const first = await centre(tick(page, 0));
    const label = transport(page).locator('.label').first();
    await expect(label).toBeVisible();
    await pointer.down((await timeline(page).boundingBox())!.x + 8, thumb.y);
    await pointer.move(first.x + 4, thumb.y);
    const chip = (await transport(page).getByText('Answer it, or skip?').boundingBox())!;
    const panel = (await transport(page).locator('.more').boundingBox())!;
    expect(chip.y, 'the chip stays inside the panel').toBeGreaterThanOrEqual(panel.y);
    await expect(label, 'the label gives way to the chip').toBeHidden();
    await expect(timeline(page), 'the Timeline keeps its name').toBeVisible();
    await pointer.up(first.x + 4, thumb.y);
  });

  test("a short R keeps the result in the caption's live region, and a tall one shows it whole", async ({ page }) => {
    const narration = page.locator('app-player .narration');
    for (const [width, height, shown] of [
      [320, 700, false],
      [768, 1024, true],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto('/visualize/binary-search');
      await openPlayback(page);
      await timeline(page).press('End');
      await expect(count(page)).toHaveText(/^(\d+) \/ \1$/);
      await expect(narration).toHaveAttribute('aria-live', 'polite');
      expect(await narration.ariaSnapshot(), `${width}×${height}`).toContain('→ 5');
      const result = await narration.locator('.result').boundingBox();
      expect(result!.width > 2, `${width}×${height}: the result is in view`).toBe(shown);
      await expect(narration.getByRole('link', { name: /Now write it yourself/ })).toBeVisible({ visible: shown });
      expect(
        await transport(page)
          .locator('.more')
          .evaluate((m) => m.scrollHeight - m.clientHeight),
      ).toBeLessThanOrEqual(1);
    }
  });
});
