import {
  CAPACITY_BASELINE,
  CAPACITY_CHALLENGE_SOLUTION,
  CAPACITY_EXPERIMENTS,
  capacityActOf,
  capacityAllSettings,
  capacityRun,
  capacityZoneLoss,
  type CapacitySettings,
} from '@grasp/engine';
import { FALSE_CLAIMS, sayAll, wordFaults } from './capacity-claims.testing';
import {
  ALL_HIDDEN,
  CAPACITY_KEEP,
  HINTS,
  NOTHING_HIDDEN,
  TIERS,
  actChange,
  changeNotice,
  convParts,
  describeTable,
  fleetText,
  goalParts,
  hiding,
  rampStory,
  sinkParts,
  statusParts,
  summary,
  tierLine,
  workerParts,
} from './capacity-words';

const S = (patch: Partial<CapacitySettings> = {}): CapacitySettings => ({ ...CAPACITY_BASELINE, ...patch });
const flat = (w: readonly (readonly [string, ...unknown[]])[]) => w.map((p) => p[0]).join('');
const exp = (id: string) => CAPACITY_EXPERIMENTS.find((e) => e.id === id)!;
const setupOf = (id: string) => capacityRun(exp(id).setup).settings;
const actOf = (id: string) => capacityActOf(exp(id));
const SOLVED = { ...setupOf('challenge'), ...CAPACITY_CHALLENGE_SOLUTION };

describe('capacity words', () => {
  it('says the default setting in full sentences, the bottleneck named and every other tier at its load', () => {
    expect(summary(capacityRun(S()))).toBe(
      'Of 8,000 requests a second, 6,000 are served and 2,000 shed. The app servers are the bottleneck, full at 6,000 a second. The load balancers are at 80%; the database primary is at 15%; the read replicas are at 82.5% each.',
    );
    expect(summary(capacityRun(SOLVED))).toMatch(/^All 16,000 requests a second are served\. The app servers are the busiest, at 62\.7%\./);
    expect(summary(capacityRun(actOf('replay')))).toMatch(/The load balancers and the app servers are the busiest, at 66\.7%\./);
    expect(summary(capacityRun(actOf('zone')))).toContain('the read replica is at 42.8%.');
    expect(summary(capacityRun(S({ zone: 1, lb: 1, app: 1 })))).toMatch(
      /none are served\..*the database primary receives nothing; the read replica receives nothing\./i,
    );
  });

  it('pins the stage words of the brief: fleets, statuses, conversions, the pool, the cache line and the totals', () => {
    const r = capacityRun(S());
    expect(TIERS.map((id) => fleetText(r, id, NOTHING_HIDDEN))).toEqual([
      '2 × 5,000/s',
      '4 × 1,500/s',
      '8,000 queries/s, the largest machine, in zone A',
      '2 × 8,000 queries/s',
    ]);
    expect(TIERS.map((id) => flat(statusParts(r, id, NOTHING_HIDDEN)))).toEqual([
      '80% busy · 2,000/s spare',
      'Full · 2,000/s shed, the bottleneck',
      '15% busy · 34,000/s spare',
      '82.5% busy each · 1,273/s spare',
    ]);
    expect(flat(convParts(r, 'replicas', NOTHING_HIDDEN))).toBe('8,000 queries/s ÷ (0.2 replayed writes + 0.9 reads) = 7,273 requests/s');
    expect(flat(convParts(capacityRun(setupOf('tenfold')), 'primary', NOTHING_HIDDEN))).toBe(
      '8,000 queries/s ÷ 2 queries a request = 4,000 requests/s',
    );
    expect(flat(convParts(capacityRun(actOf('cache')), 'primary', NOTHING_HIDDEN))).toBe(
      '8,000 queries/s ÷ 0.38 queries a request = 21,053 requests/s',
    );
    // Limits the row had no room for are each a clause that names itself, and one figure is said once.
    const solved = capacityRun(SOLVED);
    const wasReplicas = capacityRun({ ...SOLVED, replicas: SOLVED.replicas - 1 }).replicas.ceiling;
    const zoneReplicas = capacityZoneLoss(solved).replicas.ceiling;
    expect(flat(convParts(solved, 'replicas', NOTHING_HIDDEN, { wasInStatus: wasReplicas, zoneInStatus: zoneReplicas }))).toBe(
      '8,000 queries/s ÷ (0.2 replayed writes + 0.09 reads) = 27,586 requests/s · if zone A fails, back to 21,053/s',
    );
    expect(flat(convParts(solved, 'replicas', NOTHING_HIDDEN, { wasInStatus: 7273, zoneInStatus: zoneReplicas }))).toBe(
      '8,000 queries/s ÷ (0.2 replayed writes + 0.09 reads) = 27,586 requests/s · limit was 7,273/s · if zone A fails, limit 21,053/s',
    );
    expect(
      flat(statusParts(solved, 'lb', NOTHING_HIDDEN, { limitInStatus: true, zoneInStatus: capacityZoneLoss(solved).lb.ceiling })),
    ).toMatch(/ · limit 30,000\/s · if zone A fails, limit 20,000\/s$/);
    expect(flat(workerParts(r, NOTHING_HIDDEN))).toBe('75 of 100 busy: 1,500/s × 50 ms in flight; the CPU, not the pool, is full.');
    expect(flat(workerParts(capacityRun(setupOf('slow')), NOTHING_HIDDEN))).toBe(
      "50 of 100 busy: 1,000/s × 50 ms in flight (Little's law).",
    );
    expect(flat(workerParts(capacityRun(actOf('slow')), NOTHING_HIDDEN))).toBe(
      '100 of 100 busy: 200/s × 500 ms. The 1,000/s sent to each would need 500 workers; its CPU sits 13.3% busy.',
    );
    expect(flat(sinkParts(r, NOTHING_HIDDEN))).toBe('Served 6,000/s of 8,000/s · 2,000/s shed, 25%');
    const zone = capacityRun(actOf('zone'));
    expect(fleetText(zone, 'lb', NOTHING_HIDDEN)).toBe('2 of 3 up × 5,000/s');
    expect(fleetText(zone, 'primary', NOTHING_HIDDEN)).toBe('8,000 queries/s, a promoted replica');
    expect(fleetText(zone, 'replicas', NOTHING_HIDDEN)).toBe('1 of 3 left × 8,000 queries/s');
    expect(flat(statusParts(capacityRun(S({ replicas: 0 })), 'replicas', NOTHING_HIDDEN))).toBe('None: the primary takes every read.');
    expect(flat(statusParts(capacityRun(S({ replicas: 0, zone: 1 })), 'replicas', NOTHING_HIDDEN))).toBe(
      'None: reads fail with the primary.',
    );
    expect(flat(statusParts(capacityRun(S({ lb: 1, zone: 1 })), 'lb', NOTHING_HIDDEN))).toBe('None left: zone A held the only one.');
  });

  it('hides a question’s regions on every word surface, and a hidden value has no default', () => {
    const r = capacityRun(setupOf('tenfold'));
    const hid = hiding(exp('tenfold').hide!, 'asking');
    expect(summary(r, hid)).toBe('Of 1,000 requests a second offered, what each tier takes shows after your answer.');
    expect(flat(statusParts(r, 'primary', hid))).toBe('?% busy · after your answer');
    expect(flat(convParts(r, 'primary', hid))).toBe('8,000 queries/s; what that carries in requests shows after your answer.');
    expect(tierLine(r, 'primary', hid)).toBe(
      'Primary: 8,000 queries a second, the largest; its limit in requests shows after your answer.',
    );
    const slow = capacityRun(actOf('slow'));
    const played = hiding(exp('slow').hide!, 'playing', actChange(capacityRun(setupOf('slow')), slow));
    expect(fleetText(slow, 'app', played)).toBe('6 up');
    expect(tierLine(slow, 'app', played)).toBe('App servers: 6; their limit shows after your answer.');
    expect(flat(workerParts(slow, played))).toBe('? of 100 busy after your answer.');
    expect(flat(sinkParts(slow, played))).toBe('Served ? of 6,000/s · shed after your answer');
    const replay = capacityRun(setupOf('replay'));
    expect(flat(convParts(replay, 'replicas', hiding(['after', 'replay'], 'asking')))).toBe(
      'Each takes 0.09 reads a request; what else each does shows after your answer.',
    );
    // Hidden words make no false claim at any setting.
    for (const s of capacityAllSettings().filter((_, i) => i % 97 === 0)) {
      const x = capacityRun(s);
      const words = [
        summary(x, ALL_HIDDEN),
        ...TIERS.flatMap((id) => [fleetText(x, id, ALL_HIDDEN), flat(statusParts(x, id, ALL_HIDDEN)), tierLine(x, id, ALL_HIDDEN)]),
        flat(convParts(x, 'primary', ALL_HIDDEN)),
        flat(convParts(x, 'replicas', ALL_HIDDEN)),
        flat(workerParts(x, ALL_HIDDEN)),
        flat(sinkParts(x, ALL_HIDDEN)),
      ].join(' | ');
      expect(words).not.toMatch(/(^|[^\d.,])0% busy|nothing shed|NaN|undefined/);
      expect(words).not.toMatch(/(^|[^\d,])[\d,]+\/s ÷|= [\d,]+ requests/);
    }
  });

  it('tells the ramp’s story for every kind of play', () => {
    expect(rampStory(S())).toBe(
      'Play stepped the traffic from 1,000 to 8,000 requests a second. At 7,000, the app servers began to shed first; at 8,000, 6,000 a second are served and 2,000 shed.',
    );
    expect(rampStory(S({ traffic: 1000 }))).toBe(
      'Play ran 1,000 requests a second through the tiers. No tier shed; the app servers came closest, at 16.7%.',
    );
    expect(rampStory(actOf('zone'))).toBe(
      'Play stepped the traffic from 1,000 to 10,000 requests a second. At 10,000, the app servers began to shed: 9,000 a second are served and 1,000 shed.',
    );
    expect(rampStory(actOf('tenfold'))).toMatch(/At 5,000, the database primary began to shed first/);
    // Two tiers that begin to shed at one stop are both named, the bottleneck said, and neither is "first".
    expect(rampStory(S({ traffic: 6000, app: 3, replicas: 0 }))).toBe(
      'Play stepped the traffic from 1,000 to 6,000 requests a second. At 5,000, two tiers began to shed at once: the app servers 500 a second and the database primary, the bottleneck, 500; at 6,000, 4,000 a second are served and 2,000 shed.',
    );
    expect(rampStory(S({ traffic: 3000, lb: 1, app: 11, size: 4000, replicas: 0, slow: 1 }))).toMatch(
      /At 3,000, two tiers began to shed at once: the app servers 800 a second and the database primary, the bottleneck, 200; /,
    );
    expect(rampStory(S({ app: 5 }))).toBe(
      'Play stepped the traffic from 1,000 to 8,000 requests a second. At 8,000, two tiers began to shed at once: the app servers 500 a second and the read replicas, the bottleneck, 227; in all, 7,273 a second are served and 727 shed.',
    );
    // A tier zone A took does not shed: every request fails there from the first step.
    expect(rampStory(S({ replicas: 0, zone: 1 }))).toBe(
      'Play stepped the traffic from 1,000 to 8,000 requests a second. From 1,000 on, every request fails at the database: the primary fell with zone A, and no replica could take over.',
    );
    expect(rampStory(S({ lb: 1, app: 1, zone: 1 }))).toMatch(
      /From 1,000 on, nothing gets past the load balancers: zone A held the only one\.$/,
    );
  });

  it('opens a change’s notice with what changed, never on a numeral', () => {
    expect(changeNotice(S(), capacityRun(S({ app: 9 })))).toMatch(/^App servers: now 9\. Of 8,000 requests a second, /);
    // The summary opens on the traffic, so a traffic change is not said twice.
    expect(changeNotice(S(), capacityRun(S({ traffic: 10_000 })))).toMatch(/^Of 10,000 requests a second, /);
    expect(changeNotice(S(), capacityRun(S({ traffic: 10_000 }))).match(/10,000 requests a second/g)).toHaveLength(1);
    expect(changeNotice(S(), capacityRun(S({ zone: 1 })))).toMatch(/^Zone A: down\. /);
    expect(changeNotice(S(), capacityRun(S({ zone: 1 })))).not.toContain('Zone A is down.');
    expect(changeNotice(S(), capacityRun(S({ replicas: 0 })))).toMatch(/^Read replicas: now none\. /);
  });

  it('checks the challenge as its ask states it, each line with its state in words', () => {
    expect(goalParts(capacityRun(SOLVED)).map((g) => g.text)).toEqual([
      'served: all 16,000/s: met',
      'headroom: the busiest tier 62.7% busy leaves 37.3%, at least 30%: met',
      'zone A lost: nothing shed: met',
      "machines: 29, the cache's 3 nodes among them, at most 29: met",
    ]);
    expect(goalParts(capacityRun({ ...SOLVED, app: 16 }))[2].text).toBe(
      'zone A lost: it held 6 of 16 app servers; the 10 left shed 1,000/s: not yet',
    );
    expect(goalParts(capacityRun({ ...SOLVED, replicas: 0 }))[2].text).toBe(
      'zone A lost: the primary falls with it, and no replica takes over: not yet',
    );
    expect(goalParts(capacityRun(setupOf('challenge')))[1].text).toBe('headroom: the busiest tier is full, so none: not yet');
    // A tier at 70% in floating point (0.7000000001) leaves the 30% it shows.
    expect(goalParts(capacityRun({ traffic: 5000, lb: 2, app: 5, size: 4000, replicas: 5, cache: 0, zone: 0, slow: 0 }))[1]).toEqual({
      met: true,
      text: 'headroom: the busiest tier 70% busy leaves 30%, at least 30%: met',
    });
    expect(goalParts(capacityRun(S()))[2].text).toBe(
      'zone A lost: 3,000/s shed at the load balancers and 2,000/s at the app servers: not yet',
    );
  });

  it('keeps a number with its unit or the first word it counts, a percentile with its value, and a sum whole in HTML text', () => {
    const text =
      'p99 230 ms; about 1 s, from 64 MB. 3 servers and 80% busy. 8,000 queries/s, 1,000 requests a second, 500 a second, 2,000/s. 4,000 writes a second on 29 machines: 2 read replicas, 17 app servers, 4 load balancers. It caps at 4,000 / 0.38, about 10,500, and 8,000 / 0.2 = 40,000 requests.';
    expect([...text.matchAll(CAPACITY_KEEP)].map((k) => k[0])).toEqual([
      'p99 230 ms',
      '1 s',
      '64 MB',
      '8,000 queries/s',
      '1,000 requests',
      '500 a second',
      '2,000/s',
      '4,000 writes',
      '29 machines',
      '2 read',
      '17 app',
      '4 load',
      '4,000 / 0.38,',
      '8,000 / 0.2 = 40,000 requests',
    ]);
  });

  it('describes every tier in a table, compact under a 560 px stage', () => {
    const t = describeTable(capacityRun(actOf('zone')), true);
    expect(t.head).toEqual(['Tier', 'Limit/s', 'In/s', 'Busy', 'Shed/s']);
    expect(t.rows.map((r) => r[0])).toEqual(['LBs 2 of 3', 'App 6 of 9', 'Primary 1*', 'Replicas 1 of 3', 'Path']);
    expect(t.note).toBe("19 machines in all, the cache's 3 nodes among them; 12 up with zone A down. 1*: a replica promoted to primary.");
    expect(describeTable(capacityRun(actOf('zone')), false).note).toBe(
      "19 machines in all, the cache's 3 nodes among them; 12 up with zone A down.",
    );
    const wide = describeTable(capacityRun(S()), false);
    expect(wide.head).toEqual(['Tier', 'Up', 'Limit', 'Arriving', 'Busy', 'Shed']);
    expect(wide.rows[1]).toEqual(['App servers', '4', '6,000/s', '8,000/s', 'full', '2,000/s']);
    expect(wide.rows[4]).toEqual(['Whole path', '', '6,000/s', '8,000/s', '', '2,000/s']);
    expect(wide.note).toBe('9 machines in all.');
  });

  it('says nothing false and keeps its grammar at a stride of every setting, each with a one-change notice', () => {
    const all = capacityAllSettings();
    const faults: string[] = [];
    for (let i = 0; i < all.length; i += 6) {
      const s = all[i];
      const before = { ...s, app: s.app > 1 ? s.app - 1 : s.app + 1 };
      for (const f of wordFaults(sayAll(s, before))) if (faults.length < 20) faults.push(`${JSON.stringify(s)}: ${f}`);
    }
    expect(faults).toEqual([]);
    for (const e of CAPACITY_EXPERIMENTS) {
      expect(wordFaults(sayAll(setupOf(e.id))), e.id).toEqual([]);
      expect(wordFaults(sayAll(actOf(e.id), setupOf(e.id))), e.id).toEqual([]);
    }
    expect(wordFaults(sayAll(SOLVED))).toEqual([]);
  }, 600_000);

  it('catches a planted fault for every word rule', () => {
    const planted = (s: CapacitySettings, edit: (w: ReturnType<typeof sayAll>) => void) => {
      const w = sayAll(s);
      edit(w);
      return wordFaults(w).join(' | ');
    };
    const zone = actOf('zone');
    expect(planted(zone, (w) => (w.statuses['replicas'] = '42.8% busy each · 12,053/s spare'))).toContain('"each" said of one replica');
    expect(planted(S(), (w) => (w.summary += ' The cache is at 0%.'))).toContain('at 0%');
    expect(planted(S(), (w) => (w.describe[1][4] = '100%'))).toContain("Describe's Busy for app");
    expect(planted(S(), (w) => (w.story = 'Play stepped the traffic from 1,000 to 1,000 requests a second.'))).toContain(
      'from ([\\d,]+) to \\1',
    );
    expect(planted(S(), (w) => (w.zone = 'zone A lost: 5,000/s shed at the load balancers: not yet'))).toContain(
      'the zone line sheds 5000 at the load balancers, the zone loss 3000',
    );
    expect(
      planted(actOf('replay'), (w) => (w.summary = w.summary.replace('The load balancers and the app servers are', 'The app servers are'))),
    ).toContain('a tie leaves out lb');
    expect(planted(SOLVED, (w) => (w.story += ' No tier filled.'))).toContain('No tier filled');
    const stutter = '8,000 queries/s ÷ (0.2 replayed writes + 0.09 reads) = 27,586 requests/s, was 21,053/s, 21,053/s if zone A fails';
    expect(planted(SOLVED, (w) => w.tails.push(stutter))).toContain('a limit without its own clause');
    expect(planted(SOLVED, (w) => w.tails.push(stutter))).toContain('21,053/s said twice');
    expect(
      planted(SOLVED, (w) => w.tails.push('66.7% busy · 10,000/s spare · limit was 20,000/s · if zone A fails, limit 20,000/s')),
    ).toContain('20,000/s said twice');
    const two = S({ traffic: 6000, app: 3, replicas: 0 });
    const was =
      'Play stepped the traffic from 1,000 to 6,000 requests a second. At 5,000, the database primary began to shed first; at 6,000, 4,000 a second are served and 2,000 shed.';
    expect(planted(two, (w) => (w.story = was))).toContain('"began to shed first" with 2 tiers shedding at that stop');
    expect(planted(two, (w) => (w.story = was))).toContain('the ramp story leaves out app');
    expect(
      planted(
        S({ replicas: 0, zone: 1 }),
        (w) => (w.story = 'Play stepped the traffic. At 1,000, the database primary began to shed first.'),
      ),
    ).toContain('a tier zone A took "began to shed"');
    expect(planted(S(), (w) => (w.hints = ['a third lost']))).toContain('a third lost');
    expect(planted(S(), (w) => (w.summary = '6,000 are served.'))).toContain('a sentence opens on a numeral');
    expect(planted(S(), (w) => (w.pool = "80 of 100 busy: 1,500/s × 50 ms in flight (Little's law)."))).toContain(
      "Little's law does not multiply out",
    );
    expect(planted(S(), (w) => w.lines.push('limit 10000/s'))).toContain('false claim');
    expect(planted(S(), (w) => w.lines.push('1 load balancers'))).toContain('false claim');
    expect(FALSE_CLAIMS.some((g) => g.test('130% busy'))).toBe(true);
    expect(HINTS.zone.join(' ')).not.toMatch(/third|half/);
  });
});
