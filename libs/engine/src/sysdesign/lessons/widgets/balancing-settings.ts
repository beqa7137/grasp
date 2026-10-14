/** The Load Balancing widget's settings and scales, apart from the simulation so a page can read them without it. */

export type Balancer = 'round-robin' | 'random' | 'least-connections' | 'two-choices';

/** The Load Balancing widget's policies, in the order it offers them. */
export const LB_POLICIES: readonly Balancer[] = ['round-robin', 'random', 'least-connections', 'two-choices'];
export const LB_SERVER_SNAPS = [4, 10, 20] as const;
/** How many times slower the slow server is; 1 is none. */
export const LB_SLOWDOWNS = [1, 2, 5, 10] as const;
/** Load as a share (%) of what the whole fleet, slow server included, can answer. */
export const LB_LOADS = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95] as const;
/** A normal server's mean time to answer a request. */
export const LB_SERVICE_MS = 10;
export const LB_REQUESTS = 20_000;
/** The latency histogram's fixed log bins: 4 a decade from 1 ms to 1,000 s. */
export const LB_HIST_MIN_MS = 1;
export const LB_HIST_MAX_MS = 1_000_000;
export const LB_HIST_PER_DECADE = 4;
export const LB_HIST_BINS = Math.round(Math.log10(LB_HIST_MAX_MS / LB_HIST_MIN_MS) * LB_HIST_PER_DECADE);
/** The histogram bin a latency falls in, clamped to the axis. */
export function histogramBin(ms: number): number {
  const at = Math.floor(Math.log10(Math.max(ms, LB_HIST_MIN_MS) / LB_HIST_MIN_MS) * LB_HIST_PER_DECADE);
  return Math.min(LB_HIST_BINS - 1, Math.max(0, at));
}

/** A histogram bin's lower and upper edges in milliseconds. */
export function histogramEdges(bin: number): [number, number] {
  return [LB_HIST_MIN_MS * 10 ** (bin / LB_HIST_PER_DECADE), LB_HIST_MIN_MS * 10 ** ((bin + 1) / LB_HIST_PER_DECADE)];
}
