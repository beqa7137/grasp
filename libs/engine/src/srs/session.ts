import { REVIEW_CATALOG, getReviewItemSummary, itemsForTopic } from '../review/catalog.js';
import { shuffle, type Rand } from '../review/random.js';
import type { ItemKind, ReviewItemSummary } from '../review/types.js';
import { dayKey, isUnlocked, type ProgressState } from './progress.js';
import { retrievability } from './scheduler.js';

export const DEFAULT_SECONDS: Record<ItemKind, number> = {
  recognition: 20,
  predict: 30,
  cloze: 25,
  complexity: 15,
  design: 45,
};

/** First exposure takes longer: reading the explanation is part of learning the item. */
const NEW_ITEM_TIME_FACTOR = 1.5;

/** Learning-phase items due within this window are pulled into the current sitting (Anki's "learn ahead"). */
const LEARN_AHEAD_MS = 20 * 60_000;

const BOOSTED_PER_SESSION = 8;

export interface SessionOptions {
  now: Date;
  tzOffsetMinutes?: number;
  budgetMinutes?: number;
  newPerDay?: number;
  maxItems?: number;
}

export type SessionReason = 'due' | 'relearn' | 'boosted' | 'new';

export interface SessionItem {
  itemId: string;
  reason: SessionReason;
  retrievability: number;
}

export interface SessionPlan {
  items: SessionItem[];
  dueTotal: number;
  dueIncluded: number;
  newIncluded: number;
  /** New items included because a missed prediction or an interview flagged them. */
  boostedIncluded: number;
  newRemainingToday: number;
  estimatedMinutes: number;
  nextDueAt: string | null;
}

export function estimateSeconds(state: ProgressState, kind: ItemKind, isNew: boolean): number {
  const learned = state.durations[kind];
  const base = learned !== undefined ? learned / 1000 : DEFAULT_SECONDS[kind];
  return base * (isNew ? NEW_ITEM_TIME_FACTOR : 1);
}

export function newIntroducedToday(state: ProgressState, now: Date, tzOffsetMinutes = 0): number {
  const today = dayKey(now, tzOffsetMinutes);
  return Object.values(state.cards).filter((c) => dayKey(new Date(c.firstReview), tzOffsetMinutes) === today).length;
}

/**
 * Plans one short sitting: the most-at-risk due items first, then new items (boosted ones first)
 * within a daily cap, all inside a time budget, then interleaved so consecutive items differ in topic and kind.
 */
export function buildSession(state: ProgressState, opts: SessionOptions): SessionPlan {
  const {
    now,
    tzOffsetMinutes = 0,
    budgetMinutes = state.settings.budgetMinutes,
    newPerDay = state.settings.newPerDay,
    maxItems = 40,
  } = opts;
  const budget = budgetMinutes * 60;
  const nowMs = now.getTime();

  const due = Object.entries(state.cards)
    .flatMap(([itemId, card]) => {
      const def = getReviewItemSummary(itemId);
      if (!def) return [];
      const dueMs = Date.parse(card.due);
      const learning = card.phase === 'learning' || card.phase === 'relearning';
      if (dueMs > nowMs && !(learning && dueMs <= nowMs + LEARN_AHEAD_MS)) return [];
      const r = retrievability(itemId, card, now);
      const reason: SessionReason = learning ? 'relearn' : state.boosts[itemId] ? 'boosted' : 'due';
      return [{ def, item: { itemId, reason, retrievability: r } }];
    })
    .sort((a, b) => a.item.retrievability - b.item.retrievability);

  const selected: { def: ReviewItemSummary; item: SessionItem }[] = [];
  let spent = 0;
  for (const d of due) {
    if (selected.length >= maxItems) break;
    const cost = estimateSeconds(state, d.def.kind, false);
    if (selected.length > 0 && spent + cost > budget) break;
    selected.push(d);
    spent += cost;
  }
  const dueIncluded = selected.length;

  const newRemainingToday = Math.max(0, newPerDay - newIntroducedToday(state, now, tzOffsetMinutes));
  let newIncluded = 0;
  let boostedIncluded = 0;
  for (const def of newCandidates(state)) {
    // Items flagged by a missed prediction or an interview bypass the daily new-item cap (up to their own cap).
    const boosted = Boolean(state.boosts[def.id]);
    if (boosted ? boostedIncluded >= BOOSTED_PER_SESSION : newIncluded >= newRemainingToday) {
      if (boosted) continue;
      break;
    }
    if (selected.length >= maxItems) break;
    const cost = estimateSeconds(state, def.kind, true);
    if (selected.length > 0 && spent + cost > budget) break;
    selected.push({ def, item: { itemId: def.id, reason: boosted ? 'boosted' : 'new', retrievability: 0 } });
    spent += cost;
    if (boosted) boostedIncluded++;
    else newIncluded++;
  }

  const upcoming = Object.values(state.cards)
    .map((c) => c.due)
    .filter((d) => Date.parse(d) > nowMs)
    .sort();

  return {
    items: interleave(selected).map((s) => s.item),
    dueTotal: due.length,
    dueIncluded,
    newIncluded: newIncluded + boostedIncluded,
    boostedIncluded,
    newRemainingToday: newRemainingToday - newIncluded,
    estimatedMinutes: Math.max(1, Math.round(spent / 60)),
    nextDueAt: upcoming[0] ?? null,
  };
}

/** Unseen, unlocked items in the order they should be introduced. */
export function newCandidates(state: ProgressState): ReviewItemSummary[] {
  const fresh = REVIEW_CATALOG.filter((def) => !state.cards[def.id] && isUnlocked(def, state));
  const boosted = fresh.filter((d) => state.boosts[d.id]).sort((a, b) => state.boosts[b.id].at.localeCompare(state.boosts[a.id].at));
  const rest = fresh.filter((d) => !state.boosts[d.id]);
  const placement = (d: ReviewItemSummary) => state.placement[d.topic];
  const alreadyKnown = (d: ReviewItemSummary) => placement(d) === 'strong' && d.kind === 'recognition';
  return [
    ...boosted,
    ...mixDeepenAndRecognize(rest.filter((d) => placement(d) === 'weak')),
    ...mixDeepenAndRecognize(rest.filter((d) => placement(d) !== 'weak' && !alreadyKnown(d))),
    ...mixDeepenAndRecognize(rest.filter(alreadyKnown)),
  ];
}

function mixDeepenAndRecognize(defs: ReviewItemSummary[]): ReviewItemSummary[] {
  const deepen = defs.filter((d) => d.kind !== 'recognition');
  const recognize = interleaveByTopic(defs.filter((d) => d.kind === 'recognition'));
  const mixed: ReviewItemSummary[] = [];
  for (let i = 0; i < Math.max(deepen.length, recognize.length); i++) {
    if (deepen[i]) mixed.push(deepen[i]);
    if (recognize[i]) mixed.push(recognize[i]);
  }
  return mixed;
}

function interleaveByTopic(defs: ReviewItemSummary[]): ReviewItemSummary[] {
  const buckets = new Map<string, ReviewItemSummary[]>();
  for (const d of defs) buckets.set(d.topic, [...(buckets.get(d.topic) ?? []), d]);
  const out: ReviewItemSummary[] = [];
  const lists = [...buckets.values()];
  for (let round = 0; out.length < defs.length; round++) {
    for (const list of lists) if (list[round]) out.push(list[round]);
  }
  return out;
}

/**
 * Greedy reorder so neighbours differ in topic and, where possible, kind. Interleaved practice feels
 * harder but transfers better, and interviews never tell you which pattern is coming.
 */
export function interleave<T extends { def: Pick<ReviewItemSummary, 'topic' | 'kind'> }>(items: T[]): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (pool.length) {
    const last = out[out.length - 1]?.def;
    const prev = out[out.length - 2]?.def;
    const score = (x: T) =>
      (last && x.def.topic === last.topic ? 2 : 0) + (last && prev && x.def.kind === last.kind && x.def.kind === prev.kind ? 1 : 0);
    let best = 0;
    for (let i = 1; i < pool.length && score(pool[best]) > 0; i++) if (score(pool[i]) < score(pool[best])) best = i;
    out.push(pool.splice(best, 1)[0]);
  }
  return out;
}

/** Ungraded practice set for one topic: every item, locked or not, interleaved by kind. */
export function practiceSet(topic: string, rand: Rand): string[] {
  const byKind = new Map<ItemKind, ReviewItemSummary[]>();
  for (const d of shuffle(rand, itemsForTopic(topic))) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d]);
  const lists = [...byKind.values()];
  const out: string[] = [];
  for (let round = 0; lists.some((l) => l[round]); round++) for (const l of lists) if (l[round]) out.push(l[round].id);
  return out;
}
