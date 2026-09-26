// Pixel difference of same-named PNGs: node pixdiff.mjs <dirA> <dirB> [regex]
import { readdirSync, readFileSync } from 'node:fs';
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
  for (let i = 0; i < pa.data.length; i += 4) {
    const d = Math.max(
      Math.abs(pa.data[i] - pb.data[i]),
      Math.abs(pa.data[i + 1] - pb.data[i + 1]),
      Math.abs(pa.data[i + 2] - pb.data[i + 2]),
    );
    if (d > 0) diff++;
    max = Math.max(max, d);
  }
  console.log(n, diff === 0 ? 'identical' : `${diff} px differ (max channel delta ${max})`);
}
