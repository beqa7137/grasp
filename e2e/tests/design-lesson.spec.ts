import { expect, test } from './fixtures';

test('a system design lesson opens from Design and its widget answers the keyboard', async ({ page }) => {
  await page.goto('/design');
  await page.getByRole('link', { name: /Latency & Queueing/ }).click();
  await expect(page.getByRole('heading', { name: 'Latency & Queueing', level: 1 })).toBeVisible();

  const slider = page.getByRole('slider', { name: /^Utilization \d+%/ });
  const p99 = page.locator('.readouts div').filter({ hasText: 'p99' }).locator('dd');
  await expect(p99).toHaveText('92 ms');
  await slider.focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Utilization 90%')).toBeVisible();
  await expect(p99).toHaveText('461 ms');

  await expect(page.getByRole('link', { name: 'Mission: Your First Scale-Up' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Quick check/ })).toBeVisible();
});

test('a design lesson opens at its top: its quick check further down takes no focus until answered', async ({ page }) => {
  await page.goto('/design/topics/sd-replication');
  await expect(page.getByRole('heading', { name: 'Replication', level: 1, exact: true })).toBeInViewport();
  await expect(page.getByRole('heading', { name: /Quick check/ })).toBeAttached();
  await page.waitForTimeout(1_000);
  const scrollTop = () =>
    page.evaluate(async () => {
      const content = document.querySelector('app-design-lesson:not(.ion-page-hidden) ion-content') as unknown as {
        getScrollElement(): Promise<HTMLElement>;
      };
      return (await content.getScrollElement()).scrollTop;
    });
  expect(await scrollTop()).toBe(0);
  await expect(page.getByRole('heading', { name: 'Replication', level: 1, exact: true })).toBeInViewport();
});

test('the sharding lesson counts the keys that move when a node joins, by consistent hashing and by hash mod N', async ({ page }) => {
  await page.goto('/design/topics/sd-sharding');
  const moved = page.locator('.readouts div').filter({ hasText: 'Last change moved' }).locator('dd');
  await expect(moved).toHaveText('nothing yet');

  await page.getByRole('button', { name: 'Add node E' }).click();
  await expect(moved).toHaveText('46 of 200');

  const modes = page.getByRole('radiogroup', { name: 'How keys are assigned' });
  await modes.getByRole('radio', { name: 'Consistent hashing' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(modes.getByRole('radio', { name: 'hash mod N' })).toBeFocused();
  await modes.getByRole('radio', { name: 'hash mod N' }).click();
  await expect(moved).toHaveText('nothing yet');
  await page.getByRole('button', { name: 'Remove node E' }).click();
  await expect(moved).toHaveText(/^1[5-7]\d of 200$/);
});

test('the queue lesson drains the backlog sooner with more consumers', async ({ page }) => {
  await page.goto('/design/topics/sd-queues');
  const drained = page.locator('.readouts div').filter({ hasText: 'Drained' }).locator('dd');
  await expect(drained).toHaveText('25 s after spike');
  await page.getByRole('button', { name: 'More consumers' }).click();
  await expect(drained).toHaveText('no backlog');
  await page.getByRole('button', { name: 'Fewer consumers' }).click();
  await page.getByRole('button', { name: 'Fewer consumers' }).click();
  await expect(drained).toHaveText('never');
});

test('the rate limiting lesson shows a fixed window passing twice the limit at a window edge', async ({ page }) => {
  await page.goto('/design/topics/sd-rate-limiting');
  await expect(page.getByRole('radio', { name: 'Edge burst' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('20 of 20 accepted · worst second 20')).toBeVisible();
  await expect(page.getByText('10 of 20 accepted · worst second 10')).toBeVisible();
  await page.getByRole('radio', { name: 'Steady' }).click();
  await expect(page.getByText('24 of 24 accepted · worst second 8')).toHaveCount(3);
});

test('the reliability lesson shows a second database copy removing almost all downtime', async ({ page }) => {
  await page.goto('/design/topics/sd-reliability');
  const whole = page.locator('.readouts div').filter({ hasText: 'Whole request' }).locator('dd');
  await expect(whole).toHaveText('99.950%');
  await page.getByRole('button', { name: 'More Database copies' }).click();
  await expect(whole).toHaveText('99.99997%');
  await expect(page.locator('.readouts div').filter({ hasText: 'Down a year' }).locator('dd')).toHaveText('8 s');
});

test('the estimation drill judges a typed estimate and shows the working', async ({ page }) => {
  await page.goto('/design/topics/sd-estimation');
  const drill = page.locator('app-estimate-drill');
  await drill.getByRole('textbox').fill('6k');
  await drill.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(drill.getByRole('status')).toContainText('Spot on.');
  await drill.getByRole('button', { name: 'Next question' }).click();
  await expect(drill.getByText('Question 2 of 6')).toBeVisible();
  await expect(drill.getByRole('textbox')).toBeFocused();
});

test('the capacity lesson moves the bottleneck when the database gets a second instance', async ({ page }) => {
  await page.goto('/design/topics/sd-capacity');
  const readout = (name: string) => page.locator('.readouts div').filter({ hasText: name }).locator('dd');
  await expect(readout('Bottleneck')).toHaveText('Database');
  await expect(readout('Dropped')).toHaveText('4,000/s');
  await page.getByRole('button', { name: 'More Database' }).click();
  await expect(readout('Bottleneck')).toHaveText('App servers');
  await expect(readout('Dropped')).toHaveText('2,000/s');
});

test('the consistency lesson shows a stale read once R + W no longer exceeds N, and a failed write when too few replicas are up', async ({
  page,
}) => {
  await page.goto('/design/topics/sd-consistency');
  const readout = (name: string) => page.locator('.readouts div').filter({ hasText: name }).locator('dd');
  await expect(readout('R + W vs N')).toHaveText('4 > 3');
  await expect(readout('The read sees')).toHaveText('the new value');
  await page.getByRole('button', { name: 'Lower Read quorum' }).click();
  await expect(readout('R + W vs N')).toHaveText('3 ≤ 3');
  await expect(readout('The read sees')).toHaveText('possibly the old value');
  await page.getByRole('button', { name: /^Replica 1,/ }).click();
  await page.getByRole('button', { name: /^Replica 2,/ }).click();
  await expect(page.getByRole('button', { name: /^Replica 1, down/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(readout('Write')).toHaveText('fails');
});

test('the consensus lesson lets only a majority commit, and an even split stops writes everywhere', async ({ page }) => {
  await page.goto('/design/topics/sd-consensus');
  const writes = page.locator('.readouts div').filter({ hasText: 'Writes' }).locator('dd');
  await expect(writes).toHaveText('commit on the right');
  await expect(page.getByText('Left: old leader cannot commit')).toBeVisible();
  await page.getByRole('radio', { name: '4', exact: true }).click();
  await expect(writes).toHaveText('stop everywhere');
  const slider = page.getByRole('slider', { name: /Nodes on the left/ });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(writes).toHaveText('commit on the left');
  await expect(page.getByText('Left: majority, leader stays')).toBeVisible();
});

test('the unique ids lesson trades timestamp years for generator bits, and weighs random ids by the birthday bound', async ({ page }) => {
  await page.goto('/design/topics/sd-ids');
  const readout = (name: string) => page.locator('.readouts div').filter({ hasText: name }).locator('dd');
  await expect(readout('Lasts')).toHaveText('69.7 years');
  await expect(readout('Generators')).toHaveText('1,024');
  const generators = page.getByRole('slider', { name: /Generator bits/ });
  await generators.focus();
  await page.keyboard.press('ArrowRight');
  await expect(readout('Lasts')).toHaveText('34.8 years');
  await expect(readout('Chance of any repeat')).toHaveText('about 9.4 × 10^-20');
  await page.getByRole('radio', { name: '64 random bits' }).click();
  await expect(readout('Chance of any repeat')).toHaveText('2.7%');
});

test('the search lesson intersects posting lists for AND and ranks every match for OR', async ({ page }) => {
  await page.goto('/design/topics/sd-search');
  const results = page.locator('app-index-widget .results li');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText('Redis is a fast in-memory database');
  await expect(results.first()).toContainText('1.02');
  await page.getByRole('radio', { name: 'Any word (OR)' }).click();
  await expect(results).toHaveCount(5);
  await page.locator('app-index-widget').getByRole('searchbox').fill('zebra');
  await expect(page.getByText('No document matches.')).toBeVisible();
});

test('the stream lesson drops an event that arrives after its window closed, until the watermark delay allows for it', async ({ page }) => {
  await page.goto('/design/topics/sd-streams');
  const dropped = page.locator('.readouts div').filter({ hasText: 'Dropped' }).locator('dd');
  await expect(dropped).toHaveText('event 4, at 8 s');
  const delay = page.getByRole('slider', { name: /Watermark delay/ });
  await delay.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await expect(dropped).toHaveText('none');
  await page.getByRole('radio', { name: 'Session' }).click();
  await expect(page.locator('.readouts div').filter({ hasText: 'Windows' }).locator('dd')).toHaveText('1');
});

test('the storage lesson compares write amplification, and bloom filters keep an LSM lookup to one read', async ({ page }) => {
  await page.goto('/design/topics/sd-storage');
  const engine = (name: string) => page.getByRole('region', { name });
  const readout = (name: string, label: string) => engine(name).locator('.readouts div').filter({ hasText: label }).locator('dd');
  await expect(readout('B-tree', 'Write amp.')).toHaveText('42×');
  await expect(readout('LSM tree', 'Write amp.')).toHaveText('24×');
  await expect(readout('LSM tree', 'Reads per lookup')).toHaveText('1');
  await page.getByRole('checkbox', { name: /Bloom filters/ }).uncheck();
  await expect(readout('LSM tree', 'Reads per lookup')).toHaveText('5');
});

test('the CDN lesson shows a shield absorbing the misses that more edge locations cause', async ({ page }) => {
  await page.goto('/design/topics/sd-cdn');
  const readout = (label: string) => page.locator('.readouts div').filter({ hasText: label }).locator('dd');
  await expect(readout('Edge hits')).toHaveText('69.2%');
  await expect(readout('Origin load')).toHaveText('3,077/s');
  await page.getByRole('checkbox', { name: /Origin shield/ }).check();
  await expect(readout('Origin load')).toHaveText('886/s');
  await page.getByRole('radio', { name: '1 h' }).click();
  await expect(readout('Edge hits')).toHaveText('95.8%');
  await expect(readout('Origin load')).toHaveText('26/s');
});

test('the multi-region lesson trades read and write latency against what a region outage loses', async ({ page }) => {
  await page.goto('/design/topics/sd-multi-region');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Read')).toHaveText('88 ms');
  await page.getByRole('radio', { name: 'Read replicas' }).click();
  await expect(readout('Read')).toHaveText('20 ms');
  await expect(readout('Write')).toHaveText('88 ms');
  await page.getByRole('radio', { name: 'Quorum' }).click();
  await expect(readout('Write')).toHaveText('168 ms');
  await expect(readout('Lost if the primary region dies')).toHaveText('nothing');
});

test('the observability lesson turns an SLO into a budget and pages once errors burn it fast', async ({ page }) => {
  await page.goto('/design/topics/sd-observability');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Budget')).toHaveText('43.2 min');
  await expect(readout('Burn rate')).toHaveText('1×');
  const alerts = page.getByRole('list', { name: 'Burn-rate alerts' }).getByRole('listitem');
  await expect(alerts.filter({ hasText: 'Pages' })).toHaveCount(0);
  await page.getByRole('slider', { name: /Requests failing now/ }).fill('144');
  await expect(readout('Burn rate')).toHaveText('14.4×');
  await expect(alerts.filter({ hasText: 'Pages' })).toHaveCount(2);
});

test('the API design lesson shows offset paging reading every skipped row, and cursors reading one page', async ({ page }) => {
  await page.goto('/design/topics/sd-api-design');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Rows read for this page')).toHaveText('500');
  await expect(readout('Items shown twice')).toHaveText('27');
  await page.getByRole('radio', { name: 'Cursor' }).click();
  await expect(readout('Rows read for this page')).toHaveText('51');
  await expect(readout('Items shown twice')).toHaveText('0');
});

test('the security lesson shows a fast hash falling in minutes where bcrypt takes centuries', async ({ page }) => {
  await page.goto('/design/topics/sd-security');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Try them all')).toHaveText('615 years');
  await page.getByRole('radio', { name: 'SHA-256' }).click();
  await expect(readout('Try them all')).toHaveText('23 minutes');
});

test('the transactions lesson contrasts locks in two-phase commit with a saga visible half-done state', async ({ page }) => {
  await page.goto('/design/topics/sd-transactions');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Row locks held')).toHaveText('30 ms');
  await page.getByRole('checkbox', { name: /Coordinator crashes/ }).check();
  await expect(readout('Outcome')).toHaveText('blocked');
  await page.getByRole('radio', { name: 'Saga' }).click();
  await page.getByRole('radio', { name: 'Step 3' }).click();
  await expect(readout('Compensations')).toHaveText('2');
  await expect(readout('Outcome')).toHaveText('rolled back');
});

test('the batch lesson shows one hot key stalling the job and a combiner shrinking the shuffle', async ({ page }) => {
  await page.goto('/design/topics/sd-batch');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Whole job')).toHaveText('400 s');
  await page.getByRole('slider', { name: /hottest key/ }).fill('20');
  await expect(readout('Busiest reducer')).toHaveText('108 GB');
  await expect(readout('Reduce')).toHaveText('1,080 s');
  await page.getByRole('checkbox', { name: /Combiner/ }).check();
  await expect(readout('Shuffle data')).toHaveText('50 GB');
  await expect(readout('Shuffle')).toHaveText('10 s');
});

test('the geospatial lesson trades cells read against places read as geohash precision changes', async ({ page }) => {
  await page.goto('/design/topics/sd-geo');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Cell size')).toHaveText('865 m × 611 m');
  await expect(readout('Cells read')).toHaveText('48');
  await page.getByRole('slider', { name: /Geohash precision/ }).fill('5');
  await expect(readout('Cells read')).toHaveText('6');
  await expect(readout('Reads wasted')).toHaveText('88%');
});

test('the real-time lesson shows polling cost and delay against a push connection', async ({ page }) => {
  await page.goto('/design/topics/sd-realtime');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Requests a second')).toHaveText('200,000');
  await expect(readout('Average delay')).toHaveText('2.6 s');
  await page.getByRole('radio', { name: 'WebSocket' }).click();
  await expect(readout('Requests a second')).toHaveText('0');
  await expect(readout('Average delay')).toHaveText('50 ms');
});

test('the data modeling lesson weighs N+1 queries and a join against copying names into posts', async ({ page }) => {
  await page.goto('/design/topics/sd-data-modeling');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Queries per page')).toHaveText('21');
  await page.getByRole('radio', { name: 'One join' }).click();
  await expect(readout('Queries per page')).toHaveText('1');
  await expect(readout('Rows written per rename')).toHaveText('1');
  await page.getByRole('radio', { name: 'Denormalized' }).click();
  await expect(readout('Rows read per page')).toHaveText('20');
  await expect(readout('Rows written per rename')).toHaveText('501');
  await expect(readout('After a rename')).toHaveText('Old name until the fan-out ends');
});

test('the load shedding lesson shows a burst answered too late until the queue is bounded', async ({ page }) => {
  await page.goto('/design/topics/sd-overload');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Users served in time')).toHaveText('25%');
  await expect(readout('Recovered')).toHaveText('50 s after the burst');
  await page.getByRole('radiogroup', { name: 'Retries' }).getByRole('radio', { name: '1' }).click();
  await expect(readout('Recovered')).toHaveText('Not within a minute');
  await page.getByRole('radio', { name: 'Bounded queue' }).click();
  await expect(readout('Users served in time')).toHaveText('85.3%');
  await expect(readout('Answered too late')).toHaveText('0');
  await expect(page.getByRole('img', { name: /^Queue over a minute, peaking at/ })).toBeVisible();
});

test('the locks lesson shows a paused holder writing after its lease ran out, until fencing rejects it', async ({ page }) => {
  await page.goto('/design/topics/sd-locks');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Lease runs out at')).toHaveText('28 s');
  await expect(readout('Its write at 35 s')).toHaveText('Accepted: two holders wrote');
  await page.getByRole('checkbox', { name: 'Fencing tokens' }).check();
  await expect(readout('Its write at 35 s')).toHaveText('Rejected: its token is stale');
  await page.getByRole('radio', { name: 'Crashes' }).click();
  await expect(readout('No one holds it for')).toHaveText('8 s');
});

test('the clocks lesson shows last write wins dropping a later write until a hybrid clock has seen the first', async ({ page }) => {
  await page.goto('/design/topics/sd-clocks');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Worst skew between the two clocks')).toHaveText('26.4 ms');
  await expect(readout("B's later write")).toHaveText('Can lose to A');
  await page.getByRole('radio', { name: 'Hybrid logical clock' }).click();
  await expect(readout("B's later write")).toHaveText('Always wins');
  await page.getByRole('checkbox', { name: "B read A's write before writing" }).uncheck();
  await expect(readout("B's later write")).toHaveText('Can lose to A');
});

test('the discovery lesson shows how long each approach keeps sending to a dead instance', async ({ page }) => {
  await page.goto('/design/topics/sd-discovery');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Traffic still sent to it for')).toHaveText('60 s');
  await expect(readout('Requests sent to the dead instance')).toHaveText('30,000');
  await page.getByRole('radio', { name: 'Load balancer checks' }).click();
  await expect(readout('Traffic still sent to it for')).toHaveText('15 s');
  await expect(readout('Checks a second')).toHaveText('4');
});

test('the durability lesson shows erasure coding beating three copies on nines at half the space', async ({ page }) => {
  await page.goto('/design/topics/sd-durability');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Storage overhead')).toHaveText('3x');
  await expect(readout('Nines of durability')).toHaveText('9.7');
  await page.getByRole('radio', { name: '6 + 3 erasure' }).click();
  await expect(readout('Storage overhead')).toHaveText('1.5x');
  await expect(readout('Nines of durability')).toHaveText('11.8');
  await expect(readout('Read to repair one piece')).toHaveText('6x');
});

test('the recovery lesson shows what each plan loses, and a standby copying a bad delete', async ({ page }) => {
  await page.goto('/design/topics/sd-recovery');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Writes lost \\(RPO\\)')).toHaveText('24 h');
  await expect(readout('Back in service \\(RTO\\)')).toHaveText('3.3 h');
  await page.getByRole('radio', { name: 'Point-in-time recovery' }).click();
  await expect(readout('Writes lost \\(RPO\\)')).toHaveText('1 min');
  await page.getByRole('radio', { name: 'Async standby' }).click();
  await page.getByRole('radio', { name: 'A bad delete' }).click();
  await expect(readout('Data comes back')).toHaveText('No: the delete reached the standby too');
});

test('the tenancy lesson shows a noisy tenant starving everyone until fair sharing protects the quiet ones', async ({ page }) => {
  await page.goto('/design/topics/sd-tenancy');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Each quiet tenant served')).toHaveText('52%');
  await expect(readout('Noisy tenant served')).toHaveText('52%');
  await page.getByRole('radio', { name: 'Fair sharing' }).click();
  await expect(readout('Each quiet tenant served')).toHaveText('100%');
  await expect(readout('Noisy tenant served')).toHaveText('30%');
  await expect(readout('Pool in use')).toHaveText('100%');
});

test('the gateway lesson shows what introspection and a sidecar mesh add to each request', async ({ page }) => {
  await page.goto('/design/topics/sd-gateway');
  const readout = (label: string) =>
    page
      .locator('.readouts div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(readout('Added to each request')).toHaveText('0.1 ms');
  await expect(readout('Calls a second to the auth server')).toHaveText('0');
  await page.getByRole('radio', { name: 'Introspection' }).click();
  await expect(readout('Added to each request')).toHaveText('0.5 ms');
  await expect(readout('Calls a second to the auth server')).toHaveText('1,000');
  await page.getByRole('checkbox', { name: 'Service mesh with sidecar proxies' }).check();
  await expect(readout('Proxies passed')).toHaveText('8');
  await expect(readout('Added to each request')).toHaveText('4.5 ms');
});
