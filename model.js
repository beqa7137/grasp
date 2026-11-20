// The Sharding widget's model, for the mockup (browser) and enum.cjs (Node). The engine port is
// libs/engine/src/sysdesign/lessons/widgets/sharding.ts. It keeps the engine's `hash32` and tie rule; the old ring
// widget and its `hashRing`, `ringOwner`, `moduloOwner`, `place` and `movedKeys` go with this change (nothing else calls
// them), so the point names are free: `A#0/10175` ... `A#99/10175`. The salt was chosen by a search with hard bounds
// (enum.cjs, section 10): with it the instance shows what the theory says, so one point a node is the least even, 10
// points a node more even and 100 the most, at every node count.
//
// Every number the learner reads is a count over one fixed set: 200 keys `user:0` ... `user:199`, hashed by `hash32`.
// Nothing is sampled and nothing is random at run time, so every count is exact for this set; the ideal (K / N) is
// always named as the ideal.
(function (root) {
  'use strict';

  const K = 200;
  const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
  const NODE_COUNTS = [3, 4, 5, 6];
  const POINTS = [1, 10, 100];
  const TURN = 2 ** 32;
  /** The hot key is one more key beside the 200, so the 200 keys' counts never change with it. It carries 30% of all
   * traffic; the 200 ordinary keys share the other 70% equally (0.35% each). Split, it is 10 salted keys of 3% each. */
  const HOT_KEY = 'user:hot';
  const HOT_PCT = 30;
  const SALTS = 10;
  /** The salt of every point name. */
  const POINT_SALT = '/10175';
  /** The key the rule line and the closer look follow, chosen by rule (enum.cjs, section 6): it moves in E1, moves to E
   * in E2 and is one of the failed node's keys in E4, and its neighbours by hash look random under every modulus. */
  const FOLLOW = 119;
  /** A play's clock, as fractions of its length: the points land, a hand sweeps the ring once and each moved key takes
   * off as the hand passes its hash, and a flight lasts `flight`. The length is `baseMs` plus `perKeyMs` a moved key.
   * No flight is shorter than 120 ms and no more than `pool` keys are ever in flight at once (enum.cjs checks both). */
  const PLAY = { points: 0.12, sweep0: 0.26, sweep1: 0.82, flight: 0.12, baseMs: 2400, perKeyMs: 12, pool: 60 };
  const playMs = (moved) => PLAY.baseMs + PLAY.perKeyMs * moved;
  /** When a moved key leaves its pile, as a fraction of the play's clock. */
  const takeoff = (key) => PLAY.sweep0 + (PLAY.sweep1 - PLAY.sweep0) * (KEY_AT_OF(key) / TURN);

  /** 32-bit FNV-1a, then MurmurHash3's finalizer (widgets.ts, byte for byte). */
  function hash32(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  const KEYS = Array.from({ length: K }, (_, i) => `user:${i}`);
  const KEY_AT = KEYS.map(hash32);
  const KEY_AT_OF = (key) => KEY_AT[key];
  const HOT_AT = hash32(HOT_KEY);
  const SALT_KEYS = Array.from({ length: SALTS }, (_, i) => `${HOT_KEY}#${i}`);
  const SALT_AT = SALT_KEYS.map(hash32);

  // ---------------------------------------------------------------- placement
  /** Each node takes `points` points on a ring of 2^32 positions, sorted by position. */
  function ringPoints(members, points) {
    const ring = [];
    for (const node of members) for (let v = 0; v < points; v++) ring.push({ node, v, at: hash32(`${node}#${v}${POINT_SALT}`) });
    return ring.sort((a, b) => a.at - b.at);
  }

  /** The first point at or clockwise of `at` (the engine's `ringOwner` rule), wrapping to the first point. */
  function pointFor(ring, at) {
    let lo = 0;
    let hi = ring.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ring[mid].at < at) lo = mid + 1;
      else hi = mid;
    }
    return ring[lo % ring.length];
  }

  const memo = new Map();
  /** Where every key lives for one set of nodes. `scheme` is 'ring' or 'mod'; `points` is ignored by 'mod'. */
  function place(scheme, points, members) {
    const id = `${scheme}|${scheme === 'mod' ? 0 : points}|${members.join('')}`;
    const hit = memo.get(id);
    if (hit) return hit;
    const ring = scheme === 'ring' ? ringPoints(members, points) : null;
    const ownerAt = ring ? (at) => pointFor(ring, at).node : (at) => members[at % members.length];
    const owners = KEY_AT.map(ownerAt);
    const counts = {};
    for (const m of members) counts[m] = 0;
    for (const o of owners) counts[o]++;
    const ringShare = {};
    if (ring) {
      for (const m of members) ringShare[m] = 0;
      ring.forEach((p, i) => {
        const prev = ring[(i - 1 + ring.length) % ring.length].at;
        ringShare[p.node] += (p.at - prev + (p.at > prev ? 0 : TURN)) / TURN;
      });
    }
    const placed = { scheme, points: ring ? points : 0, members, ring, owners, counts, ringShare, hot: ownerAt(HOT_AT), salts: SALT_AT.map(ownerAt) };
    memo.set(id, placed);
    return placed;
  }

  /** A node's share of traffic in tenths of a percent, in whole-number arithmetic so a half never rounds two ways.
   * Even traffic: count / 200. A hot key: 70% over the 200 keys, 30% on the hot key or a tenth of it per salted key. */
  function trafficTenths(placed, node, hot, split) {
    const c = placed.counts[node];
    if (!hot) return 5 * c;
    const s = split ? placed.salts.filter((o) => o === node).length : placed.hot === node ? SALTS : 0;
    return Math.floor((7 * c + 60 * s + 1) / 2);
  }

  function busiestOf(placed, hot, split) {
    let best = placed.members[0];
    for (const m of placed.members) if (trafficTenths(placed, m, hot, split) > trafficTenths(placed, best, hot, split)) best = m;
    return best;
  }
  function fullestOf(placed) {
    let best = placed.members[0];
    for (const m of placed.members) if (placed.counts[m] > placed.counts[best]) best = m;
    return best;
  }

  /** What one change of the node set did: every key that changed owner, exactly. */
  function diff(before, after) {
    const joined = after.members.filter((m) => !before.members.includes(m));
    const left = before.members.filter((m) => !after.members.includes(m));
    const moves = [];
    const into = {};
    const out = {};
    for (const m of new Set([...before.members, ...after.members])) into[m] = out[m] = 0;
    before.owners.forEach((from, key) => {
      const to = after.owners[key];
      if (from === to) return;
      moves.push({ key, from, to });
      out[from]++;
      into[to]++;
    });
    const toJoined = moves.filter((m) => joined.includes(m.to)).length;
    const fromLeft = moves.filter((m) => left.includes(m.from)).length;
    const between = moves.filter((m) => !joined.includes(m.to) && !left.includes(m.from)).length;
    return {
      before,
      after,
      joined,
      left,
      moves,
      moved: moves.length,
      into,
      out,
      toJoined,
      fromLeft,
      between,
      /** The keys the nodes that left held: exactly what must move. */
      leftHeld: left.reduce((a, m) => a + before.counts[m], 0),
      /** The even share of the nodes that joined, named as the ideal wherever it is read. */
      ideal: joined.length ? (K * joined.length) / after.members.length : null,
      hotMoved: before.hot !== after.hot ? { from: before.hot, to: after.hot } : null,
    };
  }

  // ---------------------------------------------------------------- settings
  /** Settings are numbers, as `ExperimentSettings` requires: `scheme` 0 ring, 1 hash mod N; `points` 1, 10 or 100;
   * `nodes` 3 to 6 (the first letters); `hot`, `split` and `down` 0 or 1. Down takes out the busiest node by traffic. */
  const BASE = { scheme: 0, points: 100, nodes: 4, hot: 0, split: 0, down: 0 };
  const schemeOf = (s) => (s.scheme === 1 ? 'mod' : 'ring');
  const namesOf = (s) => NAMES.slice(0, s.nodes);
  const normal = (s) => ({ ...s, split: s.hot ? s.split : 0 });

  /** Every setting the controls reach (hash mod N has no points, so its three stops are one setting). */
  function allSettings() {
    const out = [];
    for (const scheme of [0, 1])
      for (const points of scheme ? [100] : POINTS)
        for (const nodes of NODE_COUNTS)
          for (const hot of [0, 1]) for (const split of hot ? [0, 1] : [0]) for (const down of [0, 1]) out.push({ scheme, points, nodes, hot, split, down });
    return out;
  }

  /** The picture for one setting. `from` is the node set before the learner's last change (null: none); with a node
   * down the change is always the failure itself, so the stage and the challenge's numbers are a function of settings. */
  function scenario(settings, from = null) {
    const s = normal(settings);
    const scheme = schemeOf(s);
    const up = place(scheme, s.points, namesOf(s));
    const downNode = s.down ? busiestOf(up, s.hot, s.split) : null;
    const now = downNode ? place(scheme, s.points, up.members.filter((m) => m !== downNode)) : up;
    let change = null;
    if (downNode) change = { ...diff(up, now), kind: 'down' };
    else if (from && from.join('') !== now.members.join('')) {
      const before = place(scheme, s.points, from);
      const d = diff(before, now);
      const back = from.length === now.members.length - 1 && d.joined.length === 1 && NAMES.indexOf(d.joined[0]) < now.members.length - 1;
      change = { ...d, kind: back ? 'back' : d.joined.length ? 'join' : 'leave' };
    }
    const traffic = {};
    for (const m of now.members) traffic[m] = trafficTenths(now, m, s.hot, s.split);
    const busiest = busiestOf(now, s.hot, s.split);
    const fullest = fullestOf(now);
    return {
      settings: s,
      scheme,
      names: namesOf(s),
      up,
      now,
      downNode,
      change,
      traffic,
      busiest,
      fullest,
      fairKeys: K / now.members.length,
      fairTenths: 1000 / now.members.length,
      hotOn: s.split ? [...new Set(now.salts)].sort() : s.hot ? [now.hot] : [],
      metrics: { busiest: traffic[busiest] / 10, fullest: now.counts[fullest], moved: change ? change.moved : 0, nodes: s.nodes },
    };
  }

  // ---------------------------------------------------------------- formats
  const num = (n) => Math.round(n).toLocaleString('en-US');
  /** A share from tenths of a percent: "50%", "43.3%". */
  const pct = (tenths) => `${Number.isInteger(tenths / 10) ? tenths / 10 : (tenths / 10).toFixed(1)}%`;
  const pctOf = (x) => pct(Math.round(x * 10));
  /** A share in a table column, always with one decimal so the decimals align: "20.0%", "43.3%". */
  const pctCol = (tenths) => `${(tenths / 10).toFixed(1)}%`;
  const pctColOf = (x) => pctCol(Math.round(x * 10));
  const keys = (n) => `${num(n)} ${n === 1 ? 'key' : 'keys'}`;
  const times = (x) => `${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}×`;
  const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
  const orList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`);
  const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  /** How far round the ring a hash sits, as the stage prints it. */
  const round = (at) => `${((at / TURN) * 100).toFixed(2)}%`;
  /** A count that may be fractional (an even share of 6 nodes): "33.3", "40". */
  const share = (x) => (Number.isInteger(x) ? num(x) : (Math.round(x * 10) / 10).toFixed(1));

  // ---------------------------------------------------------------- words (ported to the app's ring-words.ts)
  const nodesWord = (n) => `${n} ${n === 1 ? 'node' : 'nodes'}`;
  function schemeWords(sc) {
    const s = sc.settings;
    return sc.scheme === 'mod' ? `hash mod ${sc.now.members.length}` : `a consistent-hash ring, ${s.points} ${s.points === 1 ? 'point' : 'points'} a node`;
  }
  const parts = (counts, order, word) => list(order.filter((m) => counts[m] > 0).map((m) => `${num(counts[m])} ${word} ${m}`));

  /** The headline's label for the last change. */
  function changeLabel(c) {
    if (c.kind === 'down') return `${list(c.left)} went down`;
    if (c.kind === 'back') return `${list(c.joined)} came back`;
    if (c.joined.length && c.left.length) return `${list(c.joined)} joined, ${list(c.left)} left`;
    return c.joined.length ? `${list(c.joined)} joined` : `${list(c.left)} left`;
  }

  /** The sentences under the headline: where the moved keys went, against what had to move. `hot: false` leaves out
   * the hot key's sentence (a narrow stage draws that fact on the hot block instead). */
  function changeStory(sc, { hot = true } = {}) {
    const c = sc.change;
    const order = NAMES;
    const out = [];
    const stayers = c.after.members.filter((m) => !c.joined.includes(m));
    if (c.moved === 0) return [`No key moved: no key's hash falls in an arc that changed owner.`];
    if (c.joined.length && !c.left.length) {
      const idealLine = `An even share for ${list(c.joined)}${c.joined.length > 1 ? ' together' : ''} is ${share(c.ideal)} (${c.joined.length > 1 ? `${c.joined.length} × ` : ''}${K} / ${c.after.members.length}).`;
      if (c.toJoined === c.moved) {
        const sources = order.filter((m) => c.out[m] > 0);
        const where =
          c.joined.length > 1
            ? `to ${orList(c.joined)}: ${parts(c.into, order, 'to')}`
            : sources.length === 1
              ? `to ${c.joined[0]}, ${c.moved === 1 ? 'from' : 'every one from'} ${sources[0]}`
              : `to ${c.joined[0]}: ${parts(c.out, order, 'from')}`;
        out.push(c.moved === 1 ? `The one key moved ${where}.` : `All ${num(c.moved)} moved ${where}.`);
        if (sc.scheme === 'mod' && c.between === 0 && c.after.members.length === 2 * c.before.members.length) out.push(twins(c.before.members.length, c.after.members.length, 'join'));
      } else {
        out.push(
          `Only ${num(c.toJoined)} of them moved to ${list(c.joined)}; the other ${num(c.moved - c.toJoined)} changed places among ${list(stayers)}, because hash mod ${c.after.members.length} places every key again.`,
        );
      }
      out.push(idealLine);
    } else if (c.left.length && !c.joined.length) {
      const who = list(c.left);
      if (c.fromLeft === c.moved) {
        const dests = c.after.members.filter((m) => c.into[m] > 0);
        const one = dests.length === 1;
        out.push(
          `Only ${who}'s ${keys(c.leftHeld)} moved${one ? `, all to ${dests[0]}${sc.settings.points === 1 && sc.scheme === 'ring' ? ', the next point clockwise' : ''}` : `: ${parts(c.into, order, 'to')}`}.`,
        );
        if (one && c.kind === 'down') out.push(`${dests[0]} went from ${keys(c.before.counts[dests[0]])} to ${num(c.after.counts[dests[0]])}.`);
        if (sc.scheme === 'mod' && c.between === 0 && 2 * c.after.members.length === c.before.members.length) out.push(twins(c.after.members.length, c.before.members.length, 'leave'));
      } else {
        out.push(
          `${who} held ${keys(c.leftHeld)}, but ${num(c.moved)} moved: hash mod ${c.after.members.length} places every key again, so ${num(c.moved - c.fromLeft)} changed places among nodes that stayed.`,
        );
      }
      if (c.kind === 'down') out.push(sc.scheme === 'ring' ? (c.after.members.filter((m) => c.into[m] > 0).length === 1 ? 'The new owner serves them from its copies: a dead node sends nothing.' : 'The new owners serve them from their copies: a dead node sends nothing.') : `${who}'s own keys come from their copies: a dead node sends nothing.`);
    } else {
      out.push(`${num(c.toJoined)} moved to ${list(c.joined)}, ${num(c.fromLeft)} left ${list(c.left)}, and ${num(c.between)} changed places among the rest.`);
    }
    if (hot && c.hotMoved && sc.settings.hot && !sc.settings.split) out.push(`The hot key moved with them, from ${c.hotMoved.from} to ${c.hotMoved.to}.`);
    return out;
  }
  /** Why doubling (or halving) is hash mod N's one cheap change: a key's remainder for 2n is its remainder for n, or
   * that plus n, so each key stays or moves between a node and its twin n places on. */
  function twins(n, n2, kind) {
    return kind === 'join'
      ? `Doubling is hash mod N's one cheap change: a key's remainder for ${n2} is its remainder for ${n} or that plus ${n}, so it stays or moves to its node's new twin.`
      : `Halving is hash mod N's one cheap shrink: a key's remainder for ${n} is its remainder for ${n2} or that less ${n}, so each node that left hands its keys to one twin.`;
  }

  /** The standing line: the fullest shard by keys, or the busiest by traffic once a hot key skews it. */
  function standing(sc, { hotLine = true } = {}) {
    const s = sc.settings;
    if (!s.hot) {
      const f = sc.fullest;
      const tied = sc.now.members.filter((m) => sc.now.counts[m] === sc.now.counts[f]);
      const even = `an even share is ${share(sc.fairKeys)}`;
      return tied.length > 1 ? `${list(tied)} are the fullest shards with ${keys(sc.now.counts[f])} each; ${even}.` : `${f} is the fullest shard with ${keys(sc.now.counts[f])}; ${even}.`;
    }
    const b = sc.busiest;
    const hotText = s.split ? `The hot key is split into ${SALTS} keys of ${HOT_PCT / SALTS}% each, on ${sc.hotOn.length === 1 ? '1 shard' : `${sc.hotOn.length} shards`}.` : `The hot key alone carries ${HOT_PCT}%, on ${sc.now.hot}.`;
    const head = `${b} is the busiest shard with ${pct(sc.traffic[b])} of the traffic; an even share is ${pctOf(sc.fairTenths / 10)}.`;
    return hotLine ? `${head} ${hotText}` : head;
  }

  /** The rule line: one key's hash deciding its shard, as a full sentence in a long and a short form. */
  function rule(sc, short = false) {
    const at = KEY_AT[FOLLOW];
    const key = KEYS[FOLLOW];
    const owner = sc.now.owners[FOLLOW];
    const was = sc.change && sc.change.before.owners[FOLLOW] !== owner ? sc.change.before.owners[FOLLOW] : null;
    if (sc.scheme === 'mod') {
      const n = sc.now.members.length;
      const r = at % n;
      if (short) return `${key}'s hash mod ${n} is ${r}, so the ${ORDINAL[r]} node, ${owner}, holds it${was ? ` (it was on ${was})` : ''}.`;
      return `${key} hashes to ${num(at)}, and ${num(at)} mod ${n} = ${r}: the ${ORDINAL[r]} node, ${owner}, holds it${was ? `. It was on ${was}` : ''}.`;
    }
    const p = pointFor(sc.now.ring, at);
    if (short) return `${key} hashes to ${round(at)} of the way round; the next point clockwise is ${sc.settings.points === 1 ? `${owner}'s` : `one of ${owner}'s`}, so ${owner} holds it${was ? ` (it was on ${was})` : ''}.`;
    return `${key} hashes to ${round(at)} of the way round. The next point clockwise, at ${round(p.at)}${p.at < at ? ' past the top' : ''}, is ${sc.settings.points === 1 ? `${owner}'s` : `one of ${owner}'s`}, so ${owner} holds it${was ? `. It was on ${was}` : ''}.`;
  }

  /** The stage's summary sentence (its accessible description and the notice after a change). */
  function summary(sc) {
    const s = sc.settings;
    const order = sc.now.members;
    const by = sc.scheme === 'mod' ? `Placing by hash mod ${order.length}` : `A consistent-hash ring with ${s.points} ${s.points === 1 ? 'point' : 'points'} a node`;
    const where = sc.downNode ? `the ${nodesWord(order.length)} left with ${sc.downNode} down` : nodesWord(order.length);
    const head = `${by} puts the ${num(K)} keys on ${where}: ${list(order.map((m) => `${m} holds ${num(sc.now.counts[m])}`))}.`;
    const c = sc.change;
    const moved = c ? ` ${changeLabel(c).replace(/^./, (x) => x.toUpperCase())}: ${num(c.moved)} of the ${num(K)} keys moved.` : '';
    return `${head}${moved}${s.hot ? ` ${standing(sc)}` : ''}`;
  }

  /** What a play did, for the notice and the reduced-motion caption. */
  function story(sc) {
    const c = sc.change;
    if (!c) return summary(sc);
    return `${changeLabel(c).replace(/^./, (x) => x.toUpperCase())}, and ${c.moved === 1 ? 'one key' : c.moved === 0 ? 'none' : num(c.moved)} of the ${num(K)} keys moved. ${changeStory(sc).join(' ')}`;
  }

  /** Describe's rows: one per node of the cluster, a down node included. */
  function describeRows(sc) {
    const c = sc.change;
    return sc.names.map((m) => {
      const up = sc.now.members.includes(m);
      return {
        node: m,
        state: up ? 'up' : 'down',
        points: sc.scheme === 'ring' ? (up ? num(sc.settings.points) : 'none') : 'none',
        ring: sc.scheme === 'ring' ? (up ? pctColOf(sc.now.ringShare[m] * 100) : 'none') : 'no ring',
        keys: up ? num(sc.now.counts[m]) : 'none',
        traffic: up ? pctCol(sc.traffic[m]) : 'none',
        into: c ? (c.into[m] ? `+${num(c.into[m])}` : '0') : 'no change yet',
        out: c ? (c.out[m] ? `−${num(c.out[m])}` : '0') : 'no change yet',
      };
    });
  }

  // ---------------------------------------------------------------- experiments
  const fillTemplate = (template, slots) =>
    template.replace(/\{(\w+)\}/g, (_, name) => {
      if (!(name in slots)) throw new Error(`no slot ${name}`);
      return slots[name];
    });
  /** Digits a template may carry outside its slots: names, never numbers of the model. */
  const TEMPLATE_DIGITS_ALLOWED = ['hash mod N', 'N / (N + 1)', 'N + 1', '2^32'];
  function strayDigits(template) {
    let rest = template.replace(/\{\w+\}/g, '');
    for (const ok of TEMPLATE_DIGITS_ALLOWED) rest = rest.split(ok).join('');
    return /\d/.test(rest) ? rest : null;
  }
  const word = (w) => w;

  const SETUP = {
    mod: { scheme: 1, points: 100, nodes: 4, hot: 0, split: 0, down: 0 },
    ring: { scheme: 0, points: 100, nodes: 4, hot: 0, split: 0, down: 0 },
    one: { scheme: 0, points: 1, nodes: 4, hot: 0, split: 0, down: 0 },
    hot: { scheme: 0, points: 100, nodes: 4, hot: 1, split: 0, down: 0 },
    challenge: { scheme: 1, points: 1, nodes: 4, hot: 1, split: 0, down: 1 },
  };
  /** A card's act: the settings it changes. A change of `nodes` or `down` plays the keys moving; `points` re-places. */
  const after = (setup, set) => scenario({ ...setup, ...set }, set.nodes || set.down ? NAMES.slice(0, setup.nodes) : null);

  const CHALLENGE_BOUNDS = { busiest: 30, moved: 50, nodes: 6 };
  const CHALLENGE_GOAL = {
    all: [
      { metric: 'busiest', below: CHALLENGE_BOUNDS.busiest },
      { metric: 'moved', below: CHALLENGE_BOUNDS.moved },
      { metric: 'nodes', below: CHALLENGE_BOUNDS.nodes },
    ],
    keep: { hot: 1, down: 1 },
  };
  const CHALLENGE_SOLUTION = { scheme: 0, points: 100, nodes: 5, split: 1 };

  const EXPERIMENTS = [
    {
      id: 'mod-join',
      title: 'A fifth node, by hash mod N',
      setup: SETUP.mod,
      act: { set: { nodes: 5 }, run: 'move' },
      ask: 'The {k} keys sit on {n} nodes, each key on node number hash mod {n}. A {nth} node, E, joins, so every key is placed by hash mod {n2}. E needs {ideal} keys for an even share. How many keys change node?',
      choices: [
        { text: 'About {ideal}: the keys E needs, no more', value: 'few' },
        { text: 'About {halfN}: half of them', value: 'half' },
        { text: 'About {mostN}: four keys in five', value: 'most' },
      ],
      truth: 'outcome',
      reveal:
        'It moves {moved} of the {k} keys, {movedPct}. A key stays only where its hash leaves the same remainder for {n} and for {n2}, which is {stayIn} of every {cycle} hashes, so about {expected} move. The table under the stage shows it key by key: a key stays only where its two remainders pick the same node. Only {toNew} of them went to E; the other {between} changed places among {olds}, and every move is data copied over the network. Going from N to N + 1 nodes moves about N / (N + 1) of the data: the more nodes, the worse.',
      focus: ['bins', 'lens'],
      hide: [{ region: 'after', when: 'playing' }],
      slots: () => {
        const a = scenario(SETUP.mod);
        const b = after(SETUP.mod, { nodes: 5 });
        const c = b.change;
        const n = a.now.members.length;
        const n2 = b.now.members.length;
        const frac = c.moved / K;
        return {
          k: num(K),
          n: num(n),
          n2: num(n2),
          nth: word(ORDINAL[n2 - 1]),
          ideal: num(c.ideal),
          halfN: num(K / 2),
          mostN: num((K * n) / n2),
          moved: num(c.moved),
          movedPct: pctOf(frac * 100),
          stayIn: num(n),
          cycle: num(n * n2),
          expected: pctOf((n / n2) * 100),
          toNew: num(c.toJoined),
          between: num(c.between),
          olds: list(a.now.members),
          outcome: word(frac < 0.35 ? 'few' : frac < 0.65 ? 'half' : 'most'),
        };
      },
    },
    {
      id: 'ring-join',
      title: 'The same node, on a ring',
      setup: SETUP.ring,
      act: { set: { nodes: 5 }, run: 'move' },
      ask: 'The {k} keys sit on {n} nodes, now on a consistent-hash ring with {points} points a node: a key belongs to the next point clockwise of its hash. E joins with {points} points of its own. Which keys move?',
      choices: [
        { text: 'About {ideal} to E, and about as many again among A, B, C and D to even them out', value: 'rebalance' },
        { text: 'About {ideal}, every one of them to E', value: 'only-new' },
        { text: 'Most of them: a new node changes where every hash lands', value: 'most' },
      ],
      truth: 'outcome',
      reveal:
        'Only {moved} keys move, every one of them to E: {froms}. Each of E’s points takes the stretch of ring just before it from the point that owned it, and no other arc changes, so no key moves between the old nodes. An even share for E is {ideal} ({k} / {n2}); E’s {points} points took {eRing} of the ring (the ‘of ring’ row), so it got {moved}. hash mod N moved {modMoved} for the same change.',
      focus: ['bins', 'lens'],
      hide: [{ region: 'after', when: 'playing' }],
      slots: () => {
        const a = scenario(SETUP.ring);
        const b = after(SETUP.ring, { nodes: 5 });
        const c = b.change;
        const mod = after(SETUP.mod, { nodes: 5 }).change;
        return {
          k: num(K),
          n: num(a.now.members.length),
          n2: num(b.now.members.length),
          points: num(SETUP.ring.points),
          ideal: num(c.ideal),
          moved: num(c.moved),
          eRing: pctOf(b.now.ringShare.E * 100),
          froms: parts(c.out, NAMES, 'from'),
          modMoved: num(mod.moved),
          outcome: word(c.moved > K / 2 ? 'most' : c.toJoined === c.moved ? 'only-new' : 'rebalance'),
        };
      },
    },
    {
      id: 'one-point',
      title: 'One point a node',
      setup: SETUP.ring,
      act: { set: { points: 1 } },
      ask: 'With {points} points a node the {n} shards hold {low} to {high} keys; an even share is {fair}. Give each node a single point on the ring instead. How many keys does the fullest shard hold?',
      choices: [
        { text: '{one}: more than half of all the keys', value: 'one' },
        { text: '{mid}: half as much again as an even share', value: 'mid' },
        { text: '{high}: no change, the hash is still uniform', value: 'same' },
      ],
      truth: 'fullest',
      reveal:
        '{who} holds {one} keys, while {least} holds {low1}. One point a node cuts the ring into {n} arcs of random length: {who}’s arc is {arc} of the ring, so it gets about that share of the keys. The hash is uniform, but {n} random cuts are not even. This is typical, not bad luck: the longest of {n} random arcs averages about half the ring and the shortest about a sixteenth. With {points} points a node, its virtual nodes, each shard owns {points} short arcs scattered round the ring, their lengths average out, and the fullest holds {high}. A share’s spread shrinks with the square root of the points: about a quarter of an even share either way with {ten} points, under a tenth with {points}.',
      focus: ['ring', 'bins'],
      hide: [{ region: 'after', when: 'playing' }],
      slots: () => {
        const a = scenario(SETUP.ring);
        const b = scenario({ ...SETUP.ring, points: 1 });
        const counts = Object.values(a.now.counts);
        const least = b.now.members.reduce((x, m) => (b.now.counts[m] < b.now.counts[x] ? m : x));
        const fullest = b.now.counts[b.fullest];
        return {
          n: num(a.now.members.length),
          points: num(SETUP.ring.points),
          low: num(Math.min(...counts)),
          high: num(Math.max(...counts)),
          fair: share(a.fairKeys),
          one: num(fullest),
          mid: num(a.fairKeys * 1.5),
          who: word(b.fullest),
          least: word(least),
          low1: num(b.now.counts[least]),
          arc: pctOf(b.now.ringShare[b.fullest] * 100),
          fullest: num(fullest),
          same: num(Math.max(...counts)),
          ten: num(POINTS[1]),
        };
      },
    },
    {
      id: 'lost-node',
      title: 'The fullest node fails',
      setup: SETUP.one,
      act: { set: { down: 1 }, run: 'move' },
      ask: 'One point a node. {who} holds {held} of the {k} keys, and it fails. Where do its keys go?',
      choices: [
        { text: 'They spread over {others}, about {third} each', value: 'spread' },
        { text: 'To its two neighbours on the ring, {next} and {prev}, about half each', value: 'neighbours' },
        { text: 'All {held} to {next}, the next point clockwise', value: 'successor' },
      ],
      truth: 'outcome',
      reveal:
        'All {held} go to {next}: with {who}’s point gone, the next point clockwise of every one of its keys is {next}’s. {next} can take over at once because each key is also kept on the next distinct nodes clockwise, so {next} already holds copies; what it cannot take is the load: it goes from {before} keys to {after}, {ratio} its load, so it is the likeliest to fail next, and then {after} keys land on the node after it: a cascade. With {points} points a node the busiest node is {who100}; its arcs lie all round the ring, followed by points of {others100}, so its {held100} keys spread: {spread}. Set Points per node to {points} to see it.',
      focus: ['ring', 'bins'],
      hide: [{ region: 'after', when: 'playing' }],
      slots: () => {
        const a = scenario(SETUP.one);
        const b = scenario({ ...SETUP.one, down: 1 });
        const c = b.change;
        const who = b.downNode;
        const dests = b.now.members.filter((m) => c.into[m] > 0);
        const ring = a.up.ring;
        const i = ring.findIndex((p) => p.node === who);
        const next = ring[(i + 1) % ring.length].node;
        const prev = ring[(i - 1 + ring.length) % ring.length].node;
        // The counterfactual is the stage one click away: the same setting with 100 points a node.
        const many = scenario({ ...SETUP.one, points: 100, down: 1 });
        const manyDown = many.change;
        return {
          k: num(K),
          who: word(who),
          held: num(c.leftHeld),
          others: list(b.now.members),
          third: num(c.leftHeld / b.now.members.length),
          next: word(next),
          prev: word(prev),
          before: num(c.before.counts[next]),
          after: num(c.after.counts[next]),
          ratio: times(c.after.counts[next] / c.before.counts[next]),
          points: num(100),
          who100: word(many.downNode),
          others100: list(many.now.members),
          held100: num(manyDown.leftHeld),
          spread: parts(manyDown.into, NAMES, 'to'),
          outcome: word(dests.length === 1 && dests[0] === next ? 'successor' : dests.length === 2 ? 'neighbours' : 'spread'),
        };
      },
    },
    {
      id: 'hot-key',
      title: 'A hot key',
      setup: SETUP.hot,
      act: { set: { nodes: 6 }, run: 'move' },
      ask: 'One key takes {hot} of all the traffic, so its shard, {who}, carries {before} where an even share of {n} nodes is {fair}. Add {added} nodes, so an even share is {fair2}. What does the hot key’s shard carry now?',
      choices: [
        { text: '{now}: hardly less, the hot key alone is {hot}', value: 'now' },
        { text: '{scaled}: two thirds of it, as its keys thin out', value: 'scaled' },
        { text: '{fair2}: an even share of {n2} nodes', value: 'fair2' },
      ],
      truth: 'answer',
      reveal:
        'It still carries {now}. Hashing spreads keys, not traffic: one key lives on one shard, so its shard carries that {hot} however many nodes there are, and only the other keys’ {rest} thins out. More nodes never take it below {hot}. Split the key instead: with a suffix from {suffixes} it becomes {salts} keys of {each} each, which land on {saltShards} shards here, and the busiest shard carries {splitBusiest}. The price is that a read of it gathers all {salts}.',
      focus: ['bins', 'verdict'],
      hide: [{ region: 'after', when: 'playing' }],
      slots: () => {
        const a = scenario(SETUP.hot);
        const b = after(SETUP.hot, { nodes: 6 });
        const split = scenario({ ...SETUP.hot, nodes: 6, split: 1 });
        const n = a.now.members.length;
        const n2 = b.now.members.length;
        const now = pct(b.traffic[b.now.hot]);
        return {
          hot: `${HOT_PCT}%`,
          rest: `${100 - HOT_PCT}%`,
          who: word(a.now.hot),
          before: pct(a.traffic[a.now.hot]),
          n: num(n),
          n2: num(n2),
          added: num(n2 - n),
          fair: pctOf(100 / n),
          fair2: pctOf(100 / n2),
          now,
          scaled: pctOf((a.traffic[a.now.hot] / 10) * (n / n2)),
          salts: num(SALTS),
          suffixes: `0 to ${SALTS - 1}`,
          each: `${HOT_PCT / SALTS}%`,
          saltShards: num(split.hotOn.length),
          splitBusiest: pct(split.traffic[split.busiest]),
          answer: now,
        };
      },
    },
    {
      id: 'survive',
      title: 'Challenge: lose the busiest node and stay even',
      setup: SETUP.challenge,
      ask: 'A hot key takes {hot} of the traffic, and the busiest node has failed. Choose the placement, the points, the nodes and whether to split the hot key so that no shard left carries {busiest} of the traffic or more, the failure moves fewer than {moved} keys, and the cluster has fewer than {nodes} nodes.',
      goal: CHALLENGE_GOAL,
      reveal:
        'A ring of {n} nodes with {points} points each and the hot key split passes: when {down} fails only its {movedNow} keys move, spread over the {left} left, and the busiest carries {busiestNow}. Unsplit, the hot key’s shard carries {unsplit}; with {fewer} points a node the shards are less even and the busiest carries {tenBusiest}; hash mod N would have moved {modMoved} keys. Many points for even shards and a spread failure, a split for the key no hash can spread, and spare capacity for the node you lose.',
      focus: ['bins', 'verdict'],
      hide: [],
      slots: () => {
        const base = { ...SETUP.challenge, ...CHALLENGE_SOLUTION };
        const sol = scenario(base);
        const unsplit = scenario({ ...base, split: 0 });
        const ten = scenario({ ...base, points: 10 });
        const mod = scenario({ ...base, scheme: 1 });
        return {
          hot: `${HOT_PCT}%`,
          busiest: `${CHALLENGE_BOUNDS.busiest}%`,
          moved: num(CHALLENGE_BOUNDS.moved),
          nodes: num(CHALLENGE_BOUNDS.nodes),
          n: num(sol.settings.nodes),
          points: num(sol.settings.points),
          down: word(sol.downNode),
          movedNow: num(sol.change.moved),
          left: num(sol.now.members.length),
          busiestNow: pct(sol.traffic[sol.busiest]),
          unsplit: pct(unsplit.traffic[unsplit.busiest]),
          fewer: num(ten.settings.points),
          tenBusiest: pct(ten.traffic[ten.busiest]),
          modMoved: num(mod.change.moved),
        };
      },
    },
  ];

  function renderExperiment(spec) {
    const slots = spec.slots();
    const fill = (t) => fillTemplate(t, slots);
    const choices = (spec.choices ?? []).map((c) => fill(c.text));
    let answer = -1;
    if (spec.choices && spec.truth) {
      const truth = fill(`{${spec.truth}}`);
      const value = (c) => (c.value in slots ? fill(`{${c.value}}`) : c.value);
      const matches = spec.choices.flatMap((c, i) => (value(c) === truth ? [i] : []));
      if (matches.length !== 1) throw new Error(`${spec.id}: ${matches.length} choices equal the model's ${truth}`);
      answer = matches[0];
    }
    return { id: spec.id, title: fill(spec.title), ask: fill(spec.ask), choices, answer, reveal: fill(spec.reveal), slots, focus: spec.focus, hide: spec.hide };
  }

  const boundMet = (b, v) => ('below' in b ? v < b.below : v >= b.atLeast);
  const goalKept = (goal, s) => Object.entries(goal.keep ?? {}).every(([k, v]) => s[k] === v);
  const goalMet = (goal, s, metrics) => goalKept(goal, s) && goal.all.every((b) => boundMet(b, metrics[b.metric]));

  /** The dock's checklist for the challenge: a line per bound with its state in words. */
  function goalChecks(sc) {
    const m = sc.metrics;
    const b = CHALLENGE_BOUNDS;
    const line = (met, text) => ({ met, text: `${text}: ${met ? 'met' : 'not yet'}` });
    return [
      line(m.busiest < b.busiest, `the busiest shard left carries ${pct(sc.traffic[sc.busiest])} of the traffic, needs under ${b.busiest}%`),
      line(m.moved < b.moved, `the failure moved ${keys(m.moved)}, needs fewer than ${b.moved}`),
      line(m.nodes < b.nodes, `the cluster has ${nodesWord(m.nodes)}, needs fewer than ${b.nodes}`),
    ];
  }

  const api = {
    K,
    NAMES,
    NODE_COUNTS,
    POINTS,
    TURN,
    HOT_KEY,
    HOT_PCT,
    SALTS,
    FOLLOW,
    PLAY,
    playMs,
    takeoff,
    KEYS,
    KEY_AT,
    HOT_AT,
    SALT_KEYS,
    SALT_AT,
    BASE,
    SETUP,
    hash32,
    ringPoints,
    pointFor,
    place,
    diff,
    trafficTenths,
    busiestOf,
    fullestOf,
    scenario,
    allSettings,
    normal,
    namesOf,
    num,
    pct,
    pctOf,
    pctCol,
    pctColOf,
    POINT_SALT,
    twins,
    keys,
    times,
    list,
    round,
    share,
    schemeWords,
    changeLabel,
    changeStory,
    standing,
    rule,
    summary,
    story,
    describeRows,
    fillTemplate,
    strayDigits,
    EXPERIMENTS,
    CHALLENGE_GOAL,
    CHALLENGE_BOUNDS,
    CHALLENGE_SOLUTION,
    renderExperiment,
    goalMet,
    goalChecks,
    boundMet,
    after,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShardModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
