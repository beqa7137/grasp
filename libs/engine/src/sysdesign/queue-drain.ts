/** A queue's load and the workers it can hand jobs to. */
export interface QueueDemand {
  id: string;
  incoming: number;
  workers: string[];
}

export interface QueueDrain {
  /** Jobs each queue hands each worker, per second: `flows.get(queue)?.get(worker)`. */
  flows: Map<string, Map<string, number>>;
  backlogGrowthPerSec: number;
  queueDrainRps: number;
  backlogDrainRatio: number;
}

/** Subsets of a group of queues sharing workers are enumerated, so a larger group is drained as one block. */
const MAX_EXACT_QUEUES = 12;
const TIE = 1e-12;

interface Block {
  queues: QueueDemand[];
  workers: string[];
  ratio: number;
}

/**
 * The fluid limit of workers pulling from the queues they link to. The set of queues with the highest load per unit of
 * capacity it can reach is the bottleneck (Hall's theorem): its workers serve only it, all at the same utilization, and
 * nothing does better. Peeling such blocks off in turn gives the least backlog any assignment can reach, and each block's
 * backlog over its capacity is the shortest time to drain it once the spike ends. Queues holding nothing never enter, so
 * neither does capacity only they reach, and the result does not depend on the order the board lists anything.
 */
export function drainQueues(queues: readonly QueueDemand[], capacity: (worker: string) => number): QueueDrain {
  const result: QueueDrain = { flows: new Map(), backlogGrowthPerSec: 0, queueDrainRps: 0, backlogDrainRatio: 0 };
  let remaining = queues.filter((q) => q.incoming > 0);
  const taken = new Set<string>();
  while (remaining.length) {
    const block = densest(remaining, taken, capacity);
    const load = block.queues.reduce((sum, q) => sum + q.incoming, 0);
    const rate = block.workers.reduce((sum, w) => sum + capacity(w), 0);
    result.backlogGrowthPerSec += Math.max(0, load - rate);
    result.queueDrainRps += rate;
    if (load > rate)
      result.backlogDrainRatio = Math.max(result.backlogDrainRatio, rate > 0 ? (load - rate) / rate : Number.POSITIVE_INFINITY);
    assign(block, capacity, result.flows);
    for (const w of block.workers) taken.add(w);
    remaining = remaining.filter((q) => !block.queues.includes(q));
  }
  return result;
}

function reach(queues: QueueDemand[], taken: Set<string>): string[] {
  return [...new Set(queues.flatMap((q) => q.workers))].filter((w) => !taken.has(w));
}

function densest(queues: QueueDemand[], taken: Set<string>, capacity: (worker: string) => number): Block {
  const of = (subset: QueueDemand[]): Block => {
    const workers = reach(subset, taken);
    const rate = workers.reduce((sum, w) => sum + capacity(w), 0);
    const load = subset.reduce((sum, q) => sum + q.incoming, 0);
    return { queues: subset, workers, ratio: rate > 0 ? load / rate : Number.POSITIVE_INFINITY };
  };
  if (queues.length > MAX_EXACT_QUEUES) return of(queues);
  let best = of(queues);
  for (let mask = 1; mask < 1 << queues.length; mask++) {
    const candidate = of(queues.filter((_, i) => mask & (1 << i)));
    const tie =
      candidate.ratio === best.ratio ||
      (Number.isFinite(candidate.ratio) && Number.isFinite(best.ratio) && Math.abs(candidate.ratio - best.ratio) <= TIE * best.ratio);
    if (tie ? candidate.queues.length > best.queues.length : candidate.ratio > best.ratio) best = candidate;
  }
  return best;
}

/**
 * Within a block every queue is served the same fraction and every worker runs at the same utilization; a maximum flow
 * finds which queue feeds which worker, and the block being the densest guarantees it meets both exactly.
 */
function assign(block: Block, capacity: (worker: string) => number, flows: Map<string, Map<string, number>>) {
  const served = Math.min(1, 1 / block.ratio);
  const utilization = Math.min(1, block.ratio);
  const supply = new Map(block.queues.map((q) => [q.id, q.incoming * served]));
  const room = new Map(block.workers.map((w) => [w, capacity(w) * utilization]));
  const flow = new Map<string, number>();
  const key = (q: string, w: string) => `${q}\u0000${w}`;
  const eps = 1e-9 * Math.max(1, ...supply.values());
  for (;;) {
    const path = augmentingPath(block, supply, room, flow, key, eps);
    if (!path) break;
    const amount = Math.min(supply.get(path.source)!, room.get(path.sink)!, ...path.back.map((k) => flow.get(k)!));
    supply.set(path.source, supply.get(path.source)! - amount);
    room.set(path.sink, room.get(path.sink)! - amount);
    for (const k of path.forward) flow.set(k, (flow.get(k) ?? 0) + amount);
    for (const k of path.back) flow.set(k, flow.get(k)! - amount);
  }
  for (const q of block.queues) {
    const out = new Map<string, number>();
    for (const w of q.workers) {
      const f = flow.get(key(q.id, w)) ?? 0;
      if (f > 0) out.set(w, f);
    }
    flows.set(q.id, out);
  }
}

/** Breadth-first search from a queue with supply left to a worker with room left, over the residual graph. */
function augmentingPath(
  block: Block,
  supply: Map<string, number>,
  room: Map<string, number>,
  flow: Map<string, number>,
  key: (q: string, w: string) => string,
  eps: number,
): { source: string; sink: string; forward: string[]; back: string[] } | undefined {
  const inBlock = new Set(block.workers);
  const byId = new Map(block.queues.map((q) => [q.id, q]));
  const starts = block.queues.filter((q) => supply.get(q.id)! > eps).map((q) => q.id);
  const reached = new Set<string>();
  const queueFrom = new Map<string, { queue: string; worker: string }>();
  const seenQueues = new Set(starts);
  const frontier = [...starts];
  while (frontier.length) {
    const q = frontier.shift()!;
    for (const w of byId.get(q)!.workers) {
      if (!inBlock.has(w) || reached.has(w)) continue;
      reached.add(w);
      if (room.get(w)! > eps) {
        const forward: string[] = [];
        const back: string[] = [];
        let worker = w;
        let queue = q;
        for (;;) {
          forward.push(key(queue, worker));
          const prev = queueFrom.get(queue);
          if (!prev) return { source: queue, sink: w, forward, back };
          back.push(key(queue, prev.worker));
          worker = prev.worker;
          queue = prev.queue;
        }
      }
      for (const other of block.queues) {
        if (seenQueues.has(other.id) || (flow.get(key(other.id, w)) ?? 0) <= eps) continue;
        seenQueues.add(other.id);
        queueFrom.set(other.id, { queue: q, worker: w });
        frontier.push(other.id);
      }
    }
  }
  return undefined;
}
