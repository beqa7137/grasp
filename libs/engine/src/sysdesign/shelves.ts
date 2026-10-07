import { SD_SHELVES, sdTopicShelf, type SdShelf } from '../curriculum/sd-shelves.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
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
