// The Latency & Queueing widget's model, for the mockup (browser) and enum.cjs (Node). The engine port is
// libs/engine/src/sysdesign/lessons/widgets/queueing.ts (beside `queueBacklog`, which stays as it is).
//
// Every number the learner reads comes from the exact functions here: M/M/c (Erlang C) and M/D/c (Crommelin's chain
// and Franx's waiting-time formula), one shared queue or a queue per server. The animated sample is separate, seeded and
// never quoted as a model number.
(function (root) {
  'use strict';

  const SERVICE_MS = 10;
  const SERVERS = [1, 2, 3, 4];
  const LOADS = [10, 20, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 98];
  const QUEUES = ['shared', 'split'];
  const SERVICES = ['random', 'steady'];
  /** The sample's window of model time, and how much slower than real time a free play shows it. */
  const WINDOW_MS = 400;
  const PLAY_SLOW = 25;
  const ANSWER_SLOW = 8;
  /** Arrivals simulated before the window, so the window opens in the steady state. */
  const WARM_ARRIVALS = 40000;
  const SAMPLE_SEED = 7;
  const DOTS = 100;

  // ---------------------------------------------------------------- exact queueing
  /** Erlang C: the chance an arrival waits, `c` servers offered `a` = lambda x S erlangs (a < c). */
  function erlangC(c, a) {
    let b = 1;
    for (let k = 1; k <= c; k++) b = (a * b) / (k + a * b);
    const rho = a / c;
    return b / (1 - rho * (1 - b));
  }

  /** P(S + E > t) for independent S ~ Exp(mu) and E ~ Exp(theta), without cancellation when theta is near mu. */
  function sumTail(mu, theta, t) {
    const d = theta - mu;
    const x = d * t;
    const ratio = Math.abs(x) < 1e-12 ? 1 : -Math.expm1(-x) / x;
    return Math.exp(-mu * t) * (1 + mu * t * ratio);
  }

  /** M/M/c with one shared FCFS queue: the response time's tail P(T > t), its mean, and the chance to wait. */
  function mmc(c, lambda) {
    const mu = 1 / SERVICE_MS;
    const a = lambda * SERVICE_MS;
    const C = erlangC(c, a);
    const theta = c * mu - lambda;
    return {
      waitChance: C,
      meanWait: C / theta,
      tail: (t) => (t <= 0 ? 1 : (1 - C) * Math.exp(-mu * t) + C * sumTail(mu, theta, t)),
      waitTail: (t) => (t < 0 ? 1 : C * Math.exp(-theta * t)),
    };
  }

  /** Poisson(m) probabilities 0..K, by a stable recurrence from the mode. */
  function poisson(m, K) {
    const p = new Float64Array(K + 1);
    if (m === 0) {
      p[0] = 1;
      return p;
    }
    const mode = Math.min(K, Math.floor(m));
    let logP = -m + mode * Math.log(m);
    for (let k = 2; k <= mode; k++) logP -= Math.log(k);
    p[mode] = Math.exp(logP);
    for (let k = mode + 1; k <= K; k++) p[k] = (p[k - 1] * m) / k;
    for (let k = mode - 1; k >= 0; k--) p[k] = (p[k + 1] * (k + 1)) / m;
    return p;
  }

  /**
   * M/D/c's number in system at an arbitrary moment: Crommelin's chain N' = max(N - c, 0) + A, A ~ Poisson(lambda D),
   * is exact (every request in service at t has left by t + D; none started after t has), so its stationary law is the
   * time-stationary one. Solved by GTH state reduction on the truncated chain, which only adds and multiplies positive
   * numbers and keeps the band (down at most c, up at most the Poisson cut), so it stays exact to rounding.
   */
  function mdcStationary(c, a) {
    const up = poisson(a, 200);
    let U = 0;
    while (U < 200 && (U < a || up[U] > 1e-18)) U++;
    // The tail of N decays like z^-j for the root z > 1 of z^c = e^(a(z - 1)); truncate where it is below 1e-15.
    const above = (z) => c * Math.log(z) > a * (z - 1);
    let lo = 1 + 1e-12;
    let hi = 2;
    while (above(hi)) hi *= 2;
    for (let i = 0; i < 200; i++) {
      const z = (lo + hi) / 2;
      if (above(z)) lo = z;
      else hi = z;
    }
    const J = Math.min(20000, Math.ceil(36 / Math.log(lo)) + c + U + 10);
    // P[i] holds row i's band: columns i - c .. i + U, offset by c.
    const width = c + U + 1;
    const P = Array.from({ length: J + 1 }, () => new Float64Array(width));
    const at = (i, j) => j - i + c;
    for (let i = 0; i <= J; i++) {
      const base = Math.max(i - c, 0);
      let left = 1;
      for (let k = 0; k <= U; k++) {
        const j = base + k;
        if (j > J || at(i, j) >= width) break;
        if (j === J || at(i, j + 1) >= width || base + k + 1 > J) {
          P[i][at(i, j)] += left;
          left = 0;
          break;
        }
        P[i][at(i, j)] += up[k];
        left -= up[k];
      }
      if (left > 0) P[i][at(i, Math.min(J, base + U))] += left;
    }
    // GTH: censor states J..1, then rebuild.
    const out = new Float64Array(J + 1);
    for (let k = J; k >= 1; k--) {
      let s = 0;
      for (let j = Math.max(0, k - c); j < k; j++) s += P[k][at(k, j)];
      out[k] = s;
      for (let i = Math.max(0, k - U); i < k; i++) {
        const pik = at(i, k) < width && at(i, k) >= 0 ? P[i][at(i, k)] : 0;
        if (!pik) continue;
        for (let j = Math.max(0, k - c); j < k; j++) {
          const pkj = P[k][at(k, j)];
          if (!pkj) continue;
          P[i][at(i, j)] += (pik * pkj) / s;
        }
      }
    }
    const pi = new Float64Array(J + 1);
    pi[0] = 1;
    let total = 1;
    for (let k = 1; k <= J; k++) {
      let s = 0;
      for (let i = Math.max(0, k - U); i < k; i++) {
        const idx = at(i, k);
        if (idx >= 0 && idx < width) s += pi[i] * P[i][idx];
      }
      pi[k] = s / out[k];
      total += pi[k];
    }
    for (let k = 0; k <= J; k++) pi[k] /= total;
    return pi;
  }

  /**
   * M/D/c with one shared FCFS queue. Franx (2001): an arrival at 0 starts by kD + u (0 <= u < D) exactly when
   * max(N - c, 0) + A(lambda (D - u)) <= (k + 1)c - 1, N stationary, A Poisson and independent.
   */
  function mdc(c, lambda) {
    const D = SERVICE_MS;
    const a = lambda * D;
    const pi = mdcStationary(c, a);
    // The law of Q = max(N - c, 0).
    const q = new Float64Array(pi.length);
    for (let j = 0; j < pi.length; j++) q[Math.max(0, j - c)] += pi[j];
    let lq = 0;
    for (let j = 0; j < q.length; j++) lq += j * q[j];
    const Qcdf = new Float64Array(q.length);
    let run = 0;
    for (let j = 0; j < q.length; j++) Qcdf[j] = run += q[j];
    const waitCdf = (t) => {
      if (t < 0) return 0;
      const k = Math.floor(t / D);
      const u = t - k * D;
      const limit = (k + 1) * c - 1;
      const A = poisson(lambda * (D - u), Math.max(limit, 1));
      let s = 0;
      for (let m = 0; m <= limit; m++) {
        const qi = limit - m;
        if (A[m] === 0) continue;
        s += A[m] * (qi >= Qcdf.length ? 1 : Qcdf[qi]);
      }
      return Math.min(1, s);
    };
    let waitChance = 0;
    for (let j = c; j < pi.length; j++) waitChance += pi[j];
    return {
      waitChance,
      meanWait: lq / lambda,
      tail: (t) => 1 - waitCdf(t - D),
      waitTail: (t) => 1 - waitCdf(t),
    };
  }

  /** The time-average number waiting and in service, for Little's law checks. */
  const exactFor = (service, c, lambda) => (service === 'steady' ? mdc(c, lambda) : mmc(c, lambda));

  /** The smallest t with P(T > t) <= 1 - q, by bisection to 1e-9 ms. */
  function quantile(tail, q, hi = 1) {
    if (tail(0) <= 1 - q) return 0;
    while (tail(hi) > 1 - q) hi *= 2;
    let lo = 0;
    for (let i = 0; i < 80 && hi - lo > 1e-9; i++) {
      const mid = (lo + hi) / 2;
      if (tail(mid) > 1 - q) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  /**
   * One setting: `load` is how busy the fleet runs with every server up (%), `servers` how many, `queue` one shared or
   * one per server (requests assigned at random), `service` random (exponential, mean 10 ms) or steady (exactly 10 ms),
   * `down` 1 when the last server has failed and the others take its traffic.
   */
  const cache = new Map();
  function latencyScenario(settings) {
    const s = { load: 70, servers: 1, queue: 'shared', service: 'random', down: 0, ...settings };
    if (s.servers === 1) s.queue = 'shared';
    if (s.servers === 1) s.down = 0;
    const key = `${s.load}|${s.servers}|${s.queue}|${s.service}|${s.down}`;
    if (cache.has(key)) return cache.get(key);
    const up = s.servers - s.down;
    const lambda = (s.load / 100) * s.servers / SERVICE_MS; // per ms, the whole fleet's traffic
    const rho = (lambda * SERVICE_MS) / up;
    const base = {
      settings: s,
      key,
      up,
      ratePerS: lambda * 1000,
      perServerPerS: (lambda * 1000) / up,
      rho,
      capacityPerS: (up * 1000) / SERVICE_MS,
    };
    let out;
    if (rho >= 1) {
      out = { ...base, stable: false, growthPerS: (lambda - up / SERVICE_MS) * 1000 };
    } else {
      const shared = s.queue === 'shared';
      const m = shared ? exactFor(s.service, up, lambda) : exactFor(s.service, 1, lambda / up);
      const meanWait = m.meanWait;
      const mean = SERVICE_MS + meanWait;
      const p50 = quantile(m.tail, 0.5);
      const p90 = quantile(m.tail, 0.9);
      const p99 = quantile(m.tail, 0.99);
      const p999 = quantile(m.tail, 0.999);
      const dots = Array.from({ length: DOTS }, (_, i) => quantile(m.tail, (i + 0.5) / DOTS));
      out = {
        ...base,
        stable: true,
        mean,
        meanWait,
        waitShare: meanWait / mean,
        waitChance: m.waitChance,
        p50,
        p90,
        p99,
        p999,
        tailRatio: p99 / p50,
        inSystem: lambda * mean,
        waiting: lambda * meanWait,
        dots,
        tail: m.tail,
      };
    }
    out.metrics = metricsOf(out);
    cache.set(key, out);
    return out;
  }

  function metricsOf(m) {
    return {
      p99: m.stable ? m.p99 : Infinity,
      p50: m.stable ? m.p50 : Infinity,
      mean: m.stable ? m.mean : Infinity,
      load: m.settings.load,
    };
  }

  /** The curve the chart draws: p50 and p99 for this configuration at every utilization of the servers that are up. */
  function curve(settings, metric, points = 120) {
    const s = { ...settings };
    const up = s.servers - (s.servers > 1 ? s.down : 0);
    const out = [];
    for (let i = 1; i <= points; i++) {
      const rho = Math.min(0.995, (i / points) * 0.995);
      const lambda = (rho * up) / SERVICE_MS;
      const shared = s.queue === 'shared' || s.servers === 1;
      const m = shared ? exactFor(s.service, up, lambda) : exactFor(s.service, 1, lambda / up);
      out.push([rho, quantile(m.tail, metric === 'p50' ? 0.5 : 0.99)]);
    }
    return out;
  }

  // ---------------------------------------------------------------- the seeded sample
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * A seeded run with common random numbers: the same stream of uniforms at every setting, so a higher load compresses
   * the same arrivals and every request waits at least as long. The window is the WINDOW_MS before the last simulated
   * arrival ("now"). When the servers that are up cannot keep up, there is no steady state: the window starts empty at 0.
   */
  function sample(settings, seed = SAMPLE_SEED) {
    const m = latencyScenario(settings);
    const s = m.settings;
    const up = m.up;
    const lambda = m.ratePerS / 1000;
    const rand = mulberry32(seed * 7919 + 13);
    const stable = m.stable;
    const n = stable ? WARM_ARRIVALS : Math.ceil(lambda * WINDOW_MS * 3) + 50;
    const arrive = new Float64Array(n);
    const work = new Float64Array(n);
    const route = new Float64Array(n);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const u1 = rand();
      const u2 = rand();
      const u3 = rand();
      t += -Math.log(1 - u1) / lambda;
      arrive[i] = t;
      work[i] = s.service === 'steady' ? SERVICE_MS : -SERVICE_MS * Math.log(1 - u2);
      route[i] = u3;
    }
    const startAt = new Float64Array(n);
    const leaveAt = new Float64Array(n);
    const server = new Int32Array(n);
    const free = new Float64Array(up);
    for (let i = 0; i < n; i++) {
      let k;
      if (s.queue === 'split' && up > 1) k = Math.min(up - 1, Math.floor(route[i] * up));
      else {
        k = 0;
        for (let j = 1; j < up; j++) if (free[j] < free[k] - 1e-12) k = j;
      }
      const st = Math.max(arrive[i], free[k]);
      startAt[i] = st;
      leaveAt[i] = st + work[i];
      free[k] = leaveAt[i];
      server[i] = k;
    }
    const now = stable ? arrive[n - 1] : arrive[0] + WINDOW_MS - 1e-9;
    const t0 = stable ? now - WINDOW_MS : arrive[0] - 1e-9;
    const reqs = [];
    for (let i = 0; i < n; i++) {
      if (arrive[i] > t0 + WINDOW_MS) break;
      if (leaveAt[i] <= t0) continue;
      reqs.push({
        id: i,
        arrive: arrive[i] - t0,
        start: startAt[i] - t0,
        leave: leaveAt[i] - t0,
        server: server[i],
      });
    }
    return { t0, reqs, window: WINDOW_MS, up, stable };
  }

  /** What the sample shows at window time `t`: who waits (in arrival order, per queue) and who is in service. */
  function sampleAt(smp, t) {
    const waiting = [];
    const serving = [];
    for (const r of smp.reqs) {
      if (r.arrive > t || r.leave <= t) continue;
      if (r.start > t) waiting.push(r);
      else serving.push(r);
    }
    return { waiting, serving };
  }

  /** The number waiting over the window, as steps, for the timeline's area. */
  function waitingSteps(smp, perServer = false) {
    const ev = [];
    for (const r of smp.reqs) {
      if (r.start > r.arrive + 1e-9) {
        ev.push([Math.max(0, r.arrive), 1, r.server]);
        ev.push([Math.max(0, r.start), -1, r.server]);
      }
    }
    ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let n = smp.reqs.filter((r) => r.arrive <= 0 && r.start > 0).length;
    // Requests waiting at 0 were counted by their clamped arrival; start the count at zero and let events add them.
    n = 0;
    const steps = [[0, 0]];
    for (const [x, d] of ev) {
      n += d;
      if (x > smp.window) break;
      if (steps.length && steps[steps.length - 1][0] === x) steps[steps.length - 1][1] = n;
      else steps.push([x, n]);
    }
    return steps;
  }

  /** The sample's own averages over its window, for the typicality check only (never shown as model numbers). */
  function sampleStats(smp) {
    const W = smp.window;
    let busy = 0;
    let waitArea = 0;
    for (const r of smp.reqs) {
      busy += Math.max(0, Math.min(W, r.leave) - Math.max(0, r.start));
      waitArea += Math.max(0, Math.min(W, r.start) - Math.max(0, r.arrive));
    }
    return { busy: busy / (W * smp.up), waiting: waitArea / W };
  }

  // ---------------------------------------------------------------- formatting (the engine's, experiments.ts)
  const trim = (v, d) => String(Number(v.toFixed(d)));
  const group = (v) => new Intl.NumberFormat('en-US').format(Math.round(v));
  const formatMs = (v) => `${v < 10 ? trim(v, 2) : group(v)} ms`;
  const formatPct = (v) => `${trim(v, 1)}%`;
  const formatQps = (v) => `${v < 10 ? trim(v, 1) : group(v)}/s`;
  const formatTimes = (v) => `${v < 10 ? trim(v, 1) : group(v)}×`;
  const formatSeconds = (v) => `${trim(v, 1)} s`;
  const formatDuration = (ms) => (ms < 1000 ? formatMs(ms) : ms < 100000 ? formatSeconds(ms / 1000) : `${group(ms / 1000)} s`);
  const formatNum = (v) => (Number.isInteger(v) ? group(v) : trim(v, 2));
  const formatOrdinal = (v) => `${v}${v % 100 >= 11 && v % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] ?? 'th')}`;
  const FORMAT = { ms: formatMs, dur: formatDuration, pct: formatPct, qps: formatQps, times: formatTimes, s: formatSeconds, num: formatNum, ordinal: formatOrdinal };
  const formatSlot = (slot) => (slot.unit === 'word' ? slot.value : FORMAT[slot.unit](slot.value));
  const slotOf = (unit) => (value) => ({ value, unit });
  const word = (value) => ({ value, unit: 'word' });
  const ms = slotOf('ms');
  const dur = slotOf('dur');
  const pct = slotOf('pct');
  const qps = slotOf('qps');
  const times = slotOf('times');
  const num = slotOf('num');
  function fillTemplate(t, slots) {
    return t.replace(/\{(\w+)\}/g, (_, k) => {
      if (!slots[k]) throw new Error(`No slot "${k}" for "${t}"`);
      return formatSlot(slots[k]);
    });
  }
  const ALLOWED = ['p99', 'p50', '100 requests', 'the 99th of 100', 'N+1', 'S / (1 − utilization)'];
  function strayDigits(t) {
    let rest = t.replace(/\{\w+\}/g, '');
    for (const p of ALLOWED) rest = rest.split(p).join('');
    return rest.match(/\d+/g) ?? [];
  }

  // ---------------------------------------------------------------- experiments
  const run = (s) => latencyScenario(s);
  const BASE = { load: 70, servers: 1, queue: 'shared', service: 'random', down: 0 };
  const SETUP = {
    idle: { ...BASE, load: 50 },
    knee: { ...BASE, load: 70 },
    pool: { ...BASE, servers: 4, queue: 'split', load: 80 },
    steady: { ...BASE, load: 90 },
    fail: { ...BASE, servers: 3, load: 70 },
    challenge: { ...BASE, servers: 2, queue: 'split', load: 60, down: 1 },
  };
  const CHALLENGE_BOUNDS = { p99: 100, load: 60 };
  const CHALLENGE_GOAL = {
    all: [
      { metric: 'p99', below: CHALLENGE_BOUNDS.p99 },
      { metric: 'load', atLeast: CHALLENGE_BOUNDS.load },
    ],
    keep: { down: 1, service: 'random' },
  };
  /** The one setting of the challenge's that meets it (enum.cjs proves it is the only one). */
  const CHALLENGE_SOLUTION = { servers: 4, queue: 'shared', load: 60 };

  const EXPERIMENTS = [
    {
      id: 'idle-yet-waiting',
      title: 'Waiting at half load',
      setup: SETUP.idle,
      act: { run: 'sample' },
      ask: 'One server, {load} busy, so it sits idle {idle} of the time. Requests arrive at random, {rate} on average, and each needs {service} of work on average. How many of them wait before the server starts on them?',
      choices: [
        { text: 'None: it has time to spare', value: 'none' },
        { text: 'About one in ten, in the bursts', value: 'tenth' },
        { text: 'Half of them', value: 'half' },
      ],
      truth: 'share',
      reveal:
        'Half of them: a request that arrives at a random moment finds the server busy {chance} of the time, exactly its utilization, so {chance} of requests wait for the one ahead to finish. Those wait {waitWhenWaiting} on average, so the mean wait over every request is {meanWaitAll}, and a request takes {mean} in all for {service} of work. Waiting needs no overload, only collisions.',
      focus: ['scene', 'timeline'],
      hide: ['sample', 'numbers'],
      slots: () => {
        const m = run(SETUP.idle);
        const share = Math.abs(m.waitChance - 0.5) < 1e-9 ? 'half' : m.waitChance < 0.2 ? 'tenth' : 'other';
        return {
          load: pct(m.settings.load),
          idle: pct(100 - m.settings.load),
          rate: qps(m.ratePerS),
          service: ms(SERVICE_MS),
          chance: pct(m.waitChance * 100),
          meanWaitAll: ms(m.meanWait),
          waitWhenWaiting: ms(m.meanWait / m.waitChance),
          mean: ms(m.mean),
          none: word('none'),
          tenth: word('tenth'),
          half: word('half'),
          share: word(share),
        };
      },
    },
    {
      id: 'knee',
      title: 'From {from} to {to} busy',
      setup: SETUP.knee,
      act: { set: { load: 90 }, run: 'sample' },
      ask: 'One server at {from} busy: a request takes {before} on average, {service} of work and the rest waiting. Traffic grows by {growth}, until the server is {to} busy. What is the average now?',
      choices: [
        { text: '{prop}: in step with the traffic', value: 'prop' },
        { text: '{after}: {three} as long', value: 'after' },
        { text: '{ten}: {tenX} as long', value: 'ten' },
      ],
      truth: 'after',
      reveal:
        '{after}: the mean is S / (1 − utilization), and going from {from} to {to} busy cuts the idle share from {idleFrom} to {idleTo}, so the time grows {three}. The work stays {service}; the waiting grows from {waitFrom} to {waitTo}, and p99 from {p99From} to {p99To}. Each step of load costs more than the last, which is why a service that looked fine at {from} falls over at {to}.',
      focus: ['chart', 'split'],
      hide: ['ahead', 'after'],
      slots: () => {
        const a = run(SETUP.knee);
        const b = run({ ...SETUP.knee, load: 90 });
        return {
          from: pct(a.settings.load),
          to: pct(b.settings.load),
          service: ms(SERVICE_MS),
          before: ms(a.mean),
          growth: pct((b.ratePerS / a.ratePerS - 1) * 100),
          prop: ms(a.mean * (b.ratePerS / a.ratePerS)),
          after: ms(b.mean),
          three: times(b.mean / a.mean),
          ten: ms(a.mean * 10),
          tenX: times(10),
          idleFrom: pct(100 - a.settings.load),
          idleTo: pct(100 - b.settings.load),
          waitFrom: ms(a.meanWait),
          waitTo: ms(b.meanWait),
          p99From: ms(a.p99),
          p99To: ms(b.p99),
        };
      },
    },
    {
      id: 'pool',
      title: 'One queue or a queue each',
      setup: SETUP.pool,
      act: { set: { queue: 'shared' }, run: 'sample' },
      ask: '{servers} servers, each {load} busy, each with its own queue, and every request goes to one of them at random: a request waits {before} on average. Put all {servers} behind one shared queue, at the same load. What is the average wait now?',
      choices: [
        { text: '{after}: a wait needs all {servers} busy', value: 'after' },
        { text: '{half}: the pool shares the bursts', value: 'half' },
        { text: '{before}: each is just as busy', value: 'before' },
      ],
      truth: 'after',
      reveal:
        '{after}, {ratio} shorter: with a queue each, a request can wait behind a long one while another server sits idle. One shared queue hands each request to the first server that frees up, so it waits only when all {servers} are busy, which {chance} of arrivals find, against {chanceSplit} with a queue each. p99 falls from {p99Before} to {p99After}. This is why one line feeding a pool beats a line per checkout, and why least-loaded balancing beats random.',
      focus: ['scene', 'numbers'],
      hide: ['after'],
      slots: () => {
        const a = run(SETUP.pool);
        const b = run({ ...SETUP.pool, queue: 'shared' });
        return {
          servers: num(a.settings.servers),
          load: pct(a.settings.load),
          before: ms(a.meanWait),
          after: ms(b.meanWait),
          half: ms(a.meanWait / 2),
          ratio: times(a.meanWait / b.meanWait),
          chance: pct(b.waitChance * 100),
          chanceSplit: pct(a.waitChance * 100),
          p99Before: ms(a.p99),
          p99After: ms(b.p99),
        };
      },
    },
    {
      id: 'steady',
      title: 'Steadier work',
      setup: SETUP.steady,
      act: { set: { service: 'steady' }, run: 'sample' },
      ask: 'One server, {load} busy. Requests need {service} of work on average but vary at random, and wait {before} on average. Now every request takes exactly {service}. What is the average wait?',
      choices: [
        { text: '{before}: the load is the same', value: 'before' },
        { text: '{after}: half', value: 'after' },
        { text: '{tenth}: no request is slow any more', value: 'tenth' },
      ],
      truth: 'after',
      reveal:
        '{after}, exactly half. Arrivals still collide at random, so the queue stays, but the Pollaczek-Khinchine formula ties the wait to how much service times vary as well as to the load, and random times double the wait that steady ones give at the same load. p99 falls from {p99Before} to {p99After}. Smaller, more even units of work cut the tail without adding a server.',
      focus: ['split', 'chart'],
      hide: ['after'],
      slots: () => {
        const a = run(SETUP.steady);
        const b = run({ ...SETUP.steady, service: 'steady' });
        return {
          load: pct(a.settings.load),
          service: ms(SERVICE_MS),
          before: ms(a.meanWait),
          after: ms(b.meanWait),
          tenth: ms(a.meanWait / 10),
          p99Before: ms(a.p99),
          p99After: ms(b.p99),
        };
      },
    },
    {
      id: 'lose-one',
      title: 'Lose one of three',
      setup: SETUP.fail,
      act: { set: { down: 1 }, run: 'sample' },
      ask: '{servers} servers share one queue at {load} busy, and p99 is {before}. One fails, and the others take its traffic. What is p99 now?',
      choices: [
        { text: '{prop}: half as long again, like the load', value: 'prop' },
        { text: '{five}: about five times as long', value: 'five' },
        { text: 'It never settles: the queue grows without bound', value: 'unbounded' },
      ],
      truth: 'outcome',
      reveal:
        'It never settles: {load} of {servers} servers is {rate}, and the {left} left can serve only {cap}, so {growth} more arrive than leave and each request waits longer than the one before. Losing one of {servers} multiplies the load on the rest by {mult}: {load} becomes {rho}. From {safe}, the {left} left would run at {safeRho}, with p99 {safeP99}. Size so the fleet minus one still runs below the knee.',
      focus: ['chart', 'scene'],
      hide: ['after'],
      slots: () => {
        const a = run(SETUP.fail);
        const b = run({ ...SETUP.fail, down: 1 });
        const safe = run({ ...SETUP.fail, load: 60, down: 1 });
        return {
          servers: num(a.settings.servers),
          load: pct(a.settings.load),
          before: ms(a.p99),
          prop: ms(a.p99 * 1.5),
          five: ms(a.p99 * 5),
          rate: qps(b.ratePerS),
          left: num(b.up),
          cap: qps(b.capacityPerS),
          growth: qps(b.stable ? 0 : b.growthPerS),
          mult: times(a.settings.servers / b.up),
          rho: pct(b.rho * 100),
          safe: pct(safe.settings.load),
          safeRho: pct(safe.rho * 100),
          safeP99: ms(safe.p99),
          unbounded: word('unbounded'),
          outcome: word(b.stable ? 'other' : 'unbounded'),
        };
      },
    },
    {
      id: 'headroom',
      title: 'Challenge: busy, and safe when one fails',
      setup: SETUP.challenge,
      ask: 'A server has failed, and its traffic moved to the rest. Choose the servers, the queue and the load so that p99 stays under {p99} on the servers left while the fleet runs at least {minLoad} busy with every server up.',
      goal: CHALLENGE_GOAL,
      reveal:
        '{servers} servers sharing one queue at {load}: with one down, the {left} left are {rho} busy and p99 is {p99Now}. Three servers at {load} would leave two at {rho3}, p99 {p99Three}; a queue each would need the load down to {splitLoad}. A bigger pool runs hotter and still rides out a failure: plan N+1 servers, each run at what the other N can absorb.',
      focus: ['chart', 'scene'],
      hide: [],
      slots: () => {
        const sol = run({ ...SETUP.challenge, ...CHALLENGE_SOLUTION });
        const three = run({ ...SETUP.challenge, ...CHALLENGE_SOLUTION, servers: 3 });
        const splitPass = LOADS.filter((l) => {
          const r = run({ ...SETUP.challenge, ...CHALLENGE_SOLUTION, queue: 'split', load: l });
          return r.stable && r.p99 < CHALLENGE_BOUNDS.p99;
        });
        return {
          minLoad: pct(CHALLENGE_BOUNDS.load),
          p99: ms(CHALLENGE_BOUNDS.p99),
          servers: num(sol.settings.servers),
          load: pct(sol.settings.load),
          left: num(sol.up),
          rho: pct(sol.rho * 100),
          p99Now: ms(sol.p99),
          rho3: pct(three.rho * 100),
          p99Three: ms(three.p99),
          splitLoad: pct(splitPass[splitPass.length - 1]),
        };
      },
    },
  ];

  function renderExperiment(spec) {
    const slots = spec.slots();
    const fill = (t) => fillTemplate(t, slots);
    const choices = (spec.choices ?? []).map((c) => fill(c.text));
    let answer = -1;
    if (spec.choices && spec.truth) {
      const truth = fill(`{${spec.truth}}`);
      const matches = spec.choices.flatMap((c, i) => (fill(`{${c.value}}`) === truth ? [i] : []));
      if (matches.length !== 1) throw new Error(`${spec.id}: ${matches.length} choices equal the model's ${truth}`);
      answer = matches[0];
    }
    return { id: spec.id, title: fill(spec.title), ask: fill(spec.ask), choices, answer, reveal: fill(spec.reveal), slots, focus: spec.focus, hide: spec.hide };
  }

  const boundMet = (b, v) => ('below' in b ? v < b.below : v >= b.atLeast);
  const goalKept = (goal, s) => Object.entries(goal.keep ?? {}).every(([k, v]) => s[k] === v);
  const goalMet = (goal, s, metrics) => goalKept(goal, s) && goal.all.every((b) => boundMet(b, metrics[b.metric]));

  const api = {
    SERVICE_MS,
    SERVERS,
    LOADS,
    QUEUES,
    SERVICES,
    WINDOW_MS,
    PLAY_SLOW,
    ANSWER_SLOW,
    SAMPLE_SEED,
    DOTS,
    erlangC,
    mmc,
    mdc,
    mdcStationary,
    poisson,
    quantile,
    latencyScenario,
    curve,
    sample,
    sampleAt,
    sampleStats,
    waitingSteps,
    mulberry32,
    formatMs,
    formatPct,
    formatQps,
    formatTimes,
    formatDuration,
    formatSlot,
    fillTemplate,
    strayDigits,
    EXPERIMENTS,
    CHALLENGE_GOAL,
    CHALLENGE_BOUNDS,
    CHALLENGE_SOLUTION,
    renderExperiment,
    goalMet,
    boundMet,
    run,
    BASE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LatencyModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
