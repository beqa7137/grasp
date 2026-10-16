import { SD_SHELVES, sdTopicShelf, type SdShelf } from '../curriculum/sd-shelves.js';
import { SD_TOPICS, getSdTopic } from '../curriculum/sd-topics.js';
import type { Seniority } from '../behavioral/types.js';
import { TARGET_LEVELS } from '../plan/options.js';
import { LEVEL_PROFILES } from '../readiness/levels.js';
import { CASE_CATALOG } from './case-catalog.js';
import { SCENARIO_CATALOG } from './scenario-catalog.js';

/** A mission as one shelf sees it: the shelf's topics whose `scenarioIds` list the mission. */
export interface ShelfMission {
  scenarioId: string;
  topicIds: string[];
}

export interface ShelfMissions {
  shelf: SdShelf;
  /** Missions whose home is this shelf, in catalog order. */
  home: ShelfMission[];
  /** Missions homed elsewhere that still practise some of this shelf's topics. */
  also: ShelfMission[];
}

/**
 * Every mission has one home shelf: the shelf with the most of its topics. A tie goes to the shelf with fewer home
 * missions so far, then to the shelf whose topics it covers the larger share of, with missions in `SCENARIO_CATALOG` order.
 */
export function shelfMissions(): ShelfMissions[] {
  const result = SD_SHELVES.map((s): ShelfMissions => ({ shelf: s.id, home: [], also: [] }));
  for (const { id } of SCENARIO_CATALOG) {
    const touches = result
      .map((entry) => ({
        entry,
        topicIds: SD_TOPICS.filter((t) => sdTopicShelf(t.id) === entry.shelf && t.scenarioIds.includes(id)).map((t) => t.id),
      }))
      .map((s) => ({ ...s, share: s.topicIds.length / SD_TOPICS.filter((t) => sdTopicShelf(t.id) === s.entry.shelf).length }))
      .filter((s) => s.topicIds.length);
    const home = touches.reduce<(typeof touches)[number] | null>(
      (best, s) =>
        !best ||
        s.topicIds.length > best.topicIds.length ||
        (s.topicIds.length === best.topicIds.length &&
          (s.entry.home.length < best.entry.home.length || (s.entry.home.length === best.entry.home.length && s.share > best.share)))
          ? s
          : best,
      null,
    );
    for (const s of touches) (s === home ? s.entry.home : s.entry.also).push({ scenarioId: id, topicIds: s.topicIds });
  }
  return result;
}

/** Where a topic is practised: the missions its `scenarioIds` list and the case studies tagged with it, in catalog order. */
export function topicUses(topicId: string): { missions: string[]; cases: string[] } {
  const listed = getSdTopic(topicId)?.scenarioIds ?? [];
  return {
    missions: SCENARIO_CATALOG.filter((s) => listed.includes(s.id)).map((s) => s.id),
    cases: CASE_CATALOG.filter((c) => c.topics.includes(topicId)).map((c) => c.id),
  };
}

/** The case studies that use any of a shelf's topics. */
export function shelfCases(shelf: SdShelf): string[] {
  return CASE_CATALOG.filter((c) => c.topics.some((t) => sdTopicShelf(t) === shelf)).map((c) => c.id);
}

/** The levels at which none of a shelf's topics is required, so the hub can mark the shelf "Stretch at <level>". */
export function shelfStretchAt(shelf: SdShelf): Seniority[] {
  const topics: readonly string[] = SD_SHELVES.find((s) => s.id === shelf)!.topics;
  return TARGET_LEVELS.filter((level) => !LEVEL_PROFILES[level].topics.required.some((t) => topics.includes(t)));
}
