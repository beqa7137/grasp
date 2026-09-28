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
        n('queue', 'queue', 610, 370, 2),
        n('worker', 'worker', 790, 380, 2),
        n('db', 'db', 790, 240, 4, { shardKey: 'hash' }),
        n('replica', 'replica', 790, 100, 4),
      ],
      edges: [...chain('parsers', 'lb', 'app', 'cache', 'db', 'replica'), ...chain('app', 'queue', 'worker', 'db')],
    },
  },
};

export function getCaseLab(id: string): CaseLab | undefined {
  return Object.hasOwn(CASE_LABS, id) ? CASE_LABS[id] : undefined;
}
