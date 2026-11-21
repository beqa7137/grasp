import { describe, expect, it } from 'vitest';
import { goalMet, renderExperiment } from './experiments.js';
import { SD_LESSONS } from './index.js';
import {
  SHARDING_EXPERIMENTS,
  SHARD_CHALLENGE_BOUNDS,
  SHARD_CHALLENGE_GOAL,
  SHARD_CHALLENGE_SOLUTION,
  SHARD_SETUP,
  shardAfter,
} from './sharding-experiments.js';
import { SHARD_K, SHARD_SETTINGS, shardPct, shardScenario } from './widgets/sharding.js';

const shown = Object.fromEntries(SHARDING_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe('the Sharding experiments', () => {
  it('replace the lesson tryThis, in the order of the interview arc', () => {
    expect(SD_LESSONS['sd-sharding'].widget.experiments).toBe(SHARDING_EXPERIMENTS);
    expect(SD_LESSONS['sd-sharding'].widget.tryThis).toBeUndefined();
    expect(SHARDING_EXPERIMENTS.map((e) => e.id)).toEqual(['mod-join', 'ring-join', 'one-point', 'lost-node', 'hot-key', 'survive']);
    expect(SHARDING_EXPERIMENTS.map((e) => e.act)).toEqual([
      { set: { nodes: 5 }, run: 'move' },
      { set: { nodes: 5 }, run: 'move' },
      { set: { points: 1 } },
      { set: { down: 1 }, run: 'move' },
      { set: { nodes: 6 }, run: 'move' },
      undefined,
    ]);
  });

  it('start every sentence of their text with a capital, a code term included', () => {
    const lower = Object.values(shown).flatMap((e) =>
      [e.ask, e.reveal, ...e.choices].flatMap((t) => (t.match(/(?:^|[.?!] )[a-z][^.]*/g) ?? []).map((m) => `${e.id}: ${m}`)),
    );
    expect(lower).toEqual([]);
  });

  it('put the answers at 3, 2, 1, 3 and 1', () => {
    expect(SHARDING_EXPERIMENTS.filter((e) => !e.goal).map((e) => renderExperiment(e).answer + 1)).toEqual([3, 2, 1, 3, 1]);
  });

  it('hide what the answer changes while it plays, and point the reveal at the regions it is about', () => {
    expect(SHARDING_EXPERIMENTS.map((e) => e.hide ?? [])).toEqual([['after'], ['after'], ['after'], ['after'], ['after'], []]);
    expect(SHARDING_EXPERIMENTS.map((e) => e.focus)).toEqual([
      ['bins', 'lens'],
      ['bins', 'lens'],
      ['ring', 'bins'],
      ['ring', 'bins'],
      ['bins', 'verdict'],
      ['bins', 'verdict'],
    ]);
  });

  it('ask how many keys a fifth node moves by hash mod N: four in five', () => {
    const e = shown['mod-join'];
    expect(e.ask).toBe(
      'The 200 keys sit on 4 nodes, each key on node number hash mod 4. A fifth node, E, joins, so every key is placed by hash mod 5. E needs 40 keys for an even share. How many keys change node?',
    );
    expect(e.choices).toEqual(['About 40: the keys E needs, no more', 'About 100: half of them', 'About 160: four keys in five']);
    expect(e.reveal).toBe(
      'It moves 166 of the 200 keys, 83%. A key stays only where its hash leaves the same remainder for 4 and for 5, which is 4 of every 20 hashes, so about 80% move. The closer look shows it key by key. Only 47 of them went to E; the other 119 changed places among A, B, C and D, and every move is data copied over the network. Going from N to N + 1 nodes moves about N / (N + 1) of the data: the more nodes, the worse.',
    );
    const c = shardAfter(SHARD_SETUP.mod, { nodes: 5 }).change!;
    expect([c.moved, c.toJoined, c.between]).toEqual([166, 47, 119]);
    expect(c.moved / SHARD_K).toBeGreaterThanOrEqual(0.8);
  });

  it('ask which keys a ring moves for the same node: about 40, every one to E', () => {
    const e = shown['ring-join'];
    expect(e.ask).toBe(
      'The 200 keys sit on 4 nodes, now on a consistent-hash ring with 100 points a node: a key belongs to the first point clockwise from its hash. E joins with 100 points of its own. Which keys move?',
    );
    expect(e.choices).toEqual([
      'About 40 to E, and about as many again among A, B, C and D to even them out',
      'About 40, every one of them to E',
      'Most of them: a new node changes where every hash lands',
    ]);
    expect(e.reveal).toBe(
      "Only 39 keys move, every one of them to E: 13 from A, 10 from B, 5 from C and 11 from D. Each of E's points takes the stretch of ring just before it from the point that owned it, and no other arc changes, so no key moves between the old nodes. An even share for E is 40 (200 / 5). E's 100 points took 17.1% of the ring, which predicts about 34 keys; with only 200 keys, chance gave it 39. For the same change, hash mod N moved 166.",
    );
  });

  it('ask the fullest shard with one point a node: more than half', () => {
    const e = shown['one-point'];
    expect(e.ask).toBe(
      'With 100 points a node the 4 shards hold 47 to 53 keys; an even share is 50. Give each node a single point on the ring instead. How many keys does the fullest shard hold?',
    );
    expect(e.choices).toEqual([
      '107: more than half of all the keys',
      '75: half as much again as an even share',
      '53: no change, the hash is still uniform',
    ]);
    expect(e.reveal).toBe(
      "A holds 107 keys, while B holds 3. One point a node cuts the ring into 4 arcs of random length: A's arc is 55.1% of the ring, so it gets about that share of the keys. The hash is uniform, but 4 random cuts are not even. This is typical, not bad luck: the longest of 4 random arcs averages about half the ring and the shortest about a sixteenth. With 100 points (virtual nodes) a node, each shard owns 100 short arcs scattered around the ring, their lengths average out, and the fullest holds 53. A share's typical gap from even shrinks with the square root of the points: about a quarter with 10 points, under a tenth with 100, though one node can still land further off (with 10 points C gets only 25 keys here).",
    );
    // The longest of n uniform spacings averages H(n) / n and the shortest 1 / n²; a node's share of a ring of n nodes
    // with p points each spreads by sqrt((n - 1) / (n p + 1)) of an even share.
    expect(near((1 + 1 / 2 + 1 / 3 + 1 / 4) / 4, 0.5, 0.025)).toBe(true);
    const rel = (n: number, p: number) => Math.sqrt((n - 1) / (n * p + 1));
    expect(near(rel(4, 10), 0.25, 0.03)).toBe(true);
    expect(rel(4, 100)).toBeLessThan(0.1);
  });

  it('ask where a lost node’s keys go with one point a node: all to the next point clockwise', () => {
    const e = shown['lost-node'];
    expect(e.ask).toBe('One point a node. A holds 107 of the 200 keys, and it fails. Where do its keys go?');
    expect(e.choices).toEqual([
      'They spread over B, C and D, about 36 each',
      'To its two neighbors on the ring, C and D, about half each',
      'All 107 to C, the next point clockwise',
    ]);
    expect(e.reveal).toBe(
      "All 107 go to C: with A's point gone, the first point clockwise from every one of its keys is C's. C can take over at once because each key is also kept on the next distinct nodes clockwise, so C already holds copies; what it cannot take is the load: it goes from 73 keys to 180, 2.5× its load, so it is the likeliest to fail next, and then 180 keys land on the node after it: a cascade. With 100 points a node the busiest node is A; its arcs lie all around the ring, followed by points of B, C and D, so its 53 keys spread: 25 to B, 12 to C and 16 to D. Set Points per node to 100 to see it.",
    );
    const many = shardScenario({ ...SHARD_SETUP.one, points: 100, down: 1 });
    expect(Object.keys(many.change!.into).filter((m) => many.change!.into[m] > 0)).toEqual(['B', 'C', 'D']);
  });

  it('ask what a hot key’s shard carries with two more nodes: hardly less', () => {
    const e = shown['hot-key'];
    expect(e.ask).toBe(
      "One key takes 30% of all the traffic, so its shard, A, carries 48.6% where an even share of 4 nodes is 25%. Add 2 nodes, so an even share is 16.7%. What does the hot key's shard carry now?",
    );
    expect(e.choices).toEqual([
      '42.3%: hardly less, the hot key alone is 30%',
      '32.4%: two thirds of it, as its keys thin out',
      '16.7%: an even share of 6 nodes',
    ]);
    expect(e.reveal).toBe(
      "It still carries 42.3%. Hashing spreads keys, not traffic: one key lives on one shard, so its shard carries that 30% however many nodes there are, and only the other keys' 70% thins out. More nodes never take it below 30%. Split the key instead: with a suffix from 0 to 9 it becomes 10 keys of 3% each, which land on 6 shards, and the busiest shard carries 19.2%. The price is that a read of it gathers all 10. Turn on Split the key to see it.",
    );
    expect(shardAfter(SHARD_SETUP.hot, { nodes: 6 }).change!.hotMoved).toBeNull();
  });

  it('set a challenge exactly one of its 32 settings meets', () => {
    const e = shown['survive'];
    expect(e.ask).toBe(
      'A hot key takes 30% of the traffic, and the busiest node has failed. Choose the placement, the points, the nodes and whether to split the hot key so that no shard left carries 30% of the traffic or more, the failure moves fewer than 50 keys, and the cluster has fewer than 6 nodes.',
    );
    expect(e.reveal).toBe(
      "A ring of 5 nodes with 100 points each and the hot key split passes: when E fails only its 39 keys move, spread over the 4 left, and the busiest carries 27.6%. Unsplit, the hot key's shard carries 48.2%; with 10 points a node the shards are less even and the busiest carries 36.4%; hash mod N would have moved 166 keys. Many points for even shards and a spread failure, a split for the key no hash can spread, and spare capacity for the node you lose.",
    );
    const kept = SHARD_SETTINGS.filter((s) => s.hot === 1 && s.down === 1);
    expect(kept.length).toBe(32);
    const pass = kept.filter((s) => goalMet(SHARD_CHALLENGE_GOAL, shardScenario(s).metrics, { ...s }));
    expect(pass).toEqual([{ ...SHARD_SETUP.challenge, ...SHARD_CHALLENGE_SOLUTION }]);
    const start = shardScenario(SHARD_SETUP.challenge);
    expect(goalMet(SHARD_CHALLENGE_GOAL, start.metrics, { ...start.settings })).toBe(false);
    expect([start.downNode, start.traffic[start.busiest], start.change!.moved]).toEqual(['C', 598, 161]);
    // No printed share sits on the wrong side of its bound.
    for (const s of kept) {
      const sc = shardScenario(s);
      expect(parseFloat(shardPct(sc.traffic[sc.busiest])) < SHARD_CHALLENGE_BOUNDS.busiest).toBe(
        sc.metrics.busiest < SHARD_CHALLENGE_BOUNDS.busiest,
      );
    }
    // Its 10-point near miss fails with key piles visibly less even than the solution's.
    const spread = (sc: ReturnType<typeof shardScenario>) =>
      Math.max(...Object.values(sc.now.counts)) - Math.min(...Object.values(sc.now.counts));
    const base = { ...SHARD_SETUP.challenge, ...SHARD_CHALLENGE_SOLUTION };
    expect([spread(shardScenario({ ...base, points: 10 })), spread(shardScenario(base))]).toEqual([37, 6]);
  });
});
