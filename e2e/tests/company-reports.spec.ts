import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** A day the shipped reports were checked for, so the lists hold whatever the real date. */
const CHECKED = new Date('2026-10-20T12:00:00');

const open = async (page: Page, path: string, day = CHECKED) => {
  await page.clock.setFixedTime(day);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  return page.locator('app-interview-reports');
};

const lines = (reports: ReturnType<Page['locator']>) => reports.locator('li .line');

test('a tagged problem lists its interview reports with each date and its kind, linking out in a new tab', async ({ page }) => {
  const reports = await open(page, '/coding/problems/lowest-common-ancestor');
  const summary = reports.getByText('Reported in interviews: Google, Meta, Amazon');
  await expect(summary).toBeVisible();
  await expect(lines(reports).first()).toBeHidden();
  await summary.click();
  await expect(lines(reports)).toHaveText(['Google Interview Jan 2025', 'Meta Interview Aug 2025', 'Amazon Updated May 2025']);
  const link = reports.getByRole('link', { name: /^Roundz Newsletter: Interview Experience - 183 - Meta/ });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveAttribute('href', 'https://roundz.substack.com/p/interview-experience-183-meta-machine-learning-engineer');
  await expect(reports.getByText(/not affiliated with these companies/)).toBeVisible();
});

test('a tagged case lists its reports above the stages', async ({ page }) => {
  const reports = await open(page, '/design/cases/ticketing');
  await reports.getByText('Reported in interviews: Meta, Amazon').click();
  await expect(lines(reports)).toHaveText(['Meta Interview Aug 2025', 'Amazon Published May 2025']);
  await expect(reports.getByRole('link')).toHaveCount(2);
  const [list, stages] = await Promise.all([reports.boundingBox(), page.locator('.stages').boundingBox()]);
  expect(list!.y).toBeLessThan(stages!.y);
});

test('an untagged problem or case shows no list', async ({ page }) => {
  const problem = await open(page, '/coding/problems/house-robber');
  await expect(page.getByText(/Reported in interviews/)).toHaveCount(0);
  await expect(problem).toBeHidden();
  const caseStudy = await open(page, '/design/cases/rate-limiter');
  await expect(page.getByText(/Reported in interviews/)).toHaveCount(0);
  await expect(caseStudy).toBeHidden();
});

test('a report hides on the device once it is past 24 months, and every list once its recheck is overdue', async ({ page }) => {
  const jumpGame = await open(page, '/coding/problems/jump-game', new Date('2026-12-31T12:00:00'));
  await expect(jumpGame.getByText('Reported in interviews: Apple')).toBeVisible();
  await open(page, '/coding/problems/jump-game', new Date('2027-01-01T12:00:00'));
  await expect(page.getByText(/Reported in interviews/)).toHaveCount(0);
  await open(page, '/design/cases/ticketing', new Date('2027-01-26T12:00:00'));
  await expect(page.getByText(/Reported in interviews/)).toHaveCount(0);
});
