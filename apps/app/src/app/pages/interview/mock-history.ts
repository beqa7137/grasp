import { Preferences } from '@capacitor/preferences';
import { PLAN_ROUND_TRACK, PLAN_ROUNDS, TRACK_NAMES } from '@grasp/engine';
import { mockHistoryKey } from '../../core/local-drafts';
import type { InterviewMode, InterviewSession, InterviewTrack, Scorecard } from './interview.types';

/** How many scorecards the hub keeps on the device for a visit without a connection. */
export const OFFLINE_SCORECARDS = 5;

const ROUND_ORDER: readonly InterviewTrack[] = PLAN_ROUNDS.map((r) => PLAN_ROUND_TRACK[r]);

/** "lean-hire" as "Lean hire". */
export const verdictName = (verdict: string) => verdict.charAt(0).toUpperCase() + verdict.slice(1).replace(/-/g, ' ');

/** A History row: a session from the API, or one kept on the device, which can no longer be opened offline. */
export interface HistoryEntry {
  id: string;
  track: InterviewTrack;
  title: string;
  mode: InterviewMode;
  at: string;
  verdict: Scorecard['verdict'] | null;
}

export interface HistoryRound {
  track: InterviewTrack;
  name: string;
  entries: HistoryEntry[];
}

export const historyEntry = (s: InterviewSession): HistoryEntry => ({
  id: s.id,
  track: s.track,
  title: s.problem.title,
  mode: s.mode,
  at: s.scoredAt ?? s.createdAt,
  verdict: s.scorecard?.verdict ?? null,
});

/** Grouped by round in loop order, each newest first; a round with no sessions is left out. */
export function historyByRound(entries: readonly HistoryEntry[]): HistoryRound[] {
  return ROUND_ORDER.map((track) => ({
    track,
    name: TRACK_NAMES[track],
    entries: entries.filter((e) => e.track === track).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
  })).filter((r) => r.entries.length);
}

/** The latest scored sessions, which the hub shows when it cannot reach the server. */
export function lastScorecards(sessions: readonly InterviewSession[]): HistoryEntry[] {
  return sessions
    .filter((s) => s.scorecard)
    .map(historyEntry)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, OFFLINE_SCORECARDS);
}

const isEntry = (value: unknown): value is HistoryEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as HistoryEntry).id === 'string' &&
  ROUND_ORDER.includes((value as HistoryEntry).track);

export async function loadKeptScorecards(learnerId: string): Promise<HistoryEntry[]> {
  try {
    const { value } = await Preferences.get({ key: mockHistoryKey(learnerId) });
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, OFFLINE_SCORECARDS) : [];
  } catch {
    return [];
  }
}

export async function keepScorecards(learnerId: string, entries: readonly HistoryEntry[]): Promise<void> {
  await Preferences.set({ key: mockHistoryKey(learnerId), value: JSON.stringify(entries) }).catch(() => undefined);
}
