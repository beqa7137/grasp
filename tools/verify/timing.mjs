// First paint and first tap on a throttled phone (Pixel 7, Fast 3G, 4x CPU, cold cache), builds interleaved, median of RUNS.
// TARGETS=base=http://localhost:4621,now=http://localhost:4622 [RUNS=5] node tools/verify/timing.mjs
// Writes are blocked, so a production URL is safe to time. A local http:// target is timed through an HTTP/2 proxy, as
// production serves over HTTP/2 (`h2proxy.mjs`).
import { serveHttp2 } from './h2proxy.mjs';
import { devices, launch, readOnly } from './lib.mjs';

const TARGETS = Object.fromEntries(
  (process.env.TARGETS ?? '')
    .split(',')
    .filter(Boolean)
    .map((t) => t.split(/=(.*)/s).slice(0, 2)),
);
const RUNS = Number(process.env.RUNS ?? 5);
const FAST_3G = { offline: false, latency: 562.5, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9 };
// Each selector and heading list also matches a build from before REDESIGN.md R5 (Learn, Visualize), so main can be timed against it;
// the player tap needs the Coding hub (R5 on).
const TAPS = [
  {
    name: 'coding',
    selector: 'ion-tab-button[tab="coding"], ion-tab-button[tab="visualize"]',
    heading: ['Master the cue', 'Watch the algorithm think.'],
  },
  {
    name: 'design',
    selector: 'ion-tab-button[tab="design"]',
    heading: ['System design', 'Learn it hands-on', 'Build it. Load it. Break it.'],
  },
  { name: 'behavioral', selector: 'ion-tab-button[tab="behavioral"]', heading: ['Behavioral interviews'] },
  // Today lost its visualizer tile in R9, so the player is opened from Coding's Visualizers list: the steps before the tap
  // are untimed. The heading alone can show before the stage, so the player counts once it is drawn.
  {
    name: 'player',
    before: ['ion-tab-button[tab="coding"]', 'app-hub a[href="/coding/visualizers"]'],
    selector: 'a[href="/coding/visualizers/binary-search"]',
    heading: ['Binary Search'],
    ready: 'app-player .scene .viz > *',
  },
];
const headingVisible = (texts) =>
  [...document.querySelectorAll('.ion-page:not(.ion-page-hidden) h1')].some(
    (h) => texts.some((text) => h.textContent.includes(text)) && h.getBoundingClientRect().height > 0,
  );

async function once(browser, url, tap) {
  const context = await browser.newContext({ ...devices['Pixel 7'], ignoreHTTPSErrors: true });
  await context.addInitScript(() => localStorage.setItem('CapacitorStorage.grasp.pilotNotice.v1', '2026-01-01T00:00:00.000Z'));
  await readOnly(context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', FAST_3G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${url}/today`, { waitUntil: 'commit' });
  await page.waitForFunction(headingVisible, ['Build intuition', 'What is your loop?'], { timeout: 120_000, polling: 50 });
  const today = await page.evaluate(() => performance.now());
  const steps = [...(tap.before ?? []), tap.selector];
  for (let i = 0; i < steps.length - 1; i++) {
    await page.locator(`${steps[i]} >> visible=true`).first().click();
    await page.waitForFunction(
      (next) => [...document.querySelectorAll(next)].some((el) => el.getBoundingClientRect().height > 0),
      steps[i + 1],
      {
        timeout: 120_000,
        polling: 50,
      },
    );
  }
  const tappedAt = await page.evaluate((selector) => {
    const at = performance.now();
    [...document.querySelectorAll(selector)].find((el) => el.getBoundingClientRect().height > 0).click();
    return at;
  }, tap.selector);
  await page.waitForFunction(headingVisible, tap.heading, { timeout: 120_000, polling: 50 });
  if (tap.ready) {
    await page.waitForFunction((selector) => document.querySelector(selector)?.getBoundingClientRect().height > 0, tap.ready, {
      timeout: 120_000,
      polling: 50,
    });
  }
  const shown = await page.evaluate(() => performance.now());
  await context.close();
  return { today, tap: shown - tappedAt, fromLoad: shown };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

const proxies = [];
for (const [label, url] of Object.entries(TARGETS)) {
  if (!url.startsWith('http://')) continue;
  const proxy = await serveHttp2(url);
  proxies.push(proxy);
  TARGETS[label] = proxy.url;
}

const browser = await launch();
const labels = Object.keys(TARGETS);
for (const tap of TAPS) {
  const runs = Object.fromEntries(labels.map((l) => [l, []]));
  for (let i = 0; i < RUNS; i++) for (const label of labels) runs[label].push(await once(browser, TARGETS[label], tap));
  for (const key of ['today', 'tap', 'fromLoad']) {
    console.log(tap.name.padEnd(10), key.padEnd(9), labels.map((l) => `${l} ${median(runs[l].map((r) => r[key]))} ms`).join('  '));
  }
}
await browser.close();
for (const proxy of proxies) void proxy.close();
process.exit(0);
