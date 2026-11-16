// Renders mockup.html in every state at 1280, 390 and 320 px in both themes, saves full-page screenshots to shots/,
// prints the page's own collision report (text on text, lines through text, marks under text, off-stage text, dots on
// dots, hit boxes on hit boxes, labels and focus tags with no place), then sweeps the stage over every setting at many
// widths (at rest and mid-play), every experiment asking, playing and revealed, runs the no-answer sweep, proves it
// catches two planted leaks, and prints the stage heights per width (each must be one value).
// A state is a name ("busy"), a question asking, playing or revealed ("ask:3", "play:3", "reveal:1"), or the challenge
// ("challenge", "challenge-start").
// Usage: node shoot.cjs [--no-sweep] [--sweep-only] [--only=state,state] [--widths=1280,390]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/var/tmp/r41c/node_modules/playwright');

const DIR = __dirname;
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const STATES = opt('only')?.split(',') ?? [
  'default',
  'quiet',
  'busy',
  'split',
  'pool',
  'steady',
  'down',
  'overload',
  'playing',
  'describe',
  ...[1, 2, 3, 4, 5].map((k) => `ask:${k}`),
  ...[1, 2, 3, 4, 5].map((k) => `play:${k}`),
  ...[1, 2, 3, 4, 5].map((k) => `reveal:${k}`),
  'challenge',
  'challenge-start',
];
const query = (state) => {
  if (state === 'challenge-start') return 'state=challenge&start=1';
  const [name, exp] = state.split(':');
  if (name === 'play') return `state=ask&exp=${exp}&phase=playing`;
  return `state=${name}${exp ? `&exp=${exp}` : ''}`;
};
const file = (state) => state.replace(':', '');
const WIDTHS = opt('widths')?.split(',').map(Number) ?? [1280, 390, 320];
const THEMES = ['light', 'dark'];
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(DIR) || !fs.existsSync(f)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}/mockup.html`;
  fs.mkdirSync(path.join(DIR, 'shots'), { recursive: true });
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  let total = 0;
  const errors = [];
  const shots = !args.includes('--sweep-only');
  for (const theme of shots ? THEMES : [])
    for (const width of WIDTHS) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: width < 600 ? 2 : 1 });
      page.on('pageerror', (e) => errors.push(`${theme} ${width}: ${e.message}`));
      for (const state of STATES) {
        await page.goto(`${base}?${query(state)}&theme=${theme}`);
        await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
        const { issues, stage, overflow } = await page.evaluate(() => ({
          issues: window.__collisions,
          stage: window.__stage,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        }));
        await page.screenshot({ path: path.join(DIR, 'shots', `${file(state)}-${width}-${theme}.png`), fullPage: true });
        const all = [...issues, ...(overflow ? ['the page scrolls sideways'] : [])];
        total += all.length;
        console.log(`${state.padEnd(16)} ${String(width).padStart(4)} ${theme.padEnd(5)} stage ${stage.W}x${stage.H}  ${all.length ? `${all.length} collisions` : 'clean'}`);
        for (const i of all.slice(0, 8)) console.log(`    ${i}`);
      }
      await page.close();
    }
  if (!args.includes('--no-sweep')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e) => errors.push(`sweep: ${e.message}`));
    await page.goto(`${base}?state=default`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
    const sweepWidths = [252, 270, 300, 322, 360, 400, 460, 520, 560, 620, 700];
    const exp = await page.evaluate((w) => window.sweepExperiments(w), sweepWidths);
    console.log(`\nexperiments, asking, playing and revealed (the challenge met and at its start): ${exp.renders} renders, ${exp.failures.length} with collisions`);
    for (const f of exp.failures.slice(0, 12)) console.log(`    W${f.W} E${f.exp} ${f.phase}: ${f.out.join(' | ')}`);
    total += exp.failures.length;
    const giveaways = await page.evaluate((w) => window.noAnswer(w), sweepWidths);
    console.log(`no-answer sweep, every question asking and its answer's play at five moments: ${giveaways.renders} renders, ${giveaways.out.length} giveaways`);
    for (const g of giveaways.out.slice(0, 12)) console.log(`    ${g}`);
    total += giveaways.out.length;
    const planted = await page.evaluate(() => window.plantedLeaks(322));
    console.log(`planted leaks caught: ${planted.filter(Boolean).length} of ${planted.length}`);
    if (!planted.every(Boolean)) total++;
    const count = await page.evaluate(() => window.ALL_SETTINGS.length);
    const all = Array.from({ length: count }, (_, i) => i);
    // Every setting at the phone and desktop widths; every setting mid-play at a phone width; strides elsewhere.
    const plan = [
      [252, all, [null]],
      [322, all, [null, 140]],
      [620, all, [null]],
      ...[270, 300, 360, 400, 460, 520, 560, 700].map((w) => [w, all.filter((i) => i % 5 === w % 5), [null]]),
    ];
    const res = { renders: 0, failures: [] };
    for (const [w, idx, taus] of plan)
      for (let i = 0; i < idx.length; i += 60) {
        const part = await page.evaluate(([w, ids, taus]) => window.sweep([w], ids.map((k) => window.ALL_SETTINGS[k]), taus), [w, idx.slice(i, i + 60), taus]);
        res.renders += part.renders;
        res.failures.push(...part.failures);
      }
    console.log(`settings sweep: ${count} settings over ${plan.map(([w, l, t]) => `${l.length * t.length} at ${w}`).join(', ')} = ${res.renders} renders, ${res.failures.length} with collisions`);
    const byKind = {};
    for (const f of res.failures)
      for (const o of f.out) {
        const k = o.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, '#');
        byKind[k] ??= { n: 0, eg: `W${f.W} ${f.s}: ${o}` };
        byKind[k].n++;
      }
    for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].n - a[1].n).slice(0, 14)) console.log(`    ${v.n} x ${k}   e.g. ${v.eg}`);
    for (const f of res.failures.slice(0, 10)) console.log(`    W${f.W} ${f.s}: ${f.out.join(' | ')}`);
    total += res.failures.length;
    const heights = await page.evaluate(() => window.heights([252, 300, 322, 360, 400, 460, 520, 560, 620, 700]));
    console.log('stage heights by width (each should be one value):', JSON.stringify(heights));
    for (const [w, hs] of Object.entries(heights)) if (hs.length !== 1) total++;
    await page.close();
  }
  await browser.close();
  server.close();
  for (const e of errors) console.log(`PAGE ERROR ${e}`);
  console.log(total || errors.length ? `\n${total} collision reports, ${errors.length} page errors` : '\nzero collisions');
  process.exit(total || errors.length ? 1 : 0);
})();
