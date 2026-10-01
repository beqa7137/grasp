import type { WidgetCheckpoint } from './checkpoint.js';

/**
 * What happens to one attempt of a request to post a capture: the response comes back, the ledger posts the entry but the
 * response is lost on the way back, or the request never reaches the ledger. Lost and dropped look the same to the client: a timeout.
 */
export type AttemptFate = 'ok' | 'lost' | 'dropped';

/** No key, a fresh key on every attempt (a common bug), or one key made once per payment and resent on every retry. */
export type KeyMode = 'none' | 'per-attempt' | 'per-payment';

export const MAX_ATTEMPTS = 4;

export interface RetryStep {
  attempt: number;
  /** Whether this attempt posted an entry. */
  posted: boolean;
  text: string;
}

export interface RetryRun {
  steps: RetryStep[];
  entries: number;
  /** Whether the client saw a response before running out of attempts. */
  confirmed: boolean;
}

/** The caller sends attempts in order until one gets a response or `fates` runs out; the ledger posts unless it knows the key. */
export function retryRun(fates: readonly AttemptFate[], mode: KeyMode): RetryRun {
  if (!fates.length || fates.length > MAX_ATTEMPTS) throw new Error(`Between 1 and ${MAX_ATTEMPTS} attempts`);
  const steps: RetryStep[] = [];
  let entries = 0;
  let confirmed = false;
  for (const [i, fate] of fates.entries()) {
    const attempt = i + 1;
    const key =
      mode === 'none' ? 'with no key' : mode === 'per-attempt' ? 'with a new key' : attempt === 1 ? 'with its key' : 'with the same key';
    if (fate === 'dropped') {
      steps.push({ attempt, posted: false, text: `Attempt ${attempt} (${key}) never reaches the ledger. The caller times out.` });
      continue;
    }
    const replay = mode === 'per-payment' && entries > 0;
    if (!replay) entries++;
    const work = replay
      ? 'the ledger finds the key already done and returns the stored entry, posting nothing'
      : `the ledger posts the capture entry (entry ${entries})`;
    const back = fate === 'ok' ? 'The caller gets the response.' : 'The response is lost and the caller times out.';
    steps.push({ attempt, posted: !replay, text: `Attempt ${attempt} (${key}): ${work}. ${back}` });
    if (fate === 'ok') {
      confirmed = true;
      break;
    }
  }
  return { steps, entries, confirmed };
}

/**
 * Expected effects per request (entries posted, or cards charged) when every attempt independently loses its response with probability `lost`, never arrives
 * with probability `dropped`, and the client retries up to `retries` times. Without a key every arriving attempt applies
 * its effect; with one key per payment only the first arriving attempt does.
 */
export function expectedEffects(lost: number, dropped: number, retries: number, mode: KeyMode): number {
  if (mode === 'per-payment') return 1 - dropped ** (retries + 1);
  const unanswered = lost + dropped;
  let sum = 0;
  for (let k = 0; k <= retries; k++) sum += unanswered ** k;
  return (1 - dropped) * sum;
}

const times = (n: number) => (n === 0 ? 'Nothing posted' : n === 1 ? 'Posted once' : n === 2 ? 'Posted twice' : `Posted ${n} times`);

/** Asks how many entries the ledger posts, from a menu that grows with the attempts so the answer is never the only fit. */
export function retryCheckpoint(fates: readonly AttemptFate[], mode: KeyMode): WidgetCheckpoint {
  const run = retryRun(fates, mode);
  const options = Math.max(3, run.steps.length + 1);
  const choices = Array.from({ length: options }, (_, n) => times(n));
  const sent = run.steps.length;
  const arrived = run.steps.filter((s) => fates[s.attempt - 1] !== 'dropped').length;
  const later = arrived - 1;
  const why = !arrived
    ? 'No attempt reached the ledger, so nothing was posted, and the caller cannot tell that from a lost response.'
    : mode === 'per-payment'
      ? later
        ? `Every attempt carries the same key, so only the first of the ${arrived} that reached the ledger posted; the later ${later === 1 ? 'one gets' : `${later} get`} the stored entry.`
        : 'Only one attempt reached the ledger, and it posted the entry.'
      : `${mode === 'none' ? 'Without a key' : 'With a new key on every attempt'} the ledger cannot tell a retry from a new capture, so ${arrived === 1 ? 'the one attempt' : `each of the ${arrived} attempts`} that reached it posted an entry.`;
  const end = run.confirmed
    ? `The caller sent ${sent} attempt${sent === 1 ? '' : 's'} and got a response on the last.`
    : `The caller gave up after ${sent} attempt${sent === 1 ? '' : 's'} without a response, so it cannot know whether the entry posted: it should look the entry up by its key, not treat the capture as failed.`;
  return {
    prompt: 'Predict: how many capture entries does the ledger post?',
    choices,
    answer: run.entries,
    explain: `${why} ${end}`,
  };
}
