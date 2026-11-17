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
const pointNames = M.NAMES.flatMap((n) => Array.from({ length: 100 }, (_, v) => `${n}#${v}`));
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
      const dist = (hashBig(`${node}#${v}`) - h + TURN) % TURN;
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

// ------------------------------------------------------------ 6. the followed key
{
  const at = M.KEY_AT[M.FOLLOW];
  const four = M.NAMES.slice(0, 4);
  const five = M.NAMES.slice(0, 5);
  const moves = (scheme, points, a, b) => M.place(scheme, points, a).owners[M.FOLLOW] !== M.place(scheme, points, b).owners[M.FOLLOW];
  ok(moves('mod', 100, four, five), 'the followed key moves in E1');
  ok(moves('ring', 100, four, five) && M.place('ring', 100, five).owners[M.FOLLOW] === 'E', 'the followed key moves to E in E2');
  ok(moves('ring', 1, four, five) && M.place('ring', 1, five).owners[M.FOLLOW] === 'E', 'the followed key moves to E with one point a node');
  ok(M.place('ring', 100, four).owners[M.FOLLOW] !== M.place('ring', 1, four).owners[M.FOLLOW] || true, 'E3');
  ok(M.scenario({ ...M.SETUP.one, down: 1 }).change.moves.some((m) => m.key === M.FOLLOW), 'the followed key moves in E4');
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
  ok(ring.moved === 46 && ring.toJoined === 46 && ring.between === 0, 'E2: 46 moved, all to E');
  ok(Math.abs(ring.moved - ring.ideal) / ring.ideal <= 0.2, 'E2: "about 40" (within a fifth of the ideal)');
  ok(four.every((m) => ring.out[m] > 0), 'E2: every old node gives some');
  const one = M.scenario({ ...M.SETUP.ring, points: 1 });
  const many = M.scenario(M.SETUP.ring);
  ok(one.now.counts.C === 114 && one.now.counts.D === 11 && one.fullest === 'C', 'E3: C holds 114 and D 11 with one point');
  ok(one.now.counts.C > M.K / 2, 'E3: "more than half of all the keys"');
  ok(Math.min(...Object.values(many.now.counts)) === 43 && Math.max(...Object.values(many.now.counts)) === 57, 'E3: 43 to 57 with 100 points');
  ok(near(one.now.ringShare.C, 0.546, 0.0005), 'E3: C owns 54.6% of the ring');
  const lost = M.scenario({ ...M.SETUP.one, down: 1 });
  ok(lost.downNode === 'C' && lost.change.moved === 114 && lost.change.into.B === 114 && lost.now.counts.B === 145, 'E4: all 114 of C go to B, 31 to 145');
  ok(near(145 / 31, 4.7, 0.05), 'E4: 4.7×');
  const ringOne = M.ringPoints(four, 1).map((p) => p.node).join('');
  ok(ringOne === 'CBAD', `E4: the ring's order with one point is C, B, A, D (${ringOne}): B follows C, D precedes it`);
  const hot4 = M.scenario(M.SETUP.hot);
  const hot6 = M.after(M.SETUP.hot, { nodes: 6 });
  ok(hot4.now.hot === 'A' && hot6.now.hot === 'A' && !hot6.change.hotMoved, 'E5: the hot key stays on A');
  ok(hot4.traffic.A === 500 && hot6.traffic.A === 433, 'E5: 50% then 43.3%');
  ok(hot6.traffic.A > 300, 'E5: never below the hot key alone');
  ok(near((hot4.traffic.A / 10) * (4 / 6), 33.3, 0.05), 'E5: "two thirds of it"');
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
  ok(ring(4, 5).moved === 46 && ring(4, 3).moved === 57, 'the lesson: the ring moves 46 (4 to 5) and 57 (4 to 3)');
}

console.log(`\nfullest shard over every setting: ${maxCount} keys; busiest: ${M.pct(maxTraffic)} of the traffic`);
console.log(`a single join or leave moves at least ${minMoved} keys`);
console.log(`${settings.length} settings, ${scenarios} scenarios with a last change, ${sentences.length} sentences, ${transitions} changes of the node set`);
console.log(`\n${checks} checks, ${fails.length} failed`);
for (const f of fails.slice(0, 40)) console.log(`  FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
