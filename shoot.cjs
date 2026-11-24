// Renders mockup.html in every state at 1280, 390 and 320 px in both themes, saves full-page screenshots to shots/,
// and prints the page's own collision report (text on text, labels under 6 px apart, lines and curves through text,
// marks off the stage, dots on dots, marks under text, the play button over text). Then it sweeps: every layout
// setting and every mint setting at many widths for collisions; every experiment's reveal for a visible "Look here"
// tag at every width; the no-answer sweep (each question asking and while its answer plays at several moments, with
// motion off and on), over the stage's text and structure, the summary, the notice and Describe, proven by a leak
// planted on every flag of the hiding map that it must catch; and the stage heights per width.
// Usage: node shoot.cjs [--no-shots] [--no-sweep] [--only=state,state] [--widths=1280,390]
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('/var/tmp/r42a/node_modules/playwright');

const DIR = __dirname;
const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const FREE = ['default', 'tick10', 'gen11', 'gen16', 'gen0', 'seq0', 'epoch1970', 'overflow', 'burst', 'skew', 'stepback', 'naive', 'shared', 'random64', 'trillion', 'playing', 'reduced', 'describe'];
const STATES = opt('only')?.split(',') ?? [
  ...FREE,
  ...[1, 2, 3, 4, 5].map((k) => `ask:${k}`),
  ...[1, 2, 3, 4, 5].map((k) => `play:${k}`),
  ...[1, 2, 3, 4, 5].map((k) => `reveal:${k}`),
  'challenge',
  'challenge-solved',
];
const query = (state) => {
  if (state === 'challenge-solved') return 'state=challenge&solved=1';
  const [name, a] = state.split(':');
  return `state=${name}${a ? `&exp=${a}` : ''}`;
};
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
const M = require('./model.js');

async function load(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  return page.evaluate(() => ({ report: window.__report, state: window.__state }));
}

(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}/mockup.html`;
  fs.mkdirSync(path.join(DIR, 'shots'), { recursive: true });
  let total = 0;
  const errors = [];
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  if (!args.includes('--no-shots'))
    for (const theme of THEMES)
      for (const width of WIDTHS) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: width < 600 ? 2 : 1 });
        page.on('pageerror', (e) => errors.push(`${theme} ${width}: ${e.message}`));
        for (const state of STATES) {
          const { report } = await load(page, `${base}?${query(state)}&theme=${theme}`);
          await page.screenshot({ path: path.join(DIR, 'shots', `${theme}-${width}-${state.replace(/:/g, '')}.png`), fullPage: true });
          if (report.collisions.length) {
            total += report.collisions.length;
            console.log(`${theme} ${width} ${state}: ${report.collisions.join(' | ')}`);
          }
        }
        await page.close();
      }
  if (!args.includes('--no-sweep')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (e) => errors.push(`sweep: ${e.message}`));
    const sweepWidths = [1280, 1000, 860, 700, 600, 520, 430, 412, 390, 375, 360, 340, 320, 300];
    // 1. Every layout and every mint setting at many widths.
    const settings = [];
    for (const gen of [0, 1, 2, 4, 8, 10, 11, 12, 16]) for (const seq of [0, 1, 2, 8, 10, 12, 16]) settings.push({ gen, seq });
    for (const tick of [1, 10]) for (const epoch of [0, 1]) settings.push({ tick, epoch }, { tick, epoch, gen: 16 }, { tick, epoch, seq: 16, gen: 16 });
    for (const load of [0, 1]) for (const fault of [0, 1, 2, 3]) for (const guard of [0, 1]) for (const seq of [0, 1, 10, 12]) for (const tick of [1, 10]) settings.push({ load, fault, guard, seq, tick });
    for (const bits of [64, 122]) for (let count = 3; count <= 15; count++) settings.push({ bits, count });
    let sweepHits = 0;
    let runs = 0;
    for (const w of [1280, 390, 320, 300]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const s of settings) {
        const q = Object.entries(s).map(([k, v]) => `${k}=${v}`).join('&');
        const { report } = await load(page, `${base}?state=default&${q}`);
        runs++;
        if (report.collisions.length) {
          sweepHits += report.collisions.length;
          if (sweepHits < 400) console.log(`sweep ${w} ${q}: ${report.collisions.join(' | ')}`);
        }
      }
    }
    console.log(`Setting sweep: ${runs} renders, ${sweepHits} collisions.`);
    total += sweepHits;
    // 2. A visible "Look here" tag on every reveal at every width.
    let tagFails = 0;
    for (const w of sweepWidths) {
      await page.setViewportSize({ width: w, height: 900 });
      for (let k = 1; k <= 5; k++) {
        const { report, state } = await load(page, `${base}?state=reveal&exp=${k}`);
        const visible = await page.evaluate(() =>
          [...document.querySelectorAll('svg.draw text.t-look')].every((t) => {
            const b = t.getBBox();
            const svg = t.ownerSVGElement;
            return b.x >= 0 && b.x + b.width <= svg.width.baseVal.value && b.y >= 0;
          }),
        );
        if (report.tags < state.focus.length || !visible || report.collisions.length) {
          tagFails++;
          console.log(`tag ${w} reveal ${k}: tags ${report.tags} of ${state.focus.length}, ${report.collisions.join(' | ')}`);
        }
      }
    }
    console.log(`Look-here tags: ${tagFails} failures over ${sweepWidths.length * 5} reveals.`);
    total += tagFails;
    // 3. The no-answer sweep, proven by planted leaks.
    const exps = M.experiments();
    const forbidden = (e) => {
      const truth = e.choices.find((c) => c.value === e.truth).text;
      const words = {
        'one-bit': [M.fmt.years(M.layout({ ...e.setup, gen: 11 }).years), '3 November 2060', 'lasts 34.8'],
        burst: ['3.95 ms', 'waits 3.95', 'full ticks', '904', '4 × 1,024', '4 ms'],
        order: ['0 · 0 · 0'],
        'clock-back': ['ids repeat', 'id repeats', 'Two ids', 'same id', 'made twice', 'No id repeats'],
        birthday: ['2.7%', 'about 2.7'],
      }[e.id];
      return [...words, truth.replace(/^About /, '').split(',')[0]].filter((w) => !['Some repeat ids it already made'].includes(w));
    };
    const structure = {
      'one-bit': (d) => d.markers === 0,
      burst: (d) => d.gaugesAfter === 0,
      order: (d) => d.rows === 0 && d.bits === 0,
      'clock-back': (d) => d.repeatMarks === 0 && d.rows === 0,
      birthday: (d) => d.curves === 0,
    };
    const probe = () =>
      page.evaluate(() => {
        const svg = document.getElementById('svg');
        const txt = [...svg.querySelectorAll('text')].map((t) => t.textContent).join(' | ');
        const labels = [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).join(' | ');
        return {
          text: `${txt} || ${svg.querySelector('title').textContent} || ${document.getElementById('notice').textContent} || ${document.getElementById('describe').textContent} || ${labels} || ${document.getElementById('story').textContent}`,
          describeDisabled: document.getElementById('desc-btn').disabled,
          markers: svg.querySelectorAll('circle.life-marker').length,
          gaugesAfter: [...svg.querySelectorAll('rect.gauge-bg')].length > 1 ? 1 : 0,
          rows: svg.querySelectorAll('polyline.order-line').length + svg.querySelectorAll('circle[data-key^="row-"]').length,
          bits: svg.querySelectorAll('text.t-bit').length,
          repeatMarks: svg.querySelectorAll('circle.repeat, circle.ring.bad').length,
          curves: svg.querySelectorAll('path.curve').length,
        };
      });
    async function sweepQuestion(e, k, leak, reduced) {
      const found = [];
      for (const [st, fracs] of [
        ['ask', [null]],
        ['play', [0.1, 0.5, 0.9, 1]],
      ])
        for (const frac of fracs) {
          await load(page, `${base}?state=${st}&exp=${k}${frac !== null ? `&frac=${frac}` : ''}${leak ? `&leak=${leak}` : ''}${reduced ? '&reduced=1' : ''}`);
          const d = await probe();
          const has = (w) => new RegExp(`(?<![\\d,.])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d,])`).test(d.text);
          for (const w of forbidden(e)) if (has(w)) found.push(`${st} ${frac ?? ''} text "${w}"`);
          if (!structure[e.id](d)) found.push(`${st} ${frac ?? ''} structure`);
          if (!d.describeDisabled) found.push(`${st} describe enabled`);
        }
      return found;
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    let leaksMissed = 0;
    let clean = 0;
    for (const [k, e] of exps.entries()) {
      for (const reduced of [false, true]) {
        const found = await sweepQuestion(e, k + 1, null, reduced);
        if (found.length) {
          clean += found.length;
          console.log(`no-answer E${k + 1}${reduced ? ' reduced' : ''}: ${found.join(' | ')}`);
        }
      }
      // A leak on each flag this question's hidden regions turn on must be caught.
      const flags = { 'one-bit': ['lifetime'], burst: ['burstAfter'], order: ['order', 'inspect'], 'clock-back': ['repeats', 'order'], birthday: ['chance'] }[e.id];
      for (const leak of flags) {
        const found = await sweepQuestion(e, k + 1, leak, false);
        if (!found.length) {
          leaksMissed++;
          console.log(`planted leak ${leak} on E${k + 1} was NOT caught`);
        }
      }
    }
    console.log(`No-answer sweep: ${clean} giveaways, ${leaksMissed} planted leaks missed.`);
    total += clean + leaksMissed;
    // 4. Stage heights per width, at the default.
    const heights = [];
    for (const w of [300, 320, 360, 375, 390, 412, 430, 600, 800, 1000, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      const { state } = await load(page, `${base}?state=default`);
      heights.push(`${w}: ${state.H}`);
    }
    console.log(`Stage heights at the default: ${heights.join(', ')}`);
  }
  await browser.close();
  server.close();
  for (const e of errors) console.log(`page error: ${e}`);
  console.log(`${total} problems.`);
  process.exit(total || errors.length ? 1 : 0);
})();
