// Scratch screenshot helper (not committed): THEME, W, ACTION env; prints collisions from the page.
import { launch, newContext, PROFILES } from './lib.mjs';
const base = process.env.BASE ?? 'http://localhost:4433';
const out = process.env.SHOT_DIR;
const widths = (process.env.WIDTHS ?? '1280,390,320').split(',').map(Number);
const name = process.env.NAME ?? 'default';
const browser = await launch();
for (const w of widths) {
  const profile = w >= 1024 ? 'desktop' : w === 390 ? 'pixel7' : 'w320';
  const ctx = await newContext(browser, profile, { extra: { viewport: { width: w, height: w >= 1024 ? 1400 : 4400 } } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(`${base}/design/topics/sd-consistency`);
  await p.locator('app-quorum-widget svg.draw').waitFor();
  if (process.env.ACTION) await new Function('p', `return (async () => { ${process.env.ACTION} })()`)(p);
  await p.waitForTimeout(500);
  const el = p.locator('app-quorum-widget');
  await el.evaluate((e) => e.scrollIntoView());
  await el.screenshot({ path: `${out}/${name}-${w}-${process.env.THEME ?? 'dark'}.png` });
  console.log(w, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
