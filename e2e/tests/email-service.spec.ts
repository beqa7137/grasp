import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, synced, test } from './fixtures';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

async function seriousViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .include('app-case-study')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`);
}

/** Opens every point of the stage and moves on to the next one. */
async function finishStage(stage: Locator, next: string | RegExp) {
  await stage.getByRole('button', { name: 'Show the model answer' }).click();
  await stage.getByRole('button', { name: 'Show all' }).click();
  await stage.getByRole('button', { name: next }).click();
}

async function decide(stage: Locator, option: RegExp, mark: 'your answer, correct' | 'your answer, wrong') {
  await stage.locator('fieldset').first().getByRole('button', { name: option }).click();
  await expect(stage.getByRole('img', { name: mark }).first()).toBeVisible();
}

async function estimate(stage: Locator, guess: string, shown: string) {
  await stage.getByRole('textbox').fill(guess);
  await stage.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(stage.getByRole('status').filter({ hasText: shown })).toContainText('Spot on.');
}

/** Answers the widget's prediction with `choice`, and checks it was the right one. */
async function predict(widget: Locator, choice: string) {
  await widget.locator('app-widget-check fieldset').getByRole('button', { name: choice, exact: true }).click();
  await expect(widget.locator('app-widget-check').getByRole('img', { name: 'your answer, correct' })).toBeVisible();
}

const readout = (widget: Locator, name: string) =>
  widget
    .locator('.readouts div')
    .filter({ has: widget.page().getByText(name, { exact: true }) })
    .locator('dd');

for (const theme of ['dark', 'light'] as const) {
  test.describe(`in the ${theme} theme`, () => {
    test.use({ theme });

    test('the email case runs its retry and storage models and finishes into reviews', async ({ page }) => {
      // Fourteen stages and two models in one walk take up to a minute on the WebKit iPhone.
      test.slow();
      await page.goto('/design');
      await page.getByRole('link', { name: /^Email Service/ }).click();
      await expect(page.getByRole('heading', { name: 'Email Service', level: 1 })).toBeVisible();
      const stages = page.locator('li.stage');

      await decide(stages.nth(0), /^Once our server answers 250 OK to a sending server/, 'your answer, correct');
      await finishStage(stages.nth(0), 'Next: Estimate the mail flow');
      await estimate(stages.nth(1), '463k', '462,963 messages/s');
      await finishStage(stages.nth(1), 'Next: Estimate storage');
      await estimate(stages.nth(2), '518', '518 PB');
      await finishStage(stages.nth(2), 'Next: Design the client API');
      await decide(stages.nth(3), /^Store the message in the Sent folder and the outbound queue durably/, 'your answer, correct');
      await finishStage(stages.nth(3), 'Next: Model mailboxes, messages and threads');
      await decide(stages.nth(4), /^All messages in one table sharded by message id/, 'your answer, wrong');
      await finishStage(stages.nth(4), 'Next: Put it together');
      await finishStage(stages.nth(5), 'Next: Receive mail');
      await decide(stages.nth(6), /^Once the message is written to the inbound queue in at least two zones/, 'your answer, correct');
      await finishStage(stages.nth(6), 'Next: Send mail and retry');

      const sendStage = stages.nth(7);
      await expect(sendStage.locator('app-smtp-retry-widget')).toHaveCount(0);
      await decide(sendStage, /^Keep it queued and retry with growing waits/, 'your answer, correct');
      await expect(sendStage.getByRole('heading', { name: 'Try it: retry a message through an outage' })).toBeVisible();
      const retry = sendStage.locator('app-smtp-retry-widget');
      await expect(retry.locator('.readouts')).toHaveCount(0);
      await expect(
        retry.getByRole('img', { name: 'Timeline of a 6 h outage, with a 5 d queue lifetime; the attempts show once you answer' }),
      ).toBeVisible();
      await predict(retry, '1 h');
      await expect(retry.getByRole('group', { name: /^Predict: the remote server is broken for 6 h/ })).toBeFocused();
      await expect(readout(retry, 'Outcome')).toHaveText('Delivered at 6 h 15 min');
      await expect(readout(retry, 'Attempts')).toHaveText('10');
      await expect(readout(retry, 'Queued at recovery')).toHaveText('7,200');
      expect(await seriousViolations(page)).toEqual([]);

      const outage = retry.getByRole('slider', { name: /^Remote server broken for/ });
      await outage.focus();
      await page.keyboard.press('ArrowRight');
      await expect(outage).toHaveAttribute('aria-valuetext', '12 hours');
      await expect(readout(retry, 'Outcome')).toHaveText('Delivered at 12 h 15 min');
      await expect(readout(retry, 'Attempts')).toHaveText('16');
      await expect(retry.locator('app-widget-check fieldset')).toHaveCount(0);
      await expect(retry.getByRole('status')).toHaveText(
        '451 for 12 hours; retries from 5 minutes up to 1 hour; lifetime 5 days. Delivered at 12 h 15 min after 16 attempts; 14,400 messages queued at recovery, 0 bounced.',
      );
      const reply = retry.getByRole('radiogroup', { name: 'While broken, the remote server answers' });
      await reply.getByRole('radio', { name: '451: try again later (4xx)' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(reply.getByRole('radio', { name: '550: no such user (5xx)' })).toHaveAttribute('aria-checked', 'true');
      await expect(retry.locator('.readouts')).toHaveCount(0);
      await predict(retry, 'Bounced at once, on the first attempt');
      await expect(readout(retry, 'Outcome')).toHaveText('Bounced at once');
      await expect(readout(retry, 'Bounced')).toHaveText('14,400');
      expect(await seriousViolations(page)).toEqual([]);
      await finishStage(sendStage, 'Next: Store bodies and attachments once');

      const storeStage = stages.nth(8);
      await decide(storeStage, /^Content-addressed/, 'your answer, correct');
      await expect(storeStage.getByRole('heading', { name: 'Try it: store a year of mail' })).toBeVisible();
      const storage = storeStage.locator('app-mail-storage-widget');
      await expect(readout(storage, 'Messages a year')).toHaveText('7.3 trillion');
      await expect(readout(storage, 'On disk')).toHaveCount(0);
      await predict(storage, 'Attachments');
      await expect(readout(storage, 'On disk')).toHaveText('934 PB');
      await expect(storage.getByRole('img', { name: /^Stored a year, one copy: message metadata 2%/ })).toBeVisible();
      const dedup = storage.getByRole('slider', { name: /^Attachment bytes already stored/ });
      await dedup.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(dedup).toHaveAttribute('aria-valuetext', '25 percent already stored');
      await expect(readout(storage, 'Saved by dedup')).toHaveText('91.3 PB');
      const copies = storage.getByRole('radiogroup', { name: 'How stored bytes are kept durable' });
      await copies.getByRole('radio', { name: 'Three copies' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(copies.getByRole('radio', { name: 'Erasure code (1.5x)' })).toHaveAttribute('aria-checked', 'true');
      await expect(readout(storage, 'On disk')).toHaveCount(0);
      await predict(storage, '91.3 PB');
      await expect(readout(storage, 'On disk')).toHaveText('495 PB');
      await expect(storage.getByRole('status')).toContainText('Stored 330 PB a year, 495 PB on disk.');
      expect(await seriousViolations(page)).toEqual([]);
      await finishStage(storeStage, 'Next: Search a mailbox');

      await decide(stages.nth(9), /^An inverted index per user/, 'your answer, correct');
      await finishStage(stages.nth(9), 'Next: Sync every device');
      await decide(stages.nth(10), /^The mailbox keeps a change log ordered by a counter/, 'your answer, correct');
      await finishStage(stages.nth(10), 'Next: Plan for failure');
      await decide(stages.nth(11), /^Keep accepting it into the replicated inbound queue/, 'your answer, correct');
      await finishStage(stages.nth(11), 'Next: Protect mail in transit and at rest');
      await decide(stages.nth(12), /^STARTTLS on every connection, plus an MTA-STS policy/, 'your answer, correct');
      await finishStage(stages.nth(12), 'Next: Operate it');

      const sync = synced(page, 'case.completed');
      await finishStage(stages.nth(13), 'Finish the case');
      await expect(page.getByText('Decisions as recommended: 9 of 10. Estimates within 2x: 2 of 2.')).toBeVisible();
      await sync;
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}

test.describe('on a 320 px screen', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  for (const [reached, selector, drawing] of [
    [7, 'app-smtp-retry-widget', 'svg.timeline'],
    [8, 'app-mail-storage-widget', '.split'],
  ] as const) {
    test(`the ${selector} drawing, legend and readouts fit without scrolling sideways`, async ({ page }) => {
      const stages = Array.from({ length: reached + 1 }, (_, i) =>
        i === 1 ? { guess: '463k' } : i === 2 ? { guess: '518' } : [0, 3, 4, 6, 7, 8].includes(i) ? { chosen: 0 } : {},
      );
      await page.addInitScript(
        (draft) => localStorage.setItem('CapacitorStorage.grasp.case.email-service', draft),
        JSON.stringify({ attempt: `e2e-320-${reached}`, reached, stages }),
      );
      await page.goto('/design/case/email-service');
      const widget = page.locator(selector);
      await widget.locator('app-widget-check fieldset button').first().click();
      await expect(widget.locator('.readouts div').nth(2)).toBeVisible();
      for (const part of [widget.locator(drawing), widget, widget.locator('.legend-list'), widget.locator('.readouts')]) {
        const { scroll, client } = await part.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
        expect(scroll).toBeLessThanOrEqual(client);
      }
      const shown = await widget.locator(drawing).boundingBox();
      const box = await widget.boundingBox();
      expect(shown!.x + shown!.width).toBeLessThanOrEqual(box!.x + box!.width);
    });
  }
});
