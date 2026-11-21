import { describe, expect, it } from 'vitest';
import {
  hash32,
  SHARD_HOT_KEY,
  SHARD_K,
  SHARD_KEY_NAMES,
  SHARD_NAMES,
  SHARD_NODE_COUNTS,
  SHARD_PLAY,
  SHARD_POINTS,
  SHARD_POINT_SALT,
  SHARD_SALTS,
  SHARD_SALT_KEYS,
  SHARD_SETTINGS,
  SHARD_FOLLOW,
  shardDiff,
  shardFrame,
  shardPlace,
  shardPlayMs,
  shardPositions,
  shardRing,
  shardScenario,
  shardScenarios,
  shardTakeoff,
  type ShardScheme,
} from './sharding.js';

/** The hash a second time, in BigInt arithmetic. */
function hashBig(text: string): bigint {
  const m32 = (1n << 32n) - 1n;
  let h = 0x811c9dc5n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x01000193n) & m32;
  }
  h ^= h >> 16n;
  h = (h * 0x85ebca6bn) & m32;
  h ^= h >> 13n;
  h = (h * 0xc2b2ae35n) & m32;
  h ^= h >> 16n;
  return h;
}

const TURN = 2 ** 32;
const pointNames = SHARD_NAMES.flatMap((n) => Array.from({ length: 100 }, (_, v) => `${n}#${v}${SHARD_POINT_SALT}`));
const big = new Map([...SHARD_KEY_NAMES, SHARD_HOT_KEY, ...SHARD_SALT_KEYS, ...pointNames].map((t) => [t, Number(hashBig(t))]));
/** A second ring: the owner is the point at the smallest clockwise distance, found by trying every point. */
function bruteOwner(scheme: ShardScheme, points: number, members: readonly string[], text: string): string {
  const h = big.get(text)!;
  if (scheme === 'mod') return members[h % members.length];
  let best = '';
  let bestDist = TURN;
  for (const node of members)
    for (let v = 0; v < points; v++) {
      const dist = (big.get(`${node}#${v}${SHARD_POINT_SALT}`)! - h + TURN) % TURN;
      if (dist < bestDist) [best, bestDist] = [node, dist];
    }
  return best;
}
const subsets: string[][] = [];
for (let mask = 1; mask < 64; mask++) {
  const members = SHARD_NAMES.filter((_, i) => mask & (1 << i));
  if (members.length >= 2) subsets.push(members);
}
const SCHEMES: [ShardScheme, number][] = [
  ['ring', 1],
  ['ring', 10],
  ['ring', 100],
  ['mod', 100],
];
const brute = new Map<string, string[]>();
const bruteOwners = (scheme: ShardScheme, points: number, members: string[]) => {
  const id = `${scheme}${points}${members.join('')}`;
  let o = brute.get(id);
  if (!o) brute.set(id, (o = SHARD_KEY_NAMES.map((k) => bruteOwner(scheme, points, members, k))));
  return o;
};
const names = (n: number) => SHARD_NAMES.slice(0, n);

describe('the sharding model', () => {
  it('hashes every key, salt and point name as the BigInt hash does, each at its own position', () => {
    for (const [t, h] of big) expect(hash32(t), t).toBe(h);
    expect(new Set(big.values()).size).toBe(SHARD_K + 1 + SHARD_SALTS + 600);
    expect(SHARD_KEY_NAMES).not.toContain(SHARD_HOT_KEY);
    expect(shardPositions().keys[SHARD_FOLLOW]).toBe(3_688_624_336);
  });

  it('places every key, the hot key and its salts as a brute-force ring and BigInt remainders do', () => {
    for (const [scheme, points] of SCHEMES)
      for (const members of subsets) {
        const p = shardPlace(scheme, points, members);
        const id = `${scheme} ${points} ${members.join('')}`;
        expect(p.owners, id).toEqual(bruteOwners(scheme, points, members));
        expect(p.hot, id).toBe(bruteOwner(scheme, points, members, SHARD_HOT_KEY));
        expect(p.salts, id).toEqual(SHARD_SALT_KEYS.map((k) => bruteOwner(scheme, points, members, k)));
        expect(
          Object.values(p.counts).reduce((a, b) => a + b, 0),
          id,
        ).toBe(SHARD_K);
        if (scheme === 'ring')
          expect(
            Object.values(p.ringShare).reduce((a, b) => a + b, 0),
            id,
          ).toBeCloseTo(1, 9);
      }
  });

  it('counts every change of the node set as a reassignment of every key does, and the ring keeps its two laws', () => {
    let changes = 0;
    for (const [scheme, points] of SCHEMES)
      for (const a of subsets)
        for (const b of subsets) {
          if (a === b) continue;
          changes++;
          const d = shardDiff(shardPlace(scheme, points, a), shardPlace(scheme, points, b));
          const [from, to] = [bruteOwners(scheme, points, a), bruteOwners(scheme, points, b)];
          const moved = SHARD_KEY_NAMES.map((_, i) => i).filter((i) => from[i] !== to[i]);
          const id = `${scheme} ${points} ${a.join('')}>${b.join('')}`;
          expect(
            d.moves.map((m) => m.key),
            id,
          ).toEqual(moved);
          expect(d.toJoined, id).toBe(moved.filter((i) => !a.includes(to[i])).length);
          expect(d.fromLeft, id).toBe(moved.filter((i) => !b.includes(from[i])).length);
          expect(
            Object.values(d.into).reduce((x, y) => x + y, 0),
            id,
          ).toBe(d.moved);
          expect(
            Object.values(d.out).reduce((x, y) => x + y, 0),
            id,
          ).toBe(d.moved);
          if (scheme !== 'ring') continue;
          // A join moves keys only to the joiners; a leave moves exactly the leavers' keys; none moves between stayers.
          if (!d.left.length) expect(d.toJoined, id).toBe(d.moved);
          if (!d.joined.length) expect([d.fromLeft, d.leftHeld], id).toEqual([d.moved, d.moved]);
          expect(d.between, id).toBe(0);
        }
    expect(changes).toBe(12_768);
  });

  it('moves about N / (N + 1) under hash mod N, exactly the keys whose two remainders differ', () => {
    const at = shardPositions().keys;
    for (let n = 3; n < 6; n++) {
      const d = shardDiff(shardPlace('mod', 0, names(n)), shardPlace('mod', 0, names(n + 1)));
      expect(Math.abs(d.moved / SHARD_K - n / (n + 1)), `${n}`).toBeLessThanOrEqual(0.08);
      expect(at.filter((h) => h % n === h % (n + 1)).length).toBe(SHARD_K - d.moved);
      expect(Array.from({ length: n * (n + 1) }, (_, h) => h).filter((h) => h % n === h % (n + 1)).length).toBe(n);
    }
  });

  it('moves no key between nodes that stay under hash mod N only on a doubling or a halving, each key to its twin', () => {
    const at = shardPositions().keys;
    for (const a of SHARD_NODE_COUNTS)
      for (const b of SHARD_NODE_COUNTS) {
        if (a === b) continue;
        const d = shardDiff(shardPlace('mod', 0, names(a)), shardPlace('mod', 0, names(b)));
        const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
        expect(d.between === 0, `${a} to ${b}`).toBe(hi === 2 * lo);
        if (hi === 2 * lo) expect(at.every((h) => h % hi === h % lo || h % hi === (h % lo) + lo)).toBe(true);
      }
  });

  it('splits traffic in whole tenths that add up to 100% and match the fractions', () => {
    for (const s of SHARD_SETTINGS) {
      const sc = shardScenario(s);
      const sum = sc.now.members.reduce((a, m) => a + sc.traffic[m], 0);
      expect(Math.abs(sum - 1000), JSON.stringify(s)).toBeLessThanOrEqual(sc.now.members.length);
      for (const m of sc.now.members) {
        const c = sc.now.counts[m];
        const h = s.hot ? (s.split ? sc.now.salts.filter((o) => o === m).length / SHARD_SALTS : sc.now.hot === m ? 1 : 0) : 0;
        const exact = s.hot ? 70 * (c / SHARD_K) + 30 * h : (100 * c) / SHARD_K;
        expect(Math.abs(sc.traffic[m] / 10 - exact), `${m} ${JSON.stringify(s)}`).toBeLessThanOrEqual(0.0501);
      }
      if (s.down) {
        expect(sc.change?.kind).toBe('down');
        expect(sc.change?.left).toEqual([sc.downNode]);
        expect(shardScenario({ ...s, down: 0 }).busiest).toBe(sc.downNode);
        expect(sc.metrics.moved).toBe(sc.change?.moved);
      }
    }
  });

  it('reaches 96 settings and 456 scenarios, and the tallest pile is 197 keys', () => {
    expect(SHARD_SETTINGS.length).toBe(96);
    const all = shardScenarios();
    expect(all.length).toBe(456);
    expect(Math.max(...all.flatMap(({ settings }) => Object.values(shardScenario(settings).now.counts)))).toBe(197);
  });

  it('keeps every play under the pool and every flight over 290 ms', () => {
    let live = 0;
    let shortest = Infinity;
    for (const { settings, from, back } of shardScenarios()) {
      const c = shardScenario(settings, from, back).change;
      if (!c) continue;
      const ts = c.moves.map((m) => shardTakeoff(m.key)).sort((a, b) => a - b);
      for (let i = 0, j = 0; i < ts.length; i++) {
        while (ts[i] - ts[j] >= SHARD_PLAY.flight) j++;
        live = Math.max(live, i - j + 1);
      }
      shortest = Math.min(shortest, shardPlayMs(c.moved) * SHARD_PLAY.flight);
    }
    expect(live).toBe(56);
    expect(live).toBeLessThanOrEqual(SHARD_PLAY.pool);
    expect(shortest).toBeGreaterThanOrEqual(290);
    expect(SHARD_PLAY.sweep1 + SHARD_PLAY.flight).toBeLessThanOrEqual(1);
  });

  it('tells a frame of a play by one monotone clock: a key lifts off as the hand passes it and lands a flight later', () => {
    const c = shardScenario({ scheme: 1, points: 100, nodes: 5, hot: 0, split: 0, down: 0 }, names(4)).change!;
    let landed = 0;
    for (let f = 0; f <= 1.0001; f += 0.01) {
      const fr = shardFrame(c.moves, f);
      expect(fr.landed).toBeGreaterThanOrEqual(landed);
      landed = fr.landed;
      expect(fr.landed + fr.flying + [...fr.stage.values()].filter((s) => s.st === 'src').length).toBe(c.moved);
    }
    expect(shardFrame(c.moves, 1).landed).toBe(c.moved);
    expect(shardFrame(c.moves, SHARD_PLAY.sweep0 - 0.001).landed + shardFrame(c.moves, SHARD_PLAY.sweep0 - 0.001).flying).toBe(0);
  });

  it('follows a key that moves in E1, moves to E in E2, and is one of the failed node’s keys in E4', () => {
    const moves = (scheme: ShardScheme, points: number, a: string[], b: string[]) =>
      shardPlace(scheme, points, a).owners[SHARD_FOLLOW] !== shardPlace(scheme, points, b).owners[SHARD_FOLLOW];
    expect(moves('mod', 100, names(4), names(5))).toBe(true);
    expect(moves('ring', 100, names(4), names(5))).toBe(true);
    expect(shardPlace('ring', 100, names(5)).owners[SHARD_FOLLOW]).toBe('E');
    const lost = shardScenario({ scheme: 0, points: 1, nodes: 4, hot: 0, split: 0, down: 1 }).change!;
    expect(lost.moves.some((m) => m.key === SHARD_FOLLOW)).toBe(true);
  });

  it('holds the point salt to its bounds: more points are more even at every node count', () => {
    for (const n of SHARD_NODE_COUNTS) {
      const at = SHARD_POINTS.map((p) => shardPlace('ring', p, names(n)));
      const full = at.map((pl) => Math.max(...Object.values(pl.counts)));
      const ring = at.map((pl) => Math.max(...Object.values(pl.ringShare)));
      expect(full[0], `${n}: ${full.join(' / ')}`).toBeGreaterThanOrEqual(full[1] + 4);
      expect(full[1], `${n}: ${full.join(' / ')}`).toBeGreaterThanOrEqual(full[2] + 4);
      expect(ring[0]).toBeGreaterThan(ring[1] + 0.01);
      expect(ring[1]).toBeGreaterThan(ring[2] + 0.005);
      for (const p of at) expect(p.hot, `${n} nodes, ${p.points} points`).toBe('A');
    }
    expect(
      shardRing(names(4), 1)
        .map((p) => p.node)
        .join(''),
    ).toBe('ACBD');
    const e2 = shardDiff(shardPlace('ring', 100, names(4)), shardPlace('ring', 100, names(5)));
    expect(Math.abs(e2.moved - e2.ideal!) / e2.ideal!).toBeLessThanOrEqual(0.15);
    for (const m of names(4)) expect(e2.out[m]).toBeGreaterThan(0);
    expect(Math.max(...Object.values(shardPlace('ring', 1, names(4)).counts))).toBeGreaterThan(SHARD_K / 2);
  });
});
