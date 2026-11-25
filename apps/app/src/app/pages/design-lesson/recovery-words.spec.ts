import { RECOVERY_EXPERIMENTS, RECOVERY_PLANS, RECOVERY_SETTINGS as ALL, recoveryScenario, type RecoverySettings } from '@grasp/engine';
import { FALSE_CLAIMS } from './recovery-claims.testing';
import { RECOVERY_KEEP, wrapKept } from './recovery-text';
import {
  ALL_STEPS,
  MODEL_NOTE,
  NOTHING_HIDDEN,
  goalParts,
  hiding,
  ledger,
  noteForms,
  noteText,
  playNotice,
  settingSentence,
  stepOf,
  story,
  summary,
  tableOf,
  workload,
} from './recovery-words';

const show = (s: RecoverySettings) =>
  `${s.disaster ? 'drop' : 'disk'} ${s.size}GB r${s.restore} b${s.base}h a${s.archive}s x${s.replay} ${s.sync ? 'sync' : 'async'}`;
/** A full sentence: none opens on a numeral, thousands carry separators, no doubled word or space. */
const PROSE = [/(^|[.?!] )\d/, /\d{4,}/, / {2}/, / ,| \./, /\b(\w+) \1\b/];
const FRACS = [0, 0.1, 0.22, 0.27, 0.35, 0.45, 0.6, 0.8, 0.95, 0.97, 1];

describe('recovery words', { timeout: 120_000 }, () => {
  it("keep the widget's runs whole in its HTML text: spans with their bounds, speeds, RPO and RTO and a check's status", () => {
    const text = 'loses up to 24 h, restores 2 TB at 10 GB/min, replays at 10×, every 6 h, in under 1 h (now 5.7 h): not yet, RPO and RTO';
    expect([...text.matchAll(RECOVERY_KEEP)].map((k) => k[0])).toEqual([
      'up to 24 h',
      '2 TB',
      'at 10 GB/min',
      'at 10×',
      'every 6 h',
      'under 1 h',
      '5.7 h): not yet',
      'RPO',
      'RTO',
    ]);
    expect([...'(now every 24 h): met'.matchAll(RECOVERY_KEEP)].map((k) => k[0])).toEqual(['every 24 h): met']);
  });

  it('never part a number from its unit on the stage', () => {
    for (const s of ALL.filter((x) => x.sync === 0)) {
      const m = recoveryScenario(s);
      for (const t of [workload(s), ...RECOVERY_PLANS.map((k) => ledger(k, m))])
        for (const w of [200, 240, 300, 588])
          for (const line of wrapKept(t, 'small', w)) expect(line, `${show(s)}: ${t}`).not.toMatch(/^(s|min|h|GB|TB|GB\/min)\b|\d$/);
    }
  });

  it('say every setting in full sentences, with no false claim, and plural verbs for the full backups', () => {
    const out: string[] = [];
    const hides = [
      NOTHING_HIDDEN,
      ...RECOVERY_EXPERIMENTS.flatMap((e) => (['asking', 'playing'] as const).map((p) => hiding(e.hide ?? [], p))),
    ];
    for (const s of ALL) {
      const m = recoveryScenario(s);
      const sentences = [
        settingSentence(m),
        ...hides.flatMap((h) => [summary(m, h), story(m, h)]),
        tableOf(m, false).note,
        workload(s),
        ...hides.flatMap((h) => FRACS.flatMap((f) => [stepOf(m, f, h), playNotice(m, f, h)])),
        stepOf(m, null, NOTHING_HIDDEN),
      ];
      const words = [
        ...sentences,
        ...goalParts(m).map((g) => g.text),
        ...RECOVERY_PLANS.flatMap((k) => [ledger(k, m), ledger(k, m, 0), ledger(k, m, 100), ...noteForms(k, m, NOTHING_HIDDEN, true)]),
        JSON.stringify(tableOf(m, false)),
        JSON.stringify(tableOf(m, true)),
      ].join(' | ');
      for (const g of FALSE_CLAIMS) if (g.test(words)) out.push(`${show(s)}: ${g} in "${words.match(g)![0]}"`);
      if (/full backups (loses|serves|gets)\b/i.test(words)) out.push(`${show(s)}: a singular verb for the full backups`);
      for (const t of sentences) {
        for (const g of PROSE) if (g.test(t)) out.push(`${show(s)}: ${g} in "${t}"`);
        if (!/^[A-Z][^]*[.]$/.test(t)) out.push(`${show(s)}: not a sentence: "${t}"`);
      }
      // After a drop no sentence says a plan serves again, is promoted or is back in without the table.
      if (m.drop)
        for (const t of [settingSentence(m), story(m), summary(m, NOTHING_HIDDEN), stepOf(m, 1, NOTHING_HIDDEN)])
          for (const part of t.split(/(?<=[.?!])\s+|;\s+/))
            if (/serve again|serves again|promot|back in/i.test(part) && !/table/i.test(part)) out.push(`${show(s)}: "${part}"`);
      // "The same" loss is the one the sentence before it says.
      for (const h of hides) {
        const told = story(m, h).split(/(?<=\.) /);
        told.forEach((t, i) => {
          const same = t.match(/loses the same ([\d.,]+ \w+)/);
          if (same && !(told[i - 1] ?? '').includes(same[1])) out.push(`${show(s)}: "the same" with nothing before it: "${t}"`);
        });
      }
      for (const g of goalParts(m))
        if (!/\(now [^)]+\): (met|not yet)$/.test(g.text)) out.push(`${show(s)}: a check without its form: "${g.text}"`);
      for (const g of goalParts(m, false))
        if (g.met || !/\(now [^)]+\)$/.test(g.text)) out.push(`${show(s)}: a check judged off the goal's setting: "${g.text}"`);
      const pitr = ledger('pitr', m);
      const nums = [...pitr.matchAll(/([\d,]+) min/g)].map((x) => Number(x[1].replace(/,/g, '')));
      if (nums.slice(0, -1).reduce((a, b) => a + b, 0) !== nums.at(-1)) out.push(`${show(s)}: the ledger does not add up: ${pitr}`);
    }
    expect(out.slice(0, 20)).toEqual([]);
  });

  it('print no time before its step ends: a ledger names its steps with "…" until the clock passes each', () => {
    const m = recoveryScenario({});
    expect(ledger('pitr', m, -1)).toBe('restore: …; replay 24 h of log at 10×: …');
    expect(ledger('pitr', m, 250)).toBe('restore: 200 min; replay 24 h of log at 10×: …');
    expect(ledger('pitr', m)).toBe('restore: 200 min; replay 24 h of log at 10×: 144 min; 344 min in all');
    const drop = recoveryScenario({ disaster: 1 });
    expect(ledger('standby', drop, -1)).toBe('');
    expect(ledger('standby', drop, 0)).toBe('it has applied the drop too: no copy without it');
    expect(ledger('full', drop)).toBe('restore 2 TB beside the primary at 10 GB/min: 200 min; copy the table back: 1 min');
    expect(ledger('delayed', drop)).toBe(
      'pause it, replay its 1 h of log to just before the drop at 10×: 6 min; copy the table back: 1 min',
    );
  });

  it("say the brief's sentences at the default", () => {
    const m = recoveryScenario({});
    expect(settingSentence(m)).toBe(
      'With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.',
    );
    expect(summary(m, NOTHING_HIDDEN)).toBe(
      'A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.',
    );
    expect(story(m)).toBe(
      'The disks of this 2 TB database fail just before the next full backup and the next log archive. Full backups lose up to 24 h of writes and serve again in 3.3 h, restoring 2 TB at 10 GB/min. Point-in-time recovery loses up to 1 min, the log not yet archived; it restores the same base backup, then replays 24 h of log at 10×, and serves again in 5.7 h. The standby loses its 5 s of lag and is promoted in 1 min. The delayed replica loses the same 5 s and serves again in 7 min, once it has applied the hour it holds.',
    );
    expect(story(recoveryScenario({ sync: 1 }))).toContain(
      'The standby loses nothing and is promoted in 1 min. The delayed replica loses 5 s, the log it had not yet received, and serves again in 7 min, once it has applied the hour it holds.',
    );
    expect(stepOf(m, 1, NOTHING_HIDDEN)).toBe('Point-in-time recovery serves last, 5.7 h after the disaster.');
    expect(stepOf(recoveryScenario({ disaster: 1 }), 1, NOTHING_HIDDEN)).toBe(
      'Point-in-time recovery gets the table back last, 5.8 h after the drop.',
    );
    expect(noteText(NOTHING_HIDDEN)).toBe(MODEL_NOTE);
    expect(noteText(hiding(['pitrTime'], 'asking'))).toBe('A schematic model. Its assumptions show after your answer.');
    expect(ALL_STEPS.every((t) => /^[A-Z].*\.$/.test(t))).toBe(true);
  });
});
