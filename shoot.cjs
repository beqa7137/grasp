// Renders mockup.html in every state at 1280, 390 and 320 px in both themes, saves full-page screenshots to shots/,
// prints the page's own collision report (text on text, lines through text, marks under text, off-stage text, dots on
// dots, text in the stream's path, hit boxes on hit boxes or on text, axis labels closer than 6 px, text against a focus
// outline's stroke, labels and focus tags with no place) and the layout spec's assertions (false claims, Little's law
// as printed, every lane ending at its limit, every shed block ending where the stream above it does, the served bar,
// captions within their reserved lines, red particles only where a tier sheds), then sweeps the stage over every
// setting at many widths (at rest, mid-ramp with particles, and with a ghost), every experiment asking, playing and
// revealed (with a Look here tag and a labelled ghost for every moved limit at every reveal), runs the no-answer sweep,
// proves it catches six planted leaks, proves every new layout and word rule catches its own planted fault, runs the
// false-claim and grammar rules over every page sentence, checks where the one-column layout brings the stage for each
// play and reveal (and shoots that phone view), that no condition moves the stage, that Describe's table fits at
// phone widths, and prints the stage heights per width (each must be one value). A state is a name ("cached"), a
// question asking, playing or revealed ("ask:3", "play:3", "reveal:1"), or the challenge ("challenge",
// "challenge-start").
// Usage: node shoot.cjs [--no-sweep] [--sweep-only] [--no-settings] [--only=state,state] [--widths=1280,390] [--stride=n]
// (--no-settings skips the long settings sweep and the heights, keeping every other sweep and check.)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/var/tmp/r41d/node_modules/playwright');

const DIR = __dirname;
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const STATES = opt('only')?.split(',') ?? [
  'default',
  'calm',
  'cached',
  'replicas',
  'scaled',
  'zone',
  'slow',
  'overload',
  'outage',
  'playing',
  'describe',
  'reduced',
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
const STRIDE = Number(opt('stride') ?? 11);
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
    const sweepWidths = [252, 270, 300, 322, 344, 360, 400, 460, 520, 560, 620, 700];
    const exp = await page.evaluate((w) => window.sweepExperiments(w), sweepWidths);
    console.log(`\nexperiments asking, the answer's play at three moments and revealed, the challenge met and at its start: ${exp.renders} renders, ${exp.failures.length} with findings`);
    for (const f of exp.failures.slice(0, 12)) console.log(`    W${f.W} E${f.exp} ${f.phase}: ${f.out.join(' | ')}`);
    total += exp.failures.length;
    const giveaways = await page.evaluate((w) => window.noAnswer(w), [252, 322, 400, 520, 620, 700]);
    console.log(`no-answer sweep, every question asking (entered from every act's setting and the challenge's solution) and its answer's play at five moments: ${giveaways.renders} renders, ${giveaways.out.length} giveaways`);
    for (const g of giveaways.out.slice(0, 12)) console.log(`    ${g}`);
    total += giveaways.out.length;
    const planted = await page.evaluate(() => window.plantedLeaks(322));
    console.log(`planted leaks caught: ${planted.filter((p) => p[1]).length} of ${planted.length}`);
    for (const [name, ok] of planted) if (!ok) console.log(`    missed: ${name}`);
    if (!planted.every((p) => p[1]) || planted.length !== 6) total++;
    const faults = await page.evaluate(() => window.plantedFaults(252));
    console.log(`planted faults caught by their rules: ${faults.filter((f) => f[1]).length} of ${faults.length}`);
    for (const [name, ok, eg] of faults) console.log(`    ${ok ? 'caught' : 'MISSED'} ${name}${eg ? `: ${eg}` : ''}`);
    if (!faults.every((f) => f[1])) total++;
    const anchors = await page.evaluate(() => window.anchorFit([252, 322]));
    const off = anchors.filter((a) => a.missing.length);
    console.log(`phone views at the play's and the reveal's anchor (650 px, 56 of them the header): ${anchors.length - off.length} of ${anchors.length} hold what they must show`);
    for (const a of off) console.log(`    W${a.W} ${a.exp} ${a.phase} (${a.from} to ${a.to}): ${a.missing.join(', ')}`);
    total += off.length;
    const words = await page.evaluate(() => window.pageWords(3));
    console.log(`page sentences (summary, ramp story, Describe both ways, goal checks) over a third of every setting: ${words.length} findings`);
    for (const w of words.slice(0, 8)) console.log(`    ${w}`);
    total += words.length;
    if (args.includes('--no-settings')) {
      await page.close();
    } else {
    const count = await page.evaluate(() => window.ALL_SETTINGS.length);
    const all = Array.from({ length: count }, (_, i) => i);
    // A stride of every setting at the phone and desktop widths (at rest, mid-ramp and with a ghost), sparser elsewhere.
    const plan = [
      [252, all.filter((i) => i % STRIDE === 0), ['rest', 'ramp', 'reduced']],
      [322, all.filter((i) => i % STRIDE === 1), ['rest', 'ramp', 'ghost']],
      [620, all.filter((i) => i % STRIDE === 2), ['rest', 'ramp', 'ghost']],
      ...[270, 300, 344, 360, 400, 460, 520, 560, 700].map((w) => [w, all.filter((i) => i % (STRIDE * 5) === w % (STRIDE * 5)), ['rest']]),
    ];
    const res = { renders: 0, failures: [] };
    for (const [w, idx, modes] of plan)
      for (let i = 0; i < idx.length; i += 60) {
        const part = await page.evaluate(([w, ids, modes]) => window.sweep([w], ids.map((k) => window.ALL_SETTINGS[k]), modes), [w, idx.slice(i, i + 60), modes]);
        res.renders += part.renders;
        res.failures.push(...part.failures);
      }
    console.log(`settings sweep: ${count} settings, ${res.renders} renders, ${res.failures.length} with findings`);
    const byKind = {};
    for (const f of res.failures)
      for (const o of f.out) {
        const k = o.replace(/"[^"]*"/g, '"…"').replace(/\d+(\.\d+)?/g, '#');
        byKind[k] ??= { n: 0, eg: `W${f.W} ${f.s}: ${o}` };
        byKind[k].n++;
      }
    for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].n - a[1].n).slice(0, 16)) console.log(`    ${v.n} x ${k}   e.g. ${v.eg}`);
    total += res.failures.length;
    const heights = await page.evaluate(() => window.heights([252, 270, 300, 322, 344, 360, 400, 460, 520, 560, 620, 700]));
    console.log('stage heights by width (each should be one value):', JSON.stringify(heights));
    for (const hs of Object.values(heights)) if (hs.length !== 1) total++;
    await page.close();
    }
  }
  // Page-level checks at phone widths: no condition moves the stage, Describe's table fits, and the phone view of every
  // play and reveal at its anchor.
  if (!args.includes('--no-sweep')) {
    for (const width of [320, 390, 412]) {
      const page = await browser.newPage({ viewport: { width, height: 650 }, deviceScaleFactor: 2 });
      page.on('pageerror', (e) => errors.push(`page ${width}: ${e.message}`));
      await page.goto(`${base}?state=default&theme=dark`);
      await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
      const tops = await page.evaluate(() => window.conditionTops());
      const fits = await page.evaluate(() => window.describeFits());
      console.log(`page ${width}: the stage's top over the eight condition settings ${JSON.stringify(tops)}; Describe's table ${fits ? 'fits' : 'scrolls'}`);
      if (tops.length !== 1) total++;
      if (!fits) total++;
      await page.close();
    }
    for (const theme of THEMES) {
      const page = await browser.newPage({ viewport: { width: 390, height: 650 }, deviceScaleFactor: 2 });
      for (const k of [1, 2, 3, 4, 5])
        for (const phase of ['play', 'reveal']) {
          await page.goto(`${base}?${phase === 'play' ? `state=ask&exp=${k}&phase=playing&frac=0.95` : `state=reveal&exp=${k}`}&theme=${theme}`);
          await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
          const y = await page.evaluate(() => window.anchorScroll());
          await page.evaluate((y) => window.scrollTo(0, y), y);
          await page.screenshot({ path: path.join(DIR, 'shots', `view-${phase}${k}-390-${theme}.png`) });
        }
      await page.close();
    }
  }
  await browser.close();
  server.close();
  for (const e of errors) console.log(`PAGE ERROR ${e}`);
  console.log(total || errors.length ? `\n${total} collision reports, ${errors.length} page errors` : '\nzero collisions');
  process.exit(total || errors.length ? 1 : 0);
})();
