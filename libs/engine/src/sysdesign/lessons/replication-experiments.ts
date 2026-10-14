import { slotOf, word, type ExperimentSpec } from './experiments.js';
import { REPLICA_PIN_SNAPS, replicaOutcome, type ReplicaSettings } from './widgets/replication.js';

const ms = slotOf('ms');
const dur = slotOf('dur');

/** Settings as the widget reads them: read-your-writes is 1 when on. */
const outcome = (lagMs: number, readMs: number, ryw = 0, pinMs = 1_000) =>
  replicaOutcome({ lagMs, readMs, readYourWrites: ryw === 1, pinMs } satisfies ReplicaSettings);
const OLD = 'The old value';
const NEW = 'The new value';
const seen = (stale: boolean) => word(stale ? OLD : NEW);
const answers = { old: word(OLD), fresh: word(NEW), error: word('An error') };
const choices = [
  { text: '{old}', value: 'old' },
  { text: '{fresh}', value: 'fresh' },
  { text: '{error}', value: 'error' },
];

export const REPLICA_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'too-soon',
    title: 'A read too soon',
    setup: { lag: 800, read: 300, ryw: 0, pin: 1_000 },
    ask: 'You write, then read {read} later. The replica applies writes {lag} after the primary. What does your read return?',
    choices,
    truth: 'seen',
    reveal:
      '{seen}: your read reached the replica {gap} before it applied your write. Every read sooner than the lag is stale, however close to it, and from {lag} on every read is fresh.',
    focus: ['replica', 'read'],
    slots: () => {
      const o = outcome(800, 300);
      return { ...answers, read: ms(300), lag: ms(800), seen: seen(o.stale), gap: ms(800 - 300) };
    },
  },
  {
    id: 'lag-grows',
    title: 'The lag grows',
    setup: { lag: 800, read: 1_200, ryw: 0, pin: 1_000 },
    act: { set: { lag: 2_000 } },
    ask: 'With {lagFrom} of lag, your read {read} after the write saw it. A busy replica now lags {lagTo}. What does the same read return?',
    choices,
    truth: 'seen',
    reveal:
      '{seen}: the replica now applies your write {gap} after your read. Lag is not a constant: bulk writes, long queries on the replica and network trouble stretch it from milliseconds to seconds, so a read that is fresh today can be stale tomorrow.',
    focus: ['replica', 'read'],
    slots: () => {
      const o = outcome(2_000, 1_200);
      return { ...answers, read: dur(1_200), lagFrom: ms(800), lagTo: dur(2_000), seen: seen(o.stale), gap: ms(2_000 - 1_200) };
    },
  },
  {
    id: 'pin',
    title: 'Pin your reads to the primary',
    setup: { lag: 800, read: 300, ryw: 0, pin: 1_000 },
    act: { set: { ryw: 1 } },
    ask: 'Turn on read your own writes: for {pin} after you write, your reads go to the primary. What does the read at {read} return now?',
    choices,
    truth: 'seen',
    reveal:
      '{seen}, from the primary, which has every write. When the pin ends at {pin} your reads go back to the replica, which applied the write at {lag}, so they stay fresh. Other users still read the replica, and see the old value until {lag}.',
    focus: ['band', 'read'],
    slots: () => {
      const o = outcome(800, 300, 1);
      return { ...answers, pin: dur(1_000), read: ms(300), lag: ms(800), seen: seen(o.stale) };
    },
  },
  {
    id: 'lag-outlasts-pin',
    title: 'Lag outlasts the pin',
    setup: { lag: 2_000, read: 1_200, ryw: 1, pin: 1_000 },
    ask: 'The pin lasts {pin}, and the replica lags {lag}. What does your read at {read} return?',
    choices,
    truth: 'seen',
    reveal:
      "{seen}: the pin ended at {pin}, but the replica applies the write only at {lag}, so every read of yours in between is stale, a {window} window. A pin works only while it outlasts the worst lag; reading from a replica that has reached your write's position in the log works at any lag.",
    focus: ['window', 'read'],
    slots: () => {
      const o = outcome(2_000, 1_200, 1);
      return { ...answers, pin: dur(1_000), lag: dur(2_000), read: dur(1_200), seen: seen(o.stale), window: dur(o.staleMs) };
    },
  },
  {
    id: 'no-stale-goal',
    title: 'Challenge: never stale for you',
    setup: { lag: 2_000, read: 1_200, ryw: 1, pin: 1_000 },
    ask: 'The replica lags {lag}. Drag the end of the pin until none of your reads can be stale.',
    goal: { metric: 'staleMs', below: 1, keep: { lag: 2_000, ryw: 1 } },
    reveal:
      "The shortest pin that covers the lag is {pin}: until the replica has your write, your reads go to the primary. The cost is load: for as long as the pin lasts after every write, all of that user's reads land on the primary instead of a replica.",
    focus: ['band'],
    slots: () => ({ lag: dur(2_000), pin: dur(REPLICA_PIN_SNAPS.find((pin) => outcome(2_000, 0, 1, pin).staleMs === 0)!) }),
  },
];
