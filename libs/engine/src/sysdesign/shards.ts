import type { DesignNode, ShardKey } from './types.js';

const TENANT_SHARE = 0.4;
const TIME_RECENT_READS = 0.6;

/** Fraction of reads and writes each shard receives under a shard key, hottest shard first. */
export function shardShares(key: ShardKey, shards: number): { read: number[]; write: number[] } {
  if (shards <= 1) return { read: [1], write: [1] };
  const rest = (share: number) => Array.from({ length: shards - 1 }, () => (1 - share) / (shards - 1));
  switch (key) {
    case 'hash': {
      const even = Array.from({ length: shards }, () => 1 / shards);
      return { read: even, write: [...even] };
    }
    case 'time':
      return { read: [TIME_RECENT_READS, ...rest(TIME_RECENT_READS)], write: [1, ...rest(1)] };
    case 'tenant': {
      const shares = [TENANT_SHARE, ...rest(TENANT_SHARE)].sort((x, y) => y - x);
      return { read: shares, write: [...shares] };
    }
  }
}

export function available(node: DesignNode): number {
  return Math.max(0, node.instances - (node.failed ?? 0));
}
