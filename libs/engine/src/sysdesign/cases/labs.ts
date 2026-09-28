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
};

export function getCaseLab(id: string): CaseLab | undefined {
  return Object.hasOwn(CASE_LABS, id) ? CASE_LABS[id] : undefined;
}
