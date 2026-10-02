// Screenshots, axe, page errors and sideways overflow for every state in states/.
// BASE=<url> THEME=dark|light OUT=<dir> [PROFILES=desktop,pixel7] [STABLE=1] [READONLY=1] node tools/verify/audit.mjs [state regex]
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { AxeBuilder, BASE, MASK_CSS, OUT, PROFILES, STABLE, THEME, goto, launch, newContext, readOnly } from './lib.mjs';
import { findOverflow } from './overflow.mjs';
import { states } from './states/index.mjs';

const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const profiles = (process.env.PROFILES ?? 'desktop,pixel7').split(',');
const RESULTS = `${OUT}/audit-${THEME}.json`;
const MANIFEST = `${OUT}/capture-${THEME}.json`;
const read = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);

// Reruns of a few states merge into OUT, so OUT must hold a capture of the same build and settings.
const shell = await (await fetch(`${BASE}/`)).text();
const manifest = {
  build: shell.match(/\b(?:main|styles)-[\w-]+\.(?:js|css)\b/g)?.join(' ') ?? 'unknown',
  stable: STABLE,
  mask: MASK_CSS ?? null,
};
const earlier = read(MANIFEST, null);
if (earlier && ['build', 'stable', 'mask'].some((key) => earlier[key] !== manifest[key])) {
  throw new Error(`${MANIFEST} is for build ${earlier.build}, stable ${earlier.stable}, mask ${earlier.mask}: use another OUT`);
}
manifest.browsers = { ...earlier?.browsers };

const browsers = {};
async function browserFor(profile) {
  const type = PROFILES[profile].defaultBrowserType;
  if (!browsers[type]) {
    browsers[type] = await launch(type);
    const version = browsers[type].version();
    if (manifest.browsers[type] && manifest.browsers[type] !== version) {
      throw new Error(`${MANIFEST} was captured with ${type} ${manifest.browsers[type]}, not ${version}: use another OUT`);
    }
    manifest.browsers[type] = version;
  }
  return browsers[type];
}

const results = [];
for (const profile of profiles) {
  for (const state of states()) {
    if (only && !only.test(state.id)) continue;
    const context = await newContext(await browserFor(profile), profile, { noticeSeen: !state.fresh, extra: { reducedMotion: 'reduce' } });
    if (process.env.READONLY === '1') await readOnly(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const name = `${THEME}-${profile}-${state.id}`;
    try {
      await goto(page, state.path);
      const note = state.setup ? await state.setup(page) : undefined;
      const { violations } = await new AxeBuilder({ page }).analyze();
      await page.screenshot({ path: `${OUT}/${name}.png` });
      rmSync(`${OUT}/${name}-FAILED.png`, { force: true });
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const { overflow, scrollers } = await page.evaluate(findOverflow);
      results.push({
        profile,
        state: state.id,
        clean: !violations.length && !errors.length && overflowX <= 0 && !overflow.length,
        note,
        errors,
        overflowX,
        overflow,
        scrollers,
        violations: violations.map((v) => ({ id: v.id, impact: v.impact, targets: v.nodes.map((n) => n.target) })),
      });
      console.log(
        name,
        results.at(-1).clean ? 'clean' : violations.map((v) => `${v.id}:${v.impact}(${v.nodes.length})`).join(' ') || 'axe 0',
        errors.length ? `errors ${errors.length}` : '',
        overflowX > 0 ? `overflowX ${overflowX}` : '',
        overflow.map((o) => `${o.kind} ${o.px}px ${o.selector}`).join('; '),
        scrollers.length ? `scrollers ${scrollers.map((o) => o.selector).join(', ')}` : '',
        note ?? '',
      );
    } catch (e) {
      results.push({ profile, state: state.id, clean: false, failed: e.message.split('\n')[0] });
      console.log(name, 'FAILED', e.message.split('\n')[0]);
      await page.screenshot({ path: `${OUT}/${name}-FAILED.png` }).catch(() => {});
    }
    await context.close();
  }
}
for (const browser of Object.values(browsers)) await browser.close();

const ids = states().map((s) => s.id);
const key = (r) => `${r.profile} ${r.state}`;
const rerun = new Set(results.map(key));
const merged = [...read(RESULTS, []).filter((r) => !rerun.has(key(r)) && ids.includes(r.state)), ...results].sort(
  (a, b) => a.profile.localeCompare(b.profile) || ids.indexOf(a.state) - ids.indexOf(b.state),
);
writeFileSync(RESULTS, JSON.stringify(merged, null, 2));
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

const captured = new Set(merged.filter((r) => !r.failed).map(key));
const kept = [...new Set(merged.map((r) => r.profile))];
const missing = kept.flatMap((profile) =>
  ids
    .filter((id) => !captured.has(`${profile} ${id}`) || !existsSync(`${OUT}/${THEME}-${profile}-${id}.png`))
    .map((id) => `${profile} ${id}`),
);
console.log(`${results.filter((r) => r.clean).length} of ${results.length} states clean`);
console.log(
  `${OUT} (${THEME}): ${kept.join(', ')} × ${ids.length} states, ` +
    (missing.length ? `${missing.length} missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}` : 'complete'),
);
process.exitCode = results.every((r) => r.clean) ? 0 : 1;
