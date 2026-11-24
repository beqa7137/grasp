// Renders mockup.html in every state at 1280, 390 and 320 px in both themes, saves full-page screenshots to shots/,
// and prints the page's own collision report (text on text, labels closer than 6 px, marks under text, marks or text
// off the stage, dots on dots, x ticks closer than 6 px, text at an outline's stroke, tags on text, hit boxes under
// 44 px or on each other) and the layout assertions (no false claims, flows as wide as their shares, dashes only while
// a question hides, no ghost while one is open, no mark before its moment, element counts bounded). Then it sweeps
// every setting at many widths (at rest and at moments of the play), every experiment asking, playing and revealed,
// runs the no-answer sweep with motion off and on and proves it catches a leak planted on every flag of the hiding map,
// checks the load-time stage against every answer and every sentence the page can print, and prints the stage
// heights per width.
// Usage: node shoot.cjs [--no-sweep] [--sweep-only] [--only=state,state] [--widths=1280,390]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/var/tmp/r42g/node_modules/playwright');

const DIR = __dirname;
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const STATES = opt('only')?.split(',') ?? [
  'default',
  'shield',
  'many',
  'few',
  'short',
  'long',
  'busy',
  'quiet',
  'utm',
  'ghost',
  'playing:0.3',
  'playing:0.7',
  'describe',
  'reduced',
  ...[1, 2, 3, 4, 5].map((k) => `ask:${k}`),
  ...[1, 2, 3, 4, 5].map((k) => `play:${k}`),
  ...[1, 2, 3, 4, 5].map((k) => `reveal:${k}`),
  'challenge-start',
  'challenge',
];
const query = (state) => {
  if (state === 'challenge-start') return 'state=challenge&start=1';
  const [name, a] = state.split(':');
  if (name === 'playing') return `state=playing&frac=${a}`;
  if (name === 'play') return `state=ask&exp=${a}&phase=playing&frac=0.6`;
  return `state=${name}${a ? `&exp=${a}` : ''}`;
};
const file = (state) => state.replace(/[:.]/g, '');
const WIDTHS = opt('widths')?.split(',').map(Number) ?? [1280, 390, 320];
const THEMES = ['light', 'dark'];
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(DIR) || !fs.existsSync(f)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/mockup.html`;
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  fs.mkdirSync(path.join(DIR, 'shots'), { recursive: true });
  let total = 0;
  const agg = new Map();
  const errors = [];
  const open = async (width, q) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', (e) => errors.push(`${q}: ${e.message}`));
    await page.goto(`${base}?${q}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    return page;
  };
  if (!args.includes('--sweep-only')) {
    for (const theme of THEMES)
      for (const width of WIDTHS)
        for (const state of STATES) {
          const q = `${query(state)}&theme=${theme}`;
          const page = await open(width, q);
          const issues = await page.evaluate(() => window.__collisions);
          const stage = await page.evaluate(() => window.__stage);
          await page.screenshot({ path: path.join(DIR, 'shots', `${file(state)}-${width}-${theme}.png`), fullPage: true });
          for (const i of issues) agg.set(i.replace(/[\d.]+ px/g, 'N px'), (agg.get(i.replace(/[\d.]+ px/g, 'N px')) ?? 0) + 1);
          if (issues.length) console.log(`${state} ${width} ${theme} (stage ${stage.W}x${stage.H}): ${issues.length}\n  ${issues.slice(0, 12).join('\n  ')}`);
          total += issues.length;
          await page.close();
        }
    console.log(`screenshots: ${total} collisions`);
    for (const [k, n] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n} × ${k}`);
  }
  if (!args.includes('--no-sweep')) {
    // HTML line breaks at phone widths, and the travel fill's contrast in both themes.
    const lineIssues = [];
    for (const w of [320, 360, 390, 412, 1280])
      for (const q of ['state=default', 'state=challenge', 'state=challenge&start=1', ...[1, 2, 3, 4, 5].flatMap((k) => [`state=ask&exp=${k}`, `state=reveal&exp=${k}`]), 'state=reduced']) {
        const p = await open(w, q);
        for (const i of await p.evaluate(() => window.htmlLines())) lineIssues.push(`${w} ${q}: ${i}`);
        await p.close();
      }
    console.log(`html lines: ${lineIssues.length} issues`);
    [...new Set(lineIssues)].slice(0, 30).forEach((i) => console.log('  ' + i));
    for (const theme of THEMES) {
      const p = await open(1280, `state=shield&theme=${theme}`);
      console.log(`travel fill contrast (${theme}): ${(await p.evaluate(() => window.travelContrast())).toFixed(2)}:1`);
      await p.close();
    }
    const page = await open(1280, 'state=default');
    const stageWidths = [248, 254, 288, 296, 310, 324, 346, 360, 420, 480, 560, 620, 700, 760];
    const s1 = await page.evaluate((w) => window.sweep(w, [null, 0.35, 0.8]), stageWidths);
    console.log(`sweep (192 settings × ${stageWidths.length} widths × 3 moments): ${s1.count} issues`);
    s1.issues.slice(0, 30).forEach((i) => console.log('  ' + i));
    console.log('  heights', JSON.stringify(s1.heights));
    const s2 = await page.evaluate((w) => window.sweepExperiments(w), stageWidths);
    console.log(`experiments: ${s2.count} issues`);
    s2.issues.slice(0, 30).forEach((i) => console.log('  ' + i));
    const na = await page.evaluate((w) => window.noAnswer(w), [254, 324, 620]);
    console.log(`no-answer sweep: ${na.length} leaks`);
    na.slice(0, 30).forEach((i) => console.log('  ' + i));
    const pl = await page.evaluate((w) => window.plantedLeaks(w), 324);
    console.log(`planted leaks: ${pl.join(', ')}`);
    const rl = await page.evaluate((w) => window.restLeaks(w), 324);
    console.log(`load-time stage: ${rl.length ? rl.join('; ') : 'no answer printed'}`);
    const pw = await page.evaluate(() => window.pageWords());
    console.log(`page words: ${pw.length} issues`);
    pw.forEach((i) => console.log('  ' + i));
    const hs = await page.evaluate(() => window.heights([254, 324, 346, 620]));
    console.log('stage heights (every setting and phase):', JSON.stringify(hs));
    console.log(`largest SVG: ${await page.evaluate(() => window.__maxElements)} elements`);
    await page.close();
    // Whole-widget heights per host width, for widget-heights.ts.
    const whole = {};
    for (const w of [300, 320, 360, 375, 390, 412, 430, 600, 800, 1000, 1280]) {
      const p = await open(w, 'state=default');
      whole[w] = await p.evaluate(() => document.getElementById('widget').getBoundingClientRect().height);
      await p.close();
    }
    console.log('widget heights at rest:', JSON.stringify(whole));
  }
  if (errors.length) console.log(`page errors:\n  ${[...new Set(errors)].join('\n  ')}`);
  await browser.close();
  server.close();
})();
