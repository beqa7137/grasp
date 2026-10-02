/** A queue's load and the workers it can hand jobs to. */
export interface QueueDemand {
  id: string;
  incoming: number;
  workers: string[];
}

/** Queues whose workers serve only them, all at one utilization; `ratio` is their load over those workers' capacity. */
export interface DrainBlock {
  queues: string[];
  workers: string[];
  ratio: number;
}

export interface QueueDrain {
  /** Jobs each queue hands each worker, per second: `flows.get(queue)?.get(worker)`. */
  flows: Map<string, Map<string, number>>;
  blocks: DrainBlock[];
  backlogGrowthPerSec: number;
  queueDrainRps: number;
  backlogDrainRatio: number;
}

const TOLERANCE = 1e-12;
const SCALING_ROUNDS = 5_000;
const STALL_ROUNDS = 25;

const byId = (a: { id: string } | string, b: { id: string } | string) => {
  const x = typeof a === 'string' ? a : a.id;
  const y = typeof b === 'string' ? b : b.id;
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * The fluid limit of workers pulling from the queues they link to. The set of queues with the highest load per unit of
 * capacity it can reach is the bottleneck (Hall's theorem): its workers serve only it, all at the same utilization, and
 * nothing does better. Peeling such blocks off in turn gives the least backlog any assignment can reach, and each block's
 * backlog over its capacity is the shortest time to drain it once the spike ends. Queues holding nothing never enter, so
 * neither does capacity only they reach. Everything runs over ids in sorted order, so the result, to the last bit, does
 * not depend on the order the board lists anything.
 */
export function drainQueues(queues: readonly QueueDemand[], capacityOf: (worker: string) => number): QueueDrain {
  const capacities = new Map(queues.flatMap((q) => q.workers).map((w) => [w, capacityOf(w)]));
  const capacity = (w: string) => capacities.get(w)!;
  const result: QueueDrain = { flows: new Map(), blocks: [], backlogGrowthPerSec: 0, queueDrainRps: 0, backlogDrainRatio: 0 };
  const fed = queues
    .filter((q) => q.incoming > 0)
    .map((q) => ({ ...q, workers: [...new Set(q.workers)].sort(byId) }))
    .sort(byId);
  for (const block of peel(fed, capacity)) {
    const load = sum(block.queues.map((q) => q.incoming));
    const rate = sum(block.workers.map(capacity));
    result.blocks.push({ queues: block.queues.map((q) => q.id), workers: block.workers, ratio: block.ratio });
    result.backlogGrowthPerSec += Math.max(0, load - rate);
    result.queueDrainRps += rate;
    if (load > rate)
      result.backlogDrainRatio = Math.max(result.backlogDrainRatio, rate > 0 ? (load - rate) / rate : Number.POSITIVE_INFINITY);
    for (const [queue, out] of scale(block, capacity)) result.flows.set(queue, out);
  }
  return result;
}

interface Block {
  queues: QueueDemand[];
  workers: string[];
  ratio: number;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Blocks from the densest down, one group of queues linked through shared workers at a time. */
function peel(fed: QueueDemand[], capacity: (worker: string) => number): Block[] {
  const blocks: Block[] = [];
  const taken = new Set<string>();
  for (const group of components(fed, capacity)) {
    let remaining = group;
    while (remaining.length) {
      const reach = new Map(remaining.map((q) => [q.id, q.workers.filter((w) => !taken.has(w) && capacity(w) > 0)]));
      const reachOf = (q: QueueDemand) => reach.get(q.id)!;
      const stuck = remaining.filter((q) => reachOf(q).length === 0);
      const block = stuck.length ? { queues: stuck, workers: [], ratio: Number.POSITIVE_INFINITY } : densest(remaining, reachOf, capacity);
      blocks.push(block);
      for (const w of block.workers) taken.add(w);
      remaining = remaining.filter((q) => !block.queues.includes(q));
    }
  }
  return blocks;
}

/** Queues linked through workers with capacity, in groups that share none; each keeps the sorted order. */
function components(fed: QueueDemand[], capacity: (worker: string) => number): QueueDemand[][] {
  const parent = fed.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const owner = new Map<string, number>();
  fed.forEach((q, i) => {
    for (const w of q.workers) {
      if (capacity(w) <= 0) continue;
      const other = owner.get(w);
      if (other === undefined) owner.set(w, i);
      else parent[root(i)] = root(other);
    }
  });
  const groups = new Map<number, QueueDemand[]>();
  fed.forEach((q, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), q]));
  return [...groups.values()];
}

/**
 * The largest set of queues with the most load per unit of capacity it reaches, by Dinkelbach's method: at a trial
 * ratio, a minimum cut in source -> queue (load) -> worker -> sink (ratio x capacity) separates the set that gains most
 * from load minus ratio x capacity; its own ratio is the next trial, until no set gains. The maximal source side of the
 * final cut is the union of every densest set.
 */
function densest(queues: QueueDemand[], reach: (q: QueueDemand) => string[], capacity: (worker: string) => number): Block {
  const ratioOf = (set: QueueDemand[]) => {
    const workers = [...new Set(set.flatMap(reach))].sort(byId);
    return { workers, ratio: sum(set.map((q) => q.incoming)) / sum(workers.map(capacity)) };
  };
  let best: Block = { queues, ...ratioOf(queues) };
  for (;;) {
    const side = maximalSourceSide(queues, reach, capacity, best.ratio);
    if (!side.length) return best;
    const next = { queues: side, ...ratioOf(side) };
    if (!(next.ratio > best.ratio * (1 + TOLERANCE))) return next;
    best = next;
  }
}

/** Max flow by shortest augmenting paths, then the queues that cannot reach the sink in the residual graph. */
function maximalSourceSide(
  queues: QueueDemand[],
  reach: (q: QueueDemand) => string[],
  capacity: (worker: string) => number,
  ratio: number,
): QueueDemand[] {
  const workers = [...new Set(queues.flatMap(reach))].sort(byId);
  const index = new Map(workers.map((w, j) => [w, j]));
  const links = queues.map((q) => reach(q).map((w) => index.get(w)!));
  const feeders: number[][] = workers.map(() => []);
  links.forEach((ws, i) => ws.forEach((j) => feeders[j].push(i)));
  const supply = queues.map((q) => q.incoming);
  const room = workers.map((w) => ratio * capacity(w));
  const flow = queues.map(() => new Float64Array(workers.length));
  const eps = TOLERANCE * Math.max(1, sum(supply));
  // Direct links carry what they can first, so few augmenting paths remain to search for.
  links.forEach((ws, i) => {
    for (const j of ws) {
      const amount = Math.min(supply[i], room[j]);
      if (amount <= 0) continue;
      flow[i][j] += amount;
      supply[i] -= amount;
      room[j] -= amount;
    }
  });
  const queueFrom = new Int32Array(queues.length);
  const workerFrom = new Int32Array(workers.length);
  const frontier: number[] = [];
  for (;;) {
    queueFrom.fill(-2);
    workerFrom.fill(-1);
    frontier.length = 0;
    supply.forEach((left, i) => {
      if (left > eps) {
        queueFrom[i] = -1;
        frontier.push(i);
      }
    });
    let sink = -1;
    search: for (let head = 0; head < frontier.length; head++) {
      const i = frontier[head];
      for (const j of links[i]) {
        if (workerFrom[j] >= 0) continue;
        workerFrom[j] = i;
        if (room[j] > eps) {
          sink = j;
          break search;
        }
        for (const other of feeders[j]) {
          if (queueFrom[other] !== -2 || flow[other][j] <= eps) continue;
          queueFrom[other] = j;
          frontier.push(other);
        }
      }
    }
    if (sink < 0) break;
    let amount = room[sink];
    for (let j = sink, i = workerFrom[j]; ; j = queueFrom[i], i = workerFrom[j]) {
      if (queueFrom[i] === -1) {
        amount = Math.min(amount, supply[i]);
        break;
      }
      amount = Math.min(amount, flow[i][queueFrom[i]]);
    }
    room[sink] -= amount;
    for (let j = sink, i = workerFrom[j]; ; j = queueFrom[i], i = workerFrom[j]) {
      flow[i][j] += amount;
      if (queueFrom[i] === -1) {
        supply[i] -= amount;
        break;
      }
      flow[i][queueFrom[i]] -= amount;
    }
  }
  // A queue is on the sink side when its residual graph reaches a worker with room left.
  const queueToSink = new Uint8Array(queues.length);
  const workerToSink = Uint8Array.from(room, (left) => (left > eps ? 1 : 0));
  for (let grown = true; grown;) {
    grown = false;
    links.forEach((ws, i) => {
      if (queueToSink[i] || !ws.some((j) => workerToSink[j])) return;
      queueToSink[i] = 1;
      grown = true;
    });
    feeders.forEach((qs, j) => {
      if (workerToSink[j] || !qs.some((i) => queueToSink[i] && flow[i][j] > eps)) return;
      workerToSink[j] = 1;
      grown = true;
    });
  }
  return queues.filter((_, i) => !queueToSink[i]);
}

/**
 * Within a block every queue is served the same fraction and every worker runs at the same utilization. Which queue
 * feeds which worker is the scaling of the block's links to those row and column sums (iterative proportional fitting),
 * ending on the workers so each one's total is exact. Where some queues tie with the block, links into their workers
 * must carry nothing and the fitting only creeps towards that, so what it leaves unmatched moves along augmenting paths.
 */
function scale(block: Block, capacity: (worker: string) => number): Map<string, Map<string, number>> {
  const served = Math.min(1, 1 / block.ratio);
  const utilization = Math.min(1, block.ratio);
  const index = new Map(block.workers.map((w, j) => [w, j]));
  const links = block.queues.map((q) => q.workers.filter((w) => index.has(w)).map((w) => index.get(w)!));
  const feeders: number[][] = block.workers.map(() => []);
  links.forEach((ws, i) => ws.forEach((j) => feeders[j].push(i)));
  const rows = block.queues.map((q) => q.incoming * served);
  const columns = block.workers.map((w) => capacity(w) * utilization);
  const x = rows.map(() => 1);
  const y = columns.map(() => 1);
  const across = (list: number[], factors: number[]) => {
    let total = 0;
    for (const k of list) total += factors[k];
    return total;
  };
  const rowError = () => {
    let worst = 0;
    for (let i = 0; i < links.length; i++) worst = Math.max(worst, Math.abs(x[i] * across(links[i], y) - rows[i]));
    return worst;
  };
  const limit = TOLERANCE * Math.max(1, sum(rows));
  let checked = Number.POSITIVE_INFINITY;
  for (let round = 1; round <= SCALING_ROUNDS; round++) {
    for (let i = 0; i < links.length; i++) {
      const total = across(links[i], y);
      x[i] = total > 0 ? rows[i] / total : 0;
    }
    for (let j = 0; j < feeders.length; j++) {
      const total = across(feeders[j], x);
      y[j] = total > 0 ? columns[j] / total : 0;
    }
    const error = rowError();
    if (!(error > limit)) break;
    // Near a tie the fitting only creeps; once it stops halving every few dozen rounds, rebalancing finishes the job.
    if (round % STALL_ROUNDS === 0) {
      if (!(error < checked / 2)) break;
      checked = error;
    }
  }
  const flow = links.map((ws, i) => {
    const out = new Float64Array(block.workers.length);
    for (const j of ws) out[j] = x[i] * y[j];
    return out;
  });
  rebalance(flow, links, feeders, rows, limit);
  return new Map(
    block.queues.map((q, i) => [
      q.id,
      new Map(links[i].flatMap((j): [string, number][] => (flow[i][j] > limit ? [[block.workers[j], flow[i][j]]] : []))),
    ]),
  );
}

/**
 * Moves jobs from queues that send more than their total to queues that send less, along paths that add to one link
 * into a worker and take as much off another, so every worker's total stays put. Breadth first over sorted indices,
 * so the result does not depend on the order the board lists anything.
 */
function rebalance(flow: Float64Array[], links: number[][], feeders: number[][], rows: number[], eps: number): void {
  const short = rows.map((r, i) => r - sum(links[i].map((j) => flow[i][j])));
  const queueFrom = new Int32Array(rows.length);
  const workerFrom = new Int32Array(feeders.length);
  const frontier: number[] = [];
  // A queue with no path now may get one once another queue's jobs move, so it is only set aside until then.
  const stuck = new Set<number>();
  // Gaps each under eps can still add up along a chain of tied queues, so it is their sum that must stay under it.
  const gapEps = eps / rows.length;
  for (let moves = 0; moves < 4 * rows.length * (feeders.length + 1);) {
    const start = short.findIndex((gap, i) => gap > gapEps && !stuck.has(i));
    if (start < 0) return;
    queueFrom.fill(-2);
    workerFrom.fill(-1);
    queueFrom[start] = -1;
    frontier.length = 0;
    frontier.push(start);
    let end = -1;
    search: for (let head = 0; head < frontier.length; head++) {
      const i = frontier[head];
      for (const j of links[i]) {
        if (workerFrom[j] >= 0) continue;
        workerFrom[j] = i;
        for (const k of feeders[j]) {
          if (queueFrom[k] !== -2 || flow[k][j] <= 0) continue;
          queueFrom[k] = j;
          if (short[k] < -gapEps) {
            end = k;
            break search;
          }
          frontier.push(k);
        }
      }
    }
    if (end < 0) {
      stuck.add(start);
      continue;
    }
    stuck.clear();
    moves++;
    let amount = Math.min(short[start], -short[end]);
    for (let k = end; queueFrom[k] !== -1; k = workerFrom[queueFrom[k]]) amount = Math.min(amount, flow[k][queueFrom[k]]);
    for (let k = end; queueFrom[k] !== -1; k = workerFrom[queueFrom[k]]) {
      const j = queueFrom[k];
      flow[k][j] -= amount;
      flow[workerFrom[j]][j] += amount;
    }
    short[start] -= amount;
    short[end] += amount;
  }
}
