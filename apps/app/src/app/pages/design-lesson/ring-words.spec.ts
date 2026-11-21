import { SHARD_NAMES, SHARD_SETTINGS, shardPositions, shardScenario, shardScenarios } from '@grasp/engine';
import { FALSE_CLAIMS } from './ring-claims.testing';
import {
  HIDE_PHASE,
  NOTICE,
  SHARDING_KEEP,
  VERDICT,
  changeLabel,
  changeStory,
  describeSaid,
  describeTable,
  downCaption,
  goalChecks,
  goalMini,
  hiding,
  rule,
  standing,
  story,
  summary,
  swapStory,
} from './ring-words';

const name = (s: object, from: readonly string[] | null, back = false) =>
  `${JSON.stringify(s)} ${back ? 'back' : 'from'} ${from ? from.join('') : 'none'}`;
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+/);

describe('sharding words', () => {
  it('keep a count with its keys or nodes, a remainder sum and an expression with its unit on one line', () => {
    const text =
      'p99 230 ms. All 39 keys moved to E; an even share is 40 (200 / 5), 3,688,624,336 mod 5 = 1 by hash mod 5. Going from N to N + 1 nodes moves about N / (N + 1), and 2 × 200 / 6 keys, split into 10 salted keys.';
    expect([...text.matchAll(SHARDING_KEEP)].map((k) => k[0])).toEqual([
      'p99 230 ms',
      '39 keys',
      '(200 / 5)',
      '3,688,624,336 mod 5 = 1',
      'hash mod 5',
      'N + 1 nodes',
      'N / (N + 1)',
      '2 × 200 / 6 keys',
      '10 salted keys',
    ]);
  });

  it('say every scenario in full sentences, with no false claim and no sentence opening on a numeral', () => {
    const out: string[] = [];
    for (const { settings, from, back } of shardScenarios()) {
      const sc = shardScenario(settings, from, back);
      const id = name(settings, from, back);
      const sentences = [summary(sc), story(sc), standing(sc), rule(sc), rule(sc, true), describeSaid(sc)];
      if (sc.change) sentences.push(...changeStory(sc), ...changeStory(sc, { hot: false, short: true }));
      const words = [
        ...sentences,
        ...goalChecks(sc).map((g) => g.text),
        goalMini(sc),
        ...[true, false].map((c) => describeTable(sc, c).rows.flat().join(' | ')),
        downCaption(sc, false, sc.busiest),
        sc.change ? changeLabel(sc.change) : '',
      ];
      for (const t of words) for (const g of FALSE_CLAIMS) if (g.test(t)) out.push(`${id}: ${g} in "${t}"`);
      for (const t of sentences) {
        if (!/^[A-Z].*\.$/s.test(t) && !/^user:\d+/.test(t)) out.push(`${id}: not a sentence: "${t}"`);
        for (const part of sentencesOf(t)) if (/^\d/.test(part)) out.push(`${id}: a sentence opens on a numeral: "${part}"`);
      }
    }
    expect(out).toEqual([]);
  });

  it('hold every story to the picture by rule', () => {
    const out: string[] = [];
    const at = shardPositions().keys;
    for (const { settings: s, from, back } of shardScenarios()) {
      const sc = shardScenario(s, from, back);
      const id = name(s, from, back);
      const standingLine = standing(sc);
      if (/fullest shards/.test(standingLine) !== sc.now.members.filter((m) => sc.now.counts[m] === sc.now.counts[sc.fullest]).length > 1)
        out.push(`${id}: a tie is named as one only when it is one`);
      const c = sc.change;
      if (!c) continue;
      const text = changeStory(sc).join(' ');
      const check = (ok: boolean, what: string) => !ok && out.push(`${id}: ${what} in "${text}"`);
      check(!/^All \d+ moved to/.test(text) || c.toJoined === c.moved, '"All moved to" when not all did');
      check(!/^Only [A-F]'s/.test(text) || (c.fromLeft === c.moved && c.moved === c.leftHeld), '"Only X\'s keys moved" when not so');
      check(
        !/next point clockwise/.test(text) || (sc.scheme === 'ring' && s.points === 1),
        '"the next point clockwise" without one point a node',
      );
      check(
        /hot key moved/.test(text) === (!!s.hot && !s.split && !!c.hotMoved),
        "the hot key's move said when it did not move, or not said",
      );
      const twin = /is cheap under hash mod N/.test(text);
      check(twin === (sc.scheme === 'mod' && c.between === 0 && c.moved > 0), 'the twins sentence');
      if (twin) {
        const [lo, hi] = [
          Math.min(c.before.members.length, c.after.members.length),
          Math.max(c.before.members.length, c.after.members.length),
        ];
        check(hi === 2 * lo, 'the twins sentence on no doubling');
        check(
          at.every((h) => h % hi === h % lo || h % hi === (h % lo) + lo),
          'a remainder that is not its twin',
        );
      }
      check(c.kind !== 'down' || /a dead node sends nothing/.test(text), 'a failure that does not say the dead node sends nothing');
      check(!/new owner serves/.test(text) || c.after.members.filter((m) => c.into[m] > 0).length === 1, '"the new owner" of several');
      check(!/new owners serve/.test(text) || c.after.members.filter((m) => c.into[m] > 0).length > 1, '"the new owners" of one');
      check(Object.values(c.into).reduce((a, b) => a + b, 0) === c.moved, 'in rows that do not add up');
      const head = story(sc);
      check(
        head.startsWith(`${changeLabel(c)[0].toUpperCase()}${changeLabel(c).slice(1)}, and `),
        'a notice that does not open on its change',
      );
    }
    expect(out).toEqual([]);
  });

  it('say each sentence of Describe once, in every scenario', () => {
    for (const { settings, from, back } of shardScenarios()) {
      const said = sentencesOf(describeSaid(shardScenario(settings, from, back)));
      expect(
        said.filter((t, i) => said.indexOf(t) !== i),
        name(settings, from, back),
      ).toEqual([]);
    }
  });

  it('call a down node that comes back a return at every setting, whatever its letter, with no even share for a joiner', () => {
    for (const s of SHARD_SETTINGS.filter((x) => x.down)) {
      const down = shardScenario(s);
      const back = shardScenario({ ...s, down: 0 }, down.now.members, true);
      expect(changeLabel(back.change!), name(s, down.now.members, true)).toBe(`${down.downNode} came back`);
      expect(story(back)).not.toMatch(/An even share for/);
      // The same node set reached with the Nodes control is a join.
      const join = shardScenario({ ...s, down: 0 }, down.now.members);
      expect(join.change!.kind).toBe('join');
    }
  });

  it('say why the node down changed when the hot key or its split makes another node the busiest', () => {
    const out: string[] = [];
    for (const s of SHARD_SETTINGS.filter((x) => x.down && x.hot)) {
      for (const other of [
        { ...s, split: 1 - s.split },
        { ...s, hot: 0, split: 0 },
      ]) {
        const was = shardScenario(other).downNode!;
        const sc = shardScenario(s);
        if (was === sc.downNode) continue;
        const t = swapStory(sc, was);
        if (!t.includes(`${sc.downNode} is the busiest node, so ${sc.downNode} is the one down instead of ${was}.`)) out.push(t);
        if (!t.endsWith(story(sc))) out.push(`no story: ${t}`);
      }
    }
    expect(out).toEqual([]);
    const challenge = shardScenario({ scheme: 0, points: 100, nodes: 5, hot: 1, split: 1, down: 1 });
    expect(swapStory(challenge, 'A')).toMatch(
      /^With the hot key split, E is the busiest node, so E is the one down instead of A\. E went down, and 39 of the 200 keys moved\./,
    );
  });

  it('hide the act’s numbers only while the answer plays, and the learner’s last change while it asks', () => {
    expect(HIDE_PHASE).toEqual({ after: 'playing' });
    expect(hiding(['after'], 'asking')).toEqual({ after: false, ghost: true, any: true });
    expect(hiding(['after'], 'playing')).toEqual({ after: true, ghost: false, any: true });
    expect(hiding(['after'], 'revealed')).toEqual({ after: false, ghost: false, any: false });
    expect(hiding([], 'playing')).toEqual({ after: false, ghost: false, any: false });
    // A planted leak: the region hidden in the wrong phase shows the act's numbers while the answer plays.
    expect(hiding(['after'], 'playing', { after: 'asking' }).after).toBe(false);
  });

  it('name no node in the down caption while a question waits or plays', () => {
    for (const s of SHARD_SETTINGS) {
      const sc = shardScenario(s);
      const caption = downCaption(sc, true, sc.busiest);
      for (const m of SHARD_NAMES) expect(caption).not.toMatch(new RegExp(`\\b${m}\\b`));
    }
  });

  it('keep every notice and verdict line a full sentence, never blank', () => {
    for (const t of [
      ...Object.values(NOTICE),
      VERDICT.free,
      VERDICT.ask,
      VERDICT.replaceHidden,
      VERDICT.replacePlaying,
      VERDICT.hiddenStory,
    ])
      expect(t).toMatch(/^[A-Z].*\.$/);
    expect(VERDICT.playing(1)).toBe('Counting each key as it lands; 1 key is in flight.');
    expect(VERDICT.playing(5)).toBe('Counting each key as it lands; 5 keys are in flight.');
    expect(VERDICT.playing(0)).toBe('Counting each key as it lands.');
    expect(VERDICT.hiddenStanding(true)).toBe('The busiest shard shows at the reveal.');
  });

  it('say the stories the brief quotes, word for word', () => {
    const four = SHARD_NAMES.slice(0, 4);
    const ring = shardScenario({ scheme: 0, points: 100, nodes: 5, hot: 0, split: 0, down: 0 }, four);
    expect(story(ring)).toBe(
      'E joined, and 39 of the 200 keys moved. All 39 moved to E: 13 from A, 10 from B, 5 from C and 11 from D. An even share for E is 40 (200 / 5).',
    );
    const mod = shardScenario({ scheme: 1, points: 100, nodes: 5, hot: 0, split: 0, down: 0 }, four);
    expect(changeStory(mod)[0]).toBe(
      'Only 47 of them moved to E; the other 119 changed places among A, B, C and D, because hash mod 5 places every key again.',
    );
    expect(rule(mod)).toBe('user:119 hashes to 3,688,624,336, and 3,688,624,336 mod 5 = 1: the second node, B, holds it. It was on A.');
    expect(rule(ring)).toBe(
      "user:119 hashes to 85.88% of the way around. The next point clockwise, at 85.98%, is one of E's, so E holds it. It was on D.",
    );
    const lost = shardScenario({ scheme: 0, points: 1, nodes: 4, hot: 0, split: 0, down: 1 });
    expect(changeStory(lost)).toEqual([
      "Only A's 107 keys moved, all to C, the next point clockwise.",
      'C went from 73 keys to 180.',
      'The new owner serves them from its copies: a dead node sends nothing.',
    ]);
    const hot = shardScenario({ scheme: 0, points: 100, nodes: 4, hot: 1, split: 0, down: 0 });
    expect(standing(hot)).toBe(
      'A is the busiest shard with 48.6% of the traffic; an even share is 25%. The hot key alone carries 30%, on A.',
    );
    const start = shardScenario({ scheme: 1, points: 1, nodes: 4, hot: 1, split: 0, down: 1 });
    expect(goalChecks(start).map((g) => g.text)).toEqual([
      'the busiest shard left carries 59.8% of the traffic, needs under 30%: not yet',
      'the failure moved 161 keys, needs fewer than 50: not yet',
      'the cluster has 4 nodes, needs fewer than 6: met',
    ]);
    expect(goalMini(start)).toBe('1 of 3 met: busiest shard not yet · keys moved not yet · nodes met');
  });
});
