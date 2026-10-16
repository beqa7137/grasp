import { Injectable, inject, signal } from '@angular/core';
import { readDevicePref, writeDevicePref } from '../../core/device-prefs';
import { ProgressService } from '../../core/progress.service';

const LOOP_CARD_KEY = 'grasp.loopCard.hiddenUntil';
const NOT_TODAY_KEY = 'grasp.notToday';
/** "Not now" on the first-run card hides it this many days (REDESIGN.md 2.13). */
export const LOOP_CARD_REST_DAYS = 7;

interface NotToday {
  day: string;
  ids: string[];
}

/**
 * What Today's own view and its lazily loaded parts (the loop card and Up next) share, plus Today's device preferences
 * (REDESIGN.md 2.11): until when "What is your loop?" stays hidden, and the Up next items hidden with "Not today", which
 * hold only for the calendar day they were hidden on. The preferences are read before the first render, so the first-run
 * card never flashes.
 */
@Injectable({ providedIn: 'root' })
export class TodayService {
  private readonly progress = inject(ProgressService);
  /**
   * The learner's calendar day. `ProgressService.now` is replaced every minute and on every record, so whatever must hold
   * between visits (Up next) reads this instead, which changes only when the day does.
   */
  readonly day = this.progress.day;
  /** Today is the page in view; its deferred blocks load and build only then, so a page opened from it goes first. */
  readonly shown = signal(true);
  /** Bumps when Up next should rebuild: Today entered, or the learner changed their loop here. */
  readonly visit = signal(0);
  /** The loop card is open for editing (Edit, or "Set your loop" after "Not now"). */
  readonly editing = signal(false);
  /** The loop card closed with this to announce; Today then moves focus to its heading. A new object each time. */
  readonly closed = signal<{ message: string } | null>(null);

  /** The day key (YYYY-MM-DD) up to which the first-run card stays hidden, or null. */
  readonly loopCardHiddenUntil = signal<string | null>(null);
  private readonly notToday = signal<NotToday | null>(null);

  async init(): Promise<void> {
    const [until, hidden] = await Promise.all([readDevicePref(LOOP_CARD_KEY), readDevicePref(NOT_TODAY_KEY)]);
    this.loopCardHiddenUntil.set(until);
    this.notToday.set(readNotToday(hidden));
  }

  close(message: string): void {
    this.editing.set(false);
    this.visit.update((n) => n + 1);
    this.closed.set({ message });
  }

  hideLoopCard(until: string): Promise<void> {
    this.loopCardHiddenUntil.set(until);
    return writeDevicePref(LOOP_CARD_KEY, until);
  }

  /** The ids hidden on `day`; any other day's are gone. */
  hiddenOn(day: string): ReadonlySet<string> {
    const stored = this.notToday();
    return new Set(stored?.day === day ? stored.ids : []);
  }

  /** Hides at once; a storage write that fails only costs the hiding on the next launch. */
  hide(day: string, id: string): void {
    const value = { day, ids: [...this.hiddenOn(day), id] };
    this.notToday.set(value);
    void writeDevicePref(NOT_TODAY_KEY, JSON.stringify(value)).catch(() => undefined);
  }
}

function readNotToday(value: string | null): NotToday | null {
  try {
    const parsed = value ? (JSON.parse(value) as Partial<NotToday>) : null;
    return parsed && typeof parsed.day === 'string' && Array.isArray(parsed.ids)
      ? { day: parsed.day, ids: parsed.ids.filter((id): id is string => typeof id === 'string') }
      : null;
  } catch {
    return null;
  }
}
