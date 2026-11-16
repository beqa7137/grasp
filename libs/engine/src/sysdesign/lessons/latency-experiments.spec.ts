import { describe, expect, it } from 'vitest';
import { goalMet, renderExperiment } from './experiments.js';
import { SD_LESSONS } from './index.js';
import {
  LATENCY_CHALLENGE_BOUNDS,
  LATENCY_CHALLENGE_GOAL,
  LATENCY_CHALLENGE_SOLUTION,
  LATENCY_EXPERIMENTS,
} from './latency-experiments.js';
import {
  LATENCY_LOADS,
  LATENCY_QUEUE,
  LATENCY_SERVERS,
  LATENCY_SERVICE,
  latencyScenario,
  type LatencySettings,
} from './widgets/queueing.js';

const shown = Object.fromEntries(LATENCY_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
const { shared, split } = LATENCY_QUEUE;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('the Latency & Queueing experiments', () => {
  it('replace the lesson tryThis, in the order of the interview arc', () => {
    expect(SD_LESSONS['sd-latency'].widget.experiments).toBe(LATENCY_EXPERIMENTS);
    expect(SD_LESSONS['sd-latency'].widget.tryThis).toBeUndefined();
    expect(LATENCY_EXPERIMENTS.map((e) => e.id)).toEqual(['idle-yet-waiting', 'knee', 'pool', 'steady', 'lose-one', 'headroom']);
    expect(LATENCY_EXPERIMENTS.map((e) => e.act)).toEqual([
      { run: 'sample' },
      { set: { load: 90 }, run: 'sample' },
      { set: { queue: shared }, run: 'sample' },
      { set: { service: LATENCY_SERVICE.steady }, run: 'sample' },
      { set: { down: 1 }, run: 'sample' },
      undefined,
    ]);
  });

  it('put the answers at 3, 2, 1, 2 and 3', () => {
    expect(LATENCY_EXPERIMENTS.filter((e) => !e.goal).map((e) => renderExperiment(e).answer + 1)).toEqual([3, 2, 1, 2, 3]);
  });

  it('name every region they hide, and point the reveal at the regions it is about', () => {
    expect(LATENCY_EXPERIMENTS.map((e) => e.hide ?? [])).toEqual([
      ['sample', 'numbers'],
      ['ahead', 'after'],
      ['after'],
      ['after'],
      ['after', 'utilization', 'stability'],
      [],
    ]);
    expect(LATENCY_EXPERIMENTS.map((e) => e.focus)).toEqual([
      ['split', 'timeline'],
      ['chart', 'split'],
      ['scene', 'numbers'],
      ['split', 'chart'],
      ['chart', 'scene'],
      ['chart', 'scene'],
    ]);
  });

  it('ask the mean wait at half load: as long as the work itself', () => {
    const e = shown['idle-yet-waiting'];
    expect(e.title).toBe('One server at half load');
    expect(e.ask).toBe(
      'One server, 50% busy, so it sits idle 50% of the time. Requests arrive at random, 50/s on average, and each needs a random amount of work, 10 ms on average. On average, how long does a request wait before the server starts on it?',
    );
    expect(e.choices).toEqual(['None: it has time to spare', '2.5 ms: only the bursts wait', '10 ms: as long as the work itself']);
    expect(e.reveal).toBe(
      '10 ms, as long as the work itself. A request that arrives at a random moment finds the server busy 50% of the time, exactly its utilization, so 50% of requests wait for the work ahead of them, 20 ms on average; averaged over every request, that is 10 ms, and a request takes 20 ms in all. Waiting needs no overload, only collisions.',
    );
  });

  it('triple the mean from 70% to 90% busy', () => {
    const e = shown['knee'];
    expect(e.title).toBe('From 70% to 90% busy');
    expect(e.ask).toBe(
      'One server at 70% busy: a request takes 33 ms on average, 10 ms of work and the rest waiting. Traffic grows by 28.6%, until the server is 90% busy. What is the average now?',
    );
    expect(e.choices).toEqual(['43 ms: in step with the traffic', '100 ms: 3× as long', '333 ms: 10× as long']);
    expect(e.reveal).toBe(
      '100 ms: the mean is S / (1 − utilization), where S is the 10 ms of work, and going from 70% to 90% busy cuts the idle share from 30% to 10%, so the time grows 3×. The work stays 10 ms; the waiting grows from 23 ms to 90 ms, and p99 from 154 ms to 461 ms. Each step of load costs more than the last (this bend is the knee of the curve), which is why a service that looked fine at 70% is 3× slower at 90%.',
    );
  });

  it('cut the wait about 5× with one shared queue in front of 4 servers', () => {
    const e = shown['pool'];
    expect(e.ask).toBe(
      '4 servers, each 80% busy, each with its own queue, and every request goes to one of them at random: a request waits 40 ms on average. Put all 4 behind one shared queue, at the same load. What is the average wait now?',
    );
    expect(e.choices).toEqual(['7.5 ms: about 5× shorter', '20 ms: half as long', '40 ms: unchanged, each is as busy']);
    expect(e.reveal).toBe(
      '7.46 ms, 5.4× shorter: with a queue each, a request can wait behind a long one while another server sits idle; here that happens 57.4% of the time. One shared queue hands each request to the first server that frees up, so it waits only when all 4 are busy, which 59.6% of arrivals find, against 80% with a queue each. p99 falls from 230 ms to 69 ms. This is why one line feeding a pool beats a line per checkout, and why least-loaded balancing beats random.',
    );
    const slots = LATENCY_EXPERIMENTS[2].slots();
    expect(rel(Number(slots['afterRound'].value), Number(slots['after'].value))).toBeLessThan(0.01);
    expect(Math.abs(Number(slots['ratio'].value) - Number(slots['ratioRound'].value))).toBeLessThan(0.5);
  });

  it("halve one server's wait with steady work", () => {
    const e = shown['steady'];
    expect(e.ask).toBe(
      'One server, 90% busy. Requests need 10 ms of work on average but vary at random, and wait 90 ms on average. Now every request takes exactly 10 ms. What is the average wait?',
    );
    expect(e.choices).toEqual([
      '90 ms: unchanged, the load is the same',
      '45 ms: half as long',
      '9 ms: a tenth, no request is slow any more',
    ]);
    expect(e.reveal).toMatch(/^45 ms, exactly half\. The Pollaczek-Khinchine formula/);
    expect(e.reveal).toContain(
      'the wait scales with (1 + CV²) / 2, where CV, the coefficient of variation, is the standard deviation of service times over their mean.',
    );
    expect(e.reveal).toContain('Random (exponential) times have a CV of 1 and steady ones 0, so steady halves the wait. p99 falls');
    expect(e.reveal).toContain('p99 falls from 461 ms to 229 ms. More even work cuts the tail without adding a server.');
  });

  it('never settle when one of three fails at 80%', () => {
    const e = shown['lose-one'];
    expect(e.ask).toBe(
      '3 servers share one queue at 80% busy, and p99 is 85 ms. One fails, and the others take its traffic. What is p99 now?',
    );
    expect(e.choices).toEqual([
      '127 ms: half as long again, like the load',
      'It settles after a burst, with p99 near 1 s',
      'It never settles: the queue keeps growing',
    ]);
    expect(e.reveal).toBe(
      'It never settles: 80% of 3 servers is 240/s, and the 2 left can serve only 200/s, so 40/s more arrive than leave, and the queue and its waits keep growing. Losing one of 3 multiplies the load on the rest by 1.5×: 80% becomes 120%, and from 66.7% up the 2 left cannot keep up. From 60%, the 2 left would run at 90%, with p99 233 ms. Size so the fleet minus one still runs below the knee.',
    );
  });

  it('set a challenge exactly one of its 98 settings passes: 4 servers, one shared queue, 60%', () => {
    const e = LATENCY_EXPERIMENTS.find((x) => x.goal)!;
    expect(e.goal).toBe(LATENCY_CHALLENGE_GOAL);
    expect(shown['headroom'].ask).toBe(
      'A server has failed, and its traffic moved to the rest. Choose the servers, the queue and the load so that p99 stays under 100 ms on the servers left while the fleet runs at least 60% busy with every server up.',
    );
    expect(shown['headroom'].reveal).toBe(
      '4 servers sharing one queue at 60%: with one down, the 3 left are 80% busy and p99 is 85 ms. 3 servers at 60% would leave 2 at 90%, p99 233 ms; 4 servers with a queue each would need the load down to 40%. A bigger pool runs hotter and still rides out a failure: plan N+1 servers and run them at a load the N left can absorb.',
    );
    const passing: string[] = [];
    let count = 0;
    for (const servers of LATENCY_SERVERS)
      for (const queue of [shared, split])
        for (const load of LATENCY_LOADS) {
          if (servers === 1 && queue === split) continue;
          count++;
          const m = latencyScenario({ load, servers, queue, service: LATENCY_SERVICE.random, down: 1 });
          if (goalMet(e.goal!, m.metrics, m.settings)) passing.push(`${servers} ${queue} ${load}`);
        }
    expect(count).toBe(98);
    expect(passing).toEqual([`4 ${shared} 60`]);
    const solved = { ...e.setup, ...LATENCY_CHALLENGE_SOLUTION } as LatencySettings;
    const sol = latencyScenario(solved);
    const next = latencyScenario({ ...solved, load: 65 });
    expect(sol.metrics.p99).toBeLessThan(LATENCY_CHALLENGE_BOUNDS.p99 * 0.9);
    expect(next.metrics.p99).toBeGreaterThan(LATENCY_CHALLENGE_BOUNDS.p99 * 1.1);
    const start = latencyScenario(e.setup as LatencySettings);
    expect(start.stable).toBe(false);
    expect(goalMet(e.goal!, start.metrics, start.settings)).toBe(false);
    // One server has none to lose: the goal's kept settings fail there.
    const one = latencyScenario({ ...solved, servers: 1 });
    expect(goalMet(e.goal!, one.metrics, one.settings)).toBe(false);
  });

  it('hold the reveals to the model in their words', () => {
    const idle = latencyScenario({ load: 50 });
    const knee = [latencyScenario({ load: 70 }), latencyScenario({ load: 90 })];
    if (!idle.stable || !knee[0].stable || !knee[1].stable) throw new Error('unstable');
    expect(rel(idle.waitChance, 0.5)).toBeLessThan(1e-12);
    expect(rel(idle.meanWait, 10)).toBeLessThan(1e-9);
    expect(rel(knee[1].mean / knee[0].mean, 3)).toBeLessThan(1e-9);
    const lose = latencyScenario({ servers: 3, load: 80, down: 1 });
    expect(lose.stable).toBe(false);
    expect(rel(lose.rho, 1.2)).toBeLessThan(1e-9);
  });
});
