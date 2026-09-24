import type { ProgressState } from './progress.js';
import { missionRevisits } from './progress.js';
import { buildSession } from './session.js';

export interface Reminder {
  at: Date;
  title: string;
  body: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What a study reminder at each of `times` would say, assuming no study in between. Times with
 * nothing to do are skipped, so a learner who is caught up is not nagged.
 */
export function planReminders(state: ProgressState, times: Date[], tzOffsetMinutes = 0): Reminder[] {
  return times.flatMap((at) => {
    const plan = buildSession(state, { now: at, tzOffsetMinutes });
    const reviews = plan.items.filter((i) => i.reason !== 'new').length;
    const fresh = plan.items.length - reviews;
    const revisit = missionRevisits(state, at).some((m) => m.due);
    if (!plan.items.length && !revisit) return [];

    const title = reviews
      ? `${plural(reviews, 'review')} due${fresh ? ` + ${fresh} new` : ''}`
      : fresh
        ? `${plural(fresh, 'new card')} ready`
        : 'A Design Lab revisit is waiting';
    const body = plan.items.length
      ? `About ${plan.estimatedMinutes} min.${revisit ? ' A Design Lab revisit is due too.' : ' Reviewing now keeps recall near your target.'}`
      : 'Rebuild a mission you cleared, under new conditions.';
    return [{ at, title, body }];
  });
}
