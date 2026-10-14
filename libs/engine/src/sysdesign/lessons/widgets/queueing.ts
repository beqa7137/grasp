/** Queueing models for the Latency and Queues widgets, apart from the other widgets' math so a widget chunk takes only these. */

export interface Latency {
  mean: number;
  p50: number;
  p99: number;
}

/**
 * A single server with random arrivals and service times (the M/M/1 queue): the response time is exponential with mean
 * `service / (1 - utilization)`, so every percentile grows by the same factor as the server fills.
 */
export function queueLatency(serviceMs: number, utilization: number): Latency {
  const mean = serviceMs / (1 - Math.min(utilization, 0.999));
  return { mean, p50: mean * Math.LN2, p99: mean * Math.log(100) };
}

export interface Backlog {
  /** Queue depth at the end of each second. */
  depth: number[];
  /** Seconds after the spike ends until the queue is empty again, or null if it never empties in the window. */
  drainSeconds: number | null;
  capacity: number;
}

/** Messages arrive at `baseRate`, or `spikeRate` during the spike, and consumers remove up to their capacity each second. */
export function queueBacklog(options: {
  seconds: number;
  baseRate: number;
  spikeRate: number;
  spikeStart: number;
  spikeEnd: number;
  consumers: number;
  perConsumer: number;
}): Backlog {
  const capacity = options.consumers * options.perConsumer;
  const depth: number[] = [];
  let queued = 0;
  let drainSeconds: number | null = null;
  for (let t = 0; t < options.seconds; t++) {
    const arriving = t >= options.spikeStart && t < options.spikeEnd ? options.spikeRate : options.baseRate;
    queued = Math.max(0, queued + arriving - capacity);
    depth.push(queued);
    if (drainSeconds === null && t >= options.spikeEnd && queued === 0) drainSeconds = t + 1 - options.spikeEnd;
  }
  return { depth, drainSeconds, capacity };
}
