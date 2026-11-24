// Renders mockup.html in every state at 1280, 390 and 320 px in both themes, saves full-page screenshots to shots/,
// prints the page's own collision report (text on text, labels closer than 6 px, lines through text, marks under
// text, text or marks off the stage, dots on dots, hit boxes on hit boxes or under 44 px, x ticks closer than 6 px,
// text against a focus outline, two focus outlines closer than 6 px, labels and tags with no place) and the layout
// spec's assertions (false claims, rings at their losses, bars at their times, ledgers that add up, dashes only while a
// question hides, ghosts said in words, element counts), then sweeps every setting at many widths (at rest, at moments
// of the play, after a change with its ghost), every experiment asking, playing and revealed (and proves the outline
// rule on two outlines that touch), runs the no-answer sweep (each question entered from other settings, its answer's
// play at seven moments, over the stage, its accessible names, the notice, the summary, the note and the play's step),
// proves the sweep catches a leak planted on every flag of the hiding map, checks the load-time stage against every
// asked answer, runs the false-claim and prose rules over every sentence of every setting, measures Describe in its
// box, and prints the stage heights per width.
// A state is a name ("drop"), a play ("playing:0.3", "playing:0.7:1" = clock, disaster), a question asking, playing
// or revealed ("ask:3", "play:3", "play:3:0.3", "reveal:1"), or the challenge ("challenge", "challenge-start").
// Usage: node shoot.cjs [--no-sweep] [--sweep-only] [--only=state,state] [--widths=1280,390]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/var/tmp/r42e/node_modules/playwright');

const DIR = __dirname;
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const STATES = opt('only')?.split(',') ?? [
  'default',
  'drop',
  'big',
  'frequent',
  'small',
  'playing:0.12',
  'playing:0.36',
  'playing:0.7',
  'playing:0.7:1',
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
  const [name, a, b] = state.split(':');
  if (name === 'playing') return `state=playing&frac=${a}${b ? `&disaster=${b}` : ''}`;
  if (name === 'play') return `state=ask&exp=${a}&phase=playing&frac=${b ?? 0.7}`;
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
const group = (failures, key) => {
  const kinds = {};
  for (const f of failures)
    for (const o of f.out) {
      const k = o.replace(/\d+(\.\d+)?/g, '#');
      kinds[k] ??= { n: 0, eg: `${key(f)}: ${o}` };
      kinds[k].n++;
    }
  return Object.values(kinds).sort((a, b) => b.n - a.n);
};

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
        const shotPath = path.join(DIR, 'shots', `${file(state)}-${width}-${theme}.png`);
        await page.screenshot({ path: shotPath, fullPage: true }).catch(() => page.screenshot({ path: shotPath, fullPage: true }));
        const all = [...issues, ...(overflow ? ['the page scrolls sideways'] : [])];
        total += all.length;
        console.log(`${state.padEnd(16)} ${String(width).padStart(4)} ${theme.padEnd(5)} stage ${stage.W}x${stage.H} widget ${widget}  ${all.length ? `${all.length} collisions` : 'clean'}`);
        for (const i of all.slice(0, 8)) console.log(`    ${i}`);
      }
      await page.close();
    }
  if (!args.includes('--no-sweep')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e) => errors.push(`sweep: ${e.message}`));
    await page.goto(`${base}?state=default`);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
    const sweepWidths = [248, 252, 270, 300, 322, 344, 360, 400, 460, 499, 520, 560, 620, 700];
    const exp = await page.evaluate((w) => window.sweepExperiments(w), sweepWidths);
    console.log(`\nexperiments, asking, the answer's play at four moments and revealed, the challenge met and at its start: ${exp.renders} renders, ${exp.failures.length} with findings`);
    for (const k of group(exp.failures, (f) => `W${f.W} E${f.exp} ${f.phase}`).slice(0, 12)) console.log(`  ${k.n} x ${k.eg}`);
    total += exp.failures.length;
    const touch = await page.evaluate((w) => window.touchingOutlines(w), sweepWidths);
    console.log(`the outline rule, proven on two neighbouring rows outlined at once: caught at ${touch.caught} of ${touch.of} widths`);
    if (touch.caught !== touch.of) total++;
    const na = await page.evaluate((w) => window.noAnswer(w), sweepWidths);
    console.log(`no-answer sweep: ${na.renders} renders, ${na.out.length} giveaways`);
    for (const o of na.out.slice(0, 12)) console.log(`  ${o}`);
    total += na.out.length;
    const leaks = await page.evaluate(() => window.plantedLeaks(322));
    const missed = Object.entries(leaks).filter(([, v]) => v !== 'caught');
    console.log(`planted leaks: ${Object.keys(leaks).length - missed.length} of ${Object.keys(leaks).length} caught`);
    for (const [k, v] of missed) console.log(`  ${k}: ${v}`);
    total += missed.length;
    const rest = await page.evaluate((w) => window.restLeaks(w), sweepWidths);
    console.log(`the load-time stage against every asked answer (${rest.asked.join('; ')}): ${rest.out.length} found`);
    for (const o of rest.out.slice(0, 6)) console.log(`  ${o}`);
    total += rest.out.length;
    const words = await page.evaluate(() => window.pageWords());
    console.log(`every sentence of every setting, false claims and prose rules: ${words.length} findings`);
    for (const o of words.slice(0, 8)) console.log(`  ${o}`);
    total += words.length;
    // Every setting at four widths at rest and after a change with its ghost, and a third of them at three moments of
    // the play at the phone widths; the rest of the widths at every fourth setting.
    const full = await page.evaluate(() => window.sweep([252, 322, 344, 620], window.ALL_SETTINGS ?? undefined, [null], true));
    const plays = await page.evaluate(() => window.sweep([252, 344, 620], (window.ALL_SETTINGS_LIST ?? []).filter((_, i) => i % 3 === 0), [0.1, 0.32, 0.7], false));
    const wide = await page.evaluate(() => window.sweep([248, 270, 300, 360, 400, 460, 499, 520, 560, 700], (window.ALL_SETTINGS_LIST ?? []).filter((_, i) => i % 4 === 0), [null], false));
    for (const [what, r] of [
      ['every setting at rest and with its ghost, at 252, 322, 344 and 620 px', full],
      ['a third of the settings at three moments of the play', plays],
      ['every fourth setting at ten more widths', wide],
    ]) {
      console.log(`${what}: ${r.renders} renders, ${r.failures.length} with findings`);
      for (const k of group(r.failures, (f) => `W${f.W} ${f.s}`).slice(0, 10)) console.log(`  ${k.n} x ${k.eg}`);
      total += r.failures.length;
    }
    console.log(`most SVG elements in any render: ${await page.evaluate(() => window.__maxElements)}`);
    const hs = await page.evaluate((w) => window.heights(w), [248, 252, 270, 300, 322, 332, 344, 360, 380, 400, 460, 499, 520, 532, 560, 620, 700, 800]);
    console.log('stage heights by stage width (one value each means the height depends on the width alone):');
    for (const [w, h] of Object.entries(hs)) {
      console.log(`  ${w}: ${h.join(', ')}`);
      if (h.length !== 1) total++;
    }
    await page.close();
    // Describe in its box at four page widths: no sideways scroll of the page, the table inside its box or scrolling
    // there, compact under a 560 px stage, and no kept run on two lines.
    for (const width of [320, 412, 1280, 1440]) {
      const p = await browser.newPage({ viewport: { width, height: 900 } });
      await p.goto(`${base}?state=describe`);
      await p.waitForSelector('body[data-ready="1"]');
      const r = await p.evaluate(() => {
        const box = document.querySelector('.table-box');
        const t = box.querySelector('table');
        const nbs = [...document.querySelectorAll('.describe .nb')].filter((s) => s.getClientRects().length > 1).map((s) => s.textContent);
        return { compact: box.classList.contains('compact'), fits: t.scrollWidth <= box.clientWidth + 1, page: document.documentElement.scrollWidth > window.innerWidth, nbs };
      });
      console.log(`Describe at ${width}: ${r.compact ? 'compact' : 'full'}, ${r.fits ? 'fits its box' : 'scrolls inside its box'}${r.page ? ', THE PAGE SCROLLS SIDEWAYS' : ''}${r.nbs.length ? `, split runs: ${r.nbs.join(', ')}` : ''}`);
      if (r.page || r.nbs.length || !r.fits) total++;
      await p.close();
    }
    // The whole widget's height at the phone widths, for widget-heights.ts (a guide: the build measures its own).
    const hp = await browser.newPage({ viewport: { width: 320, height: 900 } });
    const wh = [];
    for (const width of [320, 360, 375, 390, 412, 430, 1280]) {
      await hp.setViewportSize({ width, height: 900 });
      await hp.goto(`${base}?state=default`);
      await hp.waitForSelector('body[data-ready="1"]');
      wh.push(`${width}: ${await hp.evaluate(() => window.widgetHeight())}`);
    }
    console.log(`widget heights at rest: ${wh.join(', ')}`);
    await hp.close();
  }
  await browser.close();
  server.close();
  for (const e of errors) console.log(`page error: ${e}`);
  console.log(`\n${total + errors.length} findings in all.`);
  process.exit(total + errors.length ? 1 : 0);
})();
