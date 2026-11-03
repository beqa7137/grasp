import {
  QUORUM_CHALLENGE_BOUNDS,
  QUORUM_VERSIONS,
  REPLICA_STATE_NAMES,
  WRITE_TIMEOUT_MS,
  formatDuration,
  formatMs,
  formatNines,
  quorumLevelName,
  type QuorumScenario,
  type ReplicaState,
} from '@grasp/engine';
import type { Tone } from './quorum-draw';

const { old: V7, new: V8 } = QUORUM_VERSIONS;

/**
 * What the open question hides, on every surface: the stage, its summary, the notices, the cards' names, the handles'
 * values and Describe all read this one map (a region a question names, and the regions it implies).
 */
export interface Hid {
  count: boolean;
  verdict: boolean;
  write: boolean;
  writeTime: boolean;
  /** Which replicas acked, as the strip colours them. */
  ackers: boolean;
  avail: boolean;
  repair: boolean;
  readTime: boolean;
  read: boolean;
  any: boolean;
}

export function hiding(hide: readonly string[]): Hid {
  const h = new Set(hide);
  const read = h.has('read');
  const verdict = h.has('verdict') || read;
  const write = h.has('write');
  const writeTime = write || h.has('write-time');
  const count = h.has('count') || write;
  return {
    count,
    verdict,
    write,
    writeTime,
    ackers: count || writeTime,
    avail: h.has('availability'),
    repair: h.has('repair') || verdict,
    readTime: h.has('repair') || verdict,
    read,
    any: h.size > 0,
  };
}

export const NOTHING_HIDDEN = hiding([]);

export const STATE_WORD: Record<ReplicaState, string> = { up: 'up', down: 'down', mid: 'stopped', back: 'missed v8' };
export const STATE_SHORT: Record<ReplicaState, string | null> = { up: null, down: 'down', mid: 'stopped', back: 'missed' };
export const NEXT: Record<ReplicaState, ReplicaState> = { up: 'down', down: 'mid', mid: 'back', back: 'up' };
export const NEXT_PHRASE: Record<ReplicaState, string> = {
  down: 'take it down',
  mid: 'make it stop mid-write',
  back: 'bring it back, having missed the write',
  up: 'bring it up',
};

export const nameList = (names: readonly string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
export const timeText = (v: number) => (v >= 1000 ? formatDuration(v) : formatMs(v));
const names = (m: QuorumScenario, ids: readonly number[]) => nameList(ids.map((id) => m.all[id].name));

export function pillOf(m: QuorumScenario, hid: Hid): { tone: Tone; text: string } {
  const r = m.read;
  if (hid.verdict) return { tone: 'hidden', text: 'returns ? · after your answer' };
  const time = hid.readTime ? '? ms' : timeText(r.ms ?? 0);
  switch (m.verdict) {
    case 'fresh':
      return { tone: 'final', text: `returns v${V8} · fresh · ${time}` };
    case 'stale':
      return { tone: 'critical', text: `returns v${V7} · stale · ${time}` };
    case 'refused':
      return r.outcome === 'no-copy'
        ? { tone: 'critical', text: `write refused · read finds no copy · ${time}` }
        : { tone: 'neutral', text: `write refused · read ${time}` };
    case 'timed-out':
      return { tone: 'warn', text: `write timed out · returns v${V8} · ${time}` };
    case 'old':
      return { tone: 'neutral', text: `write timed out · read ${time}` };
    case 'failed-write':
      return { tone: 'neutral', text: `write timed out, applied nowhere · read ${time}` };
    default:
      return r.outcome === 'timed-out'
        ? { tone: 'critical', text: `read times out · ${r.reachable} answered, ${r.needed} needed` }
        : { tone: 'critical', text: `read fails · ${r.reachable} reachable, ${r.needed} needed` };
  }
}

const level = (k: number, n: number) => quorumLevelName(k, n) ?? String(k);

/** The stage's one-sentence description, which says nothing the open question hides. */
export function summary(m: QuorumScenario, hid: Hid): string {
  const { n, w, r } = m.settings;
  const parts = [`${n} replicas, W ${level(w, n)}, R ${level(r, n)}.`];
  if (hid.write) parts.push("The write's outcome shows after your answer.");
  else if (hid.writeTime) parts.push("The write's time shows after your answer.");
  else if (m.write.outcome === 'acked') parts.push(`The write is acked in ${formatMs(m.write.ms)} by ${names(m, m.write.acked)}.`);
  else if (m.write.outcome === 'refused') parts.push(`The write is refused: ${m.write.live} live, ${m.write.needed} needed.`);
  else parts.push('The write times out.');
  if (hid.read) parts.push('The read runs after your answer.');
  else if (hid.verdict) parts.push('What the read returns shows after your answer.');
  else parts.push(`${pillOf(m, hid).text}.`);
  if (!hid.count) parts.push(`${m.staleReadSets} of ${m.readSets} read sets can miss v${V8}.`);
  return parts.join(' ');
}

/** What the write did, as a notice says it. */
function writeSaid(m: QuorumScenario): string {
  const w = m.write;
  if (w.outcome === 'acked') return `Acked in ${formatMs(w.ms)} by ${names(m, w.acked)}.`;
  if (w.outcome === 'refused') return `The write is refused at once: ${w.live} live, ${w.needed} needed, so nothing is written.`;
  const applied = w.applied.length ? `; ${names(m, w.applied)} applied it` : ', applied nowhere';
  return `The write timed out at ${formatDuration(WRITE_TIMEOUT_MS)}${applied}.`;
}

/** What the read did, in order: who answered with what, what it repaired, what it returned. */
function readSaid(m: QuorumScenario): string {
  const r = m.read;
  if (!r.set.length)
    return r.outcome === 'timed-out'
      ? `The read times out: ${r.reachable} answered, ${r.needed} needed.`
      : `The read fails at once: ${r.reachable} reachable, ${r.needed} needed.`;
  const heard = nameList(
    [...r.answers]
      .sort((a, b) => a.rtt - b.rtt || a.id - b.id)
      .map((a) => `${m.all[a.id].name} (${a.value === null ? 'no copy' : `v${a.value}`})`),
  );
  const returned = r.returns === null ? `found no copy in ${formatMs(r.ms!)}` : `returned v${r.returns} in ${formatMs(r.ms!)}`;
  const repaired = r.repairs.length ? `, repaired ${names(m, r.repairs)} and ` : ' and ';
  return `The read heard ${heard}${repaired}${returned}.`;
}

/** The outcome in words, after a play or with reduced motion; empty while a question hides any of it. */
export function outcomeNotice(m: QuorumScenario, hid: Hid): string {
  return hid.any ? '' : `${writeSaid(m)} ${readSaid(m)}`;
}

/** A W or R handle's value in words: its level, the count, and what it survives unless the question hides that. */
export function handleText(k: number, n: number, survives: number, succeed: number, verb: string, hid: Hid): string {
  const name = quorumLevelName(k, n);
  const head = name ? `${name}, ${k} of ${n}` : `${k} of ${n}`;
  return hid.avail
    ? `${head}; what it survives shows after your answer`
    : `${head}: survives ${survives} down, ${verb} succeed ${formatNines(succeed)}`;
}

/** A replica card's accessible name: the replica, its state and what activating it does. No value it holds. */
export function cardName(m: QuorumScenario, i: number, locked: boolean): string {
  const rep = m.replicas[i];
  const head = `${rep.name}, ${REPLICA_STATE_NAMES[rep.state]}${rep.pause ? ', paused' : ''}.`;
  return locked ? head : `${head} Activate to ${NEXT_PHRASE[NEXT[rep.state]]}.`;
}

export const DESCRIBE_HEAD = ['Replica', 'State', 'Write round trip', 'Has v8 at', 'Read reaches it', 'Answered'];
export const DESCRIBE_HEAD_COMPACT = ['Rep.', 'State', 'Write rtt, ms', 'Has v8 at, ms', 'Read at, ms', 'Got'];
const COMPACT_STATE: Record<ReplicaState, string> = { up: 'up', down: 'down', mid: 'stopped', back: 'back' };

/** Describe's rows: a row per replica, and per stand-in when sloppy. Phones keep the unit in the heads. */
export function describeRows(m: QuorumScenario, compact: boolean): string[][] {
  const ms = (v: number) => (compact ? formatMs(v).replace(' ms', '') : formatMs(v));
  return m.all.map((x) => {
    const a = m.read.answers.find((q) => q.id === x.id);
    const forR = `R${(x.standsFor ?? 0) + 1}`;
    const state = !x.home
      ? compact
        ? `for ${forR}`
        : `stand-in for ${forR}`
      : compact
        ? COMPACT_STATE[x.state]
        : REPLICA_STATE_NAMES[x.state];
    const value = a ? (a.value === null ? 'no copy' : `v${a.value}`) : '';
    const answered = a ? `${value}${m.read.repairs.includes(x.id) ? (compact ? ', fixed' : ', repaired') : ''}` : '–';
    return [
      compact ? x.name : `${x.name} (DC ${x.dc})`,
      state,
      x.knownDown ? '–' : ms(x.writeRtt),
      m.write.applied.includes(x.id) ? ms(x.landAt) : '–',
      a ? ms(a.readAt) : '–',
      answered,
    ];
  });
}

/** The challenge's status, each bound in the ask's own terms. */
export function goalParts(m: QuorumScenario): { text: string; met: boolean }[] {
  const b = QUORUM_CHALLENGE_BOUNDS;
  const ms = (v: number) => (Number.isFinite(v) ? formatMs(v) : 'fail');
  const said = (met: boolean) => (met ? 'met' : 'not yet');
  const x = m.metrics;
  return [
    { met: x.canMiss < b.canMiss, text: `No read set can miss v${V8}: ${m.staleReadSets} of ${m.readSets} can` },
    { met: x.readMs < b.readMs, text: `reads ${ms(x.readMs)}, under ${formatMs(b.readMs)}` },
    { met: x.writeMs < b.writeMs, text: `writes ${ms(x.writeMs)}, under ${formatMs(b.writeMs)}` },
    { met: x.writeSurvives >= b.writeSurvives, text: `writes survive ${m.survives.write} down, at least ${b.writeSurvives}` },
  ].map((p, i) => ({ met: p.met, text: `${p.text}${i === 0 ? ', ' : ': '}${said(p.met)}` }));
}
