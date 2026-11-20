// Prints every number the Sharding widget's experiments quote, proves the challenge has exactly one passing setting,
// and checks the model against independent computations: a second hash in BigInt arithmetic, a second ring that finds
// a key's owner by brute force (the point at the smallest clockwise distance), a brute-force reassignment of every key
// for every change of the node set, the rules a ring must obey, and every sentence the widget can say.
// Usage: node enum.cjs
'use strict';
const M = require('./model.js');

let checks = 0;
const fails = [];
const ok = (cond, what) => {
  checks++;
  if (!cond) fails.push(what);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ------------------------------------------------------------ 1. the hash, a second time in BigInt
function hashBig(text) {
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
const pointNames = M.NAMES.flatMap((n) => Array.from({ length: 100 }, (_, v) => `${n}#${v}${M.POINT_SALT}`));
for (const text of [...M.KEYS, M.HOT_KEY, ...M.SALT_KEYS, ...pointNames]) ok(BigInt(M.hash32(text)) === hashBig(text), `hash32(${text})`);
ok(new Set([...M.KEY_AT, M.HOT_AT, ...M.SALT_AT, ...pointNames.map(M.hash32)]).size === M.K + 1 + M.SALTS + 600, 'every key, salt and point has its own position');
ok(!M.KEYS.includes(M.HOT_KEY), 'the hot key is not one of the 200');

// ------------------------------------------------------------ 2. placement, a second time by brute force
const TURN = 1n << 32n;
function bruteOwner(scheme, points, members, text) {
  const h = hashBig(text);
  if (scheme === 'mod') return members[Number(h % BigInt(members.length))];
  let best = null;
  let bestDist = TURN;
  for (const node of members)
    for (let v = 0; v < points; v++) {
      const dist = (hashBig(`${node}#${v}${M.POINT_SALT}`) - h + TURN) % TURN;
      if (dist < bestDist) [best, bestDist] = [node, dist];
    }
  return best;
}
const subsets = [];
for (let mask = 1; mask < 64; mask++) {
  const members = M.NAMES.filter((_, i) => mask & (1 << i));
  if (members.length >= 2) subsets.push(members);
}
const SCHEMES = [
  ['ring', 1],
  ['ring', 10],
  ['ring', 100],
  ['mod', 0],
];
for (const [scheme, points] of SCHEMES)
  for (const members of subsets) {
    const p = M.place(scheme, points || 100, members);
    let same = true;
    M.KEYS.forEach((k, i) => (same &&= p.owners[i] === bruteOwner(scheme, points, members, k)));
    same &&= p.hot === bruteOwner(scheme, points, members, M.HOT_KEY);
    M.SALT_KEYS.forEach((k, i) => (same &&= p.salts[i] === bruteOwner(scheme, points, members, k)));
    ok(same, `placement ${scheme} ${points} ${members.join('')}`);
    ok(Object.values(p.counts).reduce((a, b) => a + b, 0) === M.K, `counts sum ${scheme} ${points} ${members.join('')}`);
    if (scheme === 'ring') ok(near(Object.values(p.ringShare).reduce((a, b) => a + b, 0), 1, 1e-9), `ring shares sum ${points} ${members.join('')}`);
  }

// ------------------------------------------------------------ 3. every change of the node set, key by key
let transitions = 0;
let minMoved = Infinity;
for (const [scheme, points] of SCHEMES)
  for (const a of subsets)
    for (const b of subsets) {
      if (a === b) continue;
      const before = M.place(scheme, points || 100, a);
      const after = M.place(scheme, points || 100, b);
      const d = M.diff(before, after);
      transitions++;
      let moved = 0;
      let toJoined = 0;
      let fromLeft = 0;
      M.KEYS.forEach((k) => {
        const from = bruteOwner(scheme, points, a, k);
        const to = bruteOwner(scheme, points, b, k);
        if (from === to) return;
        moved++;
        if (!a.includes(to)) toJoined++;
        if (!b.includes(from)) fromLeft++;
      });
      ok(d.moved === moved && d.toJoined === toJoined && d.fromLeft === fromLeft, `diff ${scheme} ${points} ${a.join('')}>${b.join('')}`);
      ok(d.toJoined + d.fromLeft + d.between >= d.moved, `diff parts ${a.join('')}>${b.join('')}`);
      if (scheme === 'ring') {
        // The ring's two laws: a join moves keys only to the joiners; a leave moves exactly the leavers' keys.
        if (d.left.length === 0) ok(d.toJoined === d.moved && d.between === 0, `ring join ${points} ${a.join('')}>${b.join('')}: all to the joiners`);
        if (d.joined.length === 0) ok(d.fromLeft === d.moved && d.moved === d.leftHeld, `ring leave ${points} ${a.join('')}>${b.join('')}: exactly the leavers' keys`);
        ok(d.between === 0, `ring ${points} ${a.join('')}>${b.join('')}: no key moves between nodes that stay`);
      }
      if (d.joined.length + d.left.length === 1) minMoved = Math.min(minMoved, d.moved);
    }

// hash mod N: going from N to N + 1 moves about N / (N + 1) of the keys.
for (let n = 3; n < 6; n++) {
  const d = M.diff(M.place('mod', 0, M.NAMES.slice(0, n)), M.place('mod', 0, M.NAMES.slice(0, n + 1)));
  ok(near(d.moved / M.K, n / (n + 1), 0.08), `mod ${n} to ${n + 1}: ${d.moved} moved against ${(M.K * n) / (n + 1)}`);
  // A key stays exactly when its hash leaves the same remainder for n and n + 1.
  const stays = M.KEY_AT.filter((h) => h % n === h % (n + 1)).length;
  ok(stays === M.K - d.moved, `mod ${n} to ${n + 1}: the keys that stay are those with equal remainders`);
  const cycle = n * (n + 1);
  const same = Array.from({ length: cycle }, (_, h) => h).filter((h) => h % n === h % (n + 1)).length;
  ok(same === n, `mod ${n} to ${n + 1}: ${n} of every ${cycle} hashes stay`);
}

// ------------------------------------------------------------ 4. settings, traffic, the stage's reserves
const settings = M.allSettings();
let maxCount = 0;
let maxTraffic = 0;
for (const s of settings) {
  const sc = M.scenario(s);
  const sum = sc.now.members.reduce((a, m) => a + sc.traffic[m], 0);
  ok(Math.abs(sum - 1000) <= sc.now.members.length, `traffic sums to 100% ${JSON.stringify(s)} (${sum})`);
  for (const m of sc.now.members) {
    const c = sc.now.counts[m];
    const h = s.hot ? (s.split ? sc.now.salts.filter((o) => o === m).length / M.SALTS : sc.now.hot === m ? 1 : 0) : 0;
    const exact = s.hot ? 70 * (c / M.K) + 30 * h : (100 * c) / M.K;
    ok(near(sc.traffic[m] / 10, exact, 0.0501), `traffic of ${m} ${JSON.stringify(s)}`);
    maxCount = Math.max(maxCount, c);
    maxTraffic = Math.max(maxTraffic, sc.traffic[m]);
  }
  if (s.down) {
    ok(sc.change && sc.change.kind === 'down' && sc.change.left.length === 1 && sc.change.left[0] === sc.downNode, `down is the change ${JSON.stringify(s)}`);
    const up = M.scenario({ ...s, down: 0 });
    ok(up.busiest === sc.downNode, `the node down is the busiest with all up ${JSON.stringify(s)}`);
    ok(sc.metrics.moved === sc.change.moved, 'the moved metric is the failure');
  }
}

// ------------------------------------------------------------ 5. every sentence the widget can say
const FALSE_CLAIMS = [
  /NaN|undefined|Infinity|null/,
  /(?<!\+ )\b1 (keys|nodes|shards|points)\b/,
  /\b0 keys? moved to\b|\bAll 0\b|\bAll 1 moved\b/,
  /\d{4,}(?![\d,]*\s*mod)(?!,)/,
  /\ball to [A-F], the next point clockwise\b.*\bpoints a node/,
  /\s\./,
  /,\s*,|\.\./,
];
const sentences = [];
const say = (where, text) => sentences.push({ where, text });
const froms = (s) => {
  const out = [null];
  if (!s.down) {
    for (const n of M.NODE_COUNTS) if (n !== s.nodes) out.push(M.NAMES.slice(0, n));
    // A node that came back: the set while each one node was down.
    for (const m of M.NAMES.slice(0, s.nodes)) out.push(M.NAMES.slice(0, s.nodes).filter((x) => x !== m));
  }
  return out;
};
let scenarios = 0;
for (const s of settings)
  for (const from of froms(s)) {
    const sc = M.scenario(s, from);
    scenarios++;
    const id = `${JSON.stringify(s)} from ${from ? from.join('') : 'none'}`;
    say(id, M.summary(sc));
    say(id, M.story(sc));
    say(id, M.standing(sc));
    say(id, M.rule(sc));
    say(id, M.rule(sc, true));
    if (sc.change) {
      say(id, M.changeLabel(sc.change));
      for (const line of M.changeStory(sc)) say(id, line);
    }
    for (const row of M.describeRows(sc)) say(id, Object.values(row).join(' | '));
    for (const c of M.goalChecks(sc)) say(id, c.text);
    // Words against the picture, by rule: the story's parts add up to what moved.
    if (sc.change) {
      const c = sc.change;
      const into = Object.values(c.into).reduce((a, b) => a + b, 0);
      const out = Object.values(c.out).reduce((a, b) => a + b, 0);
      ok(into === c.moved && out === c.moved, `in and out both add up to the moved ${id}`);
      const story = M.changeStory(sc).join(' ');
      if (/^All \d+ moved to/.test(story)) ok(c.toJoined === c.moved, `"All moved to" only when all did ${id}`);
      if (/^Only [A-F]'s/.test(story)) ok(c.fromLeft === c.moved && c.moved === c.leftHeld, `"Only X's keys moved" only when so ${id}`);
      if (/next point clockwise/.test(story)) ok(sc.scheme === 'ring' && s.points === 1, `"the next point clockwise" only with one point a node ${id}`);
      if (/hot key moved/.test(story)) ok(s.hot === 1 && s.split === 0 && c.hotMoved, `the hot key's move is said only when it moved ${id}`);
      // The twins sentence appears exactly when hash mod N moved keys but none between nodes that stayed, and that
      // happens only when the cluster doubles or halves.
      const twin = /cheap (change|shrink)/.test(story);
      ok(twin === (sc.scheme === 'mod' && c.between === 0 && c.moved > 0), `the twins sentence exactly when no key moved between nodes that stayed under hash mod N ${id}`);
      if (twin) {
        const [n, n2] = [c.before.members.length, c.after.members.length];
        ok(n2 === 2 * n || n === 2 * n2, `the twins sentence only on a doubling or a halving ${id}`);
        const [lo, hi] = [Math.min(n, n2), Math.max(n, n2)];
        ok(M.KEY_AT.every((h) => h % hi === h % lo || h % hi === (h % lo) + lo), `a remainder for ${hi} is the remainder for ${lo} or that plus ${lo} ${id}`);
      }
      if (c.kind === 'down') ok(/a dead node sends nothing/.test(story), `a failure says the dead node sends nothing ${id}`);
      if (/new owner serves/.test(story)) ok(c.after.members.filter((m) => c.into[m] > 0).length === 1, `"the new owner" only with one ${id}`);
    }
    const standing = M.standing(sc);
    if (/fullest shards/.test(standing)) ok(sc.now.members.filter((m) => sc.now.counts[m] === sc.now.counts[sc.fullest]).length > 1, `a tie is named as one ${id}`);
    for (const m of sc.now.members) ok(sc.now.counts[m] <= sc.now.counts[sc.fullest] && sc.traffic[m] <= sc.traffic[sc.busiest], `fullest and busiest are the largest ${id}`);
  }
for (const { where, text } of sentences) {
  for (const re of FALSE_CLAIMS) ok(!re.test(text), `false claim ${re} in "${text}" (${where})`);
  // No sentence opens on a numeral (table rows and the short rule line are not sentences).
  if (!text.includes(' | ') && !/^user:\d+:/.test(text)) for (const part of text.split(/(?<=[.!?])\s+/)) ok(!/^\d/.test(part), `a sentence opens on a numeral: "${part}" (${where})`);
}

// ------------------------------------------------------------ 5b. the play's clock
{
  let live = 0;
  let shortest = Infinity;
  for (const s of settings)
    for (const from of froms(s)) {
      const c = M.scenario(s, from).change;
      if (!c) continue;
      const ts = c.moves.map((m) => M.takeoff(m.key)).sort((a, b) => a - b);
      for (let i = 0, j = 0; i < ts.length; i++) {
        while (ts[i] - ts[j] >= M.PLAY.flight) j++;
        live = Math.max(live, i - j + 1);
      }
      shortest = Math.min(shortest, M.playMs(c.moved) * M.PLAY.flight);
      ok(M.PLAY.sweep1 + M.PLAY.flight <= 1, 'the last flight lands inside the clock');
    }
  ok(live <= M.PLAY.pool, `at most ${M.PLAY.pool} keys in flight at once (${live})`);
  ok(shortest >= 120, `no flight under 120 ms (${Math.round(shortest)} ms)`);
  console.log(`plays: at most ${live} keys in flight at once; the shortest flight ${Math.round(shortest)} ms; E1's play ${M.playMs(166)} ms, E2's ${M.playMs(46)} ms`);
}

// ------------------------------------------------------------ 6. the followed key
{
  const at = M.KEY_AT[M.FOLLOW];
  const four = M.NAMES.slice(0, 4);
  const five = M.NAMES.slice(0, 5);
  const moves = (scheme, points, a, b) => M.place(scheme, points, a).owners[M.FOLLOW] !== M.place(scheme, points, b).owners[M.FOLLOW];
  ok(moves('mod', 100, four, five), 'the followed key moves in E1');
  ok(moves('ring', 100, four, five) && M.place('ring', 100, five).owners[M.FOLLOW] === 'E', 'the followed key moves to E in E2');
  ok(M.scenario({ ...M.SETUP.one, down: 1 }).change.moves.some((m) => m.key === M.FOLLOW), 'the followed key moves in E4');
  // Its neighbours by hash look random under every modulus, in every window the closer look draws (11 and 9 keys) and
  // in a 5-key one: no run of equal remainders longer than 2 (3 in the 11-key window), at most ceil(expected + 1)
  // adjacent equal pairs, and the 9-key window holds keys that stay and keys that move from 4 nodes to 5.
  const byHash = Array.from({ length: M.K }, (_, i) => i).sort((a, b) => M.KEY_AT[a] - M.KEY_AT[b]);
  const win = (n) => Array.from({ length: n }, (_, k) => byHash[(byHash.indexOf(M.FOLLOW) - (n - 1) / 2 + k + M.K) % M.K]);
  for (const n of [11, 9, 5])
    for (const m of [3, 4, 5, 6]) {
      const r = win(n).map((i) => M.KEY_AT[i] % m);
      let run = 1;
      let most = 1;
      let pairs = 0;
      for (let i = 1; i < r.length; i++) {
        run = r[i] === r[i - 1] ? run + 1 : 1;
        most = Math.max(most, run);
        if (r[i] === r[i - 1]) pairs++;
      }
      ok(most <= (n === 11 ? 3 : 2), `the ${n}-key window has a run of ${most} equal remainders mod ${m}`);
      ok(pairs <= Math.ceil((n - 1) / m + 1), `the ${n}-key window has ${pairs} adjacent equal remainders mod ${m}`);
    }
  const stay = win(9).filter((i) => M.KEY_AT[i] % 4 === M.KEY_AT[i] % 5).length;
  ok(stay >= 1 && stay <= 8, `the 9-key window holds keys that stay (${stay}) and keys that move from 4 to 5`);
  console.log(`followed key ${M.KEYS[M.FOLLOW]}: hash ${M.num(at)} (${M.round(at)} round), mod 4 = ${at % 4}, mod 5 = ${at % 5}`);
}

// ------------------------------------------------------------ 7. the experiments
console.log('\nEXPERIMENTS');
const answers = [];
for (const spec of M.EXPERIMENTS) {
  const r = M.renderExperiment(spec);
  console.log(`\n${r.title}${r.answer >= 0 ? `  (answer: choice ${r.answer + 1})` : ''}`);
  console.log(`  ask: ${r.ask}`);
  r.choices.forEach((c, i) => console.log(`   ${i === r.answer ? '*' : ' '} ${i + 1}. ${c}`));
  console.log(`  reveal: ${r.reveal}`);
  console.log(`  slots: ${JSON.stringify(r.slots)}`);
  if (r.answer >= 0) answers.push(r.answer + 1);
  for (const t of [spec.title, spec.ask, spec.reveal, ...(spec.choices ?? []).map((c) => c.text)]) ok(!M.strayDigits(t), `${spec.id}: a digit outside a slot in "${t}"`);
  for (const t of [r.ask, r.reveal]) for (const part of t.split(/(?<=[.!?])\s+/)) ok(!/^\d/.test(part), `${spec.id}: a sentence opens on a numeral: "${part}"`);
  for (const t of [r.ask, r.reveal, ...r.choices]) for (const re of FALSE_CLAIMS) ok(!re.test(t), `${spec.id}: false claim ${re}`);
  ok(new Set(r.choices).size === r.choices.length, `${spec.id}: choices differ`);
  if (spec.choices) ok(r.choices.length === 3, `${spec.id}: three choices`);
}
console.log(`\nanswer positions: ${answers.join(', ')}`);
ok(answers.filter((a) => a === 2).length <= 2 && new Set(answers).size === 3, 'answer positions vary and are not mostly second');

// The reveals' word claims, each against the model.
{
  const four = M.NAMES.slice(0, 4);
  const mod = M.after(M.SETUP.mod, { nodes: 5 }).change;
  ok(mod.moved === 166 && mod.toJoined === 47 && mod.between === 119, 'E1: 166 moved, 47 to E, 119 among the old four');
  ok(mod.moved / M.K >= 0.8, 'E1: "four keys in five" (at least 80%)');
  ok(near(160, mod.moved, 10), 'E1: "about 160"');
  const ring = M.after(M.SETUP.ring, { nodes: 5 }).change;
  ok(ring.moved === 39 && ring.toJoined === 39 && ring.between === 0, 'E2: 39 moved, all to E');
  ok(Math.abs(ring.moved - ring.ideal) / ring.ideal <= 0.15, 'E2: "about 40" (within 15% of the ideal)');
  ok(four.every((m) => ring.out[m] > 0), 'E2: every old node gives some');
  const one = M.scenario({ ...M.SETUP.ring, points: 1 });
  const many = M.scenario(M.SETUP.ring);
  ok(one.now.counts.A === 107 && one.now.counts.B === 3 && one.fullest === 'A', 'E3: A holds 107 and B 3 with one point');
  ok(one.now.counts.A > M.K / 2, 'E3: "more than half of all the keys"');
  ok(Math.min(...Object.values(many.now.counts)) === 47 && Math.max(...Object.values(many.now.counts)) === 53, 'E3: 47 to 53 with 100 points');
  ok(near(one.now.ringShare.A, 0.551, 0.0005), 'E3: A owns 55.1% of the ring');
  // "The longest of 4 random arcs averages about half the ring and the shortest about a sixteenth": the expected
  // longest of n uniform spacings is H(n) / n and the shortest 1 / n^2.
  ok(near((1 + 1 / 2 + 1 / 3 + 1 / 4) / 4, 0.5, 0.025) && 1 / 16 === 0.0625, 'E3: the averages of the longest and shortest of 4 arcs');
  // "About a quarter of an even share either way with 10 points, under a tenth with 100": one node's share of a ring
  // of n nodes with p points each is Beta(p, (n - 1) p), whose standard deviation over the mean 1 / n is
  // sqrt((n - 1) / (n p + 1)).
  const rel = (n, p) => Math.sqrt((n - 1) / (n * p + 1));
  ok(near(rel(4, 10), 0.25, 0.03) && rel(4, 100) < 0.1, `E3: a share's spread is ${(rel(4, 10) * 100).toFixed(0)}% of an even share with 10 points and ${(rel(4, 100) * 100).toFixed(1)}% with 100`);
  const lost = M.scenario({ ...M.SETUP.one, down: 1 });
  ok(lost.downNode === 'A' && lost.change.moved === 107 && lost.change.into.C === 107 && lost.now.counts.C === 180, 'E4: all 107 of A go to C, 73 to 180');
  ok(M.times(180 / 73) === '2.5×', 'E4: 2.5×');
  // Every number of the reveal's counterfactual is the stage's own for the setting one click away (Points 100).
  const cf = M.scenario({ ...M.SETUP.one, points: 100, down: 1 });
  const r4 = M.renderExperiment(M.EXPERIMENTS[3]).reveal;
  const cfStory = M.changeStory(cf).join(' ');
  ok(r4.includes(`its ${M.num(cf.change.leftHeld)} keys spread: `) && cfStory.includes(`Only ${cf.downNode}'s ${M.keys(cf.change.leftHeld)} moved: ${r4.split('keys spread: ')[1].split('.')[0]}.`), `E4: the counterfactual reads as the stage does at 100 points ("${cfStory}")`);
  ok(r4.includes(`the busiest node is ${cf.downNode}`), 'E4: the counterfactual names the stage busiest node at 100 points');
  const ringOne = M.ringPoints(four, 1).map((p) => p.node).join('');
  ok(ringOne === 'ACBD', `E4: the ring's order with one point is A, C, B, D (${ringOne}): C follows A, D precedes it`);
  const hot4 = M.scenario(M.SETUP.hot);
  const hot6 = M.after(M.SETUP.hot, { nodes: 6 });
  ok(hot4.now.hot === 'A' && hot6.now.hot === 'A' && !hot6.change.hotMoved, 'E5: the hot key stays on A');
  ok(hot4.traffic.A === 486 && hot6.traffic.A === 423, 'E5: 48.6% then 42.3%');
  ok(hot6.traffic.A > 300, 'E5: never below the hot key alone');
  ok(near((hot4.traffic.A / 10) * (4 / 6), 32.4, 0.05), 'E5: "two thirds of it"');
  const e2 = M.renderExperiment(M.EXPERIMENTS[1]).reveal;
  ok(e2.includes(`An even share for E is 40 (200 / 5)`) && e2.includes(`took ${M.pctOf(M.after(M.SETUP.ring, { nodes: 5 }).now.ringShare.E * 100)} of the ring`), 'E2: the even share as the stage writes it and E\'s ring share');
  for (const n of M.NODE_COUNTS) for (const p of M.POINTS) ok(M.place('ring', p, M.NAMES.slice(0, n)).hot === 'A', `the hot key is on A on every ring (${n} nodes, ${p} points)`);
}

// ------------------------------------------------------------ 8. the challenge: exactly one setting passes
console.log('\nCHALLENGE: settings that keep the hot key and the failure');
const kept = settings.filter((s) => s.hot === 1 && s.down === 1);
const passing = [];
for (const s of kept) {
  const sc = M.scenario(s);
  const pass = M.goalMet(M.CHALLENGE_GOAL, sc.settings, sc.metrics);
  if (pass) passing.push(s);
  console.log(
    `  ${pass ? 'PASS' : '    '} ${s.scheme ? 'hash mod N      ' : `ring, ${String(s.points).padStart(3)} points`} ${s.nodes} nodes ${s.split ? 'split  ' : 'unsplit'}: ${sc.downNode} down, busiest ${M.pct(sc.traffic[sc.busiest]).padStart(6)}, moved ${String(sc.metrics.moved).padStart(3)}`,
  );
}
ok(passing.length === 1, `exactly one of the ${kept.length} settings passes (${passing.length})`);
const sol = { ...M.SETUP.challenge, ...M.CHALLENGE_SOLUTION };
ok(passing.length === 1 && Object.keys(sol).every((k) => passing[0][k] === sol[k]), 'the one passing setting is the stated solution');
ok(!M.goalMet(M.CHALLENGE_GOAL, M.SETUP.challenge, M.scenario(M.SETUP.challenge).metrics), 'the challenge does not start met');
// No value prints as its bound while failing or passing it the other way.
for (const s of kept) {
  const sc = M.scenario(s);
  const printed = parseFloat(M.pct(sc.traffic[sc.busiest]));
  ok(printed < M.CHALLENGE_BOUNDS.busiest === sc.metrics.busiest < M.CHALLENGE_BOUNDS.busiest, `the printed busiest share sits on its side of the bound ${JSON.stringify(s)}`);
}
console.log(`  ${passing.length} of ${kept.length} pass`);

// ------------------------------------------------------------ 9. the lesson's own numbers
{
  const mod = (a, b) => M.diff(M.place('mod', 0, M.NAMES.slice(0, a)), M.place('mod', 0, M.NAMES.slice(0, b))).moved;
  ok(mod(4, 5) === 166 && mod(4, 3) === 158, 'the lesson: hash mod N moves 166 (4 to 5) and 158 (4 to 3)');
  const ring = (a, b) => M.diff(M.place('ring', 100, M.NAMES.slice(0, a)), M.place('ring', 100, M.NAMES.slice(0, b)));
  ok(ring(4, 5).moved === 39 && ring(4, 3).moved === 47, 'the ring moves 39 (4 to 5) and 47 (4 to 3)');
}

// ------------------------------------------------------------ 10. the point names' salt, by hard bounds
// With it the instance shows what the theory says (and sharding.spec.ts pins the same bounds): at every node count the
// fullest shard and the largest share of the ring fall from 1 to 10 to 100 points a node; E2's joiner is within 15% of
// its even share and every old node gives some; E3's fullest holds over half; the hot key is on one node on every ring;
// and the challenge has exactly one solution, whose 10-point near miss fails with visibly less even key piles.
{
  const rows = [];
  for (const n of M.NODE_COUNTS) {
    const at = M.POINTS.map((p) => M.place('ring', p, M.NAMES.slice(0, n)));
    const full = at.map((pl) => Math.max(...Object.values(pl.counts)));
    const ring = at.map((pl) => Math.max(...Object.values(pl.ringShare)));
    ok(full[0] >= full[1] + 4 && full[1] >= full[2] + 4, `${n} nodes: the fullest shard falls by 4 keys or more from 1 to 10 to 100 points (${full.join(' / ')})`);
    ok(ring[0] > ring[1] + 0.01 && ring[1] > ring[2] + 0.005, `${n} nodes: the largest ring share falls from 1 to 10 to 100 points`);
    rows.push(`${n} nodes ${full.join(' / ')} keys, ${ring.map((x) => (x * 100).toFixed(1)).join(' / ')}% of the ring`);
  }
  console.log(`\nfullest shard and largest ring share at 1 / 10 / 100 points:\n  ${rows.join('\n  ')}`);
  const hots = new Set(M.NODE_COUNTS.flatMap((n) => M.POINTS.map((p) => M.place('ring', p, M.NAMES.slice(0, n)).hot)));
  ok(hots.size === 1, 'the hot key is on one node on every ring');
  const base = { ...M.SETUP.challenge, ...M.CHALLENGE_SOLUTION };
  const spread = (sc) => Math.max(...Object.values(sc.now.counts)) - Math.min(...Object.values(sc.now.counts));
  const ten = M.scenario({ ...base, points: 10 });
  const sol = M.scenario(base);
  ok(!M.goalMet(M.CHALLENGE_GOAL, ten.settings, ten.metrics) && spread(ten) >= spread(sol) + 6, `the challenge's 10-point near miss fails with less even piles (${spread(ten)} keys apart against ${spread(sol)})`);
}

console.log(`\nfullest shard over every setting: ${maxCount} keys; busiest: ${M.pct(maxTraffic)} of the traffic`);
console.log(`a single join or leave moves at least ${minMoved} keys`);
console.log(`${settings.length} settings, ${scenarios} scenarios with a last change, ${sentences.length} sentences, ${transitions} changes of the node set`);
console.log(`\n${checks} checks, ${fails.length} failed`);
for (const f of fails.slice(0, 40)) console.log(`  FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
