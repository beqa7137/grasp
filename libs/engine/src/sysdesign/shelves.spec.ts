import { describe, expect, it } from 'vitest';
import { SD_SHELVES, sdTopicShelf } from '../curriculum/sd-shelves.js';
import { SD_TOPICS, getSdTopic } from '../curriculum/sd-topics.js';
import { getCaseSummary } from './case-catalog.js';
import { getScenarioSummary } from './scenario-catalog.js';
import { shelfCases, shelfMissions, shelfStretchAt, topicUses } from './shelves.js';

describe('design shelves', () => {
  it('puts every topic on one of the six shelves, 17 of them core', () => {
    expect(SD_TOPICS).toHaveLength(34);
    const counts = Object.fromEntries(SD_SHELVES.map((s) => [s.id, SD_TOPICS.filter((t) => sdTopicShelf(t.id) === s.id).length]));
    expect(counts).toEqual({ foundations: 5, data: 9, reads: 4, async: 5, coordination: 5, edge: 6 });
    expect(SD_TOPICS.filter((t) => t.level === 'core').map((t) => t.id)).toHaveLength(17);
    expect(SD_SHELVES.flatMap((s) => s.topics).sort()).toEqual(SD_TOPICS.map((t) => t.id).sort());
  });

  it('homes each mission on one shelf: REDESIGN.md 2.8, with Real-Time Delivery and Multi-Region moved', () => {
    const shelves = shelfMissions();
    const home = Object.fromEntries(shelves.map((s) => [s.shelf, s.home.map((m) => `${m.scenarioId} ${m.topicIds.length}`)]));
    expect(home).toEqual({
      foundations: ['first-scale-up 5', 'leaderboard-budget 2'],
      data: ['write-wall 5', 'mail-attachments 2'],
      reads: ['viral-feed 4'],
      async: ['flash-sale 3', 'reconnect-storm 2'],
      coordination: ['ledger-month-end 3'],
      edge: ['bot-storm 4'],
    });
    expect(shelves.flatMap((s) => s.home)).toHaveLength(9);
  });

  it('breaks a tie on home count by the larger share of the shelf: The Feed Goes Viral covers all of Reads at scale', () => {
    const data = shelfMissions().find((s) => s.shelf === 'data')!;
    expect(data.also.find((m) => m.scenarioId === 'viral-feed')?.topicIds).toHaveLength(4);
  });

  it("pins the table of REDESIGN.md 2.8: topics, home missions with their coverage, Also in and the shelves' cases", () => {
    const name = (id: string) => getSdTopic(id)!.name;
    const title = (id: string) => getScenarioSummary(id)!.title;
    const missions = shelfMissions();
    const table = SD_SHELVES.map((s) => {
      const size = s.topics.length;
      const level = (wanted: string) => s.topics.filter((t) => getSdTopic(t)!.level === wanted);
      const entry = missions.find((m) => m.shelf === s.id)!;
      return {
        shelf: `${s.name} (${size})`,
        core: level('core').map(name),
        advanced: level('advanced').map(name),
        home: entry.home.map((m) => `${title(m.scenarioId)} (${m.topicIds.length} of ${size})`),
        also: entry.also.map((m) => `${title(m.scenarioId)} (${m.topicIds.map(name).join(', ')})`),
        cases: shelfCases(s.id).length,
      };
    });
    expect(table).toEqual([
      {
        shelf: 'Foundations (5)',
        core: ['Estimation', 'Latency & Queueing', 'Capacity & Scaling', 'Load Balancing', 'Reliability'],
        advanced: [],
        home: ['Your First Scale-Up (5 of 5)', 'Leaderboard on a Budget (2 of 5)'],
        also: [],
        cases: 21,
      },
      {
        shelf: 'Data (9)',
        core: ['Data Modeling', 'Replication', 'Sharding & Partitioning', 'Consistency & Quorums', 'Unique IDs'],
        advanced: ['Storage Engines', 'Durability & Erasure Coding', 'Backups & Disaster Recovery', 'Multi-Region'],
        home: ['The Write Wall (5 of 9)', 'Attachments Everywhere (2 of 9)'],
        also: [
          'The Feed Goes Viral (Replication, Consistency & Quorums, Multi-Region, Data Modeling)',
          'Month-End Ledger (Sharding & Partitioning)',
        ],
        cases: 24,
      },
      {
        shelf: 'Reads at scale (4)',
        core: ['Caching', 'CDNs & Edge'],
        advanced: ['Search & Indexing', 'Geospatial Indexing'],
        home: ['The Feed Goes Viral (4 of 4)'],
        also: [],
        cases: 14,
      },
      {
        shelf: 'Async & delivery (5)',
        core: ['Queues & Async Work', 'Backpressure & Load Shedding', 'Real-Time Delivery'],
        advanced: ['Stream Processing', 'Batch Processing'],
        home: ['Flash Sale at Noon (3 of 5)', 'Reconnect Storm (2 of 5)'],
        also: ['The Feed Goes Viral (Real-Time Delivery)', 'The Write Wall (Batch Processing)'],
        cases: 16,
      },
      {
        shelf: 'Coordination (5)',
        core: [],
        advanced: ['Consensus & Leaders', 'Distributed Locks & Leases', 'Distributed Transactions', 'Time & Clocks', 'Service Discovery'],
        home: ['Month-End Ledger (3 of 5)'],
        also: [
          'Your First Scale-Up (Service Discovery)',
          'Flash Sale at Noon (Distributed Transactions, Distributed Locks & Leases)',
          'The Write Wall (Time & Clocks)',
          'Reconnect Storm (Service Discovery)',
        ],
        cases: 8,
      },
      {
        shelf: 'Edge & operations (6)',
        core: ['API Design', 'Rate Limiting & Abuse'],
        advanced: ['API Gateways & Service Meshes', 'Security & Auth', 'Multi-Tenancy', 'Observability & SLOs'],
        home: ['Bot Storm (4 of 6)'],
        also: ['Your First Scale-Up (Observability & SLOs, API Design)'],
        cases: 7,
      },
    ]);
  });

  it("finds every topic's missions and cases, each of which really uses the topic", () => {
    for (const t of SD_TOPICS) {
      const uses = topicUses(t.id);
      expect(uses.missions.length, t.id).toBeGreaterThan(0);
      expect(uses.missions.sort()).toEqual([...t.scenarioIds].sort());
      for (const c of uses.cases) expect(getCaseSummary(c)!.topics).toContain(t.id);
    }
    expect(topicUses('sd-rate-limiting')).toEqual({ missions: ['bot-storm'], cases: ['rate-limiter', 'notifications', 'ticketing'] });
    expect(topicUses('sd-unknown')).toEqual({ missions: [], cases: [] });
  });

  it('lists each shelf core first, and marks one with no required topic as Stretch at that level', () => {
    for (const s of SD_SHELVES) {
      const levels = s.topics.map((t) => getSdTopic(t)!.level);
      expect(levels.join(' '), s.id).toMatch(/^(core ?)*(advanced ?)*$/);
    }
    expect(shelfStretchAt('coordination')).toEqual(['early', 'mid']);
    expect(shelfStretchAt('foundations')).toEqual([]);
  });

  it('lists the missions homed elsewhere that touch a shelf', () => {
    const coordination = shelfMissions().find((s) => s.shelf === 'coordination')!;
    expect(coordination.also).toEqual([
      { scenarioId: 'first-scale-up', topicIds: ['sd-discovery'] },
      { scenarioId: 'flash-sale', topicIds: ['sd-transactions', 'sd-locks'] },
      { scenarioId: 'write-wall', topicIds: ['sd-clocks'] },
      { scenarioId: 'reconnect-storm', topicIds: ['sd-discovery'] },
    ]);
  });
});
