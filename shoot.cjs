// Renders mockup.html in every state at 1280, 390 and 320 px in both themes, saves full-page screenshots to shots/,
// prints the page's own collision report (text on text, lines and marks through text, off-stage text, hit boxes on hit
// boxes, focus tags with no place), then sweeps the stage over settings, experiments and widths.
// Usage: node shoot.cjs [--no-sweep] [--only=state,state] [--widths=1280,390]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/var/tmp/r41b/node_modules/playwright');

const DIR = __dirname;
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const STATES = opt('only')?.split(',') ?? ['default', 'stale', 'down', 'refused', 'timeout', 'sloppy', 'slow', 'ask', 'reveal', 'challenge'];
const WIDTHS = opt('widths')?.split(',').map(Number) ?? [1280, 390, 320];
const THEMES = ['light', 'dark'];
const EXECUTABLE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.join(DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(DIR) || !fs.existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
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
        await page.goto(`${base}?state=${state}&theme=${theme}`);
        await page.waitForSelector('body[data-ready="1"]', { timeout: 10000 });
        const { issues, stage } = await page.evaluate(() => ({ issues: window.__collisions, stage: window.__stage }));
        await page.screenshot({ path: path.join(DIR, 'shots', `${state}-${width}-${theme}.png`), fullPage: true });
        total += issues.length;
        const line = `${state.padEnd(10)} ${String(width).padStart(4)} ${theme.padEnd(5)} stage ${stage.W}x${stage.H}  ${issues.length ? `${issues.length} collisions` : 'clean'}`;
        console.log(line);
        for (const i of issues.slice(0, 8)) console.log(`    ${i}`);
      }
      await page.close();
    }
  if (!args.includes('--no-sweep')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e) => errors.push(`sweep: ${e.message}`));
    await page.goto(`${base}?state=default`);
    await page.waitForSelector('body[data-ready="1"]');
    const sweepWidths = [252, 270, 300, 322, 360, 400, 460, 520, 560, 620, 700];
    const exp = await page.evaluate((w) => window.sweepExperiments(w), sweepWidths);
    console.log(`\nexperiments, asking and revealed: ${exp.renders} renders, ${exp.failures.length} with collisions`);
    for (const f of exp.failures.slice(0, 12)) console.log(`    W${f.W} E${f.exp} ${f.phase}: ${f.out.join(' | ')}`);
    total += exp.failures.length;
    const settings = await page.evaluate(() => {
      const M = window.QuorumModel;
      const out = [];
      const lists = (n) => {
        const res = [];
        const walk = (acc) => (acc.length === n ? res.push(acc) : M.STATES.forEach((s) => walk([...acc, s])));
        walk([]);
        return res;
      };
      let k = 0;
      for (const n of [3, 5])
        for (let w = 1; w <= n; w++)
          for (let r = 1; r <= n; r++)
            for (const states of lists(n))
              for (const stall of [0, 1])
                for (const sloppy of [0, 1]) {
                  k++;
                  // Every N 3 setting; every 41st N 5 setting (a stride prime to 4, so it walks every W, R and state mix).
                  if (n === 3 || k % 41 === 0) out.push({ n, w, r, states, stall, sloppy });
                }
      return out;
    });
    // Every N 3 setting at the narrowest phone and the desktop stage; the N 5 sample at two phone widths too.
    const plan = [
      [252, settings],
      [620, settings.filter((x) => x.n === 3)],
      [322, settings.filter((x) => x.n === 5)],
      [400, settings.filter((x) => x.n === 5)],
    ];
    const res = { renders: 0, failures: [] };
    for (const [w, list] of plan)
      for (let i = 0; i < list.length; i += 400) {
        const part = await page.evaluate(([w, s]) => window.sweep([w], s), [w, list.slice(i, i + 400)]);
        res.renders += part.renders;
        res.failures.push(...part.failures);
      }
    console.log(`settings sweep: ${settings.length} settings over ${plan.map(([w, l]) => `${l.length} at ${w}`).join(', ')} = ${res.renders} renders, ${res.failures.length} with collisions`);
    const byKind = {};
    for (const f of res.failures) for (const o of f.out) byKind[o.replace(/"[^"]*"/g, '"…"').replace(/R\d|H\d/g, 'R?')] = (byKind[o.replace(/"[^"]*"/g, '"…"').replace(/R\d|H\d/g, 'R?')] ?? 0) + 1;
    for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${v} x ${k}`);
    for (const f of res.failures.slice(0, 8)) console.log(`    W${f.W} ${f.s}: ${f.out.join(' | ')}`);
    total += res.failures.length;
    const heights = await page.evaluate(() => window.heights([252, 322, 400, 520, 620, 700]));
    console.log('stage heights by width and N (each should be one value):', JSON.stringify(heights));
    await page.close();
  }
  await browser.close();
  server.close();
  for (const e of errors) console.log(`PAGE ERROR ${e}`);
  console.log(total || errors.length ? `\n${total} collision reports, ${errors.length} page errors` : '\nzero collisions');
  process.exit(total || errors.length ? 1 : 0);
})();
