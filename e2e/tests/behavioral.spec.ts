import { expect, test } from './fixtures';

const STORY = {
  Situation: 'Our nightly billing export failed silently for a week before finance noticed the gap.',
  Task: 'Nobody owned the export, and I had the most context on the pipeline that fed it.',
  Action:
    'I traced the failure to an expired credential, I rotated it, I added an alert on missing files and I wrote the runbook. I then asked the data team to own the export and walked them through it.',
  Result: 'Exports have run for 14 months without a gap, and finance closes the month 2 days sooner.',
};

test('a behavioral answer is checked as it is written, kept on this device, and erased with the learner data', async ({ page }) => {
  await page.goto('/mock');
  await page.getByRole('link', { name: /Guides, story bank and rehearsal/ }).click();
  await expect(page.getByRole('heading', { name: 'Behavioral interviews' })).toBeVisible();
  await page.getByRole('link', { name: /^Ownership/ }).click();
  await expect(page.getByRole('heading', { name: 'Ownership', level: 1 })).toBeVisible();
  await page.locator('app-competency').getByRole('link').first().click();

  const checks = page.getByRole('complementary', { name: 'Answer check' });
  await expect(checks).toContainText('0 of 6 checks pass');
  for (const [part, text] of Object.entries(STORY)) await page.getByLabel(part, { exact: true }).fill(text);
  await expect(checks).toContainText('The Result has a number.');
  await expect(checks).toContainText('The Action says what you did');
  await expect(checks).toContainText('4 of 6 checks pass');

  await page.reload();
  await expect(page.getByLabel('Result', { exact: true })).toHaveValue(STORY.Result);

  await page.goto('/behavioral');
  await expect(page.getByRole('link', { name: /^Ownership/ })).toContainText('1 answer drafted');

  await page.goto('/today/settings');
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Your data was deleted. You are starting fresh.')).toBeVisible();
  await page.goto('/behavioral');
  await expect(page.getByRole('link', { name: /^Ownership/ })).not.toContainText('drafted');
});

test('a competency teaches with a worked answer per career stage and weak ones to diagnose', async ({ page }) => {
  await page.goto('/behavioral/conflict');
  await page.getByRole('button', { name: 'Show why it works' }).click();
  await expect(page.getByRole('button', { name: 'Hide why it works' })).toHaveAttribute('aria-expanded', 'true');

  const levels = page.getByRole('radiogroup', { name: 'Career stage' });
  await expect(levels.getByRole('radio', { name: 'Mid-level' })).toHaveAttribute('aria-checked', 'true');
  const asked = page.locator('#example .asked');
  const midQuestion = await asked.textContent();
  await levels.getByRole('radio', { name: 'Senior' }).click();
  await expect(asked).not.toHaveText(midQuestion ?? '');
  await expect(page.locator('app-spot-flaws')).toHaveCount(2);

  const exercise = page.locator('app-spot-flaws').first();
  const check = exercise.getByRole('button', { name: 'Check' });
  await expect(check).toBeDisabled();
  await exercise.getByRole('checkbox', { name: 'Blames others' }).check();
  await check.click();
  await expect(exercise.getByRole('status')).toContainText(/You found \d of \d problems/);
  await expect(exercise).toContainText('How it reads once fixed');
  await exercise.getByRole('button', { name: 'Try again' }).click();
  await expect(exercise.getByRole('checkbox', { name: 'Blames others' })).not.toBeChecked();
});

test('a story written once in the bank covers its competencies, starts answers to their questions, and is erased with the learner data', async ({
  page,
}) => {
  await page.goto('/behavioral');
  await page.getByRole('link', { name: /Your story bank/ }).click();
  await expect(page.getByRole('heading', { name: '0 of 13 competencies have a story' })).toBeVisible();
  await page.getByRole('button', { name: 'New story' }).click();

  await page.getByLabel('Title').fill('The billing export');
  await page.getByRole('button', { name: 'Ownership', exact: true }).click();
  await page.getByRole('button', { name: 'Delivering Results' }).click();
  await expect(page.getByRole('button', { name: 'Ownership', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const [part, text] of Object.entries(STORY)) await page.getByLabel(part, { exact: true }).fill(text);
  await expect(page.getByRole('complementary', { name: 'Answer check' })).toContainText('4 of 6 checks pass');

  await page.goto('/behavioral/stories');
  await expect(page.getByRole('heading', { name: '2 of 13 competencies have a story' })).toBeVisible();
  await expect(page.getByRole('link', { name: /The billing export/ })).toContainText('Ownership, Delivering Results');
  await expect(page.getByText('"The billing export" has 2 checks to fix before you tell it.')).toBeVisible();

  await page.goto('/behavioral/question/ownership-2');
  await page.getByRole('button', { name: 'The billing export' }).click();
  await expect(page.getByLabel('Result', { exact: true })).toHaveValue(STORY.Result);
  await expect(page.getByRole('button', { name: 'The billing export' })).toHaveCount(0);
  await page.goto('/behavioral/question/conflict-1');
  await expect(page.getByText('Start from a story in your bank:')).toHaveCount(0);

  await page.goto('/behavioral/stories');
  await page.getByRole('button', { name: 'New story' }).click();
  await page.getByLabel('Title').fill('A story to drop');
  await page.getByRole('button', { name: 'Delete story' }).click();
  await expect(page.getByRole('heading', { name: '1 story' })).toBeVisible();

  await page.goto('/today/settings');
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Your data was deleted. You are starting fresh.')).toBeVisible();
  await page.goto('/behavioral/stories');
  await expect(page.getByRole('heading', { name: '0 of 13 competencies have a story' })).toBeVisible();
});

test('a story is rehearsed aloud against the clock and comes back after a longer gap when told well', async ({ page }) => {
  await page.goto('/behavioral/stories');
  await page.getByRole('button', { name: 'New story' }).click();
  await page.getByLabel('Title').fill('The billing export');
  await page.getByRole('button', { name: 'Ownership', exact: true }).click();
  await page.getByLabel('Action', { exact: true }).fill(STORY.Action);

  await page.goto('/behavioral/stories');
  await expect(page.getByRole('link', { name: /The billing export/ })).toContainText('Rehearse now');
  await page.getByRole('link', { name: 'Rehearse 1 due' }).click();
  await expect(page.getByText('Story 1 of 1 · Ownership')).toBeVisible();
  await expect(page.locator('app-rehearse h1')).toHaveText(
    'Tell me about a time you took on a problem that was outside your job description.',
  );
  await page.getByText('Peek at your story').click();
  await expect(page.getByText(STORY.Action)).toBeVisible();

  await page.getByRole('button', { name: 'Start timer' }).click();
  await expect(page.getByRole('timer')).toHaveText('0:01');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('status')).toContainText('is short');

  await page.getByRole('button', { name: 'Told it well' }).click();
  await expect(page.getByRole('heading', { name: 'All rehearsed' })).toBeVisible();
  await expect(page.getByText('Next up: The billing export, tomorrow.')).toBeVisible();

  await page.getByRole('link', { name: 'Back to your stories' }).click();
  await expect(page.getByRole('link', { name: /The billing export/ })).toContainText('Rehearse tomorrow');
  await expect(page.getByRole('link', { name: /due$/ })).toHaveCount(0);
});

test('a mock behavioral interview asks three questions with follow-ups, then debriefs each answer', async ({ page }) => {
  await page.goto('/behavioral');
  await page.getByRole('link', { name: /Mock behavioral interview/ }).click();
  const mock = page.locator('app-behavioral-mock');
  const next = mock.getByRole('button', { name: /^(Answer|Finish and see the debrief)$/ });
  const long = 'I would have load tested the client earlier, because the retry storm only showed up under real traffic.';

  for (let question = 1; question <= 3; question++) {
    await expect(mock.getByText(`Question ${question} of 3`, { exact: true })).toBeVisible();
    await expect(mock.getByRole('complementary', { name: 'Answer check' })).toHaveCount(0);
    await expect(next).toBeDisabled();
    for (const [part, text] of Object.entries(STORY)) await mock.getByLabel(part, { exact: true }).fill(text);
    await next.click();
    for (const followUp of [1, 2]) {
      await expect(mock.getByText(`Question ${question} of 3 · follow-up ${followUp} of 2`)).toBeVisible();
      await expect(mock.getByRole('heading', { level: 1 })).toBeFocused();
      await mock.getByLabel('Your answer').fill(followUp === 1 ? 'Not sure.' : long);
      await next.click();
    }
  }

  await expect(mock.getByRole('heading', { name: 'Debrief' })).toBeVisible();
  await expect(mock.getByText(/^\d+ of 24 checks pass/)).toBeVisible();
  await expect(mock.getByText('Fix first:')).toBeVisible();
  await expect(mock.getByRole('region')).toHaveCount(3);
  await expect(mock.getByText('needs a real answer')).toHaveCount(3);

  await mock.getByRole('button', { name: 'Add to story bank' }).first().click();
  await expect(mock.getByRole('button', { name: 'In your story bank' })).toBeDisabled();
  await page.goto('/behavioral/stories');
  await expect(page.getByRole('link', { name: /Our nightly billing export failed silently/ })).toBeVisible();
});
