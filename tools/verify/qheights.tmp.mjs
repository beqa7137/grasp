import { launch, newContext } from './lib.mjs';
const browser = await launch();
const out = [];
for (const vw of [320, 390, 480, 600, 700, 1280]) {
  const ctx = await newContext(browser, vw >= 1024 ? 'desktop' : 'pixel7', { extra: { viewport: { width: vw, height: 1200 } } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:4433/design/topics/sd-consistency');
  await p.locator('app-quorum-widget svg.draw').waitFor();
  await p.waitForTimeout(300);
  const h3 = await p.evaluate(() => document.querySelector('app-quorum-widget g-stage .well').clientHeight);
  await p.locator('app-quorum-widget').getByRole('radio', { name: '5 replicas' }).check();
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const host = document.querySelector('app-lazy-widget');
    const w = document.querySelector('app-quorum-widget');
    const stage = document.querySelector('app-quorum-widget g-stage .well');
    return { stageN3: 0, host: Math.round(host.getBoundingClientRect().width), h: Math.round(w.getBoundingClientRect().height), stageW: stage.clientWidth, stageH: stage.clientHeight };
  });
  out.push({ vw, h3, ...r });
  await ctx.close();
}
console.log(out.map((o) => JSON.stringify(o)).join('\n'));
await browser.close();
