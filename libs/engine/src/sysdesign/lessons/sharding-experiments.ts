import { slotOf, word, type ExperimentGoal, type ExperimentSpec, type Slots } from './experiments.js';
import {
  SHARD_BASELINE,
  SHARD_HOT_PCT,
  SHARD_K,
  SHARD_NAMES,
  SHARD_POINTS,
  SHARD_SALTS,
  shardList,
  shardNames,
  shardScenario,
  type ShardSettings,
} from './widgets/sharding.js';

const num = slotOf('num');
const pct = slotOf('pct');
const times = slotOf('times');
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

export const SHARD_SETUP = {
  mod: { ...SHARD_BASELINE, scheme: 1 },
  ring: SHARD_BASELINE,
  one: { ...SHARD_BASELINE, points: 1 },
  hot: { ...SHARD_BASELINE, hot: 1 },
  challenge: { scheme: 1, points: 1, nodes: 4, hot: 1, split: 0, down: 1 },
} as const satisfies Record<string, ShardSettings>;

/** A card's act from its setup: a change of `nodes` or `down` is a change of the node set, which plays its keys moving. */
export const shardAfter = (setup: ShardSettings, set: Partial<ShardSettings>) =>
  shardScenario({ ...setup, ...set }, set.nodes || set.down ? shardNames(setup.nodes) : null);

export const SHARD_CHALLENGE_BOUNDS = { busiest: 30, moved: 50, nodes: 6 } as const;
export const SHARD_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'busiest', below: SHARD_CHALLENGE_BOUNDS.busiest },
    { metric: 'moved', below: SHARD_CHALLENGE_BOUNDS.moved },
    { metric: 'nodes', below: SHARD_CHALLENGE_BOUNDS.nodes },
  ],
  keep: { hot: 1, down: 1 },
};
/** The one setting of the challenge's 32 that meets it. */
export const SHARD_CHALLENGE_SOLUTION = { scheme: 0, points: 100, nodes: 5, split: 1 } as const;

/** Words each answer's choice carries, so the model's outcome names the one it is. */
const OUTCOMES = {
  modJoin: { few: word('the keys E needs'), half: word('half of them'), most: word('four keys in five') },
  ringJoin: { rebalance: word('even them out'), onlyNew: word('every one of them to E'), most: word('Most of them') },
  lost: { spread: word('spread over'), neighbors: word('two neighbors'), successor: word('the next point clockwise') },
};

/** Keys a change moved by node, as slots named `{prefix}A` to `{prefix}F` for the nodes that moved some. */
const byNode = (prefix: string, counts: Readonly<Record<string, number>>): Slots =>
  Object.fromEntries(SHARD_NAMES.filter((m) => counts[m] > 0).map((m) => [`${prefix}${m}`, num(counts[m])]));

/** Settings as the widget reads them (`ShardSettings`): `scheme` 0 for the ring, 1 for hash mod N. */
export const SHARDING_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'mod-join',
    title: 'A fifth node, by hash mod N',
    setup: SHARD_SETUP.mod,
    act: { set: { nodes: 5 }, run: 'move' },
    ask: 'The {k} keys sit on {n} nodes, each key on node number hash mod {n}. A {nth} node, E, joins, so every key is placed by hash mod {n2}. E needs {ideal} keys for an even share. How many keys change node?',
    choices: [
      { text: 'About {ideal}: the keys E needs, no more', value: 'few' },
      { text: 'About {halfN}: half of them', value: 'half' },
      { text: 'About {mostN}: four keys in five', value: 'most' },
    ],
    truth: 'outcome',
    reveal:
      'It moves {moved} of the {k} keys, {movedPct}. A key stays only where its hash leaves the same remainder for {n} and for {n2}, which is {stayIn} of every {cycle} hashes, so about {expected} move. The closer look shows it key by key. Only {toNew} of them went to E; the other {between} changed places among {olds}, and every move is data copied over the network. Going from N to N + 1 nodes moves about N / (N + 1) of the data: the more nodes, the worse.',
    focus: ['bins', 'lens'],
    hide: ['after'],
    slots: () => {
      const a = shardScenario(SHARD_SETUP.mod);
      const b = shardAfter(SHARD_SETUP.mod, { nodes: 5 });
      const c = b.change!;
      const n = a.now.members.length;
      const n2 = b.now.members.length;
      const frac = c.moved / SHARD_K;
      return {
        k: num(SHARD_K),
        n: num(n),
        n2: num(n2),
        nth: word(ORDINAL[n2 - 1]),
        ideal: num(c.ideal!),
        halfN: num(SHARD_K / 2),
        mostN: num((SHARD_K * n) / n2),
        moved: num(c.moved),
        movedPct: pct(Math.round(frac * 1000) / 10),
        stayIn: num(n),
        cycle: num(n * n2),
        expected: pct(Math.round((n / n2) * 1000) / 10),
        toNew: num(c.toJoined),
        between: num(c.between),
        olds: word(shardList(a.now.members)),
        ...OUTCOMES.modJoin,
        outcome: OUTCOMES.modJoin[frac < 0.35 ? 'few' : frac < 0.65 ? 'half' : 'most'],
      };
    },
  },
  {
    id: 'ring-join',
    title: 'The same node, on a ring',
    setup: SHARD_SETUP.ring,
    act: { set: { nodes: 5 }, run: 'move' },
    ask: 'The {k} keys sit on {n} nodes, now on a consistent-hash ring with {points} points a node: a key belongs to the first point clockwise from its hash. E joins with {points} points of its own. Which keys move?',
    choices: [
      { text: 'About {ideal} to E, and about as many again among A, B, C and D to even them out', value: 'rebalance' },
      { text: 'About {ideal}, every one of them to E', value: 'onlyNew' },
      { text: 'Most of them: a new node changes where every hash lands', value: 'most' },
    ],
    truth: 'outcome',
    reveal:
      "Only {moved} keys move, every one of them to E: {fromA} from A, {fromB} from B, {fromC} from C and {fromD} from D. Each of E's points takes the stretch of ring just before it from the point that owned it, and no other arc changes, so no key moves between the old nodes. An even share for E is {ideal} ({k} / {n2}). E's {points} points took {eRing} of the ring, which predicts about {predicted} keys; with only {k} keys, chance gave it {moved}. For the same change, hash mod N moved {modMoved}.",
    focus: ['bins', 'lens'],
    hide: ['after'],
    slots: () => {
      const a = shardScenario(SHARD_SETUP.ring);
      const b = shardAfter(SHARD_SETUP.ring, { nodes: 5 });
      const c = b.change!;
      return {
        k: num(SHARD_K),
        n: num(a.now.members.length),
        n2: num(b.now.members.length),
        points: num(SHARD_SETUP.ring.points),
        ideal: num(c.ideal!),
        moved: num(c.moved),
        eRing: pct(Math.round(b.now.ringShare['E'] * 1000) / 10),
        predicted: num(Math.round(b.now.ringShare['E'] * SHARD_K)),
        ...byNode('from', c.out),
        modMoved: num(shardAfter(SHARD_SETUP.mod, { nodes: 5 }).change!.moved),
        ...OUTCOMES.ringJoin,
        outcome: OUTCOMES.ringJoin[c.moved > SHARD_K / 2 ? 'most' : c.toJoined === c.moved ? 'onlyNew' : 'rebalance'],
      };
    },
  },
  {
    id: 'one-point',
    title: 'One point a node',
    setup: SHARD_SETUP.ring,
    act: { set: { points: 1 } },
    ask: 'With {points} points a node the {n} shards hold {low} to {high} keys; an even share is {fair}. Give each node a single point on the ring instead. How many keys does the fullest shard hold?',
    choices: [
      { text: '{one}: more than half of all the keys', value: 'one' },
      { text: '{mid}: half as much again as an even share', value: 'mid' },
      { text: '{high}: no change, the hash is still uniform', value: 'high' },
    ],
    truth: 'fullest',
    reveal:
      "{who} holds {one} keys, while {least} holds {low1}. One point a node cuts the ring into {n} arcs of random length: {who}'s arc is {arc} of the ring, so it gets about that share of the keys. The hash is uniform, but {n} random cuts are not even. This is typical, not bad luck: the longest of {n} random arcs averages about half the ring and the shortest about a sixteenth. With {points} points (virtual nodes) a node, each shard owns {points} short arcs scattered around the ring, their lengths average out, and the fullest holds {high}. A share's typical gap from even shrinks with the square root of the points: about a quarter with {ten} points, under a tenth with {points}, though one node can still land further off (with {ten} points {lowTen} gets only {lowTenKeys} keys here).",
    focus: ['ring', 'bins'],
    hide: ['after'],
    slots: () => {
      const a = shardScenario(SHARD_SETUP.ring);
      const b = shardScenario({ ...SHARD_SETUP.ring, points: 1 });
      const counts = Object.values(a.now.counts);
      const least = b.now.members.reduce((x, m) => (b.now.counts[m] < b.now.counts[x] ? m : x));
      const ten = shardScenario({ ...SHARD_SETUP.ring, points: SHARD_POINTS[1] });
      const tenLeast = ten.now.members.reduce((x, m) => (ten.now.counts[m] < ten.now.counts[x] ? m : x));
      return {
        n: num(a.now.members.length),
        points: num(SHARD_SETUP.ring.points),
        low: num(Math.min(...counts)),
        high: num(Math.max(...counts)),
        fair: num(a.fairKeys),
        one: num(b.now.counts[b.fullest]),
        mid: num(a.fairKeys * 1.5),
        who: word(b.fullest),
        least: word(least),
        low1: num(b.now.counts[least]),
        arc: pct(Math.round(b.now.ringShare[b.fullest] * 1000) / 10),
        fullest: num(b.now.counts[b.fullest]),
        ten: num(SHARD_POINTS[1]),
        lowTen: word(tenLeast),
        lowTenKeys: num(ten.now.counts[tenLeast]),
      };
    },
  },
  {
    id: 'lost-node',
    title: 'The fullest node fails',
    setup: SHARD_SETUP.one,
    act: { set: { down: 1 }, run: 'move' },
    ask: 'One point a node. {who} holds {held} of the {k} keys, and it fails. Where do its keys go?',
    choices: [
      { text: 'They spread over {others}, about {third} each', value: 'spread' },
      { text: 'To its two neighbors on the ring, {next} and {prev}, about half each', value: 'neighbors' },
      { text: 'All {held} to {next}, the next point clockwise', value: 'successor' },
    ],
    truth: 'outcome',
    reveal:
      "All {held} go to {next}: with {who}'s point gone, the first point clockwise from every one of its keys is {next}'s. {next} can take over at once because each key is also kept on the next distinct nodes clockwise, so {next} already holds copies; what it cannot take is the load: it goes from {before} keys to {after}, {ratio} its load, so it is the likeliest to fail next, and then {after} keys land on the node after it: a cascade. With {points} points a node the busiest node is {who100}; its arcs lie all around the ring, followed by points of {others100}, so its {held100} keys spread: {toB} to B, {toC} to C and {toD} to D. Set Points per node to {points} to see it.",
    focus: ['ring', 'bins'],
    hide: ['after'],
    slots: () => {
      const a = shardScenario(SHARD_SETUP.one);
      const b = shardScenario({ ...SHARD_SETUP.one, down: 1 });
      const c = b.change!;
      const who = b.downNode!;
      const dests = b.now.members.filter((m) => c.into[m] > 0);
      const ring = a.up.ring!;
      const i = ring.findIndex((p) => p.node === who);
      const next = ring[(i + 1) % ring.length].node;
      const prev = ring[(i - 1 + ring.length) % ring.length].node;
      // The counterfactual is the stage one click away: the same setting with 100 points a node.
      const many = shardScenario({ ...SHARD_SETUP.one, points: 100, down: 1 });
      return {
        k: num(SHARD_K),
        who: word(who),
        held: num(c.leftHeld),
        others: word(shardList(b.now.members)),
        third: num(Math.round(c.leftHeld / b.now.members.length)),
        next: word(next),
        prev: word(prev),
        before: num(c.before.counts[next]),
        after: num(c.after.counts[next]),
        ratio: times(Math.round((c.after.counts[next] / c.before.counts[next]) * 10) / 10),
        points: num(100),
        who100: word(many.downNode!),
        others100: word(shardList(many.now.members)),
        held100: num(many.change!.leftHeld),
        ...byNode('to', many.change!.into),
        ...OUTCOMES.lost,
        outcome: OUTCOMES.lost[dests.length === 1 && dests[0] === next ? 'successor' : dests.length === 2 ? 'neighbors' : 'spread'],
      };
    },
  },
  {
    id: 'hot-key',
    title: 'A hot key',
    setup: SHARD_SETUP.hot,
    act: { set: { nodes: 6 }, run: 'move' },
    ask: "One key takes {hot} of all the traffic, so its shard, {who}, carries {before} where an even share of {n} nodes is {fair}. Add {added} nodes, so an even share is {fair2}. What does the hot key's shard carry now?",
    choices: [
      { text: '{now}: hardly less, the hot key alone is {hot}', value: 'now' },
      { text: '{scaled}: two thirds of it, as its keys thin out', value: 'scaled' },
      { text: '{fair2}: an even share of {n2} nodes', value: 'fair2' },
    ],
    truth: 'now',
    reveal:
      "It still carries {now}. Hashing spreads keys, not traffic: one key lives on one shard, so its shard carries that {hot} however many nodes there are, and only the other keys' {rest} thins out. More nodes never take it below {hot}. Split the key instead: with a suffix from {first} to {last} it becomes {salts} keys of {each} each, which land on {saltShards} shards, and the busiest shard carries {splitBusiest}. The price is that a read of it gathers all {salts}. Turn on Split the key to see it.",
    focus: ['bins', 'verdict'],
    hide: ['after'],
    slots: () => {
      const a = shardScenario(SHARD_SETUP.hot);
      const b = shardAfter(SHARD_SETUP.hot, { nodes: 6 });
      const split = shardScenario({ ...SHARD_SETUP.hot, nodes: 6, split: 1 });
      const n = a.now.members.length;
      const n2 = b.now.members.length;
      const share = (x: number) => pct(Math.round(x * 10) / 10);
      return {
        hot: pct(SHARD_HOT_PCT),
        rest: pct(100 - SHARD_HOT_PCT),
        who: word(a.now.hot),
        before: pct(a.traffic[a.now.hot] / 10),
        n: num(n),
        n2: num(n2),
        added: num(n2 - n),
        fair: share(100 / n),
        fair2: share(100 / n2),
        now: pct(b.traffic[b.now.hot] / 10),
        scaled: share((a.traffic[a.now.hot] / 10) * (n / n2)),
        salts: num(SHARD_SALTS),
        first: num(0),
        last: num(SHARD_SALTS - 1),
        each: pct(SHARD_HOT_PCT / SHARD_SALTS),
        saltShards: num(split.hotOn.length),
        splitBusiest: pct(split.traffic[split.busiest] / 10),
      };
    },
  },
  {
    id: 'survive',
    title: 'Challenge: lose the busiest node and stay even',
    setup: SHARD_SETUP.challenge,
    ask: 'A hot key takes {hot} of the traffic, and the busiest node has failed. Choose the placement, the points, the nodes and whether to split the hot key so that no shard left carries {busiest} of the traffic or more, the failure moves fewer than {moved} keys, and the cluster has fewer than {nodes} nodes.',
    goal: SHARD_CHALLENGE_GOAL,
    reveal:
      "A ring of {n} nodes with {points} points each and the hot key split passes: when {down} fails only its {movedNow} keys move, spread over the {left} left, and the busiest carries {busiestNow}. Unsplit, the hot key's shard carries {unsplit}; with {fewer} points a node the shards are less even and the busiest carries {tenBusiest}; hash mod N would have moved {modMoved} keys. Many points for even shards and a spread failure, a split for the key no hash can spread, and spare capacity for the node you lose.",
    focus: ['bins', 'verdict'],
    hide: [],
    slots: () => {
      const base = { ...SHARD_SETUP.challenge, ...SHARD_CHALLENGE_SOLUTION };
      const sol = shardScenario(base);
      const unsplit = shardScenario({ ...base, split: 0 });
      const ten = shardScenario({ ...base, points: 10 });
      const mod = shardScenario({ ...base, scheme: 1 });
      return {
        hot: pct(SHARD_HOT_PCT),
        busiest: pct(SHARD_CHALLENGE_BOUNDS.busiest),
        moved: num(SHARD_CHALLENGE_BOUNDS.moved),
        nodes: num(SHARD_CHALLENGE_BOUNDS.nodes),
        n: num(sol.settings.nodes),
        points: num(sol.settings.points),
        down: word(sol.downNode!),
        movedNow: num(sol.change!.moved),
        left: num(sol.now.members.length),
        busiestNow: pct(sol.traffic[sol.busiest] / 10),
        unsplit: pct(unsplit.traffic[unsplit.busiest] / 10),
        fewer: num(ten.settings.points),
        tenBusiest: pct(ten.traffic[ten.busiest] / 10),
        modMoved: num(mod.change!.moved),
      };
    },
  },
];
