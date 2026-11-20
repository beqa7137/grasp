// Renders mockup.html in every state at 1280, 390 and 320 px in both themes, saves full-page screenshots to shots/,
// prints the page's own collision report (text on text, labels closer than 6 px, lines through text, marks under
// text, text or marks off the stage, dots on dots, hit boxes on hit boxes or under 44 px, x ticks closer than 6 px,
// text against a focus outline, two focus outlines closer than 6 px, labels and focus tags with no place) and the
// layout spec's assertions (false claims, bars as long as their numbers, pips and rows as counted, dashes only while
// a question hides, ghosts said in words, element counts), then sweeps the stage over every setting at many widths
// (at rest, at moments of both plays, and after a change, with its ghost), every experiment asking, playing and
// revealed (and proves the outline rule on two outlines that touch), runs the no-answer sweep (each
// question entered from other settings, its answer's play at five moments, over the stage, its accessible names, the
// notice, the summary and the play's story), proves the sweep catches a leak planted on every flag of the hiding map,
// runs the false-claim and prose rules over every sentence of every setting, and prints the stage heights per width.
// A state is a name ("read"), a play ("playing:btree:0.7", "playing:lsm:0.5:1:0" = engine, clock, op, bloom), a
// question asking, playing or revealed ("ask:3", "play:3", "reveal:1"), or the challenge ("challenge",
// "challenge-start").
// Usage: node shoot.cjs [--no-sweep] [--sweep-only] [--only=state,state] [--widths=1280,390] [--words]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/var/tmp/r41j/node_modules/playwright');

const DIR = __dirname;
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const STATES = opt('only')?.split(',') ?? [
  'default',
  'read',
  'bigpage',
  'bigrecord',
  'nobloom',
  'tall',
  'small',
  'playing:btree:0.3',
  'playing:btree:0.75',
  'playing:lsm:0.55',
  'playing:lsm:0.5:1:0',
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
  const [name, a, b, c, d] = state.split(':');
  if (name === 'playing') return `state=playing&engine=${a}&frac=${b}${c ? `&op=${c}` : ''}${d ? `&bloom=${d}` : ''}`;
  if (name === 'play') return `state=ask&exp=${a}&phase=playing`;
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
        const { issues, stage, overflow, widget } = await page.evaluate(() => ({
          // The off-stage controls' words stay inside their box, on one line ("1,000 GB" at a 320 px phone).
          issues: [
            ...window.__collisions,
            ...[...document.querySelectorAll('.controls .segment span')]
              .filter((s) => {
                const r = document.createRange();
                r.selectNodeContents(s);
                return s.scrollWidth > s.clientWidth + 1 || r.getClientRects().length > 1;
              })
              .map((s) => `an off-stage control's words wrap or overflow: ${s.textContent}`),
          ],
          stage: window.__stage,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          widget: Math.round(window.widgetHeight()),
        }));
        await page.screenshot({ path: path.join(DIR, 'shots', `${file(state)}-${width}-${theme}.png`), fullPage: true });
        const all = [...issues, ...(overflow ? ['the page scrolls sideways'] : [])];
        total += all.length;
        console.log(`${state.padEnd(20)} ${String(width).padStart(4)} ${theme.padEnd(5)} stage ${stage.W}x${stage.H} widget ${widget}  ${all.length ? `${all.length} collisions` : 'clean'}`);
        for (const i of all.slice(0, 8)) console.log(`    ${i}`);
      }
      await page.close();
    }
  if (!args.includes('--no-sweep')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e) => errors.push(`sweep: ${e.message}`));
    await page.goto(`${base}?state=default`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
    const sweepWidths = [248, 252, 270, 300, 322, 344, 360, 400, 460, 499, 500, 560, 620, 700];
    const exp = await page.evaluate((w) => window.sweepExperiments(w), sweepWidths);
    console.log(`\nexperiments, asking, the answer's play at four moments and revealed, the challenge met and at its start: ${exp.renders} renders, ${exp.failures.length} with findings`);
    for (const f of exp.failures.slice(0, 12)) console.log(`    W${f.W} E${f.exp} ${f.phase}: ${f.out.join(' | ')}`);
    total += exp.failures.length;
    const touching = await page.evaluate((w) => window.touchingOutlines(w), sweepWidths);
    console.log(`two focus outlines that touch (E2's reveal pointed at the stack and its staircase apart) caught at ${touching.caught} of ${touching.of} widths`);
    if (touching.caught !== touching.of) total++;
    const giveaways = await page.evaluate((w) => window.noAnswer(w), sweepWidths);
    console.log(`no-answer sweep, every question asking (entered afresh and from eight other settings) and its answer's play at five moments: ${giveaways.renders} renders, ${giveaways.out.length} giveaways`);
    for (const g of giveaways.out.slice(0, 12)) console.log(`    ${g}`);
    total += giveaways.out.length;
    const planted = await page.evaluate(() => window.plantedLeaks(322));
    const names = Object.keys(planted);
    console.log(`planted leaks caught: ${names.filter((n) => planted[n]).length} of ${names.length}`);
    for (const n of names.filter((n) => !planted[n])) console.log(`    NOT CAUGHT (or the clean view is not clean): ${n}`);
    if (!names.every((n) => planted[n]) || names.length !== 13) total++;
    const rest = await page.evaluate((w) => window.restLeaks(w), sweepWidths);
    console.log(`the default stage at load (either operation, at rest, 14 widths) against every question's asked quantity (${rest.asked.join(', ')}): ${rest.out.length} found`);
    for (const r of rest.out.slice(0, 8)) console.log(`    ${r}`);
    total += rest.out.length;
    const words = await page.evaluate(() => window.pageWords());
    console.log(`page sentences (summary, notice, both plays' stories, Describe, goal checks) over every setting: ${words.length} findings`);
    for (const w of words.slice(0, 8)) console.log(`    ${w}`);
    total += words.length;
    const count = await page.evaluate(() => window.ALL_SETTINGS.length);
    const all = Array.from({ length: count }, (_, i) => i);
    // Every setting at the phone and desktop widths, with a ghost; every setting at moments of both plays at a phone
    // width; strides elsewhere.
    const plan = [
      [252, all, [null], true],
      [322, all, [null, 0.3, 0.8], true],
      [620, all, [null, 0.6], true],
      ...[248, 270, 300, 344, 360, 400, 460, 499, 500, 560, 700].map((w) => [w, all.filter((i) => i % 5 === w % 5), [null, 0.5], true]),
    ];
    const res = { renders: 0, failures: [] };
    for (const [w, idx, fracs, ghosts] of plan)
      for (let i = 0; i < idx.length; i += 48) {
        const part = await page.evaluate(([w, ids, fracs, ghosts]) => window.sweep([w], ids.map((k) => window.ALL_SETTINGS[k]), fracs, ghosts), [w, idx.slice(i, i + 48), fracs, ghosts]);
        res.renders += part.renders;
        res.failures.push(...part.failures);
      }
    console.log(`settings sweep: ${count} settings = ${res.renders} renders, ${res.failures.length} with findings`);
    const byKind = {};
    for (const f of res.failures)
      for (const o of f.out) {
        const k = o.replace(/"[^"]*"/g, '"…"').replace(/\d+(\.\d+)?/g, '#');
        byKind[k] ??= { n: 0, eg: `W${f.W} ${f.s}: ${o}` };
        byKind[k].n++;
      }
    for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].n - a[1].n).slice(0, 16)) console.log(`    ${v.n} x ${k}   e.g. ${v.eg}`);
    total += res.failures.length;
    const heights = await page.evaluate(() => window.heights([248, 252, 270, 300, 322, 344, 360, 400, 460, 499, 500, 560, 620, 700]));
    console.log('stage heights by width (each should be one value):', JSON.stringify(heights));
    for (const hs of Object.values(heights)) if (hs.length !== 1) total++;
    console.log(`most SVG elements in any render: ${await page.evaluate(() => window.__maxElements)}`);
    // Describe fits its box (or scrolls inside it, never the page) at the house widths.
    for (const width of [320, 360, 390, 412, 1280, 1440]) {
      const p = await browser.newPage({ viewport: { width, height: 900 } });
      await p.goto(`${base}?state=describe`);
      await p.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
      const d = await p.evaluate(() => {
        const box = document.querySelector('.table-box');
        const split = [...box.querySelectorAll('.nb')].filter((n) => n.getClientRects().length > 1).map((n) => n.textContent);
        return { page: document.documentElement.scrollWidth > window.innerWidth, table: box.scrollWidth > box.clientWidth + 1, compact: box.classList.contains('compact'), split };
      });
      if (d.split.length) console.log(`    a number parted from its unit: ${d.split.join(', ')}`);
      total += d.split.length;
      console.log(`Describe at ${width}: ${d.compact ? 'compact' : 'full'}, ${d.table ? 'scrolls inside its box' : 'fits its box'}${d.page ? ', THE PAGE SCROLLS SIDEWAYS' : ''}`);
      if (d.page || d.table) total++;
      await p.close();
    }
    if (args.includes('--words')) {
      const w = await page.evaluate(() => [window.ALL_SETTINGS[0], { data: 100, record: 100, page: 4, ratio: 10, bloom: 1, op: 0 }, { data: 1000, record: 1000, page: 16, ratio: 4, bloom: 0, op: 1 }].map((s) => window.wordsOf(s)));
      console.log(JSON.stringify(w, null, 1));
    }
    await page.close();
  }
  await browser.close();
  server.close();
  for (const e of errors) console.log(`PAGE ERROR ${e}`);
  console.log(total || errors.length ? `\n${total} collision reports, ${errors.length} page errors` : '\nzero collisions');
  process.exit(total || errors.length ? 1 : 0);
})();
