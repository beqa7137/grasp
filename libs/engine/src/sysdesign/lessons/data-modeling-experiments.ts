import { slotOf, word, type ExperimentGoal, type ExperimentSpec } from './experiments.js';
import { FEED_BASELINE, FEED_FANOUT_ROWS_PER_S, FEED_PLACES, feedAt, type FeedModel, type FeedSettings } from './widgets/data-modeling.js';

const ms = slotOf('ms');
const dur = slotOf('dur');
const num = slotOf('num');
const times = slotOf('times');

const SCHEMA = { normalized: 0, denormalized: 1 } as const;
const READ = { 'n-plus-one': 0, batched: 1, join: 2 } as const;
const PLACE = Object.fromEntries(FEED_PLACES.map((p, i) => [p.id, i])) as Record<(typeof FEED_PLACES)[number]['id'], number>;

/** The cost at the baseline with `changes`, read as `model`. */
const at = (changes: Partial<FeedSettings>, model: FeedModel) => feedAt({ ...FEED_BASELINE, ...changes }, model);

const CHALLENGE = { pageSize: 20, pagesPerSecond: 10_000, renamesPerSecond: 1, postsPerAuthor: 500, place: PLACE['cross-zone'] };
const BOUNDS = { waitMs: 5, staleMs: 1_000, rowsPerSecond: 350_000 };
export const FEED_CHALLENGE_GOAL: ExperimentGoal = {
  all: Object.entries(BOUNDS).map(([metric, below]) => ({ metric, below })),
  keep: CHALLENGE,
};

/** Settings as the widget reads them: `FeedSettings`, the read and the place by their indexes. */
export const FEED_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'trips-not-rows',
    title: 'Trips, not rows',
    setup: { ...FEED_BASELINE, schema: SCHEMA.normalized, read: READ.join, pageSize: 100 },
    act: { set: { read: READ['n-plus-one'] }, run: 'load' },
    ask: 'At {p} posts a page, N+1 and the join read the same {rows} rows. How much longer does the N+1 page wait than the join?',
    choices: [
      { text: 'About the same', value: 'same' },
      { text: 'About {two} longer', value: 'two' },
      { text: 'About {ratio} longer', value: 'ratio' },
    ],
    truth: 'ratio',
    reveal:
      '{ratio}: {wN} against {wJ}, for the same {rows} rows. N+1 pays {q} round trips one after another; batched IN pays {qB} ({wB}). Distance multiplies it: from another region N+1 waits {wFar} and the join {wJFar}. Count queries per request before anything else.',
    focus: ['trips', 'tables'],
    slots: () => {
      const page = { pageSize: 100 };
      const [n1, batched, join] = [at(page, 'n-plus-one'), at(page, 'batched'), at(page, 'join')];
      const far = { ...page, place: PLACE.region };
      return {
        p: num(100),
        rows: num(join.rowsReadPerPage),
        same: times(1),
        two: times(2),
        ratio: times(n1.waitMs / join.waitMs),
        wN: ms(n1.waitMs),
        wJ: ms(join.waitMs),
        q: num(n1.queriesPerPage),
        qB: num(batched.queriesPerPage),
        wB: ms(batched.waitMs),
        wFar: dur(at(far, 'n-plus-one').waitMs),
        wJFar: ms(at(far, 'join').waitMs),
      };
    },
  },
  {
    id: 'read-heavy',
    title: 'Denormalize the feed?',
    setup: { ...FEED_BASELINE, schema: SCHEMA.normalized, read: READ.join, pagesPerSecond: 10_000 },
    act: { set: { schema: SCHEMA.denormalized } },
    ask: "{pps} pages a second and {rps} rename a second, read with a join. Denormalize: copy each author's name into their posts. What happens to rows a second, all told?",
    choices: [
      { text: 'It about halves, to {den}', value: 'den' },
      { text: 'It stays about {join}', value: 'join' },
      { text: 'It doubles, to {double}', value: 'double' },
    ],
    truth: 'den',
    reveal:
      'From {join} to {den}. Each page reads {pr} rows instead of {jr}, and the authors table leaves the read path, saving {saved} rows a second, while a rename now writes {w} rows instead of {w1}. On rows, denormalizing pays up to {be} renames a second, but the copy rewrite falls behind above {lim}, and every rename leaves the old name on some copies for {stale}.',
    focus: ['tables', 'balance'],
    hide: ['denormalized'],
    slots: () => {
      const traffic = { pagesPerSecond: 10_000 };
      const [join, den] = [at(traffic, 'join'), at(traffic, 'denormalized')];
      return {
        pps: num(traffic.pagesPerSecond),
        rps: num(FEED_BASELINE.renamesPerSecond),
        den: num(den.rowsPerSecond),
        join: num(join.rowsPerSecond),
        double: num(join.rowsPerSecond * 2),
        pr: num(den.rowsReadPerPage),
        jr: num(join.rowsReadPerPage),
        saved: num(join.readRowsPerSecond - den.readRowsPerSecond),
        w: num(den.rowsPerRename),
        w1: num(join.rowsPerRename),
        be: num(den.breakEvenRenamesPerSecond),
        lim: num(den.fanoutLimitRenamesPerSecond),
        stale: dur(den.rewriteMs),
      };
    },
  },
  {
    id: 'old-name',
    title: 'How long is the old name shown?',
    setup: { ...FEED_BASELINE, schema: SCHEMA.denormalized, postsPerAuthor: 100_000, renamesPerSecond: 0.01 },
    act: { run: 'rename' },
    ask: 'Ada has {A} posts; the copy rewrite (fan-out) writes {F} rows a second. She renames: for how long can pages show her old name?',
    choices: [
      { text: 'About {quick}', value: 'quick' },
      { text: 'About {stale}', value: 'stale' },
      { text: 'About {slow}', value: 'slow' },
    ],
    truth: 'stale',
    reveal:
      "About {stale}: {copies} copies at {F} a second, and {pages} pages are served while copies disagree. Ada is the celebrity case, the same trade as fan-out-on-write timelines: one celebrity's write touches every copy. Normalized, the rename is {one} row and the next page shows it. Copy only values that rarely change or where a stale value is harmless, and make the rewrite idempotent and resumable.",
    focus: ['copies', 'rewrite'],
    hide: ['stale'],
    slots: () => {
      const celebrity = { postsPerAuthor: 100_000, renamesPerSecond: 0.01 };
      const den = at(celebrity, 'denormalized');
      return {
        A: num(celebrity.postsPerAuthor),
        F: num(FEED_FANOUT_ROWS_PER_S),
        quick: dur(den.rewriteMs / 10),
        stale: dur(den.rewriteMs),
        slow: dur(den.rewriteMs * 10),
        copies: num(celebrity.postsPerAuthor),
        pages: num(den.pagesWhileStale),
        one: num(at(celebrity, 'join').rowsPerRename),
      };
    },
  },
  {
    id: 'frequent-renames',
    title: 'Renames get frequent',
    setup: { ...FEED_BASELINE, schema: SCHEMA.denormalized, postsPerAuthor: 5_000, renamesPerSecond: 0.1 },
    act: { set: { renamesPerSecond: 10 }, run: 'rename' },
    ask: 'Each rename rewrites {A} copies, and the rewrite writes {F} rows a second. Raise renames from {from} to {to} a second. What happens to the old names?',
    choices: [
      { text: 'They clear within {s1} of each rename, as before', value: 's1' },
      { text: 'They clear within {s10}: each rename waits behind the last', value: 's10' },
      { text: '{never}: the rewrite falls further behind every second', value: 'never' },
    ],
    truth: 'verdict',
    reveal:
      "The renames need {need} copy rows a second against the rewrite's {F}: {load} what it can write, so the backlog grows by {growth} rows a second and some copies are always stale. Rows got worse too: {den} a second against {join} with the join, since {to} renames a second is past the break-even of {be}. When a copied value changes often, keep it normalized, or cache it by id with a TTL.",
    focus: ['rewrite', 'balance'],
    hide: ['behind'],
    slots: () => {
      const frequent = { postsPerAuthor: 5_000, renamesPerSecond: 10 };
      const den = at(frequent, 'denormalized');
      const [s1, s10, never] = [dur(1_000), dur(10_000), word('Never')];
      return {
        A: num(frequent.postsPerAuthor),
        F: num(FEED_FANOUT_ROWS_PER_S),
        from: num(0.1),
        to: num(frequent.renamesPerSecond),
        s1,
        s10,
        never,
        verdict: den.fanoutLoad > 1 ? never : den.rewriteMs <= 1_000 ? s1 : s10,
        growth: num(den.fanoutBacklogRowsPerSecond),
        need: num(frequent.renamesPerSecond * frequent.postsPerAuthor),
        load: times(den.fanoutLoad),
        den: num(den.rowsPerSecond),
        join: num(at(frequent, 'join').rowsPerSecond),
        be: num(den.breakEvenRenamesPerSecond),
      };
    },
  },
  {
    id: 'pick-schema',
    title: 'Challenge: pick the schema and read',
    setup: { ...FEED_BASELINE, schema: SCHEMA.normalized, read: READ['n-plus-one'], ...CHALLENGE },
    ask: '{pps} pages a second of {p} posts, the database {place}. Keep the page wait under {gw}, old names gone within {gs}, and the database under {gr} rows a second. Pick the schema and the read.',
    goal: FEED_CHALLENGE_GOAL,
    reveal:
      "Denormalized meets all three: {dw}, old name for {ds}, {dr} rows a second. Now give Ada {big} posts: one rename takes {bigRun} to rewrite while renames arrive every second, so the rewrite falls behind for good and no schema and read here passes. A strong answer keeps it normalized and batch-loads names from a cache of authors by id: {trips} round trips, {one} row per rename, staleness bounded by the cache's TTL, and the author lookups off the database.",
    focus: ['trips', 'balance'],
    slots: () => {
      const den = at(CHALLENGE, 'denormalized');
      const big = 100_000;
      return {
        pps: num(CHALLENGE.pagesPerSecond),
        p: num(CHALLENGE.pageSize),
        place: word(FEED_PLACES[CHALLENGE.place].at),
        gw: ms(BOUNDS.waitMs),
        gs: dur(BOUNDS.staleMs),
        gr: num(BOUNDS.rowsPerSecond),
        dw: ms(den.waitMs),
        ds: dur(den.staleMs),
        dr: num(den.rowsPerSecond),
        big: num(big),
        bigRun: dur(at({ ...CHALLENGE, postsPerAuthor: big }, 'denormalized').rewriteMs),
        trips: num(at(CHALLENGE, 'batched').queriesPerPage),
        one: num(at(CHALLENGE, 'batched').rowsPerRename),
      };
    },
  },
];
