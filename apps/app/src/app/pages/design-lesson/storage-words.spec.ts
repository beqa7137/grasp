import { STORAGE_BASELINE as B, STORAGE_SETTINGS as ALL, storageScenario, type StorageSettings } from '@grasp/engine';
import { FALSE_CLAIMS, PROSE } from './storage-claims.testing';
import type { Engine } from './storage-motion';
import { STORAGE_KEEP, tw, wrapKept } from './storage-text';
import {
  MODEL_NOTE,
  NOTHING_HIDDEN,
  tableOf,
  goalParts,
  hiding,
  noteText,
  settingSentence,
  stepForms,
  story,
  summary,
  type HidFlag,
} from './storage-words';

const show = (s: StorageSettings) => `${s.data}GB ${s.record}B ${s.page}KB r${s.ratio} bloom${s.bloom} op${s.op}`;
const ENGINES: Engine[] = ['btree', 'lsm'];

describe('storage words', { timeout: 60_000 }, () => {
  it("keep the widget's runs whole in its HTML text: counts, rates, bounds, quoted runs and a check's status", () => {
    const text =
      '4,196 bytes at 10 MB/s, 42× the data, under 20×, at least 100 GB, ratio 10, 5 disk reads, 4 levels, 4 say "not here", under 7: met.';
    expect([...text.matchAll(STORAGE_KEEP)].map((k) => k[0])).toEqual([
      '4,196 bytes',
      '10 MB/s',
      '42×',
      'under 20×',
      'at least 100 GB',
      'ratio 10',
      '5 disk reads',
      '4 levels',
      '"not here"',
      '7: met',
    ]);
    expect([...'writes 17× the data, under 20×: met'.matchAll(STORAGE_KEEP)].map((k) => k[0])).toEqual(['17×', 'under 20×: met']);
  });

  it('say every setting in full sentences, with no false claim, every count in its own grammar', () => {
    const out: string[] = [];
    for (const s of ALL) {
      const m = storageScenario(s);
      const sentences = [summary(m, NOTHING_HIDDEN), settingSentence(m), story('btree', m), story('lsm', m), tableOf(m, 'full').note];
      const words = [
        ...sentences,
        ...goalParts(m).map((g) => g.text),
        ...(['full', 'short', 'compact'] as const).map((f) => JSON.stringify(tableOf(m, f))),
      ].join(' | ');
      for (const g of FALSE_CLAIMS) if (g.test(words)) out.push(`${show(s)}: ${g} in "${words.match(g)![0]}"`);
      for (const t of sentences) {
        for (const g of PROSE) if (g.test(t)) out.push(`${show(s)}: ${g} in "${t}"`);
        if (!/^[A-Z][^]*[.]$/.test(t)) out.push(`${show(s)}: not a sentence: "${t}"`);
      }
      for (const g of goalParts(m)) if (!/: (met|not yet)$/.test(g.text)) out.push(`${show(s)}: a check without its state: "${g.text}"`);
      // Every step a play says is words for its setting, and obeys the same rules.
      for (const engine of ENGINES)
        for (const frac of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1])
          for (const t of stepForms(engine, m, frac, NOTHING_HIDDEN))
            for (const g of FALSE_CLAIMS) if (g.test(t)) out.push(`${show(s)} step: "${t}"`);
    }
    for (const g of PROSE.slice(0, 2)) expect(MODEL_NOTE).not.toMatch(g);
    expect(out).toEqual([]);
  });

  it('compute each sentence for its setting: filters on or off, the flushed run and the levels', () => {
    const on = storageScenario({ ...B, op: 1 });
    const off = storageScenario({ ...B, op: 1, bloom: 0 });
    expect(story('lsm', on)).toBe(
      'The lookup checks the memtable, then asks the bloom filter of each run, in memory: 4 runs say "not here", and only the last level is read from disk: 1 disk read.',
    );
    expect(story('lsm', off)).toBe(
      'The lookup checks the memtable, then reads every run on disk in turn, the flushed run and 4 levels, until the last level turns the key up: 5 disk reads.',
    );
    expect(story('btree', storageScenario(B))).toBe(
      'The write walks 5 pages from the root to a leaf, 4 of them in memory, reads its leaf from disk, changes 100 bytes there and appends 100 bytes to the log: the write is safe and answered. Later the whole page goes back to disk, 4,096 bytes: 4,196 bytes written for 100 bytes of data, 42×.',
    );
    expect(story('lsm', storageScenario(B))).toBe(
      'The write is appended to the log and kept in the memtable, with no read first: it is safe and answered. Later, when the 64 MB memtable fills, it is flushed to disk as one sorted run, and compaction merges the record down through 4 levels, rewriting it about 5.5 times at each level in the model: 24× the data in all.',
    );
    expect(settingSentence(storageScenario({ ...B, ratio: 4 }))).toBe(
      'The B-tree, with 4 KB pages, writes 42× the data, and a lookup reads 1 page from disk; the LSM tree, with 6 levels at ratio 4 and bloom filters on, writes 17×, and a lookup reads 1 run.',
    );
    expect(summary(storageScenario(B), NOTHING_HIDDEN)).toBe(
      'A B-tree and an LSM tree each hold 100 GB of data in records of 100 bytes; the stage follows one write through both. B-tree, 4 KB pages: each page points to about 179 children, so 5 levels hold the data, 4 of them cached in memory. An update writes its whole page and a log record, 4,196 bytes for 100 bytes: 42× the data. A lookup costs 1 disk read. LSM tree, size ratio 10, bloom filters on: a flushed run and 4 levels on disk. A record is written once to the log, once at the flush and about 5.5 times at each level in the model: 24× the data. A lookup costs 1 disk read. Disk used: about 1.44× the live data for the B-tree, at most 1.11× for the LSM tree. A rough model.',
    );
  });

  it('hide what a question names, through its play, and nothing at the reveal', () => {
    const flags = (hide: string[], phase: 'asking' | 'playing' | 'revealed') =>
      (Object.entries(hiding(hide, phase)) as [HidFlag, boolean][]).filter(([k, v]) => v && k !== 'pipBox').map(([k]) => k);
    expect(flags(['btreeWrite'], 'asking')).toEqual(['btNumbers', 'btMarks', 'ghost', 'locked']);
    expect(flags(['btreeWrite'], 'playing')).toEqual(['btNumbers', 'ghost', 'locked']);
    expect(flags(['lsmWrite'], 'asking')).toEqual(['lsmNumbers', 'lsmMarks', 'ghost', 'locked']);
    expect(flags(['writesAfter'], 'asking')).toEqual(['ghost', 'locked']);
    expect(flags(['writesAfter'], 'playing')).toEqual(['btNumbers', 'lsmNumbers', 'ghost', 'locked']);
    expect(flags(['readsWhy', 'readsAfter'], 'asking')).toEqual(['readWhy', 'ghost', 'locked']);
    expect(flags(['readsWhy', 'readsAfter'], 'playing')).toEqual(['readNumbers', 'ghost', 'locked']);
    for (const h of [['btreeWrite'], ['lsmWrite'], ['writesAfter'], ['readsWhy', 'readsAfter']]) expect(flags(h, 'revealed')).toEqual([]);
    expect(noteText(hiding(['btreeWrite'], 'asking'))).toBe('A rough model. Its assumptions show after your answer.');
    expect(noteText(NOTHING_HIDDEN)).toBe(MODEL_NOTE);
  });

  it('say no hidden number in the summary, the sentence, the steps or the stories', () => {
    const out: string[] = [];
    for (const s of ALL.filter((_, i) => i % 3 === 0)) {
      const m = storageScenario(s);
      const write = (hid: ReturnType<typeof hiding>, e: Engine) => [
        ...[0, 0.3, 0.6, 0.9, 1].flatMap((f) => stepForms(e, m, f, hid)),
        story(e, m, hid),
      ];
      const bt = hiding(['btreeWrite'], 'playing');
      if (s.op === 0)
        for (const t of [...write(bt, 'btree'), settingSentence(m, bt)])
          if (/\d+ (B|bytes)\b|×/.test(t) && !t.startsWith('The B-tree has')) out.push(`B-tree: "${t}"`);
      const ls = hiding(['lsmWrite'], 'playing');
      if (s.op === 0) for (const t of write(ls, 'lsm')) if (/×|times/.test(t)) out.push(`LSM: "${t}"`);
      const rd = hiding(['readsWhy', 'readsAfter'], 'playing');
      if (s.op === 1)
        for (const t of [story('lsm', m, rd), settingSentence(m, rd)])
          if (/\d+ (disk )?(reads?|runs?)\b/.test(t)) out.push(`reads: "${t}"`);
      expect(summary(m, hiding(['btreeWrite'], 'asking'))).not.toContain(`${m.btree.writeBytes.toLocaleString('en-US')} bytes`);
    }
    expect(out).toEqual([]);
  });

  it('keep a number with its unit and a quoted run whole when stage text wraps, and leave no word alone on a last line', () => {
    for (const W of [120, 140, 160, 200]) {
      const lines = wrapKept(
        'Each run\'s filter answers from memory: 4 say "not here", so only the last run is read from disk.',
        'small',
        W,
      );
      for (const l of lines) {
        expect(l).not.toMatch(/^"?here"/);
        expect(l).not.toMatch(/^(runs?|B|MB|GB|levels?)\b/);
      }
      if (lines.length > 1) expect(lines[lines.length - 1]).toContain(' ');
      for (const l of lines) if (l.includes(' ')) expect(tw(l, 'small')).toBeLessThanOrEqual(W);
    }
  });
});
