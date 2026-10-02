// Pixel difference of same-named PNGs, then both folders' capture settings and audit verdicts.
// node pixdiff.mjs <base dir> <new dir> [regex]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { PNG } from './lib.mjs';

const [a, b, pattern] = process.argv.slice(2);
const re = new RegExp(pattern ?? '.');
for (const n of readdirSync(a)
  .filter((x) => x.endsWith('.png') && re.test(x))
  .sort()) {
  let pb;
  try {
    pb = PNG.sync.read(readFileSync(`${b}/${n}`));
  } catch {
    console.log(n, 'missing in B');
    continue;
  }
  const pa = PNG.sync.read(readFileSync(`${a}/${n}`));
  if (pa.width !== pb.width || pa.height !== pb.height) {
    console.log(n, `size ${pa.width}x${pa.height} vs ${pb.width}x${pb.height}`);
    continue;
  }
  let diff = 0;
  let max = 0;
  const box = { left: Infinity, top: Infinity, right: -1, bottom: -1 };
  for (let i = 0; i < pa.data.length; i += 4) {
    const d = Math.max(
      Math.abs(pa.data[i] - pb.data[i]),
      Math.abs(pa.data[i + 1] - pb.data[i + 1]),
      Math.abs(pa.data[i + 2] - pb.data[i + 2]),
    );
    if (d > 0) {
      diff++;
      const x = (i / 4) % pa.width;
      const y = Math.floor(i / 4 / pa.width);
      Object.assign(box, {
        left: Math.min(box.left, x),
        top: Math.min(box.top, y),
        right: Math.max(box.right, x),
        bottom: Math.max(box.bottom, y),
      });
    }
    max = Math.max(max, d);
  }
  console.log(
    n,
    diff === 0
      ? 'identical'
      : `${diff} px differ (max channel delta ${max}, box ${box.left},${box.top} ${box.right - box.left + 1}x${box.bottom - box.top + 1})`,
  );
}

const read = (dir, file) => (existsSync(`${dir}/${file}`) ? JSON.parse(readFileSync(`${dir}/${file}`, 'utf8')) : null);
const themes = new Set([a, b].flatMap((dir) => readdirSync(dir).flatMap((f) => f.match(/^(?:capture|audit)-(.+)\.json$/)?.[1] ?? [])));
let failing = false;
for (const theme of [...themes].sort()) {
  const [ma, mb] = [read(a, `capture-${theme}.json`), read(b, `capture-${theme}.json`)];
  if (!ma || !mb) {
    console.log(`${theme}: no capture manifest in ${ma ? 'B' : 'A'}, so its settings are unknown`);
  } else {
    console.log(`${theme}: A ${ma.build} ${JSON.stringify(ma.browsers)}, B ${mb.build} ${JSON.stringify(mb.browsers)}`);
    for (const setting of ['stable', 'mask'].filter((s) => ma[s] !== mb[s])) {
      failing = true;
      console.log(`${theme}: ${setting} differs (${ma[setting]} vs ${mb[setting]}), so the captures are not comparable`);
    }
    for (const [type, version] of Object.entries(ma.browsers).filter(([t, v]) => mb.browsers[t] && mb.browsers[t] !== v)) {
      console.log(`${theme}: ${type} ${version} vs ${mb.browsers[type]}: recapture the base before reading diffs`);
    }
  }

  const [ra, rb] = [read(a, `audit-${theme}.json`), read(b, `audit-${theme}.json`)];
  if (!ra || !rb) continue;
  const verdicts = (results) => new Map(results.map((r) => [`${theme}-${r.profile}-${r.state}`, r.clean]));
  const [va, vb] = [verdicts(ra), verdicts(rb)];
  const turned = (from, to) =>
    [...va].filter(([name, clean]) => re.test(name) && clean === from && vb.get(name) === to).map(([name]) => name);
  const worse = turned(true, false);
  const fixed = turned(false, true);
  if (worse.length) failing = true;
  console.log(`${theme}: ${worse.length} states clean in A are not clean in B${worse.length ? `: ${worse.join(', ')}` : ''}`);
  if (fixed.length) console.log(`${theme}: ${fixed.length} states not clean in A are clean in B: ${fixed.join(', ')}`);
}
process.exitCode = failing ? 1 : 0;
