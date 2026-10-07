import { describe, expect, it } from 'vitest';
import { SD_SHELVES, sdTopicLevel, sdTopicShelf } from '../curriculum/sd-shelves.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import { shelfMissions } from './shelves.js';

describe('design shelves', () => {
  it('puts every topic on one of the six shelves, 17 of them core', () => {
    expect(SD_TOPICS).toHaveLength(34);
    const counts = Object.fromEntries(SD_SHELVES.map((s) => [s.id, SD_TOPICS.filter((t) => sdTopicShelf(t.id) === s.id).length]));
    expect(counts).toEqual({ foundations: 5, data: 9, reads: 4, async: 5, coordination: 5, edge: 6 });
    expect(SD_TOPICS.filter((t) => sdTopicLevel(t.id) === 'core').map((t) => t.id)).toHaveLength(17);
    expect(SD_SHELVES.flatMap((s) => [...s.core, ...s.advanced]).sort()).toEqual(SD_TOPICS.map((t) => t.id).sort());
  });

  it('homes each mission on one shelf: REDESIGN.md 2.8, with Real-Time Delivery and Multi-Region moved', () => {
    const shelves = shelfMissions();
    const home = Object.fromEntries(shelves.map((s) => [s.shelf, s.home.map((m) => `${m.scenarioId} ${m.topicIds.length}`)]));
    expect(home).toEqual({
      foundations: ['first-scale-up 5', 'leaderboard-budget 2'],
      data: ['write-wall 5', 'mail-attachments 2'],
      reads: ['viral-feed 4'],
      async: ['flash-sale 3', 'reconnect-storm 2'],
      coordination: ['ledger-month-end 1'],
      edge: ['bot-storm 4'],
    });
    expect(shelves.flatMap((s) => s.home)).toHaveLength(9);
  });

  it('breaks a tie on home count by the larger share of the shelf: The Feed Goes Viral covers all of Reads at scale', () => {
    const data = shelfMissions().find((s) => s.shelf === 'data')!;
    expect(data.also.find((m) => m.scenarioId === 'viral-feed')?.topicIds).toHaveLength(4);
  });

  it('lists the missions homed elsewhere that touch a shelf', () => {
    const coordination = shelfMissions().find((s) => s.shelf === 'coordination')!;
    expect(coordination.also).toEqual([
      { scenarioId: 'first-scale-up', topicIds: ['sd-consensus', 'sd-discovery'] },
      { scenarioId: 'flash-sale', topicIds: ['sd-transactions', 'sd-locks'] },
      { scenarioId: 'write-wall', topicIds: ['sd-clocks'] },
    ]);
  });
});
