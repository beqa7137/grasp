import {
  SHARD_CHALLENGE_BOUNDS,
  SHARD_FOLLOW,
  SHARD_HOT_PCT,
  SHARD_K,
  SHARD_KEY_NAMES,
  SHARD_NAMES,
  SHARD_SALTS,
  shardList,
  shardNum,
  shardOrList,
  shardPct,
  shardPctCol,
  shardPctColOf,
  shardPctOf,
  shardPointFor,
  shardPositions,
  shardRound,
  shardShare,
  type ShardChange,
  type ShardScenario,
} from '@grasp/engine';

/**
 * Every sentence the Sharding widget says, and the one `hiding()` map from an open question's regions to every surface
 * (prevention 1). Each sentence is computed for its scenario and held to it by rule (ring-words.spec).
 */

/**
 * What a line never breaks inside, for every `g-code-text` in the widget: a number and its unit, a percentile with its
 * value ("p99 69 ms"), an arithmetic expression of numbers or single letters with its counted unit ("(200 / 5)", "N + 1
 * nodes", "N / (N + 1)"), a count with its counted unit, with one word between them or none ("39 keys", "10 salted
 * keys"), and a remainder ("hash mod 5", "3,688,624,336 mod 5 = 1").
 */
export const SHARDING_KEEP =
  /(?:\bp\d{2,3} )?\d[\d,.]* (?:ns|µs|ms|s|min|KB|MB|GB|TB)\b|\(?(?:\d[\d,.]*|\b[A-Z]\b)(?: [+−×/] \(?(?:\d[\d,.]*|[A-Z])\)?)+\)?(?: (?:keys?|nodes?|points?|shards?)\b)?|\bhash mod (?:\d+|N)\b|\d[\d,]* mod \d+ = \d+|\d[\d,.]*%? (?:[a-z]+ )?(?:keys?|nodes?|points?|shards?)\b/g;

export type QuestionPhase = 'rest' | 'asking' | 'playing' | 'revealed';

/** The phase each region an experiment names hides in: `after` while the answer plays. */
export const HIDE_PHASE: Readonly<Record<string, QuestionPhase>> = { after: 'playing' };

export interface Hid {
  /** While an answer plays: every number the model gives for the act's new setting. */
  after: boolean;
  /** While any question asks: no trace of a change made before the card. */
  ghost: boolean;
  /** Anything hidden at all, so Describe waits. */
  any: boolean;
}
export const NOTHING_HIDDEN: Hid = { after: false, ghost: false, any: false };

/** What an open question hides, on every surface: the regions it names, in the phase each region hides in. */
export function hiding(hide: readonly string[], phase: QuestionPhase, when: Readonly<Record<string, QuestionPhase>> = HIDE_PHASE): Hid {
  const after = hide.some((r) => r === 'after' && when[r] === phase);
  const ghost = phase === 'asking';
  return { after, ghost, any: after || ghost };
}

const nodesWord = (n: number) => `${n} ${n === 1 ? 'node' : 'nodes'}`;
export const keysWord = (n: number) => `${shardNum(n)} ${n === 1 ? 'key' : 'keys'}`;
const pointsWord = (n: number) => `${shardNum(n)} ${n === 1 ? 'point' : 'points'}`;
const cap = (t: string) => t.replace(/^./, (x) => x.toUpperCase());
const parts = (counts: Readonly<Record<string, number>>, word: string) =>
  shardList(SHARD_NAMES.filter((m) => counts[m] > 0).map((m) => `${shardNum(counts[m])} ${word} ${m}`));
const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

/** The headline's label for the last change: "E joined", "C went down". */
export function changeLabel(c: ShardChange): string {
  if (c.kind === 'down') return `${shardList(c.left)} went down`;
  if (c.kind === 'back') return `${shardList(c.joined)} came back`;
  if (c.joined.length && c.left.length) return `${shardList(c.joined)} joined, ${shardList(c.left)} left`;
  return c.joined.length ? `${shardList(c.joined)} joined` : `${shardList(c.left)} left`;
}

/** Why doubling (or halving) is a cheap change under hash mod N. */
function twins(n: number, n2: number, kind: 'join' | 'leave', short: boolean): string {
  if (short)
    return kind === 'join'
      ? `Doubling is cheap under hash mod N: each key stays or moves ${n} nodes on, to its node's twin.`
      : `Halving is cheap under hash mod N: each node that left hands its keys to its twin, ${n} nodes back.`;
  return kind === 'join'
    ? `Doubling is cheap under hash mod N: a key's remainder for ${n2} is its remainder for ${n} or that plus ${n}, so it stays or moves to its node's new twin.`
    : `Halving is cheap under hash mod N: a key's remainder for ${n} is its remainder for ${n2} or that minus ${n}, so each node that left hands its keys to one twin.`;
}

/**
 * The sentences under the headline: where the moved keys went, against what had to move. `hot: false` leaves out the
 * hot key's sentence (a narrow stage draws that fact on the hot block), `short` the twins sentence's long form.
 */
export function changeStory(sc: ShardScenario, { hot = true, short = false } = {}): string[] {
  const c = sc.change!;
  const out: string[] = [];
  const stayers = c.after.members.filter((m) => !c.joined.includes(m));
  if (c.moved === 0) return ["No key moved: no key's hash falls in an arc that changed owner."];
  if (c.joined.length && !c.left.length) {
    const many = c.joined.length > 1;
    const ideal = `An even share for ${shardList(c.joined)}${many ? ' together' : ''} is ${shardShare(c.ideal!)} (${many ? `${c.joined.length} × ` : ''}${SHARD_K} / ${c.after.members.length}).`;
    if (c.toJoined === c.moved) {
      const sources = SHARD_NAMES.filter((m) => c.out[m] > 0);
      const where = many
        ? short
          ? `to ${shardOrList(c.joined)}`
          : `to ${shardOrList(c.joined)}: ${parts(c.into, 'to')}`
        : sources.length === 1
          ? `to ${c.joined[0]}, ${c.moved === 1 ? 'from' : 'every one from'} ${sources[0]}`
          : `to ${c.joined[0]}: ${parts(c.out, 'from')}`;
      out.push(c.moved === 1 ? `The one key moved ${where}.` : `All ${shardNum(c.moved)} moved ${where}.`);
      if (sc.scheme === 'mod' && c.between === 0 && c.after.members.length === 2 * c.before.members.length)
        out.push(twins(c.before.members.length, c.after.members.length, 'join', short));
    } else
      out.push(
        `Only ${shardNum(c.toJoined)} of them moved to ${shardList(c.joined)}; the other ${shardNum(c.moved - c.toJoined)} changed places among ${shardList(stayers)}, because hash mod ${c.after.members.length} places every key again.`,
      );
    if (c.kind !== 'back') out.push(ideal);
  } else if (c.left.length && !c.joined.length) {
    const who = shardList(c.left);
    const dests = c.after.members.filter((m) => c.into[m] > 0);
    if (c.fromLeft === c.moved) {
      const one = dests.length === 1;
      const next = sc.settings.points === 1 && sc.scheme === 'ring' ? ', the next point clockwise' : '';
      out.push(`Only ${who}'s ${keysWord(c.leftHeld)} moved${one ? `, all to ${dests[0]}${next}` : `: ${parts(c.into, 'to')}`}.`);
      if (one && c.kind === 'down')
        out.push(`${dests[0]} went from ${keysWord(c.before.counts[dests[0]])} to ${shardNum(c.after.counts[dests[0]])}.`);
      if (sc.scheme === 'mod' && c.between === 0 && 2 * c.after.members.length === c.before.members.length)
        out.push(twins(c.after.members.length, c.before.members.length, 'leave', short));
    } else
      out.push(
        `${who} held ${keysWord(c.leftHeld)}, but ${shardNum(c.moved)} moved: hash mod ${c.after.members.length} places every key again, so ${shardNum(c.moved - c.fromLeft)} changed places among nodes that stayed.`,
      );
    if (c.kind === 'down')
      out.push(
        sc.scheme === 'ring'
          ? dests.length === 1
            ? 'The new owner serves them from its copies: a dead node sends nothing.'
            : 'The new owners serve them from their copies: a dead node sends nothing.'
          : `${who}'s own keys come from their copies: a dead node sends nothing.`,
      );
  } else
    out.push(
      `${shardNum(c.toJoined)} moved to ${shardList(c.joined)}, ${shardNum(c.fromLeft)} left ${shardList(c.left)}, and ${shardNum(c.between)} changed places among the rest.`,
    );
  if (hot && c.hotMoved && sc.settings.hot && !sc.settings.split)
    out.push(`The hot key moved with them, from ${c.hotMoved.from} to ${c.hotMoved.to}.`);
  return out;
}

/** The standing line: the fullest shard by keys, or the busiest by traffic once a hot key skews it. */
export function standing(sc: ShardScenario, { hotLine = true } = {}): string {
  const s = sc.settings;
  if (!s.hot) {
    const f = sc.fullest;
    const tied = sc.now.members.filter((m) => sc.now.counts[m] === sc.now.counts[f]);
    const even = `an even share is ${shardShare(sc.fairKeys)}`;
    return tied.length > 1
      ? `${shardList(tied)} are the fullest shards with ${keysWord(sc.now.counts[f])} each; ${even}.`
      : `${f} is the fullest shard with ${keysWord(sc.now.counts[f])}; ${even}.`;
  }
  const b = sc.busiest;
  const hotText = s.split
    ? `The hot key is split into ${SHARD_SALTS} keys of ${SHARD_HOT_PCT / SHARD_SALTS}% each, on ${sc.hotOn.length === 1 ? '1 shard' : `${sc.hotOn.length} shards`}.`
    : `The hot key alone carries ${SHARD_HOT_PCT}%, on ${sc.now.hot}.`;
  const head = `${b} is the busiest shard with ${shardPct(sc.traffic[b])} of the traffic; an even share is ${shardPctOf(sc.fairTenths / 10)}.`;
  return hotLine ? `${head} ${hotText}` : head;
}

const FOLLOW_KEY = SHARD_KEY_NAMES[SHARD_FOLLOW];
/** The rule line: the followed key's hash deciding its shard, as a full sentence in a long and a short form. */
export function rule(sc: ShardScenario, short = false): string {
  const at = shardPositions().keys[SHARD_FOLLOW];
  const owner = sc.now.owners[SHARD_FOLLOW];
  const before = sc.change?.before.owners[SHARD_FOLLOW];
  const was = before && before !== owner ? before : null;
  if (sc.scheme === 'mod') {
    const n = sc.now.members.length;
    const r = at % n;
    if (short)
      return `${FOLLOW_KEY}'s hash mod ${n} is ${r}, so the ${ORDINAL[r]} node, ${owner}, holds it${was ? ` (it was on ${was})` : ''}.`;
    return `${FOLLOW_KEY} hashes to ${shardNum(at)}, and ${shardNum(at)} mod ${n} = ${r}: the ${ORDINAL[r]} node, ${owner}, holds it${was ? `. It was on ${was}` : ''}.`;
  }
  const p = shardPointFor(sc.now.ring!, at);
  const whose = sc.settings.points === 1 ? `${owner}'s` : `one of ${owner}'s`;
  if (short)
    return `${FOLLOW_KEY} hashes to ${shardRound(at)} of the way around; the next point clockwise is ${whose}, so ${owner} holds it${was ? ` (it was on ${was})` : ''}.`;
  return `${FOLLOW_KEY} hashes to ${shardRound(at)} of the way around. The next point clockwise, at ${shardRound(p.at)}${p.at < at ? ' past the top' : ''}, is ${whose}, so ${owner} holds it${was ? `. It was on ${was}` : ''}.`;
}
/** The rule line while a play runs or hides its answer: only the hash, nothing about a node the picture may show. */
export const ruleHashOnly = (ring: boolean) =>
  ring
    ? `${FOLLOW_KEY} hashes to ${shardRound(shardPositions().keys[SHARD_FOLLOW])} of the way around.`
    : `${FOLLOW_KEY} hashes to ${shardNum(shardPositions().keys[SHARD_FOLLOW])}.`;

/** The summary without its standing line: what each node holds, and the last change's count. */
function summaryHead(sc: ShardScenario): string {
  const s = sc.settings;
  const order = sc.now.members;
  const by = sc.scheme === 'mod' ? `Placing by hash mod ${order.length}` : `A consistent-hash ring with ${pointsWord(s.points)} a node`;
  const where = sc.downNode ? `the ${nodesWord(order.length)} left with ${sc.downNode} down` : nodesWord(order.length);
  const head = `${by} puts the ${shardNum(SHARD_K)} keys on ${where}: ${shardList(order.map((m) => `${m} holds ${shardNum(sc.now.counts[m])}`))}.`;
  const c = sc.change;
  const moved = c ? ` ${cap(changeLabel(c))}: ${shardNum(c.moved)} of the ${shardNum(SHARD_K)} keys moved.` : '';
  return `${head}${moved}`;
}

/** The stage's summary sentence: its accessible description and the notice after a change that is no move. */
export const summary = (sc: ShardScenario) => `${summaryHead(sc)}${sc.settings.hot ? ` ${standing(sc)}` : ''}`;

/** What a change of the node set did, for the notice: its label, its count and its story. */
export function story(sc: ShardScenario): string {
  const c = sc.change;
  if (!c) return summary(sc);
  const n = c.moved === 1 ? 'one key' : c.moved === 0 ? 'none' : shardNum(c.moved);
  return `${cap(changeLabel(c))}, and ${n} of the ${shardNum(SHARD_K)} keys moved. ${changeStory(sc).join(' ')}`;
}

/**
 * The notice when the hot key or its split changes which node is busiest while the busiest is down: the failed node is
 * a different one now, so the notice says why before the failure's story.
 */
export function swapStory(sc: ShardScenario, was: string): string {
  const s = sc.settings;
  const why = !s.hot ? 'Without the hot key' : s.split ? 'With the hot key split' : 'With the hot key whole';
  return `${why}, ${sc.downNode} is the busiest node, so ${sc.downNode} is the one down instead of ${was}. ${story(sc)}`;
}

/** The stage summary under the hiding map: while an answer plays, only the setup's, and that its counts wait. */
export function stageSummary(sc: ShardScenario, hid: Hid, setup: ShardScenario | null): string {
  if (hid.after && setup) return `${summary(setup)} The answer is playing; its counts show at the reveal.`;
  return summary(sc);
}

export const NOTICE = {
  rest: 'Change the placement, the points, the nodes or the conditions. Replay shows the last change again.',
  asking: 'Replay and the settings wait for your answer.',
  playing: 'The answer is playing on the picture.',
  moving: 'The keys that change node are moving.',
};

/** The last change block's words before any node joins or leaves; it never says that no key moved. */
export const VERDICT = {
  free: 'Change the nodes, or take the busiest node down, and watch which keys move.',
  ask: "The answer's change shows here.",
  replaceHidden: 'What each node holds with the new points shows at the reveal.',
  replacePlaying: 'Each key moves to the owner of the first point clockwise from its hash.',
  hiddenStory: 'Which keys moved, and where, shows at the reveal.',
  hiddenStanding: (hot: boolean) => `The ${hot ? 'busiest' : 'fullest'} shard shows at the reveal.`,
  playing: (n: number) => `Counting each key as it lands${n ? `; ${shardNum(n)} ${n === 1 ? 'key is' : 'keys are'} in flight` : ''}.`,
};

/** The Busiest node down toggle's caption, through the hiding map: while a question asks or plays it names no node. */
export function downCaption(sc: ShardScenario, locked: boolean, busiestUp: string): string {
  if (locked) return sc.settings.down ? 'The busiest node is down' : 'The busiest node would fail';
  return sc.settings.down ? `${sc.downNode} is down: its keys moved` : `${busiestUp} would fail: its keys must move`;
}

export const SIMPLIFIED = `The model: ${shardNum(SHARD_K)} keys of equal size, each hashed once. Every key gets the same traffic unless the hot key is on, and a move is counted, not timed. A failed node's keys are drawn moving to their new owners; in a real cluster those owners already hold copies or reload them. Under hash mod N a node that goes down is dropped from N; real systems keep N and promote a replica to avoid exactly this reshuffle.`;

export interface DescribeRow {
  node: string;
  down: boolean;
  points: string;
  ring: string;
  keys: string;
  traffic: string;
  into: string;
  out: string;
}

/** Describe's rows: one per node of the cluster, a down node included. */
export function describeRows(sc: ShardScenario): DescribeRow[] {
  const c = sc.change;
  return sc.names.map((m) => {
    const up = sc.now.members.includes(m);
    const ring = sc.scheme === 'ring';
    return {
      node: m,
      down: !up,
      points: ring && up ? shardNum(sc.settings.points) : 'none',
      ring: ring ? (up ? shardPctColOf(sc.now.ringShare[m] * 100) : 'none') : 'no ring',
      keys: up ? shardNum(sc.now.counts[m]) : 'none',
      traffic: up ? shardPctCol(sc.traffic[m]) : 'none',
      into: c ? (c.into[m] ? `+${shardNum(c.into[m])}` : '0') : 'no change yet',
      out: c ? (c.out[m] ? `−${shardNum(c.out[m])}` : '0') : 'no change yet',
    };
  });
}

/** Describe's table at a width: the full form, or five columns that fit 320 px. */
export function describeTable(sc: ShardScenario, compact: boolean): { head: string[]; rows: string[][] } {
  const ring = sc.scheme === 'ring';
  const rows = describeRows(sc);
  const node = (r: DescribeRow) => (r.down ? `${r.node}, down` : r.node);
  if (compact)
    return {
      head: ['Node', 'Keys', 'Traffic', 'In', 'Out'],
      rows: rows.map((r) => [node(r), r.keys, r.traffic, r.into, r.out].map((v) => v.replace('no change yet', 'none yet'))),
    };
  return {
    head: ['Node', ...(ring ? ['Points (virtual nodes)', 'Of the ring'] : []), 'Keys', 'Traffic', 'Moved in', 'Moved out'],
    rows: rows.map((r) => [node(r), ...(ring ? [r.points, r.ring] : []), r.keys, r.traffic, r.into, r.out]),
  };
}
export const DESCRIBE_WIDE_FROM = 560;

/** Describe's sentences: the story or the summary's head, the standing line and the rule line, each said once. */
export const describeSaid = (sc: ShardScenario) => `${sc.change ? story(sc) : summaryHead(sc)} ${standing(sc)} ${rule(sc)}`;

export interface GoalLine {
  met: boolean;
  text: string;
}
/** The dock's checklist for the challenge: a line per bound with its state in words. */
export function goalChecks(sc: ShardScenario): GoalLine[] {
  const m = sc.metrics;
  const b = SHARD_CHALLENGE_BOUNDS;
  const line = (met: boolean, text: string) => ({ met, text: `${text}: ${met ? 'met' : 'not yet'}` });
  return [
    line(
      m.busiest < b.busiest,
      `the busiest shard left carries ${shardPct(sc.traffic[sc.busiest])} of the traffic, needs under ${b.busiest}%`,
    ),
    line(m.moved < b.moved, `the failure moved ${keysWord(m.moved)}, needs fewer than ${b.moved}`),
    line(m.nodes < b.nodes, `the cluster has ${nodesWord(m.nodes)}, needs fewer than ${b.nodes}`),
  ];
}
/** The challenge's compact checklist under the controls on a narrow layout (aria-hidden: the dock is the source). */
export function goalMini(sc: ShardScenario): string {
  const checks = goalChecks(sc);
  const short = ['busiest shard', 'keys moved', 'nodes'];
  return `${checks.filter((c) => c.met).length} of ${checks.length} met: ${checks.map((c, i) => `${short[i]} ${c.met ? 'met' : 'not yet'}`).join(' · ')}`;
}
