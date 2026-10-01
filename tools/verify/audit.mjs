// Screenshots, axe, page errors and sideways overflow for every state in states/.
// BASE=<url> THEME=dark|light OUT=<dir> [PROFILES=desktop,pixel7] [STABLE=1] [READONLY=1] node tools/verify/audit.mjs [state regex]
import { writeFileSync } from 'node:fs';
import { AxeBuilder, OUT, THEME, chromium, goto, newContext, readOnly } from './lib.mjs';
import { findOverflow } from './overflow.mjs';
import { states } from './states/index.mjs';

const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const profiles = (process.env.PROFILES ?? 'desktop,pixel7').split(',');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
let failing = 0;

for (const profile of profiles) {
  for (const state of states()) {
    if (only && !only.test(state.id)) continue;
    const context = await newContext(browser, profile, { noticeSeen: !state.fresh, extra: { reducedMotion: 'reduce' } });
    if (process.env.READONLY === '1') await readOnly(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const name = `${THEME}-${profile}-${state.id}`;
    try {
      await goto(page, state.path);
      const note = state.setup ? await state.setup(page) : undefined;
      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const { overflow, scrollers } = await page.evaluate(findOverflow);
      results.push({
        profile,
        state: state.id,
        note,
        errors,
        overflowX,
        overflow,
        scrollers,
        violations: blocking.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target) })),
      });
      if (blocking.length || errors.length || overflowX > 0 || overflow.length) failing++;
      console.log(
        name,
        blocking.map((v) => `${v.id}(${v.nodes.length})`).join(' ') || 'clean',
        errors.length ? `errors ${errors.length}` : '',
        overflowX > 0 ? `overflowX ${overflowX}` : '',
        overflow.map((o) => `${o.kind} ${o.px}px ${o.selector}`).join('; '),
        scrollers.length ? `scrollers ${scrollers.map((o) => o.selector).join(', ')}` : '',
        note ?? '',
      );
    } catch (e) {
      failing++;
      results.push({ profile, state: state.id, failed: e.message.split('\n')[0] });
      console.log(name, 'FAILED', e.message.split('\n')[0]);
      await page.screenshot({ path: `${OUT}/${name}-FAILED.png` }).catch(() => {});
    }
    await context.close();
  }
}

await browser.close();
writeFileSync(`${OUT}/audit-${THEME}.json`, JSON.stringify(results, null, 2));
console.log(`${results.length - failing} of ${results.length} states clean`);
process.exitCode = failing ? 1 : 0;
