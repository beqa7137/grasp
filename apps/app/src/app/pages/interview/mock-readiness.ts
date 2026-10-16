import type { Injector } from '@angular/core';
import { loopReadiness, readinessBand, type PlanRound, type ProgressState, type ReadinessBand } from '@grasp/engine';
import { StoryBankService } from '../behavioral/story-bank.service';

export type RoundScores = Partial<Record<PlanRound, { score: number; band: ReadinessBand }>>;

/** Readiness reads every skill state, with the problem and case catalogs and the story bank, so the hub loads it after it shows. */
export function readinessReader(injector: Injector): (state: ProgressState, now: Date) => RoundScores {
  const bank = injector.get(StoryBankService);
  void bank.load();
  return (state, now) =>
    Object.fromEntries(
      loopReadiness(state, bank.stories(), now).rounds.map((r) => [r.round, { score: r.score, band: readinessBand(r.score) }]),
    );
}
