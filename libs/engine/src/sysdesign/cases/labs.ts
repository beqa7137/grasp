import type { Design, DesignNode, Workload } from '../types.js';

/** Glyphs a case draws in place of a node kind's own, for a role the kind plays (REDESIGN.md 4.6). */
export type RoleGlyph = 'log' | 'matcher' | 'sequencer';

/**
 * The workload controls a build offers (REDESIGN.md 4.5): Traffic is a handle on the client, between `min` and `max`
 * requests a second; the read share, bot traffic (up to `max` a second) and the share of whole files only where the build
 * uses them. Each starts at the build's own workload.
 */
export interface WorkloadControls {
  traffic: { min: number; max: number };
  reads?: true;
  bots?: { max: number };
  files?: true;
}

/** A case study's reference design, opened in the Design Lab under the load the case estimates. */
export interface CaseLab {
  workload: Workload;
  /** The controls this build declares; the workload's numbers are their defaults. */
  controls: WorkloadControls;
  design: Design;
  /** Nodes that draw a role glyph instead of their kind's, by node id. */
  roles?: Readonly<Record<string, RoleGlyph>>;
}

export const TRAFFIC = { min: 100, max: 1_000_000 } as const;
const READS: WorkloadControls = { traffic: TRAFFIC, reads: true };
const FILES: WorkloadControls = { traffic: TRAFFIC, reads: true, files: true };
const BOTS: WorkloadControls = { traffic: TRAFFIC, reads: true, bots: { max: 100_000 } };

const n = (id: string, kind: DesignNode['kind'], x: number, y: number, instances = 1, extra: Partial<DesignNode> = {}): DesignNode => ({
  id,
  kind,
  x,
  y,
  instances,
  ...extra,
});

const chain = (...ids: string[]) => ids.slice(1).map((to, i) => ({ from: ids[i], to }));

export const CASE_LABS: Record<string, CaseLab> = {
  'url-shortener': {
    workload: { rps: 40_000, readRatio: 0.99 },
    controls: READS,
    design: {
      nodes: [
        n('users', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 32),
        n('cache', 'cache', 700, 120, 2, { hitRate: 0.9 }),
        n('db', 'db', 910, 240, 2, { shardKey: 'hash' }),
        n('replica', 'replica', 910, 390, 2),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'news-feed': {
    workload: { rps: 35_000, readRatio: 0.95 },
    controls: READS,
    design: {
      nodes: [
        n('users', 'client', 80, 240),
        n('lb', 'lb', 300, 240, 2),
        n('app', 'app', 520, 240, 26),
        n('cache', 'cache', 730, 110, 3, { hitRate: 0.95 }),
        n('queue', 'queue', 730, 370, 2),
        n('worker', 'worker', 950, 380, 4),
        n('db', 'db', 950, 240, 3, { shardKey: 'hash' }),
        n('replica', 'replica', 950, 100, 3),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'rate-limiter': {
    workload: { rps: 40_000, readRatio: 0.9, botRps: 60_000 },
    controls: BOTS,
    design: {
      nodes: [
        n('users', 'client', 80, 240),
        n('limiter', 'limiter', 260, 240, 3),
        n('lb', 'lb', 440, 240, 2),
        n('app', 'app', 620, 240, 30),
        n('cache', 'cache', 780, 110, 2, { hitRate: 0.85 }),
        n('db', 'db', 950, 240, 3, { shardKey: 'hash' }),
        n('replica', 'replica', 950, 390, 3),
      ],
      edges: [...chain('users', 'limiter', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  typeahead: {
    workload: { rps: 100_000, readRatio: 0.99 },
    controls: READS,
    design: {
      nodes: [
        n('users', 'client', 80, 240),
        n('cdn', 'cdn', 260, 240, 1, { hitRate: 0.5 }),
        n('lb', 'lb', 440, 240, 2),
        n('app', 'app', 620, 240, 36),
        n('cache', 'cache', 770, 100, 2, { hitRate: 0.95 }),
        n('replica', 'replica', 950, 80, 2),
        n('db', 'db', 950, 240, 2, { shardKey: 'hash' }),
        n('queue', 'queue', 770, 380, 2),
        n('worker', 'worker', 950, 380, 2),
      ],
      edges: [...chain('users', 'cdn', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  chat: {
    workload: { rps: 20_000, readRatio: 0.5 },
    controls: READS,
    roles: { queue: 'log' },
    design: {
      nodes: [
        n('users', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 16, { label: 'Gateways' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.9, label: 'Sessions' }),
        n('queue', 'queue', 700, 380, 2, { label: 'Message log' }),
        n('worker', 'worker', 910, 380, 12, { label: 'Delivery' }),
        n('db', 'db', 910, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 910, 100, 8),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  notifications: {
    workload: { rps: 14_500, readRatio: 0.2 },
    controls: READS,
    design: {
      nodes: [
        n('users', 'client', 80, 240, 1, { label: 'Calling services' }),
        n('limiter', 'limiter', 260, 240, 2),
        n('lb', 'lb', 440, 240, 2),
        n('app', 'app', 620, 240, 28),
        n('cache', 'cache', 770, 100, 2, { hitRate: 0.9 }),
        n('queue', 'queue', 770, 380, 2),
        n('worker', 'worker', 950, 380, 10),
        n('db', 'db', 950, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 950, 100, 8),
      ],
      edges: [...chain('users', 'limiter', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'web-crawler': {
    workload: { rps: 19_300, readRatio: 0.9 },
    controls: READS,
    design: {
      nodes: [
        n('parsers', 'client', 80, 240, 1, { label: 'Parsers' }),
        n('lb', 'lb', 300, 240, 2),
        n('app', 'app', 520, 240, 14),
        n('cache', 'cache', 730, 110, 2, { hitRate: 0.8 }),
        n('queue', 'queue', 730, 370, 2, { label: 'Frontier' }),
        n('worker', 'worker', 950, 380, 2, { label: 'Frontier writers' }),
        n('db', 'db', 950, 240, 4, { shardKey: 'hash' }),
        n('replica', 'replica', 950, 100, 4),
      ],
      edges: [...chain('parsers', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'video-streaming': {
    workload: { rps: 200_000, readRatio: 0.99 },
    controls: READS,
    roles: { queue: 'log' },
    design: {
      nodes: [
        n('viewers', 'client', 80, 240, 1, { label: 'Viewers' }),
        n('cdn', 'cdn', 260, 240, 1, { hitRate: 0.95 }),
        n('lb', 'lb', 440, 240, 2),
        n('app', 'app', 620, 240, 10, { label: 'API' }),
        n('cache', 'cache', 770, 100, 2, { hitRate: 0.9 }),
        n('replica', 'replica', 950, 80, 2),
        n('db', 'db', 950, 240, 2, { shardKey: 'hash' }),
        n('segments', 'blob', 440, 400, 1, { label: 'Segments' }),
        n('queue', 'queue', 770, 380, 2, { label: 'View events' }),
        n('worker', 'worker', 950, 380, 2, { label: 'Counters' }),
      ],
      edges: [
        ...chain('viewers', 'cdn', 'lb', 'app', 'cache', 'db', 'replica'),
        ...chain('app', 'queue', 'worker', 'db'),
        { from: 'cdn', to: 'segments' },
      ],
    },
  },
  payments: {
    workload: { rps: 12_000, readRatio: 0.6 },
    controls: READS,
    design: {
      nodes: [
        n('users', 'client', 80, 240, 1, { label: 'Payment services' }),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 10),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.8 }),
        n('db', 'db', 910, 240, 4, { shardKey: 'hash' }),
        n('replica', 'replica', 910, 390, 4),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'payment-ledger': {
    workload: { rps: 14_000, readRatio: 0.5 },
    controls: READS,
    design: {
      nodes: [
        n('services', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('ledger', 'app', 490, 240, 12, { label: 'Ledger service' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.7 }),
        n('db', 'db', 910, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 910, 390, 8),
      ],
      edges: [...chain('services', 'lb', 'ledger', 'cache', 'db', 'replica'), { from: 'ledger', to: 'db' }],
    },
  },
  'proximity-service': {
    workload: { rps: 34_800, readRatio: 0.998 },
    controls: READS,
    design: {
      nodes: [
        n('phones', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('search', 'app', 490, 240, 26, { label: 'Search servers' }),
        n('cache', 'cache', 700, 120, 2, { hitRate: 0.95, label: 'Index and pages' }),
        n('db', 'db', 910, 240, 1, { label: 'Business store' }),
        n('replica', 'replica', 910, 390, 2),
      ],
      edges: [...chain('phones', 'lb', 'search', 'cache', 'db', 'replica'), { from: 'search', to: 'db' }],
    },
  },
  'ride-sharing': {
    workload: { rps: 20_000, readRatio: 0.5 },
    controls: READS,
    roles: { queue: 'log' },
    design: {
      nodes: [
        n('phones', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 14, { label: 'Gateways' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.95, label: 'Geo index' }),
        n('queue', 'queue', 700, 380, 2, { label: 'Location log' }),
        n('worker', 'worker', 910, 380, 9, { label: 'History writers' }),
        n('db', 'db', 910, 240, 6, { shardKey: 'hash', label: 'Trips' }),
        n('replica', 'replica', 910, 100, 6),
      ],
      edges: [...chain('phones', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'distributed-cache': {
    workload: { rps: 40_000, readRatio: 0.95 },
    controls: READS,
    design: {
      nodes: [
        n('services', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 28),
        n('cache', 'cache', 700, 120, 2, { hitRate: 0.95 }),
        n('db', 'db', 910, 240, 2, { shardKey: 'hash' }),
        n('replica', 'replica', 910, 390, 2),
      ],
      edges: [...chain('services', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  ticketing: {
    workload: { rps: 105_000, readRatio: 0.995, botRps: 40_000 },
    controls: BOTS,
    design: {
      nodes: [
        n('users', 'client', 80, 240),
        n('edge', 'cdn', 260, 240, 1, { hitRate: 0.95, label: 'Waiting room' }),
        n('limiter', 'limiter', 440, 240, 2, { label: 'Bot defense' }),
        n('lb', 'lb', 440, 390, 2),
        n('app', 'app', 620, 240, 6),
        n('cache', 'cache', 780, 100, 2, { hitRate: 0.9 }),
        n('db', 'db', 950, 240, 2, { shardKey: 'tenant' }),
        n('replica', 'replica', 950, 390, 2),
      ],
      edges: [...chain('users', 'edge', 'limiter', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'search-engine': {
    workload: { rps: 40_000, readRatio: 0.98 },
    controls: READS,
    roles: { queue: 'log' },
    design: {
      nodes: [
        n('users', 'client', 80, 240),
        n('lb', 'lb', 300, 240, 2),
        n('app', 'app', 520, 240, 30, { label: 'Query tier' }),
        n('cache', 'cache', 730, 110, 2, { hitRate: 0.5, label: 'Result cache' }),
        n('queue', 'queue', 730, 370, 2, { label: 'Crawl log' }),
        n('worker', 'worker', 950, 380, 2, { label: 'Indexers' }),
        n('db', 'db', 950, 240, 4, { shardKey: 'hash', label: 'Index shards' }),
        n('replica', 'replica', 950, 100, 4, { label: 'Index replicas' }),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'file-sync': {
    workload: { rps: 60_000, readRatio: 0.9, objectShare: 0.5 },
    controls: FILES,
    design: {
      nodes: [
        n('devices', 'client', 80, 240),
        n('cdn', 'cdn', 260, 240, 1, { hitRate: 0.3 }),
        n('lb', 'lb', 440, 240, 2),
        n('app', 'app', 620, 240, 32, { label: 'Metadata API' }),
        n('cache', 'cache', 780, 100, 2, { hitRate: 0.85 }),
        n('db', 'db', 950, 240, 4, { shardKey: 'hash', label: 'Metadata' }),
        n('blocks', 'blob', 620, 400, 1, { label: 'Block store' }),
        n('replica', 'replica', 950, 390, 4),
      ],
      edges: [...chain('devices', 'cdn', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }, { from: 'app', to: 'blocks' }],
    },
  },
  leaderboard: {
    workload: { rps: 50_000, readRatio: 0.83 },
    controls: READS,
    roles: { queue: 'log' },
    design: {
      nodes: [
        n('players', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 38),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.95, label: 'Sorted sets' }),
        n('queue', 'queue', 700, 380, 2, { label: 'Result stream' }),
        n('worker', 'worker', 910, 380, 8, { label: 'Consumers' }),
        n('db', 'db', 910, 240, 6, { shardKey: 'hash' }),
        n('replica', 'replica', 910, 100, 6),
      ],
      edges: [...chain('players', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'ad-click-aggregator': {
    workload: { rps: 12_500, readRatio: 0.04 },
    controls: READS,
    roles: { queue: 'log' },
    design: {
      nodes: [
        n('users', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 10, { label: 'Click servers' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.8 }),
        n('queue', 'queue', 700, 380, 2, { label: 'Click log' }),
        n('worker', 'worker', 910, 380, 12, { label: 'Stream processor' }),
        n('db', 'db', 910, 240, 8, { shardKey: 'hash', label: 'Analytics store' }),
        n('replica', 'replica', 910, 100, 8),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'job-scheduler': {
    workload: { rps: 35_000, readRatio: 0.6 },
    controls: READS,
    design: {
      nodes: [
        n('services', 'client', 80, 240, 1, { label: 'Team services' }),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 24, { label: 'API and schedulers' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.9 }),
        n('queue', 'queue', 700, 380, 2),
        n('worker', 'worker', 910, 380, 12),
        n('db', 'db', 910, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 910, 100, 8),
      ],
      edges: [...chain('services', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'collaborative-editor': {
    workload: { rps: 10_500, readRatio: 0.05 },
    controls: READS,
    roles: { db: 'log' },
    design: {
      nodes: [
        n('clients', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 8),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.9 }),
        n('db', 'db', 910, 240, 8, { shardKey: 'hash', label: 'Operation log' }),
        n('replica', 'replica', 910, 390, 8),
      ],
      edges: [...chain('clients', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'metrics-monitoring': {
    workload: { rps: 10_000, readRatio: 0.3 },
    controls: READS,
    roles: { queue: 'log' },
    design: {
      nodes: [
        n('agents', 'client', 80, 240, 1, { label: 'Agents' }),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 12, { label: 'Distributors' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.8, label: 'Query cache' }),
        n('queue', 'queue', 700, 380, 2, { label: 'Ingest log' }),
        n('worker', 'worker', 910, 380, 8, { label: 'Ingesters' }),
        n('db', 'db', 910, 240, 8, { shardKey: 'hash', label: 'TSDB' }),
        n('replica', 'replica', 910, 100, 8, { label: 'Store replicas' }),
      ],
      edges: [...chain('agents', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'hotel-booking': {
    workload: { rps: 12_000, readRatio: 0.85 },
    controls: READS,
    design: {
      nodes: [
        n('travelers', 'client', 80, 240),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 10),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.9, label: 'Search index' }),
        n('queue', 'queue', 700, 380, 2, { label: 'Outbox' }),
        n('worker', 'worker', 910, 380, 4, { label: 'Sync workers' }),
        n('db', 'db', 910, 240, 4, { shardKey: 'hash' }),
        n('replica', 'replica', 910, 100, 4),
      ],
      edges: [...chain('travelers', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'stock-exchange': {
    workload: { rps: 30_000, readRatio: 0.6 },
    controls: READS,
    roles: { sequencer: 'sequencer', engines: 'matcher' },
    design: {
      nodes: [
        n('members', 'client', 80, 240, 1, { label: 'Members' }),
        n('lb', 'lb', 290, 240, 2),
        n('gateways', 'app', 490, 240, 24, { label: 'Gateways' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.9, label: 'Status and books' }),
        n('sequencer', 'queue', 700, 380, 2, { label: 'Sequencer' }),
        n('engines', 'worker', 910, 380, 10, { label: 'Matching engines' }),
        n('db', 'db', 910, 240, 8, { shardKey: 'hash', label: 'Trade store' }),
        n('replica', 'replica', 910, 100, 8, { label: 'Trade replicas' }),
      ],
      edges: [...chain('members', 'lb', 'gateways', 'cache', 'db', 'replica'), ...chain('gateways', 'sequencer', 'engines', 'db')],
    },
  },
  'message-queue': {
    workload: { rps: 37_500, readRatio: 0.8 },
    controls: READS,
    roles: { db: 'log' },
    design: {
      nodes: [
        n('clients', 'client', 80, 240, 1, { label: 'Producers and consumers' }),
        n('lb', 'lb', 290, 240, 2),
        n('app', 'app', 490, 240, 26, { label: 'Brokers' }),
        n('cache', 'cache', 700, 120, 2, { hitRate: 0.95, label: 'Page cache' }),
        n('db', 'db', 910, 240, 8, { shardKey: 'hash', label: 'Partition leaders' }),
        n('replica', 'replica', 910, 390, 8, { label: 'Followers' }),
      ],
      edges: [...chain('clients', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'email-service': {
    workload: { rps: 10_100, readRatio: 0.36, objectShare: 0.3 },
    controls: FILES,
    roles: { queue: 'log' },
    design: {
      nodes: [
        n('mail', 'client', 80, 240, 1, { label: 'Senders and apps' }),
        n('lb', 'lb', 290, 240, 2),
        n('front', 'app', 490, 240, 8, { label: 'SMTP, API and sync' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.8, label: 'Recent mail' }),
        n('blob', 'blob', 490, 400, 1, { label: 'Bodies and attachments' }),
        n('queue', 'queue', 700, 380, 2, { label: 'Inbound queue' }),
        n('worker', 'worker', 910, 380, 6, { label: 'Filter and deliver' }),
        n('db', 'db', 910, 240, 4, { shardKey: 'hash', label: 'Metadata shards' }),
        n('replica', 'replica', 910, 100, 4),
      ],
      edges: [
        ...chain('mail', 'lb', 'front', 'cache', 'db', 'replica'),
        ...chain('front', 'queue', 'worker', 'db'),
        { from: 'front', to: 'blob' },
        { from: 'worker', to: 'blob' },
      ],
    },
  },
  'feature-flags': {
    workload: { rps: 25_700, readRatio: 0.97 },
    controls: READS,
    design: {
      nodes: [
        n('sdks', 'client', 80, 240, 1, { label: 'Apps and SDKs' }),
        n('lb', 'lb', 290, 240, 2),
        n('eval', 'app', 490, 240, 18, { label: 'Evaluation' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.99, label: 'Rulesets' }),
        n('queue', 'queue', 700, 380, 2, { label: 'Summaries' }),
        n('worker', 'worker', 910, 380, 2),
        n('db', 'db', 910, 240, 1, { label: 'Flag store' }),
        n('replica', 'replica', 910, 100, 2),
      ],
      edges: [...chain('sdks', 'lb', 'eval', 'cache', 'db', 'replica'), ...chain('eval', 'queue', 'worker', 'db')],
    },
  },
  'code-deployment': {
    workload: { rps: 2_500, readRatio: 0.66, objectShare: 0 },
    controls: FILES,
    design: {
      nodes: [
        n('agents', 'client', 80, 240, 1, { label: 'Host agents' }),
        n('lb', 'lb', 290, 240, 2),
        n('api', 'app', 490, 240, 4, { label: 'Control plane' }),
        n('cache', 'cache', 700, 100, 2, { hitRate: 0.95, label: 'Desired state' }),
        n('blob', 'blob', 490, 400, 1, { label: 'Artifact store' }),
        n('queue', 'queue', 700, 380, 2, { label: 'Host reports' }),
        n('worker', 'worker', 910, 380, 2, { label: 'Rollout analysis' }),
        n('db', 'db', 910, 240, 1, { label: 'Deploy store' }),
        n('replica', 'replica', 910, 100, 2),
      ],
      edges: [
        ...chain('agents', 'lb', 'api', 'cache', 'db', 'replica'),
        ...chain('api', 'queue', 'worker', 'db'),
        { from: 'api', to: 'blob' },
      ],
    },
  },
};

export function getCaseLab(id: string): CaseLab | undefined {
  return Object.hasOwn(CASE_LABS, id) ? CASE_LABS[id] : undefined;
}
