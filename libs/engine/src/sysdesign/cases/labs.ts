import type { Design, DesignNode, Workload } from '../types.js';

/** A case study's reference design, opened in the Design Lab under the load the case estimates. */
export interface CaseLab {
  workload: Workload;
  design: Design;
}

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
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 32),
        n('cache', 'cache', 580, 120, 2, { hitRate: 0.9 }),
        n('db', 'db', 760, 240, 2, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 390, 2),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'news-feed': {
    workload: { rps: 35_000, readRatio: 0.95 },
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('lb', 'lb', 250, 240, 2),
        n('app', 'app', 430, 240, 26),
        n('cache', 'cache', 610, 110, 3, { hitRate: 0.95 }),
        n('queue', 'queue', 610, 370, 2),
        n('worker', 'worker', 790, 380, 4),
        n('db', 'db', 790, 240, 3, { shardKey: 'hash' }),
        n('replica', 'replica', 790, 100, 3),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'rate-limiter': {
    workload: { rps: 40_000, readRatio: 0.9, botRps: 60_000 },
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('limiter', 'limiter', 220, 240, 3),
        n('lb', 'lb', 370, 240, 2),
        n('app', 'app', 520, 240, 30),
        n('cache', 'cache', 670, 110, 2, { hitRate: 0.85 }),
        n('db', 'db', 790, 240, 3, { shardKey: 'hash' }),
        n('replica', 'replica', 790, 390, 3),
      ],
      edges: [...chain('users', 'limiter', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  typeahead: {
    workload: { rps: 100_000, readRatio: 0.99 },
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('cdn', 'cdn', 220, 240, 1, { hitRate: 0.5 }),
        n('lb', 'lb', 370, 240, 2),
        n('app', 'app', 520, 240, 36),
        n('cache', 'cache', 640, 100, 2, { hitRate: 0.95 }),
        n('replica', 'replica', 790, 80, 2),
        n('db', 'db', 790, 240, 2, { shardKey: 'hash' }),
        n('queue', 'queue', 640, 380, 2),
        n('worker', 'worker', 790, 380, 2),
      ],
      edges: [...chain('users', 'cdn', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  chat: {
    workload: { rps: 20_000, readRatio: 0.5 },
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 16),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.9 }),
        n('queue', 'queue', 580, 380, 2),
        n('worker', 'worker', 760, 380, 12),
        n('db', 'db', 760, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 100, 8),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  notifications: {
    workload: { rps: 14_500, readRatio: 0.2 },
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('limiter', 'limiter', 220, 240, 2),
        n('lb', 'lb', 370, 240, 2),
        n('app', 'app', 520, 240, 28),
        n('cache', 'cache', 640, 100, 2, { hitRate: 0.9 }),
        n('queue', 'queue', 640, 380, 2),
        n('worker', 'worker', 790, 380, 10),
        n('db', 'db', 790, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 790, 100, 8),
      ],
      edges: [...chain('users', 'limiter', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'web-crawler': {
    workload: { rps: 19_300, readRatio: 0.9 },
    design: {
      nodes: [
        n('parsers', 'client', 70, 240),
        n('lb', 'lb', 250, 240, 2),
        n('app', 'app', 430, 240, 14),
        n('cache', 'cache', 610, 110, 2, { hitRate: 0.8 }),
        n('queue', 'queue', 610, 370, 2, { label: 'Frontier' }),
        n('worker', 'worker', 790, 380, 2, { label: 'Fetchers' }),
        n('pages', 'blob', 430, 400, 1, { share: 0, label: 'Page store' }),
        n('db', 'db', 790, 240, 4, { shardKey: 'hash' }),
        n('replica', 'replica', 790, 100, 4),
      ],
      edges: [
        ...chain('parsers', 'lb', 'app', 'cache', 'db', 'replica'),
        ...chain('app', 'queue', 'worker', 'db'),
        { from: 'worker', to: 'pages' },
      ],
    },
  },
  'video-streaming': {
    workload: { rps: 200_000, readRatio: 0.99 },
    design: {
      nodes: [
        n('viewers', 'client', 70, 240),
        n('cdn', 'cdn', 220, 240, 1, { hitRate: 0.95 }),
        n('lb', 'lb', 370, 240, 2),
        n('app', 'app', 520, 240, 10, { label: 'API' }),
        n('cache', 'cache', 640, 100, 2, { hitRate: 0.9 }),
        n('replica', 'replica', 790, 80, 2),
        n('db', 'db', 790, 240, 2, { shardKey: 'hash' }),
        n('segments', 'blob', 370, 400, 1, { share: 0, label: 'Segments' }),
        n('queue', 'queue', 640, 380, 2, { label: 'Upload jobs' }),
        n('worker', 'worker', 790, 380, 2, { label: 'Transcoders' }),
      ],
      edges: [
        ...chain('viewers', 'cdn', 'lb', 'app', 'cache', 'db', 'replica'),
        ...chain('app', 'queue', 'worker', 'db'),
        { from: 'cdn', to: 'segments' },
        { from: 'worker', to: 'segments' },
      ],
    },
  },
  payments: {
    workload: { rps: 12_000, readRatio: 0.6 },
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 10),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.8 }),
        n('db', 'db', 760, 240, 4, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 390, 4),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'payment-ledger': {
    workload: { rps: 14_000, readRatio: 0.5 },
    design: {
      nodes: [
        n('services', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('ledger', 'app', 410, 240, 12),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.7 }),
        n('db', 'db', 760, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 390, 8),
      ],
      edges: [...chain('services', 'lb', 'ledger', 'cache', 'db', 'replica'), { from: 'ledger', to: 'db' }],
    },
  },
  'proximity-service': {
    workload: { rps: 34_800, readRatio: 0.998 },
    design: {
      nodes: [
        n('phones', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('search', 'app', 410, 240, 26, { label: 'Search servers' }),
        n('cache', 'cache', 580, 120, 2, { hitRate: 0.95, label: 'Index and pages' }),
        n('db', 'db', 760, 240, 1, { label: 'Business store' }),
        n('replica', 'replica', 760, 390, 2),
      ],
      edges: [...chain('phones', 'lb', 'search', 'cache', 'db', 'replica'), { from: 'search', to: 'db' }],
    },
  },
  'ride-sharing': {
    workload: { rps: 20_000, readRatio: 0.5 },
    design: {
      nodes: [
        n('phones', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 14),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.95 }),
        n('queue', 'queue', 580, 380, 2),
        n('worker', 'worker', 760, 380, 9),
        n('db', 'db', 760, 240, 6, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 100, 6),
      ],
      edges: [...chain('phones', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'distributed-cache': {
    workload: { rps: 40_000, readRatio: 0.95 },
    design: {
      nodes: [
        n('services', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 28),
        n('cache', 'cache', 580, 120, 2, { hitRate: 0.95 }),
        n('db', 'db', 760, 240, 2, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 390, 2),
      ],
      edges: [...chain('services', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  ticketing: {
    workload: { rps: 105_000, readRatio: 0.995, botRps: 40_000 },
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('edge', 'cdn', 220, 240, 1, { hitRate: 0.95 }),
        n('limiter', 'limiter', 370, 240, 2),
        n('lb', 'lb', 370, 390, 2),
        n('app', 'app', 520, 240, 6),
        n('cache', 'cache', 650, 100, 2, { hitRate: 0.9 }),
        n('db', 'db', 790, 240, 2, { shardKey: 'tenant' }),
        n('replica', 'replica', 790, 390, 2),
      ],
      edges: [...chain('users', 'edge', 'limiter', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'search-engine': {
    workload: { rps: 40_000, readRatio: 0.98 },
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('lb', 'lb', 250, 240, 2),
        n('app', 'app', 430, 240, 30, { label: 'Query tier' }),
        n('cache', 'cache', 610, 110, 2, { hitRate: 0.5, label: 'Result cache' }),
        n('queue', 'queue', 610, 370, 2, { label: 'Index updates' }),
        n('worker', 'worker', 790, 380, 2, { label: 'Indexers' }),
        n('db', 'db', 790, 240, 4, { shardKey: 'hash', label: 'Index shards' }),
        n('replica', 'replica', 790, 100, 4, { label: 'Index replicas' }),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'file-sync': {
    workload: { rps: 60_000, readRatio: 0.9 },
    design: {
      nodes: [
        n('devices', 'client', 70, 240),
        n('cdn', 'cdn', 220, 240, 1, { hitRate: 0.3 }),
        n('lb', 'lb', 370, 240, 2),
        n('app', 'app', 520, 240, 32, { label: 'Metadata API' }),
        n('cache', 'cache', 650, 100, 2, { hitRate: 0.85 }),
        n('db', 'db', 790, 240, 4, { shardKey: 'hash', label: 'Metadata' }),
        n('blocks', 'blob', 520, 400, 1, { share: 0.5, label: 'Block store' }),
        n('replica', 'replica', 790, 390, 4),
      ],
      edges: [...chain('devices', 'cdn', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }, { from: 'app', to: 'blocks' }],
    },
  },
  leaderboard: {
    workload: { rps: 50_000, readRatio: 0.83 },
    design: {
      nodes: [
        n('players', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 38),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.95 }),
        n('queue', 'queue', 580, 380, 2),
        n('worker', 'worker', 760, 380, 8),
        n('db', 'db', 760, 240, 6, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 100, 6),
      ],
      edges: [...chain('players', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'ad-click-aggregator': {
    workload: { rps: 12_500, readRatio: 0.04 },
    design: {
      nodes: [
        n('users', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 10),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.8 }),
        n('queue', 'queue', 580, 380, 2),
        n('worker', 'worker', 760, 380, 12),
        n('db', 'db', 760, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 100, 8),
      ],
      edges: [...chain('users', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'job-scheduler': {
    workload: { rps: 35_000, readRatio: 0.6 },
    design: {
      nodes: [
        n('services', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 24),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.9 }),
        n('queue', 'queue', 580, 380, 2),
        n('worker', 'worker', 760, 380, 12),
        n('db', 'db', 760, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 100, 8),
      ],
      edges: [...chain('services', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'collaborative-editor': {
    workload: { rps: 10_500, readRatio: 0.05 },
    design: {
      nodes: [
        n('clients', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 8),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.9 }),
        n('db', 'db', 760, 240, 8, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 390, 8),
      ],
      edges: [...chain('clients', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'metrics-monitoring': {
    workload: { rps: 10_000, readRatio: 0.3 },
    design: {
      nodes: [
        n('agents', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 12, { label: 'Ingesters' }),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.8, label: 'Query cache' }),
        n('queue', 'queue', 580, 380, 2, { label: 'Write buffer' }),
        n('worker', 'worker', 760, 380, 8, { label: 'Compactors' }),
        n('db', 'db', 760, 240, 8, { shardKey: 'hash', label: 'TSDB' }),
        n('replica', 'replica', 760, 100, 8, { label: 'Store replicas' }),
      ],
      edges: [...chain('agents', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'hotel-booking': {
    workload: { rps: 12_000, readRatio: 0.85 },
    design: {
      nodes: [
        n('travelers', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 10),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.9 }),
        n('queue', 'queue', 580, 380, 2),
        n('worker', 'worker', 760, 380, 4),
        n('db', 'db', 760, 240, 4, { shardKey: 'hash' }),
        n('replica', 'replica', 760, 100, 4),
      ],
      edges: [...chain('travelers', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
  'stock-exchange': {
    workload: { rps: 30_000, readRatio: 0.6 },
    design: {
      nodes: [
        n('members', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('gateways', 'app', 410, 240, 24, { label: 'Gateways' }),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.9, label: 'Market data' }),
        n('sequencer', 'queue', 580, 380, 2, { label: 'Sequencer' }),
        n('engines', 'worker', 760, 380, 10, { label: 'Matching' }),
        n('db', 'db', 760, 240, 8, { shardKey: 'hash', label: 'Trade store' }),
        n('replica', 'replica', 760, 100, 8, { label: 'Standbys' }),
      ],
      edges: [...chain('members', 'lb', 'gateways', 'cache', 'db', 'replica'), ...chain('gateways', 'sequencer', 'engines', 'db')],
    },
  },
  'message-queue': {
    workload: { rps: 37_500, readRatio: 0.8 },
    design: {
      nodes: [
        n('clients', 'client', 70, 240),
        n('lb', 'lb', 240, 240, 2),
        n('app', 'app', 410, 240, 26, { label: 'Brokers' }),
        n('cache', 'cache', 580, 120, 2, { hitRate: 0.95, label: 'Page cache' }),
        n('db', 'db', 760, 240, 8, { shardKey: 'hash', label: 'Log segments' }),
        n('replica', 'replica', 760, 390, 8, { label: 'Followers' }),
      ],
      edges: [...chain('clients', 'lb', 'app', 'cache', 'db', 'replica'), { from: 'app', to: 'db' }],
    },
  },
  'email-service': {
    workload: { rps: 10_100, readRatio: 0.36 },
    design: {
      nodes: [
        n('mail', 'client', 70, 240, 1, { label: 'Senders and apps' }),
        n('lb', 'lb', 240, 240, 2),
        n('front', 'app', 410, 240, 8, { label: 'SMTP, API and sync' }),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.8, label: 'Recent mail' }),
        n('blob', 'blob', 410, 400, 1, { label: 'Bodies and attachments' }),
        n('queue', 'queue', 580, 380, 2, { label: 'Inbound queue' }),
        n('worker', 'worker', 760, 380, 6, { label: 'Filter and deliver' }),
        n('db', 'db', 760, 240, 4, { shardKey: 'hash', label: 'Metadata shards' }),
        n('replica', 'replica', 760, 100, 4),
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
    design: {
      nodes: [
        n('sdks', 'client', 70, 240, 1, { label: 'Apps and SDKs' }),
        n('lb', 'lb', 240, 240, 2),
        n('eval', 'app', 410, 240, 18, { label: 'Evaluation' }),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.99, label: 'Rulesets' }),
        n('queue', 'queue', 580, 380, 2, { label: 'Summaries' }),
        n('worker', 'worker', 760, 380, 2),
        n('db', 'db', 760, 240, 1, { label: 'Flag store' }),
        n('replica', 'replica', 760, 100, 2),
      ],
      edges: [...chain('sdks', 'lb', 'eval', 'cache', 'db', 'replica'), ...chain('eval', 'queue', 'worker', 'db')],
    },
  },
  'code-deployment': {
    workload: { rps: 2_500, readRatio: 0.66 },
    design: {
      nodes: [
        n('agents', 'client', 70, 240, 1, { label: 'Host agents' }),
        n('lb', 'lb', 240, 240, 2),
        n('api', 'app', 410, 240, 4, { label: 'Control plane' }),
        n('cache', 'cache', 580, 100, 2, { hitRate: 0.95, label: 'Desired state' }),
        n('blob', 'blob', 410, 400, 1, { label: 'Artifact store' }),
        n('queue', 'queue', 580, 380, 2, { label: 'Host reports' }),
        n('worker', 'worker', 760, 380, 2, { label: 'Rollout analysis' }),
        n('db', 'db', 760, 240, 1, { label: 'Deploy store' }),
        n('replica', 'replica', 760, 100, 2),
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
