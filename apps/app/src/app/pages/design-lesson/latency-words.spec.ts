import { LATENCY_SETTINGS as ALL, latencySample, latencyScenario } from '@grasp/engine';
import { factRows } from './latency-chart';
import { BAD_GRAMMAR, EACH_OF_ONE, FALSE_CLAIMS } from './latency-claims.testing';
import { TEXT } from './latency-draw';
import {
  LONGEST_FACTS,
  NOTHING_HIDDEN,
  changeNotice,
  describeTable,
  factLines,
  fwait,
  goalParts,
  pctOf,
  hiding,
  loadValueText,
  queueForms,
  sampleStory,
  serversLabel,
  summary,
} from './latency-words';

describe('latency words', () => {
  it('say every setting in full sentences, with no false claim and every count in its own grammar', () => {
    const out: string[] = [];
    for (const s of ALL) {
      const m = latencyScenario(s);
      const smp = latencySample(s);
      const sentences = [summary(m, NOTHING_HIDDEN), changeNotice(m, NOTHING_HIDDEN), sampleStory(smp, m), ...factLines(m, NOTHING_HIDDEN)];
      const words = [
        ...sentences,
        loadValueText(m),
        serversLabel(m, NOTHING_HIDDEN),
        ...queueForms(m, smp, NOTHING_HIDDEN, null),
        ...[true, false].map((c) => JSON.stringify(describeTable(m, c))),
        ...goalParts(m).map((g) => g.text),
      ].join(' | ');
      for (const g of [...FALSE_CLAIMS, ...BAD_GRAMMAR]) if (g.test(words)) out.push(`${m.key}: ${g} in "${words.match(g)![0]}"`);
      for (const t of sentences) if (!/^[A-Z0-9][^]*[.]$/.test(t)) out.push(`${m.key}: not a sentence: "${t}"`);
      // The story reads as prose: no sentence of it opens on a numeral, and a count past 999 has its separator.
      const story = sampleStory(smp, m);
      if (/\. \d/.test(story)) out.push(`${m.key}: a story sentence opens on a numeral: "${story}"`);
      if (/\d{4}/.test(story)) out.push(`${m.key}: a count without its separator: "${story}"`);
      // One server left is never "each": not in a sentence, the servers' label or Describe's heads.
      if (m.up === 1) {
        const said = [summary(m, NOTHING_HIDDEN), changeNotice(m, NOTHING_HIDDEN), serversLabel(m, NOTHING_HIDDEN)];
        for (const c of [true, false]) said.push(...describeTable(m, c).head);
        for (const t of said) if (EACH_OF_ONE.test(t)) out.push(`${m.key}: "each" of one server: "${t}"`);
      }
      // Little's law multiplies out as printed, and within the model's number to its last printed digit.
      const little = factLines(m, NOTHING_HIDDEN)[1]?.match(/^([\d.,]+) in the system at once on average: ([\d,]+)\/s × ([\d.]+) ms/);
      if (m.stable) {
        if (!little) out.push(`${m.key}: no Little's law`);
        else if (Math.abs(Number(little[1].replace(/,/g, '')) - (Number(little[2].replace(/,/g, '')) * Number(little[3])) / 1000) > 0.0051)
          out.push(`${m.key}: Little's law does not multiply out`);
        else if (Math.abs(Number(little[1].replace(/,/g, '')) - m.inSystem) > 0.0101) out.push(`${m.key}: Little's law is off the model`);
      }
    }
    expect(out).toEqual([]);
  });

  it('say "busy" only below 100%, and exactly 100% in words of its own', () => {
    expect(serversLabel(latencyScenario({ servers: 3, load: 80, down: 1 }), NOTHING_HIDDEN)).toBe('2 up · 120% of capacity');
    expect(serversLabel(latencyScenario({ servers: 2, load: 50, down: 1 }), NOTHING_HIDDEN)).toBe('1 up · 100% of capacity');
    expect(factLines(latencyScenario({ servers: 2, load: 50, down: 1 }), NOTHING_HIDDEN)).toEqual([
      '100/s arrive, exactly what the one server left can serve.',
      'With no slack, the queue wanders without a bound and the waits keep growing.',
    ]);
    expect(summary(latencyScenario({ servers: 3, load: 80, down: 1 }), NOTHING_HIDDEN)).toBe(
      '3 servers with one shared queue, one of them down, 80% busy with all up, requests taking 10 ms on average. There is no steady state: 240/s arrive and the servers left serve 200/s, so the queue grows by 40 requests a second.',
    );
    // A share or a wait that would print as 0 says what it is.
    expect([pctOf(0.0003), pctOf(0.0005), fwait(0.004), fwait(0.006)]).toEqual(['under 0.1%', '0.1%', 'under 0.01 ms', '0.01 ms']);
    expect(factLines(latencyScenario({ load: 90, service: 1 }), NOTHING_HIDDEN)[0]).toBe(
      '90% of requests wait at all; the rest take exactly 10 ms.',
    );
  });

  it('hide what a question names, through its play, and nothing at the reveal', () => {
    const e2 = hiding(['ahead', 'after'], 'asking', 0.7, false);
    expect([e2.numbers, e2.ahead, e2.cursorLine, e2.ghost]).toEqual([false, 0.7, true, true]);
    const e2play = hiding(['ahead', 'after'], 'playing', 0.7, false);
    expect([e2play.numbers, e2play.curves, e2play.cursorLine, e2play.cursorDots, e2play.ghost]).toEqual([true, false, false, false, false]);
    const e5play = hiding(['after', 'utilization', 'stability'], 'playing', 0.8, true);
    expect([e5play.curves, e5play.utilization, e5play.stability]).toEqual([true, true, true]);
    expect(serversLabel(latencyScenario({ servers: 3, load: 80, down: 1 }), e5play)).toBe('2 up · each ?%');
    expect(hiding(['sample', 'numbers'], 'playing').sample).toBe(false);
    expect(hiding(['sample', 'numbers'], 'revealed')).toEqual(NOTHING_HIDDEN);
    const e1 = hiding(['sample', 'numbers'], 'asking');
    expect(summary(latencyScenario({ load: 50 }), e1)).toBe(
      "One server, 50% busy, requests taking 10 ms on average. The model's numbers show after your answer. The sample of requests plays after your answer.",
    );
    expect(changeNotice(latencyScenario({ load: 50 }), e1)).toBe('One server, 50% busy.');
  });

  it('tell each kind of rest moment in its own words', () => {
    const pool = latencyScenario({ servers: 4, queue: 1, load: 80 });
    expect(queueForms(pool, latencySample(pool.settings), NOTHING_HIDDEN, null)[0]).toBe('Queues · S1 idle beside a line of 16 at 398 ms');
    expect(sampleStory(latencySample(pool.settings), pool)).toBe(
      "In this sample, 124 requests arrived in the last 400 ms. At 398 ms, S1 sat idle while 16 waited in S3's line; 17 were waiting at the end.",
    );
    const lose = latencyScenario({ servers: 3, load: 80, down: 1 });
    expect(queueForms(lose, latencySample(lose.settings), NOTHING_HIDDEN, null)[0]).toBe('Queue after 4 s · 144 waiting');
    expect(sampleStory(latencySample(lose.settings), lose)).toMatch(
      /^In this sample, \d+ requests arrived in the first 4 s\. At the end, 144 were waiting; the model's trend, 40 more a second, reaches 160 by then\.$/,
    );
    const full = latencyScenario({ servers: 2, load: 50, down: 1 });
    expect(sampleStory(latencySample(full.settings), full)).toMatch(
      /\. At the end, \d+ were waiting: with no slack, the queue wanders with no trend\.$/,
    );
    const over = latencyScenario({ servers: 3, load: 70, down: 1 });
    expect(sampleStory(latencySample(over.settings), over)).toMatch(
      /^In this sample, 1,\d{3} requests arrived in the first 8 s\. At the end, 88 were waiting; the model's trend, 10 more a second, reaches 80 by then\.$/,
    );
    expect(queueForms(lose, latencySample(lose.settings), NOTHING_HIDDEN, 3)).toEqual(['Queue · 3 waiting now']);
    expect(queueForms(lose, latencySample(lose.settings), NOTHING_HIDDEN, 0)).toEqual(['Queue · nobody waiting now']);
  });

  it('say a change with one server left in its own words, and Describe heads that server', () => {
    const one = latencyScenario({ servers: 2, load: 40, down: 1 });
    expect(changeNotice(one, NOTHING_HIDDEN)).toBe(
      '2 servers with one shared queue, one down, the one left 80% busy: p99 230 ms, p50 35 ms, 80% of requests wait.',
    );
    expect(describeTable(one, false).head[1]).toBe('Load on S1');
    expect(describeTable(one, true).head[1]).toBe('On S1');
    expect(loadValueText(one)).toBe('40% busy with both up, 80 requests a second');
  });

  it('reserve the fact rows from the widest pairs: no setting wraps to more lines at any width, nor breaks a number from its unit', () => {
    const facts = ALL.map((s) => factLines(latencyScenario(s), NOTHING_HIDDEN));
    for (const phase of ['asking', 'playing'] as const) facts.push(factLines(latencyScenario({}), hiding(['numbers'], phase)));
    const out: string[] = [];
    for (let w = 228; w <= 1400; w += w < 520 ? 1 : 7) {
      const rows = factRows(w);
      let most = 0;
      for (const pair of facts) {
        const lines = pair.flatMap((f) => TEXT.wrap(f, 'cap', w));
        most = Math.max(most, lines.length);
        for (const l of lines) if (/^(ms|s)\b/.test(l)) out.push(`${w}px: "${l}" starts with a unit`);
      }
      if (most !== rows) out.push(`${w}px: the widest setting takes ${most} lines, ${rows} reserved`);
    }
    expect(out.slice(0, 10)).toEqual([]);
    expect(LONGEST_FACTS).toHaveLength(3);
  }, 120_000);

  it('count p99 toward the challenge only at the settings its goal keeps, and say what it keeps', () => {
    const rows = (s: Parameters<typeof latencyScenario>[0]) => goalParts(latencyScenario(s)).map((g) => `${g.met ? '+' : '-'} ${g.text}`);
    expect(rows({ servers: 4, load: 60, down: 1 })[0]).toBe('+ p99 with one server down: 85 ms, under 100 ms: met');
    expect(rows({ servers: 4, load: 60, down: 0 })[0]).toBe(
      '- p99 with every server up: 50 ms; the goal measures it with one server down: not yet',
    );
    expect(rows({ servers: 4, load: 60, down: 1, service: 1 })[0]).toMatch(
      /^- p99 with one server down and steady work: [\d.]+ ms; the goal keeps random work: not yet$/,
    );
    expect(rows({ servers: 1, load: 10 })[0]).toBe('- p99 with one server down: needs two or more servers: not yet');
  });
});
